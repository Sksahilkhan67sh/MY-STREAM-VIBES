import { Router, Request, Response } from 'express';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../lib/prisma';

const router = Router();

// ── Recordings directory ──────────────────────────────────────
const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// ── In-memory sessions ────────────────────────────────────────
interface ActiveRecorder {
  filePath:    string;
  fileName:    string;
  startedAt:   Date;
  recordingId: string;
}
const activeRecorders = new Map<string, ActiveRecorder>();

interface RtmpSession {
  process:   ReturnType<typeof spawn>;
  platform:  string;
  rtmpUrl:   string;
  inputPort: number;
}
const rtmpSessions = new Map<string, RtmpSession>();

// ── Helpers ───────────────────────────────────────────────────
async function verifyHost(roomId: string, hostToken: string) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });
  if (stream.hostToken !== hostToken) throw Object.assign(new Error('Unauthorized'), { status: 403 });
  return stream;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const net = require('net');
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ══════════════════════════════════════════════════════════════
//  RECORDING ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/egress/start
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    if (!roomId || !hostToken) {
      return res.status(400).json({ error: 'roomId and hostToken are required' });
    }

    const stream = await verifyHost(roomId, hostToken);

    if (activeRecorders.has(roomId)) {
      const rec = activeRecorders.get(roomId)!;
      return res.json({ success: true, fileName: rec.fileName, already: true });
    }

    const ts       = Date.now();
    const fileName = `recording-${roomId}-${ts}.webm`;
    const filePath = path.join(RECORDINGS_DIR, fileName);

    const recording = await prisma.recording.create({
      data: {
        streamId:  stream.id,
        fileName,
        filePath,
        startedAt: new Date(),
        fileSize:  0,
      },
    });

    await prisma.stream.update({ where: { roomId }, data: { isRecording: true } });

    activeRecorders.set(roomId, {
      filePath,
      fileName,
      startedAt:   new Date(),
      recordingId: recording.id,
    });

    console.log('Recording started:', fileName);
    res.json({ success: true, fileName });
  } catch (err: any) {
    console.error('Start recording error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to start recording' });
  }
});

