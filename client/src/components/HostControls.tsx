'use client';
import { useState, useRef, useEffect } from 'react';
import { LiveKitRoom, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, createLocalVideoTrack, createLocalScreenTracks, createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack, ConnectionState } from 'livekit-client';
import { motion, AnimatePresence } from 'framer-motion';
import ChatPanel from './ChatPanel';
import RtmpModal from './RtmpModal';
import RecordingPanel from './RecordingPanel';
import PollCreator from './PollCreator';
import ColorGrading, { ColorSettings, DEFAULT_SETTINGS, buildFilter, buildVignette } from './ColorGrading';
import ResolutionPicker, { Resolution, DEFAULT_RESOLUTION } from './ResolutionPicker';
import { ThemeToggle } from './ThemeContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StreamData { roomId: string; hostToken: string; livekitToken: string; viewerUrl: string; expiresAt: string; }
interface HostControlsProps { stream: StreamData; appUrl: string; onCopy: () => void; copied: boolean; }

// ── Icon SVGs ──────────────────────────────────────────────────
const Icons = {
  camera: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>,
  screen: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  micOn:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
  micOff: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1m5.586 0H20a1 1 0 011 1v4a1 1 0 01-1 1h-1.586M9 11l3 3 3-3" /></svg>,
  stop:   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>,
  flip:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>,
  swap:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  chevron:<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>,
  back:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>,
  close:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  link:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
  copy:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  check:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
};

// ── Control button ─────────────────────────────────────────────
function CtrlBtn({ active, disabled, onClick, children, danger, full }: {
  active?: boolean; disabled?: boolean; onClick: () => void;
  children: React.ReactNode; danger?: boolean; full?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
        disabled:opacity-30 disabled:cursor-not-allowed ${full ? 'w-full' : ''}
        ${danger
          ? 'bg-red-500/10 dark:bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20'
          : active
            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border border-transparent'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}>
      {children}
    </button>
  );
}

// ── Slide panel ────────────────────────────────────────────────
function Panel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/30 z-40" />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-950 border-l border-gray-100 dark:border-gray-800 z-50 flex flex-col shadow-2xl">
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Video preview with optional horizontal flip ────────────────
function VideoPreview({ cameraRef, screenRef, cameraOn, screenOn, mainIsCam, colorSettings, flipped }: {
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  screenRef: React.RefObject<HTMLVideoElement | null>;
  cameraOn: boolean; screenOn: boolean;
  mainIsCam: boolean; colorSettings: ColorSettings; flipped: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const dst = ref.current;
    if (!dst) return;
    const primary = mainIsCam ? cameraRef.current : screenRef.current;
    const fallback = mainIsCam ? screenRef.current : cameraRef.current;
    const s = (primary?.srcObject ?? fallback?.srcObject) as MediaStream | null;
    if (s !== dst.srcObject) dst.srcObject = s;
  });
  if (!cameraOn && !screenOn) return null;
  const filter = buildFilter(colorSettings);
  const transform = (mainIsCam && flipped) ? 'scaleX(-1)' : undefined;
  return <video ref={ref} autoPlay muted playsInline className="w-full h-full object-contain"
    style={{ filter, transform }} />;
}

function PipVideo({ cameraRef, screenRef, mainIsCam, colorSettings, flipped }: {
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  screenRef: React.RefObject<HTMLVideoElement | null>;
  mainIsCam: boolean; colorSettings: ColorSettings; flipped: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const dst = ref.current;
    if (!dst) return;
    const src = mainIsCam ? screenRef.current : cameraRef.current;
    const s = src?.srcObject as MediaStream | null;
    if (s !== dst.srcObject) dst.srcObject = s;
  });
  // pip shows the opposite source — if main is cam, pip is screen (no flip needed for screen)
  const isShowingCam = !mainIsCam;
  const transform = (isShowingCam && flipped) ? 'scaleX(-1)' : undefined;
  return <video ref={ref} autoPlay muted playsInline className="w-full h-full object-cover"
    style={{ filter: buildFilter(colorSettings), transform }} />;
}

