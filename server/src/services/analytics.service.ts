/**
 * AnalyticsService
 * Central service for all stream analytics — event ingestion, aggregation,
 * real-time snapshots, and dashboard reads.
 */

import prisma from '../lib/prisma';
import { getRedisClient } from '../lib/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackEventPayload {
  streamId:    string;
  event:       'join' | 'leave' | 'chat' | 'poll_vote' | 'reaction' | 'donate';
  viewerId:    string;
  sessionId:   string;
  watchSeconds?: number;
  deviceType?: string;
  browser?:    string;
  os?:         string;
  country?:    string;
  region?:     string;
  city?:       string;
  userId?:     string;
}

export interface DashboardSummary {
  totalJoins:         number;
  uniqueViewers:      number;
  peakConcurrent:     number;
  totalWatchSeconds:  number;
  avgWatchSeconds:    number;
  totalChatMessages:  number;
  totalReactions:     number;
  totalPollVotes:     number;
  chatEngagementRate: number;
  deviceBreakdown:    Record<string, number>;
  countryBreakdown:   Record<string, number>;
  browserBreakdown:   Record<string, number>;
  retentionCurve:     number[];
  concurrentTimeline: { ts: string; count: number }[];
  durationSeconds:    number;
}

// ─── Redis key helpers ────────────────────────────────────────────────────────

const KEYS = {
  concurrent:    (sid: string) => `analytics:concurrent:${sid}`,
  uniqueViewers: (sid: string) => `analytics:unique:${sid}`,
  chatCount:     (sid: string) => `analytics:chat:${sid}`,
  reactionCount: (sid: string) => `analytics:reaction:${sid}`,
  pollCount:     (sid: string) => `analytics:poll:${sid}`,
  joinCount:     (sid: string) => `analytics:joins:${sid}`,
  watchTotal:    (sid: string) => `analytics:watch:${sid}`,
  retention:     (sid: string) => `analytics:retention:${sid}`,
  timeline:      (sid: string) => `analytics:timeline:${sid}`,
  peak:          (sid: string) => `analytics:peak:${sid}`,
};

const TTL = 60 * 60 * 48; // 48 hours

// ─── Core: track a single analytics event ─────────────────────────────────────

export async function trackEvent(payload: TrackEventPayload): Promise<void> {
  const redis = getRedisClient();
  const { streamId, event, viewerId, watchSeconds = 0 } = payload;

  // Resolve DB stream id from roomId
  const stream = await prisma.stream.findUnique({
    where: { roomId: streamId },
    select: { id: true },
  });
  if (!stream) return;

  const dbStreamId = stream.id;

  // ── Persist event to DB (async, non-blocking) ──
  prisma.analyticsEvent.create({
    data: {
      streamId:    dbStreamId,
      event,
      viewerId:    payload.viewerId,
      sessionId:   payload.sessionId,
      watchSeconds,
      deviceType:  payload.deviceType,
      browser:     payload.browser,
      os:          payload.os,
      country:     payload.country,
      region:      payload.region,
      city:        payload.city,
      userId:      payload.userId,
    },
  }).catch(console.error);

  if (!redis) return; // Graceful degradation if Redis is unavailable

  const pipeline = redis.multi();

  if (event === 'join') {
    pipeline.incr(KEYS.joinCount(streamId));
    pipeline.sAdd(KEYS.uniqueViewers(streamId), viewerId);
    pipeline.incr(KEYS.concurrent(streamId));
    pipeline.expire(KEYS.joinCount(streamId), TTL);
    pipeline.expire(KEYS.uniqueViewers(streamId), TTL);
    pipeline.expire(KEYS.concurrent(streamId), TTL);
  }

  if (event === 'leave') {
    pipeline.decr(KEYS.concurrent(streamId));
    if (watchSeconds > 0) {
      pipeline.incrBy(KEYS.watchTotal(streamId), watchSeconds);
      pipeline.expire(KEYS.watchTotal(streamId), TTL);
    }
  }

  if (event === 'chat') {
    pipeline.incr(KEYS.chatCount(streamId));
    pipeline.expire(KEYS.chatCount(streamId), TTL);
  }

  if (event === 'reaction') {
    pipeline.incr(KEYS.reactionCount(streamId));
    pipeline.expire(KEYS.reactionCount(streamId), TTL);
  }

  if (event === 'poll_vote') {
    pipeline.incr(KEYS.pollCount(streamId));
    pipeline.expire(KEYS.pollCount(streamId), TTL);
  }

  await pipeline.exec();

  // ── Update peak concurrent ──
  const current = await redis.get(KEYS.concurrent(streamId));
  const currentNum = parseInt(current || '0');
  const peak = await redis.get(KEYS.peak(streamId));
  const peakNum = parseInt(peak || '0');
  if (currentNum > peakNum) {
    await redis.set(KEYS.peak(streamId), currentNum, { EX: TTL });
  }
}

