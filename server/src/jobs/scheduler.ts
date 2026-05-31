import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const RECORDINGS_DIR = process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'recordings')
  : path.join(process.cwd(), 'recordings');

export function startScheduler() {
  // Every minute: send reminders 15 min before scheduled streams
  cron.schedule('* * * * *', async () => {
    try {
      const now     = new Date();
      const in15Min = new Date(now.getTime() + 15 * 60 * 1000);
      const in16Min = new Date(now.getTime() + 16 * 60 * 1000);

      const streams = await prisma.stream.findMany({
        where:   { scheduledAt: { gte: in15Min, lte: in16Min } },
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

  // Every hour: clean up expired streams and their recording files
  cron.schedule('0 * * * *', async () => {
    try {
      // Find expired streams with their recordings before deleting
      const expiredStreams = await prisma.stream.findMany({
        where: { expiresAt: { lt: new Date() } },
        include: { recordings: true },
      });

      for (const stream of expiredStreams) {
        // Delete physical recording files
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

      // Now delete DB records (cascade deletes recordings, polls, etc.)
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

  console.log('✅ Scheduler started');
}

async function sendReminder(type: string, contact: string, title: string, roomId: string) {
  // Use CLIENT_URL (server env var), not NEXT_PUBLIC_APP_URL
  const appUrl  = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const message = `"${title}" starts in 15 minutes! Join here: ${appUrl}/s/${roomId}`;

  if (type === 'email' && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from:    'StreamVault <reminders@streamvault.app>',
        to:      contact,
        subject: `"${title}" starts soon!`,
        text:    message,
      });
      console.log(`📧 Email reminder sent to ${contact}`);
    } catch (err) {
      console.error('Email reminder failed:', err);
    }
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
  }
}
