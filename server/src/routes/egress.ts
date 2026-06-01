import { Router, Request, Response } from 'express';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../lib/prisma';
import { uploadToS3, deleteFromS3, isS3Configured } from '../lib/s3';

// ── FFmpeg path resolution ────────────────────────────────────
function getFFmpegPath(): string {
  // 1. System ffmpeg
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {}
  // 2. ffmpeg-static bundled binary (works on Render)
  try {
    const p = require('ffmpeg-static');
    if (p) { console.log('Using ffmpeg-static:', p); return String(p); }
  } catch {}
  return 'ffmpeg'; // last resort — will fail gracefully at call-time
}

const FFMPEG = getFFmpegPath();
console.log('FFmpeg path resolved:', FFMPEG);

const router = Router();

// Use /tmp on production (Render's /tmp is writable even on free tier)
// Use local recordings/ in development
const RECORDINGS_DIR = process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'recordings')
  : path.join(process.cwd(), 'recordings');

if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

// ── Recover stuck states on server restart ────────────────────
// If server restarts mid-recording or mid-RTMP, DB has stale isRecording/rtmpUrl = true
// Reset them so host UI doesn't show phantom "recording in progress"
(async () => {
  try {
    await prisma.stream.updateMany({
      where: { OR: [{ isRecording: true }, { rtmpUrl: { not: null } }] },
      data:  { isRecording: false, rtmpUrl: null },
    });
    console.log('✅ Cleared stale recording/RTMP states');
  } catch (e) {
    console.error('State recovery error:', e);
  }
})();

interface ActiveRecorder {
  filePath:    string;
  fileName:    string;
  startedAt:   Date;
  recordingId: string;
}
const activeRecorders = new Map<string, ActiveRecorder>();

interface RtmpSession { process: ChildProcess; platform: string; rtmpUrl: string; }
const rtmpSessions = new Map<string, RtmpSession>();

async function verifyHost(roomId: string, hostToken: string) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });
  if (stream.hostToken !== hostToken) throw Object.assign(new Error('Unauthorized'), { status: 403 });
  return stream;
}

// ── POST /api/egress/start ────────────────────────────────────
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    if (!roomId || !hostToken) return res.status(400).json({ error: 'roomId and hostToken required' });
    const stream = await verifyHost(roomId, hostToken);
    if (activeRecorders.has(roomId)) {
      return res.json({ success: true, fileName: activeRecorders.get(roomId)!.fileName, already: true });
    }
    const fileName  = `recording-${roomId}-${Date.now()}.webm`;
    const filePath  = path.join(RECORDINGS_DIR, fileName);
    const recording = await prisma.recording.create({
      data: { streamId: stream.id, fileName, filePath, startedAt: new Date(), fileSize: 0 },
    });
    await prisma.stream.update({ where: { roomId }, data: { isRecording: true } });
    activeRecorders.set(roomId, { filePath, fileName, startedAt: new Date(), recordingId: recording.id });
    res.json({ success: true, fileName });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── POST /api/egress/chunk ────────────────────────────────────
router.post('/chunk', async (req: Request, res: Response) => {
  try {
    const roomId    = req.headers['x-room-id'] as string;
    const hostToken = req.headers['x-host-token'] as string;
    if (!roomId || !hostToken) return res.status(400).json({ error: 'Headers required' });
    await verifyHost(roomId, hostToken);
    const recorder = activeRecorders.get(roomId);
    if (!recorder) return res.status(400).json({ error: 'No active recording' });
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) {
        try {
          fs.appendFileSync(recorder.filePath, buf);
          prisma.recording
            .update({ where: { id: recorder.recordingId }, data: { fileSize: fs.statSync(recorder.filePath).size } })
            .catch(() => {});
        } catch (writeErr) {
          console.error('Chunk write error:', writeErr);
        }
      }
      res.json({ success: true, bytes: buf.length });
    });
    req.on('error', () => res.status(500).json({ error: 'Read failed' }));
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── POST /api/egress/stop ─────────────────────────────────────
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    await verifyHost(roomId, hostToken);
    const recorder = activeRecorders.get(roomId);
    if (!recorder) return res.status(400).json({ error: 'No active recording' });

    const endedAt     = new Date();
    const fileExists  = fs.existsSync(recorder.filePath);
    const fileSize    = fileExists ? fs.statSync(recorder.filePath).size : 0;
    const durationSec = Math.round((endedAt.getTime() - recorder.startedAt.getTime()) / 1000);

    // Upload to S3 if configured, otherwise keep local
    let recordingUrl: string | null = null;
    if (isS3Configured() && fileExists) {
      recordingUrl = await uploadToS3(recorder.filePath, recorder.fileName);
      if (recordingUrl) {
        // Clean up temp file after successful upload
        try { fs.unlinkSync(recorder.filePath); } catch {}
      }
    }

    await prisma.recording.update({
      where: { id: recorder.recordingId },
      data:  { endedAt, fileSize, durationSec },
    });
    // Store cloud URL on stream record if available
    if (recordingUrl) {
      await prisma.stream.update({ where: { roomId }, data: { recordingUrl, isRecording: false } });
    } else {
      await prisma.stream.update({ where: { roomId }, data: { isRecording: false } });
    }

    activeRecorders.delete(roomId);
    res.json({ success: true, fileName: recorder.fileName, fileSize, durationSec, recordingUrl });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── GET /api/egress/recordings/:roomId ───────────────────────
