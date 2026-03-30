import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { createViewerToken, createHostToken } from '../lib/livekit-server';

const router = Router();
const prisma = new PrismaClient();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

// POST /api/token/viewer
router.post('/viewer', async (req, res) => {
  try {
    const { roomId, nickname, password } = req.body;

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (new Date() > stream.expiresAt) {
      return res.status(410).json({ error: 'Stream link has expired' });
    }

    if (stream.passwordHash) {
      if (!password) return res.status(401).json({ error: 'Password required' });
      const valid = await bcrypt.compare(password, stream.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Invalid password' });
    }

    const identity = `viewer-${nickname ? nickname.replace(/\s+/g, '-').toLowerCase() : nanoid()}`;
    const token = await createViewerToken(roomId, identity);

    res.json({ token, identity });
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
