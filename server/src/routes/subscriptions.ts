/**
 * /api/subscriptions
 * BUG FIX: auth now uses hostToken-only fallback so streams created without
 * userId (or where userId is null in DB) still work correctly.
 */
import { Router, Request, Response, raw } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import {
  getAllPlans, getUserSubscription, createStripeSubscription,
  createRazorpaySubscription, changeSubscriptionPlan,
  cancelSubscription, getBillingHistory, canUseFeature,
  handleStripeSubscriptionWebhook,
} from '../services/subscription.service';

const router = Router();

// ── Auth helper: accepts hostToken alone OR (userId + hostToken) ──────────────
// This is necessary because older streams were created without userId.
// hostToken is a 32-char nanoid — cryptographically secure enough as sole auth.
async function resolveUser(
  userId: string | undefined,
  hostToken: string | undefined,
): Promise<{ userId: string; streamId: string } | null> {
  if (!hostToken) return null;

  // First try the precise match (userId + hostToken)
  if (userId) {
    const stream = await prisma.stream.findFirst({
      where:  { userId, hostToken },
      select: { id: true, userId: true },
    });
    if (stream?.userId) return { userId: stream.userId, streamId: stream.id };
  }

  // Fallback: match on hostToken alone (covers streams created before userId was stored)
  const stream = await prisma.stream.findFirst({
    where:  { hostToken },
    select: { id: true, userId: true },
  });
  if (!stream) return null;

  // If stream has no userId but caller provided one, backfill it now
  if (!stream.userId && userId) {
    await prisma.stream.update({ where: { id: stream.id }, data: { userId } }).catch(() => {});
    return { userId, streamId: stream.id };
  }

  // Use whatever userId the stream has (may be the email-as-id fallback)
  const effectiveUserId = stream.userId ?? userId ?? '';
  if (!effectiveUserId) return null;
  return { userId: effectiveUserId, streamId: stream.id };
}

// ── GET /api/subscriptions/plans ──────────────────────────────────────────────
router.get('/plans', async (_req, res) => {
  try {
    const plans = await getAllPlans();
    res.json(Array.isArray(plans) ? plans : []);
  } catch (err) {
    console.error('[plans]', err);
    res.status(500).json({ error: 'Failed to load plans' });
  }
});

