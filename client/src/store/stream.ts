import { create } from 'zustand';

interface StreamState {
  roomId: string | null;
  hostToken: string | null;
  livekitToken: string | null;
  isLive: boolean;
  isRecording: boolean;
  viewerCount: number;
  setStream: (roomId: string, hostToken: string, livekitToken: string) => void;
  setLive: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  setViewerCount: (n: number) => void;
  reset: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  roomId: null,
  hostToken: null,
  livekitToken: null,
  isLive: false,
  isRecording: false,
  viewerCount: 0,
  setStream: (roomId, hostToken, livekitToken) => set({ roomId, hostToken, livekitToken }),
  setLive: (isLive) => set({ isLive }),
  setRecording: (isRecording) => set({ isRecording }),
  setViewerCount: (viewerCount) => set({ viewerCount }),
  reset: () => set({ roomId: null, hostToken: null, livekitToken: null, isLive: false, isRecording: false, viewerCount: 0 }),
}));
