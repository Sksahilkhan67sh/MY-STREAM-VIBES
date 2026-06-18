import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Public-facing stream card shape — only fields safe to expose to anonymous browsers.
const streamCardSelect = {
  id: true,
  roomId: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  isLive: true,
  isPPV: true,
  ppvPrice: true,
  viewerCount: true,
  peakViewers: true,
  language: true,
  country: true,
  tags: true,
  scheduledAt: true,
  goneLiveAt: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true, icon: true } },
  user: { select: { id: true, name: true, username: true, avatarUrl: true } },
};

function serializeStream(s: any) {
  return {
    ...s,
    tags: (() => { try { return JSON.parse(s.tags || '[]'); } catch { return []; } })(),
  };
}

// GET /api/discover/categories — list all categories with live counts
router.get('/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    const counts = await prisma.stream.groupBy({
      by: ['categoryId'],
      where: { isLive: true, isPublic: true },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map(c => [c.categoryId, c._count._all]));
    res.json({
      categories: categories.map(c => ({ ...c, liveCount: countMap.get(c.id) || 0 })),
    });
  } catch (err) {
    console.error('[discover/categories]', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/discover/live — all currently active public streams, filterable
// query: category(slug), language, live(=true default), minViewers, free(=true/false), page, limit
router.get('/live', async (req, res) => {
  try {
    const {
      category, language, minViewers, free, page = '1', limit = '24', sort = 'viewers',
    } = req.query as Record<string, string>;

    const where: any = { isPublic: true };
    where.isLive = true;
    if (category) where.category = { slug: category };
    if (language) where.language = language;
    if (free === 'true') where.isPPV = false;
    if (free === 'false') where.isPPV = true;
    if (minViewers) where.viewerCount = { gte: parseInt(minViewers, 10) || 0 };

    const orderBy =
      sort === 'newest' ? { goneLiveAt: 'desc' as const } : { viewerCount: 'desc' as const };

    const take = Math.min(parseInt(limit, 10) || 24, 50);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [streams, total] = await Promise.all([
      prisma.stream.findMany({ where, select: streamCardSelect, orderBy, take, skip }),
      prisma.stream.count({ where }),
    ]);

    res.json({ streams: streams.map(serializeStream), total, page: parseInt(page, 10) || 1 });
  } catch (err) {
    console.error('[discover/live]', err);
    res.status(500).json({ error: 'Failed to fetch live streams' });
  }
});

// GET /api/discover/trending — most viewed, fastest growing, trending in country
router.get('/trending', async (req, res) => {
  try {
    const { country } = req.query as Record<string, string>;

    const mostViewed = await prisma.stream.findMany({
      where: { isLive: true, isPublic: true },
      select: streamCardSelect,
      orderBy: { viewerCount: 'desc' },
      take: 12,
    });

    // "Fastest growing" — approximate using viewerCount vs peakViewers ratio
    // and recency of going live (newer + high current viewers relative to peak = growing).
    const recentlyLive = await prisma.stream.findMany({
      where: { isLive: true, isPublic: true, viewerCount: { gt: 0 } },
      select: { ...streamCardSelect, goneLiveAt: true },
      orderBy: { goneLiveAt: 'desc' },
      take: 50,
    });
    const fastestGrowing = recentlyLive
      .map(s => {
        const minsLive = s.goneLiveAt ? Math.max(1, (Date.now() - new Date(s.goneLiveAt).getTime()) / 60000) : 60;
        return { stream: s, growthRate: s.viewerCount / minsLive };
      })
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 12)
      .map(x => x.stream);

    let trendingInCountry: any[] = [];
    if (country) {
      trendingInCountry = await prisma.stream.findMany({
        where: { isLive: true, isPublic: true, country },
        select: streamCardSelect,
        orderBy: { viewerCount: 'desc' },
        take: 12,
      });
    }

    res.json({
      mostViewed: mostViewed.map(serializeStream),
      fastestGrowing: fastestGrowing.map(serializeStream),
      trendingInCountry: trendingInCountry.map(serializeStream),
    });
  } catch (err) {
    console.error('[discover/trending]', err);
    res.status(500).json({ error: 'Failed to fetch trending streams' });
  }
});

// GET /api/discover/recommended?userId=xxx — based on watch history, follows, top categories
router.get('/recommended', async (req, res) => {
  try {
    const { userId } = req.query as Record<string, string>;
    if (!userId) {
      // Anonymous fallback — just return popular live streams.
      const streams = await prisma.stream.findMany({
        where: { isLive: true, isPublic: true },
        select: streamCardSelect,
        orderBy: { viewerCount: 'desc' },
        take: 12,
      });
      return res.json({ streams: streams.map(serializeStream), basis: 'popular' });
    }

    const [history, follows] = await Promise.all([
      prisma.watchHistory.findMany({
        where: { userId },
        include: { stream: { select: { categoryId: true } } },
        orderBy: { lastWatchedAt: 'desc' },
        take: 50,
      }),
      prisma.follow.findMany({ where: { followerId: userId }, select: { creatorId: true } }),
    ]);

    const categoryFreq = new Map<string, number>();
    for (const h of history) {
      if (h.stream.categoryId) {
        categoryFreq.set(h.stream.categoryId, (categoryFreq.get(h.stream.categoryId) || 0) + 1);
      }
    }
    const topCategoryIds = [...categoryFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    const followedCreatorIds = follows.map(f => f.creatorId);

    const where: any = {
      isLive: true,
      isPublic: true,
      OR: [
        ...(topCategoryIds.length ? [{ categoryId: { in: topCategoryIds } }] : []),
        ...(followedCreatorIds.length ? [{ userId: { in: followedCreatorIds } }] : []),
      ],
    };

    let streams;
    let basis = 'personalized';
    if (where.OR.length === 0) {
      streams = await prisma.stream.findMany({
        where: { isLive: true, isPublic: true },
        select: streamCardSelect,
        orderBy: { viewerCount: 'desc' },
        take: 12,
      });
      basis = 'popular';
    } else {
      streams = await prisma.stream.findMany({ where, select: streamCardSelect, orderBy: { viewerCount: 'desc' }, take: 12 });
    }

    res.json({ streams: streams.map(serializeStream), basis });
  } catch (err) {
    console.error('[discover/recommended]', err);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// GET /api/discover/search?q=xxx — search creators and streams
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query as Record<string, string>;
    if (!q || q.trim().length === 0) return res.json({ streams: [], creators: [] });
    const query = q.trim();

    const [streams, creators] = await Promise.all([
      prisma.stream.findMany({
        where: {
          isPublic: true,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { user: { name: { contains: query, mode: 'insensitive' } } },
            { user: { username: { contains: query, mode: 'insensitive' } } },
          ],
        },
        select: streamCardSelect,
        orderBy: { viewerCount: 'desc' },
        take: 24,
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, name: true, username: true, avatarUrl: true, bio: true,
          _count: { select: { followers: true, streams: true } },
        },
        take: 12,
      }),
    ]);

    res.json({
      streams: streams.map(serializeStream),
      creators: creators.map(c => ({
        id: c.id, name: c.name, username: c.username, avatarUrl: c.avatarUrl, bio: c.bio,
        followerCount: c._count.followers, streamCount: c._count.streams,
      })),
    });
  } catch (err) {
    console.error('[discover/search]', err);
    res.status(500).json({ error: 'Failed to search' });
  }
});

export default router;
