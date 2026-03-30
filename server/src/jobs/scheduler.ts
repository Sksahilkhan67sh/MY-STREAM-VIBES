import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function startScheduler() {
  // Every minute: check for reminders to send (15 min before scheduled streams)
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const in15Min = new Date(now.getTime() + 15 * 60 * 1000);
      const in16Min = new Date(now.getTime() + 16 * 60 * 1000);

      const streams = await prisma.stream.findMany({
        where: {
          scheduledAt: { gte: in15Min, lte: in16Min },
        },
        include: {
          reminders: { where: { sent: false } },
        },
      });

      for (const stream of streams) {
        for (const reminder of stream.reminders) {
          await sendReminder(reminder.type, reminder.contact, stream.title, stream.roomId);
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: { sent: true },
          });
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  });

  // Every hour: clean up expired streams
  cron.schedule('0 * * * *', async () => {
    try {
      const deleted = await prisma.stream.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (deleted.count > 0) {
        console.log(`🧹 Cleaned up ${deleted.count} expired streams`);
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  });

  console.log('✅ Scheduler started');
}

async function sendReminder(type: string, contact: string, title: string, roomId: string) {
  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const message = `"${title}" starts in 15 minutes! Join here: ${apiUrl}/s/${roomId}`;

  if (type === 'email' && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'StreamVault <reminders@streamvault.app>',
        to: contact,
        subject: `"${title}" starts soon!`,
        text: message,
      });
    } catch (err) {
      console.error('Email error:', err);
    }
  }

  if (type === 'sms' && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const twilio = await import('twilio');
      const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: contact,
      });
    } catch (err) {
      console.error('SMS error:', err);
    }
  }
}
