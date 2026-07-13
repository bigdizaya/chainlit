import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BAYYAN_LEGACY_LOCALE_STORAGE_KEY,
  BAYYAN_LOCALE_CHANGE_EVENT,
  BAYYAN_PRIMARY_LOCALE_STORAGE_KEY,
  applyBayyanDocumentLocale,
  normalizeBayyanLocale,
  resolveBayyanLanguage,
  resolveBayyanLocale,
  setBayyanLocale
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

  it('gives bayyan_locale priority over the legacy key and phone', () => {
    setBrowserLanguages(['es-ES']);
    window.history.replaceState({}, '', '/?lang=fr');
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

  it('applies an Arabic document direction', () => {
    expect(applyBayyanDocumentLocale('ar-SA')).toBe('ar');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');

    applyBayyanDocumentLocale('en-US');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
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
