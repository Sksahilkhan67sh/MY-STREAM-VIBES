'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Send, Users } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const REACTIONS = ['❤️', '😂', '🔥', '👏', '😮', '🎉'];

interface Message {
  id: string;
  nickname: string;
  message: string;
  timestamp: string;
  isHost?: boolean;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

interface ChatPanelProps {
  roomId: string;
  identity: string;
  nickname: string;
  isHost?: boolean;
}

export default function ChatPanel({ roomId, identity, nickname, isHost }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = io(API, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', { roomId, nickname });
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('viewer-count', (count: number) => setViewerCount(count));

    socket.on('chat-message', (msg: Message) => {
      setMessages(prev => [...prev.slice(-199), msg]);
    });

    socket.on('reaction', ({ emoji, id }: { emoji: string; id: number }) => {
      const x = 10 + Math.random() * 80;
      setReactions(prev => [...prev, { id, emoji, x }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 1400);
    });

    return () => { socket.disconnect(); };
  }, [roomId, nickname]);

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
    <div className="h-full flex flex-col bg-zinc-950 relative">
      {/* Floating reactions */}
      {reactions.map(r => (
        <div
          key={r.id}
          className="reaction-float"
          style={{ left: `${r.x}%`, bottom: '80px' }}
        >
          {r.emoji}
        </div>
      ))}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 flex-shrink-0">
        <span className="text-sm font-bold">Live Chat</span>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Users className="w-3.5 h-3.5" />
          {viewerCount}
          <span className={`w-1.5 h-1.5 rounded-full ml-1 ${connected ? 'bg-green-500' : 'bg-zinc-600'}`} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
        {messages.length === 0 && (
          <p className="text-zinc-700 text-xs text-center py-6">No messages yet…</p>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="msg-in text-sm">
            <span className={`font-semibold mr-1.5 ${msg.nickname === 'Host' ? 'text-brand-400' : 'text-zinc-300'}`}>
              {msg.nickname === 'Host' && '👑 '}{msg.nickname}
            </span>
            <span className="text-zinc-400">{msg.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reactions */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-zinc-800/40 flex-shrink-0">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="text-lg hover:scale-125 transition-transform active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-zinc-800/60 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Say something..."
          maxLength={500}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-30 transition-colors flex-shrink-0"
        >
          <Send className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}
