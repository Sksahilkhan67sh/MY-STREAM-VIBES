import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { incrementViewerCount, decrementViewerCount } from './redis';

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
      if (nickname) socket.to(roomId).emit('viewer-joined', { nickname });
    });

    socket.on('chat-message', ({ roomId, message, nickname }) => {
      if (!message?.trim() || message.length > 500) return;
      if (!roomId) return;
      io.to(roomId).emit('chat-message', {
        id:        Date.now().toString(),
        nickname:  nickname || 'Anonymous',
        message:   message.trim(),
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('reaction', ({ roomId, emoji }) => {
      const allowed = ['❤️', '😂', '🔥', '👏', '😮', '🎉'];
      if (!allowed.includes(emoji) || !roomId) return;
      io.to(roomId).emit('reaction', { emoji, id: Date.now() });
    });

    socket.on('stream-started', ({ roomId }) => {
      if (roomId) io.to(roomId).emit('stream-started');
    });

    socket.on('stream-ended', ({ roomId }) => {
      if (roomId) io.to(roomId).emit('stream-ended');
    });

    socket.on('disconnect', async () => {
      if (currentRoom) {
        const count = await decrementViewerCount(currentRoom);
        io.to(currentRoom).emit('viewer-count', Math.max(0, count));
      }
    });
  });

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
