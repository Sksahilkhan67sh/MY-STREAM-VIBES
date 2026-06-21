import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

/**
 * Stream Creation Wizard — server-side draft autosave.
 *
 * GET /api/stream-drafts/:userId   → { data, step, updatedAt } | null
 * PUT /api/stream-drafts/:userId   → upsert draft
 * DELETE /api/stream-drafts/:userId → clear draft (after a successful "Start Stream")
 *
 * This is purely additive: new table (StreamWizardDraft), no existing route
 * or table touched. The client also keeps a localStorage copy so progress
 * survives even if the network request fails — this endpoint is the
 * cross-device / cross-session backstop, not the only copy.
 */

// GET /api/stream-drafts/:userId
router.get('/:userId', async (req, res) => {
  try {
    const draft = await prisma.streamWizardDraft.findUnique({ where: { userId: req.params.userId } });
    if (!draft) return res.json(null);
    let data: unknown = {};
    try { data = JSON.parse(draft.data); } catch {}
    res.json({ data, step: draft.step, updatedAt: draft.updatedAt });
  } catch (err) {
    console.error('[stream-drafts GET]', err);
    res.status(500).json({ error: 'Failed to load draft' });
  }
});

const SaveDraftSchema = z.object({
  data: z.record(z.any()),
  step: z.number().int().min(1).max(5).default(1),
});

// PUT /api/stream-drafts/:userId
router.put('/:userId', async (req, res) => {
  try {
    const { data, step } = SaveDraftSchema.parse(req.body);
    const draft = await prisma.streamWizardDraft.upsert({
      where:  { userId: req.params.userId },
      update: { data: JSON.stringify(data), step },
      create: { userId: req.params.userId, data: JSON.stringify(data), step },
    });
    res.json({ ok: true, step: draft.step, updatedAt: draft.updatedAt });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('[stream-drafts PUT]', err);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// DELETE /api/stream-drafts/:userId
router.delete('/:userId', async (req, res) => {
  try {
    await prisma.streamWizardDraft.deleteMany({ where: { userId: req.params.userId } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[stream-drafts DELETE]', err);
    res.status(500).json({ error: 'Failed to clear draft' });
  }
});

export default router;
