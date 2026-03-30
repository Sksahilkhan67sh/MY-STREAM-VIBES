'use client';
import { useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
  useTracks,
  useRoomContext,
  RoomAudioRenderer,
  TrackToggle,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, RoomEvent } from 'livekit-client';
import { Maximize2, Minimize2, Volume2, VolumeX, Radio } from 'lucide-react';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';

interface StreamPlayerProps {
  roomId: string;
  token: string;
  title: string;
  isHost: boolean;
  onPublishStart?: () => void;
}

function VideoStage({ isHost, title }: { isHost: boolean; title: string }) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: true });
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const videoTracks = tracks.filter(t =>
    t.source === Track.Source.Camera || t.source === Track.Source.ScreenShare
  );

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
    <div ref={containerRef} className="relative w-full h-full bg-zinc-950 flex items-center justify-center group min-h-[280px]">
      {videoTracks.length > 0 ? (
        <VideoTrack trackRef={videoTracks[0]} className="w-full h-full object-contain" />
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

      {/* HUD overlay */}
      <div className="absolute top-4 left-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {videoTracks.length > 0 && (
          <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold text-white">
            <span className="live-dot" /> LIVE
          </span>
        )}
      </div>

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
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={token}
      connect={true}
      audio={isHost}
      video={false}
      className="h-full w-full"
    >
      <VideoStage isHost={isHost} title={title} />
    </LiveKitRoom>
  );
}
