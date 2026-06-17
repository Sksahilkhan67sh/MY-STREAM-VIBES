/**
 * server/src/routes/moderation.ts
 * Features 5 & 6: Viewer Moderation + Chat Filtering
 *
 * POST /api/moderation/:roomId/ban        — ban a viewer
 * POST /api/moderation/:roomId/timeout    — timeout a viewer
 * POST /api/moderation/:roomId/warn       — warn a viewer
 * POST /api/moderation/:roomId/unban      — unban a viewer
 * GET  /api/moderation/:roomId/logs       — get moderation log
 * GET  /api/moderation/:roomId/banned     — list banned viewers
 *
 * GET  /api/moderation/filters/:userId    — get chat filters
 * POST /api/moderation/filters/:userId    — add filter
 * DELETE /api/moderation/filters/:filterId — remove filter
 * POST /api/moderation/filters/check      — check a message against filters
 */

import { Router } from 'express';
import { getIo } from '../lib/socket';
import prisma from '../lib/prisma';

const socketServer = () => { try { return getIo(); } catch { return null; } };

const router = Router();

// ── In-memory store for active bans (Redis-backed in production) ──────────────
const activeBans = new Map<string, Set<string>>(); // roomId → Set<viewerId>
const activeTimeouts = new Map<string, Map<string, number>>(); // roomId → viewerId → expiresAt

function getBannedSet(roomId: string): Set<string> {
  if (!activeBans.has(roomId)) activeBans.set(roomId, new Set());
  return activeBans.get(roomId)!;
}

// ── Moderation Actions ────────────────────────────────────────────────────────

