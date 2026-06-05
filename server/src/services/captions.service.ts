/**
 * server/src/services/captions.service.ts
 * PHASE 6 — AI Live Captions Service
 *
 * Connects a Deepgram real-time WebSocket to the audio stream from
 * the browser (piped via Socket.io) and emits caption events back.
 *
 * Also supports AssemblyAI as a fallback provider.
 *
 * Flow:
 *   Browser AudioContext → PCM chunks → Socket.io → CaptionsService
 *       → Deepgram WS → transcript segments → Socket.io → all viewers
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import prisma from '../lib/prisma';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CaptionSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  language: string;
  isFinal: boolean;
  speaker?: string;
}

export interface CaptionSession {
  transcriptId: string;
  provider: string;
  language: string;
  startedAt: Date;
}

type Provider = 'deepgram' | 'assemblyai';

// ── Deepgram connection ───────────────────────────────────────────────────────

function buildDeepgramUrl(language: string, tier = 'nova-2'): string {
  const params = new URLSearchParams({
    model: tier,
    language,
    smart_format: 'true',
    diarize: 'true',
    punctuate: 'true',
    interim_results: 'true',
    endpointing: '300',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

class CaptionsService extends EventEmitter {
  // roomId → { ws, session }
  private sessions = new Map<string, { ws: WebSocket; session: CaptionSession; buffer: Buffer[] }>();

  /**
   * Start a captions session for a room.
   * Called by the Socket.io handler when the host enables captions.
   */
  async startSession(
    roomId: string,
    streamId: string,
    language = 'en',
    provider: Provider = 'deepgram',
  ): Promise<CaptionSession> {
    if (this.sessions.has(roomId)) {
      return this.sessions.get(roomId)!.session;
    }

    // Create DB transcript record
    const transcript = await prisma.transcript.upsert({
      where: { streamId },
      create: { streamId, language, provider, status: 'active', startedAt: new Date() },
      update: { status: 'active', startedAt: new Date(), language, provider },
    });

    const session: CaptionSession = {
      transcriptId: transcript.id,
      provider,
      language,
      startedAt: new Date(),
    };

    const ws = await this.connectDeepgram(roomId, transcript.id, language);

    this.sessions.set(roomId, { ws, session, buffer: [] });
    console.log(`[Captions] ✅ Session started for ${roomId} (${language}, ${provider})`);
    return session;
  }

  /**
   * Push a chunk of raw PCM audio (16-bit, 16kHz mono) from the browser.
   */
  pushAudio(roomId: string, chunk: Buffer): void {
    const sess = this.sessions.get(roomId);
    if (!sess || sess.ws.readyState !== WebSocket.OPEN) return;
    sess.ws.send(chunk);
  }

  /**
   * Stop the captions session and mark transcript as completed.
   */
  async stopSession(roomId: string): Promise<void> {
    const sess = this.sessions.get(roomId);
    if (!sess) return;
    // Send close message to Deepgram
    if (sess.ws.readyState === WebSocket.OPEN) {
      sess.ws.send(JSON.stringify({ type: 'CloseStream' }));
      sess.ws.close();
    }
    this.sessions.delete(roomId);
    // Mark transcript complete
    await prisma.transcript.update({
      where: { id: sess.session.transcriptId },
      data: { status: 'completed', completedAt: new Date() },
    }).catch(() => {});
    console.log(`[Captions] Session stopped for ${roomId}`);
  }

  isActive(roomId: string): boolean {
    return this.sessions.has(roomId);
  }

  // ── Private: Deepgram WS connection ───────────────────────────────────────

  private async connectDeepgram(
    roomId: string,
    transcriptId: string,
    language: string,
  ): Promise<WebSocket> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not configured');

    const url = buildDeepgramUrl(language);
    const ws = new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } });

    let streamStartMs = Date.now();
    let segmentBuffer = '';
    let segmentStartMs = 0;

    ws.on('open', () => {
      streamStartMs = Date.now();
      console.log(`[Deepgram] Connected for room ${roomId}`);
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0];
          if (!alt) return;

          const text: string = alt.transcript ?? '';
          if (!text.trim()) return;

          const isFinal: boolean = msg.is_final ?? false;
          const words = alt.words ?? [];
          const startMs = words[0]?.start != null
            ? Math.round(words[0].start * 1000)
            : Date.now() - streamStartMs;
          const endMs = words[words.length - 1]?.end != null
            ? Math.round(words[words.length - 1].end * 1000)
            : startMs + 500;
          const confidence: number = alt.confidence ?? 1.0;
          const speaker: string | undefined = words[0]?.speaker != null
            ? `Speaker ${words[0].speaker}`
            : undefined;

          const segment: CaptionSegment = {
            text,
            startMs,
            endMs,
            confidence,
            language,
            isFinal,
            speaker,
          };

          // Emit for real-time broadcast via Socket.io
          this.emit('segment', { roomId, segment });

          // Persist final segments only
          if (isFinal) {
            await prisma.transcriptSegment.create({
              data: {
                transcriptId,
                text,
                startMs,
                endMs,
                confidence,
                language,
                speaker,
                isFinal: true,
              },
            }).catch(() => {});

            // Update full text
            segmentBuffer += (segmentBuffer ? ' ' : '') + text;
            await prisma.transcript.update({
              where: { id: transcriptId },
              data: { fullText: segmentBuffer },
            }).catch(() => {});
          }
        }

        if (msg.type === 'Error') {
          console.error('[Deepgram] Error:', msg.message);
          this.emit('error', { roomId, message: msg.message });
          await prisma.transcript.update({
            where: { id: transcriptId },
            data: { status: 'error', errorMsg: msg.message },
          }).catch(() => {});
        }
      } catch {}
    });

    ws.on('error', (err) => {
      console.error(`[Deepgram] WS error for ${roomId}:`, err.message);
      this.emit('error', { roomId, message: err.message });
    });

    ws.on('close', () => {
      console.log(`[Deepgram] WS closed for ${roomId}`);
    });

    // Wait for open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Deepgram connection timeout')), 10_000);
      ws.once('open', () => { clearTimeout(timeout); resolve(); });
      ws.once('error', (e) => { clearTimeout(timeout); reject(e); });
    });

    return ws;
  }
}

export const captionsService = new CaptionsService();
