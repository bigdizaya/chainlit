import { describe, expect, it, vi } from 'vitest';

import { IStep, IThread } from '../src/types';
import {
  fetchThreadWithRetry,
  isCurrentThreadSnapshot,
  mergeThreadSteps
} from '../src/utils/threadSync';

function step(id: string, output: string): IStep {
  return { id, output } as IStep;
}

describe('thread reconnect synchronization', () => {
  it('keeps live steps missing from an older persisted snapshot', () => {
    expect(
      mergeThreadSteps(
        [step('question', 'Question')],
        [step('question', 'Question'), step('answer', 'Réponse finale')]
      )
    ).toEqual([step('question', 'Question'), step('answer', 'Réponse finale')]);
  });

  it('keeps the most complete content when a step exists on both sides', () => {
    expect(
      mergeThreadSteps(
        [step('answer', 'Réponse')],
        [step('answer', 'Réponse finale complète')]
      )
    ).toEqual([step('answer', 'Réponse finale complète')]);
  });

  it('retries a transient thread fetch failure', async () => {
    const thread = { id: 'thread-1', steps: [] } as IThread;
    const fetchThread = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(thread);

    await expect(
      fetchThreadWithRetry(fetchThread, 'thread-1', [0, 0])
    ).resolves.toBe(thread);
    expect(fetchThread).toHaveBeenCalledTimes(2);
  });

  it('rejects a late snapshot after the user changed threads', () => {
    const thread = { id: 'thread-a', steps: [] } as IThread;

    expect(isCurrentThreadSnapshot('thread-a', 'thread-b', thread)).toBe(false);
    expect(isCurrentThreadSnapshot('thread-a', 'thread-a', thread)).toBe(true);
  });
});
