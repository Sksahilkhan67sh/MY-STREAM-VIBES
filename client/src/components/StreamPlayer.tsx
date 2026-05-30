'use client';
import { useRef, useState } from 'react';
import {
  LiveKitRoom,
  useTracks,
  VideoTrack,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { Maximize2, Minimize2, Volume2, VolumeX, Radio, PictureInPicture2 } from 'lucide-react';

interface StreamPlayerProps {
  roomId: string;
  token: string;
  title: string;
  isHost: boolean;
}

function VideoStage({ title }: { title: string }) {
  // Subscribe to camera + screen tracks from ALL participants (host + co-hosts)
  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mainIdx, setMainIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Prefer screen share tracks first, then camera tracks
  const screenTracks = tracks.filter(t => t.source === Track.Source.ScreenShare);
  const cameraTracks = tracks.filter(t => t.source === Track.Source.Camera);

  // Build ordered list: screens first, then cameras
  const allTracks = [...screenTracks, ...cameraTracks];

  const safeIdx = Math.min(mainIdx, Math.max(0, allTracks.length - 1));
  const mainTrack = allTracks[safeIdx] ?? null;
  const pipTracks = allTracks.filter((_, i) => i !== safeIdx);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-zinc-950 flex items-center justify-center group min-h-[280px] overflow-hidden">

      {/* Main video */}
      {mainTrack ? (
        <VideoTrack trackRef={mainTrack} className="w-full h-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-4 text-zinc-600">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Radio className="w-8 h-8 text-zinc-700" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-zinc-500">{title}</p>
            <p className="text-sm text-zinc-700 mt-1">Waiting for host to go live…</p>
          </div>
        </div>
      )}

      {/* PiP strip — show up to 3 extra tracks (co-hosts / screen) */}
      {pipTracks.length > 0 && (
        <div className="absolute bottom-14 right-3 flex flex-col gap-2">
          {pipTracks.slice(0, 3).map((t, i) => {
            const realIdx = allTracks.indexOf(t);
            return (
              <div
                key={`${t.participant.identity}-${t.source}`}
                className="w-40 h-24 rounded-xl overflow-hidden border-2 border-zinc-700 shadow-2xl cursor-pointer hover:border-blue-400 transition-all group/pip"
                onClick={() => setMainIdx(realIdx)}
                title="Click to make main view"
              >
                <VideoTrack trackRef={t} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover/pip:bg-black/30 transition-colors flex items-center justify-center">
                  <PictureInPicture2 className="w-5 h-5 text-white opacity-0 group-hover/pip:opacity-100 transition-opacity" />
                </div>
                <div className="absolute bottom-1 left-1.5 text-[10px] text-white/60 font-medium truncate max-w-[120px]">
                  {t.source === Track.Source.ScreenShare ? '🖥 Screen' : `📷 ${t.participant.identity}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HUD */}
      <div className="absolute top-4 left-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {mainTrack && (
          <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold text-white">
            <span className="live-dot" /> LIVE
          </span>
        )}
        {allTracks.length > 1 && (
          <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-300">
            <PictureInPicture2 className="w-3 h-3" /> {allTracks.length} streams
          </span>
        )}
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setMuted(!muted)}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleFullscreen}
          className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <RoomAudioRenderer muted={muted} />
    </div>
  );
}

export default function StreamPlayer({ roomId, token, title, isHost }: StreamPlayerProps) {
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
  return (
    <LiveKitRoom serverUrl={livekitUrl} token={token} connect={true} audio={isHost} video={false} className="h-full w-full">
      <VideoStage title={title} />
    </LiveKitRoom>
  );
}
