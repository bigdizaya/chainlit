import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WavStreamPlayer } from '../src/wavtools/wav_stream_player.js';

class FakeAnalyser {
  fftSize = 0;
  smoothingTimeConstant = 0;
  disconnect = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static addModuleFactory = () => Promise.resolve();
  state = 'running';
  audioWorklet = {
    addModule: vi.fn(() => FakeAudioContext.addModuleFactory())
  };
  analyser = new FakeAnalyser();
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  resume = vi.fn(async () => undefined);

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createAnalyser() {
    return this.analyser;
  }
}

describe('WavStreamPlayer lifecycle', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudioContext.addModuleFactory = () => Promise.resolve();
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('reuses an open context and closes it idempotently', async () => {
    const player = new WavStreamPlayer();
    await player.connect();
    await player.connect();

    expect(FakeAudioContext.instances).toHaveLength(1);
    const context = FakeAudioContext.instances[0];
    await Promise.all([player.close(), player.close()]);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.analyser.disconnect).toHaveBeenCalledTimes(1);

    await player.close();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('supports two complete connect and close cycles', async () => {
    const player = new WavStreamPlayer();
    await player.connect();
    await player.close();
    await player.connect();
    await player.close();

    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances[1].close).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent connections into one audio context', async () => {
    const player = new WavStreamPlayer();

    await Promise.all([player.connect(), player.connect()]);

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(
      FakeAudioContext.instances[0].audioWorklet.addModule
    ).toHaveBeenCalledTimes(1);
    await player.close();
  });

  it('invalidates a connection that is still loading when closed', async () => {
    let releaseModule!: () => void;
    FakeAudioContext.addModuleFactory = () =>
      new Promise<void>((resolve) => {
        releaseModule = resolve;
      });
    const player = new WavStreamPlayer();

    const connecting = player.connect();
    await Promise.resolve();
    await player.close();
    releaseModule();

    await expect(connecting).rejects.toThrow('cancelled');
    expect(player.context).toBeNull();
    expect(player.analyser).toBeNull();
    expect(FakeAudioContext.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('waits for an older close before opening the next context', async () => {
    const player = new WavStreamPlayer();
    await player.connect();
    const firstContext = FakeAudioContext.instances[0];
    let releaseClose!: () => void;
    firstContext.close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseClose = () => {
            firstContext.state = 'closed';
            resolve();
          };
        })
    );

    const closing = player.close();
    const reconnecting = player.connect();
    await Promise.resolve();
    expect(FakeAudioContext.instances).toHaveLength(1);

    releaseClose();
    await closing;
    await reconnecting;
    expect(FakeAudioContext.instances).toHaveLength(2);
    await player.close();
  });
});
