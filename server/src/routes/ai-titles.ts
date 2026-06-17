/**
 * server/src/routes/ai-titles.ts
 * Feature 8: AI Title Generation
 *
 * POST /api/ai/title/generate   — generate title suggestions from topic/transcript
 * POST /api/ai/title/apply      — apply a chosen title to a stream
 */

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/ai/title/generate
router.post('/title/generate', async (req, res) => {
  try {
    const { roomId, hostToken, topic, description, keywords, style = 'engaging' } = req.body;
    if (!topic && !roomId) return res.status(400).json({ error: 'topic or roomId required' });

    let transcript = '';
    let streamTitle = topic || '';

    // If roomId provided, pull transcript context
    if (roomId) {
      const stream = await prisma.stream.findUnique({
        where: { roomId },
        include: { transcript: { include: { segments: { take: 50, orderBy: { startMs: 'asc' } } } } },
      });
      if (stream) {
        if (hostToken && stream.hostToken !== hostToken) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        streamTitle = topic || stream.title;
        if (stream.transcript?.segments?.length) {
          transcript = stream.transcript.segments.slice(0, 30).map((s: any) => s.text).join(' ');
        }
      }
    }

    const systemPrompt = `You are an expert content strategist who creates viral, engaging stream titles.
Generate exactly 5 title suggestions. Return ONLY valid JSON array, no markdown, no explanation:
[
  { "title": "...", "style": "...", "hook": "..." },
  ...
]
Style options: engaging, clickbait, professional, question, listicle
Hook is a one-sentence reason why viewers will click.`;

    const userPrompt = `Stream topic: ${streamTitle}
${description ? `Description: ${description}` : ''}
${keywords?.length ? `Keywords: ${keywords.join(', ')}` : ''}
${transcript ? `Transcript excerpt: ${transcript.slice(0, 500)}` : ''}
Preferred style: ${style}

Generate 5 title variations that are compelling, SEO-friendly, and optimized for a live streaming audience.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const raw = (message.content[0] as any).text?.trim() ?? '';
    let suggestions: any[] = [];
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      suggestions = JSON.parse(clean);
    } catch {
      // fallback: extract from text
      suggestions = [
        { title: streamTitle, style: 'original', hook: 'Your original title' },
      ];
    }

    // Store suggestions on StreamSummary if stream exists
    if (roomId) {
      const stream = await prisma.stream.findUnique({ where: { roomId } });
      if (stream) {
        try {
          await (prisma as any).streamSummary.upsert({
            where: { streamId: stream.id },
            create: {
              streamId: stream.id,
              title: stream.title,
              summary: '',
              keyTakeaways: '[]',
              chapters: '[]',
              actionItems: '[]',
              discussionPoints: '[]',
              titleSuggestions: JSON.stringify(suggestions),
            },
            update: { titleSuggestions: JSON.stringify(suggestions) },
          });
        } catch { /* summary table may not exist yet */ }
      }
    }

    res.json({ suggestions, count: suggestions.length });
  } catch (err: any) {
    console.error('[AI Title]', err);
    res.status(500).json({ error: 'Failed to generate titles', detail: err?.message });
  }
});

// POST /api/ai/title/apply — update stream title
router.post('/title/apply', async (req, res) => {
  try {
    const { roomId, hostToken, title } = req.body;
    if (!roomId || !title) return res.status(400).json({ error: 'roomId and title required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const updated = await prisma.stream.update({
      where: { roomId },
      data: { title },
    });

    res.json({ ok: true, title: updated.title });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply title' });
  }
});

// POST /api/ai/summary/generate — full AI summary + export
// (extends existing summary route)
router.post('/summary/generate', async (req, res) => {
  try {
    const { roomId, hostToken } = req.body;
    if (!roomId) return res.status(400).json({ error: 'roomId required' });

    const stream = await prisma.stream.findUnique({
      where: { roomId },
      include: {
        transcript: { include: { segments: { where: { isFinal: true }, orderBy: { startMs: 'asc' } } } },
        analytics: true,
      },
    });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const segments = stream.transcript?.segments ?? [];
    const transcriptText = segments.length > 0
      ? segments.slice(0, 200).map((s: any) => `[${formatMs(s.startMs)}] ${s.text}`).join('\n')
      : 'No transcript available for this stream.';

    const durationMin = stream.analytics
      ? Math.round((stream.analytics as any).durationSeconds / 60)
      : 0;

    const systemPrompt = `You are an expert content analyst for live streams.
Return ONLY valid JSON with this exact structure:
{
  "summary": "3-4 sentence overview",
  "keyTakeaways": ["point1", "point2", "point3", "point4", "point5"],
  "chapters": [{"title": "...", "startMs": 0, "endMs": 60000, "summary": "..."}],
  "actionItems": ["action1", "action2"],
  "discussionPoints": ["point1", "point2"],
  "titleSuggestions": [{"title": "...", "style": "engaging", "hook": "..."}]
}`;

    const userPrompt = `Stream: "${stream.title}"
Duration: ${durationMin} minutes
Viewers: ${stream.analytics ? (stream.analytics as any).uniqueViewers : 'N/A'}

Transcript:
${transcriptText.slice(0, 3000)}

Generate a comprehensive summary.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const raw = (message.content[0] as any).text?.trim() ?? '';
    let parsed: any = {};
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = {
        summary: `${stream.title} — AI summary generation encountered an issue. Please retry.`,
        keyTakeaways: [],
        chapters: [],
        actionItems: [],
        discussionPoints: [],
        titleSuggestions: [],
      };
    }

    // Upsert StreamSummary
    const summaryRecord = await (prisma as any).streamSummary.upsert({
      where: { streamId: stream.id },
      create: {
        streamId: stream.id,
        title: stream.title,
        summary: parsed.summary || '',
        keyTakeaways: JSON.stringify(parsed.keyTakeaways || []),
        chapters: JSON.stringify(parsed.chapters || []),
        actionItems: JSON.stringify(parsed.actionItems || []),
        discussionPoints: JSON.stringify(parsed.discussionPoints || []),
        titleSuggestions: JSON.stringify(parsed.titleSuggestions || []),
      },
      update: {
        summary: parsed.summary || '',
        keyTakeaways: JSON.stringify(parsed.keyTakeaways || []),
        chapters: JSON.stringify(parsed.chapters || []),
        actionItems: JSON.stringify(parsed.actionItems || []),
        discussionPoints: JSON.stringify(parsed.discussionPoints || []),
        titleSuggestions: JSON.stringify(parsed.titleSuggestions || []),
      },
    });

    res.json({
      summary: {
        ...summaryRecord,
        keyTakeaways: parsed.keyTakeaways,
        chapters: parsed.chapters,
        actionItems: parsed.actionItems,
        discussionPoints: parsed.discussionPoints,
        titleSuggestions: parsed.titleSuggestions,
      },
    });
  } catch (err: any) {
    console.error('[AI Summary]', err);
    res.status(500).json({ error: 'Failed to generate summary', detail: err?.message });
  }
});

