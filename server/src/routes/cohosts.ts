import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { AccessToken } from 'livekit-server-sdk';
import prisma from '../lib/prisma';

const router = Router();

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY    || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const APP_URL            = process.env.CLIENT_URL          || 'http://localhost:3000';

async function verifyHost(roomId: string, hostToken: string) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });
  if (stream.hostToken !== hostToken) throw Object.assign(new Error('Unauthorized'), { status: 403 });
  return stream;
}

async function createCoHostToken(roomId: string, identity: string): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: 86400,
  });
  at.addGrant({
    roomJoin:       true,
    room:           roomId,
    canPublish:     true,   // co-host CAN publish video/audio
    canSubscribe:   true,
    canPublishData: true,
  });
  return String(await Promise.resolve(at.toJwt()));
}

// ── POST /api/cohosts — create a co-host invite ───────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken, name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Co-host name is required' });

    const stream = await verifyHost(roomId, hostToken);

    // Max 5 co-hosts per stream
    const count = await prisma.coHost.count({ where: { streamId: stream.id } });
    if (count >= 5) return res.status(400).json({ error: 'Maximum 5 co-hosts per stream' });

    const coHostToken = nanoid(32);
    const joinUrl     = `${APP_URL}/cohost/${roomId}?token=${coHostToken}`;

    const coHost = await prisma.coHost.create({
      data: {
        streamId:    stream.id,
        name:        name.trim(),
        coHostToken,
        joinUrl,
      },
    });

    res.json({
      id:          coHost.id,
      name:        coHost.name,
      coHostToken: coHost.coHostToken,
      joinUrl:     coHost.joinUrl,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /api/cohosts/:roomId — list co-hosts (host only) ──────
router.get('/:roomId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    const stream = await verifyHost(req.params.roomId, hostToken);

    const coHosts = await prisma.coHost.findMany({
      where:   { streamId: stream.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json(coHosts);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── POST /api/cohosts/join — co-host joins with their token ───
router.post('/join', async (req: Request, res: Response) => {
  try {
    const { roomId, coHostToken } = req.body;

    const coHost = await prisma.coHost.findUnique({ where: { coHostToken } });
    if (!coHost) return res.status(404).json({ error: 'Invalid co-host token' });

    const stream = await prisma.stream.findUnique({ where: { id: coHost.streamId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.roomId !== roomId) return res.status(403).json({ error: 'Token does not match room' });
    if (new Date() > stream.expiresAt) return res.status(410).json({ error: 'Stream has expired' });

    // Generate a LiveKit token with publish rights
    const identity     = `cohost-${coHost.name.toLowerCase().replace(/\s+/g, '-')}-${nanoid(4)}`;
    const livekitToken = await createCoHostToken(roomId, identity);

    // Mark co-host as active
    await prisma.coHost.update({
      where: { id: coHost.id },
      data:  { isActive: true },
    });

    res.json({
      livekitToken,
      identity,
      name:   coHost.name,
      roomId: stream.roomId,
      title:  stream.title,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── DELETE /api/cohosts/:id — remove a co-host ────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { hostToken, roomId } = req.body;
    await verifyHost(roomId, hostToken);

    const coHost = await prisma.coHost.findUnique({ where: { id: req.params.id } });
    if (!coHost) return res.status(404).json({ error: 'Co-host not found' });

    await prisma.coHost.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;