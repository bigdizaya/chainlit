import { useCallback, useSyncExternalStore } from 'react';

export const BAYYAN_PRIMARY_LOCALE_STORAGE_KEY = 'bayyan_locale';
export const BAYYAN_LEGACY_LOCALE_STORAGE_KEY = 'jawab_lang';
export const BAYYAN_LOCALE_STORAGE_KEY = BAYYAN_PRIMARY_LOCALE_STORAGE_KEY;
export const BAYYAN_LOCALE_CHANGE_EVENT = 'bayyan:languagechange';

export const BAYYAN_LOCALES = ['fr', 'ar', 'en', 'es'] as const;

export type BayyanLocale = (typeof BAYYAN_LOCALES)[number];
export type BayyanLanguage = 'fr-FR' | 'ar-SA' | 'en-US' | 'es';

const LANGUAGE_BY_LOCALE: Record<BayyanLocale, BayyanLanguage> = {
  fr: 'fr-FR',
  ar: 'ar-SA',
  en: 'en-US',
  es: 'es'
};

let activeSessionLocale: BayyanLocale | null = null;

export function normalizeBayyanLocale(value: unknown): BayyanLocale | null {
  if (typeof value !== 'string') return null;

  const locale = value.trim().toLowerCase().replace('_', '-').split('-')[0];
  return BAYYAN_LOCALES.includes(locale as BayyanLocale)
    ? (locale as BayyanLocale)
    : null;
}

function readStoredLocale(key: string): BayyanLocale | null {
  if (typeof window === 'undefined') return null;

  try {
    return normalizeBayyanLocale(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function resolveBayyanLocale(): BayyanLocale {
  if (activeSessionLocale) return activeSessionLocale;

  const primary = readStoredLocale(BAYYAN_PRIMARY_LOCALE_STORAGE_KEY);
  if (primary) return primary;

  const legacy = readStoredLocale(BAYYAN_LEGACY_LOCALE_STORAGE_KEY);
  if (legacy) return legacy;

  if (typeof window !== 'undefined') {
    try {
      const requested = normalizeBayyanLocale(
        new URL(window.location.href).searchParams.get('lang')
      );
      if (requested) return requested;
    } catch {
      // Embedded WebViews can expose a restricted or malformed location.
    }
  }

  if (typeof navigator !== 'undefined') {
    const browserLanguages = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language
    ];

    for (const language of browserLanguages) {
      const locale = normalizeBayyanLocale(language);
      if (locale) return locale;
    }
  }

  return 'fr';
}

export function toBayyanLanguage(locale: BayyanLocale): BayyanLanguage {
  return LANGUAGE_BY_LOCALE[locale];
}

export function resolveBayyanLanguage(): BayyanLanguage {
  return toBayyanLanguage(resolveBayyanLocale());
}

export function applyBayyanDocumentLocale(value: unknown): BayyanLocale {
  const locale = normalizeBayyanLocale(value) || 'fr';

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.bayyanLocale = locale;
  }

  return locale;
}

function postLocaleToServiceWorker(locale: BayyanLocale): void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;

  const message = { type: 'BAYYAN_SET_LOCALE', locale };

  try {
    navigator.serviceWorker.controller?.postMessage(message);
    void navigator.serviceWorker.ready
      .then((registration) => {
        const worker =
          registration.active ||
          registration.waiting ||
          registration.installing;
        worker?.postMessage(message);
      })
      .catch(() => undefined);
  } catch {
    // Locale persistence must not depend on service-worker availability.
  }
}

export function setBayyanLocale(value: BayyanLocale): void {
  const locale = normalizeBayyanLocale(value);
  if (!locale || typeof window === 'undefined') return;

  activeSessionLocale = locale;

  try {
    window.localStorage.setItem(
      BAYYAN_PRIMARY_LOCALE_STORAGE_KEY,
      toBayyanLanguage(locale)
    );
    window.localStorage.setItem(BAYYAN_LEGACY_LOCALE_STORAGE_KEY, locale);
  } catch {
    // The current session can still change language without persistence.
  }

  applyBayyanDocumentLocale(locale);
  postLocaleToServiceWorker(locale);
  window.dispatchEvent(
    new CustomEvent(BAYYAN_LOCALE_CHANGE_EVENT, {
      detail: { language: toBayyanLanguage(locale), locale }
    })
  );
}

function subscribeToBayyanLocale(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleLanguageChange = (event: Event) => {
    const detail =
      event instanceof CustomEvent && event.detail
        ? (event.detail as Record<string, unknown>)
        : {};
    activeSessionLocale =
      normalizeBayyanLocale(detail.locale || detail.language) || null;
    callback();
  };
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === BAYYAN_PRIMARY_LOCALE_STORAGE_KEY ||
      event.key === BAYYAN_LEGACY_LOCALE_STORAGE_KEY
    ) {
      activeSessionLocale = null;
      callback();
    }
  };

  window.addEventListener(BAYYAN_LOCALE_CHANGE_EVENT, handleLanguageChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(
      BAYYAN_LOCALE_CHANGE_EVENT,
      handleLanguageChange
    );
    window.removeEventListener('storage', handleStorage);
  };
}

const getServerLanguage = (): BayyanLanguage => 'fr-FR';

export function useBayyanLocale() {
  const language = useSyncExternalStore(
    subscribeToBayyanLocale,
    resolveBayyanLanguage,
    getServerLanguage
  );
  const locale = normalizeBayyanLocale(language) || 'fr';
  const selectLocale = useCallback((nextLocale: BayyanLocale) => {
    setBayyanLocale(nextLocale);
  }, []);

  return { language, locale, setLocale: selectLocale };
}
