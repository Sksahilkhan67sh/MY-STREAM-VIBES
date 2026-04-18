'use client';
import { useState, useRef, useEffect } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import {
  Track,
  createLocalVideoTrack,
  createLocalScreenTracks,
  createLocalAudioTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  ConnectionState,
} from 'livekit-client';
import {
  Copy, Check, ExternalLink, Monitor, Camera, Radio,
  Square, Mic, MicOff, Video, Wifi, WifiOff,
  RefreshCw, Share2, PictureInPicture2, Film,
} from 'lucide-react';
import ChatPanel from './ChatPanel';
import RtmpModal from './RtmpModal';
import RecordingPanel from './RecordingPanel';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StreamData {
  roomId: string;
  hostToken: string;
  livekitToken: string;
  viewerUrl: string;
  expiresAt: string;
}
interface HostControlsProps {
  stream: StreamData;
  appUrl: string;
  onCopy: () => void;
  copied: boolean;
}

function HostStudio({ stream, appUrl, onCopy, copied }: HostControlsProps) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();

  const [roomState, setRoomState]     = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isLive, setIsLive]           = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micOn, setMicOn]             = useState(false);
  const [cameraOn, setCameraOn]       = useState(false);
  const [screenOn, setScreenOn]       = useState(false);
  const [pipSwapped, setPipSwapped]   = useState(false);
  const [status, setStatus]           = useState('Connecting...');
  const [error, setError]             = useState('');
  const [showRtmp, setShowRtmp]       = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [rtmpActive, setRtmpActive]   = useState(false);
  const [activeStreams, setActiveStreams] = useState<MediaStream[]>([]);

  const cameraTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef  = useRef<LocalAudioTrack  | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
  const viewerLink  = `${appUrl}${stream.viewerUrl}`;
  const bothOn      = cameraOn && screenOn;

  // ── Connection ───────────────────────────────────────────────
  useEffect(() => {
    if (!room) return;
    const update = (state: ConnectionState) => {
      setRoomState(state);
      if (state === ConnectionState.Connected) { setStatus('Ready — enable Camera and/or Screen'); setError(''); }
      else if (state === ConnectionState.Connecting || state === ConnectionState.Reconnecting) setStatus('Connecting to LiveKit...');
      else setStatus('Disconnected');
    };
    update(room.state);
    room.on('connectionStateChanged', update);
    return () => { room.off('connectionStateChanged', update); };
  }, [room]);

  const waitForConnection = () => new Promise<void>((resolve, reject) => {
    if (room?.state === ConnectionState.Connected) { resolve(); return; }
    const t = setTimeout(() => reject(new Error('Connection timed out')), 15000);
    const h = (s: ConnectionState) => {
      if (s === ConnectionState.Connected) { clearTimeout(t); room?.off('connectionStateChanged', h); resolve(); }
    };
    room?.on('connectionStateChanged', h);
  });

  const attachTrack = (track: LocalVideoTrack, ref: React.RefObject<HTMLVideoElement>) => {
    if (ref.current) { track.detach(); track.attach(ref.current); }
  };

  const ensureMic = async () => {
    if (audioTrackRef.current) return;
    const audioTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
    audioTrackRef.current = audioTrack;
    await localParticipant.publishTrack(audioTrack);
    setMicOn(true);
  };

  // Update active streams whenever sources change
  const updateActiveStreams = () => {
    const streams: MediaStream[] = [];
    if (cameraVideoRef.current?.srcObject) streams.push(cameraVideoRef.current.srcObject as MediaStream);
    if (screenVideoRef.current?.srcObject) streams.push(screenVideoRef.current.srcObject as MediaStream);
    setActiveStreams(streams);
  };

  // ── Camera toggle ────────────────────────────────────────────
  const toggleCamera = async () => {
    setError('');
    if (cameraOn) {
      if (cameraTrackRef.current) {
        try { await localParticipant.unpublishTrack(cameraTrackRef.current); } catch {}
        cameraTrackRef.current.stop(); cameraTrackRef.current = null;
      }
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
      setCameraOn(false);
      if (!screenOn) { setIsLive(false); await updateLiveStatus(false); }
      setStatus(screenOn ? '🔴 Live — Screen Share' : 'Ready');
      setTimeout(updateActiveStreams, 100);
    } else {
      try {
        await waitForConnection();
        setStatus('Starting camera...');
        const videoTrack = await createLocalVideoTrack({ resolution: { width: 1280, height: 720, frameRate: 30 }, facingMode: 'user' });
        cameraTrackRef.current = videoTrack;
        attachTrack(videoTrack, cameraVideoRef);
        await localParticipant.publishTrack(videoTrack);
        await ensureMic();
        setCameraOn(true);
        if (!isLive) { setIsLive(true); await updateLiveStatus(true); }
        setStatus(screenOn ? '🔴 Live — Camera + Screen' : '🔴 Live — Camera');
        setTimeout(updateActiveStreams, 300);
      } catch (e: any) {
        setError(`Camera failed: ${e?.message || 'Permission denied'}`);
        setStatus('Ready');
      }
    }
  };

  // ── Screen toggle ────────────────────────────────────────────
  const toggleScreen = async () => {
    setError('');
    if (screenOn) {
      if (screenTrackRef.current) {
        try { await localParticipant.unpublishTrack(screenTrackRef.current); } catch {}
        screenTrackRef.current.stop(); screenTrackRef.current = null;
      }
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setScreenOn(false);
      if (!cameraOn) { setIsLive(false); await updateLiveStatus(false); }
      setStatus(cameraOn ? '🔴 Live — Camera' : 'Ready');
      setTimeout(updateActiveStreams, 100);
    } else {
      try {
        await waitForConnection();
        setStatus('Opening screen picker...');
        const tracks = await createLocalScreenTracks({ audio: false });
        const videoTrack = tracks.find(t => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
        if (!videoTrack) throw new Error('No screen video track returned');
        screenTrackRef.current = videoTrack;
        attachTrack(videoTrack, screenVideoRef);
        await localParticipant.publishTrack(videoTrack);
        await ensureMic();
        setScreenOn(true);
        if (!isLive) { setIsLive(true); await updateLiveStatus(true); }
        setStatus(cameraOn ? '🔴 Live — Camera + Screen' : '🔴 Live — Screen Share');
        setTimeout(updateActiveStreams, 300);
        videoTrack.mediaStreamTrack.addEventListener('ended', () => {
          setScreenOn(false); screenTrackRef.current = null;
          if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
          if (!cameraOn) { setIsLive(false); updateLiveStatus(false); }
          setStatus(cameraOn ? '🔴 Live — Camera' : 'Ready');
          setTimeout(updateActiveStreams, 100);
        });
      } catch (e: any) {
        setError(`Screen share failed: ${e?.message}`);
        setStatus('Ready');
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
    setIsLive(false); setIsRecording(false); setRtmpActive(false);
    setError(''); setPipSwapped(false); setActiveStreams([]);
    setStatus('Ready — enable Camera and/or Screen');
    await updateLiveStatus(false);
  };

  const updateLiveStatus = async (live: boolean) => {
    try {
      await fetch(`${API}/api/streams/${stream.roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken: stream.hostToken, isLive: live }),
      });
    } catch {}
  };

  const isConnected  = roomState === ConnectionState.Connected;
  const isConnecting = roomState === ConnectionState.Connecting || roomState === ConnectionState.Reconnecting;
  const mainIsCam    = pipSwapped;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-zinc-950">
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Radio className="w-5 h-5 text-brand-500" />
            <span className="font-bold text-sm">Host Studio</span>
            {isLive && (
              <span className="flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/30 px-2.5 py-1 rounded-full text-xs font-bold text-brand-400">
                <span className="live-dot" />{bothOn ? 'LIVE · Cam + Screen' : 'LIVE'}
              </span>
            )}
            {isRecording && (
              <span className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-full text-xs font-bold text-red-400">
                <span className="live-dot" /> REC
              </span>
            )}
            {rtmpActive && (
              <span className="text-xs px-2 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 font-bold">📡 Social</span>
            )}
          </div>
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border flex-shrink-0
            ${isConnected ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : isConnecting ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {isConnected ? <><Wifi className="w-3 h-3" /> Connected</>
              : isConnecting ? <><div className="w-2.5 h-2.5 border border-yellow-400 border-t-transparent rounded-full animate-spin" /> Connecting...</>
              : <><WifiOff className="w-3 h-3" /> Disconnected</>}
          </span>
        </div>

        {/* Preview */}
        <div className="bg-black relative flex items-center justify-center overflow-hidden" style={{ minHeight: '260px', height: '35vh' }}>
          <video ref={cameraVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
          <video ref={screenVideoRef} autoPlay muted playsInline style={{ display: 'none' }} />
          <MainPreview cameraVideoRef={cameraVideoRef} screenVideoRef={screenVideoRef} cameraOn={cameraOn} screenOn={screenOn} mainIsCam={mainIsCam} />
          {bothOn && (
            <div className="absolute bottom-14 right-3 w-36 h-24 rounded-xl overflow-hidden border-2 border-zinc-700 shadow-2xl cursor-pointer hover:border-brand-500 transition-all group/pip z-10"
              onClick={() => setPipSwapped(s => !s)} title="Click to swap">
              <PipPreview cameraVideoRef={cameraVideoRef} screenVideoRef={screenVideoRef} mainIsCam={mainIsCam} />
              <div className="absolute inset-0 bg-black/0 group-hover/pip:bg-black/40 transition-colors flex items-center justify-center">
                <PictureInPicture2 className="w-5 h-5 text-white opacity-0 group-hover/pip:opacity-100 transition-opacity" />
              </div>
              <p className="absolute bottom-1 left-1.5 text-[10px] text-white/60 pointer-events-none">
                {mainIsCam ? 'Screen' : 'Camera'} · swap
              </p>
            </div>
          )}
          {!cameraOn && !screenOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Video className="w-7 h-7 text-zinc-700" />
              </div>
              {isConnecting && <p className="text-sm text-yellow-400">Connecting to LiveKit...</p>}
              {isConnected && <p className="text-sm text-zinc-500">Enable Camera and/or Screen to begin</p>}
              {!isConnected && !isConnecting && (
                <div className="text-center space-y-2">
                  <p className="text-sm text-red-400">Cannot reach LiveKit</p>
                  <button onClick={() => window.location.reload()} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 mx-auto">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-10">
            <span className="text-xs bg-black/70 px-3 py-1.5 rounded-full text-zinc-400">{status}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-3 flex-shrink-0">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-400">⚠️ {error}</div>}

          {isConnected && !isLive && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-500">
              🦁 Brave: Shields <strong className="text-zinc-300">OFF</strong> · allow camera/mic
            </div>
          )}

          {bothOn && (
            <div className="flex items-center justify-between bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-2.5">
              <span className="text-xs text-brand-400 font-semibold flex items-center gap-2">
                <PictureInPicture2 className="w-3.5 h-3.5" /> Camera + Screen — PiP active
              </span>
              <button onClick={() => setPipSwapped(s => !s)} className="text-xs text-brand-400 hover:text-brand-200 underline underline-offset-2">Swap</button>
            </div>
          )}

          {/* Camera + Screen */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={toggleCamera} disabled={!isConnected}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                ${cameraOn ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}>
              <Camera className="w-4 h-4" />{cameraOn ? '✓ Camera On' : 'Camera Off'}
            </button>
            <button onClick={toggleScreen} disabled={!isConnected}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                ${screenOn ? 'bg-brand-500/15 border-brand-500/50 text-brand-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}>
              <Monitor className="w-4 h-4" />{screenOn ? '✓ Screen On' : 'Screen Off'}
            </button>
          </div>

          {/* Mic + Social + End */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={toggleMic} disabled={!audioTrackRef.current}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-30
                ${micOn ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}>
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {micOn ? 'Mic On' : 'Mic Off'}
            </button>
            <button onClick={() => setShowRtmp(true)} disabled={!isLive}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-30
                ${rtmpActive ? 'bg-pink-500/10 border-pink-500/40 text-pink-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}>
              <Share2 className="w-4 h-4" />Social
            </button>
            <button onClick={stopAll} disabled={!isLive}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 text-xs font-semibold transition-all disabled:opacity-30">
              <Square className="w-4 h-4" />End
            </button>
          </div>

          {/* Recording toggle */}
          <button
            onClick={() => setShowRecordings(s => !s)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all
              ${showRecordings ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}>
            <Film className="w-4 h-4" />
            {showRecordings ? 'Hide Recording Panel' : '🔴 Recording & Downloads'}
          </button>

          {/* Recording panel */}
          {showRecordings && (
            <RecordingPanel
              roomId={stream.roomId}
              hostToken={stream.hostToken}
              streams={activeStreams}
              onRecordingChange={setIsRecording}
            />
          )}

          {/* Viewer link */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-xs text-zinc-500 mb-2 font-semibold uppercase tracking-wider">Viewer Link</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-zinc-300 truncate font-mono">{viewerLink}</p>
              <button onClick={onCopy} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors flex-shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              </button>
              <a href={viewerLink} target="_blank" rel="noopener noreferrer">
                <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="w-full lg:w-72 h-64 lg:h-screen border-t lg:border-t-0 lg:border-l border-zinc-800/60">
        <ChatPanel roomId={stream.roomId} identity={`host-${stream.roomId}`} nickname="Host" isHost />
      </div>

      {showRtmp && (
        <RtmpModal roomId={stream.roomId} hostToken={stream.hostToken}
          onClose={() => setShowRtmp(false)}
          onActivate={() => { setRtmpActive(true); setShowRtmp(false); }}
          onDeactivate={() => setRtmpActive(false)} />
      )}
    </div>
  );
}

function MainPreview({ cameraVideoRef, screenVideoRef, cameraOn, screenOn, mainIsCam }:
  { cameraVideoRef: React.RefObject<HTMLVideoElement>; screenVideoRef: React.RefObject<HTMLVideoElement>; cameraOn: boolean; screenOn: boolean; mainIsCam: boolean }) {
  const mainRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const src = mainIsCam ? cameraVideoRef.current : screenVideoRef.current;
    const fallback = mainIsCam ? screenVideoRef.current : cameraVideoRef.current;
    const dst = mainRef.current;
    if (!dst) return;
    const srcStream = src?.srcObject as MediaStream | null;
    const fallbackStream = fallback?.srcObject as MediaStream | null;
    dst.srcObject = srcStream || fallbackStream || null;
  });
  if (!cameraOn && !screenOn) return null;
  return <video ref={mainRef} autoPlay muted playsInline className="w-full h-full object-contain" />;
}

function PipPreview({ cameraVideoRef, screenVideoRef, mainIsCam }:
  { cameraVideoRef: React.RefObject<HTMLVideoElement>; screenVideoRef: React.RefObject<HTMLVideoElement>; mainIsCam: boolean }) {
  const pipRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const src = mainIsCam ? screenVideoRef.current : cameraVideoRef.current;
    const dst = pipRef.current;
    if (!src || !dst) return;
    dst.srcObject = src.srcObject as MediaStream | null;
  });
  return <video ref={pipRef} autoPlay muted playsInline className="w-full h-full object-cover" />;
}

export default function HostControls(props: HostControlsProps) {
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
  return (
    <LiveKitRoom serverUrl={livekitUrl} token={props.stream.livekitToken} connect={true} audio={false} video={false} className="h-full w-full">
      <HostStudio {...props} />
    </LiveKitRoom>
  );
}
