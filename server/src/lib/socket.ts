import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { incrementViewerCount, decrementViewerCount, getViewerCount } from './redis';

let io: SocketServer;

export function initSocket(httpServer: HttpServer) {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    let currentRoom: string | null = null;

    socket.on('join-room', async ({ roomId, nickname }) => {
      currentRoom = roomId;
      socket.join(roomId);
      const count = await incrementViewerCount(roomId);
      io.to(roomId).emit('viewer-count', count);
      socket.to(roomId).emit('viewer-joined', { nickname });
    });

    socket.on('chat-message', ({ roomId, message, nickname }) => {
      if (!message?.trim() || message.length > 500) return;
      io.to(roomId).emit('chat-message', {
        id: Date.now().toString(),
        nickname: nickname || 'Anonymous',
        message: message.trim(),
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('reaction', ({ roomId, emoji }) => {
      const allowed = ['❤️', '😂', '🔥', '👏', '😮', '🎉'];
      if (!allowed.includes(emoji)) return;
      io.to(roomId).emit('reaction', { emoji, id: Date.now() });
    });

    socket.on('stream-started', ({ roomId }) => {
      io.to(roomId).emit('stream-started');
    });

    socket.on('stream-ended', ({ roomId }) => {
      io.to(roomId).emit('stream-ended');
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