router.get('/recordings/:roomId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    if (!hostToken) return res.status(400).json({ error: 'hostToken required' });
    const stream = await verifyHost(req.params.roomId, hostToken);
    const recordings = await prisma.recording.findMany({
      where: { streamId: stream.id },
      orderBy: { startedAt: 'desc' },
    });
    res.json(recordings.map(r => {
      const localExists = fs.existsSync(r.filePath);
      const s3Url = isS3Configured() ? null : null; // populated via stream.recordingUrl
      return {
        id:          r.id,
        fileName:    r.fileName,
        fileSize:    r.fileSize,
        durationSec: r.durationSec,
        startedAt:   r.startedAt,
        endedAt:     r.endedAt,
        // Provide download URL only if file exists locally (dev) or S3 configured (prod)
        downloadUrl: localExists
          ? `/api/egress/download/${encodeURIComponent(r.fileName)}`
          : s3Url,
        exists: localExists || isS3Configured(),
      };
    }));
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── GET /api/egress/download/:fileName ───────────────────────
// Requires hostToken query param to prevent unauthorized downloads
router.get('/download/:fileName', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    if (!hostToken) return res.status(401).json({ error: 'hostToken required' });

    const safe = path.basename(req.params.fileName);
    if (!safe.match(/\.(webm|mp4)$/i)) return res.status(400).json({ error: 'Invalid file type' });

    // Verify the hostToken owns a stream that has this recording
    const recording = await prisma.recording.findFirst({
      where: { fileName: safe },
      include: { stream: true },
    });
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    if (recording.stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const filePath = path.join(RECORDINGS_DIR, safe);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found. It may have been uploaded to cloud storage.' });
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/egress/recordings/:id ────────────────────────
router.delete('/recordings/:id', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.body;
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id },
      include: { stream: true },
    });
    if (!recording) return res.status(404).json({ error: 'Not found' });
    if ((recording.stream as any).hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    // Delete local file
    if (fs.existsSync(recording.filePath)) fs.unlinkSync(recording.filePath);
    // Delete from S3 if configured
    if (isS3Configured()) await deleteFromS3(recording.fileName);

    await prisma.recording.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── GET /api/egress/ffmpeg-check ─────────────────────────────
router.get('/ffmpeg-check', (_req: Request, res: Response) => {
  try {
    execSync(`"${FFMPEG}" -version`, { stdio: 'ignore' });
    res.json({ available: true, path: FFMPEG });
  } catch {
    res.json({ available: false, path: FFMPEG });
  }
});

// ── POST /api/egress/rtmp/start ───────────────────────────────
// Pipes browser WebM chunks → FFmpeg stdin → RTMP output
// This works on Render because it uses stdin, NOT TCP ports
router.post('/rtmp/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken, rtmpUrl, platform } = req.body;
    if (!rtmpUrl) return res.status(400).json({ error: 'rtmpUrl required' });
    await verifyHost(roomId, hostToken);

    // Check FFmpeg availability
    try { execSync(`"${FFMPEG}" -version`, { stdio: 'ignore' }); }
    catch { return res.status(500).json({ error: 'FFmpeg not available on this server. Recording still works.' }); }

    // Kill existing session for this room
    if (rtmpSessions.has(roomId)) {
      try { rtmpSessions.get(roomId)!.process.kill('SIGTERM'); } catch {}
      rtmpSessions.delete(roomId);
    }

    // stdin-based pipe: browser sends chunks → /api/egress/rtmp/chunk → FFmpeg stdin → RTMP
    const args = [
      '-loglevel',   'warning',
      // NO -re flag: -re throttles to realtime which breaks chunked/piped stdin
      // FFmpeg should process as fast as data arrives
      '-fflags',     '+nobuffer+genpts',
      '-i',          'pipe:0',          // read WebM from stdin (continuous stream)
      '-c:v',        'libx264',
      '-preset',     'veryfast',
      '-tune',       'zerolatency',
      '-b:v',        '2500k',
      '-maxrate',    '2500k',
      '-bufsize',    '5000k',
      '-pix_fmt',    'yuv420p',
      '-g',          '60',
      '-keyint_min', '60',
      '-c:a',        'aac',
      '-b:a',        '128k',
      '-ar',         '44100',
      '-ac',         '2',
      '-f',          'flv',
      '-flvflags',   'no_duration_filesize',
      rtmpUrl,
    ];

    const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stderr?.on('data', (d: Buffer) => console.log(`[ffmpeg:${roomId}]`, d.toString().trim()));
    proc.on('close', () => { rtmpSessions.delete(roomId); console.log(`[ffmpeg:${roomId}] closed`); });
    proc.on('error', (e: Error) => { console.error(`[ffmpeg:${roomId}] error:`, e.message); rtmpSessions.delete(roomId); });

    rtmpSessions.set(roomId, { process: proc, platform, rtmpUrl });
    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl } });
    res.json({ success: true, message: 'RTMP relay started. Send chunks to /api/egress/rtmp/chunk.' });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── POST /api/egress/rtmp/chunk ───────────────────────────────