// POST /api/egress/chunk
router.post('/chunk', async (req: Request, res: Response) => {
  try {
    const roomId    = req.headers['x-room-id']    as string;
    const hostToken = req.headers['x-host-token'] as string;

    if (!roomId || !hostToken) {
      return res.status(400).json({ error: 'x-room-id and x-host-token headers required' });
    }

    await verifyHost(roomId, hostToken);

    const recorder = activeRecorders.get(roomId);
    if (!recorder) {
      return res.status(400).json({ error: 'No active recording — call /start first' });
    }

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) return res.json({ success: true, bytes: 0 });

        fs.appendFileSync(recorder.filePath, buffer);

        const size = fs.statSync(recorder.filePath).size;
        prisma.recording.update({
          where: { id: recorder.recordingId },
          data:  { fileSize: size },
        }).catch(() => {});

        res.json({ success: true, bytes: buffer.length });
      } catch (e: any) {
        console.error('Chunk write error:', e.message);
        res.status(500).json({ error: 'Failed to write chunk' });
      }
    });

    req.on('error', (e: Error) => {
      res.status(500).json({ error: 'Failed to read request: ' + e.message });
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/egress/stop
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    await verifyHost(roomId, hostToken);

    const recorder = activeRecorders.get(roomId);
    if (!recorder) {
      return res.status(400).json({ error: 'No active recording' });
    }

    const endedAt  = new Date();
    const fileSize = fs.existsSync(recorder.filePath)
      ? fs.statSync(recorder.filePath).size
      : 0;
    const durationSec = Math.round(
      (endedAt.getTime() - recorder.startedAt.getTime()) / 1000
    );

    await prisma.recording.update({
      where: { id: recorder.recordingId },
      data:  { endedAt, fileSize, durationSec },
    });

    await prisma.stream.update({ where: { roomId }, data: { isRecording: false } });

    activeRecorders.delete(roomId);

    console.log('Recording stopped:', recorder.fileName);
    res.json({ success: true, fileName: recorder.fileName, fileSize, durationSec });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/egress/recordings/:roomId
router.get('/recordings/:roomId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    const { roomId }    = req.params;

    if (!hostToken) return res.status(400).json({ error: 'hostToken query param required' });

    const stream = await verifyHost(roomId, hostToken);

    const recordings = await prisma.recording.findMany({
      where:   { streamId: stream.id },
      orderBy: { startedAt: 'desc' },
    });

    const result = recordings.map(r => ({
      id:          r.id,
      fileName:    r.fileName,
      fileSize:    r.fileSize,
      durationSec: r.durationSec,
      startedAt:   r.startedAt,
      endedAt:     r.endedAt,
      downloadUrl: `/api/egress/download/${encodeURIComponent(r.fileName)}`,
      exists:      fs.existsSync(r.filePath),
    }));

    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/egress/download/:fileName
router.get('/download/:fileName', (req: Request, res: Response) => {
  try {
    const safe = path.basename(req.params.fileName);

    if (!safe.match(/\.(webm|mp4)$/i)) {
      return res.status(400).json({ error: 'Invalid file extension' });
    }

    const filePath = path.join(RECORDINGS_DIR, safe);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Recording file not found' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Accept-Ranges', 'bytes');

    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/egress/recordings/:id
router.delete('/recordings/:id', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.body;
    if (!hostToken) return res.status(400).json({ error: 'hostToken required' });

    const recording = await prisma.recording.findUnique({
      where:   { id: req.params.id },
      include: { stream: true },
    });
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if ((recording.stream as any).hostToken !== hostToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (fs.existsSync(recording.filePath)) fs.unlinkSync(recording.filePath);
    await prisma.recording.delete({ where: { id: req.params.id } });

    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  RTMP ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/egress/ffmpeg-check
router.get('/ffmpeg-check', (_req: Request, res: Response) => {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    res.json({ available: true });
  } catch {
    res.json({ available: false });
  }
});

// POST /api/egress/rtmp/start
router.post('/rtmp/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken, rtmpUrl, platform } = req.body;
    if (!rtmpUrl) return res.status(400).json({ error: 'rtmpUrl is required' });

    await verifyHost(roomId, hostToken);

    try { execSync('ffmpeg -version', { stdio: 'ignore' }); }
    catch {
      return res.status(500).json({ error: 'FFmpeg not found. Run: winget install ffmpeg' });
    }

    if (rtmpSessions.has(roomId)) {
      try { rtmpSessions.get(roomId)!.process.kill('SIGTERM'); } catch {}
      rtmpSessions.delete(roomId);
    }

    const inputPort = await getFreePort();

    const args = [
      '-loglevel', 'warning',
      '-f', 'webm_dash_manifest', '-re',
      '-i', `tcp://127.0.0.1:${inputPort}?listen`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '5000k',
      '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-f', 'flv', '-flvflags', 'no_duration_filesize',
      rtmpUrl,
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stderr?.on('data', (d: Buffer) => console.log(`[ffmpeg:${roomId}]`, d.toString().trim()));
    proc.on('close', (code) => { console.log(`[ffmpeg:${roomId}] closed`, code); rtmpSessions.delete(roomId); });
    proc.on('error', (e)    => { console.error(`[ffmpeg:${roomId}]`, e.message); rtmpSessions.delete(roomId); });

    rtmpSessions.set(roomId, { process: proc, platform, rtmpUrl, inputPort });
    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl } });

    res.json({ success: true, inputPort });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/egress/rtmp/chunk
router.post('/rtmp/chunk', async (req: Request, res: Response) => {
  try {
    const roomId    = req.headers['x-room-id']    as string;
    const hostToken = req.headers['x-host-token'] as string;
    if (!roomId || !hostToken) return res.status(400).json({ error: 'Headers required' });

    await verifyHost(roomId, hostToken);

    const session = rtmpSessions.get(roomId);
    if (!session) return res.status(400).json({ error: 'No active RTMP session' });

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) return res.json({ success: true, bytes: 0 });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const net = require('net');
      const client = net.createConnection(session.inputPort, '127.0.0.1');
      client.on('connect', () => { client.write(buf); client.end(); });
      client.on('error',   (e: Error) => console.warn('[rtmp chunk]', e.message));
      client.on('close',   () => res.json({ success: true, bytes: buf.length }));
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/egress/rtmp/stop
router.post('/rtmp/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    await verifyHost(roomId, hostToken);

    const session = rtmpSessions.get(roomId);
    if (session) {
      try { session.process.kill('SIGTERM'); } catch {}
      rtmpSessions.delete(roomId);
    }

    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl: null } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/egress/rtmp/status/:roomId
router.get('/rtmp/status/:roomId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    await verifyHost(req.params.roomId, hostToken);
    res.json({ active: rtmpSessions.has(req.params.roomId) });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