// ─── Snapshot concurrent viewers (called every 30s by scheduler) ──────────────

export async function snapshotConcurrent(roomId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const stream = await prisma.stream.findUnique({
    where: { roomId },
    select: { id: true, isLive: true },
  });
  if (!stream || !stream.isLive) return;

  const count = parseInt((await redis.get(KEYS.concurrent(roomId))) || '0');

  // Save snapshot to DB for persistent timeline
  await prisma.concurrentViewerSnapshot.create({
    data: { streamId: stream.id, count, timestamp: new Date() },
  });

  // Also push to Redis list for fast reads (keep last 720 = 6h at 30s interval)
  const entry = JSON.stringify({ ts: new Date().toISOString(), count });
  await redis.lPush(KEYS.timeline(roomId), entry);
  await redis.lTrim(KEYS.timeline(roomId), 0, 719);
  await redis.expire(KEYS.timeline(roomId), TTL);
}

// ─── Finalize analytics when stream ends ─────────────────────────────────────

export async function finalizeStreamAnalytics(roomId: string): Promise<void> {
  const redis = getRedisClient();

  const stream = await prisma.stream.findUnique({
    where: { roomId },
    select: { id: true, createdAt: true },
  });
  if (!stream) return;

  // Pull aggregated counts from Redis
  const [
    joins, uniqueSet, peak, watchTotal, chat, reactions, polls,
  ] = await Promise.all([
    redis?.get(KEYS.joinCount(roomId)),
    redis?.sCard(KEYS.uniqueViewers(roomId)),
    redis?.get(KEYS.peak(roomId)),
    redis?.get(KEYS.watchTotal(roomId)),
    redis?.get(KEYS.chatCount(roomId)),
    redis?.get(KEYS.reactionCount(roomId)),
    redis?.get(KEYS.pollCount(roomId)),
  ]);

  const totalJoins        = parseInt(joins       || '0');
  const uniqueViewers     = uniqueSet             || 0;
  const peakConcurrent    = parseInt(peak         || '0');
  const totalWatchSeconds = parseInt(watchTotal   || '0');
  const totalChatMessages = parseInt(chat         || '0');
  const totalReactions    = parseInt(reactions    || '0');
  const totalPollVotes    = parseInt(polls        || '0');

  const avgWatchSeconds   = uniqueViewers > 0
    ? Math.round(totalWatchSeconds / (uniqueViewers as number))
    : 0;

  const chatEngagementRate = uniqueViewers > 0
    ? Math.round((totalChatMessages / (uniqueViewers as number)) * 100) / 100
    : 0;

  // ── Device / country breakdowns from DB ──
  const events = await prisma.analyticsEvent.findMany({
    where:  { streamId: stream.id, event: 'join' },
    select: { deviceType: true, country: true, browser: true },
  });

  const deviceBreakdown:  Record<string, number> = {};
  const countryBreakdown: Record<string, number> = {};
  const browserBreakdown: Record<string, number> = {};

  for (const ev of events) {
    if (ev.deviceType) deviceBreakdown[ev.deviceType]   = (deviceBreakdown[ev.deviceType]   || 0) + 1;
    if (ev.country)    countryBreakdown[ev.country]     = (countryBreakdown[ev.country]     || 0) + 1;
    if (ev.browser)    browserBreakdown[ev.browser]     = (browserBreakdown[ev.browser]     || 0) + 1;
  }

  // ── Retention curve ──
  const retentionCurve = await buildRetentionCurve(stream.id);

  // ── Concurrent timeline from DB snapshots ──
  const snaps = await prisma.concurrentViewerSnapshot.findMany({
    where:   { streamId: stream.id },
    orderBy: { timestamp: 'asc' },
    select:  { timestamp: true, count: true },
  });
  const concurrentTimeline = snaps.map(s => ({
    ts:    s.timestamp.toISOString(),
    count: s.count,
  }));

  // ── Duration ──
  const now = new Date();
  const durationSeconds = Math.round(
    (now.getTime() - stream.createdAt.getTime()) / 1000
  );

  // ── Upsert StreamAnalytics ──
  await prisma.streamAnalytics.upsert({
    where:  { streamId: stream.id },
    create: {
      streamId: stream.id,
      totalJoins,
      uniqueViewers:     uniqueViewers as number,
      peakConcurrent,
      totalWatchSeconds: BigInt(totalWatchSeconds),
      avgWatchSeconds,
      totalChatMessages,
      totalReactions,
      totalPollVotes,
      chatEngagementRate,
      deviceBreakdown,
      countryBreakdown,
      browserBreakdown,
      retentionCurve,
      concurrentTimeline,
      durationSeconds,
      endedAt: now,
    },
    update: {
      totalJoins,
      uniqueViewers:     uniqueViewers as number,
      peakConcurrent,
      totalWatchSeconds: BigInt(totalWatchSeconds),
      avgWatchSeconds,
      totalChatMessages,
      totalReactions,
      totalPollVotes,
      chatEngagementRate,
      deviceBreakdown,
      countryBreakdown,
      browserBreakdown,
      retentionCurve,
      concurrentTimeline,
      durationSeconds,
      endedAt: now,
    },
  });
}

