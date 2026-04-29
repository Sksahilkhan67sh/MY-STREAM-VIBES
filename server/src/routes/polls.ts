import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getIo } from '../lib/socket';
import prisma from '../lib/prisma';

const router = Router();

const CreatePollSchema = z.object({
  roomId: z.string(),
  hostToken: z.string(),
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(100)).min(2).max(6),
  duration: z.number().min(10).max(300).default(60),
});

// ── POST /api/polls — create poll ────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = CreatePollSchema.parse(req.body);

    const stream = await prisma.stream.findUnique({ where: { roomId: data.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== data.hostToken) return res.status(403).json({ error: 'Unauthorized' });

    // Close existing active polls
    await prisma.poll.updateMany({
      where: { streamId: stream.id, status: 'active' },
      data: { status: 'closed' },
    });

    const endsAt = new Date(Date.now() + data.duration * 1000);

    const poll = await prisma.poll.create({
      data: {
        streamId: stream.id,
        question: data.question,
        options: JSON.stringify(data.options),
        votes: JSON.stringify(new Array(data.options.length).fill(0)),
        status: 'active',
        endsAt,
      },
    });

    const pollData = {
      id: poll.id,
      question: poll.question,
      options: JSON.parse(poll.options as string),
      votes: JSON.parse(poll.votes as string),
      status: poll.status,
      endsAt: poll.endsAt,
      totalVotes: 0,
    };

    getIo()?.to(data.roomId).emit('poll-created', pollData);

    // Auto-close after duration
    setTimeout(async () => {
      try {
        await prisma.poll.update({ where: { id: poll.id }, data: { status: 'closed' } });
        const updated = await prisma.poll.findUnique({ where: { id: poll.id } });
        if (updated) {
          const votes = JSON.parse(updated.votes as string) as number[];
          getIo()?.to(data.roomId).emit('poll-closed', {
            id: poll.id, votes,
            totalVotes: votes.reduce((a: number, b: number) => a + b, 0),
          });
        }
      } catch (e) { console.error('Auto-close error:', e); }
    }, data.duration * 1000);

    res.json(pollData);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Poll create error:', err);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// ── POST /api/polls/:id/vote ──────────────────────────────────
router.post('/:id/vote', async (req: Request, res: Response) => {
  try {
    const { optionIndex, voterId, roomId } = req.body;
    if (typeof optionIndex !== 'number' || !voterId) {
      return res.status(400).json({ error: 'Invalid vote data' });
    }

    const poll = await prisma.poll.findUnique({
      where: { id: req.params.id },
      include: { stream: true },
    });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.status !== 'active') return res.status(400).json({ error: 'Poll is closed' });
    if (poll.endsAt && new Date() > poll.endsAt) {
      return res.status(400).json({ error: 'Poll has expired' });
    }

    const existing = await prisma.pollVote.findUnique({
      where: { pollId_voterId: { pollId: poll.id, voterId } },
    });
    if (existing) return res.status(400).json({ error: 'Already voted' });

    const options = JSON.parse(poll.options as string) as string[];
    if (optionIndex >= options.length) return res.status(400).json({ error: 'Invalid option' });

    await prisma.pollVote.create({ data: { pollId: poll.id, voterId, optionIndex } });

    const votes = JSON.parse(poll.votes as string) as number[];
    votes[optionIndex] = (votes[optionIndex] || 0) + 1;
    await prisma.poll.update({ where: { id: poll.id }, data: { votes: JSON.stringify(votes) } });

    const totalVotes = votes.reduce((a: number, b: number) => a + b, 0);
    const rId = roomId || poll.stream.roomId;
    getIo()?.to(rId).emit('poll-updated', { id: poll.id, votes, totalVotes });

    res.json({ success: true, votes, totalVotes });
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// ── GET /api/polls/:roomId/active ─────────────────────────────
router.get('/:roomId/active', async (req: Request, res: Response) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const poll = await prisma.poll.findFirst({
      where: { streamId: stream.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!poll) return res.json(null);

    const votes = JSON.parse(poll.votes as string) as number[];
    res.json({
      id: poll.id,
      question: poll.question,
      options: JSON.parse(poll.options as string),
      votes, status: poll.status, endsAt: poll.endsAt,
      totalVotes: votes.reduce((a: number, b: number) => a + b, 0),
    });
  } catch (err) {
    console.error('Active poll error:', err);
    res.status(500).json({ error: 'Failed to get poll' });
  }
});

// ── GET /api/polls/:roomId/history ────────────────────────────
router.get('/:roomId/history', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const polls = await prisma.poll.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(polls.map(p => {
      const votes = JSON.parse(p.votes as string) as number[];
      return {
        id: p.id, question: p.question,
        options: JSON.parse(p.options as string),
        votes, status: p.status, endsAt: p.endsAt,
        totalVotes: votes.reduce((a: number, b: number) => a + b, 0),
        createdAt: p.createdAt,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to get poll history' });
  }
});

// ── PATCH /api/polls/:id/close ────────────────────────────────
router.patch('/:id/close', async (req: Request, res: Response) => {
  try {
    const { hostToken, roomId } = req.body;
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.id },
      include: { stream: true },
    });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    if (poll.stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.poll.update({ where: { id: req.params.id }, data: { status: 'closed' } });

    const votes = JSON.parse(poll.votes as string) as number[];
    getIo()?.to(roomId).emit('poll-closed', {
      id: poll.id, votes,
      totalVotes: votes.reduce((a: number, b: number) => a + b, 0),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to close poll' });
  }
});

export default router;
