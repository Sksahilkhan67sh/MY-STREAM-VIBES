/**
 * server/src/routes/notifications.ts
 * Feature 3: Email Notifications
 *
 * POST /api/notifications/subscribe     — subscribe email to stream events
 * POST /api/notifications/send          — send notification (host triggered)
 * GET  /api/notifications/:userId       — list notifications for a user
 */

import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'notifications@my-stream-vibes.com';

// ── Email Templates ───────────────────────────────────────────────────────────

function buildEmail(type: string, data: Record<string, string>): { subject: string; html: string } {
  const brandColor = '#ff3520';
  const base = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden">
      <div style="background:${brandColor};padding:24px 32px">
        <h1 style="margin:0;font-size:22px;font-weight:800">MY-STREAM-VIBES</h1>
      </div>
      <div style="padding:32px">CONTENT</div>
      <div style="padding:16px 32px;background:#111;color:#666;font-size:12px">
        Powered by MY-STREAM-VIBES · <a href="{{unsubLink}}" style="color:#888">Unsubscribe</a>
      </div>
    </div>`;

  if (type === 'stream_start') {
    return {
      subject: `🔴 ${data.title} is LIVE now!`,
      html: base.replace('CONTENT', `
        <h2 style="color:#ff3520;margin-top:0">Stream is live!</h2>
        <p style="color:#aaa"><strong style="color:#fff">${data.title}</strong> just started streaming.</p>
        <a href="${data.url}" style="display:inline-block;background:#ff3520;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">Watch Now →</a>
      `).replace('{{unsubLink}}', data.unsubLink || '#'),
    };
  }
  if (type === 'scheduled_reminder') {
    return {
      subject: `⏰ Reminder: ${data.title} starts in ${data.timeUntil}`,
      html: base.replace('CONTENT', `
        <h2 style="color:#ff3520;margin-top:0">Stream starting soon!</h2>
        <p style="color:#aaa"><strong style="color:#fff">${data.title}</strong> starts in <strong style="color:#fff">${data.timeUntil}</strong></p>
        <p style="color:#666">Scheduled: ${data.scheduledAt}</p>
        <a href="${data.url}" style="display:inline-block;background:#ff3520;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">Set Reminder →</a>
      `).replace('{{unsubLink}}', data.unsubLink || '#'),
    };
  }
  if (type === 'clip_ready') {
    return {
      subject: `✂️ Your clip from "${data.title}" is ready!`,
      html: base.replace('CONTENT', `
        <h2 style="color:#ff3520;margin-top:0">Clip ready!</h2>
        <p style="color:#aaa">Your clip <strong style="color:#fff">${data.clipTitle}</strong> from <strong style="color:#fff">${data.title}</strong> is ready to share.</p>
        <a href="${data.clipUrl}" style="display:inline-block;background:#ff3520;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">View Clip →</a>
      `).replace('{{unsubLink}}', data.unsubLink || '#'),
    };
  }
  if (type === 'summary_ready') {
    return {
      subject: `🤖 AI Summary ready for "${data.title}"`,
      html: base.replace('CONTENT', `
        <h2 style="color:#ff3520;margin-top:0">Your AI Stream Summary is ready</h2>
        <p style="color:#aaa">We've generated a full AI summary for <strong style="color:#fff">${data.title}</strong>.</p>
        <a href="${data.dashboardUrl}" style="display:inline-block;background:#ff3520;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">View Summary →</a>
      `).replace('{{unsubLink}}', data.unsubLink || '#'),
    };
  }
  if (type === 'stream_end') {
    return {
      subject: `Stream ended: ${data.title}`,
      html: base.replace('CONTENT', `
        <h2 style="color:#ff3520;margin-top:0">Stream has ended</h2>
        <p style="color:#aaa"><strong style="color:#fff">${data.title}</strong> ended. Duration: <strong style="color:#fff">${data.duration}</strong></p>
        ${data.replayUrl ? `<a href="${data.replayUrl}" style="display:inline-block;background:#222;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;border:1px solid #333">Watch Replay →</a>` : ''}
      `).replace('{{unsubLink}}', data.unsubLink || '#'),
    };
  }
  return { subject: 'Notification from MY-STREAM-VIBES', html: base.replace('CONTENT', '<p>You have a new notification.</p>').replace('{{unsubLink}}', '#') };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/notifications/send  (host sends)
router.post('/send', async (req, res) => {
  try {
    const { hostToken, roomId, type, to, data: emailData } = req.body;
    if (!roomId || !type || !to) return res.status(400).json({ error: 'roomId, type, to required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (hostToken && stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const { subject, html } = buildEmail(type, { title: stream.title, ...emailData });

    // Store in DB
    const notification = await (prisma as any).emailNotification.create({
      data: {
        userId: stream.userId || 'anonymous',
        streamId: stream.id,
        type,
        to,
        subject,
        body: html,
        status: 'pending',
      },
    });

    // Send via Resend
    try {
      await resend.emails.send({ from: FROM, to, subject, html });
      await (prisma as any).emailNotification.update({
        where: { id: notification.id },
        data: { status: 'sent', sentAt: new Date() },
      });
    } catch (emailErr: any) {
      await (prisma as any).emailNotification.update({
        where: { id: notification.id },
        data: { status: 'failed', error: emailErr?.message },
      });
    }

    res.json({ ok: true, notificationId: notification.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// POST /api/notifications/bulk  — send to multiple (e.g. scheduled reminder to subscribers)
router.post('/bulk', async (req, res) => {
  try {
    const { hostToken, roomId, type, emails, data: emailData } = req.body;
    if (!Array.isArray(emails) || !roomId) return res.status(400).json({ error: 'emails array and roomId required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const { subject, html } = buildEmail(type, { title: stream.title, ...emailData });

    const results = await Promise.allSettled(
      emails.map((to: string) =>
        resend.emails.send({ from: FROM, to, subject, html })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({ ok: true, sent, failed, total: emails.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send bulk notifications' });
  }
});

// GET /api/notifications/stream/:roomId
router.get('/stream/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const notifications = await (prisma as any).emailNotification.findMany({
      where: { streamId: stream.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

export default router;
