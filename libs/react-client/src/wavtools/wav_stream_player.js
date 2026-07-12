import { AudioAnalysis } from './analysis/audio_analysis.js';
import { StreamProcessorSrc } from './worklets/stream_processor.js';

/**
 * Plays audio streams received in raw PCM16 chunks from the browser
 * @class
 */
export class WavStreamPlayer {
  /**
   * Creates a new WavStreamPlayer instance
   * @param {{sampleRate?: number}} options
   * @returns {WavStreamPlayer}
   */
  constructor({ sampleRate = 24000, onStop } = {}) {
    this.scriptSrc = StreamProcessorSrc;
    this.onStop = onStop;
    this.sampleRate = sampleRate;
    this.context = null;
    this.stream = null;
    this.analyser = null;
    this.trackSampleOffsets = {};
    this.interruptedTrackIds = {};
    this._closePromise = null;
    this._connectPromise = null;
    this._lifecycleId = 0;
  }

  /**
   * Connects the audio context and enables output to speakers
   * @returns {Promise<true>}
   */
  async connect() {
    if (this.context && this.context.state !== 'closed' && this.analyser) {
      return true;
    }
    if (this._connectPromise) return this._connectPromise;

    const lifecycleId = ++this._lifecycleId;
    const connectPromise = (async () => {
      if (this._closePromise) await this._closePromise;
      if (lifecycleId !== this._lifecycleId) {
        throw new Error('Audio output connection cancelled');
      }

      const context = new AudioContext({ sampleRate: this.sampleRate });
      this.context = context;

      try {
        if (context.state === 'suspended') await context.resume();
        await context.audioWorklet.addModule(this.scriptSrc);

        if (lifecycleId !== this._lifecycleId || this.context !== context) {
          throw new Error('Audio output connection cancelled');
        }

        const analyser = context.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0.1;
        this.analyser = analyser;
        return true;
      } catch (error) {
        if (this.context === context) {
          this.context = null;
          this.analyser = null;
        }
        if (context.state !== 'closed') await context.close().catch(() => {});
        if (lifecycleId !== this._lifecycleId) {
          throw new Error('Audio output connection cancelled');
        }
        console.error(error);
        throw new Error(`Could not add audioWorklet module: ${this.scriptSrc}`);
      }
    })();

    this._connectPromise = connectPromise;
    try {
      return await connectPromise;
    } finally {
      if (this._connectPromise === connectPromise) {
        this._connectPromise = null;
      }
    }
  }

  /**
   * Gets the current frequency domain data from the playing track
   * @param {"frequency"|"music"|"voice"} [analysisType]
   * @param {number} [minDecibels] default -100
   * @param {number} [maxDecibels] default -30
   * @returns {import('./analysis/audio_analysis.js').AudioAnalysisOutputType}
   */
  getFrequencies(
    analysisType = 'frequency',
    minDecibels = -100,
    maxDecibels = -30
  ) {
    if (!this.analyser) {
      throw new Error('Not connected, please call .connect() first');
    }
    return AudioAnalysis.getFrequencies(
      this.analyser,
      this.sampleRate,
      null,
      analysisType,
      minDecibels,
      maxDecibels
    );
  }

  /**
   * Starts audio streaming
   * @private
   * @returns {Promise<true>}
   */
  _start() {
    const streamNode = new AudioWorkletNode(this.context, 'stream_processor');
    streamNode.connect(this.context.destination);
    streamNode.port.onmessage = (e) => {
      const { event } = e.data;
      if (event === 'stop') {
        this.onStop?.();
        streamNode.disconnect();
        this.stream = null;
      } else if (event === 'offset') {
        const { requestId, trackId, offset } = e.data;
        const currentTime = offset / this.sampleRate;
        this.trackSampleOffsets[requestId] = { trackId, offset, currentTime };
      }
    };
    this.analyser.disconnect();
    streamNode.connect(this.analyser);
    this.stream = streamNode;
    return true;
  }

  /**
   * Adds 16BitPCM data to the currently playing audio stream
   * You can add chunks beyond the current play point and they will be queued for play
   * @param {ArrayBuffer|Int16Array} arrayBuffer
   * @param {string} [trackId]
   * @returns {Int16Array}
   */
  add16BitPCM(arrayBuffer, trackId = 'default') {
    if (typeof trackId !== 'string') {
      throw new Error(`trackId must be a string`);
    } else if (this.interruptedTrackIds[trackId]) {
      return;
    }
    if (!this.stream) {
      this._start();
    }
    let buffer;
    if (arrayBuffer instanceof Int16Array) {
      buffer = arrayBuffer;
    } else if (arrayBuffer instanceof ArrayBuffer) {
      buffer = new Int16Array(arrayBuffer);
    } else {
      throw new Error(`argument must be Int16Array or ArrayBuffer`);
    }
    this.stream.port.postMessage({ event: 'write', buffer, trackId });
    return buffer;
  }

  /**
   * Gets the offset (sample count) of the currently playing stream
   * @param {boolean} [interrupt]
   * @returns {{trackId: string|null, offset: number, currentTime: number}}
   */
  async getTrackSampleOffset(interrupt = false) {
    if (!this.stream) {
      return null;
    }
    const lifecycleId = this._lifecycleId;
    const stream = this.stream;
    const requestId = crypto.randomUUID();
    stream.port.postMessage({
      event: interrupt ? 'interrupt' : 'offset',
      requestId
    });
    let trackSampleOffset;
    const timeoutAt = Date.now() + 1000;
    while (
      !trackSampleOffset &&
      lifecycleId === this._lifecycleId &&
      this.stream === stream &&
      Date.now() < timeoutAt
    ) {
      trackSampleOffset = this.trackSampleOffsets[requestId];
      await new Promise((r) => setTimeout(() => r(), 1));
    }
    if (!trackSampleOffset) return null;
    const { trackId } = trackSampleOffset;
    if (interrupt && trackId) {
      this.interruptedTrackIds[trackId] = true;
    }
    return trackSampleOffset;
  }

  /**
   * Strips the current stream and returns the sample offset of the audio
   * @param {boolean} [interrupt]
   * @returns {{trackId: string|null, offset: number, currentTime: number}}
   */
  async interrupt() {
    return this.getTrackSampleOffset(true);
  }

  /**
   * Fully closes the output graph. Safe to call several times.
   * @returns {Promise<true>}
   */
  async close() {
    if (this._closePromise) return this._closePromise;

    this._lifecycleId++;

    this._closePromise = (async () => {
      const context = this.context;
      const stream = this.stream;
      const analyser = this.analyser;

      this.context = null;
      this.stream = null;
      this.analyser = null;

      try {
        if (stream) {
          stream.port.onmessage = null;
          stream.disconnect();
        }
      } catch {
        // The stream can already be disconnected.
      }
      try {
        analyser?.disconnect();
      } catch {
        // The analyser can already be disconnected.
      }
      try {
        if (context && context.state !== 'closed') await context.close();
      } catch {
        // Mobile browsers may close the context while backgrounded.
      }

      this.trackSampleOffsets = {};
      this.interruptedTrackIds = {};
      return true;
    })();

    try {
      return await this._closePromise;
    } finally {
      this._closePromise = null;
    }
  }
}

globalThis.WavStreamPlayer = WavStreamPlayer;
