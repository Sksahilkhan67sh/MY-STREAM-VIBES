import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// ── Simple in-process reminder scheduler ─────────────────────
// Schedules a one-shot timer to "send" a reminder at the right time.
// In production, replace the console.log with nodemailer/Twilio calls.
export function scheduleReminder(reminderId: string, sendAt: Date, type: string, contact: string, streamTitle: string) {
  const msUntil = sendAt.getTime() - Date.now();
  if (msUntil <= 0) return; // already past
  setTimeout(async () => {
    try {
      if (type === 'email') {
        // TODO: replace with nodemailer when SMTP is configured
        console.log(`📧 [REMINDER] Email to ${contact}: "${streamTitle}" is starting now!`);
      } else if (type === 'sms') {
        // TODO: replace with Twilio when credentials are configured
        console.log(`📱 [REMINDER] SMS to ${contact}: "${streamTitle}" is starting now!`);
      }
      await prisma.reminder.update({ where: { id: reminderId }, data: { sent: true } });
    } catch (e) { console.error('Reminder send error:', e); }
  }, msUntil);
}

// ── Recover unsent reminders on server restart ────────────────
export async function recoverReminders() {
  try {
    const unsent = await prisma.reminder.findMany({
      where: { sent: false },
      include: { stream: true },
    });
    for (const r of unsent) {
      if (!r.stream.scheduledAt) continue;
      // Send 5 minutes before stream starts
      const sendAt = new Date(r.stream.scheduledAt.getTime() - 5 * 60 * 1000);
      scheduleReminder(r.id, sendAt, r.type, r.contact, r.stream.title);
    }
    if (unsent.length > 0) console.log(`♻️ Recovered ${unsent.length} pending reminders`);
  } catch (e) { console.error('Reminder recovery error:', e); }
}

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

    // Schedule the reminder to fire 5 minutes before stream starts
    const sendAt = new Date(stream.scheduledAt!.getTime() - 5 * 60 * 1000);
    scheduleReminder(reminder.id, sendAt, reminder.type, reminder.contact, stream.title);

    res.json({ success: true, reminderId: reminder.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    res.status(500).json({ error: 'Failed to set reminder' });
  }
});

export default router;
