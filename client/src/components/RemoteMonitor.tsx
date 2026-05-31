'use client';
/**
 * RemoteMonitor — shows all remote participants' tracks as clickable tiles.
 * Click any tile to swap it into the main preview area.
 * Used by both HostControls (to see co-hosts) and CoHostStudio (to see host).
 */
import { useState } from 'react';
import { useTracks, VideoTrack, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';

interface RemoteMonitorProps {
  filterPrefix?: string;
  label?: string;
}

export default function RemoteMonitor({ filterPrefix, label = 'Participants' }: RemoteMonitorProps) {
  const [mainKey, setMainKey] = useState<string | null>(null);
  const { localParticipant } = useLocalParticipant();

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
    <div className="flex-shrink-0 bg-gray-950 border-t border-gray-800">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-[10px] text-gray-600">Click to swap POV</p>
      </div>

      {/* Main preview — padding-bottom trick gives stable 16:9 in all contexts */}
      <div className="mx-2 mb-2 rounded-xl overflow-hidden bg-black relative" style={{ paddingBottom: '56.25%', height: 0 }}>
        <div className="absolute inset-0">
          <VideoTrack trackRef={mainTrack} className="w-full h-full object-contain" />
        </div>
        <div className="absolute bottom-1.5 left-2">
          <span className="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full font-semibold">
            {mainTrack.source === Track.Source.ScreenShare ? '🖥' : '📷'} {displayName(mainTrack)}
          </span>
        </div>
      </div>

      {/* Thumbnail strip */}
      {thumbTracks.length > 0 && (
        <div className="flex gap-1.5 px-2 pb-2 overflow-x-auto">
          {thumbTracks.map(t => {
            const key = `${t.participant.identity}:${t.source}`;
            return (
              <div
                key={key}
                onClick={() => setMainKey(key)}
                className="flex-shrink-0 w-28 rounded-lg overflow-hidden border-2 border-gray-700 hover:border-blue-400 cursor-pointer transition-all relative bg-black"
                style={{ paddingBottom: '57.14%', height: 0 }}
                title={`Click to view ${displayName(t)}`}
              >
                <div className="absolute inset-0">
                  <VideoTrack trackRef={t} className="w-full h-full object-contain" />
                </div>
                <div className="absolute bottom-0.5 left-1 z-10">
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
