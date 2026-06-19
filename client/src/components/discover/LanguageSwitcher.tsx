'use client';
import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useI18n, SUPPORTED_LOCALES } from '@/components/I18nContext';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = SUPPORTED_LOCALES.find(l => l.code === locale);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Change language">
        <Globe className="w-4 h-4 text-gray-600 dark:text-gray-300" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-40 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden py-1">
          {SUPPORTED_LOCALES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLocale(l.code); setOpen(false); }}
              className={['w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800',
                locale === l.code ? 'font-semibold text-red-500' : 'text-gray-700 dark:text-gray-200'].join(' ')}
            >
              <span>{l.flag}</span> {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
