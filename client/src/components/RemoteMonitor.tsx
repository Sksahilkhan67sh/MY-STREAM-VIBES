'use client';
/**
 * RemoteMonitor — shows all remote participants' tracks as clickable tiles.
 * Click any tile to swap it into the main preview area.
 * Used by both HostControls (to see co-hosts) and CoHostStudio (to see host).
 */
import { useState, useRef, useEffect } from 'react';
import { useTracks, VideoTrack, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';

interface RemoteMonitorProps {
  filterPrefix?: string;
  label?: string;
}

export default function RemoteMonitor({ filterPrefix, label = 'Participants' }: RemoteMonitorProps) {
  const [mainKey, setMainKey] = useState<string | null>(null);
  const { localParticipant } = useLocalParticipant();
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoHeight, setVideoHeight] = useState(180);

  // Measure actual rendered width and derive 16:9 height — works in all contexts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width > 0) setVideoHeight(Math.round(width * 9 / 16));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );

  // Exclude own tracks + filter by prefix
  const remoteTracks = tracks.filter(t => {
    if (t.participant.identity === localParticipant.identity) return false;
    if (filterPrefix) return t.participant.identity.startsWith(filterPrefix);
    return true;
  });

  // Deduplicate — one track per participant per source
  const seen = new Map<string, typeof tracks[0]>();
  remoteTracks.forEach(t => seen.set(`${t.participant.identity}:${t.source}`, t));
  const dedupedTracks = Array.from(seen.values());

  if (dedupedTracks.length === 0) return null;

  // Stable mainKey — if it no longer exists fall back to screen share, then first track
  const keyExists = mainKey
    ? dedupedTracks.some(t => `${t.participant.identity}:${t.source}` === mainKey)
    : false;
  const defaultTrack = dedupedTracks.find(t => t.source === Track.Source.ScreenShare) ?? dedupedTracks[0];
  const activeKey = (mainKey && keyExists)
    ? mainKey
    : `${defaultTrack.participant.identity}:${defaultTrack.source}`;

  const mainTrack = dedupedTracks.find(
    t => `${t.participant.identity}:${t.source}` === activeKey
  ) ?? dedupedTracks[0];

  const thumbTracks = dedupedTracks.filter(
    t => `${t.participant.identity}:${t.source}` !== `${mainTrack.participant.identity}:${mainTrack.source}`
  );

  const displayName = (t: typeof tracks[0]) =>
    t.participant.identity
      .replace('cohost-', '')
      .replace('host-', 'Host ')
      .replace(/-[a-z0-9]{6,}$/, '');

  return (
    <div ref={containerRef} className="flex-1 min-h-0 flex flex-col bg-zinc-950">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="flex items-center gap-2 text-xs font-bold text-zinc-300 uppercase tracking-wider">
          <span className="text-purple-400">👥</span> {label}
        </span>
        {thumbTracks.length > 0 && <p className="text-[10px] text-zinc-500">Click to swap POV</p>}
      </div>

      {/* Main preview — fills remaining height of its 50% flex slot */}
      <div className="flex-1 min-h-0 w-full bg-black relative overflow-hidden">
        <VideoTrack trackRef={mainTrack} className="w-full h-full object-contain" />
        <div className="absolute bottom-2 left-2 z-10">
          <span className="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full font-semibold">
            {mainTrack.source === Track.Source.ScreenShare ? '🖥' : '📷'} {displayName(mainTrack)}
          </span>
        </div>
      </div>

      {/* Thumbnail strip */}
      {thumbTracks.length > 0 && (
        <div className="flex-shrink-0 flex gap-1.5 px-2 py-2 overflow-x-auto border-t border-zinc-800">
          {thumbTracks.map(t => {
            const key = `${t.participant.identity}:${t.source}`;
            return (
              <div
                key={key}
                onClick={() => setMainKey(key)}
                className="flex-shrink-0 w-28 h-16 rounded-lg overflow-hidden border-2 border-gray-700 hover:border-blue-400 cursor-pointer transition-all relative bg-black"
                title={`Click to view ${displayName(t)}`}
              >
                <VideoTrack trackRef={t} className="w-full h-full object-contain" />
                <div className="absolute bottom-0.5 left-1">
                  <span className="text-[9px] bg-black/70 text-white px-1 py-0.5 rounded-full">
                    {t.source === Track.Source.ScreenShare ? '🖥' : '📷'} {displayName(t)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
