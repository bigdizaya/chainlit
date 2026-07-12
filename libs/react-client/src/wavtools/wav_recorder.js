import { AudioAnalysis } from './analysis/audio_analysis.js';
import { WavPacker } from './wav_packer.js';
import { AudioProcessorSrc } from './worklets/audio_processor.js';

/**
 * Decodes audio into a wav file
 * @typedef {Object} DecodedAudioType
 * @property {Blob} blob
 * @property {string} url
 * @property {Float32Array} values
 * @property {AudioBuffer} audioBuffer
 */

/**
 * Records live stream of user audio as PCM16 "audio/wav" data
 * @class
 */
export class WavRecorder {
  /**
   * Create a new WavRecorder instance
   * @param {{sampleRate?: number, outputToSpeakers?: boolean, debug?: boolean}} [options]
   * @returns {WavRecorder}
   */
  constructor({
    sampleRate = 24000,
    outputToSpeakers = false,
    debug = false
  } = {}) {
    // Script source
    this.scriptSrc = AudioProcessorSrc;
    // Config
    this.sampleRate = sampleRate;
    this.outputToSpeakers = outputToSpeakers;
    this.debug = !!debug;
    this._deviceChangeCallback = null;
    this._devices = [];
    // State variables
    this.stream = null;
    this.processor = null;
    this.scriptProcessor = null;
    this.source = null;
    this.node = null;
    this.context = null;
    this.analyser = null;
    this.recording = false;
    this._resumeOnForeground = null;
    this._processorMode = null;
    this._recordingWatchdog = null;
    this._chunksSeen = 0;
    this._lifecycleId = 0;
    this._endPromise = null;
    this._firstChunkWaiters = new Set();
    // Event handling with AudioWorklet
    this._lastEventId = 0;
    this.eventReceipts = {};
    this.eventTimeout = 5000;
    // Process chunks of audio
    this._chunkProcessor = () => {};
    this._chunkProcessorSize = void 0;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0)
    };
  }

  /**
   * Decodes audio data from multiple formats to a Blob, url, Float32Array and AudioBuffer
   * @param {Blob|Float32Array|Int16Array|ArrayBuffer|number[]} audioData
   * @param {number} sampleRate
   * @param {number} fromSampleRate
   * @returns {Promise<DecodedAudioType>}
   */
  static async decode(audioData, sampleRate = 24000, fromSampleRate = -1) {
    const context = new AudioContext({ sampleRate });
    let arrayBuffer;
    let blob;
    if (audioData instanceof Blob) {
      if (fromSampleRate !== -1) {
        throw new Error(
          `Can not specify "fromSampleRate" when reading from Blob`
        );
      }
      blob = audioData;
      arrayBuffer = await blob.arrayBuffer();
    } else if (audioData instanceof ArrayBuffer) {
      if (fromSampleRate !== -1) {
        throw new Error(
          `Can not specify "fromSampleRate" when reading from ArrayBuffer`
        );
      }
      arrayBuffer = audioData;
      blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    } else {
      let float32Array;
      let data;
      if (audioData instanceof Int16Array) {
        data = audioData;
        float32Array = new Float32Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          float32Array[i] = audioData[i] / 0x8000;
        }
      } else if (audioData instanceof Float32Array) {
        float32Array = audioData;
      } else if (audioData instanceof Array) {
        float32Array = new Float32Array(audioData);
      } else {
        throw new Error(
          `"audioData" must be one of: Blob, Float32Arrray, Int16Array, ArrayBuffer, Array<number>`
        );
      }
      if (fromSampleRate === -1) {
        throw new Error(
          `Must specify "fromSampleRate" when reading from Float32Array, In16Array or Array`
        );
      } else if (fromSampleRate < 3000) {
        throw new Error(`Minimum "fromSampleRate" is 3000 (3kHz)`);
      }
      if (!data) {
        data = WavPacker.floatTo16BitPCM(float32Array);
      }
      const audio = {
        bitsPerSample: 16,
        channels: [float32Array],
        data
      };
      const packer = new WavPacker();
      const result = packer.pack(fromSampleRate, audio);
      blob = result.blob;
      arrayBuffer = await blob.arrayBuffer();
    }
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    const values = audioBuffer.getChannelData(0);
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      values,
      audioBuffer
    };
  }

  /**
   * Logs data in debug mode
   * @param {...any} arguments
   * @returns {true}
   */
  log() {
    if (this.debug) {
      this.log(...arguments);
    }
    return true;
  }

  /**
   * Retrieves the current sampleRate for the recorder
   * @returns {number}
   */
  getSampleRate() {
    return this.sampleRate;
  }

  /**
   * Retrieves the current status of the recording
   * @returns {"ended"|"paused"|"recording"}
   */
  getStatus() {
    if (!this.processor && !this.scriptProcessor) {
      return 'ended';
    } else if (!this.recording) {
      return 'paused';
    } else {
      return 'recording';
    }
  }

  _emptyAudioResult() {
    const packer = new WavPacker();
    return packer.pack(this.sampleRate, {
      bitsPerSample: 16,
      channels: [new Float32Array(0)],
      data: new Int16Array(0)
    });
  }

  _stopTracks() {
    if (!this.stream) return;
    const tracks = this.stream.getTracks();
    tracks.forEach((track) => track.stop());
  }

  _removeForegroundResumeListener() {
    if (!this._resumeOnForeground || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this._resumeOnForeground);
    this._resumeOnForeground = null;
  }

  _clearRecordingWatchdog() {
    if (!this._recordingWatchdog) return;
    clearTimeout(this._recordingWatchdog);
    this._recordingWatchdog = null;
  }

  _resolveFirstChunkWaiters(value) {
    const waiters = Array.from(this._firstChunkWaiters);
    this._firstChunkWaiters.clear();
    waiters.forEach((resolve) => resolve(value));
  }

  _markChunkSeen() {
    this._chunksSeen++;
    if (this._chunksSeen === 1) {
      this._resolveFirstChunkWaiters(true);
    }
  }

  _flushPendingChunk() {
    if (!this._chunkProcessorBuffer.mono.byteLength) return;
    const buffer = this._chunkProcessorBuffer;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0)
    };
    this._chunkProcessor(buffer);
  }

  _attachForegroundResumeListener() {
    if (typeof document === 'undefined' || this._resumeOnForeground) return;
    this._resumeOnForeground = () => {
      if (document.visibilityState === 'visible') {
        this.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this._resumeOnForeground);
  }

  async _closeContext() {
    if (!this.context || this.context.state === 'closed') return;
    try {
      await this.context.close();
    } catch {
      // The browser may already have closed the context while backgrounded.
    }
  }

  _disconnectAudioGraph() {
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
    }
    [
      this.processor,
      this.scriptProcessor,
      this.source,
      this.node,
      this.analyser
    ].forEach((node) => {
      try {
        if (node && typeof node.disconnect === 'function') node.disconnect();
      } catch {
        // Some nodes can already be disconnected after mobile backgrounding.
      }
    });
  }

  _resetAudioGraph() {
    this._clearRecordingWatchdog();
    this._resolveFirstChunkWaiters(false);
    this.stream = null;
    this.processor = null;
    this.scriptProcessor = null;
    this.source = null;
    this.node = null;
    this.analyser = null;
    this.context = null;
    this.recording = false;
    this._chunkProcessor = () => {};
    this._chunkProcessorSize = void 0;
    this._processorMode = null;
    this._chunksSeen = 0;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0)
    };
    this.eventReceipts = {};
  }

  _shouldPreferScriptProcessor() {
    if (typeof navigator === 'undefined') return false;

    const userAgent = navigator.userAgent || '';
    const isMobile = /Android|iPad|iPhone|iPod/i.test(userAgent);
    let isStandalone = false;

    if (typeof window !== 'undefined') {
      isStandalone = Boolean(window.navigator?.standalone);
      try {
        isStandalone =
          isStandalone ||
          Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
      } catch {
        // Some embedded browsers can throw while evaluating display-mode.
      }
    }

    return isMobile || isStandalone;
  }

  _handleChunk(data) {
    if (this._chunkProcessorSize) {
      const buffer = this._chunkProcessorBuffer;
      this._chunkProcessorBuffer = {
        raw: WavPacker.mergeBuffers(buffer.raw, data.raw),
        mono: WavPacker.mergeBuffers(buffer.mono, data.mono)
      };
      if (
        this._chunkProcessorBuffer.mono.byteLength >= this._chunkProcessorSize
      ) {
        this._chunkProcessor(this._chunkProcessorBuffer);
        this._chunkProcessorBuffer = {
          raw: new ArrayBuffer(0),
          mono: new ArrayBuffer(0)
        };
      }
    } else {
      this._chunkProcessor(data);
    }
  }

  _resampleFloat32Array(input, fromSampleRate, toSampleRate) {
    if (!fromSampleRate || !toSampleRate || fromSampleRate === toSampleRate) {
      return input.slice();
    }

    const ratio = fromSampleRate / toSampleRate;
    const length = Math.max(1, Math.round(input.length / ratio));
    const result = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const nextIndex = Math.min(index + 1, input.length - 1);
      const weight = position - index;
      result[i] = input[index] * (1 - weight) + input[nextIndex] * weight;
    }

    return result;
  }

  _emitScriptProcessorChunk(input) {
    if (!this.recording) return;
    const monoFloat = this._resampleFloat32Array(
      input,
      this.context?.sampleRate || this.sampleRate,
      this.sampleRate
    );
    const mono = WavPacker.floatTo16BitPCM(monoFloat);
    this._markChunkSeen();
    this._handleChunk({ raw: mono, mono });
  }

  _startScriptProcessorFallback() {
    if (!this.context || !this.source) {
      throw new Error('Can not start script processor without audio source');
    }

    this._clearRecordingWatchdog();

    if (this.processor) {
      try {
        this.processor.port.onmessage = null;
      } catch {
        // ignored
      }
      try {
        this.processor.disconnect();
      } catch {
        // ignored
      }
      this.processor = null;
    }

    if (!this.analyser) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.1;
      this.analyser = analyser;
    }

    try {
      this.source.connect(this.analyser);
    } catch {
      // The analyser may already be connected.
    }

    if (this.scriptProcessor) {
      this._processorMode = 'script';
      return true;
    }

    const scriptProcessor = this.context.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer;
      if (!inputBuffer || inputBuffer.numberOfChannels < 1) return;
      this._emitScriptProcessorChunk(inputBuffer.getChannelData(0));
    };

    this.source.connect(scriptProcessor);
    // ScriptProcessorNode only runs reliably when connected to destination.
    // We do not write output samples, so this keeps the pipeline alive silently.
    scriptProcessor.connect(this.context.destination);

    this.scriptProcessor = scriptProcessor;
    this._processorMode = 'script';
    return true;
  }

  /**
   * Resumes the AudioContext after mobile browsers suspend it in background.
   * @returns {Promise<true>}
   */
  async resume() {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
    }
    return Boolean(this.context && this.context.state === 'running');
  }

  /**
   * Waits until the recorder has produced a real PCM chunk.
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>}
   */
  async waitForFirstChunk(timeoutMs = 2500) {
    if (this._chunksSeen > 0) return true;
    if (!this.recording) return false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this._firstChunkWaiters.delete(finish);
        resolve(value);
      };
      const timeout = setTimeout(() => finish(false), timeoutMs);
      this._firstChunkWaiters.add(finish);
    });
  }

  /**
   * Sends an event to the AudioWorklet
   * @private
   * @param {string} name
   * @param {{[key: string]: any}} data
   * @param {AudioWorkletNode} [_processor]
   * @returns {Promise<{[key: string]: any}>}
   */
  async _event(name, data = {}, _processor = null) {
    _processor = _processor || this.processor;
    if (!_processor) {
      throw new Error('Can not send events without recording first');
    }
    const message = {
      event: name,
      id: this._lastEventId++,
      data
    };
    _processor.port.postMessage(message);
    const t0 = new Date().valueOf();
    while (!this.eventReceipts[message.id]) {
      if (new Date().valueOf() - t0 > this.eventTimeout) {
        throw new Error(`Timeout waiting for "${name}" event`);
      }
      await new Promise((res) => setTimeout(() => res(true), 1));
    }
    const payload = this.eventReceipts[message.id];
    delete this.eventReceipts[message.id];
    return payload;
  }

  /**
   * Sets device change callback, remove if callback provided is `null`
   * @param {(Array<MediaDeviceInfo & {default: boolean}>): void|null} callback
   * @returns {true}
   */
  listenForDeviceChange(callback) {
    if (callback === null && this._deviceChangeCallback) {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        this._deviceChangeCallback
      );
      this._deviceChangeCallback = null;
    } else if (callback !== null) {
      // Basically a debounce; we only want this called once when devices change
      // And we only want the most recent callback() to be executed
      // if a few are operating at the same time
      let lastId = 0;
      let lastDevices = [];
      const serializeDevices = (devices) =>
        devices
          .map((d) => d.deviceId)
          .sort()
          .join(',');
      const cb = async () => {
        let id = ++lastId;
        const devices = await this.listDevices();
        if (id === lastId) {
          if (serializeDevices(lastDevices) !== serializeDevices(devices)) {
            lastDevices = devices;
            callback(devices.slice());
          }
        }
      };
      navigator.mediaDevices.addEventListener('devicechange', cb);
      cb();
      this._deviceChangeCallback = cb;
    }
    return true;
  }

  /**
   * Manually request permission to use the microphone
   * @returns {Promise<true>}
   */
  async requestPermission() {
    const permissionStatus = await navigator.permissions.query({
      name: 'microphone'
    });
    if (permissionStatus.state === 'denied') {
      window.alert('You must grant microphone access to use this feature.');
    } else if (permissionStatus.state === 'prompt') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (e) {
        window.alert('You must grant microphone access to use this feature.');
      }
    }
    return true;
  }

  /**
   * List all eligible devices for recording, will request permission to use microphone
   * @returns {Promise<Array<MediaDeviceInfo & {default: boolean}>>}
   */
  async listDevices() {
    if (
      !navigator.mediaDevices ||
      !('enumerateDevices' in navigator.mediaDevices)
    ) {
      throw new Error('Could not request user devices');
    }
    await this.requestPermission();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
      (device) => device.kind === 'audioinput'
    );
    const defaultDeviceIndex = audioDevices.findIndex(
      (device) => device.deviceId === 'default'
    );
    const deviceList = [];
    if (defaultDeviceIndex !== -1) {
      let defaultDevice = audioDevices.splice(defaultDeviceIndex, 1)[0];
      let existingIndex = audioDevices.findIndex(
        (device) => device.groupId === defaultDevice.groupId
      );
      if (existingIndex !== -1) {
        defaultDevice = audioDevices.splice(existingIndex, 1)[0];
      }
      defaultDevice.default = true;
      deviceList.push(defaultDevice);
    }
    return deviceList.concat(audioDevices);
  }

  /**
   * Begins a recording session and requests microphone permissions if not already granted
   * Microphone recording indicator will appear on browser tab but status will be "paused"
   * @param {string} [deviceId] if no device provided, default device will be used
   * @returns {Promise<true>}
   */
  async begin(deviceId) {
    if (this.processor || this.scriptProcessor) {
      throw new Error(
        `Already connected: please call .end() to start a new session`
      );
    }

    if (
      !navigator.mediaDevices ||
      !('getUserMedia' in navigator.mediaDevices)
    ) {
      throw new Error('Could not request user media');
    }
    const lifecycleId = ++this._lifecycleId;
    let context;
    try {
      // Create the context and request media before the first await so mobile
      // browsers keep the original user gesture associated with this start.
      context = new AudioContext({ sampleRate: this.sampleRate });
      this.context = context;

      const activationPromise =
        context.state === 'suspended'
          ? context.resume().then(
              () => true,
              () => false
            )
          : Promise.resolve(true);

      const config = { audio: true };
      if (deviceId) {
        config.audio = { deviceId: { exact: deviceId } };
      }
      const mediaPromise = navigator.mediaDevices.getUserMedia(config);
      const [, stream] = await Promise.all([activationPromise, mediaPromise]);
      if (lifecycleId !== this._lifecycleId) {
        stream.getTracks().forEach((track) => track.stop());
        if (context.state !== 'closed') await context.close().catch(() => {});
        throw new Error('Microphone start cancelled');
      }
      this.stream = stream;

      const source = context.createMediaStreamSource(this.stream);
      this.source = source;

      if (this._shouldPreferScriptProcessor()) {
        this._startScriptProcessorFallback();
        this._attachForegroundResumeListener();
        if (!(await this.resume())) {
          throw new Error('Audio context remained suspended');
        }
        return true;
      }

      // Load and execute the module script.
      await context.audioWorklet.addModule(this.scriptSrc);
      const processor = new AudioWorkletNode(context, 'audio_processor');
      processor.port.onmessage = (e) => {
        const { event, id, data } = e.data;
        if (event === 'receipt') {
          this.eventReceipts[id] = data;
        } else if (event === 'chunk') {
          this._markChunkSeen();
          this._handleChunk(data);
        }
      };

      const node = source.connect(processor);
      const analyser = context.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.1;
      node.connect(analyser);
      if (this.outputToSpeakers) {
        // eslint-disable-next-line no-console
        console.warn(
          'Warning: Output to speakers may affect sound quality,\n' +
            'especially due to system audio feedback preventative measures.\n' +
            'use only for debugging'
        );
        analyser.connect(context.destination);
      }

      this.source = source;
      this.node = node;
      this.analyser = analyser;
      this.processor = processor;
      this._processorMode = 'worklet';
      this._attachForegroundResumeListener();
      if (!(await this.resume())) {
        throw new Error('Audio context remained suspended');
      }
    } catch (e) {
      if (lifecycleId !== this._lifecycleId) throw e;
      if (this.context && this.source) {
        try {
          this._startScriptProcessorFallback();
          this._attachForegroundResumeListener();
          await this.resume();
          return true;
        } catch (fallbackError) {
          console.error(fallbackError);
        }
      } else {
        console.error(e);
      }
      this._removeForegroundResumeListener();
      this._stopTracks();
      this._disconnectAudioGraph();
      await this._closeContext();
      this._resetAudioGraph();
      const detail = e instanceof Error ? e.message : String(e || '');
      if (/media stream|permission|denied|notallowed/i.test(detail)) {
        throw new Error('Could not start media stream');
      }
      throw new Error(`Could not start microphone processor`);
    }
    return true;
  }

  /**
   * Gets the current frequency domain data from the recording track
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
      throw new Error('Session ended: please call .begin() first');
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
   * Pauses the recording
   * Keeps microphone stream open but halts storage of audio
   * @returns {Promise<true>}
   */
  async pause() {
    if (!this.processor && !this.scriptProcessor) {
      throw new Error('Session ended: please call .begin() first');
    } else if (!this.recording) {
      throw new Error('Already paused: please call .record() first');
    }
    this._flushPendingChunk();
    this.log('Pausing ...');
    this._clearRecordingWatchdog();
    if (this.scriptProcessor && !this.processor) {
      this.recording = false;
      return true;
    }
    await this._event('stop');
    // A Worklet chunk may arrive while the stop receipt is in flight.
    this._flushPendingChunk();
    this.recording = false;
    return true;
  }

  /**
   * Start recording stream and storing to memory from the connected audio source
   * @param {(data: { mono: Int16Array; raw: Int16Array }) => any} [chunkProcessor]
   * @param {number} [chunkSize] chunkProcessor will not be triggered until this size threshold met in mono audio
   * @returns {Promise<true>}
   */
  async record(chunkProcessor = () => {}, chunkSize = 8192) {
    if (!this.processor && !this.scriptProcessor) {
      throw new Error('Session ended: please call .begin() first');
    } else if (this.recording) {
      throw new Error('Already recording: please call .pause() first');
    } else if (typeof chunkProcessor !== 'function') {
      throw new Error(`chunkProcessor must be a function`);
    }
    this._chunkProcessor = chunkProcessor;
    this._chunkProcessorSize = chunkSize;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0)
    };
    this._chunksSeen = 0;
    this._resolveFirstChunkWaiters(false);
    this.log('Recording ...');
    await this.resume();
    if (this.scriptProcessor && !this.processor) {
      this.recording = true;
      return true;
    }
    await this._event('start');
    this.recording = true;
    this._clearRecordingWatchdog();
    this._recordingWatchdog = setTimeout(() => {
      if (
        this.recording &&
        this._processorMode === 'worklet' &&
        this._chunksSeen === 0
      ) {
        try {
          this._startScriptProcessorFallback();
        } catch (error) {
          console.error(error);
        }
      }
    }, 1500);
    return true;
  }

  /**
   * Clears the audio buffer, empties stored recording
   * @returns {Promise<true>}
   */
  async clear() {
    if (!this.processor && !this.scriptProcessor) {
      throw new Error('Session ended: please call .begin() first');
    }
    if (this.scriptProcessor && !this.processor) {
      this._chunkProcessorBuffer = {
        raw: new ArrayBuffer(0),
        mono: new ArrayBuffer(0)
      };
      return true;
    }
    await this._event('clear');
    return true;
  }

  /**
   * Reads the current audio stream data
   * @returns {Promise<{meanValues: Float32Array, channels: Array<Float32Array>}>}
   */
  async read() {
    if (!this.processor && !this.scriptProcessor) {
      throw new Error('Session ended: please call .begin() first');
    }
    if (this.scriptProcessor && !this.processor) {
      return {
        meanValues: new Float32Array(0),
        channels: [new Float32Array(0)]
      };
    }
    this.log('Reading ...');
    const result = await this._event('read');
    return result;
  }

  /**
   * Saves the current audio stream to a file
   * @param {boolean} [force] Force saving while still recording
   * @returns {Promise<import('./wav_packer.js').WavPackerAudioType>}
   */
  async save(force = false) {
    if (!this.processor && !this.scriptProcessor) {
      throw new Error('Session ended: please call .begin() first');
    }
    if (this.scriptProcessor && !this.processor) {
      return this._emptyAudioResult();
    }
    if (!force && this.recording) {
      throw new Error(
        'Currently recording: please call .pause() first, or call .save(true) to force'
      );
    }
    this.log('Exporting ...');
    const exportData = await this._event('export');
    const packer = new WavPacker();
    const result = packer.pack(this.sampleRate, exportData.audio);
    return result;
  }

  /**
   * Ends the current recording session and saves the result
   * @returns {Promise<import('./wav_packer.js').WavPackerAudioType>}
   */
  async end() {
    if (this._endPromise) return this._endPromise;
    const endPromise = this._endInternal();
    this._endPromise = endPromise;
    try {
      return await endPromise;
    } finally {
      if (this._endPromise === endPromise) this._endPromise = null;
    }
  }

  async _endInternal() {
    this._lifecycleId++;
    this._flushPendingChunk();
    if (!this.processor || this.scriptProcessor) {
      this._removeForegroundResumeListener();
      this._stopTracks();
      this._disconnectAudioGraph();
      await this._closeContext();
      this._resetAudioGraph();
      return this._emptyAudioResult();
    }

    const _processor = this.processor;
    let exportData = null;

    try {
      this.log('Stopping ...');
      this._stopTracks();
      await this._event('stop');
      this.recording = false;

      this.log('Exporting ...');
      exportData = await this._event('export', {}, _processor);
    } catch {
      // Mobile browsers can suspend AudioWorklet message receipts in background.
      // Cleanup below is more important than preserving a local export here.
    } finally {
      this._removeForegroundResumeListener();
      this._stopTracks();
      this._disconnectAudioGraph();
      await this._closeContext();
      this._resetAudioGraph();
    }

    if (!exportData) return this._emptyAudioResult();

    const packer = new WavPacker();
    return packer.pack(this.sampleRate, exportData.audio);
  }

  /**
   * Performs a full cleanup of WavRecorder instance
   * Stops actively listening via microphone and removes existing listeners
   * @returns {Promise<true>}
   */
  async quit() {
    this.listenForDeviceChange(null);
    if (this.processor || this.scriptProcessor) {
      await this.end();
    }
    return true;
  }
}

globalThis.WavRecorder = WavRecorder;
