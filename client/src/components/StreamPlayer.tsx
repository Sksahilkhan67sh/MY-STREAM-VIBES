'use client';
import { useRef, useState } from 'react';
import {
  LiveKitRoom, useTracks, VideoTrack, RoomAudioRenderer,
  isTrackReference, type TrackReference,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { Maximize2, Minimize2, Volume2, VolumeX, Radio } from 'lucide-react';

interface StreamPlayerProps {
  roomId: string;
  token: string;
  title: string;
  isHost: boolean;
}

// ── Single participant stream section (main + optional PiP) ───
function StreamSection({
  label, icon, tracks, mainKey, setMainKey, controls,
}: {
  label: string; icon: string;
  tracks: TrackReference[];
  mainKey: string | null;
  setMainKey: (k: string) => void;
  controls?: React.ReactNode;
}) {
  const dedupe = (arr: typeof tracks) => {
    const seen = new Map<string, typeof tracks[0]>();
    arr.filter(isTrackReference).forEach(t => seen.set(`${t.participant.identity}:${t.source}`, t));
    return Array.from(seen.values());
  };
  const deduped = dedupe(tracks);
  if (deduped.length === 0) return null;

  const keyExists = mainKey ? deduped.some(t => `${t.participant.identity}:${t.source}` === mainKey) : false;
  const defaultTrack = deduped.find(t => t.source === Track.Source.ScreenShare) ?? deduped[0];
  const activeKey = (mainKey && keyExists) ? mainKey : `${defaultTrack.participant.identity}:${defaultTrack.source}`;
  const mainTrack = deduped.find(t => `${t.participant.identity}:${t.source}` === activeKey) ?? deduped[0];
  const pipTrack  = deduped.find(t => `${t.participant.identity}:${t.source}` !== `${mainTrack.participant.identity}:${mainTrack.source}`);

  const displayName = (t: TrackReference) =>
    t.participant.identity
      .replace('host-', 'Host ')
      .replace('cohost-', '')
      .replace(/-[a-z0-9]{4,}$/, '');

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <span className="flex items-center gap-2 text-xs font-bold text-zinc-300 uppercase tracking-wider">
          <span>{icon}</span> {label}
        </span>
        {controls}
      </div>
      <div className="flex-1 min-h-0 bg-black relative overflow-hidden">
        <VideoTrack trackRef={mainTrack} className="w-full h-full object-contain" />
        <div className="absolute bottom-2 left-2 z-10">
          <span className="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full font-semibold">
            {mainTrack.source === Track.Source.ScreenShare ? '🖥' : '📷'} {displayName(mainTrack)}
          </span>
        </div>
        {pipTrack && (
          <div
            className="absolute bottom-2 right-2 z-10 w-28 h-16 sm:w-36 sm:h-20 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl cursor-pointer hover:border-white/50 transition-all group/pip"
            onClick={() => setMainKey(`${pipTrack.participant.identity}:${pipTrack.source}`)}
            title="Click to swap"
          >
            <VideoTrack trackRef={pipTrack} className="w-full h-full object-contain bg-black" />
            <div className="absolute inset-0 bg-black/0 group-hover/pip:bg-black/30 transition-colors flex items-center justify-center">
              <span className="text-white text-[10px] opacity-0 group-hover/pip:opacity-100 font-medium">Swap</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Video Stage: adaptive layout for 1–4+ participants ────────
function VideoStage({ title }: { title: string }) {
  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );
  const [muted, setMuted]           = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hostMainKey, setHostMainKey]     = useState<string | null>(null);
  const [coHost1MainKey, setCoHost1MainKey] = useState<string | null>(null);
  const [coHost2MainKey, setCoHost2MainKey] = useState<string | null>(null);
  const [coHost3MainKey, setCoHost3MainKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allTracks = tracks.filter(isTrackReference);

  // Group tracks by participant identity prefix
  const hostTracks   = allTracks.filter(t => t.participant.identity.startsWith('host-'));
  const coHostTracks = allTracks.filter(t => t.participant.identity.startsWith('cohost-'));

  // Get unique co-host identities (participants, not tracks)
  const coHostIdentities = Array.from(new Set(coHostTracks.map(t => t.participant.identity)));
  const coHostCount = coHostIdentities.length;

  const hasHost    = hostTracks.length > 0;
  const hasCoHost  = coHostTracks.length > 0;
  const totalStreams = (hasHost ? 1 : 0) + coHostCount;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen(); setFullscreen(true);
    } else {
      document.exitFullscreen(); setFullscreen(false);
    }
  };

  // Per-cohost track groups
  const getCoHostTracks = (identity: string) => coHostTracks.filter(t => t.participant.identity === identity);
  const coHostMainKeys  = [coHost1MainKey, coHost2MainKey, coHost3MainKey];
  const setCoHostMainKey = (i: number, k: string) => {
    [setCoHost1MainKey, setCoHost2MainKey, setCoHost3MainKey][i]?.(k);
  };

  const ControlButtons = () => (
    <div className="absolute bottom-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
      <button onClick={() => setMuted(!muted)}
        className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors">
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <button onClick={toggleFullscreen}
        className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors">
        {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className="relative w-full h-full bg-zinc-950 flex flex-col overflow-hidden group">

      {/* Waiting state */}
      {!hasHost && !hasCoHost && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Radio className="w-8 h-8 text-zinc-700" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-zinc-500">{title}</p>
            <p className="text-sm text-zinc-700 mt-1">Waiting for host to go live…</p>
          </div>
        </div>
      )}

      {/* ── 1 stream (host only, no cohost) ── */}
      {totalStreams === 1 && hasHost && (
        <StreamSection
          label="Host Stream" icon="👤"
          tracks={hostTracks}
          mainKey={hostMainKey} setMainKey={setHostMainKey}
        />
      )}

      {/* ── 2 streams (host + 1 cohost, or just 2 cohosts) ── */}
      {totalStreams === 2 && (
        <>
          {hasHost && (
            <StreamSection
              label="Host Stream" icon="👤"
              tracks={hostTracks}
              mainKey={hostMainKey} setMainKey={setHostMainKey}
            />
          )}
          {coHostIdentities.slice(0, hasHost ? 1 : 2).map((id, i) => (
            <StreamSection
              key={id}
              label={`Co-Host Stream${coHostCount > 1 ? ` ${i + 1}` : ''}`}
              icon="👥"
              tracks={getCoHostTracks(id)}
              mainKey={coHostMainKeys[i]}
              setMainKey={(k) => setCoHostMainKey(i, k)}
            />
          ))}
        </>
      )}

      {/* ── 3 streams: host top full-width, 2 cohosts below side by side ── */}
      {totalStreams === 3 && (
        <div className="flex-1 flex flex-col min-h-0">
          {hasHost && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <StreamSection
                label="Host Stream" icon="👤"
                tracks={hostTracks}
                mainKey={hostMainKey} setMainKey={setHostMainKey}
              />
            </div>
          )}
          <div className="flex-1 min-h-0 flex flex-row border-t border-zinc-800">
            {coHostIdentities.slice(0, hasHost ? 2 : 3).map((id, i) => (
              <div key={id} className={`flex-1 min-w-0 overflow-hidden flex flex-col ${i > 0 ? 'border-l border-zinc-800' : ''}`}>
                <StreamSection
                  label={`Co-Host ${i + 1}`} icon="👥"
                  tracks={getCoHostTracks(id)}
                  mainKey={coHostMainKeys[i]}
                  setMainKey={(k) => setCoHostMainKey(i, k)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4 streams: 2×2 grid ── */}
      {totalStreams >= 4 && (
        <div className="flex-1 grid grid-cols-2 grid-rows-2 min-h-0 gap-px bg-zinc-800">
          {hasHost && (
            <div className="bg-zinc-950 overflow-hidden flex flex-col min-h-0">
              <StreamSection
                label="Host" icon="👤"
                tracks={hostTracks}
                mainKey={hostMainKey} setMainKey={setHostMainKey}
              />
            </div>
          )}
          {coHostIdentities.slice(0, hasHost ? 3 : 4).map((id, i) => (
            <div key={id} className="bg-zinc-950 overflow-hidden flex flex-col min-h-0">
              <StreamSection
                label={`Co-Host ${i + 1}`} icon="👥"
                tracks={getCoHostTracks(id)}
                mainKey={coHostMainKeys[i]}
                setMainKey={(k) => setCoHostMainKey(i, k)}
              />
            </div>
          ))}
        </div>
      )}

      <ControlButtons />
      <RoomAudioRenderer muted={muted} />
    </div>
  );
}

export default function StreamPlayer({ roomId, token, title, isHost }: StreamPlayerProps) {
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <LiveKitRoom
        serverUrl={livekitUrl} token={token} connect={true}
        audio={isHost} video={false}
        style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <VideoStage title={title} />
      </LiveKitRoom>
    </div>
  );
}
