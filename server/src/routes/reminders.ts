import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

const ReminderSchema = z.object({
  roomId: z.string(),
  type: z.enum(['email', 'sms']),
  contact: z.string().min(1),
});

// POST /api/reminders — Set a reminder
router.post('/', async (req, res) => {
  try {
    const data = ReminderSchema.parse(req.body);

    const stream = await prisma.stream.findUnique({
      where: { roomId: data.roomId },
    });

    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (!stream.scheduledAt) {
      return res.status(400).json({ error: 'Stream is not scheduled' });
    }

    const reminder = await prisma.reminder.create({
      data: {
        streamId: stream.id,
        type: data.type,
        contact: data.contact,
      },
    });

    res.json({ success: true, reminderId: reminder.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    res.status(500).json({ error: 'Failed to set reminder' });
  }
});

export default router;
