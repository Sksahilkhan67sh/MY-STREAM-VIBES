/**
 * /api/donations
 * Donation endpoints: config management, order creation, payment verification,
 * Stripe webhooks, and creator dashboard reads.
 */

import { Router, Request, Response, raw } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import {
  createDonation,
  completeDonation,
  getDonationStats,
  getStreamDonations,
  upsertDonationConfig,
  getDonationConfig,
  getPublicDonationConfig,
  handleStripeWebhook,
} from '../services/donation.service';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateOrderSchema = z.object({
  donorName:   z.string().min(1).max(64).default('Anonymous'),
  donorEmail:  z.string().email().optional(),
  message:     z.string().max(200).optional(),
  amount:      z.number().int().min(100),    // min ₹1 or $1 (in paise/cents)
  currency:    z.string().length(3).default('INR'),
  gateway:     z.enum(['razorpay', 'stripe', 'upi']),
  isAnonymous: z.boolean().default(false),
});

const VerifySchema = z.object({
  donationId:       z.string(),
  gatewayOrderId:   z.string(),
  gatewayPaymentId: z.string(),
  gatewaySignature: z.string().optional(),
  gateway:          z.enum(['razorpay', 'stripe', 'upi']),
});

const ConfigSchema = z.object({
  razorpayKeyId:       z.string().optional(),
  razorpayKeySecret:   z.string().optional(),
  stripePublishableKey: z.string().optional(),
  stripeSecretKey:     z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  upiId:               z.string().optional(),
  upiName:             z.string().optional(),
  minimumAmount:       z.number().int().min(100).optional(),
  currency:            z.string().length(3).optional(),
  alertDuration:       z.number().int().min(3).max(30).optional(),
  alertSound:          z.boolean().optional(),
  thankYouMessage:     z.string().max(200).optional(),
});

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function verifyHostToken(roomId: string, hostToken: string) {
  const stream = await prisma.stream.findUnique({
    where:  { roomId },
    select: { hostToken: true, userId: true },
  });
  if (!stream || stream.hostToken !== hostToken) return null;
  return stream;
}

// ─── GET /api/donations/config/public/:roomId ─────────────────────────────────
// Public — viewer fetches gateway config before donating

router.get('/config/public/:roomId', async (req: Request, res: Response) => {
  try {
    const config = await getPublicDonationConfig(req.params.roomId);
    if (!config) return res.status(404).json({ error: 'Donations not configured' });
    res.json(config);
  } catch (err) {
    console.error('[donations/config/public]', err);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// ─── GET /api/donations/config ────────────────────────────────────────────────
// Creator — get their own masked config

router.get('/config', async (req: Request, res: Response) => {
  try {
    const { userId, hostToken } = req.query as { userId: string; hostToken: string };
    if (!userId || !hostToken) return res.status(401).json({ error: 'Auth required' });

    // Verify hostToken belongs to this user
    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const config = await getDonationConfig(userId);
    res.json(config ?? {});
  } catch (err) {
    console.error('[donations/config GET]', err);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// ─── PUT /api/donations/config ────────────────────────────────────────────────
// Creator — save gateway keys

router.put('/config', async (req: Request, res: Response) => {
  try {
    const { userId, hostToken } = req.body;
    if (!userId || !hostToken) return res.status(401).json({ error: 'Auth required' });

    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const parsed = ConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const config = await upsertDonationConfig(userId, parsed.data);
    res.json({ ok: true, currency: config.currency });
  } catch (err) {
    console.error('[donations/config PUT]', err);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// ─── POST /api/donations/:roomId/order ───────────────────────────────────────
// Viewer creates a donation order / payment intent

router.post('/:roomId/order', async (req: Request, res: Response) => {
  try {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { donation, gatewayData } = await createDonation({
      roomId: req.params.roomId,
      ...parsed.data,
    });

    res.json({ donationId: donation.id, ...gatewayData });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create order';
    console.error('[donations/order]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── POST /api/donations/verify ──────────────────────────────────────────────
// Client verifies Razorpay / UPI payment after user pays

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const success = await completeDonation(parsed.data);
    if (!success) return res.status(400).json({ error: 'Payment verification failed' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[donations/verify]', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// ─── POST /api/donations/webhook/stripe ──────────────────────────────────────
// Stripe webhook — raw body required for signature verification

router.post(
  '/webhook/stripe',
  raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      const sig     = req.headers['stripe-signature'] as string;
      const secret  = process.env.STRIPE_WEBHOOK_SECRET || '';

      if (!sig || !secret) {
        return res.status(400).json({ error: 'Missing webhook config' });
      }

      const { verifyStripeWebhook } = await import('../services/donation.service');
      const event = await verifyStripeWebhook(req.body as Buffer, sig, secret);
      await handleStripeWebhook(event as { type: string; data: { object: Record<string, unknown> } });

      res.json({ received: true });
    } catch (err) {
      console.error('[stripe/webhook]', err);
      res.status(400).json({ error: 'Webhook error' });
    }
  }
);

// ─── GET /api/donations/:roomId/stats ────────────────────────────────────────
// Public — stream donation stats + leaderboard

router.get('/:roomId/stats', async (req: Request, res: Response) => {
  try {
    const data = await getStreamDonations(req.params.roomId);
    if (!data) return res.status(404).json({ error: 'Stream not found' });
    res.json(data);
  } catch (err) {
    console.error('[donations/stats]', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ─── GET /api/donations/creator/:userId/summary ───────────────────────────────
// Creator — full earnings dashboard

router.get('/creator/:userId/summary', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    const stream = await prisma.stream.findFirst({
      where: { userId: req.params.userId, hostToken },
    });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const data = await getDonationStats(req.params.userId);
    res.json(data);
  } catch (err) {
    console.error('[donations/creator/summary]', err);
    res.status(500).json({ error: 'Failed to get creator stats' });
  }
});

export default router;
