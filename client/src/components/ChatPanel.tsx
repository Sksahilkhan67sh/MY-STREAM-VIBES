'use client';
import { ThemeToggle } from './ThemeContext';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '🎉'];

interface Message {
  id: string; nickname: string; message: string; timestamp: string;
}
interface FloatingReaction {
  id: number; emoji: string; x: number;
}

interface ChatPanelProps {
  roomId: string; identity: string; nickname: string;
  isHost?: boolean; socket?: Socket | null;
}

export default function ChatPanel({ roomId, identity, nickname, isHost, socket: externalSocket }: ChatPanelProps) {
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
      sock = io(API, { transports: ['websocket', 'polling'] });
      ownSocketRef.current = sock;
      socketRef.current = sock;
      sock.on('connect', () => {
        setConnected(true);
        sock.emit('join-room', { roomId, nickname });
      });
      sock.on('disconnect', () => setConnected(false));
    }

    const onCount = (c: number) => setViewerCount(c);
    const onMsg   = (m: Message) => setMessages(prev => [...prev.slice(-199), m]);
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
    sock.on('reaction', onRxn);

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('viewer-count', onCount);
      sock.off('chat-message', onMsg);
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

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', { roomId, message: input.trim(), nickname });
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chat</span>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <span>{viewerCount} watching</span>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-300'}`} />
          <ThemeToggle />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-gray-300 dark:text-gray-600 text-center py-8">No messages yet</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="text-sm">
            <span className={`font-semibold mr-1 ${msg.nickname === 'Host' ? 'text-red-500' : 'text-gray-700 dark:text-gray-300 dark:text-gray-600'}`}>
              {msg.nickname}
            </span>
            <span className="text-gray-500 dark:text-gray-400">{msg.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reactions */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-50 flex-shrink-0">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="text-base hover:scale-125 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Say something..."
          maxLength={500}
          className="flex-1 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-300 transition-colors placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="w-8 h-8 flex items-center justify-center bg-gray-900 rounded-lg text-white disabled:opacity-30 transition-opacity flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
