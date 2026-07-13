import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readStoredResponseLevel,
  syncStoredResponseLevel
} from '../src/components/chat/MessageComposer/ResponseLevelPicker';

describe('response level synchronization', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('normalizes the stored value to a supported public mode', () => {
    window.localStorage.setItem('bayyan_response_level', 'deep');
    expect(readStoredResponseLevel()).toBe('deep');

    window.localStorage.setItem('bayyan_response_level', 'unsupported');
    expect(readStoredResponseLevel()).toBe('concise');
  });

  it('persists the selected mode before a message is sent', async () => {
    window.localStorage.setItem('bayyan_response_level', 'deep');
    const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, level: 'deep' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(syncStoredResponseLevel()).resolves.toMatchObject({
      success: true,
      level: 'deep'
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/response-level', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'deep' })
    });
  });

  it('rejects when the backend cannot confirm the mode', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await expect(syncStoredResponseLevel()).rejects.toThrow(
      'response-level sync failed'
    );
  });
});
