'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useNotificationSocket, type LiveNotification } from './NotificationSocketContext';

const TYPE_ICONS: Record<string, string> = {
  follow: '👤', donation: '💰', live: '🔴', message: '💬',
  membership: '⭐', mention: '@', rating: '⭐', friend_request: '🤝',
  default: '🔔',
};

interface ToastItem extends LiveNotification {
  toastId: number;
}

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 3;

/**
 * Mounted once at the root layout (see layout.tsx). Renders live toast
 * notifications — e.g. "Creator X is live now" the instant it's pushed via
 * NotificationSocketContext, without waiting for NotificationBell's next
 * poll. Purely additive UI; doesn't touch how notifications are stored,
 * read, or marked-read — that's still entirely NotificationBell/notifs.ts.
 */
export default function NotificationToastHost() {
  const { onNotification } = useNotificationSocket();
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((toastId: number) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
  }, []);

  useEffect(() => {
    const unsubscribe = onNotification((n) => {
      const toastId = Date.now() + Math.random();
      setToasts(prev => [...prev.slice(-(MAX_VISIBLE - 1)), { ...n, toastId }]);
      setTimeout(() => dismiss(toastId), AUTO_DISMISS_MS);
    });
    return unsubscribe;
  }, [onNotification, dismiss]);

  const handleClick = (toast: ToastItem) => {
    dismiss(toast.toastId);
    if (toast.actionUrl) router.push(toast.actionUrl);
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-80 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.toastId}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl overflow-hidden"
          >
            <button onClick={() => handleClick(toast)} className="w-full flex gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICONS[toast.type] ?? TYPE_ICONS.default}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{toast.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{toast.body}</p>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); dismiss(toast.toastId); }}
                className="flex-shrink-0 text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 -mt-0.5 -mr-1 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
