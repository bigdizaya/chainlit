export type AudioAttemptPhase =
  | 'preparing'
  | 'waiting_server'
  | 'waiting_first_chunk'
  | 'recording'
  | 'flushing'
  | 'stopping';

type AudioAttempt = {
  id: string;
  phase: AudioAttemptPhase;
  connectionTimer?: ReturnType<typeof setTimeout>;
};

const createAttemptId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

class AudioSessionController {
  private attempt: AudioAttempt | undefined;

  begin() {
    this.finish();
    const attempt = {
      id: createAttemptId(),
      phase: 'preparing' as AudioAttemptPhase
    };
    this.attempt = attempt;
    return attempt.id;
  }

  currentId() {
    return this.attempt?.id;
  }

  currentPhase() {
    return this.attempt?.phase;
  }

  isCurrent(id?: string) {
    return Boolean(id && this.attempt?.id === id);
  }

  transition(id: string, phase: AudioAttemptPhase) {
    if (!this.isCurrent(id) || this.attempt?.phase === 'stopping') return false;
    this.attempt!.phase = phase;
    return true;
  }

  beginStop(id: string) {
    if (!this.isCurrent(id) || this.attempt?.phase === 'stopping') return false;
    this.clearConnectionTimeout(id);
    this.attempt!.phase = 'stopping';
    return true;
  }

  beginFlush(id: string) {
    if (!this.isCurrent(id) || this.attempt?.phase !== 'recording')
      return false;
    this.attempt.phase = 'flushing';
    return true;
  }

  armConnectionTimeout(
    id: string,
    callback: () => unknown | Promise<unknown>,
    timeoutMs = 12000
  ) {
    if (!this.isCurrent(id)) return false;
    this.clearConnectionTimeout(id);
    this.attempt!.connectionTimer = setTimeout(() => {
      if (!this.isCurrent(id)) return;
      delete this.attempt!.connectionTimer;
      void callback();
    }, timeoutMs);
    return true;
  }

  clearConnectionTimeout(id: string) {
    if (!this.isCurrent(id) || !this.attempt?.connectionTimer) return false;
    clearTimeout(this.attempt.connectionTimer);
    delete this.attempt.connectionTimer;
    return true;
  }

  finish(id?: string) {
    if (id && !this.isCurrent(id)) return false;
    if (this.attempt?.connectionTimer) {
      clearTimeout(this.attempt.connectionTimer);
    }
    this.attempt = undefined;
    return true;
  }
}

export const audioSessionController = new AudioSessionController();
export { AudioSessionController };