// ─── Real-time stats (for live dashboard) ────────────────────────────────────

export async function getLiveStats(roomId: string) {
  const redis = getRedisClient();
  if (!redis) return null;

  const [concurrent, uniqueViewers, peak, chat] = await Promise.all([
    redis.get(KEYS.concurrent(roomId)),
    redis.sCard(KEYS.uniqueViewers(roomId)),
    redis.get(KEYS.peak(roomId)),
    redis.get(KEYS.chatCount(roomId)),
  ]);

  // Last 30 timeline points
  const timelineRaw = await redis.lRange(KEYS.timeline(roomId), 0, 29);
  const timeline = timelineRaw
    .map(t => { try { return JSON.parse(t); } catch { return null; } })
    .filter(Boolean)
    .reverse();

  return {
    concurrent:    parseInt(concurrent    || '0'),
    uniqueViewers: uniqueViewers          || 0,
    peak:          parseInt(peak          || '0'),
    chat:          parseInt(chat          || '0'),
    timeline,
  };
}

// ─── Dashboard read (historical) ─────────────────────────────────────────────

export async function getStreamDashboard(
  roomId: string,
  hostToken: string
): Promise<DashboardSummary | null> {
  const stream = await prisma.stream.findUnique({
    where:   { roomId },
    include: { analytics: true },
  });

  if (!stream || stream.hostToken !== hostToken) return null;

  // If stream is live, blend Redis data
  if (stream.isLive) {
    const live = await getLiveStats(roomId);
    const a    = stream.analytics;
    return {
      totalJoins:         live?.concurrent ?? a?.totalJoins ?? 0,
      uniqueViewers:      (live?.uniqueViewers as number) ?? a?.uniqueViewers ?? 0,
      peakConcurrent:     live?.peak ?? a?.peakConcurrent ?? 0,
      totalWatchSeconds:  a ? Number(a.totalWatchSeconds) : 0,
      avgWatchSeconds:    a?.avgWatchSeconds ?? 0,
      totalChatMessages:  live?.chat ?? a?.totalChatMessages ?? 0,
      totalReactions:     a?.totalReactions ?? 0,
      totalPollVotes:     a?.totalPollVotes ?? 0,
      chatEngagementRate: a?.chatEngagementRate ?? 0,
      deviceBreakdown:    (a?.deviceBreakdown  as Record<string, number>) ?? {},
      countryBreakdown:   (a?.countryBreakdown as Record<string, number>) ?? {},
      browserBreakdown:   (a?.browserBreakdown as Record<string, number>) ?? {},
      retentionCurve:     (a?.retentionCurve   as number[]) ?? [],
      concurrentTimeline: live?.timeline ?? [],
      durationSeconds:    a?.durationSeconds ?? 0,
    };
  }

  if (!stream.analytics) {
    return {
      totalJoins: 0, uniqueViewers: 0, peakConcurrent: 0,
      totalWatchSeconds: 0, avgWatchSeconds: 0, totalChatMessages: 0,
      totalReactions: 0, totalPollVotes: 0, chatEngagementRate: 0,
      deviceBreakdown: {}, countryBreakdown: {}, browserBreakdown: {},
      retentionCurve: [], concurrentTimeline: [], durationSeconds: 0,
    };
  }

  const a = stream.analytics;
  return {
    totalJoins:         a.totalJoins,
    uniqueViewers:      a.uniqueViewers,
    peakConcurrent:     a.peakConcurrent,
    totalWatchSeconds:  Number(a.totalWatchSeconds),
    avgWatchSeconds:    a.avgWatchSeconds,
    totalChatMessages:  a.totalChatMessages,
    totalReactions:     a.totalReactions,
    totalPollVotes:     a.totalPollVotes,
    chatEngagementRate: a.chatEngagementRate,
    deviceBreakdown:    (a.deviceBreakdown  as Record<string, number>),
    countryBreakdown:   (a.countryBreakdown as Record<string, number>),
    browserBreakdown:   (a.browserBreakdown as Record<string, number>),
    retentionCurve:     (a.retentionCurve   as number[]),
    concurrentTimeline: (a.concurrentTimeline as { ts: string; count: number }[]),
    durationSeconds:    a.durationSeconds,
  };
}

