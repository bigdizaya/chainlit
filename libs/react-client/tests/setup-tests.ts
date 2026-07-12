import { vi } from 'vitest';

Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: vi.fn(() => 'blob:chainlit-audio-test')
});
