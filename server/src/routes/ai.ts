import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── POST /api/ai/moderate ────────────────────────────────────────
// Classifies a chat message. Returns { allowed, reason }
// Called from socket.ts before broadcasting chat messages
router.post('/moderate', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 64,
      system: `You are a live stream chat moderator. Classify messages as safe or unsafe.
Unsafe: hate speech, slurs, explicit sexual content, doxxing, spam (5+ repeated chars/words), severe harassment.
Borderline is OK. Casual swearing is OK.
Respond ONLY with JSON: {"allowed":true} or {"allowed":false,"reason":"brief reason"}`,
      messages: [{ role: 'user', content: message.slice(0, 500) }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '{"allowed":true}';
    try {
      res.json(JSON.parse(text));
    } catch {
      res.json({ allowed: true });
    }
  } catch (err) {
    // Fail open — don't block messages if AI is down
    console.error('[ai/moderate]', err);
    res.json({ allowed: true });
  }
});

// ─── POST /api/ai/summarize ───────────────────────────────────────
// Generates a stream summary from chat + title
router.post('/summarize', async (req, res) => {
  const { title, chatMessages, peakViewers, durationMin } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    const chatSample = (chatMessages || []).slice(0, 100).map((m: { nickname: string; message: string }) => `${m.nickname}: ${m.message}`).join('\n');
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Summarize this live stream in 2-3 sentences (max 100 words) for a recording library card.
Stream title: "${title}"
Peak viewers: ${peakViewers || 0}
Duration: ${durationMin || 0} minutes
Sample chat (last 100 messages):
${chatSample || '(no chat)'}

Write only the summary, no intro like "This stream..." — start directly.`,
      }],
    });
    const summary = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    res.json({ summary });
  } catch (err) {
    console.error('[ai/summarize]', err);
    res.status(500).json({ error: 'Summarization failed' });
  }
});

export default router;
