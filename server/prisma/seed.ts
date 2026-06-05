/**
 * prisma/seed.ts
 * Seeds the four default subscription plans.
 * Run: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  {
    name:        'free',
    displayName: 'Free',
    description: 'Get started with live streaming at no cost.',
    priceMonthlyINR: 0,
    priceYearlyINR:  0,
    priceMonthlyUSD: 0,
    priceYearlyUSD:  0,

    maxStreamsPerMonth:  3,
    maxViewersPerStream: 25,
    maxStreamDuration:   60,
    maxStorageGB:        1,
    maxCoHosts:          0,
    canRecord:           false,
    canGoRTMP:           false,
    canRunPolls:         true,
    canAccessAnalytics:  false,
    canAcceptDonations:  false,
    canCustomBranding:   false,
    canScheduleStreams:  true,
    hasAIFeatures:       false,
    hasPrioritySupport:  false,
    hasWhiteLabel:       false,
    sortOrder:           0,
  },
  {
    name:        'basic',
    displayName: 'Basic',
    description: 'For hobbyists and small creators just getting started.',
    priceMonthlyINR: 49900,   // ₹499/mo
    priceYearlyINR:  399900,  // ₹3,999/yr
    priceMonthlyUSD:  599,    // $5.99/mo
    priceYearlyUSD:  4999,    // $49.99/yr

    maxStreamsPerMonth:  10,
    maxViewersPerStream: 100,
    maxStreamDuration:   180,
    maxStorageGB:        10,
    maxCoHosts:          1,
    canRecord:           true,
    canGoRTMP:           false,
    canRunPolls:         true,
    canAccessAnalytics:  true,
    canAcceptDonations:  true,
    canCustomBranding:   false,
    canScheduleStreams:  true,
    hasAIFeatures:       false,
    hasPrioritySupport:  false,
    hasWhiteLabel:       false,
    sortOrder:           1,
  },
  {
    name:        'premium',
    displayName: 'Premium',
    description: 'For professional creators who want the full toolkit.',
    priceMonthlyINR: 149900,   // ₹1,499/mo
    priceYearlyINR:  1199900,  // ₹11,999/yr
    priceMonthlyUSD:  1999,    // $19.99/mo
    priceYearlyUSD:  15999,    // $159.99/yr

    maxStreamsPerMonth:  -1,     // unlimited
    maxViewersPerStream: 1000,
    maxStreamDuration:   -1,    // unlimited
    maxStorageGB:        100,
    maxCoHosts:          5,
    canRecord:           true,
    canGoRTMP:           true,
    canRunPolls:         true,
    canAccessAnalytics:  true,
    canAcceptDonations:  true,
    canCustomBranding:   true,
    canScheduleStreams:  true,
    hasAIFeatures:       true,
    hasPrioritySupport:  false,
    hasWhiteLabel:       false,
    sortOrder:           2,
  },
  {
    name:        'enterprise',
    displayName: 'Enterprise',
    description: 'For teams and organisations that need scale and control.',
    priceMonthlyINR: 499900,   // ₹4,999/mo
    priceYearlyINR:  3999900,  // ₹39,999/yr
    priceMonthlyUSD:  6999,    // $69.99/mo
    priceYearlyUSD:  55999,    // $559.99/yr

    maxStreamsPerMonth:  -1,
    maxViewersPerStream: -1,
    maxStreamDuration:   -1,
    maxStorageGB:        -1,
    maxCoHosts:          -1,
    canRecord:           true,
    canGoRTMP:           true,
    canRunPolls:         true,
    canAccessAnalytics:  true,
    canAcceptDonations:  true,
    canCustomBranding:   true,
    canScheduleStreams:  true,
    hasAIFeatures:       true,
    hasPrioritySupport:  true,
    hasWhiteLabel:       true,
    sortOrder:           3,
  },
];

async function main() {
  console.log('🌱 Seeding subscription plans...');
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where:  { name: plan.name },
      update: plan,
      create: plan,
    });
    console.log(`  ✓ ${plan.displayName}`);
  }
  console.log('✅ Plans seeded successfully');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
