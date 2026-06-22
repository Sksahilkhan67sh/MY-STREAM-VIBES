import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { incrementViewerCount, decrementViewerCount } from './redis';
import { registerCaptionHandlers } from './captions-socket';
import prisma from './prisma';

let io: SocketServer;

export function initSocket(httpServer: HttpServer) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          origin === clientUrl ||
          origin.endsWith('.vercel.app') ||
          origin.endsWith('.onrender.com') ||
          origin.startsWith('http://localhost')
        ) {
          return callback(null, true);
        }
        callback(new Error(`Socket CORS blocked: ${origin}`));
      },
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    // Prefer WebSocket, fall back to polling — important for Render
    transports:            ['websocket', 'polling'],
    // Aggressive ping to prevent free-tier sleep from killing connections
    pingTimeout:           60000,
    pingInterval:          25000,
    // Allow reconnect upgrades
    allowUpgrades:         true,
    // Increase buffer for slow connections
    maxHttpBufferSize:     1e6,
  });

  io.on('connection', (socket) => {
    let currentRoom: string | null = null;

    // ── Real-time notifications ──────────────────────────────────────────
    // Joins a per-user room so notification.service.ts can push directly to
    // this specific person's connected tab(s), independent of any stream
    // room they may also be watching. A user can have multiple tabs open;
    // Socket.IO rooms support multiple sockets joining the same room, so
    // every open tab receives the push.
    socket.on('subscribe-notifications', ({ userId }) => {
      if (!userId || typeof userId !== 'string') return;
      socket.join(`notify:${userId}`);
    });
    socket.on('unsubscribe-notifications', ({ userId }) => {
      if (!userId || typeof userId !== 'string') return;
      socket.leave(`notify:${userId}`);
    });

    socket.on('join-room', async ({ roomId, nickname }) => {
      if (!roomId) return;
      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
        const prevCount = await decrementViewerCount(currentRoom);
        io.to(currentRoom).emit('viewer-count', Math.max(0, prevCount));
      }
      currentRoom = roomId;
      socket.join(roomId);
      const count = await incrementViewerCount(roomId);
      io.to(roomId).emit('viewer-count', count);
      // Keep DB viewerCount in sync so GET /api/streams returns accurate count.
      prisma.stream.update({ where: { roomId }, data: { viewerCount: count } }).catch(() => {});
      // Bump peakViewers only if this is a new high (used for trending/"fastest growing").
      prisma.stream.updateMany({
        where: { roomId, peakViewers: { lt: count } },
        data: { peakViewers: count },
      }).catch(() => {});
      if (nickname) socket.to(roomId).emit('viewer-joined', { nickname });
    });

    socket.on('chat-message', ({ roomId, message, nickname, avatarUrl }) => {
      if (!message?.trim() || message.length > 500) return;
      if (!roomId) return;
      io.to(roomId).emit('chat-message', {
        id:        Date.now().toString(),
        nickname:  nickname || 'Anonymous',
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
        message:   message.trim(),
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('reaction', ({ roomId, emoji }) => {
      const allowed = ['❤️', '😂', '🔥', '👏', '😮', '🎉'];
      if (!allowed.includes(emoji) || !roomId) return;
      io.to(roomId).emit('reaction', { emoji, id: Date.now() });
    });

    // stream-started/ended must be authenticated with hostToken
    // so random clients can't fake live/ended events to viewers
    socket.on('stream-started', async ({ roomId, hostToken }) => {
      if (!roomId || !hostToken) return;
      try {
        const stream = await prisma.stream.findUnique({ where: { roomId } });
        if (!stream || stream.hostToken !== hostToken) return;
        io.to(roomId).emit('stream-started');
      } catch {}
    });

    socket.on('stream-ended', async ({ roomId, hostToken }) => {
      if (!roomId || !hostToken) return;
      try {
        const stream = await prisma.stream.findUnique({ where: { roomId } });
        if (!stream || stream.hostToken !== hostToken) return;
        io.to(roomId).emit('stream-ended');
      } catch {}
    });

    socket.on('disconnect', async () => {
      if (currentRoom) {
        const count = await decrementViewerCount(currentRoom);
        const safe = Math.max(0, count);
        io.to(currentRoom).emit('viewer-count', safe);
        // Sync DB
        prisma.stream.update({ where: { roomId: currentRoom }, data: { viewerCount: safe } }).catch(() => {});
      }
    });
  });

  // Live captions — built previously but never registered. Adding its own
  // connection listener is safe; Socket.IO fires every registered listener.
  registerCaptionHandlers(io);

  console.log('✅ Socket.io initialized');
  return io;
}

export function getIo() {
  return io;
}

export function broadcastToRoom(roomId: string, event: string, data: unknown) {
  if (io) {
    io.to(roomId).emit(event, data);
    return true;
  }
  return false;
}
