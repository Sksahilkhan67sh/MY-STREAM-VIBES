import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as net from 'net';

interface RelaySession {
  process: ChildProcess;
  roomId: string;
  platform: string;
  rtmpUrl: string;
  startedAt: Date;
  inputServer?: net.Server;
  inputPort?: number;
}

class RtmpRelay extends EventEmitter {
  private sessions = new Map<string, RelaySession>();

  async checkFFmpeg(): Promise<boolean> {
    return new Promise(resolve => {
      const p = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('close', code => resolve(code === 0));
    });
  }

  // Find a free port for receiving browser stream
  private getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, () => {
        const port = (srv.address() as net.AddressInfo).port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }

  async startRelay(
    roomId: string,
    platform: string,
    rtmpUrl: string
  ): Promise<{ success: boolean; message: string; inputPort?: number }> {
    const ffmpegOk = await this.checkFFmpeg();
    if (!ffmpegOk) {
      return { success: false, message: 'FFmpeg not found. Install from https://ffmpeg.org and add to PATH.' };
    }

    if (this.sessions.has(roomId)) {
      this.stopRelay(roomId);
    }

    try {
      // Get a free port for receiving WebM stream from browser
      const inputPort = await this.getFreePort();

      // FFmpeg: read WebM from TCP socket → re-encode → push to RTMP
      const args = [
        '-loglevel', 'warning',
        // Input: WebM stream over TCP from browser
        '-f', 'webm_dash_manifest',
        '-re',
        '-i', `tcp://127.0.0.1:${inputPort}?listen`,
        // Video encoding
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-pix_fmt', 'yuv420p',
        '-g', '60',
        '-keyint_min', '60',
        // Audio encoding
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        // Output to RTMP
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        rtmpUrl,
      ];

      const proc = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let started = false;
      let errorOutput = '';

      proc.stderr?.on('data', (data: Buffer) => {
        const line = data.toString();
        errorOutput += line;

        if (line.includes('frame=') || line.includes('fps=')) {
          if (!started) {
            started = true;
            this.emit('started', { roomId });
          }
          this.emit('progress', { roomId, data: line.trim() });
        }

        if (
          line.includes('Connection refused') ||
          line.includes('Invalid data') ||
          line.includes('not supported')
        ) {
          if (!started) {
            this.stopRelay(roomId);
            this.emit('error', { roomId, error: `Stream rejected by ${platform}: ${line.trim()}` });
          }
        }
      });

      proc.on('error', (err) => {
        this.sessions.delete(roomId);
        this.emit('error', { roomId, error: err.message });
      });

      proc.on('close', (code) => {
        this.sessions.delete(roomId);
        this.emit('ended', { roomId, code });
      });

      this.sessions.set(roomId, {
        process: proc,
        roomId,
        platform,
        rtmpUrl,
        startedAt: new Date(),
        inputPort,
      });

      return {
        success: true,
        message: `FFmpeg ready — waiting for browser stream on port ${inputPort}`,
        inputPort,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to start relay' };
    }
  }

  stopRelay(roomId: string): boolean {
    const session = this.sessions.get(roomId);
    if (!session) return false;
    try {
      session.process.kill('SIGTERM');
      setTimeout(() => {
        try { session.process.kill('SIGKILL'); } catch {}
      }, 3000);
    } catch {}
    this.sessions.delete(roomId);
    return true;
  }

  getInputPort(roomId: string): number | undefined {
    return this.sessions.get(roomId)?.inputPort;
  }

  isActive(roomId: string): boolean {
    return this.sessions.has(roomId);
  }

  stopAll() {
    this.sessions.forEach((_, roomId) => this.stopRelay(roomId));
  }
}

export const rtmpRelay = new RtmpRelay();
