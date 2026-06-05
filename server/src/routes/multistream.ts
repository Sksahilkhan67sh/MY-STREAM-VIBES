/**
 * server/src/routes/multistream.ts
 * PHASE 5 — Multi-Platform Streaming Routes
 *
 * Mount in index.ts:
 *   import multistreamRouter from './routes/multistream';
 *   app.use('/api/multistream', multistreamRouter);
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { multiStreamService, PLATFORM_CONFIGS } from '../services/multistream.service';

const router = Router();

// ── Auth helper ──────────────────────────────────────────────────────────────
async function requireUser(req: Request): Promise<string> {
  // NextAuth passes userId via Authorization: Bearer <session-token>
  // or via x-user-id header set by your Next.js API proxy.
  // Adjust to match your auth middleware.
  const userId = req.headers['x-user-id'] as string;
  if (!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return userId;
}

async function requireHost(req: Request) {
  const { roomId, hostToken } = req.body as Record<string, string>;
  if (!roomId || !hostToken) throw Object.assign(new Error('roomId and hostToken required'), { status: 400 });
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });
  if (stream.hostToken !== hostToken) throw Object.assign(new Error('Unauthorized'), { status: 403 });
  return stream;
}

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req, res);
      if (result !== undefined) res.json(result);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ error: e.message ?? 'Internal error' });
    }
  };
}

// ── GET /api/multistream/platforms ──────────────────────────────────────────
// Returns supported platforms and their config (for the UI selector)
router.get('/platforms', (_req, res) => {
  res.json({ platforms: PLATFORM_CONFIGS });
});

// ── GET /api/multistream/destinations ───────────────────────────────────────
// List saved RTMP destinations for the current user
router.get('/destinations', handle(async (req) => {
  const userId = await requireUser(req);
  const destinations = await prisma.rtmpDestination.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, platform: true, label: true,
      // Mask stream key — show only last 4 chars
      streamKey: true,
      rtmpUrl: true,
      isEnabled: true,
      totalStreams: true,
      totalMinutes: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  // Mask keys
  const masked = destinations.map(d => ({
    ...d,
    streamKey: d.streamKey ? `****${d.streamKey.slice(-4)}` : '',
    rtmpUrl: d.rtmpUrl ? maskRtmpUrl(d.rtmpUrl) : '',
  }));
  return { destinations: masked };
}));

// ── POST /api/multistream/destinations ──────────────────────────────────────
// Create a saved destination
const CreateDestinationSchema = z.object({
  platform: z.enum(['youtube', 'twitch', 'facebook', 'linkedin', 'custom']),
  label: z.string().min(1).max(80),
  streamKey: z.string().min(1),
  customRtmpBase: z.string().url().optional(), // only for 'custom'
});

router.post('/destinations', handle(async (req) => {
  const userId = await requireUser(req);
  const body = CreateDestinationSchema.parse(req.body);

  const config = PLATFORM_CONFIGS[body.platform];
  const rtmpUrl = body.platform === 'custom'
    ? (body.customRtmpBase ?? '') + body.streamKey
    : config.rtmpBase + body.streamKey;

  const dest = await prisma.rtmpDestination.create({
    data: {
      userId,
      platform: body.platform,
      label: body.label,
      streamKey: body.streamKey,
      rtmpUrl,
    },
  });
  return { destination: { ...dest, streamKey: `****${dest.streamKey.slice(-4)}` } };
}));

// ── PATCH /api/multistream/destinations/:id ──────────────────────────────────
router.patch('/destinations/:id', handle(async (req) => {
  const userId = await requireUser(req);
  const dest = await prisma.rtmpDestination.findFirst({ where: { id: req.params.id, userId } });
  if (!dest) throw Object.assign(new Error('Not found'), { status: 404 });

  const { label, streamKey, isEnabled, customRtmpBase } = req.body as Record<string, string | boolean>;
  const updates: Record<string, unknown> = {};
  if (label) updates.label = label;
  if (typeof isEnabled === 'boolean') updates.isEnabled = isEnabled;
  if (streamKey) {
    updates.streamKey = streamKey;
    const config = PLATFORM_CONFIGS[dest.platform];
    const base = dest.platform === 'custom' ? (customRtmpBase as string ?? '') : config.rtmpBase;
    updates.rtmpUrl = base + streamKey;
  }

  const updated = await prisma.rtmpDestination.update({ where: { id: dest.id }, data: updates });
  return { destination: { ...updated, streamKey: `****${updated.streamKey.slice(-4)}` } };
}));

// ── DELETE /api/multistream/destinations/:id ─────────────────────────────────
router.delete('/destinations/:id', handle(async (req) => {
  const userId = await requireUser(req);
  await prisma.rtmpDestination.deleteMany({ where: { id: req.params.id, userId } });
  return { ok: true };
}));

// ── POST /api/multistream/start ──────────────────────────────────────────────
// Start pushing the current stream to one or more destinations
const StartSchema = z.object({
  roomId: z.string(),
  hostToken: z.string(),
  destinationIds: z.array(z.string()).min(1).max(4),
  sourceRtmpUrl: z.string(), // URL we pull from (LiveKit egress RTMP output)
});

router.post('/start', handle(async (req) => {
  const stream = await requireHost(req);
  const { destinationIds, sourceRtmpUrl } = StartSchema.parse(req.body);

  const results: { destinationId: string; ok: boolean; error?: string }[] = [];

  for (const destId of destinationIds) {
    try {
      const dest = await prisma.rtmpDestination.findFirst({
        where: { id: destId, userId: stream.userId ?? undefined, isEnabled: true },
      });
      if (!dest) { results.push({ destinationId: destId, ok: false, error: 'Destination not found' }); continue; }

      // Create session record
      const session = await prisma.multiStreamSession.create({
        data: {
          streamId: stream.id,
          destinationId: dest.id,
          status: 'connecting',
        },
      });

      // Start ffmpeg relay
      await multiStreamService.startDestination(
        stream.roomId,
        session.id,
        dest.id,
        sourceRtmpUrl,
        dest.rtmpUrl,
      );

      // Update usage stats
      await prisma.rtmpDestination.update({
        where: { id: dest.id },
        data: { lastUsedAt: new Date(), totalStreams: { increment: 1 } },
      });

      results.push({ destinationId: destId, ok: true });
    } catch (err) {
      results.push({ destinationId: destId, ok: false, error: (err as Error).message });
    }
  }

  return { results };
}));

// ── POST /api/multistream/stop ───────────────────────────────────────────────
router.post('/stop', handle(async (req) => {
  const stream = await requireHost(req);
  const { destinationIds } = req.body as { destinationIds?: string[] };

  if (destinationIds?.length) {
    for (const id of destinationIds) {
      await multiStreamService.stopDestination(stream.roomId, id);
    }
  } else {
    await multiStreamService.stopAllForRoom(stream.roomId);
  }
  return { ok: true };
}));

// ── GET /api/multistream/health/:roomId ──────────────────────────────────────
router.get('/health/:roomId', handle(async (req) => {
  // Also pull from DB for persisted metrics
  const sessions = await prisma.multiStreamSession.findMany({
    where: { stream: { roomId: req.params.roomId }, status: { in: ['live', 'connecting', 'error'] } },
    include: { destination: { select: { platform: true, label: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const liveHealth = multiStreamService.getHealthForRoom(req.params.roomId);
  const healthMap = new Map(liveHealth.map(h => [h.destinationId, h]));

  const merged = sessions.map(s => ({
    sessionId: s.id,
    destinationId: s.destinationId,
    platform: s.destination.platform,
    label: s.destination.label,
    status: s.status,
    bitrateKbps: healthMap.get(s.destinationId)?.bitrateKbps ?? s.bitrateKbps,
    droppedFrames: healthMap.get(s.destinationId)?.droppedFrames ?? s.droppedFrames,
    health: healthMap.get(s.destinationId)?.health ?? s.health,
    uptimeSeconds: healthMap.get(s.destinationId)?.uptimeSeconds ?? 0,
    startedAt: s.startedAt,
    errorMessage: s.errorMessage,
  }));

  return { sessions: merged };
}));

// ── GET /api/multistream/analytics/:roomId ───────────────────────────────────
router.get('/analytics/:roomId', handle(async (req) => {
  const sessions = await prisma.multiStreamSession.findMany({
    where: { stream: { roomId: req.params.roomId } },
    include: { destination: { select: { platform: true, label: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const byPlatform = sessions.reduce((acc, s) => {
    const key = s.destination.platform;
    if (!acc[key]) acc[key] = { sessions: 0, totalMinutes: 0, errors: 0 };
    acc[key].sessions++;
    if (s.startedAt && s.stoppedAt) {
      acc[key].totalMinutes += Math.round((s.stoppedAt.getTime() - s.startedAt.getTime()) / 60_000);
    }
    if (s.status === 'error') acc[key].errors++;
    return acc;
  }, {} as Record<string, { sessions: number; totalMinutes: number; errors: number }>);

  return { analytics: byPlatform, sessions };
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskRtmpUrl(url: string): string {
  // rtmp://a.rtmp.youtube.com/live2/XXXX → rtmp://a.rtmp.youtube.com/live2/****
  const idx = url.lastIndexOf('/');
  if (idx === -1) return '****';
  const key = url.slice(idx + 1);
  return url.slice(0, idx + 1) + `****${key.slice(-4)}`;
}

export default router;
