import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { incrementViewerCount, decrementViewerCount } from './redis';
import prisma from './prisma';

let io: SocketServer;

async function updatePeakViewers(roomId: string, current: number) {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId }, select: { id: true, peakViewers: true } });
    if (stream && current > stream.peakViewers) {
      await prisma.stream.update({ where: { roomId }, data: { peakViewers: current } });
    }
  } catch {}
}

async function recordEvent(roomId: string, type: string, metadata?: Record<string, unknown>) {
  try {
    const stream = await prisma.stream.findUnique({ where: { roomId }, select: { id: true } });
    if (!stream) return;
    await prisma.streamEvent.create({
      data: { streamId: stream.id, type, value: 1, metadata: metadata ? JSON.stringify(metadata) : null },
    });
  } catch {}
}

// AI moderation: call /api/ai/moderate internally
async function isMessageAllowed(message: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { allowed: true };
  try {
    const res = await fetch(`http://localhost:${process.env.PORT || 4000}/api/ai/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return await res.json();
  } catch {
    return { allowed: true }; // fail open
  }
}

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  });

  io.on('connection', (socket) => {
    let currentRoom: string | null = null;
    let viewerId: string | null = null;

    socket.on('join-room', async ({ roomId, nickname, userId }) => {
      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
        const prevCount = await decrementViewerCount(currentRoom);
        io.to(currentRoom).emit('viewer-count', Math.max(0, prevCount));
        recordEvent(currentRoom, 'viewer_leave', { viewerId: viewerId || socket.id });
      }
      currentRoom = roomId;
      viewerId = userId || socket.id;
      socket.join(roomId);

      const count = await incrementViewerCount(roomId);
      io.to(roomId).emit('viewer-count', count);
      socket.to(roomId).emit('viewer-joined', { nickname });

      recordEvent(roomId, 'viewer_join', { viewerId, nickname });
      updatePeakViewers(roomId, count).catch(() => {});
    });

    socket.on('chat-message', async ({ roomId, message, nickname, userId }) => {
      if (!message?.trim() || message.length > 500) return;
      const text = message.trim();

      // Run AI moderation (non-blocking — fire and check)
      const modResult = await isMessageAllowed(text);
      if (!modResult.allowed) {
        // Emit only to sender so they see feedback
        socket.emit('message-rejected', { reason: modResult.reason || 'Message not allowed' });
        return;
      }

      const msg = {
        id: Date.now().toString(),
        nickname: nickname || 'Anonymous',
        message: text,
        timestamp: new Date().toISOString(),
        userId: userId || null,
      };
      io.to(roomId).emit('chat-message', msg);
      recordEvent(roomId, 'chat_message', { viewerId: viewerId || socket.id });
    });

    socket.on('reaction', ({ roomId, emoji }) => {
      const allowed = ['❤️', '😂', '🔥', '👏', '😮', '🎉'];
      if (!allowed.includes(emoji)) return;
      io.to(roomId).emit('reaction', { emoji, id: Date.now() });
      recordEvent(roomId, 'reaction', { emoji, viewerId: viewerId || socket.id });
    });

    socket.on('stream-started', ({ roomId }) => {
      io.to(roomId).emit('stream-started');
      recordEvent(roomId, 'stream_started');
    });

    socket.on('stream-ended', ({ roomId }) => {
      io.to(roomId).emit('stream-ended');
      recordEvent(roomId, 'stream_ended');
    });

    // Authenticated user joins personal room for notifications
    socket.on('auth', ({ userId }) => {
      if (userId) socket.join(`user:${userId}`);
    });

    socket.on('disconnect', async () => {
      if (currentRoom) {
        const count = await decrementViewerCount(currentRoom);
        io.to(currentRoom).emit('viewer-count', Math.max(0, count));
        recordEvent(currentRoom, 'viewer_leave', { viewerId: viewerId || socket.id });
      }
    });
  });

  console.log('✅ Socket.io initialized with AI moderation');
  return io;
}

export function getIo() { return io; }

export function broadcastToRoom(roomId: string, event: string, data: unknown) {
  if (io) { io.to(roomId).emit(event, data); return true; }
  return false;
}

export function notifyUser(userId: string, notification: { type: string; title: string; body: string; data?: unknown }) {
  if (io) io.to(`user:${userId}`).emit('notification', notification);
}
