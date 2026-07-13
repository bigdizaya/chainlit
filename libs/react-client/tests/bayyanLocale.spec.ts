import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BAYYAN_LEGACY_LOCALE_STORAGE_KEY,
  BAYYAN_LOCALE_CHANGE_EVENT,
  BAYYAN_PRIMARY_LOCALE_STORAGE_KEY,
  applyBayyanDocumentLocale,
  normalizeBayyanLocale,
  resolveBayyanLanguage,
  resolveBayyanLocale,
  setBayyanLocale,
  withBayyanLocale
} from '../src/utils/bayyanLocale';

function setBrowserLanguages(languages: string[]) {
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: languages
  });
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    value: languages[0] || 'de-DE'
  });
}

describe('BAYYAN locale resolution', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('normalizes the four supported locale families', () => {
    expect(normalizeBayyanLocale('fr-FR')).toBe('fr');
    expect(normalizeBayyanLocale('ar_SA')).toBe('ar');
    expect(normalizeBayyanLocale('en-GB')).toBe('en');
    expect(normalizeBayyanLocale('es-MX')).toBe('es');
    expect(normalizeBayyanLocale('it-IT')).toBeNull();
  });

  it('gives an explicit URL locale priority over stored preferences and phone', () => {
    setBrowserLanguages(['es-ES']);
    window.history.replaceState({}, '', '/?lang=fr');
    window.localStorage.setItem(BAYYAN_PRIMARY_LOCALE_STORAGE_KEY, 'en-US');
    window.localStorage.setItem(BAYYAN_LEGACY_LOCALE_STORAGE_KEY, 'ar');

    expect(resolveBayyanLocale()).toBe('fr');
    expect(resolveBayyanLanguage()).toBe('fr-FR');
  });

  it('gives bayyan_locale priority over the legacy key and phone without a URL locale', () => {
    setBrowserLanguages(['es-ES']);
    window.localStorage.setItem(BAYYAN_PRIMARY_LOCALE_STORAGE_KEY, 'en-US');
    window.localStorage.setItem(BAYYAN_LEGACY_LOCALE_STORAGE_KEY, 'ar');

    expect(resolveBayyanLocale()).toBe('en');
    expect(resolveBayyanLanguage()).toBe('en-US');
  });

  it('uses jawab_lang when the primary preference is absent', () => {
    setBrowserLanguages(['es-ES']);
    window.localStorage.setItem(BAYYAN_LEGACY_LOCALE_STORAGE_KEY, 'ar');

    expect(resolveBayyanLocale()).toBe('ar');
    expect(resolveBayyanLanguage()).toBe('ar-SA');
  });

  it('honors an explicit URL locale before phone detection', () => {
    setBrowserLanguages(['en-US']);
    window.history.replaceState({}, '', '/?lang=es');

    expect(resolveBayyanLocale()).toBe('es');
    expect(resolveBayyanLanguage()).toBe('es');
  });

  it('uses the first supported phone language', () => {
    setBrowserLanguages(['it-IT', 'es-MX', 'en-US']);

    expect(resolveBayyanLocale()).toBe('es');
    expect(resolveBayyanLanguage()).toBe('es');
  });

  it('falls back to French when the phone language is unsupported', () => {
    setBrowserLanguages(['it-IT', 'de-DE']);

    expect(resolveBayyanLocale()).toBe('fr');
    expect(resolveBayyanLanguage()).toBe('fr-FR');
  });

  it('preserves existing URL state while adding a normalized locale', () => {
    expect(withBayyanLocale('/?new=1#composer', 'ar-SA')).toBe(
      '/?new=1&lang=ar#composer'
    );
    expect(withBayyanLocale('/login?error=signin', 'es-MX')).toBe(
      '/login?error=signin&lang=es'
    );
  });

  it('applies an Arabic document direction', () => {
    expect(applyBayyanDocumentLocale('ar-SA')).toBe('ar');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');

    applyBayyanDocumentLocale('en-US');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('keeps an explicit URL locale above an active session selection', () => {
    setBayyanLocale('en');
    window.history.replaceState({}, '', '/?lang=ar');

    expect(resolveBayyanLocale()).toBe('ar');
    expect(resolveBayyanLanguage()).toBe('ar-SA');
  });

  it('updates only the locale query when the active selection changes', () => {
    window.history.replaceState(
      { thread: '42' },
      '',
      '/thread/42?new=1&lang=fr#composer'
    );

    setBayyanLocale('ar');

    expect(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    ).toBe('/thread/42?new=1&lang=ar#composer');
    expect(window.history.state).toEqual({ thread: '42' });
    expect(resolveBayyanLocale()).toBe('ar');
  });

  it('writes both preference keys, emits the bridge event and informs SW', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: { postMessage },
        ready: Promise.resolve({ active: { postMessage } })
      }
    });
    const listener = vi.fn();
    window.addEventListener(BAYYAN_LOCALE_CHANGE_EVENT, listener);

    setBayyanLocale('en');
    await Promise.resolve();

    expect(window.localStorage.getItem(BAYYAN_PRIMARY_LOCALE_STORAGE_KEY)).toBe(
      'en-US'
    );
    expect(window.localStorage.getItem(BAYYAN_LEGACY_LOCALE_STORAGE_KEY)).toBe(
      'en'
    );
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      language: 'en-US',
      locale: 'en'
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'BAYYAN_SET_LOCALE',
      locale: 'en'
    });
    window.removeEventListener(BAYYAN_LOCALE_CHANGE_EVENT, listener);
  });
});
