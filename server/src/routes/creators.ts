import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

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
  return { ...s, tags: (() => { try { return JSON.parse(s.tags || '[]'); } catch { return []; } })() };
}

// GET /api/creators/:idOrUsername — public creator profile
router.get('/:idOrUsername', async (req, res) => {
  try {
    const { idOrUsername } = req.params;
    const { viewerId } = req.query as Record<string, string>;

    const creator = await prisma.user.findFirst({
      where: { OR: [{ id: idOrUsername }, { username: idOrUsername }] },
      select: {
        id: true, name: true, username: true, avatarUrl: true, bannerUrl: true, bio: true,
        socialLinks: true, createdAt: true,
        _count: { select: { followers: true } },
      },
    });
    if (!creator) return res.status(404).json({ error: 'Creator not found' });

    const [liveStreams, upcomingStreams, pastStreams, isFollowing] = await Promise.all([
      prisma.stream.findMany({
        where: { userId: creator.id, isLive: true, isPublic: true },
        select: streamCardSelect,
      }),
      prisma.stream.findMany({
        where: { userId: creator.id, isPublic: true, scheduledAt: { gt: new Date() } },
        select: streamCardSelect,
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      }),
      prisma.stream.findMany({
        where: { userId: creator.id, isPublic: true, isLive: false, scheduledAt: null },
        select: streamCardSelect,
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      viewerId
        ? prisma.follow.findUnique({ where: { followerId_creatorId: { followerId: viewerId, creatorId: creator.id } } })
        : Promise.resolve(null),
    ]);

    res.json({
      id: creator.id,
      name: creator.name,
      username: creator.username,
      avatarUrl: creator.avatarUrl,
      bannerUrl: creator.bannerUrl,
      bio: creator.bio,
      socialLinks: creator.socialLinks || {},
      followerCount: creator._count.followers,
      isFollowing: !!isFollowing,
      liveStreams: liveStreams.map(serializeStream),
      upcomingStreams: upcomingStreams.map(serializeStream),
      pastStreams: pastStreams.map(serializeStream),
    });
  } catch (err) {
    console.error('[creators/:id]', err);
    res.status(500).json({ error: 'Failed to fetch creator profile' });
  }
});

const UpdateProfileSchema = z.object({
  userId:      z.string(),
  username:    z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  name:        z.string().min(1).max(60).optional(),
  bio:         z.string().max(280).optional(),
  avatarUrl:   z.string().url().optional(),
  bannerUrl:   z.string().url().optional(),
  socialLinks: z.record(z.string()).optional(),
});

// PATCH /api/creators/profile — update own creator profile
router.patch('/profile', async (req, res) => {
  try {
    const data = UpdateProfileSchema.parse(req.body);
    if (data.username) {
      const taken = await prisma.user.findFirst({
        where: { username: data.username, NOT: { id: data.userId } },
      });
      if (taken) return res.status(409).json({ error: 'Username already taken' });
    }
    const updated = await prisma.user.update({
      where: { id: data.userId },
      data: {
        ...(data.username && { username: data.username }),
        ...(data.name && { name: data.name }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.avatarUrl && { avatarUrl: data.avatarUrl }),
        ...(data.bannerUrl && { bannerUrl: data.bannerUrl }),
        ...(data.socialLinks && { socialLinks: data.socialLinks }),
      },
      select: { id: true, name: true, username: true, avatarUrl: true, bannerUrl: true, bio: true, socialLinks: true },
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[creators/profile]', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

const FollowSchema = z.object({
  followerId: z.string(),
  creatorId:  z.string(),
  notifyOnLive: z.boolean().optional(),
});

// POST /api/creators/follow
router.post('/follow', async (req, res) => {
  try {
    const data = FollowSchema.parse(req.body);
    if (data.followerId === data.creatorId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    const follow = await prisma.follow.upsert({
      where: { followerId_creatorId: { followerId: data.followerId, creatorId: data.creatorId } },
      update: { notifyOnLive: data.notifyOnLive ?? true },
      create: {
        followerId: data.followerId,
        creatorId: data.creatorId,
        notifyOnLive: data.notifyOnLive ?? true,
      },
    });
    const followerCount = await prisma.follow.count({ where: { creatorId: data.creatorId } });
    res.json({ following: true, follow, followerCount });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[creators/follow]', err);
    res.status(500).json({ error: 'Failed to follow creator' });
  }
});

// DELETE /api/creators/follow — unfollow
router.delete('/follow', async (req, res) => {
  try {
    const data = FollowSchema.pick({ followerId: true, creatorId: true }).parse(req.body);
    await prisma.follow.deleteMany({ where: { followerId: data.followerId, creatorId: data.creatorId } });
    const followerCount = await prisma.follow.count({ where: { creatorId: data.creatorId } });
    res.json({ following: false, followerCount });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[creators/unfollow]', err);
    res.status(500).json({ error: 'Failed to unfollow creator' });
  }
});

// GET /api/creators/following/:userId — creators a user follows, with live status (for "Following" rail + notifications)
router.get('/following/:userId', async (req, res) => {
  try {
    const follows = await prisma.follow.findMany({
      where: { followerId: req.params.userId },
      include: {
        creator: {
          select: {
            id: true, name: true, username: true, avatarUrl: true,
            streams: {
              where: { isLive: true, isPublic: true },
              select: { roomId: true, title: true, viewerCount: true, thumbnailUrl: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      following: follows.map(f => ({
        creatorId: f.creator.id,
        name: f.creator.name,
        username: f.creator.username,
        avatarUrl: f.creator.avatarUrl,
        notifyOnLive: f.notifyOnLive,
        isLive: f.creator.streams.length > 0,
        liveStream: f.creator.streams[0] || null,
      })),
    });
  } catch (err) {
    console.error('[creators/following]', err);
    res.status(500).json({ error: 'Failed to fetch following list' });
  }
});

export default router;
