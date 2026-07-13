import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BAYYAN message locale metadata', () => {
  it('adds the current UI locale to typed, reply and starter messages', () => {
    const composerSource = readFileSync(
      resolve(process.cwd(), 'src/components/chat/MessageComposer/index.tsx'),
      'utf8'
    );
    const starterSource = readFileSync(
      resolve(process.cwd(), 'src/components/chat/Starter.tsx'),
      'utf8'
    );

    expect(composerSource.match(/ui_locale: locale/g)).toHaveLength(2);
    expect(starterSource).toContain('ui_locale: locale');
    expect(composerSource).toContain('useBayyanLocale()');
    expect(starterSource).toContain('useBayyanLocale()');
  });
});
