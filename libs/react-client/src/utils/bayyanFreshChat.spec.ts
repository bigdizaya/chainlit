import { describe, expect, it } from 'vitest';

import { bindBayyanFreshChatToThread } from './bayyanFreshChat';

describe('bindBayyanFreshChatToThread', () => {
  it('turns the fresh-chat hint into a resumable thread auth payload', () => {
    const auth = { threadId: '', freshChat: '1', sessionId: 'session-id' };

    expect(bindBayyanFreshChatToThread(auth, 'thread-id')).toBe(true);
    expect(auth).toEqual({
      threadId: 'thread-id',
      freshChat: '',
      sessionId: 'session-id'
    });
  });

  it('ignores non-object Socket.IO auth callbacks safely', () => {
    const authCallback = () => undefined;

    expect(bindBayyanFreshChatToThread(authCallback, 'thread-id')).toBe(false);
  });
});
