import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WavRecorder } from '../src/wavtools/wav_recorder.js';

class FakeNode {
  disconnect = vi.fn();
  connect(target?: unknown) {
    return target || this;
  }
}

class FakeScriptProcessor extends FakeNode {
  onaudioprocess: ((event: unknown) => void) | null = null;
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState = 'running';
  state = FakeAudioContext.initialState;
  sampleRate = 48000;
  destination = {};
  audioWorklet = { addModule: vi.fn() };
  source = new FakeNode();
  analyser = Object.assign(new FakeNode(), {
    fftSize: 0,
    smoothingTimeConstant: 0
  });
  scriptProcessor = new FakeScriptProcessor();
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createMediaStreamSource() {
    return this.source;
  }
  createAnalyser() {
    return this.analyser;
  }
  createScriptProcessor() {
    return this.scriptProcessor;
  }
}

const createStream = () => {
  const tracks = [{ stop: vi.fn() }];
  return {
    tracks,
    getTracks: () => tracks
  };
};

describe.each(['iPhone', 'Android'])('WavRecorder on %s', (userAgent) => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = 'running';
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: userAgent
    });
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => createStream()) }
    });
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records real PCM and can complete two clean cycles', async () => {
    const recorder = new WavRecorder();

    for (let cycle = 0; cycle < 2; cycle++) {
      const chunks: ArrayBuffer[] = [];
      await recorder.begin();
      await recorder.record((data: { mono: ArrayBuffer }) =>
        chunks.push(data.mono)
      );

      const context = FakeAudioContext.instances[cycle];
      context.scriptProcessor.onaudioprocess?.({
        inputBuffer: {
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(4096).fill(0.25)
        }
      });
      context.scriptProcessor.onaudioprocess?.({
        inputBuffer: {
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(4096).fill(0.25)
        }
      });

      await expect(recorder.waitForFirstChunk(50)).resolves.toBe(true);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBeInstanceOf(ArrayBuffer);
      expect(chunks[0].byteLength).toBeGreaterThan(0);
      await recorder.end();
      expect(recorder.getStatus()).toBe('ended');
      expect(context.close).toHaveBeenCalledTimes(1);
    }
  });

  it('reports when the mobile processor produces no first chunk', async () => {
    vi.useFakeTimers();
    const recorder = new WavRecorder();
    await recorder.begin();
    await recorder.record();

    const firstChunk = recorder.waitForFirstChunk(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(firstChunk).resolves.toBe(false);
    await recorder.end();
    vi.useRealTimers();
  });

  it('flushes a real 48 kHz partial buffer when recording stops', async () => {
    const recorder = new WavRecorder();
    const chunks: ArrayBuffer[] = [];
    await recorder.begin();
    await recorder.record((data: { mono: ArrayBuffer }) =>
      chunks.push(data.mono)
    );

    const context = FakeAudioContext.instances[0];
    context.scriptProcessor.onaudioprocess?.({
      inputBuffer: {
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(4096).fill(0.25)
      }
    });

    await expect(recorder.waitForFirstChunk(50)).resolves.toBe(true);
    expect(chunks).toHaveLength(0);
    await recorder.pause();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].byteLength).toBe(4096);
    await recorder.end();
  });
});

describe('WavRecorder worklet stop flush', () => {
  it('flushes chunks received while waiting for the stop receipt', async () => {
    const recorder = new WavRecorder();
    const chunkProcessor = vi.fn();
    const partial = new ArrayBuffer(4096);
    const processor = {
      port: {
        postMessage: vi.fn((message: { id: number; event: string }) => {
          if (message.event !== 'stop') return;
          recorder._handleChunk({ raw: partial, mono: partial });
          recorder.eventReceipts[message.id] = { stopped: true };
        })
      }
    };
    recorder.processor = processor;
    recorder.recording = true;
    recorder._chunkProcessor = chunkProcessor;
    recorder._chunkProcessorSize = 8192;

    await recorder.pause();

    expect(chunkProcessor).toHaveBeenCalledTimes(1);
    expect(chunkProcessor.mock.calls[0][0].mono.byteLength).toBe(4096);
  });
});

describe('WavRecorder pending permission cleanup', () => {
  it('resumes a suspended iOS context before permission resolves', async () => {
    let resolveStream!: (stream: ReturnType<typeof createStream>) => void;
    const pendingStream = new Promise<ReturnType<typeof createStream>>(
      (resolve) => {
        resolveStream = resolve;
      }
    );
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'iPhone'
    });
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => pendingStream) }
    });
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = 'suspended';
    vi.stubGlobal('AudioContext', FakeAudioContext);

    const recorder = new WavRecorder();
    const begin = recorder.begin();
    expect(FakeAudioContext.instances[0].resume).toHaveBeenCalledTimes(1);

    resolveStream(createStream());
    await expect(begin).resolves.toBe(true);
    await recorder.end();
    vi.unstubAllGlobals();
  });

  it('does not resurrect a cancelled begin call', async () => {
    let resolveStream!: (stream: ReturnType<typeof createStream>) => void;
    const pendingStream = new Promise<ReturnType<typeof createStream>>(
      (resolve) => {
        resolveStream = resolve;
      }
    );
    const stream = createStream();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'iPhone'
    });
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => pendingStream) }
    });
    FakeAudioContext.instances = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);

    const recorder = new WavRecorder();
    const begin = recorder.begin();
    await recorder.end();
    resolveStream(stream);

    await expect(begin).rejects.toThrow('Microphone start cancelled');
    expect(stream.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(recorder.getStatus()).toBe('ended');
    vi.unstubAllGlobals();
  });
});
