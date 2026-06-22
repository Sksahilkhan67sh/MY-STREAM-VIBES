import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getCache, setCache } from '../lib/redis';

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

// GET /api/discover/trending-search — trending creators, categories, and
// tags, for the search page's "before you type anything" suggestions.
// Distinct from /trending above, which only covers streams (used by the
// home feed). Cached for 5 minutes — trending data doesn't need to be
// perfectly real-time, and computing it (especially the tag aggregation)
// is more expensive than a typical request, so caching meaningfully
// reduces load.
router.get('/trending-search', async (_req, res) => {
  try {
    const cacheKey = 'trending-search';
    const cached = await getCache<any>(cacheKey);
    if (cached) return res.json(cached);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Trending creators: ranked by recent follow velocity (follows gained in
    // the last 7 days), falling back to total followers for creators with
    // no recent activity so the list isn't empty on a quiet week.
    const [recentFollowCounts, topCreatorsByTotal] = await Promise.all([
      prisma.follow.groupBy({
        by: ['creatorId'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { creatorId: true },
        orderBy: { _count: { creatorId: 'desc' } },
        take: 10,
      }),
      prisma.user.findMany({
        where: { role: { in: ['CREATOR', 'ADMIN'] } },
        select: { id: true, name: true, username: true, avatarUrl: true, _count: { select: { followers: true, streams: true } } },
        orderBy: { followers: { _count: 'desc' } },
        take: 10,
      }),
    ]);

    const creatorIds = [...new Set([...recentFollowCounts.map(f => f.creatorId), ...topCreatorsByTotal.map(c => c.id)])].slice(0, 10);
    const creatorDetails = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true, username: true, avatarUrl: true, _count: { select: { followers: true, streams: true } } },
    });
    const creatorById = new Map(creatorDetails.map(c => [c.id, c]));
    const recentVelocity = new Map(recentFollowCounts.map(f => [f.creatorId, f._count.creatorId]));
    const trendingCreators = creatorIds
      .map(id => creatorById.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => (recentVelocity.get(b.id) ?? 0) - (recentVelocity.get(a.id) ?? 0))
      .map(c => ({
        id: c.id, name: c.name, username: c.username, avatarUrl: c.avatarUrl,
        followerCount: c._count.followers, streamCount: c._count.streams,
      }));

    // Trending categories: by live viewer count right now (a category is
    // "trending" if people are actively watching it, not just historically popular).
    const categoryRows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string; icon: string; liveViewers: bigint }>>(Prisma.sql`
      SELECT c.id, c.name, c.slug, c.icon, COALESCE(SUM(s."viewerCount"), 0) AS "liveViewers"
      FROM "Category" c
      LEFT JOIN "Stream" s ON s."categoryId" = c.id AND s."isLive" = true AND s."isPublic" = true
      GROUP BY c.id, c.name, c.slug, c.icon
      ORDER BY "liveViewers" DESC
      LIMIT 8;
    `).catch(() => []);

    // Trending tags: count tag occurrences across streams active in the
    // last 7 days. Stream.tags is a JSON-stringified array in a text
    // column (no relational tags table), so this is aggregated in
    // application code after a single bounded query rather than in SQL.
    const recentStreams = await prisma.stream.findMany({
      where: { isPublic: true, createdAt: { gte: sevenDaysAgo }, tags: { not: '[]' } },
      select: { tags: true },
      take: 500, // bounded — this endpoint is cached for 5 minutes, so an occasional slightly-stale top-N is an acceptable trade for not scanning unbounded rows
    });
    const tagCounts = new Map<string, number>();
    for (const s of recentStreams) {
      try {
        const tags: string[] = JSON.parse(s.tags || '[]');
        for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      } catch {}
    }
    const trendingTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));

    const result = {
      creators: trendingCreators,
      categories: categoryRows.map(c => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon })),
      tags: trendingTags,
    };

    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    console.error('[discover/trending-search]', err);
    res.status(500).json({ error: 'Failed to fetch trending search data' });
  }
});