// ─── Creator-level aggregated analytics ──────────────────────────────────────

export async function getCreatorStats(userId: string) {
  const streams = await prisma.stream.findMany({
    where:   { userId },
    include: { analytics: true },
    orderBy: { createdAt: 'desc' },
  });

  const totalStreams   = streams.length;
  let totalViewers    = 0;
  let totalWatchTime  = 0;
  let totalChats      = 0;
  const streamSummaries = streams.map(s => {
    const a = s.analytics;
    totalViewers   += a?.uniqueViewers  ?? 0;
    totalWatchTime += a ? Number(a.totalWatchSeconds) : 0;
    totalChats     += a?.totalChatMessages ?? 0;
    return {
      roomId:       s.roomId,
      title:        s.title,
      createdAt:    s.createdAt,
      isLive:       s.isLive,
      uniqueViewers: a?.uniqueViewers  ?? 0,
      peakConcurrent: a?.peakConcurrent ?? 0,
      durationSeconds: a?.durationSeconds ?? 0,
      totalChatMessages: a?.totalChatMessages ?? 0,
    };
  });

  return {
    totalStreams,
    totalViewers,
    totalWatchTime,
    totalChats,
    avgViewersPerStream: totalStreams > 0
      ? Math.round(totalViewers / totalStreams)
      : 0,
    streams: streamSummaries,
  };
}

// ─── Internal: build retention curve ─────────────────────────────────────────

async function buildRetentionCurve(dbStreamId: string): Promise<number[]> {
  const joinEvents = await prisma.analyticsEvent.findMany({
    where:  { streamId: dbStreamId, event: 'join' },
    select: { viewerId: true, timestamp: true },
  });
  const leaveEvents = await prisma.analyticsEvent.findMany({
    where:  { streamId: dbStreamId, event: 'leave' },
    select: { viewerId: true, timestamp: true, watchSeconds: true },
  });

  if (joinEvents.length === 0) return [];

  const streamStart = joinEvents.reduce(
    (min, e) => e.timestamp < min ? e.timestamp : min,
    joinEvents[0].timestamp
  );

  const maxDuration = leaveEvents.reduce((max, e) => {
    return Math.max(max, e.watchSeconds);
  }, 300); // default 5 min

  const buckets = Math.min(Math.ceil(maxDuration / 60), 60); // 1-min buckets, max 60
  const retentionPoints: number[] = [];
  const totalViewers = joinEvents.length;

  for (let minute = 0; minute <= buckets; minute++) {
    const minuteMs = minute * 60 * 1000;
    const stillWatching = leaveEvents.filter(e => e.watchSeconds >= minuteMs / 1000).length;
    const joined        = joinEvents.filter(
      e => e.timestamp.getTime() - streamStart.getTime() <= minuteMs
    ).length;
    const base = Math.max(joined, 1);
    retentionPoints.push(Math.round((stillWatching / base) * 100));
  }

  return retentionPoints;
}
