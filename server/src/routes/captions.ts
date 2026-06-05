/**
 * server/src/routes/captions.ts
 * PHASE 6 — AI Captions REST Routes
 *
 * Mount in index.ts:
 *   import captionsRouter from './routes/captions';
 *   app.use('/api/captions', captionsRouter);
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { captionsService } from '../services/captions.service';

const router = Router();

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try { const r = await fn(req, res); if (r !== undefined) res.json(r); }
    catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ error: e.message ?? 'Internal error' });
    }
  };
}

async function verifyHost(roomId: string, hostToken: string) {
  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });
  if (stream.hostToken !== hostToken) throw Object.assign(new Error('Unauthorized'), { status: 403 });
  return stream;
}

// ── POST /api/captions/start ─────────────────────────────────────────────────
router.post('/start', handle(async (req) => {
  const { roomId, hostToken, language = 'en', provider = 'deepgram' } = req.body;
  if (!roomId || !hostToken) throw Object.assign(new Error('roomId and hostToken required'), { status: 400 });
  const stream = await verifyHost(roomId, hostToken);
  const session = await captionsService.startSession(roomId, stream.id, language, provider);
  return { ok: true, session };
}));

// ── POST /api/captions/stop ──────────────────────────────────────────────────
router.post('/stop', handle(async (req) => {
  const { roomId, hostToken } = req.body;
  const stream = await verifyHost(roomId, hostToken);
  await captionsService.stopSession(stream.roomId);
  return { ok: true };
}));

// ── GET /api/captions/status/:roomId ────────────────────────────────────────
router.get('/status/:roomId', handle(async (req) => {
  const isActive = captionsService.isActive(req.params.roomId);
  const transcript = await prisma.transcript.findFirst({
    where: { stream: { roomId: req.params.roomId } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, language: true, provider: true, status: true, startedAt: true },
  });
  return { isActive, transcript };
}));

// ── GET /api/captions/transcript/:roomId ─────────────────────────────────────
// Returns full transcript with all final segments
router.get('/transcript/:roomId', handle(async (req) => {
  const transcript = await prisma.transcript.findFirst({
    where: { stream: { roomId: req.params.roomId } },
    orderBy: { createdAt: 'desc' },
    include: {
      segments: {
        where: { isFinal: true },
        orderBy: { startMs: 'asc' },
      },
    },
  });
  if (!transcript) throw Object.assign(new Error('Transcript not found'), { status: 404 });
  return { transcript };
}));

// ── GET /api/captions/download/:roomId?format=txt|srt|vtt ────────────────────
router.get('/download/:roomId', handle(async (req, res) => {
  const format = (req.query.format as string) ?? 'txt';
  const transcript = await prisma.transcript.findFirst({
    where: { stream: { roomId: req.params.roomId } },
    orderBy: { createdAt: 'desc' },
    include: {
      segments: { where: { isFinal: true }, orderBy: { startMs: 'asc' } },
      stream: { select: { title: true } },
    },
  });
  if (!transcript) throw Object.assign(new Error('Transcript not found'), { status: 404 });

  const safeTitle = (transcript.stream.title ?? 'transcript').replace(/[^a-z0-9]/gi, '_').toLowerCase();

  if (format === 'srt') {
    const srt = buildSRT(transcript.segments);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.srt"`);
    return res.send(srt);
  }

  if (format === 'vtt') {
    const vtt = buildVTT(transcript.segments);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.vtt"`);
    return res.send(vtt);
  }

  // Plain text default
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.txt"`);
  return res.send(transcript.fullText);
}));

// ── Helpers: SRT and VTT builders ────────────────────────────────────────────

function msToSrtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000).toString().padStart(2, '0');
  const m = Math.floor((ms % 3_600_000) / 60_000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60_000) / 1_000).toString().padStart(2, '0');
  const milli = (ms % 1_000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${milli}`;
}

function msToVttTime(ms: number): string {
  return msToSrtTime(ms).replace(',', '.');
}

function buildSRT(segments: { text: string; startMs: number; endMs: number; speaker?: string | null }[]): string {
  return segments.map((s, i) => {
    const speaker = s.speaker ? `${s.speaker}: ` : '';
    return `${i + 1}\n${msToSrtTime(s.startMs)} --> ${msToSrtTime(s.endMs)}\n${speaker}${s.text}\n`;
  }).join('\n');
}

function buildVTT(segments: { text: string; startMs: number; endMs: number; speaker?: string | null }[]): string {
  const lines = ['WEBVTT\n'];
  segments.forEach((s, i) => {
    const speaker = s.speaker ? `<v ${s.speaker}>` : '';
    lines.push(`${i + 1}\n${msToVttTime(s.startMs)} --> ${msToVttTime(s.endMs)}\n${speaker}${s.text}\n`);
  });
  return lines.join('\n');
}

export default router;
