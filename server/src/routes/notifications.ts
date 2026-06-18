import { Router } from 'express';
import prisma from '../lib/prisma';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.EMAIL_FROM || 'onboarding@resend.dev';

function buildEmail(type: string, data: Record<string, string>): { subject: string; html: string } {
  const brand = '#ff3520';
  const wrap = (content: string) => `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden">
      <div style="background:${brand};padding:24px 32px">
        <h1 style="margin:0;font-size:20px;font-weight:800">MY-STREAM-VIBES</h1>
      </div>
      <div style="padding:32px">${content}</div>
      <div style="padding:16px 32px;background:#111;color:#666;font-size:12px">Powered by MY-STREAM-VIBES</div>
    </div>`;

  const btn = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block;background:${brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">${label}</a>`;

  const title = data.title || 'Stream';
  const url   = data.url   || '#';

  if (type === 'stream_start') return {
    subject: `🔴 ${title} is LIVE now!`,
    html: wrap(`<h2 style="color:${brand};margin-top:0">Stream is live!</h2><p style="color:#aaa"><strong style="color:#fff">${title}</strong> just started streaming.</p>${btn(url, 'Watch Now →')}`),
  };
  if (type === 'scheduled_reminder') return {
    subject: `⏰ Reminder: ${title} starts in ${data.timeUntil || 'soon'}`,
    html: wrap(`<h2 style="color:${brand};margin-top:0">Stream starting soon!</h2><p style="color:#aaa"><strong style="color:#fff">${title}</strong> starts in <strong style="color:#fff">${data.timeUntil || 'soon'}</strong></p>${btn(url, 'Set Reminder →')}`),
  };
  if (type === 'stream_end') return {
    subject: `Stream ended: ${title}`,
    html: wrap(`<h2 style="color:${brand};margin-top:0">Stream has ended</h2><p style="color:#aaa"><strong style="color:#fff">${title}</strong> has ended. Thank you for watching!</p>${data.replayUrl ? btn(data.replayUrl, 'Watch Replay →') : ''}`),
  };
  if (type === 'clip_ready') return {
    subject: `✂️ Your clip from "${title}" is ready!`,
    html: wrap(`<h2 style="color:${brand};margin-top:0">Clip ready!</h2><p style="color:#aaa"><strong style="color:#fff">${data.clipTitle || 'Your clip'}</strong> is ready to share.</p>${btn(data.clipUrl || url, 'View Clip →')}`),
  };
  if (type === 'summary_ready') return {
    subject: `🤖 AI Summary ready for "${title}"`,
    html: wrap(`<h2 style="color:${brand};margin-top:0">AI Summary is ready</h2><p style="color:#aaa">We've generated a full AI summary for <strong style="color:#fff">${title}</strong>.</p>${btn(url, 'View Summary →')}`),
  };
  return { subject: `Notification from MY-STREAM-VIBES`, html: wrap(`<p>You have a new notification about <strong>${title}</strong>.</p>`) };
}

// POST /api/notifications/send
router.post('/send', async (req, res) => {
  try {
    const { hostToken, roomId, type, to, data: emailData = {} } = req.body;
    if (!roomId || !type || !to) return res.status(400).json({ error: 'roomId, type, to required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (hostToken && stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const APP_URL = process.env.CLIENT_URL || 'http://localhost:3000';
    const { subject, html } = buildEmail(type, {
      title: stream.title,
      url: `${APP_URL}/s/${stream.roomId}`,
      ...emailData,
    });

    const record = await prisma.emailNotification.create({
      data: { userId: stream.userId || 'anonymous', streamId: stream.id, type, to, subject, body: html, status: 'pending' },
    });

    try {
      await resend.emails.send({ from: FROM, to, subject, html });
      await prisma.emailNotification.update({ where: { id: record.id }, data: { status: 'sent', sentAt: new Date() } });
    } catch (emailErr: any) {
      await prisma.emailNotification.update({ where: { id: record.id }, data: { status: 'failed', error: emailErr?.message } });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications/send]', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// POST /api/notifications/bulk
router.post('/bulk', async (req, res) => {
  try {
    const { hostToken, roomId, type, emails, data: emailData = {} } = req.body;
    if (!Array.isArray(emails) || !roomId) return res.status(400).json({ error: 'emails[] and roomId required' });

    const stream = await prisma.stream.findUnique({ where: { roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (stream.hostToken !== hostToken) return res.status(403).json({ error: 'Unauthorized' });

    const APP_URL = process.env.CLIENT_URL || 'http://localhost:3000';
    const { subject, html } = buildEmail(type, { title: stream.title, url: `${APP_URL}/s/${stream.roomId}`, ...emailData });

    const results = await Promise.allSettled(
      emails.map((to: string) => resend.emails.send({ from: FROM, to, subject, html }))
    );

    const sent   = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    res.json({ ok: true, sent, failed, total: emails.length });
  } catch (err) {
    console.error('[notifications/bulk]', err);
    res.status(500).json({ error: 'Failed to send bulk notifications' });
  }
});

// GET /api/notifications/stream/:roomId
router.get('/stream/:roomId', async (req, res) => {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId: req.params.roomId } });
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const notifications = await prisma.emailNotification.findMany({
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
