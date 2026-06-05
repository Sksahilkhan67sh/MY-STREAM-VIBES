/**
 * SubscriptionService
 * Handles plan management, billing via Stripe & Razorpay,
 * usage enforcement, upgrade/downgrade, and invoice generation.
 */

import prisma from '../lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanFeatures {
  maxStreamsPerMonth:   number;
  maxViewersPerStream: number;
  maxStreamDuration:   number;
  maxStorageGB:        number;
  maxCoHosts:          number;
  canRecord:           boolean;
  canGoRTMP:           boolean;
  canRunPolls:         boolean;
  canAccessAnalytics:  boolean;
  canAcceptDonations:  boolean;
  canCustomBranding:   boolean;
  canScheduleStreams:  boolean;
  hasAIFeatures:       boolean;
  hasPrioritySupport:  boolean;
  hasWhiteLabel:       boolean;
}

export interface SubscriptionStatus {
  planName:        string;
  displayName:     string;
  status:          string;
  billingCycle:    string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  features:        PlanFeatures;
  usage:           {
    streamsUsed:    number;
    storageUsedGB:  number;
    streamMinutes:  number;
  };
  isActive:        boolean;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function getAllPlans() {
  return prisma.plan.findMany({
    where:   { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function getPlanByName(name: string) {
  return prisma.plan.findUnique({ where: { name } });
}

// ─── User subscription status ─────────────────────────────────────────────────

export async function getUserSubscription(userId: string): Promise<SubscriptionStatus> {
  // Get active subscription (or most recent)
  const sub = await prisma.subscription.findFirst({
    where:   { userId, status: { in: ['active', 'trialing', 'past_due'] } },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });

  // Get current month usage
  const month   = new Date().toISOString().slice(0, 7);
  const usage   = await prisma.usageRecord.findUnique({
    where: { userId_month: { userId, month } },
  });

  const plan    = sub?.plan ?? await prisma.plan.findUnique({ where: { name: 'free' } });
  const isActive = sub?.status === 'active' || sub?.status === 'trialing';

  return {
    planName:          plan?.name       ?? 'free',
    displayName:       plan?.displayName ?? 'Free',
    status:            sub?.status      ?? 'free',
    billingCycle:      sub?.billingCycle ?? 'monthly',
    currentPeriodEnd:  sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    features: {
      maxStreamsPerMonth:   plan?.maxStreamsPerMonth   ?? 3,
      maxViewersPerStream: plan?.maxViewersPerStream  ?? 25,
      maxStreamDuration:   plan?.maxStreamDuration    ?? 60,
      maxStorageGB:        plan?.maxStorageGB         ?? 1,
      maxCoHosts:          plan?.maxCoHosts           ?? 0,
      canRecord:           plan?.canRecord            ?? false,
      canGoRTMP:           plan?.canGoRTMP            ?? false,
      canRunPolls:         plan?.canRunPolls          ?? true,
      canAccessAnalytics:  plan?.canAccessAnalytics   ?? false,
      canAcceptDonations:  plan?.canAcceptDonations   ?? false,
      canCustomBranding:   plan?.canCustomBranding    ?? false,
      canScheduleStreams:  plan?.canScheduleStreams    ?? true,
      hasAIFeatures:       plan?.hasAIFeatures        ?? false,
      hasPrioritySupport:  plan?.hasPrioritySupport   ?? false,
      hasWhiteLabel:       plan?.hasWhiteLabel        ?? false,
    },
    usage: {
      streamsUsed:   usage?.streamsUsed   ?? 0,
      storageUsedGB: usage?.storageUsedGB ?? 0,
      streamMinutes: usage?.streamMinutes ?? 0,
    },
    isActive,
  };
}

// ─── Feature gate enforcement ─────────────────────────────────────────────────

export async function canCreateStream(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getUserSubscription(userId);
  const { features, usage } = status;

  if (features.maxStreamsPerMonth !== -1 && usage.streamsUsed >= features.maxStreamsPerMonth) {
    return {
      allowed: false,
      reason:  `You've used all ${features.maxStreamsPerMonth} streams in your ${status.displayName} plan this month. Upgrade to stream more.`,
    };
  }
  return { allowed: true };
}

export async function canUseFeature(
  userId: string,
  feature: keyof PlanFeatures
): Promise<{ allowed: boolean; reason?: string; requiredPlan?: string }> {
  const status = await getUserSubscription(userId);
  const allowed = status.features[feature];

  if (!allowed) {
    const plans = await getAllPlans();
    const requiredPlan = plans.find(p => (p as unknown as Record<string, unknown>)[feature] === true);
    return {
      allowed: false,
      reason: `${feature.replace(/([A-Z])/g, ' $1').trim()} requires ${requiredPlan?.displayName ?? 'a higher'} plan.`,
      requiredPlan: requiredPlan?.name,
    };
  }
  return { allowed: true };
}

// ─── Usage tracking ───────────────────────────────────────────────────────────

export async function incrementStreamUsage(userId: string, durationMinutes = 0) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageRecord.upsert({
    where:  { userId_month: { userId, month } },
    create: { userId, month, streamsUsed: 1, streamMinutes: durationMinutes },
    update: { streamsUsed: { increment: 1 }, streamMinutes: { increment: durationMinutes } },
  });
}

export async function incrementStorageUsage(userId: string, additionalGB: number) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.usageRecord.upsert({
    where:  { userId_month: { userId, month } },
    create: { userId, month, storageUsedGB: additionalGB },
    update: { storageUsedGB: { increment: additionalGB } },
  });
}

// ─── Stripe Subscription Creation ────────────────────────────────────────────

export async function createStripeSubscription(
  userId: string,
  planId: string,
  billingCycle: 'monthly' | 'yearly',
  currency: string = 'usd'
) {
  const Stripe    = (await import('stripe')).default;
  const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

  const plan      = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('Plan not found');

  const user      = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const priceId   = billingCycle === 'yearly'
    ? plan.stripeYearlyPriceId
    : plan.stripeMonthlyPriceId;
  if (!priceId) throw new Error('Stripe price not configured for this plan');

  // Get or create Stripe customer
  let customerId: string | undefined;
  const existingSub = await prisma.subscription.findFirst({
    where:  { userId, gateway: 'stripe' },
    select: { gatewayCustomerId: true },
  });
  if (existingSub?.gatewayCustomerId) {
    customerId = existingSub.gatewayCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email:    user.email,
      name:     user.name ?? undefined,
      metadata: { userId },
    });
    customerId = customer.id;
  }

  // Create Stripe subscription with trial period (7 days for paid plans)
  const subscription = await stripe.subscriptions.create({
    customer:          customerId,
    items:             [{ price: priceId }],
    trial_period_days: 7,
    metadata:          { userId, planId },
    payment_behavior:  'default_incomplete',
    expand:            ['latest_invoice.payment_intent'],
  });

  const invoice     = subscription.latest_invoice as Record<string, unknown>;
  const intent      = invoice?.payment_intent as Record<string, unknown>;

  // Persist subscription record
  const now         = new Date();
  const periodEnd   = new Date(subscription.current_period_end * 1000);

  await prisma.subscription.upsert({
    where:  { gatewaySubscriptionId: subscription.id },
    create: {
      userId,
      planId,
      status:                'trialing',
      billingCycle,
      currency,
      currentPeriodStart:    now,
      currentPeriodEnd:      periodEnd,
      gateway:               'stripe',
      gatewaySubscriptionId: subscription.id,
      gatewayCustomerId:     customerId,
      trialEndsAt:           new Date(subscription.trial_end! * 1000),
    },
    update: {
      planId,
      status:             'trialing',
      currentPeriodEnd:   periodEnd,
    },
  });

  return {
    subscriptionId: subscription.id,
    clientSecret:   intent?.client_secret as string | null,
    status:         subscription.status,
  };
}

// ─── Razorpay Subscription Creation ──────────────────────────────────────────

export async function createRazorpaySubscription(
  userId:       string,
  planId:       string,
  billingCycle: 'monthly' | 'yearly'
) {
  const Razorpay = (await import('razorpay')).default;
  const rp       = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  const plan  = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan)  throw new Error('Plan not found');