// ── Host Studio ────────────────────────────────────────────────
function HostStudio({ stream, appUrl, onCopy, copied }: HostControlsProps) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  const [roomState, setRoomState]       = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isLive, setIsLive]             = useState(false);
  const [cameraOn, setCameraOn]         = useState(false);
  const [screenOn, setScreenOn]         = useState(false);
  const [micOn, setMicOn]               = useState(false);
  const [pipSwapped, setPipSwapped]     = useState(false);
  const [cameraFlipped, setCameraFlipped] = useState(false);
  const [facingMode, setFacingMode]     = useState<'user' | 'environment'>('user');
  const [error, setError]               = useState('');
  const [panelOpen, setPanelOpen]       = useState(false);
  const [panelTab, setPanelTab]         = useState<'chat' | 'tools'>('chat');
  const [activePanel, setActivePanel]   = useState<string | null>(null);
  const [showRtmp, setShowRtmp]         = useState(false);
  const [rtmpActive, setRtmpActive]     = useState(false);
  const [activePoll, setActivePoll]     = useState<any>(null);
  const [activeStreams, setActiveStreams] = useState<MediaStream[]>([]);
  const [colorSettings, setColorSettings] = useState<ColorSettings>(DEFAULT_SETTINGS);
  const [resolution, setResolution]     = useState<Resolution>(DEFAULT_RESOLUTION);

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef  = useRef<LocalAudioTrack  | null>(null);
  // Canvas for color-graded output
  const gradedCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const gradedRafRef     = useRef<number>(0);
  const gradedTrackRef   = useRef<LocalVideoTrack | null>(null);

  const viewerLink   = `${appUrl}${stream.viewerUrl}`;
  const bothOn       = cameraOn && screenOn;
  const isConnected  = roomState === ConnectionState.Connected;
  const isConnecting = roomState === ConnectionState.Connecting || roomState === ConnectionState.Reconnecting;

  useEffect(() => {
    if (!room) return;
    const update = (s: ConnectionState) => setRoomState(s);
    update(room.state);
    room.on('connectionStateChanged', update);
    return () => { room.off('connectionStateChanged', update); };
  }, [room]);

  // ── Canvas-based color grading publisher ────────────────────
  // When camera is on AND color settings change, capture graded canvas
  // and publish it instead of the raw track
  useEffect(() => {
    const isDefault = Object.entries(colorSettings).every(
      ([k, v]) => v === DEFAULT_SETTINGS[k as keyof ColorSettings]
    );

    // Stop any existing graded canvas track
    const stopGraded = async () => {
      cancelAnimationFrame(gradedRafRef.current);
      if (gradedTrackRef.current) {
        try { await localParticipant.unpublishTrack(gradedTrackRef.current); } catch {}
        gradedTrackRef.current = null;
      }
    };

    if (!cameraOn || isDefault) {
      // No grading needed — raw track is already published, stop graded if exists
      stopGraded();
      return;
    }

    const srcVideo = cameraVideoRef.current;
    if (!srcVideo || !srcVideo.srcObject) return;

    // Create hidden canvas
    const canvas = document.createElement('canvas');
    gradedCanvasRef.current = canvas;
    canvas.width  = srcVideo.videoWidth  || 1280;
    canvas.height = srcVideo.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    const filter = buildFilter(colorSettings);

    // Draw loop
    const draw = () => {
      if (!srcVideo.paused && srcVideo.readyState >= 2) {
        if (canvas.width  !== srcVideo.videoWidth)  canvas.width  = srcVideo.videoWidth;
        if (canvas.height !== srcVideo.videoHeight) canvas.height = srcVideo.videoHeight;
        ctx.filter = filter;
        ctx.drawImage(srcVideo, 0, 0, canvas.width, canvas.height);
        // Vignette
        if (colorSettings.vignette > 0) {
          const alpha = colorSettings.vignette / 100 * 0.75;
          const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.width*0.3, canvas.width/2, canvas.height/2, canvas.width*0.8);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, `rgba(0,0,0,${alpha.toFixed(3)})`);
          ctx.filter = 'none';
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      gradedRafRef.current = requestAnimationFrame(draw);
    };
    draw();

    // Capture canvas stream and publish as video track
    const publishGraded = async () => {
      try {
        // First unpublish raw camera track
        if (cameraTrackRef.current) {
          try { await localParticipant.unpublishTrack(cameraTrackRef.current); } catch {}
        }
        // Stop existing graded track
        if (gradedTrackRef.current) {
          try { await localParticipant.unpublishTrack(gradedTrackRef.current); } catch {}
          gradedTrackRef.current = null;
        }
        // Capture canvas at 30fps
        const stream = (canvas as any).captureStream(30) as MediaStream;
        const videoTrack = stream.getVideoTracks()[0];
        const { LocalVideoTrack: LVT } = await import('livekit-client');
        const lvTrack = new LVT(videoTrack, undefined, false);
        gradedTrackRef.current = lvTrack;
        await localParticipant.publishTrack(lvTrack);
      } catch (e) {
        console.warn('Graded canvas publish failed:', e);
      }
    };

    publishGraded();

    return () => {
      cancelAnimationFrame(gradedRafRef.current);
    };
  }, [colorSettings, cameraOn]);

  const waitForConnection = () => new Promise<void>((resolve, reject) => {
    if (room?.state === ConnectionState.Connected) { resolve(); return; }
    const t = setTimeout(() => reject(new Error('Connection timed out')), 15000);
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

  const syncStreams = () => {
    const s: MediaStream[] = [];
    const c  = cameraVideoRef.current?.srcObject as MediaStream | null;
    const sc = screenVideoRef.current?.srcObject  as MediaStream | null;
    if (c)  s.push(c);
    if (sc) s.push(sc);
    setActiveStreams(s);
  };

  const updateLive = async (live: boolean) => {
    try {
      await fetch(`${API}/api/streams/${stream.roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken: stream.hostToken, isLive: live }),
      });
    } catch {}
  };

  // ── Camera ──────────────────────────────────────────────────
  const startCamera = async (facing: 'user' | 'environment') => {
    if (cameraTrackRef.current) {
      try { await localParticipant.unpublishTrack(cameraTrackRef.current); } catch {}
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }
    const t = await createLocalVideoTrack({
      resolution: { width: resolution.width, height: resolution.height, frameRate: resolution.frameRate },
      facingMode: facing,
    });
    cameraTrackRef.current = t;
    attach(t, cameraVideoRef);
    await localParticipant.publishTrack(t);
    setTimeout(syncStreams, 300);
  };

  const toggleCamera = async () => {
    setError('');
    if (cameraOn) {
      if (cameraTrackRef.current) {
        try { await localParticipant.unpublishTrack(cameraTrackRef.current); } catch {}
        cameraTrackRef.current.stop(); cameraTrackRef.current = null;
      }
      // Also stop graded canvas track
      cancelAnimationFrame(gradedRafRef.current);
      if (gradedTrackRef.current) {
        try { await localParticipant.unpublishTrack(gradedTrackRef.current); } catch {}
        gradedTrackRef.current = null;
      }
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
      setCameraOn(false);
      if (!screenOn) { setIsLive(false); await updateLive(false); }
      setTimeout(syncStreams, 100);
    } else {
      try {
        await waitForConnection();
        await startCamera(facingMode);
        await ensureMic();
        setCameraOn(true);
        if (!isLive) { setIsLive(true); await updateLive(true); }
      } catch (e: any) { setError(`Camera failed: ${e?.message || 'Permission denied'}`); }
    }
  };

  // ── Flip camera (front ↔ back) ──────────────────────────────
  const flipCamera = async () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    setCameraFlipped(false); // reset mirror when switching physical camera
    if (cameraOn) {
      try { await startCamera(newFacing); }
      catch { setFacingMode(facingMode); } // revert on error
    }
  };

  // Mirror flip (CSS transform only — no track restart)
  const mirrorCamera = () => setCameraFlipped(f => !f);

  // ── Screen ──────────────────────────────────────────────────
  const toggleScreen = async () => {
    setError('');
    if (screenOn) {
      if (screenTrackRef.current) {
        try { await localParticipant.unpublishTrack(screenTrackRef.current); } catch {}
        screenTrackRef.current.stop(); screenTrackRef.current = null;
      }
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setScreenOn(false);
      if (!cameraOn) { setIsLive(false); await updateLive(false); }
      setTimeout(syncStreams, 100);
    } else {
      try {
        await waitForConnection();
        const tracks = await createLocalScreenTracks({ audio: true });
        const t = tracks.find(t => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
        const audioTrack = tracks.find(t => t.kind === Track.Kind.Audio);
        if (!t) throw new Error('No screen track');
        screenTrackRef.current = t;
        attach(t, screenVideoRef);
        await localParticipant.publishTrack(t);
        // Publish screen audio (game/system audio) if captured
        if (audioTrack) {
          await localParticipant.publishTrack(audioTrack);
        }
        await ensureMic();
        setScreenOn(true);
        if (!isLive) { setIsLive(true); await updateLive(true); }
        setTimeout(syncStreams, 300);
        t.mediaStreamTrack.addEventListener('ended', () => {
          setScreenOn(false); screenTrackRef.current = null;
          if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
          if (!cameraOn) { setIsLive(false); updateLive(false); }
          setTimeout(syncStreams, 100);
        });
      } catch (e: any) { setError(`Screen share failed: ${e?.message}`); }
    }
  };

  // ── Mic ─────────────────────────────────────────────────────
  const toggleMic = () => {
    if (!audioTrackRef.current) return;
    micOn ? audioTrackRef.current.mute() : audioTrackRef.current.unmute();
    setMicOn(!micOn);
  };

  // ── End all ─────────────────────────────────────────────────
  const stopAll = async () => {
    for (const ref of [cameraTrackRef, screenTrackRef]) {
      if (ref.current) {
        try { await localParticipant.unpublishTrack(ref.current); } catch {}
        ref.current.stop(); ref.current = null;
      }
    }
    if (audioTrackRef.current) {
      try { await localParticipant.unpublishTrack(audioTrackRef.current); } catch {}
      audioTrackRef.current.stop(); audioTrackRef.current = null;
    }
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    if (screenVideoRef.current)  screenVideoRef.current.srcObject  = null;
    setCameraOn(false); setScreenOn(false); setMicOn(false);
    setIsLive(false); setRtmpActive(false); setError('');
    setPipSwapped(false); setCameraFlipped(false); setActiveStreams([]);
    await updateLive(false);
  };

  const TOOLS = [
    { id: 'resolution', label: 'Resolution',    badge: resolution.tag },
    { id: 'color',      label: 'Color grading', badge: null },
    { id: 'recording',  label: 'Recording',     badge: null },
    { id: 'poll',       label: 'Live poll',     badge: activePoll ? 'Active' : null },
    { id: 'social',     label: 'Go social',     badge: rtmpActive ? 'Live' : null },
    { id: 'link',       label: 'Viewer link',   badge: null },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200 overflow-hidden"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">StreamVault</span>
          </div>
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2.5 py-1 rounded-full border border-red-100 dark:border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
            </span>
          )}
          {isConnecting && (
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
              Connecting...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => { setPanelTab('chat'); setPanelOpen(true); }}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
            Chat
          </button>
          <button onClick={() => { setPanelTab('tools'); setPanelOpen(true); }}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
            Tools
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 gap-0">

        {/* ── Preview area ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-black relative">
          <video ref={cameraVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
          <video ref={screenVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />

          {/* Main video */}
          <div className="flex-1 min-h-0 relative flex items-center justify-center">
            <VideoPreview
              cameraRef={cameraVideoRef} screenRef={screenVideoRef}
              cameraOn={cameraOn} screenOn={screenOn}
              mainIsCam={pipSwapped} colorSettings={colorSettings}
              flipped={cameraFlipped}
            />

            {/* PiP */}
            {bothOn && (
              <div className="absolute bottom-3 right-3 w-36 h-24 rounded-xl overflow-hidden border-2 border-white/20 cursor-pointer hover:border-white/50 transition-all shadow-xl group"
                onClick={() => setPipSwapped(s => !s)}>
                <PipVideo cameraRef={cameraVideoRef} screenRef={screenVideoRef}
                  mainIsCam={pipSwapped} colorSettings={colorSettings} flipped={cameraFlipped} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">Swap</span>
                </div>
              </div>
            )}

            {/* Vignette */}
            {(cameraOn || screenOn) && colorSettings.vignette > 0 && <div style={buildVignette(colorSettings.vignette)} />}

            {/* Placeholder */}
            {!cameraOn && !screenOn && (
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  {Icons.camera}
                </div>
                <p className="text-sm text-gray-500">
                  {isConnecting ? 'Connecting to LiveKit...' : isConnected ? 'Enable camera or screen to begin' : 'Cannot reach LiveKit server'}
                </p>
                {!isConnected && !isConnecting && (
                  <button onClick={() => window.location.reload()}
                    className="mt-2 text-xs text-gray-600 hover:text-gray-300 underline">
                    Retry connection
                  </button>
                )}
              </div>
            )}

            {/* Camera overlay badges */}
            {cameraOn && (
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="text-xs bg-black/50 text-white px-2 py-1 rounded-full">
                  {facingMode === 'user' ? '📷 Front' : '🔄 Rear'}
                </span>
                {cameraFlipped && (
                  <span className="text-xs bg-black/50 text-white px-2 py-1 rounded-full">⟺ Mirrored</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Controls sidebar ── */}
        <div className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 border-l border-gray-100 dark:border-gray-800 flex flex-col overflow-y-auto">

          {/* Error */}
          {error && (
            <div className="mx-3 mt-3 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg border border-red-100 dark:border-red-500/20">
              {error}
            </div>
          )}

          {/* Camera controls group */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Camera</p>
            <div className="space-y-2">
              <CtrlBtn active={cameraOn} disabled={!isConnected} onClick={toggleCamera} full>
                {Icons.camera}
                {cameraOn ? 'Camera on' : 'Camera off'}
              </CtrlBtn>

              {/* Flip + Mirror buttons — only when camera is on */}
              {cameraOn && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={flipCamera}
                    title="Switch front/rear camera"
                    className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-100 dark:border-blue-500/20 transition-colors">
                    {Icons.flip}
                    Flip
                  </button>
                  <button onClick={mirrorCamera}
                    title="Mirror camera horizontally"
                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold border transition-colors
                      ${cameraFlipped
                        ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                    ⟺ Mirror
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Screen + Mic group */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800 space-y-2">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Sources</p>
            <CtrlBtn active={screenOn} disabled={!isConnected} onClick={toggleScreen} full>
              {Icons.screen}
              {screenOn ? 'Screen on' : 'Screen off'}
            </CtrlBtn>
            <CtrlBtn active={micOn} disabled={!audioTrackRef.current} onClick={toggleMic} full>
              {micOn ? Icons.micOn : Icons.micOff}
              {micOn ? 'Mic on' : 'Mic off'}
            </CtrlBtn>
            {bothOn && (
              <CtrlBtn onClick={() => setPipSwapped(s => !s)} full>
                {Icons.swap}
                Swap view
              </CtrlBtn>
            )}
          </div>

          {/* End stream */}
          {isLive && (
            <div className="p-3 border-b border-gray-50 dark:border-gray-800">
              <CtrlBtn danger onClick={stopAll} full>
                {Icons.stop}
                End stream
              </CtrlBtn>
            </div>
          )}

          {/* Viewer link */}
          <div className="p-3 border-b border-gray-50 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Viewer link</p>
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate mb-2 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 rounded-lg">
              {viewerLink}
            </p>
            <button onClick={onCopy}
              className={`w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl border transition-all
                ${copied
                  ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-100 dark:border-green-500/20'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              {copied ? <>{Icons.check} Copied!</> : <>{Icons.copy} Copy link</>}
            </button>
          </div>

          {/* Status */}
          <div className="p-3">
            <div className={`flex items-center justify-center gap-2 text-xs font-medium rounded-lg py-2
              ${isLive ? 'text-red-500' : isConnected ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : isConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              {isLive ? 'You are live' : isConnected ? 'Ready to stream' : isConnecting ? 'Connecting...' : 'Disconnected'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Slide panel ── */}
      <Panel open={panelOpen} onClose={() => setPanelOpen(false)}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex gap-1">
            {(['chat', 'tools'] as const).map(tab => (
              <button key={tab} onClick={() => setPanelTab(tab)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors capitalize
                  ${panelTab === tab ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                {tab}
              </button>
            ))}
          </div>
          <button onClick={() => setPanelOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
            {Icons.close}
          </button>
        </div>

        {/* Chat tab */}
        {panelTab === 'chat' && (
          <div className="flex-1 min-h-0">
            <ChatPanel roomId={stream.roomId} identity={`host-${stream.roomId}`} nickname="Host" isHost />
          </div>
        )}

        {/* Tools tab */}
        {panelTab === 'tools' && (
          <div className="flex-1 overflow-y-auto">
            {/* Tool list */}
            {!activePanel && (
              <div className="p-3 space-y-1">
                {TOOLS.map(tool => (
                  <button key={tool.id} onClick={() => setActivePanel(tool.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                    <span>{tool.label}</span>
                    <div className="flex items-center gap-2">
                      {tool.badge && (
                        <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full border border-red-100 dark:border-red-500/20">
                          {tool.badge}
                        </span>
                      )}
                      {Icons.chevron}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Active tool */}
            {activePanel && (
              <div>
                <button onClick={() => setActivePanel(null)}
                  className="flex items-center gap-2 px-4 py-3.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border-b border-gray-100 dark:border-gray-800 w-full transition-colors">
                  {Icons.back} Back to tools
                </button>
                <div className="p-4">
                  {activePanel === 'resolution' && <ResolutionPicker value={resolution} onChange={setResolution} disabled={isLive} />}
                  {activePanel === 'color'      && <ColorGrading settings={colorSettings} onChange={setColorSettings} />}
                  {activePanel === 'recording'  && <RecordingPanel roomId={stream.roomId} hostToken={stream.hostToken} streams={activeStreams} />}
                  {activePanel === 'poll'       && <PollCreator roomId={stream.roomId} hostToken={stream.hostToken} activePoll={activePoll} onPollCreated={setActivePoll} onPollClosed={() => setActivePoll(null)} />}
                  {activePanel === 'social'     && (
                    <div className="space-y-3">
                      {!isLive
                        ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Go live first to enable social streaming.</p>
                        : rtmpActive
                          ? <div className="space-y-3">
                              <div className="flex items-center gap-2 text-sm font-semibold text-red-500">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />Social stream active
                              </div>
                              <button onClick={async () => {
                                await fetch(`${API}/api/egress/rtmp/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: stream.roomId, hostToken: stream.hostToken }) });
                                setRtmpActive(false);
                              }} className="w-full py-2.5 text-sm font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl border border-red-100 dark:border-red-500/20 transition-colors">
                                Stop social stream
                              </button>
                            </div>
                          : <button onClick={() => { setShowRtmp(true); setPanelOpen(false); }}
                              className="w-full py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors">
                              Go live on YouTube / Instagram
                            </button>
                      }
                    </div>
                  )}
                  {activePanel === 'link' && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Viewer link</p>
                      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3">
                        <p className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all leading-relaxed">{viewerLink}</p>
                      </div>
                      <button onClick={onCopy}
                        className="w-full py-2.5 text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 rounded-xl transition-colors">
                        {copied ? '✓ Copied!' : 'Copy link'}
                      </button>
                      <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
                        Expires {new Date(stream.expiresAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      {showRtmp && (
        <RtmpModal
          roomId={stream.roomId} hostToken={stream.hostToken}
          onClose={() => setShowRtmp(false)}
          onActivate={() => { setRtmpActive(true); setShowRtmp(false); }}
          onDeactivate={() => setRtmpActive(false)}
          streams={activeStreams}
        />
      )}
    </div>
  );
}

export default function HostControls(props: HostControlsProps) {
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
  return (
    <LiveKitRoom serverUrl={livekitUrl} token={props.stream.livekitToken} connect={true} audio={false} video={false} className="h-full w-full">
      <HostStudio {...props} />
    </LiveKitRoom>
  );
}
