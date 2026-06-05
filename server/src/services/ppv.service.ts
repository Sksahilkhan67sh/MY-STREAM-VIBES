/**
 * PPVService
 * Pay-per-view ticket management: tier creation, purchase flow,
 * access token validation, refund processing, purchase history.
 */

import prisma from '../lib/prisma';
import crypto from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTicketCode(): string {
  // e.g. "SV-4K2X9P"
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code    = 'SV-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateAccessToken(ticketId: string, streamId: string): string {
  const payload = `${ticketId}:${streamId}:${Date.now()}`;
  return crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET ?? 'sv_secret')
    .update(payload)
    .digest('hex')
    .slice(0, 48);
}

// ─── Ticket Tier CRUD ─────────────────────────────────────────────────────────

export async function createTicketTier(data: {
  roomId:      string;
  hostToken:   string;
  name:        string;
  description?: string;
  price:       number;
  currency:    string;
  maxQuantity?: number;
  validUntil?: string;
}) {
  const stream = await prisma.stream.findUnique({
    where: { roomId: data.roomId },
  });
  if (!stream || stream.hostToken !== data.hostToken) {
    throw new Error('Unauthorized');
  }

  const tier = await prisma.ticketTier.create({
    data: {
      streamId:    stream.id,
      name:        data.name,
      description: data.description,
      price:       data.price,
      currency:    data.currency,
      maxQuantity: data.maxQuantity,
      validUntil:  data.validUntil ? new Date(data.validUntil) : undefined,
    },
  });

  // Enable PPV on the stream + set lowest price
  const allTiers = await prisma.ticketTier.findMany({
    where:  { streamId: stream.id, isActive: true },
    orderBy: { price: 'asc' },
  });
  await prisma.stream.update({
    where: { id: stream.id },
    data:  {
      isPPV:    true,
      ppvPrice: allTiers[0]?.price ?? data.price,
    },
  });

  return tier;
}

export async function getTicketTiers(roomId: string) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) return [];

  return prisma.ticketTier.findMany({
    where:   { streamId: stream.id, isActive: true },
    include: { _count: { select: { tickets: { where: { status: 'active' } } } } },
    orderBy: { price: 'asc' },
  });
}

export async function updateTicketTier(tierId: string, hostToken: string, data: {
  name?: string; description?: string; price?: number;
  maxQuantity?: number; isActive?: boolean;
}) {
  const tier = await prisma.ticketTier.findUnique({
    where:   { id: tierId },
    include: { stream: true },
  });
  if (!tier || tier.stream.hostToken !== hostToken) throw new Error('Unauthorized');
  return prisma.ticketTier.update({ where: { id: tierId }, data });
}

// ─── PPV Config ───────────────────────────────────────────────────────────────

export async function upsertPPVConfig(roomId: string, hostToken: string, data: {
  allowRefunds?: boolean;
  refundWindowHours?: number;
  maxTicketsPerBuyer?: number;
  thankYouMessage?: string;
  reminderEnabled?: boolean;
}) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream || stream.hostToken !== hostToken) throw new Error('Unauthorized');

  return prisma.pPVConfig.upsert({
    where:  { streamId: stream.id },
    create: { streamId: stream.id, ...data },
    update: data,
  });
}

export async function getPPVConfig(roomId: string) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) return null;
  return prisma.pPVConfig.findUnique({ where: { streamId: stream.id } });
}

// ─── Purchase Flow ────────────────────────────────────────────────────────────

