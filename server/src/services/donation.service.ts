/**
 * DonationService
 * Handles all payment gateway integrations (Razorpay, Stripe, UPI),
 * donation persistence, leaderboard management, and real-time alert broadcasting.
 */

import prisma from '../lib/prisma';
import { broadcastToRoom } from '../lib/socket';
import crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateOrderPayload {
  roomId:      string;
  donorName:   string;
  donorEmail?: string;
  message?:    string;
  amount:      number;   // in INR paise or USD cents
  currency:    string;
  gateway:     'razorpay' | 'stripe' | 'upi';
  isAnonymous?: boolean;
}

export interface VerifyPaymentPayload {
  donationId:      string;
  gatewayOrderId:  string;
  gatewayPaymentId: string;
  gatewaySignature?: string;
  gateway:         string;
}

export interface DonationAlertPayload {
  id:            string;
  donorName:     string;
  amount:        number;
  displayAmount: number;
  currency:      string;
  message?:      string;
  isAnonymous:   boolean;
  isHighlighted: boolean;
  gateway:       string;
}

// ─── Razorpay ─────────────────────────────────────────────────────────────────

async function getRazorpayInstance(keyId: string, keySecret: string) {
  const Razorpay = (await import('razorpay')).default;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function createRazorpayOrder(
  config: { razorpayKeyId: string; razorpayKeySecret: string },
  amount: number,
  currency: string,
  donationId: string
) {
  const rp = await getRazorpayInstance(config.razorpayKeyId, config.razorpayKeySecret);
  const order = await rp.orders.create({
    amount,
    currency,
    receipt:  `don_${donationId}`,
    notes:    { donationId },
  });
  return order;
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  const body      = `${orderId}|${paymentId}`;
  const expected  = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

// ─── Stripe ───────────────────────────────────────────────────────────────────

export async function createStripePaymentIntent(
  secretKey: string,
  amount: number,
  currency: string,
  donationId: string
) {
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    metadata: { donationId },
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: intent.client_secret, intentId: intent.id };
}

export async function verifyStripeWebhook(
  rawBody: Buffer,
  signature: string,
  webhookSecret: string
) {
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

// ─── UPI ──────────────────────────────────────────────────────────────────────

export function generateUPILink(upiId: string, name: string, amount: number, donationId: string) {
  const amountRupees = (amount / 100).toFixed(2);
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amountRupees}&tn=${encodeURIComponent(`Donation ${donationId}`)}&cu=INR`;
}

// ─── Create Donation Record ───────────────────────────────────────────────────

export async function createDonation(payload: CreateOrderPayload) {
  const stream = await prisma.stream.findUnique({
    where:   { roomId: payload.roomId },
    include: { user: { include: { donationConfig: true } } },
  });
  if (!stream) throw new Error('Stream not found');

  const config = stream.user?.donationConfig;

  const donation = await prisma.donation.create({
    data: {
      streamId:      stream.id,
      userId:        stream.userId ?? undefined,
      donorName:     payload.isAnonymous ? 'Anonymous' : payload.donorName,
      donorEmail:    payload.donorEmail,
      message:       payload.message,
      amount:        payload.amount,
      currency:      payload.currency,
      gateway:       payload.gateway,
      displayAmount: payload.amount / 100,
      isAnonymous:   payload.isAnonymous ?? false,
      status:        'pending',
    },
  });

  // Generate gateway order
  let gatewayData: Record<string, unknown> = {};

  if (payload.gateway === 'razorpay' && config?.razorpayKeyId && config?.razorpayKeySecret) {
    const order = await createRazorpayOrder(
      { razorpayKeyId: config.razorpayKeyId, razorpayKeySecret: config.razorpayKeySecret },
      payload.amount,
      payload.currency,
      donation.id
    );
    await prisma.donation.update({
      where: { id: donation.id },
      data:  { gatewayOrderId: order.id as string },
    });
    gatewayData = {
      orderId:    order.id,
      keyId:      config.razorpayKeyId,
      amount:     payload.amount,
      currency:   payload.currency,
      donorName:  payload.donorName,
      donorEmail: payload.donorEmail,
    };
  }

  if (payload.gateway === 'stripe' && config?.stripeSecretKey) {
    const { clientSecret, intentId } = await createStripePaymentIntent(
      config.stripeSecretKey,
      payload.amount,
      payload.currency,
      donation.id
    );
    await prisma.donation.update({
      where: { id: donation.id },
      data:  { gatewayOrderId: intentId },
    });
    gatewayData = {
      clientSecret,
      publishableKey: config.stripePublishableKey,
    };
  }

  if (payload.gateway === 'upi' && config?.upiId && config?.upiName) {
    const upiLink = generateUPILink(config.upiId, config.upiName, payload.amount, donation.id);
    gatewayData = { upiLink, upiId: config.upiId };
  }

  return { donation, gatewayData };
}

// ─── Verify & Complete Payment ────────────────────────────────────────────────

export async function completeDonation(payload: VerifyPaymentPayload): Promise<boolean> {
  const donation = await prisma.donation.findUnique({
    where:   { id: payload.donationId },
    include: { stream: { include: { user: { include: { donationConfig: true } } } } },
  });
  if (!donation) return false;

  const config = donation.stream.user?.donationConfig;

  // ── Verify Razorpay signature ──
  if (payload.gateway === 'razorpay' && config?.razorpayKeySecret) {
    const valid = verifyRazorpaySignature(
      payload.gatewayOrderId,
      payload.gatewayPaymentId,
      payload.gatewaySignature ?? '',
      config.razorpayKeySecret
    );
    if (!valid) {
      await prisma.donation.update({ where: { id: donation.id }, data: { status: 'failed' } });
      return false;
    }
  }

  // ── Mark completed ──
  const updated = await prisma.donation.update({
    where: { id: donation.id },
    data:  {
      status:           'completed',
      gatewayPaymentId: payload.gatewayPaymentId,
      gatewaySignature: payload.gatewaySignature,
    },
  });

  // ── Update leaderboard ──
  await updateLeaderboard(donation.stream.id, donation.stream.roomId);

  // ── Broadcast alert to stream room ──
  const alertPayload: DonationAlertPayload = {
    id:            donation.id,
    donorName:     donation.isAnonymous ? 'Anonymous' : donation.donorName,
    amount:        donation.amount,
    displayAmount: donation.displayAmount,
    currency:      donation.currency,
    message:       donation.message ?? undefined,
    isAnonymous:   donation.isAnonymous,
    isHighlighted: await checkIfTopDonation(donation.stream.id, donation.amount),
    gateway:       donation.gateway,
  };
  broadcastToRoom(donation.stream.roomId, 'donation-alert', alertPayload);

  return true;
}

// ─── Stripe Webhook Handler ───────────────────────────────────────────────────

export async function handleStripeWebhook(event: { type: string; data: { object: Record<string, unknown> } }) {
  if (event.type !== 'payment_intent.succeeded') return;

  const intent     = event.data.object;
  const donationId = (intent.metadata as Record<string, string>)?.donationId;
  if (!donationId) return;

  await completeDonation({
    donationId,
    gatewayOrderId:   intent.id as string,
    gatewayPaymentId: intent.id as string,
    gateway:          'stripe',
  });
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

async function updateLeaderboard(dbStreamId: string, roomId: string) {
  const donations = await prisma.donation.findMany({
    where:   { streamId: dbStreamId, status: 'completed' },
    select:  { donorName: true, displayAmount: true, isAnonymous: true },
  });

  const map = new Map<string, { totalAmount: number; count: number }>();
  for (const d of donations) {
    const key = d.isAnonymous ? 'Anonymous' : d.donorName;
    const cur = map.get(key) ?? { totalAmount: 0, count: 0 };
    map.set(key, { totalAmount: cur.totalAmount + d.displayAmount, count: cur.count + 1 });
  }

  const entries = Array.from(map.entries())
    .map(([donorName, data]) => ({ donorName, ...data }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 20);

  await prisma.donationLeaderboard.upsert({
    where:  { streamId: dbStreamId },
    create: { streamId: dbStreamId, entries },
    update: { entries },
  });

  broadcastToRoom(roomId, 'leaderboard-update', { entries });
}

async function checkIfTopDonation(dbStreamId: string, amount: number): Promise<boolean> {
  const top = await prisma.donation.findFirst({
    where:   { streamId: dbStreamId, status: 'completed' },
    orderBy: { amount: 'desc' },
    select:  { amount: true },
  });
  return !top || amount >= top.amount;
}

// ─── Creator Dashboard Reads ──────────────────────────────────────────────────

export async function getDonationStats(userId: string) {
  const donations = await prisma.donation.findMany({
    where:   { userId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });

  const totalAmount  = donations.reduce((s, d) => s + d.displayAmount, 0);
  const monthStart   = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthlyTotal = donations
    .filter(d => d.createdAt >= monthStart)
    .reduce((s, d) => s + d.displayAmount, 0);

  const byGateway: Record<string, number> = {};
  for (const d of donations) {
    byGateway[d.gateway] = (byGateway[d.gateway] || 0) + d.displayAmount;
  }

  return {
    totalAmount:     Math.round(totalAmount * 100) / 100,
    monthlyTotal:    Math.round(monthlyTotal * 100) / 100,
    totalCount:      donations.length,
    byGateway,
    recentDonations: donations.slice(0, 50).map(d => ({
      id:           d.id,
      donorName:    d.isAnonymous ? 'Anonymous' : d.donorName,
      amount:       d.displayAmount,
      currency:     d.currency,
      message:      d.message,
      gateway:      d.gateway,
      status:       d.status,
      createdAt:    d.createdAt,
    })),
  };
}

export async function getStreamDonations(roomId: string) {
  const stream = await prisma.stream.findUnique({
    where:   { roomId },
    include: {
      donations:   { where: { status: 'completed' }, orderBy: { amount: 'desc' } },
      leaderboard: true,
    },
  });
  if (!stream) return null;

  const total = stream.donations.reduce((s, d) => s + d.displayAmount, 0);
  return {
    total:       Math.round(total * 100) / 100,
    count:       stream.donations.length,
    topDonation: stream.donations[0] ?? null,
    leaderboard: stream.leaderboard?.entries ?? [],
    recent:      stream.donations.slice(0, 10),
  };
}

// ─── Donation Config CRUD ─────────────────────────────────────────────────────

export async function upsertDonationConfig(
  userId: string,
  data: Partial<{
    razorpayKeyId: string; razorpayKeySecret: string;
    stripePublishableKey: string; stripeSecretKey: string; stripeWebhookSecret: string;
    upiId: string; upiName: string;
    minimumAmount: number; currency: string;
    alertDuration: number; alertSound: boolean; thankYouMessage: string;
  }>
) {
  return prisma.donationConfig.upsert({
    where:  { userId },
    create: { userId, ...data },
    update: data,
  });
}

export async function getDonationConfig(userId: string) {
  const config = await prisma.donationConfig.findUnique({ where: { userId } });
  if (!config) return null;
  // Mask secrets for client
  return {
    ...config,
    razorpayKeySecret:  config.razorpayKeySecret  ? '••••••••' : null,
    stripeSecretKey:    config.stripeSecretKey    ? '••••••••' : null,
    stripeWebhookSecret: config.stripeWebhookSecret ? '••••••••' : null,
  };
}

export async function getPublicDonationConfig(roomId: string) {
  const stream = await prisma.stream.findUnique({
    where:   { roomId },
    include: { user: { include: { donationConfig: true } } },
  });
  const config = stream?.user?.donationConfig;
  if (!config) return null;

  return {
    currency:       config.currency,
    minimumAmount:  config.minimumAmount,
    thankYouMessage: config.thankYouMessage,
    hasRazorpay:    !!(config.razorpayKeyId && config.razorpayKeySecret),
    hasStripe:      !!(config.stripePublishableKey && config.stripeSecretKey),
    hasUPI:         !!(config.upiId),
    razorpayKeyId:  config.razorpayKeyId,               // public key — safe to expose
    stripePublishableKey: config.stripePublishableKey,  // public key — safe to expose
    upiId:          config.upiId,
    upiName:        config.upiName,
  };
}