// POST /api/moderation/:roomId/ban
router.post('/:roomId/ban', async (req, res) => {
  try {
    const { hostToken, viewerId, nickname, reason } = req.body;
    if (!viewerId) return res.status(400).json({ error: 'viewerId required' });

    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    // Add to in-memory ban set
    getBannedSet(req.params.roomId).add(viewerId);

    // Log to DB
    await (prisma as any).viewerModerationLog.create({
      data: {
        streamId: stream.id,
        viewerId,
        nickname: nickname || viewerId,
        action: 'ban',
        reason: reason || null,
        by: 'host',
      },
    });

    // Emit socket event to kick viewer
    const sio = socketServer();
    if (sio) {
      sio.to(req.params.roomId).emit('moderation:ban', { viewerId, nickname, reason });
    }

    res.json({ ok: true, action: 'ban', viewerId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to ban viewer' });
  }
});

// POST /api/moderation/:roomId/timeout
router.post('/:roomId/timeout', async (req, res) => {
  try {
    const { hostToken, viewerId, nickname, reason, duration = 300 } = req.body;
    if (!viewerId) return res.status(400).json({ error: 'viewerId required' });

    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const expiresAt = Date.now() + duration * 1000;
    if (!activeTimeouts.has(req.params.roomId)) activeTimeouts.set(req.params.roomId, new Map());
    activeTimeouts.get(req.params.roomId)!.set(viewerId, expiresAt);

    await (prisma as any).viewerModerationLog.create({
      data: {
        streamId: stream.id,
        viewerId,
        nickname: nickname || viewerId,
        action: 'timeout',
        reason: reason || null,
        duration,
        by: 'host',
      },
    });

    const sio = socketServer();
    if (sio) {
      sio.to(req.params.roomId).emit('moderation:timeout', { viewerId, nickname, duration, reason });
    }

    res.json({ ok: true, action: 'timeout', viewerId, expiresAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to timeout viewer' });
  }
});

// POST /api/moderation/:roomId/warn
router.post('/:roomId/warn', async (req, res) => {
  try {
    const { hostToken, viewerId, nickname, reason } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    await (prisma as any).viewerModerationLog.create({
      data: { streamId: stream.id, viewerId, nickname: nickname || viewerId, action: 'warn', reason: reason || null, by: 'host' },
    });

    const sio = socketServer();
    if (sio) sio.to(req.params.roomId).emit('moderation:warn', { viewerId, nickname, reason });

    res.json({ ok: true, action: 'warn', viewerId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to warn viewer' });
  }
});

// POST /api/moderation/:roomId/unban
router.post('/:roomId/unban', async (req, res) => {
  try {
    const { hostToken, viewerId, nickname } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    getBannedSet(req.params.roomId).delete(viewerId);
    activeTimeouts.get(req.params.roomId)?.delete(viewerId);

    await (prisma as any).viewerModerationLog.create({
      data: { streamId: stream.id, viewerId, nickname: nickname || viewerId, action: 'unban', by: 'host' },
    });

    res.json({ ok: true, action: 'unban', viewerId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unban viewer' });
  }
});

// GET /api/moderation/:roomId/logs
router.get('/:roomId/logs', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const logs = await (prisma as any).viewerModerationLog.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// GET /api/moderation/:roomId/banned
router.get('/:roomId/banned', async (req, res) => {
  const banned = Array.from(getBannedSet(req.params.roomId));
  const timedOut = activeTimeouts.get(req.params.roomId);
  const now = Date.now();
  const timeouts = timedOut
    ? Array.from(timedOut.entries())
        .filter(([, exp]) => exp > now)
        .map(([id, exp]) => ({ viewerId: id, expiresAt: exp }))
    : [];
  res.json({ banned, timeouts });
});

// GET /api/moderation/check/:roomId/:viewerId — check if viewer is banned
router.get('/check/:roomId/:viewerId', (req, res) => {
  const { roomId, viewerId } = req.params;
  const isBanned = getBannedSet(roomId).has(viewerId);
  const timeoutExp = activeTimeouts.get(roomId)?.get(viewerId) ?? 0;
  const isTimedOut = timeoutExp > Date.now();
  res.json({ isBanned, isTimedOut, timeoutExpiresAt: isTimedOut ? timeoutExp : null });
});

// ── Chat Filters ──────────────────────────────────────────────────────────────

// GET /api/moderation/filters/:userId
router.get('/filters/:userId', async (req, res) => {
  try {
    const filters = await (prisma as any).chatFilter.findMany({
      where: { userId: req.params.userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ filters });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

// POST /api/moderation/filters/:userId
router.post('/filters/:userId', async (req, res) => {
  try {
    const { keyword, action = 'block', replace } = req.body;
    if (!keyword) return res.status(400).json({ error: 'keyword required' });

    // Check if keyword already exists
    const existing = await (prisma as any).chatFilter.findFirst({
      where: { userId: req.params.userId, keyword: keyword.toLowerCase() },
    });
    if (existing) {
      // Re-activate if disabled
      const updated = await (prisma as any).chatFilter.update({
        where: { id: existing.id },
        data: { isActive: true, action, replace: replace || null },
      });
      return res.json({ filter: updated });
    }

    const filter = await (prisma as any).chatFilter.create({
      data: {
        userId: req.params.userId,
        keyword: keyword.toLowerCase().trim(),
        action,
        replace: replace || null,
        isActive: true,
      },
    });
    res.json({ filter });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create filter' });
  }
});

// DELETE /api/moderation/filters/:filterId
router.delete('/filters/:filterId', async (req, res) => {
  try {
    await (prisma as any).chatFilter.update({
      where: { id: req.params.filterId },
      data: { isActive: false },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove filter' });
  }
});

// POST /api/moderation/filters/check — check a message against user's filters
router.post('/filters/check', async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

    const filters = await (prisma as any).chatFilter.findMany({
      where: { userId, isActive: true },
    });

    let processedMessage = message;
    let blocked = false;
    const matched: string[] = [];

    for (const f of filters) {
      const regex = new RegExp(f.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (regex.test(message)) {
        matched.push(f.keyword);
        if (f.action === 'block') {
          blocked = true;
          break;
        } else if (f.action === 'replace' && f.replace) {
          processedMessage = processedMessage.replace(regex, f.replace);
        } else if (f.action === 'replace') {
          processedMessage = processedMessage.replace(regex, '***');
        }
      }
    }

    res.json({ blocked, processedMessage, matched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check message' });
  }
});

export default router;
