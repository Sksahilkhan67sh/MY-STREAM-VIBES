/**
 * /api/analytics
 * Analytics endpoints for stream dashboard and event tracking.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  trackEvent,
  getStreamDashboard,
  getLiveStats,
  getCreatorStats,
  finalizeStreamAnalytics,
} from '../services/analytics.service';
import prisma from '../lib/prisma';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TrackSchema = z.object({
  event:       z.enum(['join', 'leave', 'chat', 'poll_vote', 'reaction', 'donate']),
  viewerId:    z.string().min(1).max(128),
  sessionId:   z.string().min(1).max(128),
  watchSeconds: z.number().int().min(0).optional(),
  deviceType:  z.enum(['desktop', 'mobile', 'tablet']).optional(),
  browser:     z.string().max(64).optional(),
  os:          z.string().max(64).optional(),
  country:     z.string().max(64).optional(),
  region:      z.string().max(64).optional(),
  city:        z.string().max(64).optional(),
  userId:      z.string().optional(),
});

// ─── POST /api/analytics/:roomId/track ───────────────────────────────────────
// Public — any viewer can track events. Rate-limited upstream.

router.post('/:roomId/track', async (req: Request, res: Response) => {
  try {
    const parsed = TrackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    await trackEvent({ streamId: req.params.roomId, ...parsed.data });
    res.json({ ok: true });
  } catch (err) {
    console.error('[analytics/track]', err);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// ─── GET /api/analytics/:roomId/live ─────────────────────────────────────────
// Real-time stats — host only (token required)

router.get('/:roomId/live', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    if (!hostToken) return res.status(401).json({ error: 'hostToken required' });

    const stream = await prisma.stream.findUnique({
      where: { roomId: req.params.roomId },
      select: { hostToken: true },
    });
    if (!stream || stream.hostToken !== hostToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const stats = await getLiveStats(req.params.roomId);
    res.json(stats ?? { concurrent: 0, uniqueViewers: 0, peak: 0, chat: 0, timeline: [] });
  } catch (err) {
    console.error('[analytics/live]', err);
    res.status(500).json({ error: 'Failed to get live stats' });
  }
});

// ─── GET /api/analytics/:roomId/dashboard ────────────────────────────────────
// Full analytics dashboard — host only

router.get('/:roomId/dashboard', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    if (!hostToken) return res.status(401).json({ error: 'hostToken required' });

    const data = await getStreamDashboard(req.params.roomId, hostToken);
    if (!data) return res.status(403).json({ error: 'Unauthorized or stream not found' });

    res.json(data);
  } catch (err) {
    console.error('[analytics/dashboard]', err);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

// ─── GET /api/analytics/creator/:userId ──────────────────────────────────────
// Aggregated stats for a creator's homepage

router.get('/creator/:userId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };

    // Lightweight auth: verify at least one stream belongs to this user+token
    if (!hostToken) return res.status(401).json({ error: 'hostToken required' });

    const stream = await prisma.stream.findFirst({
      where: { userId: req.params.userId, hostToken },
    });
    if (!stream) return res.status(403).json({ error: 'Unauthorized' });

    const data = await getCreatorStats(req.params.userId);
    res.json(data);
  } catch (err) {
    console.error('[analytics/creator]', err);
    res.status(500).json({ error: 'Failed to get creator stats' });
  }
});

// ─── POST /api/analytics/:roomId/finalize ────────────────────────────────────
// Called when stream ends to persist final analytics

router.post('/:roomId/finalize', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.body;
    const stream = await prisma.stream.findUnique({
      where: { roomId: req.params.roomId },
      select: { hostToken: true },
    });
    if (!stream || stream.hostToken !== hostToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await finalizeStreamAnalytics(req.params.roomId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[analytics/finalize]', err);
    res.status(500).json({ error: 'Failed to finalize analytics' });
  }
});

export default router;
