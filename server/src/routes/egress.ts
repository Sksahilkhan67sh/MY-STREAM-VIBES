import { Router, Request, Response } from 'express';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../lib/prisma';

// Use ffmpeg-static binary if system ffmpeg not available
function getFFmpegPath(): string {
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    try {
      const p = require('ffmpeg-static');
      if (p) { console.log('Using ffmpeg-static:', p); return p; }
    } catch {}
    return 'ffmpeg';
  }
}
const FFMPEG = getFFmpegPath();
console.log('FFmpeg path:', FFMPEG);

const router = Router();
const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

interface ActiveRecorder { filePath: string; fileName: string; startedAt: Date; recordingId: string; }
const activeRecorders = new Map<string, ActiveRecorder>();

interface RtmpSession { process: ChildProcess; platform: string; rtmpUrl: string; }
const rtmpSessions = new Map<string, RtmpSession>();

async function verifyHost(roomId: string, hostToken: string) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });
  if (stream.hostToken !== hostToken) throw Object.assign(new Error('Unauthorized'), { status: 403 });
  return stream;
}

router.post('/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    if (!roomId || !hostToken) return res.status(400).json({ error: 'roomId and hostToken required' });
    const stream = await verifyHost(roomId, hostToken);
    if (activeRecorders.has(roomId)) return res.json({ success: true, fileName: activeRecorders.get(roomId)!.fileName, already: true });
    const fileName = `recording-${roomId}-${Date.now()}.webm`;
    const filePath = path.join(RECORDINGS_DIR, fileName);
    const recording = await prisma.recording.create({ data: { streamId: stream.id, fileName, filePath, startedAt: new Date(), fileSize: 0 } });
    await prisma.stream.update({ where: { roomId }, data: { isRecording: true } });
    activeRecorders.set(roomId, { filePath, fileName, startedAt: new Date(), recordingId: recording.id });
    res.json({ success: true, fileName });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

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
        fs.appendFileSync(recorder.filePath, buf);
        prisma.recording.update({ where: { id: recorder.recordingId }, data: { fileSize: fs.statSync(recorder.filePath).size } }).catch(() => {});
      }
      res.json({ success: true, bytes: buf.length });
    });
    req.on('error', () => res.status(500).json({ error: 'Read failed' }));
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken } = req.body;
    await verifyHost(roomId, hostToken);
    const recorder = activeRecorders.get(roomId);
    if (!recorder) return res.status(400).json({ error: 'No active recording' });
    const endedAt = new Date();
    const fileSize = fs.existsSync(recorder.filePath) ? fs.statSync(recorder.filePath).size : 0;
    const durationSec = Math.round((endedAt.getTime() - recorder.startedAt.getTime()) / 1000);
    await prisma.recording.update({ where: { id: recorder.recordingId }, data: { endedAt, fileSize, durationSec } });
    await prisma.stream.update({ where: { roomId }, data: { isRecording: false } });
    activeRecorders.delete(roomId);
    res.json({ success: true, fileName: recorder.fileName, fileSize, durationSec });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/recordings/:roomId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    if (!hostToken) return res.status(400).json({ error: 'hostToken required' });
    const stream = await verifyHost(req.params.roomId, hostToken);
    const recordings = await prisma.recording.findMany({ where: { streamId: stream.id }, orderBy: { startedAt: 'desc' } });
    res.json(recordings.map(r => ({
      id: r.id, fileName: r.fileName, fileSize: r.fileSize, durationSec: r.durationSec,
      startedAt: r.startedAt, endedAt: r.endedAt,
      downloadUrl: `/api/egress/download/${encodeURIComponent(r.fileName)}`,
      exists: fs.existsSync(r.filePath),
    })));
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/download/:fileName', (req: Request, res: Response) => {
  try {
    const safe = path.basename(req.params.fileName);
    if (!safe.match(/\.(webm|mp4)$/i)) return res.status(400).json({ error: 'Invalid file' });
    const filePath = path.join(RECORDINGS_DIR, safe);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/recordings/:id', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.body;
    const recording = await prisma.recording.findUnique({ where: { id: req.params.id }, include: { stream: true } });
    if (!recording) return res.status(404).json({ error: 'Not found' });
    if ((recording.stream as any).hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });
    if (fs.existsSync(recording.filePath)) fs.unlinkSync(recording.filePath);
    await prisma.recording.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/ffmpeg-check', (_req: Request, res: Response) => {
  try { execSync(`${FFMPEG} -version`, { stdio: 'ignore' }); res.json({ available: true }); }
  catch { res.json({ available: false }); }
});

router.post('/rtmp/start', async (req: Request, res: Response) => {
  try {
    const { roomId, hostToken, rtmpUrl, platform } = req.body;
    if (!rtmpUrl) return res.status(400).json({ error: 'rtmpUrl required' });
    await verifyHost(roomId, hostToken);
    try { execSync(`${FFMPEG} -version`, { stdio: 'ignore' }); }
    catch { return res.status(500).json({ error: 'FFmpeg not available on server' }); }
    if (rtmpSessions.has(roomId)) {
      try { rtmpSessions.get(roomId)!.process.kill('SIGTERM'); } catch {}
      rtmpSessions.delete(roomId);
    }
    const args = [
      '-loglevel', 'warning', '-re', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '5000k',
      '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-f', 'flv', rtmpUrl,
    ];
    const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stderr?.on('data', (d: Buffer) => console.log(`[ffmpeg:${roomId}]`, d.toString().trim()));
    proc.on('close', (code) => { rtmpSessions.delete(roomId); });
    proc.on('error', (e) => { rtmpSessions.delete(roomId); });
    rtmpSessions.set(roomId, { process: proc, platform, rtmpUrl });
    await prisma.stream.update({ where: { roomId }, data: { rtmpUrl } });
    res.json({ success: true });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/rtmp/chunk', async (req: Request, res: Response) => {
  try {
    const roomId    = req.headers['x-room-id'] as string;
    const hostToken = req.headers['x-host-token'] as string;
    if (!roomId || !hostToken) return res.status(400).json({ error: 'Headers required' });
    await verifyHost(roomId, hostToken);
    const session = rtmpSessions.get(roomId);
    if (!session || !session.process.stdin) return res.status(400).json({ error: 'No active RTMP session' });
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) {
        try { session.process.stdin!.write(buf); } catch {}
      }
      res.json({ success: true, bytes: buf.length });
    });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

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

router.get('/rtmp/status/:roomId', async (req: Request, res: Response) => {
  try {
    const { hostToken } = req.query as { hostToken: string };
    await verifyHost(req.params.roomId, hostToken);
    res.json({ active: rtmpSessions.has(req.params.roomId) });
  } catch (err: any) { res.status(err.status || 500).json({ error: err.message }); }
});

export default router;
