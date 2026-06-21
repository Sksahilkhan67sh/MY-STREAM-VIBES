import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { createViewerToken, createHostToken } from '../lib/livekit-server';
import prisma from '../lib/prisma';

const router = Router();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

// POST /api/token/viewer
// Requires a signed-in viewer. `userId` must correspond to a real account —
// this is intentional: guest/anonymous viewing has been removed so that
// chat identity, follows, and watch history are always tied to a real
// account, and a viewer's displayed name/avatar can never be spoofed by
// client-supplied text the way a free-typed nickname could be before.
router.post('/viewer', async (req, res) => {
  try {
    const { roomId, userId, password } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Sign in required to watch streams.' });
    }

    const [stream, user] = await Promise.all([
      prisma.stream.findUnique({ where: { roomId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, username: true, avatarUrl: true } }),
    ]);

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (!user)   return res.status(401).json({ error: 'Sign in required to watch streams.' });
    if (new Date() > stream.expiresAt) {
      return res.status(410).json({ error: 'Stream link has expired' });
    }

    // Block access if stream hasn't started yet and isn't scheduled (pre-join waiting room)
    if (!stream.isLive && !stream.scheduledAt) {
      return res.status(403).json({ error: 'Stream is not live yet.' });
    }

    if (stream.passwordHash) {
      if (!password) return res.status(401).json({ error: 'Password required' });
      const valid = await bcrypt.compare(password, stream.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Invalid password' });
    }

    const displayName = user.name || user.username || 'Viewer';
    // Unique per join (not just per account) so the same person watching
    // from two tabs/devices doesn't collide on one LiveKit identity and
    // silently disconnect one of their own sessions.
    const identity = `viewer-${user.id}-${nanoid()}`;
    const token = await createViewerToken(roomId, identity);

    res.json({
      token,
      identity,
      nickname: displayName,
      avatarUrl: user.avatarUrl || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// POST /api/token/host
router.post('/host', async (req, res) => {
  try {
    const { roomId, hostToken } = req.body;

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const token = await createHostToken(roomId, `host-${roomId}`);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate host token' });
  }
});

export default router;
