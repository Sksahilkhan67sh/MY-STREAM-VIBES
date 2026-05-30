'use client';
import { useState, useRef, useEffect } from 'react';
import { LiveKitRoom, useLocalParticipant, useRoomContext } from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, createLocalVideoTrack, createLocalScreenTracks, createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack, ConnectionState } from 'livekit-client';
import { motion, AnimatePresence } from 'framer-motion';
import ChatPanel from './ChatPanel';
import CoHostManager from './CoHostManager';
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
  tools:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  chat:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
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

// ── Slide panel (from right on desktop, from bottom on mobile) ─
function Panel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/30 z-40" />
          {/* Desktop: slide from right */}
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="hidden sm:flex fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-950 border-l border-gray-100 dark:border-gray-800 z-50 flex-col shadow-2xl">
            {children}
          </motion.div>
          {/* Mobile: slide from bottom */}
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="sm:hidden fixed left-0 right-0 bottom-0 max-h-[85vh] bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 z-50 flex flex-col shadow-2xl rounded-t-2xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Video preview ──────────────────────────────────────────────
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
  const [colorSettings, setColorSettingsState] = useState<ColorSettings>(DEFAULT_SETTINGS);
  // Always keep ref in sync so the canvas draw loop reads the latest values
  // without needing to restart the loop on every slider change
  const setColorSettings = (s: ColorSettings) => {
    colorSettingsRef.current = s;
    setColorSettingsState(s);
  };
  const [resolution, setResolution]     = useState<Resolution>(DEFAULT_RESOLUTION);

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef  = useRef<LocalAudioTrack  | null>(null);
  const gradedCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const gradedRafRef     = useRef<number>(0);
  const gradedTrackRef   = useRef<LocalVideoTrack | null>(null);
  // Keep a ref so the canvas draw loop always reads the LATEST settings
  // without needing to restart the RAF loop on every slider change
  const colorSettingsRef = useRef<ColorSettings>(DEFAULT_SETTINGS);

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

  const startGradedCanvas = async () => {
    const srcVideo = cameraVideoRef.current;
    if (!srcVideo) return;

    // Wait for video dimensions to be available
    await new Promise<void>(resolve => {
      if (srcVideo.videoWidth > 0) { resolve(); return; }
      const h = () => { resolve(); srcVideo.removeEventListener('loadedmetadata', h); };
      srcVideo.addEventListener('loadedmetadata', h);
      setTimeout(resolve, 2000);
    });

    cancelAnimationFrame(gradedRafRef.current);

    const canvas = document.createElement('canvas');
    canvas.width  = srcVideo.videoWidth  || 1280;
    canvas.height = srcVideo.videoHeight || 720;
    gradedCanvasRef.current = canvas;

    const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

    // Draw at least one frame BEFORE capturing stream so the track is never blank
    const drawFrame = () => {
      if (srcVideo.readyState >= 2 && srcVideo.videoWidth > 0) {
        if (canvas.width !== srcVideo.videoWidth)  canvas.width  = srcVideo.videoWidth;
        if (canvas.height !== srcVideo.videoHeight) canvas.height = srcVideo.videoHeight;

        const cs = colorSettingsRef.current;
        const bright = 1 + cs.brightness / 100;
        const cont   = 1 + cs.contrast   / 100;
        const sat    = Math.max(0, 1 + cs.saturation / 100);
        const hueRot = cs.hue + cs.warmth * 0.08;
        ctx.filter = [
          `brightness(${bright.toFixed(3)})`,
          `contrast(${cont.toFixed(3)})`,
          `saturate(${sat.toFixed(3)})`,
          `hue-rotate(${hueRot.toFixed(1)}deg)`,
          cs.sharpness > 0 ? `blur(${(0.3 - cs.sharpness * 0.003).toFixed(3)}px)` : '',
        ].filter(Boolean).join(' ');

        if ((window as any).__cameraFlipped) {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(srcVideo, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(srcVideo, 0, 0, canvas.width, canvas.height);
        }

        if (cs.vignette > 0) {
          const a = cs.vignette / 100 * 0.75;
          const g = ctx.createRadialGradient(
            canvas.width/2, canvas.height/2, canvas.width * 0.3,
            canvas.width/2, canvas.height/2, canvas.width * 0.8,
          );
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, `rgba(0,0,0,${a.toFixed(3)})`);
          ctx.filter = 'none';
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    // Draw first frame immediately so captureStream gets a real frame
    drawFrame();

    // Start the RAF loop
    const loop = () => { drawFrame(); gradedRafRef.current = requestAnimationFrame(loop); };
    gradedRafRef.current = requestAnimationFrame(loop);

    // Capture stream AFTER first frame is drawn
    const ms = (canvas as any).captureStream(30) as MediaStream;
    const vt = ms.getVideoTracks()[0];
    if (!vt) return;

    const lp = localParticipant;
    const { LocalVideoTrack: LVT } = await import('livekit-client');
    const lvt = new LVT(vt, undefined, false);

    // FIX: publish new canvas track BEFORE unpublishing old track
    // This ensures viewers always have at least one active track — no blank gap
    try {
      await lp.publishTrack(lvt);
    } catch (e) {
      console.warn('graded publish failed', e);
      return;
    }

    // Now safely remove the old graded track (new one is already live)
    if (gradedTrackRef.current) {
      try { await lp.unpublishTrack(gradedTrackRef.current); } catch {}
    }
    gradedTrackRef.current = lvt;
  };

  // Track whether graded canvas is currently active so we only start/stop it
  // when crossing the default ↔ non-default boundary, not on every slider move
  const gradedActiveRef = useRef(false);

  useEffect(() => {
    if (!cameraOn) return;
    const isDefault = Object.entries(colorSettings).every(([k,v]) => v === DEFAULT_SETTINGS[k as keyof ColorSettings]);
    if (isDefault) {
      // Switching back to no grading — stop canvas, republish raw track
      if (gradedActiveRef.current) {
        gradedActiveRef.current = false;
        cancelAnimationFrame(gradedRafRef.current);
        if (gradedTrackRef.current) {
          localParticipant.unpublishTrack(gradedTrackRef.current).catch(() => {});
          gradedTrackRef.current = null;
        }
        if (cameraTrackRef.current) {
          localParticipant.publishTrack(cameraTrackRef.current).catch(() => {});
        }
      }
      // If already not graded, do nothing — sliders at default, raw track already published
    } else {
      // Non-default settings — start canvas only if not already running
      if (!gradedActiveRef.current) {
        gradedActiveRef.current = true;
        // NOTE: we do NOT unpublish cameraTrack here — startGradedCanvas publishes
        // the new canvas track first, then unpublishes the raw track inside itself,
        // so viewers never see a blank frame gap.
        startGradedCanvas();
      }
      // If canvas already running, the draw loop reads colorSettingsRef automatically — no restart needed
    }
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
    const isDefault = Object.entries(colorSettings).every(([k,v]) => v === DEFAULT_SETTINGS[k as keyof ColorSettings]);
    if (isDefault) {
      await localParticipant.publishTrack(t);
    }
    setTimeout(syncStreams, 300);
  };

  const toggleCamera = async () => {
    setError('');
    if (cameraOn) {
      if (cameraTrackRef.current) {
        try { await localParticipant.unpublishTrack(cameraTrackRef.current); } catch {}
        cameraTrackRef.current.stop(); cameraTrackRef.current = null;
      }
      cancelAnimationFrame(gradedRafRef.current);
      if (gradedTrackRef.current) {
        try { await localParticipant.unpublishTrack(gradedTrackRef.current); } catch {}
        gradedTrackRef.current = null;
      }
      gradedActiveRef.current = false;
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

  const flipCamera = async () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    setCameraFlipped(false);
    if (cameraOn) {
      try { await startCamera(newFacing); }
      catch { setFacingMode(facingMode); }
    }
  };

  const mirrorCamera = () => setCameraFlipped(f => {
    (window as any).__cameraFlipped = !f;
    return !f;
  });

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
        if (!t) throw new Error('No screen track');
        screenTrackRef.current = t;
        attach(t, screenVideoRef);
        await localParticipant.publishTrack(t);
        const screenAudioTrack = tracks.find(t => t.kind === Track.Kind.Audio);
        if (screenAudioTrack) {
          try { await localParticipant.publishTrack(screenAudioTrack); } catch {}
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

  const toggleMic = () => {
    if (!audioTrackRef.current) return;
    micOn ? audioTrackRef.current.mute() : audioTrackRef.current.unmute();
    setMicOn(!micOn);
  };

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
    { id: 'cohost',     label: 'Co-Hosts',      badge: null },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors duration-200 overflow-hidden"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">StreamVault</span>
          </div>
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 sm:px-2.5 py-1 rounded-full border border-red-100 dark:border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />LIVE
            </span>
          )}
          {isConnecting && (
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
              Connecting...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <button onClick={() => { setPanelTab('chat'); setPanelOpen(true); }}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
            {Icons.chat}
            <span className="hidden xs:inline sm:inline">Chat</span>
          </button>
          <button onClick={() => { setPanelTab('tools'); setPanelOpen(true); }}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
            {Icons.tools}
            <span className="hidden xs:inline sm:inline">Tools</span>
          </button>
        </div>
      </div>

      {/* ── Body: on mobile stack vertically, on desktop side by side ── */}
      <div className="flex flex-col sm:flex-row flex-1 min-h-0 gap-0">

        {/* ── Preview area ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-black relative" style={{ minHeight: '40vw' }}>
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
              <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 w-24 h-16 sm:w-36 sm:h-24 rounded-xl overflow-hidden border-2 border-white/20 cursor-pointer hover:border-white/50 transition-all shadow-xl group"
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
              <div className="text-center px-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
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
              <div className="absolute top-2 sm:top-3 left-2 sm:left-3 flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs bg-black/50 text-white px-2 py-1 rounded-full">
                  {facingMode === 'user' ? '📷 Front' : '🔄 Rear'}
                </span>
                {cameraFlipped && (
                  <span className="text-xs bg-black/50 text-white px-2 py-1 rounded-full hidden sm:inline">⟺ Mirrored</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Controls: horizontal bar on mobile, sidebar on desktop ── */}
        <div className="sm:w-56 sm:flex-shrink-0 bg-white dark:bg-gray-900 border-t sm:border-t-0 sm:border-l border-gray-100 dark:border-gray-800 flex flex-row sm:flex-col overflow-x-auto sm:overflow-y-auto sm:overflow-x-hidden">

          {/* Error — full width on mobile */}
          {error && (
            <div className="sm:mx-3 mx-2 my-2 sm:mt-3 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg border border-red-100 dark:border-red-500/20 flex-shrink-0 sm:w-auto">
              {error}
            </div>
          )}

          {/* Mobile: horizontal button strip */}
          <div className="flex sm:hidden items-center gap-2 px-3 py-2.5 w-full overflow-x-auto">
            {/* Camera toggle */}
            <button
              disabled={!isConnected}
              onClick={toggleCamera}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-all min-w-[60px] disabled:opacity-30
                ${cameraOn ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {Icons.camera}
              {cameraOn ? 'On' : 'Cam'}
            </button>

            {/* Flip camera (mobile only — front/rear) */}
            {cameraOn && (
              <button onClick={flipCamera}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 transition-colors min-w-[60px]">
                {Icons.flip}
                Flip
              </button>
            )}

            {/* Mirror */}
            {cameraOn && (
              <button onClick={mirrorCamera}
                className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors min-w-[60px]
                  ${cameraFlipped ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                <span className="text-sm">⟺</span>
                Mirror
              </button>
            )}

            {/* Screen */}
            <button
              disabled={!isConnected}
              onClick={toggleScreen}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-all min-w-[60px] disabled:opacity-30
                ${screenOn ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {Icons.screen}
              {screenOn ? 'On' : 'Screen'}
            </button>

            {/* Mic */}
            <button
              disabled={!audioTrackRef.current}
              onClick={toggleMic}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-all min-w-[60px] disabled:opacity-30
                ${micOn ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {micOn ? Icons.micOn : Icons.micOff}
              {micOn ? 'Mic' : 'Mute'}
            </button>

            {/* Swap PiP */}
            {bothOn && (
              <button onClick={() => setPipSwapped(s => !s)}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 transition-colors min-w-[60px]">
                {Icons.swap}
                Swap
              </button>
            )}

            {/* Copy link */}
            <button onClick={onCopy}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-all min-w-[60px]
                ${copied ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-100 dark:border-green-500/20' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {copied ? Icons.check : Icons.copy}
              {copied ? 'Copied' : 'Link'}
            </button>

            {/* End stream */}
            {isLive && (
              <button onClick={stopAll}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors min-w-[60px]">
                {Icons.stop}
                End
              </button>
            )}
          </div>

          {/* Desktop: vertical sidebar layout (unchanged from original) */}
          <div className="hidden sm:flex sm:flex-col sm:flex-1">
            {/* Camera controls group */}
            <div className="p-3 border-b border-gray-50 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Camera</p>
              <div className="space-y-2">
                <CtrlBtn active={cameraOn} disabled={!isConnected} onClick={toggleCamera} full>
                  {Icons.camera}
                  {cameraOn ? 'Camera on' : 'Camera off'}
                </CtrlBtn>

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

            {isLive && (
              <div className="p-3 border-b border-gray-50 dark:border-gray-800">
                <CtrlBtn danger onClick={stopAll} full>
                  {Icons.stop}
                  End stream
                </CtrlBtn>
              </div>
            )}

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

            <div className="p-3">
              <div className={`flex items-center justify-center gap-2 text-xs font-medium rounded-lg py-2
                ${isLive ? 'text-red-500' : isConnected ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}>
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : isConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                {isLive ? 'You are live' : isConnected ? 'Ready to stream' : isConnecting ? 'Connecting...' : 'Disconnected'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Slide panel (chat + tools) ── */}
      <Panel open={panelOpen} onClose={() => setPanelOpen(false)}>
        <div className="flex items-center justify-between px-4 py-3 sm:py-3.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
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

        {panelTab === 'chat' && (
          <div className="flex-1 min-h-0">
            <ChatPanel roomId={stream.roomId} identity={`host-${stream.roomId}`} nickname="Host" isHost />
          </div>
        )}

        {panelTab === 'tools' && (
          <div className="flex-1 overflow-y-auto">
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
                  {activePanel === 'cohost' && (
                    <CoHostManager
                      roomId={stream.roomId}
                      hostToken={stream.hostToken}
                    />
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
