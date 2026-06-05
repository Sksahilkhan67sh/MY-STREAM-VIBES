/**
 * server/src/services/ai-summary.service.ts
 * PHASE 7 — AI Stream Summary Service
 *
 * After a stream ends, generates:
 *   - Executive summary
 *   - Key takeaways (bullet list)
 *   - Chapters with timestamps
 *   - Action items
 *   - Discussion points
 *
 * Uses Anthropic claude-sonnet for analysis.
 * Export formats: JSON (API), PDF, DOCX, Markdown
 */

import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamSummary {
  id: string;
  streamId: string;
  title: string;
  summary: string;
  keyTakeaways: string[];
  chapters: Chapter[];
  actionItems: string[];
  discussionPoints: string[];
  generatedAt: string;
}

export interface Chapter {
  title: string;
  startMs: number;
  endMs: number;
  summary: string;
}

// ── Main Generator ────────────────────────────────────────────────────────────

export async function generateStreamSummary(streamId: string): Promise<StreamSummary> {
  // 1. Fetch stream + transcript
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    include: {
      transcript: {
        include: {
          segments: { where: { isFinal: true }, orderBy: { startMs: 'asc' } },
        },
      },
      analytics: true,
    },
  });

  if (!stream) throw new Error('Stream not found');

  // 2. Check for existing summary
  const existing = await (prisma as unknown as {
    streamSummary: { findUnique: (q: { where: { streamId: string } }) => Promise<StreamSummary | null> }
  }).streamSummary?.findUnique({ where: { streamId } });
  if (existing) return existing as StreamSummary;

  // 3. Build transcript text with timestamps
  const segments = stream.transcript?.segments ?? [];
  const transcriptText = segments.length > 0
    ? segments.map(s => `[${formatMs(s.startMs)}] ${s.text}`).join('\n')
    : 'No transcript available.';

  // 4. Build context
  const durationMin = stream.analytics
    ? Math.round(stream.analytics.durationSeconds / 60)
    : 0;

  const systemPrompt = `You are an expert content analyst. You analyze live stream transcripts and generate structured summaries.
Return ONLY valid JSON matching this schema exactly:
{
  "summary": "string (3-4 sentences overview)",
  "keyTakeaways": ["string", "string", ...] (5-8 bullet points),
  "chapters": [
    { "title": "string", "startMs": number, "endMs": number, "summary": "string (1-2 sentences)" }
  ],
  "actionItems": ["string", ...] (concrete next steps discussed),
  "discussionPoints": ["string", ...] (main topics covered)
}
Be concise, professional, and specific. Extract only what was actually discussed.`;

  const userPrompt = `Stream title: "${stream.title}"
Duration: ${durationMin} minutes
Viewers: ${stream.analytics?.uniqueViewers ?? 'unknown'}

TRANSCRIPT:
${transcriptText.slice(0, 15_000)} ${transcriptText.length > 15_000 ? '... [truncated]' : ''}`;

  // 5. Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const rawText = message.content
    .filter(c => c.type === 'text')
    .map(c => (c as { type: 'text'; text: string }).text)
    .join('');

  // 6. Parse
  let parsed: Omit<StreamSummary, 'id' | 'streamId' | 'title' | 'generatedAt'>;
  try {
    const clean = rawText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    // Fallback structure
    parsed = {
      summary: rawText.slice(0, 500),
      keyTakeaways: [],
      chapters: [],
      actionItems: [],
      discussionPoints: [],
    };
  }

  // 7. Save to DB
  const saved = await (prisma as unknown as {
    streamSummary: {
      upsert: (q: {
        where: { streamId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => Promise<StreamSummary>
    }
  }).streamSummary?.upsert({
    where: { streamId },
    create: {
      streamId,
      title: stream.title,
      summary: parsed.summary,
      keyTakeaways: JSON.stringify(parsed.keyTakeaways),
      chapters: JSON.stringify(parsed.chapters),
      actionItems: JSON.stringify(parsed.actionItems),
      discussionPoints: JSON.stringify(parsed.discussionPoints),
    },
    update: {
      summary: parsed.summary,
      keyTakeaways: JSON.stringify(parsed.keyTakeaways),
      chapters: JSON.stringify(parsed.chapters),
      actionItems: JSON.stringify(parsed.actionItems),
      discussionPoints: JSON.stringify(parsed.discussionPoints),
    },
  });

  return {
    id: (saved as { id: string }).id,
    streamId,
    title: stream.title,
    ...parsed,
    generatedAt: new Date().toISOString(),
  };
}

// ── Markdown Export ───────────────────────────────────────────────────────────

export function summaryToMarkdown(summary: StreamSummary): string {
  const lines: string[] = [
    `# ${summary.title}`,
    ``,
    `> Generated: ${new Date(summary.generatedAt).toLocaleString()}`,
    ``,
    `## Summary`,
    ``,
    summary.summary,
    ``,
    `## Key Takeaways`,
    ``,
    ...summary.keyTakeaways.map(t => `- ${t}`),
    ``,
    `## Chapters`,
    ``,
    ...summary.chapters.map(c =>
      `### ${c.title} (${formatMs(c.startMs)} – ${formatMs(c.endMs)})\n${c.summary}\n`
    ),
    `## Action Items`,
    ``,
    ...summary.actionItems.map(a => `- [ ] ${a}`),
    ``,
    `## Discussion Points`,
    ``,
    ...summary.discussionPoints.map(d => `- ${d}`),
  ];
  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n: number): string { return n.toString().padStart(2, '0'); }
