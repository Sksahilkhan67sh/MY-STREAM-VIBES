import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const prisma = new PrismaClient();

// ── Recording storage directory ───────────────────────────────
const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

// ── In-memory recorder state (per room) ──────────────────────
interface RecorderState {
  roomId: string;
  startedAt: Date;
  filePath: string;
  fileName: string;
  stream: import('stream').Writable | null;
}
const activeRecorders = new Map<string, RecorderState>();

// ── POST /api/egress/start — begin recording ──────────────────
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    const streamRecord = await prisma.stream.findUnique({ where: { roomId } });
    if (!streamRecord) return res.status(404).json({ error: 'Stream not found' });
    if (streamRecord.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });
    if (activeRecorders.has(roomId)) return res.status(400).json({ error: 'Already recording' });

    const startedAt = new Date();
    const fileName = `recording-${roomId}-${startedAt.getTime()}.webm`;
    const filePath = path.join(RECORDINGS_DIR, fileName);

    // Store recording metadata in DB
    await prisma.stream.update({
      where: { roomId },
      data: { isRecording: true },
    });

    // Track in memory
    activeRecorders.set(roomId, {
      roomId,
      startedAt,
      filePath,
      fileName,
      stream: null,
    });

    res.json({
      success: true,
      message: 'Recording started',
      fileName,
      startedAt: startedAt.toISOString(),
    });
  } catch (err) {
    console.error('Start recording error:', err);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

// ── POST /api/egress/chunk — receive video chunk from browser ─
router.post('/chunk', async (req: Request, res: Response) => {
  try {
    const roomId = req.headers['x-room-id'] as string;
    const hostToken = req.headers['x-host-token'] as string;

    if (!roomId || !hostToken) return res.status(400).json({ error: 'Missing headers' });

    const streamRecord = await prisma.stream.findUnique({ where: { roomId } });
    if (!streamRecord || streamRecord.hostToken !== hostToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const recorder = activeRecorders.get(roomId);
    if (!recorder) return res.status(400).json({ error: 'No active recording' });

    // Write chunk to file
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      fs.appendFileSync(recorder.filePath, buffer);
      res.json({ success: true, bytes: buffer.length });
    });
    req.on('error', () => res.status(500).json({ error: 'Stream error' }));
  } catch (err) {
    console.error('Chunk error:', err);
    res.status(500).json({ error: 'Failed to save chunk' });
  }
});

// ── POST /api/egress/stop — finish recording ──────────────────
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    const streamRecord = await prisma.stream.findUnique({ where: { roomId } });
    if (!streamRecord) return res.status(404).json({ error: 'Stream not found' });
    if (streamRecord.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const recorder = activeRecorders.get(roomId);
    if (!recorder) {
      await prisma.stream.update({ where: { roomId }, data: { isRecording: false } });
      return res.json({ success: true, message: 'No active recording found' });
    }

    activeRecorders.delete(roomId);

    // Get file size
    let fileSize = 0;
    let durationSec = 0;
    if (fs.existsSync(recorder.filePath)) {
      const stat = fs.statSync(recorder.filePath);
      fileSize = stat.size;
      durationSec = Math.round((Date.now() - recorder.startedAt.getTime()) / 1000);
    }

    // Save recording record to DB
    await prisma.recording.create({
      data: {
        streamId: streamRecord.id,
        fileName: recorder.fileName,
        filePath: recorder.filePath,
        fileSize,
        durationSec,
        startedAt: recorder.startedAt,
        endedAt: new Date(),
      },
    });

    await prisma.stream.update({ where: { roomId }, data: { isRecording: false } });

    res.json({
      success: true,
      fileName: recorder.fileName,
      fileSize,
      durationSec,
      downloadUrl: `/api/egress/download/${recorder.fileName}`,
    });
  } catch (err) {
    console.error('Stop recording error:', err);
    res.status(500).json({ error: 'Failed to stop recording' });
  }
});

// ── GET /api/egress/recordings/:roomId — list recordings ──────
router.get('/recordings/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { hostToken } = req.query as { hostToken: string };

    const streamRecord = await prisma.stream.findUnique({ where: { roomId } });
    if (!streamRecord) return res.status(404).json({ error: 'Stream not found' });
    if (streamRecord.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const recordings = await prisma.recording.findMany({
      where: { streamId: streamRecord.id },
      orderBy: { startedAt: 'desc' },
    });

    res.json(recordings.map(r => ({
      id: r.id,
      fileName: r.fileName,
      fileSize: r.fileSize,
      durationSec: r.durationSec,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      downloadUrl: `/api/egress/download/${r.fileName}`,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

// ── GET /api/egress/download/:fileName — download recording ───
router.get('/download/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    // Security: only allow safe filenames
    if (!/^recording-[a-z0-9]+-\d+\.webm$/.test(fileName)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(RECORDINGS_DIR, fileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download recording' });
  }
});

// ── DELETE /api/egress/recordings/:id — delete a recording ───
router.delete('/recordings/:id', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.body;
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id },
      include: { stream: true },
    });

    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if (recording.stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    // Delete file
    if (fs.existsSync(recording.filePath)) {
      fs.unlinkSync(recording.filePath);
    }
    await prisma.recording.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

// ── RTMP routes (unchanged) ───────────────────────────────────
router.post('/rtmp/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken, rtmpUrl, platform } = req.body;
    if (!rtmpUrl) return res.status(400).json({ error: 'RTMP URL is required' });
    const streamRecord = await prisma.stream.findUnique({ where: { roomId } });
    if (!streamRecord) return res.status(404).json({ error: 'Stream not found' });
    if (streamRecord.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });
    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl } });
    res.json({ success: true, platform, note: 'RTMP registered. LiveKit Egress required for forwarding.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start RTMP stream' });
  }
});

router.post('/rtmp/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    const streamRecord = await prisma.stream.findUnique({ where: { roomId } });
    if (!streamRecord) return res.status(404).json({ error: 'Stream not found' });
    if (streamRecord.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });
    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl: null } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop RTMP stream' });
  }
});

export default router;