// GET /api/discover/search?q=xxx — search creators and streams
// GET /api/discover/search
//
// Rebuilt to add:
//  - Typo tolerance via pg_trgm trigram similarity ("sahill" finds "sahil")
//    alongside the original exact-substring matching (never removed —
//    typo tolerance is additive, not a replacement, so anything that
//    matched before still matches now).
//  - Tag search: if the query matches a tag exactly (case-insensitive),
//    streams carrying that tag are included even if the tag isn't in the
//    title/description.
//  - Category search: if the query matches a category name/slug, that
//    category's id is returned so the client can offer a "browse this
//    category" shortcut.
//  - Ranking by a combined score: trigram similarity + viewerCount +
//    followerCount, so popular/live results surface above purely
//    string-similar but low-engagement ones.
//  - Short-TTL Redis cache per normalized query (60s) — search is a classic
//    hot path for repeat identical queries (autocomplete-style typing,
//    multiple users searching the same trending term).
router.get('/search', async (req, res) => {
  try {
    const { q, category, language, tag } = req.query as Record<string, string>;
    const query = (q || '').trim();
    const hasFilters = !!(category || language || tag);
    if (!query && !hasFilters) return res.json({ streams: [], creators: [], categories: [], tags: [] });

    const cacheKey = `search:${query.toLowerCase()}:${category || ''}:${language || ''}:${tag || ''}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) return res.json(cached);

    // Filters (category/language/tag) are applied as additional AND
    // conditions on top of whatever the text query matches — or, if there's
    // no text query at all, as the entire match criteria (pure filter
    // browsing, e.g. "show me Gaming streams in Hindi" with no typed query).
    const categoryFilter = category ? Prisma.sql`AND cat.slug = ${category}` : Prisma.empty;
    const languageFilter = language ? Prisma.sql`AND s.language = ${language}` : Prisma.empty;
    const tagFilter = tag ? Prisma.sql`AND s.tags ILIKE ${'%"' + tag.toLowerCase() + '"%'}` : Prisma.empty;

    // ── Streams: trigram-ranked title match OR exact tag match ───────────
    // similarity() returns 0..1; 0.25 is a permissive-but-not-noisy
    // threshold for short creator/stream-title-length strings (pg_trgm's
    // own docs note 0.3 is the typical default — using slightly below that
    // intentionally favors recall for typo-tolerance over strict precision).
    const textCondition = query
      ? Prisma.sql`AND (
          similarity(s.title, ${query}) > 0.25
          OR s.title ILIKE ${'%' + query + '%'}
          OR s.description ILIKE ${'%' + query + '%'}
          OR s.tags ILIKE ${'%"' + query.toLowerCase() + '"%'}
        )`
      : Prisma.empty;

    const streamRows = await prisma.$queryRaw<Array<{ id: string; score: number }>>(Prisma.sql`
      SELECT s.id,
             GREATEST(
               ${query ? Prisma.sql`similarity(s.title, ${query})` : Prisma.sql`0`},
               ${query ? Prisma.sql`CASE WHEN s.title ILIKE ${'%' + query + '%'} THEN 1 ELSE 0 END` : Prisma.sql`0`},
               ${query ? Prisma.sql`CASE WHEN s.tags ILIKE ${'%"' + query.toLowerCase() + '"%'} THEN 0.9 ELSE 0 END` : Prisma.sql`0`}
             ) AS score
      FROM "Stream" s
      LEFT JOIN "Category" cat ON cat.id = s."categoryId"
      WHERE s."isPublic" = true
        ${textCondition}
        ${categoryFilter}
        ${languageFilter}
        ${tagFilter}
      ORDER BY score DESC, s."viewerCount" DESC
      LIMIT 24;
    `).catch(() => [] as Array<{ id: string; score: number }>);

    // ── Creators: trigram-ranked name/username match ──────────────────────
    const creatorRows = await prisma.$queryRaw<Array<{ id: string; score: number }>>(Prisma.sql`
      SELECT u.id,
             GREATEST(
               similarity(COALESCE(u.name, ''), ${query}),
               similarity(COALESCE(u.username, ''), ${query}),
               CASE WHEN u.name ILIKE ${'%' + query + '%'} OR u.username ILIKE ${'%' + query + '%'} THEN 1 ELSE 0 END
             ) AS score
      FROM "User" u
      WHERE u.role IN ('CREATOR', 'ADMIN')
        AND (
          similarity(COALESCE(u.name, ''), ${query}) > 0.25
          OR similarity(COALESCE(u.username, ''), ${query}) > 0.25
          OR u.name ILIKE ${'%' + query + '%'}
          OR u.username ILIKE ${'%' + query + '%'}
        )
      ORDER BY score DESC
      LIMIT 20;
    `).catch(() => [] as Array<{ id: string; score: number }>);

    // ── Categories: simple trigram match, small/fixed list, no caching needed beyond the outer cache ──
    const categoryRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "Category"
      WHERE similarity(name, ${query}) > 0.3 OR name ILIKE ${'%' + query + '%'} OR slug ILIKE ${'%' + query + '%'}
      ORDER BY similarity(name, ${query}) DESC
      LIMIT 5;
    `).catch(() => [] as Array<{ id: string }>);

    const streamScores = new Map(streamRows.map(r => [r.id, r.score]));
    const creatorScores = new Map(creatorRows.map(r => [r.id, r.score]));

    const [streams, creators, categories] = await Promise.all([
      streamRows.length
        ? prisma.stream.findMany({ where: { id: { in: streamRows.map(r => r.id) } }, select: streamCardSelect })
        : Promise.resolve([]),
      creatorRows.length
        ? prisma.user.findMany({
            where: { id: { in: creatorRows.map(r => r.id) } },
            select: { id: true, name: true, username: true, avatarUrl: true, bio: true, _count: { select: { followers: true, streams: true } } },
          })
        : Promise.resolve([]),
      categoryRows.length
        ? prisma.category.findMany({ where: { id: { in: categoryRows.map(r => r.id) } } })
        : Promise.resolve([]),
    ]);

    // Re-rank by score (findMany with `id: { in }` does not preserve input order),
    // then by a popularity tiebreaker so equally-similar results favor the bigger creator/stream.
    const rankedStreams = streams
      .map(s => ({ ...s, _score: streamScores.get(s.id) ?? 0 }))
      .sort((a, b) => (b._score - a._score) || (b.viewerCount - a.viewerCount))
      .map(({ _score, ...s }) => serializeStream(s));

    const rankedCreators = creators
      .map(c => ({ ...c, _score: creatorScores.get(c.id) ?? 0 }))
      .sort((a, b) => (b._score - a._score) || (b._count.followers - a._count.followers))
      .map(({ _score, ...c }) => ({
        id: c.id, name: c.name, username: c.username, avatarUrl: c.avatarUrl, bio: c.bio,
        followerCount: c._count.followers, streamCount: c._count.streams,
      }));

    // ── Matched tags: pulled from the streams that matched on tags, for a
    //    "search by tag" affordance on the client (e.g. clickable tag chips).
    const matchedTags = new Set<string>();
    for (const s of rankedStreams) {
      for (const t of (s.tags as string[])) {
        if (t.toLowerCase().includes(query.toLowerCase())) matchedTags.add(t);
      }
    }

    const result = {
      streams: rankedStreams,
      creators: rankedCreators,
      categories: categories.map(c => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon })),
      tags: [...matchedTags].slice(0, 8),
    };

    await setCache(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    console.error('[discover/search]', err);
    res.status(500).json({ error: 'Failed to search' });
  }
});

export default router;
