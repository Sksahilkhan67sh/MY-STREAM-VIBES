import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/notifications/:userId?unreadOnly=true
router.get('/:userId', async (req, res) => {
  try {
    const { unreadOnly, page = '1', limit = '30' } = req.query as Record<string, string>;
    const where: any = { userId: req.params.userId };
    if (unreadOnly === 'true') where.isRead = false;

    const take = Math.min(parseInt(limit) || 30, 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.notification.count({ where: { userId: req.params.userId, isRead: false } }),
    ]);
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:userId/read-all
router.patch('/:userId/read-all', async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.params.userId, isRead: false }, data: { isRead: true } });
    res.json({ marked: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json({ marked: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

// DELETE /api/notifications/:userId/clear
router.delete('/:userId/clear', async (req, res) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.params.userId, isRead: true } });
    res.json({ cleared: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear' });
  }
});

// POST /api/notifications/send — internal: push a notification to a user
router.post('/send', async (req, res) => {
  try {
    const data = z.object({
      userId: z.string(), type: z.string(), title: z.string(),
      body: z.string(), imageUrl: z.string().optional(), actionUrl: z.string().optional(),
    }).parse(req.body);
    const notif = await prisma.notification.create({ data });
    res.json(notif);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

export default router;
