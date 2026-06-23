'use client';
import { ThemeToggle } from './ThemeContext';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '🎉'];

interface Message {
  id: string; nickname: string; message: string; timestamp: string; avatarUrl?: string | null;
}
interface FloatingReaction {
  id: number; emoji: string; x: number;
}

interface ChatPanelProps {
  roomId: string; identity: string; nickname: string; avatarUrl?: string | null;
  isHost?: boolean; socket?: Socket | null;
}

export default function ChatPanel({ roomId, identity, nickname, avatarUrl, isHost, socket: externalSocket }: ChatPanelProps) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef     = useRef<Socket | null>(null);
  const ownSocketRef  = useRef<Socket | null>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let sock: Socket;
    if (externalSocket) {
      sock = externalSocket;
      socketRef.current = sock;
      setConnected(sock.connected);
    } else {
      sock = io(API, { transports: ['websocket', 'polling'], reconnectionAttempts: 10 });
      ownSocketRef.current = sock;
      socketRef.current = sock;
      const rejoin = () => {
        setConnected(true);
        sock.emit('join-room', { roomId, nickname });
      };
      sock.on('connect', rejoin);
      // Rejoin room after every reconnect so host keeps receiving chat messages
      sock.on('reconnect', rejoin);
      sock.on('disconnect', () => setConnected(false));
    }

    const onCount = (c: number) => setViewerCount(c);
    const onMsg   = (m: Message) => setMessages(prev => [...prev.slice(-199), m]);
    // Replayed once right after this socket joins the room — fills in
    // messages that were sent before this ChatPanel instance existed (e.g.
    // the host/co-host had the chat tab closed, or this is a fresh
    // reconnect). Server sends this only to the joining socket, not
    // broadcast, so it can't duplicate anything other connected clients
    // already have.
    const onHistory = (history: Message[]) => {
      if (!Array.isArray(history) || history.length === 0) return;
      setMessages(prev => {
        // Avoid duplicating messages this instance may have already
        // received live (e.g. a fast reconnect racing the history replay).
        const seen = new Set(prev.map(m => m.id));
        const merged = [...history.filter(m => !seen.has(m.id)), ...prev];
        return merged.slice(-199);
      });
    };
    const onRxn   = ({ emoji, id }: { emoji: string; id: number }) => {
      const x = 10 + Math.random() * 80;
      setReactions(prev => [...prev, { id, emoji, x }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 1400);
    };
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('viewer-count', onCount);
    sock.on('chat-message', onMsg);
    sock.on('chat-history', onHistory);
    sock.on('reaction', onRxn);

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('viewer-count', onCount);
      sock.off('chat-message', onMsg);
      sock.off('chat-history', onHistory);
      sock.off('reaction', onRxn);
      if (ownSocketRef.current) {
        ownSocketRef.current.disconnect();
        ownSocketRef.current = null;
      }
    };
  }, [roomId, nickname, externalSocket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [moderationWarning, setModerationWarning] = useState('');

  const sendMessage = async () => {
    if (!input.trim() || !socketRef.current) return;
    const text = input.trim();

    // AI content moderation — checked before broadcast, fails open so chat never breaks
    try {
      const res = await fetch(`${API}/api/ai-features/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId: roomId, message: text, nickname }),
      });
      const data = await res.json();
      if (data.action === 'blocked') {
        setModerationWarning('Message blocked: contains inappropriate content');
        setTimeout(() => setModerationWarning(''), 3000);
        return;
      }
    } catch {
      // moderation service unreachable — allow message through rather than block chat
    }

    socketRef.current.emit('chat-message', { roomId, message: text, nickname, avatarUrl });
    setInput('');
  };

  const sendReaction = (emoji: string) => {
    socketRef.current?.emit('reaction', { roomId, emoji });
  };

  return (
    <div
      className="h-full flex flex-col bg-white dark:bg-gray-950 relative"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
    >
      {/* Floating reactions */}
      {reactions.map(r => (
        <div
          key={r.id}
          className="pointer-events-none absolute text-xl z-10"
          style={{
            left: `${r.x}%`, bottom: '80px',
            animation: 'floatUp 1.4s ease-out forwards',
          }}
        >
          {r.emoji}
        </div>
      ))}

      <style>{`
        @keyframes floatUp {
          from { transform: translateY(0); opacity: 1; }
          to   { transform: translateY(-80px); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chat</span>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span>{viewerCount} watching</span>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-300'}`} />
          <ThemeToggle />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 sm:py-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-gray-300 dark:text-gray-600 text-center py-6">No messages yet</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="flex items-start gap-2 text-sm">
            {msg.avatarUrl ? (
              <img src={msg.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400">{msg.nickname?.[0]?.toUpperCase() || '?'}</span>
              </div>
            )}
            <div>
              <span className={`font-semibold mr-1 ${msg.nickname === 'Host' ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                {msg.nickname}
              </span>
              <span className="text-gray-500 dark:text-gray-400">{msg.message}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reactions */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 border-t border-gray-50 dark:border-gray-800 flex-shrink-0">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="text-lg sm:text-base hover:scale-125 transition-transform min-w-[32px] min-h-[32px] flex items-center justify-center"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Moderation warning */}
      {moderationWarning && (
        <div className="px-3 sm:px-4 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs text-center flex-shrink-0">
          {moderationWarning}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Say something..."
          maxLength={500}
          className="flex-1 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2.5 sm:py-2 focus:outline-none focus:border-gray-300 transition-colors placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100"
          style={{ fontSize: '16px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center bg-gray-900 dark:bg-white rounded-xl text-white dark:text-gray-900 disabled:opacity-30 transition-opacity flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
