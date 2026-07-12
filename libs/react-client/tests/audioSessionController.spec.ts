import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioSessionController } from '../src/audioSessionController';

describe('AudioSessionController', () => {
  let controller: AudioSessionController;

  beforeEach(() => {
    controller = new AudioSessionController();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps late events from an older attempt out of a retry', () => {
    const first = controller.begin();
    controller.transition(first, 'waiting_server');
    const second = controller.begin();

    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.transition(first, 'recording')).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
    expect(controller.currentPhase()).toBe('preparing');
  });

  it('allows a stop exactly once', () => {
    const id = controller.begin();
    controller.transition(id, 'recording');

    expect(controller.beginStop(id)).toBe(true);
    expect(controller.beginStop(id)).toBe(false);
    expect(controller.currentPhase()).toBe('stopping');
  });

  it('claims a final-buffer flush before stopping', () => {
    const id = controller.begin();
    controller.transition(id, 'recording');

    expect(controller.beginFlush(id)).toBe(true);
    expect(controller.currentPhase()).toBe('flushing');
    expect(controller.beginFlush(id)).toBe(false);
    expect(controller.beginStop(id)).toBe(true);
    expect(controller.currentPhase()).toBe('stopping');
  });

  it('fires a connection timeout only for the current attempt', async () => {
    const callback = vi.fn();
    const first = controller.begin();
    controller.armConnectionTimeout(first, callback, 100);
    controller.begin();

    await vi.advanceTimersByTimeAsync(100);
    expect(callback).not.toHaveBeenCalled();

    const current = controller.currentId()!;
    controller.armConnectionTimeout(current, callback, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('clears timers when an attempt finishes', async () => {
    const callback = vi.fn();
    const id = controller.begin();
    controller.armConnectionTimeout(id, callback, 100);
    controller.finish(id);

    await vi.advanceTimersByTimeAsync(100);
    expect(callback).not.toHaveBeenCalled();
    expect(controller.currentId()).toBeUndefined();
  });
});
