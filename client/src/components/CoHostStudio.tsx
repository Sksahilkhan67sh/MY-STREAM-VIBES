'use client';
import { useState, useRef, useEffect } from 'react';
import {
  LiveKitRoom, useLocalParticipant, useRoomContext, useRemoteParticipants,
} from '@livekit/components-react';
import RemoteMonitor from './RemoteMonitor';
import '@livekit/components-styles';
import {
  Track, createLocalVideoTrack, createLocalScreenTracks,
  createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack, ConnectionState,
} from 'livekit-client';
import { motion, AnimatePresence } from 'framer-motion';
import ColorGrading, { ColorSettings, DEFAULT_SETTINGS, buildFilter, buildVignette } from './ColorGrading';
import { ThemeToggle } from './ThemeContext';
import ChatPanel from './ChatPanel';

interface CoHostStudioProps {
  roomId:       string;
  title:        string;
  name:         string;
  identity:     string;
  livekitToken: string;
  appUrl:       string;
}

// ── Video preview with color filter ──────────────────────────
function VideoPreview({ srcRef, active, flipped, colorSettings }: {
  srcRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean; flipped: boolean; colorSettings: ColorSettings;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const dst = ref.current;
    if (!dst || !srcRef.current) return;
    const s = srcRef.current.srcObject as MediaStream | null;
    if (s !== dst.srcObject) dst.srcObject = s;
  });
  if (!active) return null;
  return (
    <video ref={ref} autoPlay muted playsInline className="w-full h-full object-contain"
      style={{ filter: buildFilter(colorSettings), transform: flipped ? 'scaleX(-1)' : undefined }} />
  );
}

// ── Control button ────────────────────────────────────────────
function Btn({ active, disabled, onClick, children, danger }: {
  active?: boolean; disabled?: boolean; onClick: () => void;
  children: React.ReactNode; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed
        ${danger
          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20'
          : active
            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border border-transparent'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}>
      {children}
    </button>
  );
}

// ── Label bar for stream sections ─────────────────────────────
function SectionLabel({ label, extra }: { label: string; extra?: React.ReactNode }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-zinc-800">
      <span className="flex items-center gap-2 text-xs font-bold text-zinc-300 uppercase tracking-wider">
        {label}
      </span>
      {extra}
    </div>
  );
}

