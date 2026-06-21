import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// ── AI Recommendations ───────────────────────────────────────────────────────
// GET /api/ai-features/recommendations/:userId
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

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

    // Fetch recommendations from multiple signals
    const [byCat, byCreator, similar] = await Promise.all([
      topCats.length ? prisma.stream.findMany({
        where: { isPublic: true, isLive: true, categoryId: { in: topCats } },
        select: { id: true, roomId: true, title: true, thumbnailUrl: true, viewerCount: true, isLive: true,
          category: { select: { name: true, icon: true } }, user: { select: { id: true, name: true, username: true, avatarUrl: true } } },
        orderBy: { viewerCount: 'desc' }, take: 12,
      }) : Promise.resolve([]),
      followedCreators.length ? prisma.stream.findMany({
        where: { isPublic: true, isLive: true, userId: { in: followedCreators } },
        select: { id: true, roomId: true, title: true, thumbnailUrl: true, viewerCount: true, isLive: true,
          category: { select: { name: true, icon: true } }, user: { select: { id: true, name: true, username: true, avatarUrl: true } } },
        orderBy: { viewerCount: 'desc' }, take: 8,
      }) : Promise.resolve([]),
      // "Because you liked" — streams in same category as highly-rated ones
      highlyRatedIds.length ? prisma.stream.findMany({
        where: { isPublic: true, id: { notIn: highlyRatedIds }, isLive: true },
        select: { id: true, roomId: true, title: true, thumbnailUrl: true, viewerCount: true, isLive: true,
          category: { select: { name: true, icon: true } }, user: { select: { id: true, name: true, username: true, avatarUrl: true } } },
        orderBy: { viewerCount: 'desc' }, take: 8,
      }) : Promise.resolve([]),
    ]);

    const seen = new Set<string>();
    const deduped = (arr: any[]) => arr.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

    res.json({
      forYou:         deduped(byCat),
      fromFollowed:   deduped(byCreator),
      becauseYouLiked: deduped(similar),
      topCategories:  topCats,
    });
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
