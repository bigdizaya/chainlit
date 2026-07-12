/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['./tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    restoreMocks: true,
    setupFiles: './tests/setup-tests.ts'
  }
});
