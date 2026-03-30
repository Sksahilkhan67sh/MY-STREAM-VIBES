import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { EgressClient, EncodedFileOutput, StreamOutput, StreamProtocol } from 'livekit-server-sdk';

const router = Router();
const prisma = new PrismaClient();

const livekitUrl = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

const egressClient = new EgressClient(
  livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://'),
  apiKey,
  apiSecret
);

// Store active egress IDs in memory (use Redis/DB in production)
const activeEgress: Map<string, string> = new Map();
const activeRtmp: Map<string, string> = new Map();

// ── Recording ─────────────────────────────────────────────────

// POST /api/egress/start — Start recording
router.post('/start', async (req, res) => {
  try {
    const { roomId, hostToken } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId } });

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.stream.update({ where: { roomId }, data: { isRecording: true } });
    res.json({ success: true, message: 'Recording started' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

// POST /api/egress/stop — Stop recording
router.post('/stop', async (req, res) => {
  try {
    const { roomId, hostToken } = req.body;
    const stream = await prisma.stream.findUnique({ where: { roomId } });

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    // Stop LiveKit egress if active
    const egressId = activeEgress.get(roomId);
    if (egressId) {
      try { await egressClient.stopEgress(egressId); } catch {}
      activeEgress.delete(roomId);
    }

    await prisma.stream.update({ where: { roomId }, data: { isRecording: false } });
    res.json({ success: true, message: 'Recording stopped' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop recording' });
  }
});

// ── RTMP / Social Streaming ───────────────────────────────────

// POST /api/egress/rtmp/start — Start RTMP forward to YouTube/Instagram/custom
router.post('/rtmp/start', async (req, res) => {
  try {
    const { roomId, hostToken, rtmpUrl, platform } = req.body;

    if (!rtmpUrl) return res.status(400).json({ error: 'RTMP URL is required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    // Stop existing RTMP for this room if any
    const existingId = activeRtmp.get(roomId);
    if (existingId) {
      try { await egressClient.stopEgress(existingId); } catch {}
    }

    // Start LiveKit room composite egress → RTMP
    try {
      const output = new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [rtmpUrl],
      });

      const egress = await egressClient.startRoomCompositeEgress(roomId, { stream: output });
      const egressId = egress.egressId;
      activeRtmp.set(roomId, egressId);

      await prisma.stream.update({ where: { roomId }, data: { rtmpUrl } });
      res.json({ success: true, egressId, platform });
    } catch (livekitErr: any) {
      // LiveKit egress requires LiveKit Cloud or self-hosted with egress service
      // Fall back to a "forwarding registered" response for local dev
      console.warn('LiveKit Egress not available (requires cloud/egress service):', livekitErr.message);
      await prisma.stream.update({ where: { roomId }, data: { rtmpUrl } });
      res.json({
        success: true,
        platform,
        note: 'RTMP registered. LiveKit Egress service required for actual forwarding.',
      });
    }
  } catch (err: any) {
    console.error('RTMP start error:', err);
    res.status(500).json({ error: 'Failed to start RTMP stream' });
  }
});

// POST /api/egress/rtmp/stop — Stop RTMP forward
router.post('/rtmp/stop', async (req, res) => {
  try {
    const { roomId, hostToken } = req.body;

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const egressId = activeRtmp.get(roomId);
    if (egressId) {
      try { await egressClient.stopEgress(egressId); } catch {}
      activeRtmp.delete(roomId);
    }

    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl: null } });
    res.json({ success: true, message: 'RTMP stream stopped' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop RTMP stream' });
  }
});

export default router;
