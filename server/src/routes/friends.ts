import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/friends/:userId — get friends list with online/watching status
router.get('/:userId', async (req, res) => {
  try {
    const accepted = await prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: req.params.userId }, { receiverId: req.params.userId }],
      },
    });
    const friendIds = accepted.map(r =>
      r.senderId === req.params.userId ? r.receiverId : r.senderId
    );
    const friends = await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: {
        id: true, name: true, username: true, avatarUrl: true,
        streams: {
          where: { isLive: true, isPublic: true },
          select: { roomId: true, title: true, viewerCount: true },
          take: 1,
        },
      },
    });
    res.json({
      friends: friends.map(f => ({
        id: f.id, name: f.name, username: f.username, avatarUrl: f.avatarUrl,
        isWatching: f.streams.length > 0,
        currentStream: f.streams[0] ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// GET /api/friends/:userId/requests — pending incoming requests
router.get('/:userId/requests', async (req, res) => {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: { receiverId: req.params.userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    const senderIds = requests.map(r => r.senderId);
    const senders = await prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, name: true, username: true, avatarUrl: true },
    });
    const senderMap = new Map(senders.map(s => [s.id, s]));
    res.json({ requests: requests.map(r => ({ ...r, sender: senderMap.get(r.senderId) })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// POST /api/friends/request
router.post('/request', async (req, res) => {
  try {
    const { senderId, receiverId } = z.object({ senderId: z.string(), receiverId: z.string() }).parse(req.body);
    if (senderId === receiverId) return res.status(400).json({ error: 'Cannot friend yourself' });
    const existing = await prisma.friendRequest.findFirst({
      where: { OR: [{ senderId, receiverId }, { senderId: receiverId, receiverId: senderId }] },
    });
    if (existing) return res.status(409).json({ error: 'Request already exists', existing });
    const req2 = await prisma.friendRequest.create({ data: { senderId, receiverId } });
    // Notify
    await prisma.notification.create({
      data: { userId: receiverId, type: 'friend_request', title: 'New friend request', body: 'Someone wants to be your friend', actionUrl: `/friends` },
    });
    res.json(req2);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// PATCH /api/friends/request/:id — accept or decline
router.patch('/request/:id', async (req, res) => {
  try {
    const { status } = z.object({ status: z.enum(['accepted', 'declined']) }).parse(req.body);
    const updated = await prisma.friendRequest.update({ where: { id: req.params.id }, data: { status } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// DELETE /api/friends/:userId/:friendId — remove friend
router.delete('/:userId/:friendId', async (req, res) => {
  try {
    await prisma.friendRequest.deleteMany({
      where: {
        status: 'accepted',
        OR: [
          { senderId: req.params.userId, receiverId: req.params.friendId },
          { senderId: req.params.friendId, receiverId: req.params.userId },
        ],
      },
    });
    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

export default router;