  const rpPlanId = billingCycle === 'yearly'
    ? plan.razorpayYearlyPlanId
    : plan.razorpayMonthlyPlanId;
  if (!rpPlanId) throw new Error('Razorpay plan not configured');

  const sub = await rp.subscriptions.create({
    plan_id:       rpPlanId,
    total_count:   billingCycle === 'yearly' ? 12 : 120,
    quantity:      1,
    notes:         { userId, planId },
  });

  const now       = new Date();
  const periodEnd = new Date(now.getTime() + (billingCycle === 'yearly' ? 365 : 30) * 86400000);

  await prisma.subscription.upsert({
    where:  { gatewaySubscriptionId: sub.id },
    create: {
      userId,
      planId,
      status:                'created',
      billingCycle,
      currency:              'INR',
      currentPeriodStart:    now,
      currentPeriodEnd:      periodEnd,
      gateway:               'razorpay',
      gatewaySubscriptionId: sub.id,
    },
    update: { planId, status: 'created' },
  });

  return {
    subscriptionId:  sub.id,
    razorpayKeyId:   process.env.RAZORPAY_KEY_ID,
    status:          sub.status,
  };
}

// ─── Upgrade / Downgrade ──────────────────────────────────────────────────────

export async function changeSubscriptionPlan(
  userId:          string,
  newPlanId:       string,
  billingCycle:    'monthly' | 'yearly',
  gateway:         'stripe' | 'razorpay' = 'stripe'
) {
  const existing = await prisma.subscription.findFirst({
    where:   { userId, status: { in: ['active', 'trialing'] } },
    include: { plan: true },
  });

  if (!existing) {
    // No existing sub — create new
    if (gateway === 'stripe')    return createStripeSubscription(userId, newPlanId, billingCycle);
    if (gateway === 'razorpay')  return createRazorpaySubscription(userId, newPlanId, billingCycle);
  }

  if (existing.gateway === 'stripe' && existing.gatewaySubscriptionId) {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
    const newPlan = await prisma.plan.findUnique({ where: { id: newPlanId } });
    const priceId = billingCycle === 'yearly'
      ? newPlan?.stripeYearlyPriceId
      : newPlan?.stripeMonthlyPriceId;

    if (!priceId) throw new Error('Stripe price not set for new plan');

    const stripeSub = await stripe.subscriptions.retrieve(existing.gatewaySubscriptionId);
    await stripe.subscriptions.update(existing.gatewaySubscriptionId, {
      items:            [{ id: stripeSub.items.data[0].id, price: priceId }],
      proration_behavior: 'create_prorations',
    });

    await prisma.subscription.update({
      where: { id: existing.id },
      data:  { planId: newPlanId, billingCycle },
    });

    return { ok: true, message: 'Plan updated immediately with proration.' };
  }

  throw new Error('Cannot upgrade Razorpay subscription directly — cancel and resubscribe.');
}