export async function initiatePurchase(data: {
  roomId:     string;
  tierId:     string;
  buyerName:  string;
  buyerEmail: string;
  buyerUserId?: string;
  gateway:    'razorpay' | 'stripe' | 'upi';
  quantity?:  number;
}) {
  const stream = await prisma.stream.findUnique({
    where:   { roomId: data.roomId },
    include: { ppvConfig: true },
  });
  if (!stream) throw new Error('Stream not found');
  if (!stream.isPPV) throw new Error('Stream is not pay-per-view');

  const tier = await prisma.ticketTier.findUnique({ where: { id: data.tierId } });
  if (!tier || !tier.isActive) throw new Error('Ticket tier not available');

  // Check sold out
  if (tier.maxQuantity !== null && tier.soldCount >= tier.maxQuantity) {
    throw new Error('This ticket tier is sold out');
  }

  // Check per-buyer limit
  const maxPerBuyer = stream.ppvConfig?.maxTicketsPerBuyer ?? 5;
  const existingCount = await prisma.ticket.count({
    where: {
      streamId:   stream.id,
      buyerEmail: data.buyerEmail,
      status:     { in: ['active', 'used'] },
    },
  });
  if (existingCount >= maxPerBuyer) {
    throw new Error(`Maximum ${maxPerBuyer} tickets per buyer`);
  }

  // Create pending ticket
  const ticketCode  = generateTicketCode();
  const ticket      = await prisma.ticket.create({
    data: {
      tierId:       tier.id,
      streamId:     stream.id,
      buyerName:    data.buyerName,
      buyerEmail:   data.buyerEmail,
      buyerUserId:  data.buyerUserId,
      ticketCode,
      amount:       tier.price,
      currency:     tier.currency,
      gateway:      data.gateway,
      accessToken:  generateAccessToken('pending', stream.id),
      expiresAt:    stream.expiresAt,
      status:       'active',
    },
  });

  // Create gateway order
  let gatewayData: Record<string, unknown> = {};

  if (data.gateway === 'razorpay') {
    gatewayData = await createRazorpayTicketOrder(ticket.id, tier.price, tier.currency, stream.title);
  } else if (data.gateway === 'stripe') {
    gatewayData = await createStripeTicketIntent(ticket.id, tier.price, tier.currency, stream.title);
  } else if (data.gateway === 'upi') {
    const upiId   = process.env.UPI_ID ?? 'streamvault@upi';
    const upiName = process.env.UPI_NAME ?? 'Stream Vault';
    const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${(tier.price / 100).toFixed(2)}&tn=${encodeURIComponent(`Ticket ${ticketCode}`)}&cu=INR`;
    gatewayData   = { upiLink, upiId };
  }

  return { ticketId: ticket.id, ticketCode, ...gatewayData };
}

async function createRazorpayTicketOrder(ticketId: string, amount: number, currency: string, streamTitle: string) {
  const Razorpay = (await import('razorpay')).default;
  const rp = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
  const order = await rp.orders.create({
    amount,
    currency,
    receipt:  `ticket_${ticketId}`,
    notes:    { ticketId, streamTitle },
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data:  { gatewayOrderId: order.id as string },
  });

  return {
    orderId:    order.id,
    keyId:      process.env.RAZORPAY_KEY_ID,
    amount,
    currency,
  };
}

async function createStripeTicketIntent(ticketId: string, amount: number, currency: string, streamTitle: string) {
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

  const intent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    metadata: { ticketId, streamTitle },
    automatic_payment_methods: { enabled: true },
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data:  { gatewayOrderId: intent.id },
  });

  return {
    clientSecret:   intent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  };
}

// ─── Complete Purchase ────────────────────────────────────────────────────────

export async function completePurchase(data: {
  ticketId:         string;
  gatewayOrderId:   string;
  gatewayPaymentId: string;
  gatewaySignature?: string;
  gateway:          string;
}): Promise<{ ticket: Record<string, unknown>; accessToken: string } | null> {
  const ticket = await prisma.ticket.findUnique({
    where:   { id: data.ticketId },
    include: { stream: true, tier: true },
  });
  if (!ticket) return null;

  // Verify Razorpay signature
  if (data.gateway === 'razorpay' && data.gatewaySignature) {
    const body     = `${data.gatewayOrderId}|${data.gatewayPaymentId}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
      .update(body)
      .digest('hex');
    if (expected !== data.gatewaySignature) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'canceled' } });
      return null;
    }
  }

  // Generate real access token
  const accessToken = generateAccessToken(ticket.id, ticket.stream.id);

  // Update ticket
  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data:  {
      status:           'active',
      gatewayPaymentId: data.gatewayPaymentId,
      gatewaySignature: data.gatewaySignature,
      accessToken,
      paidAt:           new Date(),
    },
  });

  // Increment sold count
  await prisma.ticketTier.update({
    where: { id: ticket.tierId },
    data:  { soldCount: { increment: 1 } },
  });

  // Send confirmation email (if configured)
  await sendTicketConfirmation(updated, ticket.tier, ticket.stream);

  return {
    ticket: {
      id:          updated.id,
      ticketCode:  updated.ticketCode,
      buyerName:   updated.buyerName,
      buyerEmail:  updated.buyerEmail,
      amount:      updated.amount,
      currency:    updated.currency,
      streamTitle: ticket.stream.title,
      tierName:    ticket.tier.name,
      expiresAt:   updated.expiresAt,
    },
    accessToken,
  };
}

// ─── Access Validation (stream entry) ────────────────────────────────────────

export async function validateTicketAccess(
  roomId:      string,
  accessToken: string
): Promise<{ valid: boolean; reason?: string; ticket?: Record<string, unknown> }> {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) return { valid: false, reason: 'Stream not found' };

  if (!stream.isPPV) return { valid: true }; // not PPV — free access

  const ticket = await prisma.ticket.findFirst({
    where: {
      streamId:    stream.id,
      accessToken,
      status:      { in: ['active', 'used'] },
    },
    include: { tier: true },
  });

  if (!ticket) return { valid: false, reason: 'Invalid or expired ticket' };

  if (ticket.expiresAt && ticket.expiresAt < new Date()) {
    return { valid: false, reason: 'Ticket has expired' };
  }

  // Mark as used on first access
  if (!ticket.accessedAt) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data:  { accessedAt: new Date(), status: 'used' },
    });
  }

  return {
    valid: true,
    ticket: {
      id:         ticket.id,
      ticketCode: ticket.ticketCode,
      tierName:   ticket.tier.name,
      buyerName:  ticket.buyerName,
    },
  };
}

