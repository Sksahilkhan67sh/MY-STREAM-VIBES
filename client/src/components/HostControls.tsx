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
  Square, Circle, Mic, MicOff, Video, Wifi, WifiOff, RefreshCw, Share2,
} from 'lucide-react';
import ChatPanel from './ChatPanel';
import RtmpModal from './RtmpModal';

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

  const [roomState, setRoomState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [isLive, setIsLive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [source, setSource] = useState<'camera' | 'screen' | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState('');
  const [showRtmp, setShowRtmp] = useState(false);
  const [rtmpActive, setRtmpActive] = useState(false);

  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
  const viewerLink = `${appUrl}${stream.viewerUrl}`;

  useEffect(() => {
    if (!room) return;
    const update = (state: ConnectionState) => {
      setRoomState(state);
      if (state === ConnectionState.Connected) { setStatus('Ready — select a source to go live'); setError(''); }
      else if (state === ConnectionState.Connecting || state === ConnectionState.Reconnecting) setStatus('Connecting to LiveKit...');
      else if (state === ConnectionState.Disconnected) setStatus('Disconnected from LiveKit');
    };
    update(room.state);
    room.on('connectionStateChanged', update);
    return () => { room.off('connectionStateChanged', update); };
  }, [room]);

  const waitForConnection = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (room?.state === ConnectionState.Connected) { resolve(); return; }
      const timeout = setTimeout(() => reject(new Error('LiveKit connection timed out after 15s')), 15000);
      const handler = (state: ConnectionState) => {
        if (state === ConnectionState.Connected) { clearTimeout(timeout); room?.off('connectionStateChanged', handler); resolve(); }
      };
      room?.on('connectionStateChanged', handler);
    });
  };

  const stopAllTracks = async () => {
    try {
      if (videoTrackRef.current) {
        try { await localParticipant.unpublishTrack(videoTrackRef.current); } catch {}
        videoTrackRef.current.stop(); videoTrackRef.current = null;
      }
      if (audioTrackRef.current) {
        try { await localParticipant.unpublishTrack(audioTrackRef.current); } catch {}
        audioTrackRef.current.stop(); audioTrackRef.current = null;
      }
      if (previewRef.current) previewRef.current.srcObject = null;
    } catch (e) { console.error('Stop tracks error:', e); }
  };

  const startCamera = async () => {
    setError('');
    try {
      setStatus('Waiting for connection...');
      await waitForConnection();
      setStatus('Starting camera...');
      await stopAllTracks();
      const videoTrack = await createLocalVideoTrack({ resolution: { width: 1280, height: 720, frameRate: 30 }, facingMode: 'user' });
      videoTrackRef.current = videoTrack;
      if (previewRef.current) videoTrack.attach(previewRef.current);
      await localParticipant.publishTrack(videoTrack);
      const audioTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
      audioTrackRef.current = audioTrack;
      await localParticipant.publishTrack(audioTrack);
      setMicOn(true); setSource('camera'); setIsLive(true);
      setStatus('🔴 Live — Camera');
      await updateLiveStatus(true);
    } catch (e: any) {
      setError(`Camera failed: ${e?.message || 'Permission denied'}`);
      setStatus('Ready');
    }
  };

  const startScreen = async () => {
    setError('');
    try {
      setStatus('Waiting for connection...');
      await waitForConnection();
      setStatus('Opening screen picker...');
      await stopAllTracks();
      const tracks = await createLocalScreenTracks({ audio: true });
      const videoTrack = tracks.find(t => t.kind === Track.Kind.Video) as LocalVideoTrack;
      const screenAudio = tracks.find(t => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;
      if (!videoTrack) throw new Error('No screen video track returned');
      videoTrackRef.current = videoTrack;
      if (previewRef.current) videoTrack.attach(previewRef.current);
      setStatus('Publishing...');
      await localParticipant.publishTrack(videoTrack);
      if (screenAudio) {
        audioTrackRef.current = screenAudio;
        await localParticipant.publishTrack(screenAudio);
      } else {
        const micTrack = await createLocalAudioTrack({ echoCancellation: true });
        audioTrackRef.current = micTrack;
        await localParticipant.publishTrack(micTrack);
      }
      setMicOn(true); setSource('screen'); setIsLive(true);
      setStatus('🔴 Live — Screen Share');
      await updateLiveStatus(true);
      videoTrack.mediaStreamTrack.addEventListener('ended', () => stopAll());
    } catch (e: any) {
      setError(`Screen share failed: ${e?.message}`);
      setStatus('Ready');
    }
  };

  const toggleMic = async () => {
    if (!audioTrackRef.current) return;
    micOn ? audioTrackRef.current.mute() : audioTrackRef.current.unmute();
    setMicOn(!micOn);
  };

  const stopAll = async () => {
    await stopAllTracks();
    setSource(null); setMicOn(false); setIsLive(false);
    setIsRecording(false); setRtmpActive(false); setError('');
    setStatus('Ready — select a source to go live');
    await updateLiveStatus(false);
  };

  const updateLiveStatus = async (live: boolean) => {
    try {
      await fetch(`${API}/api/streams/${stream.roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken: stream.hostToken, isLive: live }),
      });
    } catch (e) { console.error(e); }
  };

  const toggleRecording = async () => {
    const endpoint = isRecording ? 'stop' : 'start';
    try {
      await fetch(`${API}/api/egress/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: stream.roomId, hostToken: stream.hostToken }),
      });
      setIsRecording(!isRecording);
    } catch (e) { console.error(e); }
  };

  const isConnected = roomState === ConnectionState.Connected;
  const isConnecting = roomState === ConnectionState.Connecting || roomState === ConnectionState.Reconnecting;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-zinc-950">
      <div className="flex-1 flex flex-col">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5 text-brand-500" />
            <span className="font-bold text-sm">Host Studio</span>
            {isLive && (
              <span className="flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/30 px-2.5 py-1 rounded-full text-xs font-bold text-brand-400">
                <span className="live-dot" /> LIVE
              </span>
            )}
            {rtmpActive && (
              <span className="flex items-center gap-1.5 bg-pink-500/10 border border-pink-500/30 px-2.5 py-1 rounded-full text-xs font-bold text-pink-400">
                📡 Social
              </span>
            )}
          </div>
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border
            ${isConnected ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : isConnecting ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {isConnected ? <><Wifi className="w-3 h-3" /> Connected</>
              : isConnecting ? <><div className="w-2.5 h-2.5 border border-yellow-400 border-t-transparent rounded-full animate-spin" /> Connecting...</>
              : <><WifiOff className="w-3 h-3" /> Disconnected</>}
          </span>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-black relative flex items-center justify-center min-h-[260px]">
          <video ref={previewRef} autoPlay muted playsInline
            className={`w-full h-full object-contain ${source ? 'block' : 'hidden'}`} />
          {!source && (
            <div className="text-center flex flex-col items-center gap-3 px-6">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <Video className="w-7 h-7 text-zinc-700" />
              </div>
              {isConnecting && <p className="text-sm text-yellow-400">Connecting to LiveKit...</p>}
              {isConnected && <p className="text-sm text-zinc-500">Select Camera or Screen to begin</p>}
              {!isConnected && !isConnecting && (
                <div className="space-y-2 text-center">
                  <p className="text-sm text-red-400">Cannot reach LiveKit</p>
                  <p className="text-xs text-zinc-600">Check your LiveKit URL in .env.local</p>
                  <button onClick={() => window.location.reload()}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 mx-auto">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="absolute bottom-3 left-3">
            <span className="text-xs bg-black/70 px-3 py-1.5 rounded-full text-zinc-400">{status}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-zinc-800/60 space-y-3">

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-400">⚠️ {error}</div>
          )}

          {isConnected && !isLive && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-500">
              🦁 Brave: Shields <strong className="text-zinc-300">OFF</strong> for localhost · allow camera/mic
            </div>
          )}

          {/* Source buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={startCamera} disabled={!isConnected}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                ${source === 'camera' ? 'bg-brand-500/10 border-brand-500/40 text-brand-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}>
              <Camera className="w-5 h-5" />Camera
            </button>
            <button onClick={startScreen} disabled={!isConnected}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                ${source === 'screen' ? 'bg-brand-500/10 border-brand-500/40 text-brand-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}>
              <Monitor className="w-5 h-5" />Screen
            </button>
            <button onClick={toggleMic} disabled={!source}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all disabled:opacity-30
                ${micOn ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}>
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              {micOn ? 'Mic On' : 'Mic Off'}
            </button>
          </div>

          {/* Record + Social + End */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={toggleRecording} disabled={!isLive}
              className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-30
                ${isRecording ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}>
              <Circle className={`w-4 h-4 ${isRecording ? 'fill-red-400 text-red-400' : ''}`} />
              {isRecording ? 'Stop Rec' : 'Record'}
            </button>

            {/* Social / RTMP button */}
            <button
              onClick={() => setShowRtmp(true)}
              disabled={!isLive}
              className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-30
                ${rtmpActive
                  ? 'bg-pink-500/10 border-pink-500/40 text-pink-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}
            >
              <Share2 className="w-4 h-4" />
              {rtmpActive ? 'Social Live' : 'Go Social'}
            </button>

            <button onClick={stopAll} disabled={!source}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 text-xs font-semibold transition-all disabled:opacity-30">
              <Square className="w-4 h-4" />
              End Stream
            </button>
          </div>

          {/* Share link */}
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

      {/* Chat sidebar */}
      <div className="w-full lg:w-72 h-64 lg:h-screen border-t lg:border-t-0 lg:border-l border-zinc-800/60">
        <ChatPanel roomId={stream.roomId} identity={`host-${stream.roomId}`} nickname="Host" isHost />
      </div>

      {/* RTMP Modal */}
      {showRtmp && (
        <RtmpModal
          roomId={stream.roomId}
          hostToken={stream.hostToken}
          onClose={() => setShowRtmp(false)}
          onActivate={() => { setRtmpActive(true); setShowRtmp(false); }}
          onDeactivate={() => setRtmpActive(false)}
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
