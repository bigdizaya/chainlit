import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BAYYAN welcome screen', () => {
  it('does not expose generic starters that submit an unrelated search', () => {
    const welcomeSource = readFileSync(
      resolve(process.cwd(), 'src/components/chat/WelcomeScreen.tsx'),
      'utf8'
    );
    const startersSource = readFileSync(
      resolve(process.cwd(), 'src/components/chat/Starters.tsx'),
      'utf8'
    );

    expect(welcomeSource).not.toContain('Quelques points de départ');
    expect(welcomeSource).toContain('<MessageComposer {...props} />');
    expect(welcomeSource).toContain('<Starters />');
    expect(startersSource).not.toContain('BAYYAN_DEFAULT_STARTERS');
    expect(startersSource).not.toContain(
      "Comment comprendre une divergence d'avis entre plusieurs savants ?"
    );
    expect(startersSource).toContain('return config?.starters;');
  });
});
