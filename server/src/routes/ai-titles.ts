import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma';

const router    = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${m}:${String(s % 60).padStart(2, '0')}`;
}

function safeJson(val: any, fallback: any) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// POST /api/ai/title/generate
router.post('/title/generate', async (req, res) => {
  try {
    const { roomId, hostToken, topic, keywords = [], style = 'engaging' } = req.body;
    if (!topic?.trim() && !roomId) return res.status(400).json({ error: 'topic or roomId required' });

    let streamTitle = topic || '';
    let transcript  = '';

    if (roomId) {
      const stream = await prisma.stream.findUnique({
        where:   { roomId },
        include: { transcript: { include: { segments: { take: 30, orderBy: { startMs: 'asc' } } } } },
      });
      if (stream) {
        if (hostToken && stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });
        streamTitle = topic || stream.title;
        transcript  = stream.transcript?.segments?.map((s: any) => s.text).join(' ') || '';
      }
    }

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 800,
      system:     'You are an expert content strategist. Return ONLY a valid JSON array of 5 objects: [{"title":"...","style":"...","hook":"..."}]. No markdown, no explanation.',
      messages:   [{
        role:    'user',
        content: `Stream topic: ${streamTitle}\nKeywords: ${keywords.join(', ')}\nStyle: ${style}\n${transcript ? `Transcript: ${transcript.slice(0, 500)}` : ''}\n\nGenerate 5 compelling stream title variations.`,
      }],
    });

    const raw = (message.content[0] as any).text?.trim() ?? '';
    let suggestions: any[] = [];
    try { suggestions = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch {
      suggestions = [{ title: streamTitle, style: 'original', hook: 'Your original title' }];
    }

    if (roomId) {
      const stream = await prisma.stream.findUnique({ where: { roomId } });
      if (stream) {
        await prisma.streamSummary.upsert({
          where:  { streamId: stream.id },
          create: {
            streamId: stream.id, title: stream.title,
            summary: '', keyTakeaways: '[]', chapters: '[]',
            actionItems: '[]', discussionPoints: '[]',
            titleSuggestions: JSON.stringify(suggestions),
          },
          update: { titleSuggestions: JSON.stringify(suggestions) },
        });
      }
    }

    res.json({ suggestions });
  } catch (err: any) {
    console.error('[ai/title/generate]', err);
    res.status(500).json({ error: 'Failed to generate titles', detail: err?.message });
  }
});

// POST /api/ai/title/apply
router.post('/title/apply', async (req, res) => {
  try {
    const { roomId, hostToken, title } = req.body;
    if (!roomId || !title) return res.status(400).json({ error: 'roomId and title required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.stream.update({ where: { roomId }, data: { title } });
    res.json({ ok: true, title: updated.title });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply title' });
  }
});

// POST /api/ai/summary/generate
router.post('/summary/generate', async (req, res) => {
  try {
    const { roomId, hostToken } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId required' });

    const stream = await prisma.stream.findUnique({
      where:   { roomId },
      include: {
        transcript: { include: { segments: { where: { isFinal: true }, orderBy: { startMs: 'asc' }, take: 200 } } },
        analytics:  true,
      },
    });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const segments = stream.transcript?.segments ?? [];
    const transcriptText = segments.length
      ? segments.map((s: any) => `[${fmtMs(s.startMs)}] ${s.text}`).join('\n').slice(0, 3000)
      : 'No transcript available.';
    const durationMin = stream.analytics ? Math.round((stream.analytics as any).durationSeconds / 60) : 0;

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      system:     'You are an expert content analyst. Return ONLY valid JSON: {"summary":"...","keyTakeaways":["..."],"chapters":[{"title":"...","startMs":0,"endMs":0,"summary":"..."}],"actionItems":["..."],"discussionPoints":["..."],"titleSuggestions":[{"title":"...","style":"...","hook":"..."}]}',
      messages:   [{
        role:    'user',
        content: `Stream: "${stream.title}"\nDuration: ${durationMin} min\nTranscript:\n${transcriptText}\n\nGenerate a comprehensive summary.`,
      }],
    });

    const raw = (message.content[0] as any).text?.trim() ?? '';
    let parsed: any = {};
    try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch {
      parsed = { summary: `Summary for "${stream.title}"`, keyTakeaways: [], chapters: [], actionItems: [], discussionPoints: [], titleSuggestions: [] };
    }

    const record = await prisma.streamSummary.upsert({
      where:  { streamId: stream.id },
      create: {
        streamId:         stream.id,
        title:            stream.title,
        summary:          parsed.summary          || '',
        keyTakeaways:     JSON.stringify(parsed.keyTakeaways     || []),
        chapters:         JSON.stringify(parsed.chapters         || []),
        actionItems:      JSON.stringify(parsed.actionItems      || []),
        discussionPoints: JSON.stringify(parsed.discussionPoints || []),
        titleSuggestions: JSON.stringify(parsed.titleSuggestions || []),
      },
      update: {
        summary:          parsed.summary          || '',
        keyTakeaways:     JSON.stringify(parsed.keyTakeaways     || []),
        chapters:         JSON.stringify(parsed.chapters         || []),
        actionItems:      JSON.stringify(parsed.actionItems      || []),
        discussionPoints: JSON.stringify(parsed.discussionPoints || []),
        titleSuggestions: JSON.stringify(parsed.titleSuggestions || []),
      },
    });

    res.json({
      summary: {
        ...record,
        keyTakeaways:     safeJson(record.keyTakeaways, []),
        chapters:         safeJson(record.chapters, []),
        actionItems:      safeJson(record.actionItems, []),
        discussionPoints: safeJson(record.discussionPoints, []),
        titleSuggestions: safeJson(record.titleSuggestions, []),
      },
    });
  } catch (err: any) {
    console.error('[ai/summary/generate]', err);
    res.status(500).json({ error: 'Failed to generate summary', detail: err?.message });
  }
});

// GET /api/ai/summary/:roomId
router.get('/summary/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const record = await prisma.streamSummary.findUnique({ where: { streamId: stream.id } });
    if (!record) return res.status(404).json({ error: 'No summary yet' });

    res.json({
      summary: {
        ...record,
        keyTakeaways:     safeJson(record.keyTakeaways, []),
        chapters:         safeJson(record.chapters, []),
        actionItems:      safeJson(record.actionItems, []),
        discussionPoints: safeJson(record.discussionPoints, []),
        titleSuggestions: safeJson(record.titleSuggestions, []),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/ai/summary/:roomId/download?format=md|json
router.get('/summary/:roomId/download', async (req, res) => {
  try {
    const fmt    = (req.query.format as string) || 'md';
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const record = await prisma.streamSummary.findUnique({ where: { streamId: stream.id } });
    if (!record) return res.status(404).json({ error: 'No summary. Generate it first.' });

    const data = {
      title:            record.title,
      summary:          record.summary,
      keyTakeaways:     safeJson(record.keyTakeaways, []),
      chapters:         safeJson(record.chapters, []),
      actionItems:      safeJson(record.actionItems, []),
      discussionPoints: safeJson(record.discussionPoints, []),
      generatedAt:      record.createdAt?.toISOString(),
    };

    const safe = (stream.title || 'summary').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (fmt === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-summary.json"`);
      return res.send(JSON.stringify(data, null, 2));
    }

    const md = [
      `# ${data.title}`,
      `> Generated: ${data.generatedAt}`, '',
      '## Summary', data.summary, '',
      data.keyTakeaways.length ? ['## Key Takeaways', ...data.keyTakeaways.map((k: string) => `- ${k}`), ''].join('\n') : '',
      data.chapters.length     ? ['## Chapters',      ...data.chapters.map((c: any) => `### ${c.title}\n${c.summary}`), ''].join('\n') : '',
      data.actionItems.length  ? ['## Action Items',  ...data.actionItems.map((a: string) => `- [ ] ${a}`), ''].join('\n') : '',
    ].filter(Boolean).join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}-summary.md"`);
    res.send(md);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download summary' });
  }
});

export default router;
