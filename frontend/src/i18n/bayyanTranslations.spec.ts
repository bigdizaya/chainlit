import { describe, expect, it } from 'vitest';

import { BAYYAN_TRANSLATIONS } from './bayyanTranslations';

function translationPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => translationPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('BAYYAN translations', () => {
  it('keeps the same complete key set in all four languages', () => {
    const frenchPaths = translationPaths(BAYYAN_TRANSLATIONS.fr).sort();

    expect(translationPaths(BAYYAN_TRANSLATIONS.ar).sort()).toEqual(
      frenchPaths
    );
    expect(translationPaths(BAYYAN_TRANSLATIONS.en).sort()).toEqual(
      frenchPaths
    );
    expect(translationPaths(BAYYAN_TRANSLATIONS.es).sort()).toEqual(
      frenchPaths
    );
    expect(frenchPaths).toContain('bayyan.welcome.title');
    expect(frenchPaths).toContain('bayyan.responseLevel.deep.description');
    expect(frenchPaths).toContain('bayyan.quota.remainingLabel');
  });
});
