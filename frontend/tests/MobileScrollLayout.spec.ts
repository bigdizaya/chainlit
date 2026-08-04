import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BAYYAN mobile conversation scrolling', () => {
  it('keeps a single touch-scroll owner for the message list', () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), 'src/pages/Page.tsx'),
      'utf8'
    );
    const chatSource = readFileSync(
      resolve(process.cwd(), 'src/components/chat/index.tsx'),
      'utf8'
    );
    const scrollSource = readFileSync(
      resolve(process.cwd(), 'src/components/chat/ScrollContainer.tsx'),
      'utf8'
    );

    expect(pageSource).toContain(
      'className="flex min-h-0 flex-row flex-grow overflow-hidden"'
    );
    expect(chatSource).toContain(
      'className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"'
    );
    expect(scrollSource).toContain(
      'relative flex min-h-0 flex-grow flex-col overflow-hidden'
    );
    expect(scrollSource).toContain('touch-pan-y');
    expect(scrollSource).toContain('overflow-y-auto overscroll-y-contain');
    expect(scrollSource).toContain('[-webkit-overflow-scrolling:touch]');
  });
});