// ── Co-host Studio Inner ──────────────────────────────────────
function CoHostInner({ roomId, title, name, appUrl }: Omit<CoHostStudioProps, 'livekitToken' | 'identity'>) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  const [roomState, setRoomState]     = useState<ConnectionState>(ConnectionState.Disconnected);
  const [cameraOn, setCameraOn]       = useState(false);
  const [screenOn, setScreenOn]       = useState(false);
  const [micOn, setMicOn]             = useState(false);
  const [flipped, setFlipped]         = useState(false);
  const [error, setError]             = useState('');
  const [showColor, setShowColor]     = useState(false);
  const [showChat, setShowChat]       = useState(false);
  const [colorSettings, setColorSettingsState] = useState<ColorSettings>(DEFAULT_SETTINGS);
  const colorSettingsRef = useRef<ColorSettings>(DEFAULT_SETTINGS);
  const setColorSettings = (s: ColorSettings) => { colorSettingsRef.current = s; setColorSettingsState(s); };

  const cameraTrackRef  = useRef<LocalVideoTrack | null>(null);
  const screenTrackRef  = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef   = useRef<LocalAudioTrack  | null>(null);
  const cameraVideoRef  = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef  = useRef<HTMLVideoElement | null>(null);
  const gradedRafRef    = useRef<number>(0);
  const gradedTrackRef  = useRef<LocalVideoTrack | null>(null);
  const gradedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gradedActiveRef = useRef(false);

  const isConnected  = roomState === ConnectionState.Connected;
  const isConnecting = roomState === ConnectionState.Connecting || roomState === ConnectionState.Reconnecting;
  const bothOn       = cameraOn && screenOn;

  const remoteParticipants = useRemoteParticipants();
  // Host is any participant with identity starting with 'host-'
  const hostPresent    = remoteParticipants.some(p => p.identity.startsWith('host-'));
  // Other co-hosts (not self) — identity starts with 'cohost-'
  const otherCoHosts   = remoteParticipants.filter(p => p.identity.startsWith('cohost-'));
  const totalParticipants = 1 + (hostPresent ? 1 : 0) + otherCoHosts.length; // self + host + other cohosts

  const isColorActive = Object.entries(colorSettings).some(([k,v]) => v !== DEFAULT_SETTINGS[k as keyof ColorSettings]);

  useEffect(() => {
    if (!room) return;
    const update = (s: ConnectionState) => setRoomState(s);
    update(room.state);
    room.on('connectionStateChanged', update);
    return () => { room.off('connectionStateChanged', update); };
  }, [room]);

  const waitForConnection = () => new Promise<void>((resolve, reject) => {
    if (room?.state === ConnectionState.Connected) { resolve(); return; }
    const t = setTimeout(() => reject(new Error('Timed out')), 15000);
    const h = (s: ConnectionState) => {
      if (s === ConnectionState.Connected) { clearTimeout(t); room?.off('connectionStateChanged', h); resolve(); }
    };
    room?.on('connectionStateChanged', h);
  });

  const attach = (track: LocalVideoTrack, ref: React.RefObject<HTMLVideoElement | null>) => {
    if (ref.current) { track.detach(); track.attach(ref.current); }
  };

  const ensureMic = async () => {
    if (audioTrackRef.current) return;
    const t = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
    audioTrackRef.current = t;
    await localParticipant.publishTrack(t);
    setMicOn(true);
  };

  // ── Graded canvas ─────────────────────────────────────────
  // ONLY primitive CSS filter functions — NO svg url() which taints canvas and breaks captureStream
  const buildSafeCtxFilter = () => {
    const cs = colorSettingsRef.current;
    const bright = 1 + cs.brightness / 100;
    const cont   = 1 + cs.contrast   / 100;
    const sat    = Math.max(0, 1 + cs.saturation / 100);
    const hueRot = cs.hue + cs.warmth * 0.08;
    const sharpBoost = cs.sharpness > 0 ? 1 + cs.sharpness * 0.004 : 1;
    return [
      `brightness(${bright.toFixed(3)})`,
      `contrast(${(cont * sharpBoost).toFixed(3)})`,
      `saturate(${sat.toFixed(3)})`,
      `hue-rotate(${hueRot.toFixed(1)}deg)`,
    ].join(' ');
  };

  const startGradedCanvas = async () => {
    const src = cameraVideoRef.current;
    if (!src) return;

    await new Promise<void>(resolve => {
      if (src.videoWidth > 0) { resolve(); return; }
      const h = () => { resolve(); src.removeEventListener('loadedmetadata', h); };
      src.addEventListener('loadedmetadata', h);
      setTimeout(resolve, 2000);
    });

    cancelAnimationFrame(gradedRafRef.current);

    const canvas = document.createElement('canvas');
    canvas.width  = src.videoWidth  || 1280;
    canvas.height = src.videoHeight || 720;
    gradedCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

    const drawFrame = () => {
      if (src.readyState >= 2 && src.videoWidth > 0) {
        if (canvas.width  !== src.videoWidth)  canvas.width  = src.videoWidth;
        if (canvas.height !== src.videoHeight) canvas.height = src.videoHeight;
        // Safe primitive-only filter — no SVG url(), no canvas taint
        ctx.filter = buildSafeCtxFilter();
        if (flipped) {
          ctx.save(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
          ctx.drawImage(src, 0, 0, canvas.width, canvas.height); ctx.restore();
        } else {
          ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        }
        const cs = colorSettingsRef.current;
        if (cs.vignette > 0) {
          ctx.filter = 'none';
          const a = (cs.vignette / 100) * 0.75;
          const g = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
            canvas.width / 2, canvas.height / 2, canvas.width * 0.8,
          );
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, `rgba(0,0,0,${a.toFixed(3)})`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    // Draw first real frame before captureStream — viewers never see a blank frame
    drawFrame();

    const loop = () => { drawFrame(); gradedRafRef.current = requestAnimationFrame(loop); };
    gradedRafRef.current = requestAnimationFrame(loop);

    const ms = (canvas as any).captureStream(30) as MediaStream;
    const vt = ms.getVideoTracks()[0];
    if (!vt) { cancelAnimationFrame(gradedRafRef.current); return; }

    const { LocalVideoTrack: LVT } = await import('livekit-client');
    const lvt = new LVT(vt, undefined, false);

    // Publish canvas track first — no viewer gap
    try {
      await localParticipant.publishTrack(lvt, { source: Track.Source.Camera });
    } catch {
      cancelAnimationFrame(gradedRafRef.current);
      return;
    }

    // stopOnUnpublish=false keeps MediaStreamTrack alive for canvas drawImage
    if (cameraTrackRef.current) { try { await localParticipant.unpublishTrack(cameraTrackRef.current, false); } catch {} }
    if (gradedTrackRef.current && gradedTrackRef.current !== lvt) { try { await localParticipant.unpublishTrack(gradedTrackRef.current); } catch {} }

    gradedTrackRef.current = lvt;
    gradedActiveRef.current = true;
  };

  useEffect(() => {
    if (!cameraOn) return;

    const isDefault = Object.entries(colorSettings).every(
      ([k, v]) => v === DEFAULT_SETTINGS[k as keyof ColorSettings]
    );

    if (isDefault) {
      if (gradedActiveRef.current) {
        gradedActiveRef.current = false;
        cancelAnimationFrame(gradedRafRef.current);
        if (gradedTrackRef.current) {
          localParticipant.unpublishTrack(gradedTrackRef.current).catch(() => {});
          gradedTrackRef.current = null;
        }
        if (cameraTrackRef.current) {
          const mst = cameraTrackRef.current.mediaStreamTrack;
          if (mst && mst.readyState === 'ended') {
            const stream = cameraVideoRef.current?.srcObject as MediaStream | null;
            const liveTracks = stream?.getVideoTracks().filter(t => t.readyState === 'live');
            if (liveTracks?.length) {
              cameraTrackRef.current = new (require('livekit-client').LocalVideoTrack)(liveTracks[0], undefined, false);
            }
          }
          if (cameraTrackRef.current) localParticipant.publishTrack(cameraTrackRef.current).catch(() => {});
        }
      }
    } else {
      // colorSettingsRef is already updated — RAF loop picks up new values immediately
      if (!gradedActiveRef.current) {
        startGradedCanvas();
      }
    }
  }, [colorSettings, cameraOn]);

  // ── Camera toggle ─────────────────────────────────────────
  const toggleCamera = async () => {
    setError('');
    if (cameraOn) {
      if (cameraTrackRef.current) { try { await localParticipant.unpublishTrack(cameraTrackRef.current); } catch {} cameraTrackRef.current.stop(); cameraTrackRef.current = null; }
      cancelAnimationFrame(gradedRafRef.current);
      if (gradedTrackRef.current) { try { await localParticipant.unpublishTrack(gradedTrackRef.current); } catch {} gradedTrackRef.current = null; }
      gradedActiveRef.current = false;
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
      cameraTrackRef.current = null; setCameraOn(false);
    } else {
      try {
        await waitForConnection();
        const t = await createLocalVideoTrack({ resolution: { width: 1280, height: 720, frameRate: 30 }, facingMode: 'user' });
        cameraTrackRef.current = t; attach(t, cameraVideoRef);
        const isDefault = Object.entries(colorSettings).every(([k,v]) => v === DEFAULT_SETTINGS[k as keyof ColorSettings]);
        if (isDefault) await localParticipant.publishTrack(t);
        await ensureMic(); setCameraOn(true);
      } catch (e: any) { setError(`Camera failed: ${e?.message || 'Permission denied'}`); }
    }
  };

  // ── Screen toggle ─────────────────────────────────────────
  const toggleScreen = async () => {
    setError('');
    if (screenOn) {
      if (screenTrackRef.current) { try { await localParticipant.unpublishTrack(screenTrackRef.current); } catch {} screenTrackRef.current.stop(); screenTrackRef.current = null; }
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setScreenOn(false);
    } else {
      try {
        await waitForConnection();
        const tracks = await createLocalScreenTracks({ audio: true });
        const t = tracks.find(t => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
        if (!t) throw new Error('No screen track');
        screenTrackRef.current = t; attach(t, screenVideoRef);
        await localParticipant.publishTrack(t);
        const audioTrack = tracks.find(t => t.kind === Track.Kind.Audio);
        if (audioTrack) { try { await localParticipant.publishTrack(audioTrack); } catch {} }
        await ensureMic(); setScreenOn(true);
        t.mediaStreamTrack.addEventListener('ended', () => {
          setScreenOn(false); screenTrackRef.current = null;
          if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        });
      } catch (e: any) { setError(`Screen share failed: ${e?.message}`); }
    }
  };

  const toggleMic = () => {
    if (!audioTrackRef.current) return;
    micOn ? audioTrackRef.current.mute() : audioTrackRef.current.unmute();
    setMicOn(!micOn);
  };

  const leaveStream = async () => {
    for (const ref of [cameraTrackRef, screenTrackRef, gradedTrackRef]) {
      if (ref.current) { try { await localParticipant.unpublishTrack(ref.current as LocalVideoTrack); } catch {} (ref.current as any).stop?.(); ref.current = null; }
    }
    if (audioTrackRef.current) { try { await localParticipant.unpublishTrack(audioTrackRef.current); } catch {} audioTrackRef.current.stop(); audioTrackRef.current = null; }
    cancelAnimationFrame(gradedRafRef.current);
    gradedActiveRef.current = false;
    window.location.href = '/';
  };

  // ── Layout: render remote streams depending on participant count ──
  // totalParticipants = self(cohost) + host? + other cohosts
  const renderRemoteStreams = () => {
    const remotes: React.ReactNode[] = [];

    if (hostPresent) {
      remotes.push(
        <div key="host" className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-zinc-800">
          <RemoteMonitor filterPrefix="host-" label="Host stream" />
        </div>
      );
    }

    otherCoHosts.forEach((p, i) => {
      remotes.push(
        <div key={p.identity} className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-zinc-800">
          <RemoteMonitor
            filterPrefix={p.identity}
            label={p.identity.replace('cohost-','').replace(/-[a-z0-9]{6,}$/,'') || `Co-host ${i + 2}`}
          />
        </div>
      );
    });

    return remotes;
  };

  // For 4-participant layout, use a 2x2 grid
  const use2x2Grid = totalParticipants >= 4;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200 overflow-hidden"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
  <img src="/logo.png" alt="StreamVault" className="w-6 h-6 object-contain" />
  <span className="font-bold text-sm text-gray-900 dark:text-gray-100">StreamVault</span>
</div>
          <span className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-500/20">
            🎙 Co-Host
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{title}</span>
          {isConnecting && (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              Connecting...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => setShowChat(s => !s)}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
            Chat
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Hidden source video elements */}
        <video ref={cameraVideoRef} autoPlay muted playsInline style={{ position: 'fixed', width: 0, height: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }} />
        <video ref={screenVideoRef} autoPlay muted playsInline style={{ position: 'fixed', width: 0, height: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }} />

        {/* Preview column */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden bg-zinc-950">

          {use2x2Grid ? (
            /* ── 4-participant 2×2 grid ── */
            <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-zinc-800">
              {/* CO-HOST (You) - top-left */}
              <div className="bg-zinc-950 overflow-hidden flex flex-col min-h-0">
                <SectionLabel label="👤 Co-Host (You)" extra={bothOn && <span className="text-[10px] text-zinc-500">PiP active</span>} />
                <div className="flex-1 min-h-0 bg-black relative overflow-hidden flex items-center justify-center">
                  {screenOn && <VideoPreview srcRef={screenVideoRef} active={screenOn} flipped={false} colorSettings={colorSettings} />}
                  {!screenOn && cameraOn && <VideoPreview srcRef={cameraVideoRef} active={cameraOn} flipped={flipped} colorSettings={colorSettings} />}
                  {bothOn && (
                    <div className="absolute bottom-2 right-2 w-20 h-12 rounded-lg overflow-hidden border border-white/20 shadow-lg">
                      <VideoPreview srcRef={cameraVideoRef} active={cameraOn} flipped={flipped} colorSettings={colorSettings} />
                    </div>
                  )}
                  {(cameraOn || screenOn) && colorSettings.vignette > 0 && <div style={buildVignette(colorSettings.vignette)} />}
                  {!cameraOn && !screenOn && (
                    <p className="text-xs text-zinc-600">{isConnecting ? 'Connecting...' : `${name} — enable camera or screen`}</p>
                  )}
                  {(cameraOn || screenOn) && (
                    <div className="absolute bottom-2 left-2">
                      <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded-full font-semibold">🎙 {name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Remote streams fill the other 3 grid slots */}
              {hostPresent && (
                <div className="bg-zinc-950 overflow-hidden flex flex-col min-h-0">
                  <RemoteMonitor filterPrefix="host-" label="Host stream" />
                </div>
              )}
              {otherCoHosts.slice(0, hostPresent ? 2 : 3).map((p, i) => (
                <div key={p.identity} className="bg-zinc-950 overflow-hidden flex flex-col min-h-0">
                  <RemoteMonitor
                    filterPrefix={p.identity}
                    label={p.identity.replace('cohost-','').replace(/-[a-z0-9]{6,}$/,'') || `Co-host ${i + 2}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            /* ── Stacked layout (1–3 participants) ── */
            <div className="flex flex-col h-full">
              {/* CO-HOST (You) section */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <SectionLabel label="👤 Co-Host Stream (You)" extra={bothOn && <span className="text-[10px] text-zinc-500">PiP active</span>} />
                <div className="flex-1 min-h-0 bg-black relative overflow-hidden flex items-center justify-center">
                  {screenOn && <VideoPreview srcRef={screenVideoRef} active={screenOn} flipped={false} colorSettings={colorSettings} />}
                  {!screenOn && cameraOn && <VideoPreview srcRef={cameraVideoRef} active={cameraOn} flipped={flipped} colorSettings={colorSettings} />}
                  {bothOn && (
                    <div className="absolute bottom-3 right-3 w-36 h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl">
                      <VideoPreview srcRef={cameraVideoRef} active={cameraOn} flipped={flipped} colorSettings={colorSettings} />
                    </div>
                  )}
                  {(cameraOn || screenOn) && colorSettings.vignette > 0 && <div style={buildVignette(colorSettings.vignette)} />}
                  {!cameraOn && !screenOn && (
                    <div className="text-center px-6">
                      <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500">
                        {isConnecting ? 'Connecting...' : `Welcome, ${name}! Enable your camera or screen to go live.`}
                      </p>
                    </div>
                  )}
                  {(cameraOn || screenOn) && (
                    <div className="absolute bottom-3 left-3">
                      <span className="text-xs bg-black/60 text-white px-2.5 py-1 rounded-full font-semibold">🎙 {name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Remote streams stacked below */}
              {renderRemoteStreams()}
            </div>
          )}
        </div>

        {/* Controls sidebar */}
        <div className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-800 flex flex-col overflow-y-auto">

          {error && (
            <div className="mx-3 mt-3 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg border border-red-100 dark:border-red-500/20">
              {error}
            </div>
          )}

          {/* CAMERA */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800 space-y-2">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Camera</p>
            <Btn active={cameraOn} disabled={!isConnected} onClick={toggleCamera}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              {cameraOn ? 'Camera on' : 'Camera off'}
            </Btn>
            {cameraOn && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                  onClick={() => { /* flip — cohost uses front cam only, no rear toggle needed */ }}>
                  ↔ Flip
                </button>
                <button onClick={() => setFlipped(f => !f)}
                  className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold border transition-colors
                    ${flipped ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  ⟺ Mirror
                </button>
              </div>
            )}
          </div>

          {/* SOURCES */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800 space-y-2">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Sources</p>
            <Btn active={screenOn} disabled={!isConnected} onClick={toggleScreen}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {screenOn ? 'Screen on' : 'Screen off'}
            </Btn>
            <Btn active={micOn} disabled={!audioTrackRef.current} onClick={toggleMic}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={micOn ? "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" : "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1m5.586 0H20a1 1 0 011 1v4a1 1 0 01-1 1h-1.586M9 11l3 3 3-3"} />
              </svg>
              {micOn ? 'Mic on' : 'Mic off'}
            </Btn>
          </div>

          {/* COLOR GRADING */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800">
            <button onClick={() => setShowColor(s => !s)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-colors
                ${showColor ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-500/20' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              <span className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Color Grading
                {isColorActive && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
              </span>
              <span>{showColor ? '▲' : '▼'}</span>
            </button>
            <AnimatePresence>
              {showColor && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-2">
                  <ColorGrading settings={colorSettings} onChange={setColorSettings} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* LEAVE */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800">
            <Btn danger onClick={leaveStream}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
              Leave stream
            </Btn>
          </div>

          {/* VIEWER LINK */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Viewer link</p>
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate mb-2 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 rounded-lg">
              {appUrl ? `${appUrl}/s/...` : 'Stream link'}
            </p>
            <button
              onClick={() => { try { navigator.clipboard.writeText(window.location.href); } catch {} }}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl border bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Copy link
            </button>
          </div>

          {/* STATUS */}
          <div className="px-3 pb-3">
            <div className={`flex items-center justify-center gap-2 text-xs font-medium rounded-lg py-2
              ${isConnected ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              {isConnected ? `Live as ${name}` : isConnecting ? 'Connecting...' : 'Disconnected'}
            </div>
          </div>
        </div>

        {/* Chat panel — ChatPanel itself stays mounted at all times (just
            visually collapsed to width 0 when hidden) instead of being
            unmounted by the showChat conditional. Previously, hiding chat
            unmounted ChatPanel entirely, which tore down its socket
            connection and local message list — every message the co-host
            had received vanished, and reopening chat started from a blank
            room with a brand-new connection. Keeping it mounted preserves
            both; the slide width/opacity animation looks identical. */}
        <div
          className={`flex-shrink-0 border-l border-gray-100 dark:border-gray-800 overflow-hidden transition-all duration-200 ${showChat ? 'w-[288px] opacity-100' : 'w-0 opacity-0 border-l-0'}`}
          aria-hidden={!showChat}
        >
          <div className="w-[288px] h-full">
            <ChatPanel roomId={roomId} identity={`cohost-${name}`} nickname={name} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoHostStudio(props: CoHostStudioProps) {
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
  return (
    <LiveKitRoom serverUrl={livekitUrl} token={props.livekitToken} connect={true} audio={false} video={false} className="h-full w-full">
      <CoHostInner roomId={props.roomId} title={props.title} name={props.name} appUrl={props.appUrl} />
    </LiveKitRoom>
  );
}