// ─── Refund ───────────────────────────────────────────────────────────────────

export async function refundTicket(ticketId: string, hostToken: string, reason?: string) {
  const ticket = await prisma.ticket.findUnique({
    where:   { id: ticketId },
    include: { stream: true },
  });
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.stream.hostToken !== hostToken) throw new Error('Unauthorized');
  if (ticket.status === 'refunded') throw new Error('Already refunded');

  // Razorpay refund
  if (ticket.gateway === 'razorpay' && ticket.gatewayPaymentId) {
    try {
      const Razorpay = (await import('razorpay')).default;
      const rp = new Razorpay({
        key_id:     process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });
      await rp.payments.refund(ticket.gatewayPaymentId, { amount: ticket.amount });
    } catch (e) {
      console.error('Razorpay refund error:', e);
    }
  }

  // Stripe refund
  if (ticket.gateway === 'stripe' && ticket.gatewayPaymentId) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
      await stripe.refunds.create({ payment_intent: ticket.gatewayPaymentId });
    } catch (e) {
      console.error('Stripe refund error:', e);
    }
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data:  { status: 'refunded', refundedAt: new Date(), refundReason: reason },
  });

  // Decrement sold count
  await prisma.ticketTier.update({
    where: { id: ticket.tierId },
    data:  { soldCount: { decrement: 1 } },
  });

  return { ok: true };
}

// ─── Purchase History ─────────────────────────────────────────────────────────

export async function getPurchaseHistory(buyerEmail: string) {
  return prisma.ticket.findMany({
    where:   { buyerEmail, status: { in: ['active', 'used'] } },
    include: { stream: { select: { title: true, roomId: true, scheduledAt: true, isLive: true } }, tier: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getStreamTicketStats(roomId: string, hostToken: string) {
  const stream = await prisma.stream.findUnique({
    where:   { roomId },
    include: {
      ticketTiers: {
        include: { _count: { select: { tickets: true } } },
      },
    },
  });
  if (!stream || stream.hostToken !== hostToken) throw new Error('Unauthorized');

  const tickets = await prisma.ticket.findMany({
    where:   { streamId: stream.id, status: { in: ['active', 'used'] } },
    orderBy: { createdAt: 'desc' },
  });

  const totalRevenue = tickets.reduce((s, t) => s + t.amount, 0) / 100;
  const byGateway: Record<string, number> = {};
  for (const t of tickets) {
    byGateway[t.gateway] = (byGateway[t.gateway] ?? 0) + t.amount / 100;
  }

  return {
    totalRevenue,
    totalTickets: tickets.length,
    byGateway,
    tiers: stream.ticketTiers.map(tier => ({
      id:          tier.id,
      name:        tier.name,
      price:       tier.price / 100,
      currency:    tier.currency,
      soldCount:   tier.soldCount,
      maxQuantity: tier.maxQuantity,
      isActive:    tier.isActive,
      revenue:     (tier.soldCount * tier.price) / 100,
    })),
    recentTickets: tickets.slice(0, 20).map(t => ({
      id:         t.id,
      ticketCode: t.ticketCode,
      buyerName:  t.buyerName,
      buyerEmail: t.buyerEmail,
      amount:     t.amount / 100,
      currency:   t.currency,
      gateway:    t.gateway,
      status:     t.status,
      paidAt:     t.paidAt,
    })),
  };
}

// ─── Email confirmation (graceful) ───────────────────────────────────────────

async function sendTicketConfirmation(
  ticket:  { ticketCode: string; buyerName: string; buyerEmail: string; accessToken: string },
  tier:    { name: string; price: number; currency: string },
  stream:  { title: string; roomId: string; scheduledAt: Date | null }
) {
  if (!process.env.RESEND_API_KEY) return; // skip if not configured

  const appUrl    = process.env.CLIENT_URL ?? 'http://localhost:3000';
  const watchUrl  = `${appUrl}/s/${stream.roomId}?ticket=${ticket.accessToken}`;
  const dateStr   = stream.scheduledAt
    ? new Date(stream.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : 'Check stream page for details';

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:    'Stream Vault <tickets@streamvault.app>',
      to:      ticket.buyerEmail,
      subject: `🎫 Your ticket for "${stream.title}"`,
      text: [
        `Hi ${ticket.buyerName},`,
        '',
        `Your ticket is confirmed!`,
        `Ticket Code: ${ticket.ticketCode}`,
        `Tier: ${tier.name}`,
        `Stream: ${stream.title}`,
        `Date: ${dateStr}`,
        '',
        `Watch link: ${watchUrl}`,
        '',
        'See you there!',
        '— Stream Vault',
      ].join('\n'),
    });
  } catch (e) {
    console.error('Ticket email failed:', e);
  }
}
