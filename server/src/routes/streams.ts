import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { createHostToken } from '../lib/livekit-server';
import { generateClipsForStream } from './ai-features';
import { notifyFollowersOfGoLive } from '../lib/notification.service';
import { finalizeStreamAnalytics } from '../services/analytics.service';
import { enqueueOrRunInline, QUEUE_NAMES } from '../lib/queues';
import prisma from '../lib/prisma';

const router = Router();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

const CreateStreamSchema = z.object({
  title:          z.string().min(1).max(100),
  description:    z.string().max(500).optional(),
  password:       z.string().optional(),
  scheduledAt:    z.string().datetime().optional(),
  expiresInHours: z.number().min(1).max(168).default(24),
  userId:         z.string().optional(), // ← BUG FIX: store userId so subscription/donation auth works
  categoryId:     z.string().optional(),
  isPublic:       z.boolean().default(false),
  language:       z.string().default('en'),
  country:        z.string().optional(),
  tags:           z.array(z.string()).max(10).optional(),
  // ── Stream Creation Wizard (additive) ──
  thumbnailUrl:   z.string().optional(),
  wizardPrefs:    z.record(z.any()).optional(),
});

// POST /api/streams
router.post('/', async (req, res) => {
  try {
    const data = CreateStreamSchema.parse(req.body);
    const roomId      = nanoid();
    const hostSecret  = nanoid(32);
    const expiresAt   = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
    const livekitToken = await createHostToken(roomId, `host-${roomId}`);
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : null;

    // Ensure the user row exists before creating the stream (FK guard)
    if (data.userId) {
      const isEmail = data.userId.includes('@');
      if (isEmail) {
        // userId is actually an email — upsert by email, use returned id
        const user = await prisma.user.upsert({
          where:  { email: data.userId },
          update: {},
          create: { email: data.userId },
        });
        data.userId = user.id;
      } else {
        // userId is a cuid — ensure the row exists
        const exists = await prisma.user.findUnique({ where: { id: data.userId } });
        if (!exists) {
          // Row was wiped — recreate with a placeholder email
          await prisma.user.create({ data: { id: data.userId, email: `${data.userId}@placeholder.local` } });
        }
      }
    }

    const stream = await prisma.stream.create({
      data: {
        roomId,
        title:       data.title,
        description: data.description,
        hostToken:   hostSecret,
        passwordHash,
        expiresAt,
        userId:      data.userId || null,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        categoryId:  data.categoryId || null,
        isPublic:    data.isPublic,
        language:    data.language,
        country:     data.country || null,
        tags:        JSON.stringify(data.tags || []),
        thumbnailUrl: data.thumbnailUrl || null,
        wizardPrefs:  data.wizardPrefs ? JSON.stringify(data.wizardPrefs) : null,
      },
    });

    res.json({
      roomId:      stream.roomId,
      hostToken:   hostSecret,
      livekitToken,
      viewerUrl:   `/s/${roomId}`,
      expiresAt:   stream.expiresAt,
      wizardPrefs: data.wizardPrefs || null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error(err);
    res.status(500).json({ error: 'Failed to create stream' });
  }
});

// GET /api/streams/:roomId
router.get('/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({
      where:   { roomId: req.params.roomId },
      select: {
        id:           true,
        roomId:       true,
        title:        true,
        description:  true,
        isLive:       true,
        isRecording:  true,
        scheduledAt:  true,
        expiresAt:    true,
        viewerCount:  true,
        passwordHash: true,
        thumbnailUrl: true,
        wizardPrefs:  true,
        category:     { select: { id: true, name: true, slug: true, icon: true } },
        user:         { select: { id: true, name: true, username: true, avatarUrl: true } },
      },
    });

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (new Date() > stream.expiresAt) return res.status(410).json({ error: 'Stream link has expired' });

    // Check if PPV is enabled for this stream
    let isPPV   = false;
    let ppvPrice: number | null = null;
    try {
      const tiers = await prisma.ticketTier.findMany({
        where: { stream: { roomId: req.params.roomId }, isActive: true },
        select: { price: true },
        take: 1,
      });
      if (tiers.length > 0) { isPPV = true; ppvPrice = tiers[0].price; }
    } catch {} // TicketTier may not exist yet — ignore

    let wizardPrefs: Record<string, any> | null = null;
    try { wizardPrefs = stream.wizardPrefs ? JSON.parse(stream.wizardPrefs) : null; } catch {}

    res.json({
      id:          stream.id,
      roomId:      stream.roomId,
      title:       stream.title,
      description: stream.description,
      isLive:      stream.isLive,
      isRecording: stream.isRecording,
      scheduledAt: stream.scheduledAt,
      expiresAt:   stream.expiresAt,
      viewerCount: stream.viewerCount,
      hasPassword: !!stream.passwordHash,
      thumbnailUrl: stream.thumbnailUrl,
      category:    stream.category,
      creator:     stream.user,
      isPPV,
      ppvPrice,
      wizardPrefs,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stream' });
  }
});