// ── GET /api/subscriptions/me  (also /current for InlineBilling) ──────────────
async function handleGetMe(req: Request, res: Response) {
  try {
    const { userId, hostToken } = req.query as { userId: string; hostToken: string };
    const auth = await resolveUser(userId, hostToken);
    if (!auth) return res.status(403).json({ error: 'Unauthorized' });
    const status = await getUserSubscription(auth.userId);
    res.json(status);
  } catch (err) {
    console.error('[subscriptions/me]', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
}
router.get('/me',      handleGetMe);
router.get('/current', handleGetMe); // ← alias used by InlineBilling

// ── GET /api/subscriptions/billing  (also /invoices for InlineBilling) ────────
async function handleGetBilling(req: Request, res: Response) {
  try {
    const { userId, hostToken } = req.query as { userId: string; hostToken: string };
    const auth = await resolveUser(userId, hostToken);
    if (!auth) return res.status(403).json({ error: 'Unauthorized' });
    const history = await getBillingHistory(auth.userId);
    res.json(Array.isArray(history) ? history : []);
  } catch (err) {
    console.error('[subscriptions/billing]', err);
    res.status(500).json({ error: 'Failed to get billing history' });
  }
}
router.get('/billing',  handleGetBilling);
router.get('/invoices', handleGetBilling); // ← alias used by InlineBilling

// ── POST /api/subscriptions/subscribe ────────────────────────────────────────
const SubscribeSchema = z.object({
  userId:       z.string().optional(),
  hostToken:    z.string(),
  planId:       z.string(),
  billingCycle: z.enum(['monthly', 'yearly']),
  gateway:      z.enum(['stripe', 'razorpay']),
  currency:     z.string().length(3).default('INR'),
});

router.post('/subscribe', async (req, res) => {
  try {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { userId, hostToken, planId, billingCycle, gateway, currency } = parsed.data;
    const auth = await resolveUser(userId, hostToken);
    if (!auth) return res.status(403).json({ error: 'Unauthorized — invalid host token' });

    let result;
    if (gateway === 'stripe') {
      result = await createStripeSubscription(auth.userId, planId, billingCycle, currency);
    } else {
      result = await createRazorpaySubscription(auth.userId, planId, billingCycle);
    }
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create subscription';
    console.error('[subscriptions/subscribe]', err);
    res.status(400).json({ error: msg });
  }
});

// ── POST /api/subscriptions/change-plan ──────────────────────────────────────
const ChangePlanSchema = z.object({
  userId:       z.string().optional(),
  hostToken:    z.string(),
  newPlanId:    z.string(),
  billingCycle: z.enum(['monthly', 'yearly']),
  gateway:      z.enum(['stripe', 'razorpay']).default('stripe'),
});

router.post('/change-plan', async (req, res) => {
  try {
    const parsed = ChangePlanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { userId, hostToken, newPlanId, billingCycle, gateway } = parsed.data;
    const auth = await resolveUser(userId, hostToken);
    if (!auth) return res.status(403).json({ error: 'Unauthorized' });
    const result = await changeSubscriptionPlan(auth.userId, newPlanId, billingCycle, gateway);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to change plan';
    console.error('[subscriptions/change-plan]', err);
    res.status(400).json({ error: msg });
  }
});

// ── POST /api/subscriptions/cancel ───────────────────────────────────────────
router.post('/cancel', async (req, res) => {
  try {
    const { userId, hostToken, immediately = false } = req.body;
    const auth = await resolveUser(userId, hostToken);
    if (!auth) return res.status(403).json({ error: 'Unauthorized' });
    const result = await cancelSubscription(auth.userId, immediately);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel';
    console.error('[subscriptions/cancel]', err);
    res.status(400).json({ error: msg });
  }
});

// ── GET /api/subscriptions/can-use/:feature ──────────────────────────────────
router.get('/can-use/:feature', async (req, res) => {
  try {
    const { userId, hostToken } = req.query as { userId: string; hostToken: string };
    const auth = await resolveUser(userId, hostToken);
    if (!auth) return res.status(403).json({ error: 'Unauthorized' });
    const result = await canUseFeature(auth.userId, req.params.feature as never);
    res.json(result);
  } catch (err) {
    console.error('[subscriptions/can-use]', err);
    res.status(500).json({ error: 'Failed to check feature' });
  }
});

// ── POST /api/subscriptions/webhook/stripe ───────────────────────────────────
router.post(
  '/webhook/stripe',
  raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const sig    = req.headers['stripe-signature'] as string;
      const secret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
      const event  = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
      await handleStripeSubscriptionWebhook(event as unknown as { type: string; data: { object: Record<string, unknown> } });
      res.json({ received: true });
    } catch (err) {
      console.error('[subscriptions/webhook/stripe]', err);
      res.status(400).json({ error: 'Webhook error' });
    }
  }
);

// ── POST /api/subscriptions/webhook/razorpay ─────────────────────────────────
router.post('/webhook/razorpay', async (req, res) => {
  try {
    const { event, payload } = req.body;
    if (event === 'subscription.activated' || event === 'subscription.charged') {
      const subId = payload?.subscription?.entity?.id as string;
      if (subId) {
        const sub = await prisma.subscription.findUnique({ where: { gatewaySubscriptionId: subId } });
        if (sub) await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'active' } });
      }
    }
    if (event === 'subscription.cancelled') {
      const subId = payload?.subscription?.entity?.id as string;
      const sub   = await prisma.subscription.findUnique({ where: { gatewaySubscriptionId: subId } });
      if (sub) await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'canceled', canceledAt: new Date() } });
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[subscriptions/webhook/razorpay]', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

export default router;