// GET /api/ai/summary/:roomId/download?format=md|txt|json
router.get('/summary/:roomId/download', async (req, res) => {
  try {
    const format = (req.query.format as string) || 'md';
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const raw = await (prisma as any).streamSummary.findUnique({ where: { streamId: stream.id } });
    if (!raw) return res.status(404).json({ error: 'No summary yet. Generate it first.' });

    const summary = {
      title: raw.title,
      summary: raw.summary,
      keyTakeaways: JSON.parse(raw.keyTakeaways || '[]'),
      chapters: JSON.parse(raw.chapters || '[]'),
      actionItems: JSON.parse(raw.actionItems || '[]'),
      discussionPoints: JSON.parse(raw.discussionPoints || '[]'),
      generatedAt: raw.createdAt?.toISOString(),
    };

    const safeTitle = (stream.title || 'summary').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-summary.json"`);
      return res.send(JSON.stringify(summary, null, 2));
    }

    // Markdown / txt
    const md = [
      `# ${summary.title}`,
      `> Generated: ${summary.generatedAt}`,
      '',
      '## Summary',
      summary.summary,
      '',
      '## Key Takeaways',
      ...summary.keyTakeaways.map((k: string) => `- ${k}`),
      '',
      '## Chapters',
      ...summary.chapters.map((c: any) => `### ${c.title}\n${c.summary}`),
      '',
      '## Action Items',
      ...summary.actionItems.map((a: string) => `- [ ] ${a}`),
      '',
      '## Discussion Points',
      ...summary.discussionPoints.map((d: string) => `- ${d}`),
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-summary.md"`);
    res.send(md);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download summary' });
  }
});

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  return `${m}:${String(s % 60).padStart(2,'0')}`;
}

export default router;
