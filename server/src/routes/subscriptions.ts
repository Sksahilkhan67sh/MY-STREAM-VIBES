/**
 * /api/subscriptions
 * Plan listing, subscription management, billing history, webhooks.
 */

import { Router, Request, Response, raw } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import {
  getAllPlans,
  getUserSubscription,
  createStripeSubscription,
  createRazorpaySubscription,
  changeSubscriptionPlan,
  cancelSubscription,
  getBillingHistory,
  canUseFeature,
  handleStripeSubscriptionWebhook,
} from '../services/subscription.service';

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveUserFromToken(hostToken: string) {
  const stream = await prisma.stream.findFirst({
    where:  { hostToken },
    select: { userId: true },
  });
  return stream?.userId ?? null;
}

// ─── GET /api/subscriptions/plans ────────────────────────────────────────────

router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = await getAllPlans();
    res.json(plans);
  } catch (err) {
    console.error('[subscriptions/plans]', err);
    res.status(500).json({ error: 'Failed to load plans' });
  }
});

// ─── GET /api/subscriptions/me ────────────────────────────────────────────────

router.get('/me', async (req: Request, res: Response) => {
  try {
    const { userId, hostToken } = req.query as { userId: string; hostToken: string };
    if (!userId || !hostToken) return res.status(401).json({ error: 'Auth required' });

    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const status = await getUserSubscription(userId);
    res.json(status);
  } catch (err) {
    console.error('[subscriptions/me]', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ─── POST /api/subscriptions/subscribe ───────────────────────────────────────

const SubscribeSchema = z.object({
  userId:       z.string(),
  hostToken:    z.string(),
  planId:       z.string(),
  billingCycle: z.enum(['monthly', 'yearly']),
  gateway:      z.enum(['stripe', 'razorpay']),
  currency:     z.string().length(3).default('INR'),
});

router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId, hostToken, planId, billingCycle, gateway, currency } = parsed.data;
    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    let result;
    if (gateway === 'stripe') {
      result = await createStripeSubscription(userId, planId, billingCycle, currency);
    } else {
      result = await createRazorpaySubscription(userId, planId, billingCycle);
    }

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create subscription';
    console.error('[subscriptions/subscribe]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── POST /api/subscriptions/change-plan ─────────────────────────────────────

const ChangePlanSchema = z.object({
  userId:       z.string(),
  hostToken:    z.string(),
  newPlanId:    z.string(),
  billingCycle: z.enum(['monthly', 'yearly']),
  gateway:      z.enum(['stripe', 'razorpay']).default('stripe'),
});

router.post('/change-plan', async (req: Request, res: Response) => {
  try {
    const parsed = ChangePlanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId, hostToken, newPlanId, billingCycle, gateway } = parsed.data;
    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const result = await changeSubscriptionPlan(userId, newPlanId, billingCycle, gateway);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to change plan';
    console.error('[subscriptions/change-plan]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── POST /api/subscriptions/cancel ──────────────────────────────────────────

router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { userId, hostToken, immediately = false } = req.body;
    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const result = await cancelSubscription(userId, immediately);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel';
    console.error('[subscriptions/cancel]', err);
    res.status(400).json({ error: msg });
  }
});

// ─── GET /api/subscriptions/billing ──────────────────────────────────────────

router.get('/billing', async (req: Request, res: Response) => {
  try {
    const { userId, hostToken } = req.query as { userId: string; hostToken: string };
    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const history = await getBillingHistory(userId);
    res.json(history);
  } catch (err) {
    console.error('[subscriptions/billing]', err);
    res.status(500).json({ error: 'Failed to get billing history' });
  }
});

// ─── GET /api/subscriptions/can-use/:feature ─────────────────────────────────

router.get('/can-use/:feature', async (req: Request, res: Response) => {
  try {
    const { userId, hostToken } = req.query as { userId: string; hostToken: string };
    const stream = await prisma.stream.findFirst({ where: { userId, hostToken } });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const result = await canUseFeature(userId, req.params.feature as never);
    res.json(result);
  } catch (err) {
    console.error('[subscriptions/can-use]', err);
    res.status(500).json({ error: 'Failed to check feature' });
  }
});

// ─── POST /api/subscriptions/webhook/stripe ──────────────────────────────────

router.post(
  '/webhook/stripe',
  raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      const sig    = req.headers['stripe-signature'] as string;
      const secret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
      const event  = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);

      await handleStripeSubscriptionWebhook(
        event as { type: string; data: { object: Record<string, unknown> } }
      );
      res.json({ received: true });
    } catch (err) {
      console.error('[subscriptions/webhook/stripe]', err);
      res.status(400).json({ error: 'Webhook error' });
    }
  }
);

// ─── POST /api/subscriptions/webhook/razorpay ────────────────────────────────

router.post('/webhook/razorpay', async (req: Request, res: Response) => {
  try {
    const { event, payload } = req.body;

    if (event === 'subscription.activated' || event === 'subscription.charged') {
      const subId = payload?.subscription?.entity?.id as string;
      if (subId) {
        const sub = await prisma.subscription.findUnique({ where: { gatewaySubscriptionId: subId } });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data:  { status: 'active' },
          });
        }
      }
    }

    if (event === 'subscription.cancelled') {
      const subId = payload?.subscription?.entity?.id as string;
      const sub   = await prisma.subscription.findUnique({ where: { gatewaySubscriptionId: subId } });
      if (sub) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: 'canceled', canceledAt: new Date() },
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[subscriptions/webhook/razorpay]', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

export default router;
