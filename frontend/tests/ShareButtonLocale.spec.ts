import { describe, expect, it } from 'vitest';

import { shareLabels } from '../src/components/chat/Messages/Message/Buttons/ShareButton';

describe('MessageShareButton locale', () => {
  it('provides the four BAYYAN languages', () => {
    expect(shareLabels('fr').button).toBe('Partager');
    expect(shareLabels('ar').button).toBe('مشاركة');
    expect(shareLabels('en').button).toBe('Share');
    expect(shareLabels('es').button).toBe('Compartir');
  });

  it('does not depend on the browser language', () => {
    expect(shareLabels('es').copied).toContain('copiado');
    expect(shareLabels('en').copied).toContain('copied');
  });
});
