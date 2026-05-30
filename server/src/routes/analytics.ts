import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../lib/auth';

const router = Router();

// ─── GET /api/analytics/:roomId ───────────────────────────────────
// Host-protected: requires hostToken query param OR JWT + stream ownership
router.get('/:roomId', async (req, res) => {
  const { hostToken } = req.query as { hostToken?: string };
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    // Auth: accept hostToken (legacy) or JWT ownership
    const authHeader = req.headers.authorization;
    let authorized = false;
    if (hostToken && stream.hostToken === hostToken) authorized = true;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { verifyToken } = await import('../lib/auth');
        const payload = verifyToken(authHeader.slice(7));
        if (stream.hostId === payload.userId || payload.role === 'ADMIN') authorized = true;
      } catch {}
    }
    if (!authorized) return res.status(403).json({ error: 'Unauthorized' });

    // ── Core metrics ──────────────────────────────────────────────
    const [events, polls, recordings] = await Promise.all([
      prisma.streamEvent.findMany({ where: { streamId: stream.id }, orderBy: { createdAt: 'asc' } }),
      prisma.poll.findMany({
        where: { streamId: stream.id },
        include: { _count: { select: { pollVotes: true } } },
      }),
      prisma.recording.findMany({ where: { streamId: stream.id } }),
    ]);

    // Viewer join/leave events → concurrent viewer timeline
    const viewerJoins  = events.filter(e => e.type === 'viewer_join');
    const viewerLeaves = events.filter(e => e.type === 'viewer_leave');
    const chatEvents   = events.filter(e => e.type === 'chat_message');
    const reactionEvents = events.filter(e => e.type === 'reaction');

    // Build 5-minute bucket timeline for the last 24h
    const now = Date.now();
    const bucketMs = 5 * 60 * 1000;
    const buckets = 288; // 24h / 5min
    const timeline: { time: string; viewers: number; chats: number }[] = [];

    for (let i = buckets - 1; i >= 0; i--) {
      const bucketEnd   = now - i * bucketMs;
      const bucketStart = bucketEnd - bucketMs;
      const ts = new Date(bucketEnd).toISOString();
      const viewers = viewerJoins.filter(e => e.createdAt.getTime() < bucketEnd).length
                    - viewerLeaves.filter(e => e.createdAt.getTime() < bucketEnd).length;
      const chats = chatEvents.filter(
        e => e.createdAt.getTime() >= bucketStart && e.createdAt.getTime() < bucketEnd
      ).length;
      if (viewers > 0 || chats > 0) timeline.push({ time: ts, viewers: Math.max(0, viewers), chats });
    }

    // Poll participation rate
    const totalVotes = polls.reduce((acc, p) => acc + p._count.pollVotes, 0);
    const pollParticipation = stream.viewerCount > 0
      ? Math.round((totalVotes / Math.max(stream.viewerCount, 1)) * 100)
      : 0;

    // Average watch time from events
    const joinTimes: Record<string, number> = {};
    const watchDurations: number[] = [];
    for (const e of events) {
      const meta = e.metadata ? JSON.parse(e.metadata) : {};
      if (e.type === 'viewer_join' && meta.viewerId) {
        joinTimes[meta.viewerId] = e.createdAt.getTime();
      }
      if (e.type === 'viewer_leave' && meta.viewerId && joinTimes[meta.viewerId]) {
        watchDurations.push(e.createdAt.getTime() - joinTimes[meta.viewerId]);
      }
    }
    const avgWatchSec = watchDurations.length
      ? Math.round(watchDurations.reduce((a, b) => a + b, 0) / watchDurations.length / 1000)
      : 0;

    res.json({
      stream: {
        id: stream.id, roomId: stream.roomId, title: stream.title,
        isLive: stream.isLive, createdAt: stream.createdAt,
      },
      metrics: {
        currentViewers: stream.viewerCount,
        peakViewers: stream.peakViewers,
        totalJoins: viewerJoins.length,
        avgWatchSec,
        chatMessages: chatEvents.length,
        reactions: reactionEvents.length,
        pollParticipationPct: pollParticipation,
        totalPolls: polls.length,
        totalRecordings: recordings.length,
      },
      timeline,
      polls: polls.map(p => ({
        id: p.id, question: p.question, status: p.status,
        totalVotes: p._count.pollVotes, createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── POST /api/analytics/event (internal — called from socket.ts) ─
router.post('/event', async (req, res) => {
  const { streamId, type, value = 1, metadata } = req.body;
  try {
    await prisma.streamEvent.create({
      data: { streamId, type, value, metadata: metadata ? JSON.stringify(metadata) : null },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to record event' });
  }
});

export default router;
