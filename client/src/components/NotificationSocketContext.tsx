'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface LiveNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationSocketContextValue {
  socket: Socket | null;
  /** Register a callback to be invoked whenever a new notification arrives. Returns an unsubscribe function. */
  onNotification: (cb: (n: LiveNotification) => void) => () => void;
}

const NotificationSocketContext = createContext<NotificationSocketContextValue>({
  socket: null,
  onNotification: () => () => {},
});

/**
 * App-level real-time notification connection.
 *
 * Separate from the per-stream Socket.IO connections in HostControls/the
 * viewer page (which are scoped to a single roomId and torn down on
 * navigation) — this one is mounted once at the root layout and persists
 * across the whole app, since notifications ("creator you follow just went
 * live") need to reach the user no matter what page they're currently on.
 *
 * Joins `notify:<userId>` server-side (see socket.ts) the moment a session
 * exists, and leaves cleanly on sign-out/unmount. Any component can call
 * useNotificationSocket().onNotification(cb) to receive a live callback the
 * instant a new Notification is pushed — used by NotificationBell (to bump
 * the unread count without polling) and NotificationToast (to show a toast).
 */
export function NotificationSocketProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';
  const [socket, setSocket] = useState<Socket | null>(null);
  const listenersRef = useRef<Set<(n: LiveNotification) => void>>(new Set());

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;

    const s = io(API, { transports: ['websocket', 'polling'] });

    s.on('connect', () => {
      s.emit('subscribe-notifications', { userId });
    });

    s.on('notification:new', (n: LiveNotification) => {
      for (const cb of listenersRef.current) cb(n);
    });

    setSocket(s);

    return () => {
      s.emit('unsubscribe-notifications', { userId });
      s.disconnect();
      setSocket(null);
    };
  }, [status, userId]);

  const onNotification = useCallback((cb: (n: LiveNotification) => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  return (
    <NotificationSocketContext.Provider value={{ socket, onNotification }}>
      {children}
    </NotificationSocketContext.Provider>
  );
}

export function useNotificationSocket() {
  return useContext(NotificationSocketContext);
}
