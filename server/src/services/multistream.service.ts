/**
 * server/src/services/multistream.service.ts
 * PHASE 5 — Multi-Platform Streaming Service
 *
 * Manages simultaneous RTMP pushes to YouTube, Twitch, Facebook, LinkedIn.
 * Each destination gets its own ffmpeg process pulling from the LiveKit RTMP
 * ingest (already set up via egress.ts) and re-muxing to the target.
 *
 * Architecture:
 *   LiveKit Egress → local RTMP server (port 1935) → MultiStreamService
 *                                                         ├── ffmpeg → YouTube
 *                                                         ├── ffmpeg → Twitch
 *                                                         ├── ffmpeg → Facebook
 *                                                         └── ffmpeg → LinkedIn
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import prisma from '../lib/prisma';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamHealth {
  destinationId: string;
  status: 'idle' | 'connecting' | 'live' | 'error' | 'stopped';
  bitrateKbps: number;
  droppedFrames: number;
  latencyMs: number;
  health: 'good' | 'degraded' | 'poor' | 'unknown';
  errorMessage?: string;
  uptimeSeconds: number;
}

interface ActiveSession {
  process: ChildProcess;
  sessionId: string;
  destinationId: string;
  rtmpUrl: string;
  startedAt: Date;
  bitrateKbps: number;
  droppedFrames: number;
  healthCheckInterval: NodeJS.Timeout;
}

// ── Platform Configs ──────────────────────────────────────────────────────────

export const PLATFORM_CONFIGS: Record<string, {
  name: string;
  rtmpBase: string;
  keyPlaceholder: string;
  maxBitrateKbps: number;
  recommendedBitrateKbps: number;
  color: string;
  icon: string;
}> = {
  youtube: {
    name: 'YouTube',
    rtmpBase: 'rtmp://a.rtmp.youtube.com/live2/',
    keyPlaceholder: 'xxxx-xxxx-xxxx-xxxx-xxxx',
    maxBitrateKbps: 51_000,
    recommendedBitrateKbps: 4_500,
    color: '#FF0000',
    icon: 'youtube',
  },
  twitch: {
    name: 'Twitch',
    rtmpBase: 'rtmp://live.twitch.tv/live/',
    keyPlaceholder: 'live_XXXXXXXX_...',
    maxBitrateKbps: 6_000,
    recommendedBitrateKbps: 3_500,
    color: '#9147FF',
    icon: 'twitch',
  },
  facebook: {
    name: 'Facebook',
    rtmpBase: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    keyPlaceholder: 'FB-XXXXXXXXXX-0-...',
    maxBitrateKbps: 4_000,
    recommendedBitrateKbps: 3_000,
    color: '#1877F2',
    icon: 'facebook',
  },
  linkedin: {
    name: 'LinkedIn',
    rtmpBase: 'rtmp://4.rtmp.youtube.com/live2/', // LinkedIn uses YouTube-compatible ingest
    keyPlaceholder: 'your-linkedin-stream-key',
    maxBitrateKbps: 3_500,
    recommendedBitrateKbps: 2_500,
    color: '#0A66C2',
    icon: 'linkedin',
  },
  custom: {
    name: 'Custom RTMP',
    rtmpBase: '',
    keyPlaceholder: 'rtmp://your-server/live/stream-key',
    maxBitrateKbps: 50_000,
    recommendedBitrateKbps: 4_000,
    color: '#6B7280',
    icon: 'radio',
  },
};

// ── Service ───────────────────────────────────────────────────────────────────

class MultiStreamService extends EventEmitter {
  // roomId → Map<destinationId, ActiveSession>
  private sessions = new Map<string, Map<string, ActiveSession>>();

  /**
   * Start streaming a room to one destination.
   * sourceRtmpUrl: the RTMP URL we're reading FROM (LiveKit egress output).
   */
  async startDestination(
    roomId: string,
    sessionId: string,
    destinationId: string,
    sourceRtmpUrl: string,
    targetRtmpUrl: string,
  ): Promise<void> {
    const roomSessions = this.sessions.get(roomId) ?? new Map();
    if (roomSessions.has(destinationId)) {
      console.warn(`[MultiStream] ${destinationId} already running for ${roomId}`);
      return;
    }

    await prisma.multiStreamSession.update({
      where: { id: sessionId },
      data: { status: 'connecting', startedAt: new Date() },
    });

    // ffmpeg: read RTMP input, re-encode (copy) to target
    // Using -c copy for zero-overhead passthrough when bitrates match
    const args = [
      '-re',
      '-i', sourceRtmpUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-ar', '44100',
      '-b:a', '128k',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      targetRtmpUrl,
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let droppedFrames = 0;
    let lastBitrateKbps = 0;

    proc.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      // Parse ffmpeg stats line: "frame=  123 fps=30 q=-1.0 size=  1024kB time=00:00:04.10 bitrate=2048.0kbits/s dup=0 drop=2 speed=1.00x"
      const bitrateMatch = line.match(/bitrate=\s*([\d.]+)kbits/);
      if (bitrateMatch) lastBitrateKbps = Math.round(parseFloat(bitrateMatch[1]));
      const dropMatch = line.match(/drop=(\d+)/);
      if (dropMatch) droppedFrames = parseInt(dropMatch[1]);
    });

    proc.on('exit', async (code) => {
      console.log(`[MultiStream] Destination ${destinationId} exited (code ${code})`);
      this.cleanupSession(roomId, destinationId);
      const status = code === 0 ? 'stopped' : 'error';
      await prisma.multiStreamSession.update({
        where: { id: sessionId },
        data: {
          status,
          stoppedAt: new Date(),
          errorMessage: code !== 0 ? `Process exited with code ${code}` : null,
        },
      }).catch(() => {});
      this.emit('sessionEnd', { roomId, destinationId, sessionId, code });
    });

    // Health check every 30s
    const healthCheckInterval = setInterval(async () => {
      const health = this.computeHealth(lastBitrateKbps, droppedFrames);
      await prisma.multiStreamSession.update({
        where: { id: sessionId },
        data: {
          status: 'live',
          bitrateKbps: lastBitrateKbps,
          droppedFrames,
          health,
        },
      }).catch(() => {});
      this.emit('healthUpdate', { roomId, destinationId, bitrateKbps: lastBitrateKbps, droppedFrames, health });
    }, 30_000);

    const session: ActiveSession = {
      process: proc,
      sessionId,
      destinationId,
      rtmpUrl: targetRtmpUrl,
      startedAt: new Date(),
      bitrateKbps: 0,
      droppedFrames: 0,
      healthCheckInterval,
    };

    roomSessions.set(destinationId, session);
    this.sessions.set(roomId, roomSessions);

    await prisma.multiStreamSession.update({
      where: { id: sessionId },
      data: { status: 'live' },
    });

    console.log(`[MultiStream] ✅ ${destinationId} live for room ${roomId}`);
  }

  async stopDestination(roomId: string, destinationId: string): Promise<void> {
    const session = this.sessions.get(roomId)?.get(destinationId);
    if (!session) return;
    session.process.kill('SIGTERM');
    // Give it 3s then SIGKILL
    setTimeout(() => { try { session.process.kill('SIGKILL'); } catch {} }, 3000);
  }

  async stopAllForRoom(roomId: string): Promise<void> {
    const roomSessions = this.sessions.get(roomId);
    if (!roomSessions) return;
    for (const [destId] of roomSessions) {
      await this.stopDestination(roomId, destId);
    }
  }

  getHealthForRoom(roomId: string): StreamHealth[] {
    const roomSessions = this.sessions.get(roomId);
    if (!roomSessions) return [];
    return Array.from(roomSessions.values()).map(s => ({
      destinationId: s.destinationId,
      status: 'live',
      bitrateKbps: s.bitrateKbps,
      droppedFrames: s.droppedFrames,
      latencyMs: 0,
      health: this.computeHealth(s.bitrateKbps, s.droppedFrames),
      uptimeSeconds: Math.floor((Date.now() - s.startedAt.getTime()) / 1000),
    }));
  }

  private computeHealth(
    bitrateKbps: number,
    droppedFrames: number,
  ): 'good' | 'degraded' | 'poor' | 'unknown' {
    if (bitrateKbps === 0) return 'unknown';
    if (droppedFrames > 50) return 'poor';
    if (droppedFrames > 10) return 'degraded';
    return 'good';
  }

  private cleanupSession(roomId: string, destinationId: string): void {
    const roomSessions = this.sessions.get(roomId);
    if (!roomSessions) return;
    const session = roomSessions.get(destinationId);
    if (session) clearInterval(session.healthCheckInterval);
    roomSessions.delete(destinationId);
    if (roomSessions.size === 0) this.sessions.delete(roomId);
  }
}

export const multiStreamService = new MultiStreamService();
