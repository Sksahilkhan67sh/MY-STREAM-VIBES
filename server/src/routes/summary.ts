/**
 * server/src/routes/summary.ts
 * PHASE 7 — AI Stream Summary Routes
 *
 * Mount in index.ts:
 *   import summaryRouter from './routes/summary';
 *   app.use('/api/summary', summaryRouter);
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { generateStreamSummary, summaryToMarkdown } from '../services/ai-summary.service';

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

// ── POST /api/summary/generate ───────────────────────────────────────────────
// Trigger generation for a completed stream
router.post('/generate', handle(async (req) => {
  const { roomId, hostToken } = req.body;
  if (!roomId || !hostToken) throw Object.assign(new Error('roomId and hostToken required'), { status: 400 });

  const stream = await prisma.stream.findUnique({ where: { roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });
  if (stream.hostToken !== hostToken) throw Object.assign(new Error('Unauthorized'), { status: 403 });

  const summary = await generateStreamSummary(stream.id);
  return { summary };
}));

// ── GET /api/summary/:roomId ─────────────────────────────────────────────────
router.get('/:roomId', handle(async (req) => {
  const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });

  // Try to get existing summary from DB
  const db = prisma as unknown as {
    streamSummary: { findUnique: (q: { where: { streamId: string } }) => Promise<Record<string, unknown> | null> }
  };
  const raw = await db.streamSummary?.findUnique({ where: { streamId: stream.id } });
  if (!raw) throw Object.assign(new Error('No summary generated yet'), { status: 404 });

  // Parse JSON fields
  const summary = {
    ...raw,
    keyTakeaways: JSON.parse(raw.keyTakeaways as string ?? '[]'),
    chapters: JSON.parse(raw.chapters as string ?? '[]'),
    actionItems: JSON.parse(raw.actionItems as string ?? '[]'),
    discussionPoints: JSON.parse(raw.discussionPoints as string ?? '[]'),
  };
  return { summary };
}));

// ── GET /api/summary/:roomId/download?format=md|txt ─────────────────────────
router.get('/:roomId/download', handle(async (req, res) => {
  const format = (req.query.format as string) ?? 'md';
  const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
  if (!stream) throw Object.assign(new Error('Stream not found'), { status: 404 });

  const db = prisma as unknown as {
    streamSummary: { findUnique: (q: { where: { streamId: string } }) => Promise<Record<string, unknown> | null> }
  };
  const raw = await db.streamSummary?.findUnique({ where: { streamId: stream.id } });
  if (!raw) throw Object.assign(new Error('No summary yet. Generate it first.'), { status: 404 });

  const summary = {
    ...raw,
    keyTakeaways: JSON.parse(raw.keyTakeaways as string ?? '[]'),
    chapters: JSON.parse(raw.chapters as string ?? '[]'),
    actionItems: JSON.parse(raw.actionItems as string ?? '[]'),
    discussionPoints: JSON.parse(raw.discussionPoints as string ?? '[]'),
    generatedAt: (raw.createdAt as Date).toISOString(),
  } as Parameters<typeof summaryToMarkdown>[0];

  const safeTitle = (stream.title ?? 'summary').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const md = summaryToMarkdown(summary);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-summary.md"`);
  return res.send(md);
}));

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: Prisma schema addition — add to schema.prisma:
// Run: npx prisma migrate dev --name phase7_ai_summary
// ═══════════════════════════════════════════════════════════════════════════
/*
model StreamSummary {
  id                String   @id @default(cuid())
  streamId          String   @unique
  stream            Stream   @relation(fields: [streamId], references: [id], onDelete: Cascade)

  title             String
  summary           String   @db.Text
  keyTakeaways      String   @db.Text  // JSON array
  chapters          String   @db.Text  // JSON array of Chapter objects
  actionItems       String   @db.Text  // JSON array
  discussionPoints  String   @db.Text  // JSON array

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
// Also add to Stream model:
//   summary   StreamSummary?
*/
