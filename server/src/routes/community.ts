import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

const postSelect = {
  id: true, userId: true, type: true, body: true, imageUrl: true,
  isPinned: true, likeCount: true, createdAt: true, updatedAt: true,
  pollOptions: { select: { id: true, text: true, voteCount: true } },
  _count: { select: { comments: true, likes: true } },
};

// GET /api/community/:userId/posts — get a creator's posts feed
router.get('/:userId/posts', async (req, res) => {
  try {
    const viewerId = req.query.viewerId as string | undefined;
    const posts = await prisma.communityPost.findMany({
      where: { userId: req.params.userId, isPublished: true },
      select: postSelect,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    });

    // Check which posts the viewer has liked
    let likedIds = new Set<string>();
    let votedOptionIds = new Set<string>();
    if (viewerId) {
      const [likes, votes] = await Promise.all([
        prisma.communityLike.findMany({ where: { userId: viewerId, postId: { in: posts.map(p => p.id) } }, select: { postId: true } }),
        prisma.communityPollVote.findMany({ where: { userId: viewerId, optionId: { in: posts.flatMap(p => p.pollOptions.map(o => o.id)) } }, select: { optionId: true } }),
      ]);
      likedIds = new Set(likes.map(l => l.postId));
      votedOptionIds = new Set(votes.map(v => v.optionId));
    }

    res.json({
      posts: posts.map(p => ({
        ...p,
        isLiked: likedIds.has(p.id),
        pollOptions: p.pollOptions.map(o => ({ ...o, isVoted: votedOptionIds.has(o.id) })),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

const PostSchema = z.object({
  userId: z.string(),
  type: z.enum(['text', 'poll', 'image', 'announcement']).default('text'),
  body: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional(),
  pollOptions: z.array(z.string().min(1).max(100)).max(6).optional(),
});

// POST /api/community/posts
router.post('/posts', async (req, res) => {
  try {
    const data = PostSchema.parse(req.body);
    const post = await prisma.communityPost.create({
      data: {
        userId: data.userId, type: data.type, body: data.body,
        imageUrl: data.imageUrl,
        pollOptions: data.pollOptions?.length
          ? { create: data.pollOptions.map(text => ({ text })) }
          : undefined,
      },
      select: postSelect,
    });
    res.json(post);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// DELETE /api/community/posts/:id
router.delete('/posts/:id', async (req, res) => {
  try {
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    await prisma.communityPost.deleteMany({ where: { id: req.params.id, userId } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// POST /api/community/posts/:id/pin
router.post('/posts/:id/pin', async (req, res) => {
  try {
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const post = await prisma.communityPost.findFirst({ where: { id: req.params.id, userId } });
    if (!post) return res.status(404).json({ error: 'Not found' });
    // Unpin any existing pinned post first
    await prisma.communityPost.updateMany({ where: { userId, isPinned: true }, data: { isPinned: false } });
    const updated = await prisma.communityPost.update({ where: { id: req.params.id }, data: { isPinned: !post.isPinned }, select: postSelect });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to pin post' });
  }
});

// POST /api/community/posts/:id/like
router.post('/posts/:id/like', async (req, res) => {
  try {
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const existing = await prisma.communityLike.findUnique({ where: { postId_userId: { postId: req.params.id, userId } } });
    if (existing) {
      await prisma.communityLike.delete({ where: { postId_userId: { postId: req.params.id, userId } } });
      await prisma.communityPost.update({ where: { id: req.params.id }, data: { likeCount: { decrement: 1 } } });
      return res.json({ liked: false });
    }
    await prisma.communityLike.create({ data: { postId: req.params.id, userId } });
    await prisma.communityPost.update({ where: { id: req.params.id }, data: { likeCount: { increment: 1 } } });
    res.json({ liked: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// POST /api/community/polls/:optionId/vote
router.post('/polls/:optionId/vote', async (req, res) => {
  try {
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const option = await prisma.communityPollOption.findUnique({ where: { id: req.params.optionId } });
    if (!option) return res.status(404).json({ error: 'Option not found' });

    const existing = await prisma.communityPollVote.findUnique({ where: { optionId_userId: { optionId: req.params.optionId, userId } } });
    if (existing) return res.status(409).json({ error: 'Already voted' });

    await prisma.communityPollVote.create({ data: { optionId: req.params.optionId, userId } });
    await prisma.communityPollOption.update({ where: { id: req.params.optionId }, data: { voteCount: { increment: 1 } } });
    res.json({ voted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// GET /api/community/posts/:id/comments
router.get('/posts/:id/comments', async (req, res) => {
  try {
    const comments = await prisma.communityComment.findMany({
      where: { postId: req.params.id },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/community/posts/:id/comments
router.post('/posts/:id/comments', async (req, res) => {
  try {
    const { userId, body } = z.object({ userId: z.string(), body: z.string().min(1).max(500) }).parse(req.body);
    const comment = await prisma.communityComment.create({ data: { postId: req.params.id, userId, body } });
    res.json(comment);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to comment' });
  }
});

export default router;
