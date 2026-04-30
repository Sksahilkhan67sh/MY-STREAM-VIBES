'use client';
import { useState, useRef, useEffect } from 'react';
import {
  LiveKitRoom, useLocalParticipant, useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import {
  Track, createLocalVideoTrack, createLocalScreenTracks,
  createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack,
  ConnectionState,
} from 'livekit-client';
import { motion, AnimatePresence } from 'framer-motion';
import ChatPanel from './ChatPanel';
import RtmpModal from './RtmpModal';
import RecordingPanel from './RecordingPanel';
import PollCreator from './PollCreator';
import ColorGrading, { ColorSettings, DEFAULT_SETTINGS, buildFilter, buildVignette } from './ColorGrading';
import ResolutionPicker, { Resolution, DEFAULT_RESOLUTION } from './ResolutionPicker';
import { ThemeToggle } from './ThemeContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StreamData {
  roomId: string; hostToken: string; livekitToken: string;
  viewerUrl: string; expiresAt: string;
}
interface HostControlsProps {
  stream: StreamData; appUrl: string; onCopy: () => void; copied: boolean;
}

// ── Minimal icon buttons ───────────────────────────────────────
function Btn({ active, disabled, onClick, children, danger }: {
  active?: boolean; disabled?: boolean; onClick: () => void;
  children: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed
        ${danger
          ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
          : active
            ? 'bg-gray-900 text-white'
            : 'bg-gray-50 dark:bg-gray-900 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-100'}`}
    >
      {children}
    </button>
  );
}

// ── Side panel ─────────────────────────────────────────────────
function Panel({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-40"
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-950 border-l border-gray-100 dark:border-gray-800 z-50 flex flex-col shadow-xl"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Main preview ───────────────────────────────────────────────
function VideoPreview({
  cameraRef, screenRef, cameraOn, screenOn, mainIsCam, colorSettings,
}: {
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  screenRef: React.RefObject<HTMLVideoElement | null>;
  cameraOn: boolean; screenOn: boolean;
  mainIsCam: boolean; colorSettings: ColorSettings;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const dst = ref.current;
    if (!dst) return;
    const primary  = mainIsCam ? cameraRef.current : screenRef.current;
    const fallback = mainIsCam ? screenRef.current  : cameraRef.current;
    const s = (primary?.srcObject ?? fallback?.srcObject) as MediaStream | null;
    if (s !== dst.srcObject) dst.srcObject = s;
  });
  if (!cameraOn && !screenOn) return null;
  return (
    <video
      ref={ref} autoPlay muted playsInline
      className="w-full h-full object-contain"
      style={{ filter: buildFilter(colorSettings) }}
    />
  );
}

function PipVideo({
  cameraRef, screenRef, mainIsCam, colorSettings,
}: {
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  screenRef: React.RefObject<HTMLVideoElement | null>;
  mainIsCam: boolean; colorSettings: ColorSettings;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const dst = ref.current;
    if (!dst) return;
    const src = mainIsCam ? screenRef.current : cameraRef.current;
    const s = src?.srcObject as MediaStream | null;
    if (s !== dst.srcObject) dst.srcObject = s;
  });
  return (
    <video
      ref={ref} autoPlay muted playsInline
      className="w-full h-full object-cover"
      style={{ filter: buildFilter(colorSettings) }}
    />
  );
}

// ── Host Studio ────────────────────────────────────────────────
function HostStudio({ stream, appUrl, onCopy, copied }: HostControlsProps) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  const [roomState, setRoomState]     = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isLive, setIsLive]           = useState(false);
  const [cameraOn, setCameraOn]       = useState(false);
  const [screenOn, setScreenOn]       = useState(false);
  const [micOn, setMicOn]             = useState(false);
  const [pipSwapped, setPipSwapped]   = useState(false);
  const [error, setError]             = useState('');
  const [panelOpen, setPanelOpen]     = useState(false);
  const [panelTab, setPanelTab]       = useState<'tools' | 'chat'>('chat');
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [showRtmp, setShowRtmp]       = useState(false);
  const [rtmpActive, setRtmpActive]   = useState(false);
  const [activePoll, setActivePoll]   = useState<any>(null);
  const [activeStreams, setActiveStreams] = useState<MediaStream[]>([]);
  const [colorSettings, setColorSettings] = useState<ColorSettings>(DEFAULT_SETTINGS);
  const [resolution, setResolution]   = useState<Resolution>(DEFAULT_RESOLUTION);

  const cameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef  = useRef<LocalAudioTrack  | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  const viewerLink = `${appUrl}${stream.viewerUrl}`;
  const bothOn     = cameraOn && screenOn;
  const isConnected  = roomState === ConnectionState.Connected;
  const isConnecting = roomState === ConnectionState.Connecting || roomState === ConnectionState.Reconnecting;

  useEffect(() => {
    if (!room) return;
    const update = (s: ConnectionState) => setRoomState(s);
    update(room.state);
    room.on('connectionStateChanged', update);
    return () => { room.off('connectionStateChanged', update); };
  }, [room]);

  const waitForConnection = () => new Promise<void>((resolve, reject) => {
    if (room?.state === ConnectionState.Connected) { resolve(); return; }
    const t = setTimeout(() => reject(new Error('Connection timed out')), 15000);
    const h = (s: ConnectionState) => {
      if (s === ConnectionState.Connected) {
        clearTimeout(t); room?.off('connectionStateChanged', h); resolve();
      }
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
    const c = cameraVideoRef.current?.srcObject as MediaStream | null;
    const sc = screenVideoRef.current?.srcObject as MediaStream | null;
    if (c) s.push(c);
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

  const toggleCamera = async () => {
    setError('');
    if (cameraOn) {
      if (cameraTrackRef.current) {
        try { await localParticipant.unpublishTrack(cameraTrackRef.current); } catch {}
        cameraTrackRef.current.stop(); cameraTrackRef.current = null;
      }
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
      setCameraOn(false);
      if (!screenOn) { setIsLive(false); await updateLive(false); }
      setTimeout(syncStreams, 100);
    } else {
      try {
        await waitForConnection();
        const t = await createLocalVideoTrack({
          resolution: { width: resolution.width, height: resolution.height, frameRate: resolution.frameRate },
          facingMode: 'user',
        });
        cameraTrackRef.current = t;
        attach(t, cameraVideoRef);
        await localParticipant.publishTrack(t);
        await ensureMic();
        setCameraOn(true);
        if (!isLive) { setIsLive(true); await updateLive(true); }
        setTimeout(syncStreams, 300);
      } catch (e: any) {
        setError(`Camera failed: ${e?.message || 'Permission denied'}`);
      }
    }
  };

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
        const tracks = await createLocalScreenTracks({ audio: false });
        const t = tracks.find(t => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
        if (!t) throw new Error('No screen track');
        screenTrackRef.current = t;
        attach(t, screenVideoRef);
        await localParticipant.publishTrack(t);
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
      } catch (e: any) {
        setError(`Screen share failed: ${e?.message}`);
      }
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
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setCameraOn(false); setScreenOn(false); setMicOn(false);
    setIsLive(false); setRtmpActive(false); setError('');
    setPipSwapped(false); setActiveStreams([]);
    await updateLive(false);
  };

  const TOOLS = [
    { id: 'resolution', label: 'Resolution', badge: resolution.tag },
    { id: 'color',      label: 'Color grading', badge: null },
    { id: 'recording',  label: 'Recording', badge: null },
    { id: 'poll',       label: 'Live poll', badge: activePoll ? 'Active' : null },
    { id: 'social',     label: 'Go social', badge: rtmpActive ? 'Live' : null },
    { id: 'link',       label: 'Viewer link', badge: null },
  ];

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-gray-950 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
    >
      {/* Left: Studio */}
      <div className="flex-1 flex flex-col min-h-0 border-r border-gray-100 dark:border-gray-800">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="font-bold text-sm">StreamVault</span>
            </div>
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
            {isConnecting && (
              <span className="text-xs text-gray-400 flex items-center gap-1.5">
                <div className="w-3 h-3 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
                Connecting...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => { setPanelTab('chat'); setPanelOpen(true); }}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Chat
            </button>
            <button
              onClick={() => { setPanelTab('tools'); setPanelOpen(true); }}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Tools
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-gray-950 relative flex items-center justify-center min-h-[300px]">
          <video ref={cameraVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
          <video ref={screenVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />

          <VideoPreview
            cameraRef={cameraVideoRef} screenRef={screenVideoRef}
            cameraOn={cameraOn} screenOn={screenOn}
            mainIsCam={pipSwapped} colorSettings={colorSettings}
          />

          {/* PiP */}
          {bothOn && (
            <div
              className="absolute bottom-4 right-4 w-32 h-20 rounded-lg overflow-hidden border border-gray-700 cursor-pointer hover:border-gray-400 transition-colors shadow-lg"
              onClick={() => setPipSwapped(s => !s)}
            >
              <PipVideo
                cameraRef={cameraVideoRef} screenRef={screenVideoRef}
                mainIsCam={pipSwapped} colorSettings={colorSettings}
              />
            </div>
          )}

          {/* Vignette */}
          {(cameraOn || screenOn) && colorSettings.vignette > 0 && (
            <div style={buildVignette(colorSettings.vignette)} />
          )}

          {/* Placeholder */}
          {!cameraOn && !screenOn && (
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isConnecting ? 'Connecting...' : isConnected ? 'Enable camera or screen below' : 'Cannot reach LiveKit'}
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-5 py-4 space-y-3 border-t border-gray-100 dark:border-gray-800">
          {error && (
            <div className="text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-lg">{error}</div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Btn active={cameraOn} disabled={!isConnected} onClick={toggleCamera}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              {cameraOn ? 'Camera on' : 'Camera'}
            </Btn>

            <Btn active={screenOn} disabled={!isConnected} onClick={toggleScreen}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {screenOn ? 'Screen on' : 'Screen'}
            </Btn>

            <Btn active={micOn} disabled={!audioTrackRef.current} onClick={toggleMic}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d={micOn
                    ? "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    : "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1m5.586 0H20a1 1 0 011 1v4a1 1 0 01-1 1h-1.586M9 11l3 3 3-3"} />
              </svg>
              {micOn ? 'Mic on' : 'Mic'}
            </Btn>

            {bothOn && (
              <button
                onClick={() => setPipSwapped(s => !s)}
                className="px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 rounded-lg transition-colors border border-gray-100 dark:border-gray-800"
              >
                Swap view
              </button>
            )}

            {isLive && (
              <Btn danger onClick={stopAll}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
                End stream
              </Btn>
            )}
          </div>

          {/* Viewer link row */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 px-4 py-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-400 font-mono flex-1 truncate">{viewerLink}</span>
            <button
              onClick={onCopy}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0"
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      </div>

      {/* Side panel */}
      <Panel open={panelOpen} onClose={() => setPanelOpen(false)}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex gap-1">
            {(['chat', 'tools'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setPanelTab(tab)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                  panelTab === tab
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chat tab */}
        {panelTab === 'chat' && (
          <div className="flex-1 min-h-0">
            <ChatPanel
              roomId={stream.roomId}
              identity={`host-${stream.roomId}`}
              nickname="Host"
              isHost
            />
          </div>
        )}

        {/* Tools tab */}
        {panelTab === 'tools' && (
          <div className="flex-1 overflow-y-auto">
            {/* Tool list */}
            {!activePanel && (
              <div className="p-3 space-y-1">
                {TOOLS.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setActivePanel(tool.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 transition-colors text-left"
                  >
                    <span>{tool.label}</span>
                    <div className="flex items-center gap-2">
                      {tool.badge && (
                        <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                          {tool.badge}
                        </span>
                      )}
                      <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Active tool */}
            {activePanel && (
              <div>
                <button
                  onClick={() => setActivePanel(null)}
                  className="flex items-center gap-2 px-5 py-3.5 text-sm text-gray-500 hover:text-gray-900 transition-colors border-b border-gray-100 w-full"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to tools
                </button>
                <div className="p-4">
                  {activePanel === 'resolution' && (
                    <ResolutionPicker value={resolution} onChange={setResolution} disabled={isLive} />
                  )}
                  {activePanel === 'color' && (
                    <ColorGrading settings={colorSettings} onChange={setColorSettings} />
                  )}
                  {activePanel === 'recording' && (
                    <RecordingPanel roomId={stream.roomId} hostToken={stream.hostToken} streams={activeStreams} />
                  )}
                  {activePanel === 'poll' && (
                    <PollCreator
                      roomId={stream.roomId} hostToken={stream.hostToken}
                      activePoll={activePoll}
                      onPollCreated={setActivePoll}
                      onPollClosed={() => setActivePoll(null)}
                    />
                  )}
                  {activePanel === 'social' && (
                    <div className="space-y-3">
                      {!isLive ? (
                        <p className="text-sm text-gray-400 text-center py-6">Go live first to enable social streaming.</p>
                      ) : rtmpActive ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            Social stream active
                          </div>
                          <button
                            onClick={async () => {
                              await fetch(`${API}/api/egress/rtmp/stop`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ roomId: stream.roomId, hostToken: stream.hostToken }),
                              });
                              setRtmpActive(false);
                            }}
                            className="w-full py-2.5 text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            Stop social stream
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowRtmp(true); setPanelOpen(false); }}
                          className="w-full py-2.5 text-sm font-semibold text-gray-700 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-100 dark:border-gray-800"
                        >
                          Go live on YouTube / Instagram
                        </button>
                      )}
                    </div>
                  )}
                  {activePanel === 'link' && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Viewer link</p>
                      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-100 rounded-lg px-4 py-3">
                        <p className="text-xs font-mono text-gray-600 break-all leading-relaxed">{viewerLink}</p>
                      </div>
                      <button
                        onClick={onCopy}
                        className="w-full py-2.5 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        {copied ? '✓ Copied!' : 'Copy link'}
                      </button>
                      <p className="text-xs text-gray-400 text-center">
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
