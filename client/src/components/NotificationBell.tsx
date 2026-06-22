'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { apiGet, apiPatch, API } from '@/lib/api';
import { useNotificationSocket } from './NotificationSocketContext';

interface Notif {
  id: string; type: string; title: string; body: string;
  imageUrl?: string; actionUrl?: string; isRead: boolean; createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  follow: '👤', donation: '💰', live: '🔴', message: '💬',
  membership: '⭐', mention: '@', rating: '⭐', friend_request: '🤝',
  default: '🔔',
};

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { onNotification } = useNotificationSocket();

  const load = async () => {
    try {
      const data = await apiGet<{ notifications: Notif[]; unreadCount: number }>(`/api/notifs/${userId}?limit=20`);
      setNotifs(data.notifications);
      setUnread(data.unreadCount);
    } catch {}
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // poll every 30s — backstop if the socket below ever misses one
    return () => clearInterval(interval);
  }, [userId]);

  // Real-time: bump the bell instantly instead of waiting for the next poll.
  useEffect(() => {
    const unsubscribe = onNotification((n) => {
      setUnread(u => u + 1);
      setNotifs(prev => [
        { id: n.id, type: n.type, title: n.title, body: n.body, actionUrl: n.actionUrl ?? undefined, isRead: n.isRead, createdAt: n.createdAt },
        ...prev,
      ].slice(0, 20));
    });
    return unsubscribe;
  }, [onNotification]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    await apiPatch(`/api/notifs/${userId}/read-all`, {});
    setUnread(0);
    setNotifs(n => n.map(x => ({ ...x, isRead: true })));
  };

  const handleClick = async (notif: Notif) => {
    if (!notif.isRead) {
      await apiPatch(`/api/notifs/${notif.id}/read`, {});
      setUnread(u => Math.max(0, u - 1));
      setNotifs(n => n.map(x => x.id === notif.id ? { ...x, isRead: true } : x));
    }
    if (notif.actionUrl) { setOpen(false); router.push(notif.actionUrl); }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Notifications</h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-red-500 font-medium hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">No notifications yet</div>
            ) : notifs.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={[
                  'w-full flex gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0',
                  !n.isRead ? 'bg-red-50/50 dark:bg-red-900/10' : '',
                ].join(' ')}
              >
                <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? TYPE_ICONS.default}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.body}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
