import { Router } from 'express';
import prisma from '../lib/prisma';
import { getIo } from '../lib/socket';

const router = Router();

// In-memory ban/timeout store (fast, no DB round-trip for checks)
const activeBans     = new Map<string, Set<string>>();
const activeTimeouts = new Map<string, Map<string, number>>();

const getBanned = (roomId: string) => {
  if (!activeBans.has(roomId)) activeBans.set(roomId, new Set());
  return activeBans.get(roomId)!;
};

const emit = (roomId: string, event: string, data: unknown) => {
  try { getIo()?.to(roomId).emit(event, data); } catch {}
};

// POST /api/moderation/:roomId/ban
router.post('/:roomId/ban', async (req, res) => {
  try {
    const { hostToken, viewerId, nickname, reason } = req.body;
    if (!viewerId) return res.status(400).json({ error: 'viewerId required' });
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    getBanned(req.params.roomId).add(viewerId);
    await prisma.viewerModerationLog.create({
      data: { streamId: stream.id, viewerId, nickname: nickname || viewerId, action: 'ban', reason: reason || null, by: 'host' },
    });
    emit(req.params.roomId, 'moderation:ban', { viewerId, nickname, reason });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to ban' }); }
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

    await prisma.viewerModerationLog.create({
      data: { streamId: stream.id, viewerId, nickname: nickname || viewerId, action: 'timeout', reason: reason || null, duration, by: 'host' },
    });
    emit(req.params.roomId, 'moderation:timeout', { viewerId, nickname, duration, reason });
    res.json({ ok: true, expiresAt });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to timeout' }); }
});

// POST /api/moderation/:roomId/warn
router.post('/:roomId/warn', async (req, res) => {
  try {
    const { hostToken, viewerId, nickname, reason } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.viewerModerationLog.create({
      data: { streamId: stream.id, viewerId, nickname: nickname || viewerId, action: 'warn', reason: reason || null, by: 'host' },
    });
    emit(req.params.roomId, 'moderation:warn', { viewerId, nickname, reason });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to warn' }); }
});

// POST /api/moderation/:roomId/unban
router.post('/:roomId/unban', async (req, res) => {
  try {
    const { hostToken, viewerId, nickname } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    getBanned(req.params.roomId).delete(viewerId);
    activeTimeouts.get(req.params.roomId)?.delete(viewerId);
    await prisma.viewerModerationLog.create({
      data: { streamId: stream.id, viewerId, nickname: nickname || viewerId, action: 'unban', by: 'host' },
    });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to unban' }); }
});

// GET /api/moderation/:roomId/logs
router.get('/:roomId/logs', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    const logs = await prisma.viewerModerationLog.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ logs });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch logs' }); }
});

// GET /api/moderation/:roomId/banned
router.get('/:roomId/banned', (req, res) => {
  const banned   = Array.from(getBanned(req.params.roomId));
  const timedOut = activeTimeouts.get(req.params.roomId);
  const now = Date.now();
  const timeouts = timedOut
    ? Array.from(timedOut.entries()).filter(([, exp]) => exp > now).map(([id, exp]) => ({ viewerId: id, expiresAt: exp }))
    : [];
  res.json({ banned, timeouts });
});

// GET /api/moderation/check/:roomId/:viewerId
router.get('/check/:roomId/:viewerId', (req, res) => {
  const { roomId, viewerId } = req.params;
  const isBanned    = getBanned(roomId).has(viewerId);
  const timeoutExp  = activeTimeouts.get(roomId)?.get(viewerId) ?? 0;
  const isTimedOut  = timeoutExp > Date.now();
  res.json({ isBanned, isTimedOut, timeoutExpiresAt: isTimedOut ? timeoutExp : null });
});

// GET /api/moderation/filters/:userId
router.get('/filters/:userId', async (req, res) => {
  try {
    const filters = await prisma.chatFilter.findMany({
      where: { userId: req.params.userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ filters });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch filters' }); }
});

// POST /api/moderation/filters/:userId
router.post('/filters/:userId', async (req, res) => {
  try {
    const { keyword, action = 'block', replace } = req.body;
    if (!keyword?.trim()) return res.status(400).json({ error: 'keyword required' });

    const existing = await prisma.chatFilter.findFirst({
      where: { userId: req.params.userId, keyword: keyword.toLowerCase().trim() },
    });
    if (existing) {
      const updated = await prisma.chatFilter.update({
        where: { id: existing.id },
        data: { isActive: true, action, replace: replace || null },
      });
      return res.json({ filter: updated });
    }

    const filter = await prisma.chatFilter.create({
      data: { userId: req.params.userId, keyword: keyword.toLowerCase().trim(), action, replace: replace || null, isActive: true },
    });
    res.json({ filter });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create filter' }); }
});

// DELETE /api/moderation/filters/:filterId
router.delete('/filters/:filterId', async (req, res) => {
  try {
    await prisma.chatFilter.update({ where: { id: req.params.filterId }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to remove filter' }); }
});

// POST /api/moderation/filters/check
router.post('/filters/check', async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

    const filters = await prisma.chatFilter.findMany({ where: { userId, isActive: true } });
    let processed = message;
    let blocked   = false;
    const matched: string[] = [];

    for (const f of filters) {
      const re = new RegExp(f.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (re.test(message)) {
        matched.push(f.keyword);
        if (f.action === 'block') { blocked = true; break; }
        if (f.action === 'replace') processed = processed.replace(re, f.replace || '***');
      }
    }
    res.json({ blocked, processedMessage: processed, matched });
  } catch (err) { res.status(500).json({ error: 'Failed to check message' }); }
});

export default router;