// PATCH /api/streams/:roomId
router.patch('/:roomId', async (req, res) => {
  try {
    const { hostToken, isLive, description, tags, wizardPrefs } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream)                         return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken)  return res.status(403).json({ error: 'Unauthorized' });

    const goingLiveNow    = isLive === true  && !stream.isLive;
    const goingOfflineNow = isLive === false && stream.isLive;
    const updated = await prisma.stream.update({
      where: { roomId: req.params.roomId },
      data:  {
        ...(isLive !== undefined && { isLive }),
        ...(goingLiveNow && { goneLiveAt: new Date() }),
        // ── Additive: wizard can patch these after creation too ──
        ...(description !== undefined && { description }),
        ...(Array.isArray(tags) && { tags: JSON.stringify(tags) }),
        ...(wizardPrefs !== undefined && { wizardPrefs: wizardPrefs ? JSON.stringify(wizardPrefs) : null }),
      },
    });

    // ── Auto Clips (real, free — heuristics only, no AI API cost) ───────────
    // Only fires once, the instant a stream transitions from live to offline,
    // and only if the creator enabled "Auto Clips" in the Stream Creation
    // Wizard. Runs through the background job queue when Redis is available
    // (so a server restart mid-generation doesn't silently lose the job),
    // otherwise runs inline exactly as before.
    if (goingOfflineNow) {
      let prefs: Record<string, any> | null = null;
      try { prefs = stream.wizardPrefs ? JSON.parse(stream.wizardPrefs) : null; } catch {}
      if (prefs?.autoClips) {
        enqueueOrRunInline(
          QUEUE_NAMES.AUTO_CLIPS,
          'generate-clips',
          { roomId: updated.roomId, requestedBy: 'auto-clips-wizard' },
          async (data) => { await generateClipsForStream(data.roomId, data.requestedBy); }
        ).catch(err => console.error('[streams] auto-clips generation failed:', err));
      }

      // ── Analytics finalization ──────────────────────────────────────────
      // finalizeStreamAnalytics already existed and is complete (peak
      // concurrent viewers, retention curve, device/country breakdowns) but
      // previously required a manual API call to ever run for a given
      // stream. This is the one place every stream's live→offline
      // transition already happens, so it's the correct automatic trigger.
      enqueueOrRunInline(
        QUEUE_NAMES.ANALYTICS_AGGREGATION,
        'finalize-analytics',
        { roomId: updated.roomId },
        async (data) => { await finalizeStreamAnalytics(data.roomId); }
      ).catch(err => console.error('[streams] analytics finalization failed:', err));
    }

    // ── Notify Followers (real, in-app + real-time) ──────────────────────────
    // Only fires the instant a stream transitions to live, and only for
    // followers who opted in via notifyOnLive (default true). Runs through
    // the background job queue (retries on failure, survives a server
    // restart mid-job) when Redis is configured; otherwise runs inline
    // exactly as before — never blocks or fails the go-live request itself.
    if (goingLiveNow && stream.userId) {
      enqueueOrRunInline(
        QUEUE_NAMES.NOTIFICATIONS,
        'follower-go-live',
        { creatorId: stream.userId, streamTitle: updated.title, roomId: updated.roomId },
        async (data) => { await notifyFollowersOfGoLive(data.creatorId, data.streamTitle, data.roomId); }
      ).catch(err => console.error('[streams] follower notify failed:', err));
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update stream' });
  }
});

// POST /api/streams/:roomId/verify-password
router.post('/:roomId/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream)            return res.status(404).json({ error: 'Stream not found' });
    if (!stream.passwordHash) return res.json({ valid: true });
    const valid = await bcrypt.compare(password, stream.passwordHash);
    res.json({ valid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// GET /api/streams?userId=xxx  — added for calendar + replay library
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId query param required' });
    }
    const streams = await prisma.stream.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    100,
      select:  {
        id: true, roomId: true, title: true, isLive: true,
        scheduledAt: true, expiresAt: true, createdAt: true,
        thumbnailUrl: true, viewerCount: true,
      },
    });
    res.json({ streams });
  } catch (err) {
    console.error('[streams list]', err);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});

export default router;
