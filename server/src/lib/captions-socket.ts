/**
 * server/src/lib/captions-socket.ts
 * PHASE 6 — Socket.io bridge for live captions audio
 *
 * Add to socket.ts initSocket():
 *   import { registerCaptionHandlers } from './captions-socket';
 *   registerCaptionHandlers(io);
 */

import { Server as IoServer, Socket } from 'socket.io';
import { captionsService } from '../services/captions.service';
import prisma from './prisma';

export function registerCaptionHandlers(io: IoServer): void {

  // Broadcast caption segments to all viewers in the room
  captionsService.on('segment', ({ roomId, segment }) => {
    io.to(`room:${roomId}`).emit('caption:segment', segment);
  });

  captionsService.on('error', ({ roomId, message }) => {
    io.to(`room:${roomId}`).emit('caption:error', { message });
  });

  io.on('connection', (socket: Socket) => {

    // ── Host starts captions ────────────────────────────────────────────────
    socket.on('caption:start', async ({ roomId, hostToken, language, provider }) => {
      try {
        const stream = await prisma.stream.findUnique({ where: { roomId } });
        if (!stream || stream.hostToken !== hostToken) {
          socket.emit('caption:error', { message: 'Unauthorized' });
          return;
        }
        const session = await captionsService.startSession(roomId, stream.id, language ?? 'en', provider ?? 'deepgram');
        socket.emit('caption:started', session);
        // Notify all viewers
        io.to(`room:${roomId}`).emit('caption:status', { active: true, language: session.language });
      } catch (err) {
        socket.emit('caption:error', { message: (err as Error).message });
      }
    });

    // ── Host streams audio PCM chunks ────────────────────────────────────────
    // The browser AudioWorklet encodes 16-bit PCM at 16kHz and sends chunks
    socket.on('caption:audio', ({ roomId, chunk }: { roomId: string; chunk: Buffer | ArrayBuffer }) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      captionsService.pushAudio(roomId, buf);
    });

    // ── Host stops captions ──────────────────────────────────────────────────
    socket.on('caption:stop', async ({ roomId, hostToken }) => {
      try {
        const stream = await prisma.stream.findUnique({ where: { roomId } });
        if (!stream || stream.hostToken !== hostToken) return;
        await captionsService.stopSession(roomId);
        socket.emit('caption:stopped', { ok: true });
        io.to(`room:${roomId}`).emit('caption:status', { active: false });
      } catch (err) {
        socket.emit('caption:error', { message: (err as Error).message });
      }
    });

    // ── Viewer requests caption status ───────────────────────────────────────
    socket.on('caption:getStatus', ({ roomId }) => {
      const isActive = captionsService.isActive(roomId);
      socket.emit('caption:status', { active: isActive });
    });
  });
}
