import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { getCache, setCache } from '../lib/redis';

const router = Router();

// ── AI Recommendations ───────────────────────────────────────────────────────
// GET /api/ai-features/recommendations/:userId
//
// Cached for 2 minutes per user — this fires on every feed load and runs
// several queries (watch history, follows, ratings, then category/creator/
// replay lookups), so a short cache meaningfully cuts DB load for a user
// who reloads or re-navigates to the feed repeatedly in a short window.
// 2 minutes (vs. e.g. search's 60s) because personalization signals change
// less moment-to-moment than live viewer counts do.
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const cacheKey = `recommendations:${userId}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) return res.json(cached);

    const [history, follows, ratings] = await Promise.all([
      prisma.watchHistory.findMany({
        where: { userId }, include: { stream: { select: { categoryId: true, tags: true } } },
        orderBy: { lastWatchedAt: 'desc' }, take: 100,
      }),
      prisma.follow.findMany({ where: { followerId: userId }, select: { creatorId: true } }),
      prisma.streamRating.findMany({ where: { userId, rating: { gte: 4 } }, select: { streamId: true } }),
    ]);

    // Score categories by watch time
    const catScore = new Map<string, number>();
    const tagScore = new Map<string, number>();
    for (const h of history) {
      if (h.stream.categoryId) catScore.set(h.stream.categoryId, (catScore.get(h.stream.categoryId) ?? 0) + h.watchSeconds);
      try {
        const tags: string[] = JSON.parse(h.stream.tags || '[]');
        for (const tag of tags) tagScore.set(tag, (tagScore.get(tag) ?? 0) + h.watchSeconds);
      } catch {}
    }

    const topCats = [...catScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    const followedCreators = follows.map(f => f.creatorId);
    const highlyRatedIds = ratings.map(r => r.streamId);

    // BUG FIX: this previously claimed (in its own comment) to recommend
    // "streams in same category as highly-rated ones" but never actually
    // filtered by category — it just excluded the already-rated streams
    // and otherwise returned arbitrary popular streams, completely
    // disconnected from what the user actually rated highly. Now it looks
    // up the categories of the user's highly-rated streams first, and
    // genuinely filters on them.
    const likedCategoryIds = highlyRatedIds.length
      ? (await prisma.stream.findMany({ where: { id: { in: highlyRatedIds } }, select: { categoryId: true } }))
          .map(s => s.categoryId).filter((id): id is string => !!id)
      : [];

    const streamCardFields = {
      id: true, roomId: true, title: true, thumbnailUrl: true, viewerCount: true, isLive: true,
      category: { select: { name: true, icon: true } }, user: { select: { id: true, name: true, username: true, avatarUrl: true } },
    };

    // Fetch recommendations from multiple signals
    const [byCat, byCreator, similar] = await Promise.all([
      topCats.length ? prisma.stream.findMany({
        where: { isPublic: true, isLive: true, categoryId: { in: topCats } },
        select: streamCardFields,
        orderBy: { viewerCount: 'desc' }, take: 12,
      }) : Promise.resolve([]),
      followedCreators.length ? prisma.stream.findMany({
        where: { isPublic: true, isLive: true, userId: { in: followedCreators } },
        select: streamCardFields,
        orderBy: { viewerCount: 'desc' }, take: 8,
      }) : Promise.resolve([]),
      // "Because you liked" — now genuinely scoped to the categories of the
      // user's own highly-rated streams (see bug-fix note above).
      likedCategoryIds.length ? prisma.stream.findMany({
        where: { isPublic: true, id: { notIn: highlyRatedIds }, isLive: true, categoryId: { in: likedCategoryIds } },
        select: streamCardFields,
        orderBy: { viewerCount: 'desc' }, take: 8,
      }) : Promise.resolve([]),
    ]);

    const seen = new Set<string>();
    const deduped = (arr: any[]) => arr.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

    let forYou = deduped(byCat);
    let fromFollowed = deduped(byCreator);
    let becauseYouLiked = deduped(similar);

    // ── Recommended Creators ──────────────────────────────────────────────
    // Creators active in the user's top categories that they don't already
    // follow — a "you might like these creators too" signal, distinct from
    // fromFollowed (which is about streams from creators already followed).
    let recommendedCreators: any[] = [];
    if (topCats.length) {
      const candidateCreatorIds = (await prisma.stream.findMany({
        where: { isPublic: true, categoryId: { in: topCats }, userId: { notIn: followedCreators.length ? followedCreators : ['__none__'] } },
        select: { userId: true },
        distinct: ['userId'],
        take: 20,
      })).map(s => s.userId).filter((id): id is string => !!id);

      if (candidateCreatorIds.length) {
        const creators = await prisma.user.findMany({
          where: { id: { in: candidateCreatorIds } },
          select: { id: true, name: true, username: true, avatarUrl: true, _count: { select: { followers: true, streams: true } } },
          orderBy: { followers: { _count: 'desc' } },
          take: 8,
        });
        recommendedCreators = creators.map(c => ({
          id: c.id, name: c.name, username: c.username, avatarUrl: c.avatarUrl,
          followerCount: c._count.followers, streamCount: c._count.streams,
        }));
      }
    }

    // ── Recommended Categories ────────────────────────────────────────────
    // The user's own top categories (by watch time), enriched with current
    // live counts — lets the client render "more of what you watch" category chips.
    let recommendedCategories: any[] = [];
    if (topCats.length) {
      const cats = await prisma.category.findMany({ where: { id: { in: topCats } } });
      const catById = new Map(cats.map(c => [c.id, c]));
      recommendedCategories = topCats.map(id => catById.get(id)).filter(Boolean);
    }

    // ── Recommended Replays ────────────────────────────────────────────────
    // Past (non-live) streams in the user's top categories that actually
    // have a saved recording — using the Recording relation (a stream can
    // have multiple recording segments) rather than the isRecording flag,
    // which means "currently actively recording," not "has a watchable
    // replay." Surfaces VOD content from the same signal driving forYou,
    // which only looked at currently-live streams.
    const recommendedReplays = topCats.length
      ? await prisma.stream.findMany({
          where: { isPublic: true, isLive: false, categoryId: { in: topCats }, recordings: { some: {} } },
          select: streamCardFields,
          orderBy: { peakViewers: 'desc' },
          take: 8,
        })
      : [];

    // ── Fallback for new users with no signals at all ─────────────────────
    // If every personalized list is empty (a brand-new account with no
    // watch history, no follows, no ratings), fall back to trending live
    // streams and trending creators instead of returning all-empty arrays,
    // per the "new user → trending" requirement.
    const hasAnySignal = forYou.length || fromFollowed.length || becauseYouLiked.length || recommendedCreators.length;
    let usedFallback = false;
    if (!hasAnySignal) {
      usedFallback = true;
      const [trendingStreams, trendingCreatorRows] = await Promise.all([
        prisma.stream.findMany({
          where: { isPublic: true, isLive: true },
          select: streamCardFields,
          orderBy: { viewerCount: 'desc' },
          take: 12,
        }),
        prisma.user.findMany({
          where: { role: { in: ['CREATOR', 'ADMIN'] } },
          select: { id: true, name: true, username: true, avatarUrl: true, _count: { select: { followers: true, streams: true } } },
          orderBy: { followers: { _count: 'desc' } },
          take: 8,
        }),
      ]);
      forYou = trendingStreams;
      recommendedCreators = trendingCreatorRows.map(c => ({
        id: c.id, name: c.name, username: c.username, avatarUrl: c.avatarUrl,
        followerCount: c._count.followers, streamCount: c._count.streams,
      }));
    }

    const result = {
      forYou,
      fromFollowed,
      becauseYouLiked,
      topCategories:  topCats,
      recommendedCreators,
      recommendedCategories,
      recommendedReplays,
      usedFallback,
    };
    await setCache(cacheKey, result, 120);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// ── AI Content Moderation ────────────────────────────────────────────────────
const TOXIC_PATTERNS = [
  /\b(hate|kill|die|idiot|moron|retard|nigger|faggot|cunt|bitch|slut|whore)\b/i,
];
const SPAM_PATTERNS = [
  /(.)\1{6,}/,           // repeated chars: "aaaaaaaa"
  /https?:\/\//gi,       // URLs (basic)
  /([A-Z]{5,})/,         // ALL CAPS streak
];

// POST /api/ai-features/moderate
router.post('/moderate', async (req, res) => {
  try {
    const { streamId, message, userId, nickname } = z.object({
      streamId: z.string(), message: z.string(),
      userId: z.string().optional(), nickname: z.string().optional(),
    }).parse(req.body);

    let action: 'allowed' | 'warned' | 'blocked' = 'allowed';
    let reason: string | undefined;
    let confidence = 0;

    for (const p of TOXIC_PATTERNS) {
      if (p.test(message)) { action = 'blocked'; reason = 'toxic_language'; confidence = 0.95; break; }
    }
    if (action === 'allowed') {
      for (const p of SPAM_PATTERNS) {
        if (p.test(message)) { action = 'warned'; reason = 'spam_pattern'; confidence = 0.75; break; }
      }
    }

    if (action !== 'allowed') {
      await prisma.aIModerationLog.create({ data: { streamId, message, userId, nickname, action, reason, confidence } });
    }

    res.json({ action, reason, confidence, filtered: action === 'blocked' ? '[message removed]' : message });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Moderation failed' });
  }
});

// GET /api/ai-features/moderation-log/:streamId
router.get('/moderation-log/:streamId', async (req, res) => {
  try {
    const logs = await prisma.aIModerationLog.findMany({
      where: { streamId: req.params.streamId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

// ── AI Clip & Reel Generator ─────────────────────────────────────────────────
// Pure heuristics on transcript/reaction data — no AI API call, no cost.
// Extracted into its own function so it can be triggered automatically when
// a stream ends (if the creator enabled "Auto Clips" in the wizard), as well
// as from the existing manual endpoint below. Behavior is unchanged either way.
export async function generateClipsForStream(roomId: string, requestedBy?: string) {
  const stream = await prisma.stream.findUnique({
    where: { roomId },
    include: {
      analyticsEvents: { where: { event: 'reaction' }, orderBy: { timestamp: 'asc' } },
      transcript: { include: { segments: { orderBy: { startMs: 'asc' } } } },
      clips: true,
      analytics: true,
    },
  });
  if (!stream) return null;

  // Group reaction events into buckets by minute to find engagement peaks
  const buckets = new Map<number, number>();
  for (const ev of stream.analyticsEvents) {
    const minuteBucket = Math.floor((new Date(ev.timestamp).getTime() - (stream.goneLiveAt ? new Date(stream.goneLiveAt).getTime() : 0)) / 60000);
    buckets.set(minuteBucket, (buckets.get(minuteBucket) ?? 0) + 1);
  }

  // Pick top-3 engagement peaks as suggested clip windows
  const peaks = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([min, count]) => ({
      startSec: Math.max(0, (min - 1) * 60),
      endSec: (min + 1) * 60,
      engagementScore: count,
      suggestedTitle: `Highlight at ${min}m`,
    }));

  // If no analytics data, generate evenly spaced highlights as fallback
  if (peaks.length === 0 && stream.analytics) {
    const dur = stream.analytics.durationSeconds;
    if (dur > 120) {
      for (let i = 0; i < 3; i++) {
        const start = Math.floor((dur / 4) * (i + 1) - 30);
        peaks.push({ startSec: Math.max(0, start), endSec: start + 60, engagementScore: 0, suggestedTitle: `Clip ${i + 1}` });
      }
    }
  }

  // Create clip records in DB for the suggested windows
  const created = await Promise.all(peaks.map(p =>
    prisma.streamClip.create({
      data: { streamId: stream.id, title: p.suggestedTitle, startSec: p.startSec, endSec: p.endSec, status: 'suggested', createdBy: requestedBy ?? 'ai' },
    })
  ));

  return created.map((c, i) => ({ ...c, engagementScore: peaks[i]?.engagementScore ?? 0 }));
}

// POST /api/ai-features/generate-clips/:streamId
// Uses heuristics on transcript segments (high engagement moments) to suggest clip timestamps.
router.post('/generate-clips/:streamId', async (req, res) => {
  try {
    const { requestedBy } = z.object({ requestedBy: z.string().optional() }).parse(req.body);
    const clips = await generateClipsForStream(req.params.streamId, requestedBy);
    if (clips === null) return res.status(404).json({ error: 'Stream not found' });
    res.json({ clips });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate clips' });
  }
});

export default router;