// ─── Cancel Subscription ──────────────────────────────────────────────────────

export async function cancelSubscription(userId: string, immediately = false) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['active', 'trialing'] } },
  });
  if (!sub) throw new Error('No active subscription found');

  if (sub.gateway === 'stripe' && sub.gatewaySubscriptionId) {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

    if (immediately) {
      await stripe.subscriptions.cancel(sub.gatewaySubscriptionId);
      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { status: 'canceled', canceledAt: new Date() },
      });
    } else {
      await stripe.subscriptions.update(sub.gatewaySubscriptionId, {
        cancel_at_period_end: true,
      });
      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { cancelAtPeriodEnd: true },
      });
    }
  }

  if (sub.gateway === 'razorpay' && sub.gatewaySubscriptionId) {
    const Razorpay = (await import('razorpay')).default;
    const rp       = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
    await rp.subscriptions.cancel(sub.gatewaySubscriptionId, immediately);
    await prisma.subscription.update({
      where: { id: sub.id },
      data:  { status: immediately ? 'canceled' : 'active', cancelAtPeriodEnd: !immediately, canceledAt: immediately ? new Date() : null },
    });
  }

  return { ok: true };
}

// ─── Stripe Webhook handler ───────────────────────────────────────────────────

export async function handleStripeSubscriptionWebhook(event: { type: string; data: { object: Record<string, unknown> } }) {
  const obj = event.data.object;

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subId = obj.id as string;
      const sub   = await prisma.subscription.findUnique({ where: { gatewaySubscriptionId: subId } });
      if (!sub) return;

      await prisma.subscription.update({
        where: { id: sub.id },
        data:  {
          status:              obj.status as string,
          currentPeriodEnd:    new Date((obj.current_period_end as number) * 1000),
          cancelAtPeriodEnd:   obj.cancel_at_period_end as boolean,
          canceledAt:          obj.canceled_at ? new Date((obj.canceled_at as number) * 1000) : null,
        },
      });
      break;
    }
    case 'invoice.payment_succeeded': {
      const gatewayInvoiceId = obj.id as string;
      const subId            = obj.subscription as string;
      const sub              = await prisma.subscription.findUnique({
        where:   { gatewaySubscriptionId: subId },
        select:  { id: true, userId: true, planId: true },
      });
      if (!sub) return;

      await prisma.invoice.upsert({
        where:  { gatewayInvoiceId },
        create: {
          subscriptionId:    sub.id,
          userId:            sub.userId,
          amount:            obj.amount_paid as number,
          currency:          (obj.currency as string).toUpperCase(),
          status:            'paid',
          billingPeriodStart: new Date((obj.period_start as number) * 1000),
          billingPeriodEnd:   new Date((obj.period_end   as number) * 1000),
          gateway:           'stripe',
          gatewayInvoiceId,
          gatewayPaymentId:  obj.payment_intent as string,
          pdfUrl:            obj.invoice_pdf as string,
          paidAt:            new Date(),
        },
        update: { status: 'paid', paidAt: new Date() },
      });

      // Activate subscription after successful payment
      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { status: 'active' },
      });
      break;
    }
    case 'invoice.payment_failed': {
      const subId = obj.subscription as string;
      const sub   = await prisma.subscription.findUnique({ where: { gatewaySubscriptionId: subId } });
      if (sub) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { status: 'past_due' },
        });
      }
      break;
    }
  }
}

// ─── Billing history ──────────────────────────────────────────────────────────

export async function getBillingHistory(userId: string) {
  const invoices = await prisma.invoice.findMany({
    where:   { userId },
    include: { subscription: { include: { plan: true } } },
    orderBy: { createdAt: 'desc' },
    take:    50,
  });

  return invoices.map(inv => ({
    id:          inv.id,
    amount:      inv.amount / 100,
    currency:    inv.currency,
    status:      inv.status,
    planName:    inv.subscription.plan.displayName,
    billingCycle: inv.subscription.billingCycle,
    periodStart: inv.billingPeriodStart,
    periodEnd:   inv.billingPeriodEnd,
    paidAt:      inv.paidAt,
    pdfUrl:      inv.pdfUrl,
    gateway:     inv.gateway,
  }));
}
