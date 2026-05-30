import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../lib/auth';

const router = Router();
router.use(requireAuth);

// ─── GET /api/notifications ───────────────────────────────────────
router.get('/', async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const unreadCount = notifications.filter(n => !n.read).length;
  res.json({ notifications, unreadCount });
});

// ─── PATCH /api/notifications/read-all ───────────────────────────
router.patch('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, read: false },
    data: { read: true },
  });
  res.json({ success: true });
});

// ─── PATCH /api/notifications/:id/read ───────────────────────────
router.patch('/:id/read', async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { read: true },
  });
  res.json({ success: true });
});

export default router;

// ── Helper exported for use in socket.ts and other routes ─────────
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  try {
    return await prisma.notification.create({
      data: { userId, type, title, body, data: data ? JSON.stringify(data) : null },
    });
  } catch (err) {
    console.error('[notification]', err);
  }
}
