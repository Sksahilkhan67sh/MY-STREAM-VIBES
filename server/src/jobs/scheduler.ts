import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const RECORDINGS_DIR = process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'recordings')
  : path.join(process.cwd(), 'recordings');

export function startScheduler() {
  // ── Every minute: send reminders 5 min before scheduled streams ──
  cron.schedule('* * * * *', async () => {
    try {
      const now     = new Date();
      const in5Min  = new Date(now.getTime() + 5 * 60 * 1000);
      const in6Min  = new Date(now.getTime() + 6 * 60 * 1000);

      // Find streams starting in the next 5–6 minute window
      const streams = await prisma.stream.findMany({
        where:   { scheduledAt: { gte: in5Min, lte: in6Min } },
        include: { reminders: { where: { sent: false } } },
      });

      for (const stream of streams) {
        for (const reminder of stream.reminders) {
          await sendReminder(reminder.type, reminder.contact, stream.title, stream.roomId);
          await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
        }
      }
    } catch (err) {
      console.error('Scheduler reminder error:', err);
    }
  });

  // ── Every minute: send "starting now" reminders ────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const now    = new Date();
      const in1Min = new Date(now.getTime() + 60 * 1000);

      const streams = await prisma.stream.findMany({
        where:   { scheduledAt: { gte: now, lte: in1Min }, isLive: false },
        include: { reminders: { where: { sent: false } } },
      });

      for (const stream of streams) {
        // Only send "starting now" if there are unsent reminders (5-min ones already sent)
        // For streams that had no prior reminders, skip
        for (const reminder of stream.reminders) {
          await sendStartingNowReminder(reminder.type, reminder.contact, stream.title, stream.roomId);
          await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
        }
      }
    } catch (err) {
      console.error('Scheduler starting-now error:', err);
    }
  });

  // ── Every hour: clean up expired streams ───────────────────────
  cron.schedule('0 * * * *', async () => {
    try {
      const expiredStreams = await prisma.stream.findMany({
        where: { expiresAt: { lt: new Date() } },
        include: { recordings: true },
      });

      for (const stream of expiredStreams) {
        for (const rec of stream.recordings) {
          try {
            if (fs.existsSync(rec.filePath)) {
              fs.unlinkSync(rec.filePath);
              console.log(`🗑 Deleted recording file: ${rec.fileName}`);
            }
          } catch (fileErr) {
            console.error(`Failed to delete file ${rec.filePath}:`, fileErr);
          }
        }
      }

      const deleted = await prisma.stream.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (deleted.count > 0) {
        console.log(`🧹 Cleaned up ${deleted.count} expired streams`);
      }
    } catch (err) {
      console.error('Scheduler cleanup error:', err);
    }
  });

  console.log('✅ Scheduler started (5-min reminders + hourly cleanup)');
}

async function sendReminder(type: string, contact: string, title: string, roomId: string) {
  const appUrl  = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const message = `"${title}" starts in 5 minutes! Join here: ${appUrl}/s/${roomId}`;
  const subject = `"${title}" starts in 5 minutes!`;
  await dispatchNotification(type, contact, subject, message);
}

async function sendStartingNowReminder(type: string, contact: string, title: string, roomId: string) {
  const appUrl  = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const message = `"${title}" is starting NOW! Watch here: ${appUrl}/s/${roomId}`;
  const subject = `"${title}" is LIVE now!`;
  await dispatchNotification(type, contact, subject, message);
}

async function dispatchNotification(type: string, contact: string, subject: string, message: string) {
  if (type === 'email' && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from:    'StreamVault <reminders@streamvault.app>',
        to:      contact,
        subject,
        text:    message,
      });
      console.log(`📧 Email reminder sent to ${contact}: ${subject}`);
    } catch (err) {
      console.error('Email reminder failed:', err);
    }
  } else if (type === 'email') {
    console.log(`📧 [MOCK EMAIL] to ${contact}: ${subject}`);
  }

  if (type === 'sms' && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body:  message,
        from:  process.env.TWILIO_PHONE_NUMBER!,
        to:    contact,
      });
      console.log(`📱 SMS reminder sent to ${contact}`);
    } catch (err) {
      console.error('SMS reminder failed:', err);
    }
  } else if (type === 'sms') {
    console.log(`📱 [MOCK SMS] to ${contact}: ${message}`);
  }
}
