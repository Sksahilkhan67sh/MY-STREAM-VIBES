/**
 * /api/ppv
 * Pay-per-view endpoints: tier management, ticket purchase,
 * payment verification, access validation, refunds, history.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createTicketTier,
  getTicketTiers,
  updateTicketTier,
  upsertPPVConfig,
  getPPVConfig,
  initiatePurchase,
  completePurchase,
  validateTicketAccess,
  refundTicket,
  getPurchaseHistory,
  getStreamTicketStats,
} from '../services/ppv.service';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateTierSchema = z.object({
  hostToken:   z.string(),
  name:        z.string().min(1).max(64),
  description: z.string().max(200).optional(),
  price:       z.number().int().min(100),
  currency:    z.string().length(3).default('INR'),
  maxQuantity: z.number().int().positive().optional(),
  validUntil:  z.string().datetime().optional(),
});

const PurchaseSchema = z.object({
  tierId:      z.string(),
  buyerName:   z.string().min(1).max(64),
  buyerEmail:  z.string().email(),
  buyerUserId: z.string().optional(),
  gateway:     z.enum(['razorpay', 'stripe', 'upi']),
});

const VerifySchema = z.object({
  ticketId:         z.string(),
  gatewayOrderId:   z.string(),
  gatewayPaymentId: z.string(),
  gatewaySignature: z.string().optional(),
  gateway:          z.enum(['razorpay', 'stripe', 'upi']),
});

const ConfigSchema = z.object({
  hostToken:           z.string(),
  allowRefunds:        z.boolean().optional(),
  refundWindowHours:   z.number().int().optional(),
  maxTicketsPerBuyer:  z.number().int().optional(),
  thankYouMessage:     z.string().max(200).optional(),
  reminderEnabled:     z.boolean().optional(),
});

// ─── GET /api/ppv/:roomId/tiers ───────────────────────────────────────────────
// Public — viewer fetches tiers before buying

router.get('/:roomId/tiers', async (req: Request, res: Response) => {
  try {
    const tiers = await getTicketTiers(req.params.roomId);
    res.json(tiers);
  } catch (err) {
    console.error('[ppv/tiers GET]', err);
    res.status(500).json({ error: 'Failed to get tiers' });
  }
});

// ─── POST /api/ppv/:roomId/tiers ─────────────────────────────────────────────
// Host — create a new ticket tier

router.post('/:roomId/tiers', async (req: Request, res: Response) => {
  try {
    const parsed = CreateTierSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { hostToken, name, price, currency, description, maxQuantity, validUntil } = parsed.data;
    const tier = await createTicketTier({
      roomId:      req.params.roomId,
      hostToken,
      name,
      price,
      currency,
      description,
      maxQuantity,
      validUntil,
    });
    res.status(201).json(tier);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create tier';
    console.error('[ppv/tiers POST]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── PATCH /api/ppv/tiers/:tierId ────────────────────────────────────────────
// Host — update or deactivate a tier

router.patch('/tiers/:tierId', async (req: Request, res: Response) => {
  try {
    const { hostToken, ...data } = req.body;
    if (!hostToken) return res.status(401).json({ error: 'hostToken required' });
    const updated = await updateTicketTier(req.params.tierId, hostToken, data);
    res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update tier';
    res.status(400).json({ error: msg });
  }
});

// ─── GET /api/ppv/:roomId/config ─────────────────────────────────────────────

router.get('/:roomId/config', async (req: Request, res: Response) => {
  try {
    const config = await getPPVConfig(req.params.roomId);
    res.json(config ?? {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// ─── PUT /api/ppv/:roomId/config ─────────────────────────────────────────────

router.put('/:roomId/config', async (req: Request, res: Response) => {
  try {
    const parsed = ConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { hostToken, ...data } = parsed.data;
    const config = await upsertPPVConfig(req.params.roomId, hostToken, data);
    res.json(config);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save config';
    res.status(400).json({ error: msg });
  }
});

// ─── POST /api/ppv/:roomId/purchase ──────────────────────────────────────────
// Viewer — initiate ticket purchase

router.post('/:roomId/purchase', async (req: Request, res: Response) => {
  try {
    const parsed = PurchaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { tierId, buyerName, buyerEmail, buyerUserId, gateway } = parsed.data;
    const result = await initiatePurchase({
      roomId: req.params.roomId,
      tierId,
      buyerName,
      buyerEmail,
      buyerUserId,
      gateway,
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to initiate purchase';
    console.error('[ppv/purchase]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── POST /api/ppv/verify ────────────────────────────────────────────────────
// Viewer — complete purchase after payment

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { ticketId, gatewayOrderId, gatewayPaymentId, gatewaySignature, gateway } = parsed.data;
    const result = await completePurchase({
      ticketId,
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
      gateway,
    });
    if (!result) return res.status(400).json({ error: 'Payment verification failed' });

    res.json(result);
  } catch (err) {
    console.error('[ppv/verify]', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// ─── POST /api/ppv/:roomId/validate ──────────────────────────────────────────
// Called when viewer tries to join stream — validates their access token

router.post('/:roomId/validate', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ valid: false, reason: 'No access token provided' });

    const result = await validateTicketAccess(req.params.roomId, accessToken);
    res.json(result);
  } catch (err) {
    console.error('[ppv/validate]', err);
    res.status(500).json({ valid: false, reason: 'Validation error' });
  }
});

// ─── POST /api/ppv/tickets/:ticketId/refund ───────────────────────────────────

router.post('/tickets/:ticketId/refund', async (req: Request, res: Response) => {
  try {
    const { hostToken, reason } = req.body;
    if (!hostToken) return res.status(401).json({ error: 'hostToken required' });

    const result = await refundTicket(req.params.ticketId, hostToken, reason);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to refund';
    console.error('[ppv/refund]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── GET /api/ppv/:roomId/stats ───────────────────────────────────────────────
// Host — full ticket revenue + buyer list

router.get('/:roomId/stats', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    if (!hostToken) return res.status(401).json({ error: 'hostToken required' });

    const stats = await getStreamTicketStats(req.params.roomId, hostToken);
    res.json(stats);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to get stats';
    console.error('[ppv/stats]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── GET /api/ppv/history ─────────────────────────────────────────────────────
// Viewer — their purchase history

router.get('/history', async (req: Request, res: Response) => {
  try {
    const { email } = req.query as { email: string };
    if (!email) return res.status(400).json({ error: 'email required' });

    const tickets = await getPurchaseHistory(email);
    res.json(tickets);
  } catch (err) {
    console.error('[ppv/history]', err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

export default router;