router.post('/rtmp/chunk', async (req: Request, res: Response) => {
  try {
    const roomId    = req.headers['x-room-id'] as string;
    const hostToken = req.headers['x-host-token'] as string;
    if (!roomId || !hostToken) return res.status(400).json({ error: 'x-room-id and x-host-token headers required' });
    await verifyHost(roomId, hostToken);
    const session = rtmpSessions.get(roomId);
    if (!session || !session.process.stdin) return res.status(400).json({ error: 'No active RTMP session' });

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) {
        try { session.process.stdin!.write(buf); } catch (e) {
          console.error(`[ffmpeg:${roomId}] stdin write error:`, e);
        }
      }
      res.json({ success: true, bytes: buf.length });
    });
    req.on('error', () => res.status(500).json({ error: 'Read failed' }));
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});


// ── POST /api/egress/rtmp/stream ─────────────────────────────
// Single continuous streaming POST — browser pipes WebM directly
// to FFmpeg stdin without chunking. This is the correct approach
// because FFmpeg needs an uninterrupted WebM stream, not isolated blobs.
router.post('/rtmp/stream', async (req: Request, res: Response) => {
  try {
    const roomId    = req.headers['x-room-id'] as string;
    const hostToken = req.headers['x-host-token'] as string;
    if (!roomId || !hostToken) return res.status(400).json({ error: 'Headers required' });
    await verifyHost(roomId, hostToken);

    const session = rtmpSessions.get(roomId);
    if (!session || !session.process.stdin) {
      return res.status(400).json({ error: 'No active RTMP session. Call /rtmp/start first.' });
    }

    // Pipe the request body directly into FFmpeg stdin
    // req is a readable stream — pipe it straight through
    req.pipe(session.process.stdin);

    // When client disconnects or aborts, end FFmpeg stdin cleanly
    req.on('close', () => {
      try { session.process.stdin?.end(); } catch {}
      res.end();
    });

    req.on('error', () => {
      try { session.process.stdin?.end(); } catch {}
      res.end();
    });

    // Keep the response open — client is streaming
    // We respond 200 immediately so client knows the pipe is established
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify({ ok: true }));
    // Do NOT call res.end() — connection stays open while streaming

  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── POST /api/egress/rtmp/stop ────────────────────────────────
router.post('/rtmp/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    await verifyHost(roomId, hostToken);
    const session = rtmpSessions.get(roomId);
    if (session) {
      try { session.process.stdin?.end(); session.process.kill('SIGTERM'); } catch {}
      rtmpSessions.delete(roomId);
    }
    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl: null } });
    res.json({ success: true });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── GET /api/egress/rtmp/status/:roomId ──────────────────────
router.get('/rtmp/status/:roomId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    await verifyHost(req.params.roomId, hostToken);
    res.json({ active: rtmpSessions.has(req.params.roomId) });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

export default router;
