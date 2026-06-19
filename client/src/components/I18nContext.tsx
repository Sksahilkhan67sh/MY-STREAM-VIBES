'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Locale = 'en' | 'hi' | 'es' | 'fr';

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: {
    go_live: 'Go live', sign_in: 'Sign in', studio: 'Studio', watch_later: 'Watch Later',
    friends: 'Friends', search_placeholder: 'Search creators or streams',
    trending: 'Trending Streams', live_now: 'Live Now', recommended: 'Recommended For You',
    top_creators: 'Top Creators', follow: 'Follow', following: 'Following',
    notifications: 'Notifications', no_notifications: 'No notifications yet',
  },
  hi: {
    go_live: 'लाइव जाएं', sign_in: 'साइन इन करें', studio: 'स्टूडियो', watch_later: 'बाद में देखें',
    friends: 'मित्र', search_placeholder: 'क्रिएटर या स्ट्रीम खोजें',
    trending: 'ट्रेंडिंग स्ट्रीम', live_now: 'अभी लाइव', recommended: 'आपके लिए सुझाव',
    top_creators: 'टॉप क्रिएटर्स', follow: 'फॉलो करें', following: 'फॉलो किया जा रहा',
    notifications: 'सूचनाएं', no_notifications: 'अभी कोई सूचना नहीं',
  },
  es: {
    go_live: 'Transmitir en vivo', sign_in: 'Iniciar sesión', studio: 'Estudio', watch_later: 'Ver más tarde',
    friends: 'Amigos', search_placeholder: 'Buscar creadores o transmisiones',
    trending: 'Transmisiones en tendencia', live_now: 'En vivo ahora', recommended: 'Recomendado para ti',
    top_creators: 'Mejores creadores', follow: 'Seguir', following: 'Siguiendo',
    notifications: 'Notificaciones', no_notifications: 'Sin notificaciones todavía',
  },
  fr: {
    go_live: 'Passer en direct', sign_in: 'Se connecter', studio: 'Studio', watch_later: 'À regarder plus tard',
    friends: 'Amis', search_placeholder: 'Rechercher des créateurs ou des streams',
    trending: 'Streams tendance', live_now: 'En direct maintenant', recommended: 'Recommandé pour vous',
    top_creators: 'Meilleurs créateurs', follow: 'Suivre', following: 'Abonné',
    notifications: 'Notifications', no_notifications: 'Aucune notification pour le moment',
  },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => DICTIONARIES.en[key] ?? key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('sv_locale') as Locale | null;
    if (saved && DICTIONARIES[saved]) setLocaleState(saved);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('sv_locale', l);
  }, []);

  const t = useCallback((key: string) => DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key, [locale]);

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];
