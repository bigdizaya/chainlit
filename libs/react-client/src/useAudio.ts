import { useCallback } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { toast } from 'sonner';

import { audioSessionController } from './audioSessionController';
import {
  audioConnectionState,
  isAiSpeakingState,
  wavRecorderState,
  wavStreamPlayerState
} from './state';
import { useChatInteract } from './useChatInteract';

const useAudio = () => {
  const [audioConnection, setAudioConnection] =
    useRecoilState(audioConnectionState);
  const wavRecorder = useRecoilValue(wavRecorderState);
  const wavStreamPlayer = useRecoilValue(wavStreamPlayerState);
  const isAiSpeaking = useRecoilValue(isAiSpeakingState);

  const { startAudioStream, endAudioStream, cancelAudioStream } =
    useChatInteract();

  const stopLocalAudio = useCallback(async () => {
    try {
      await wavRecorder.end();
    } catch {
      // Best-effort cleanup. The recorder handles stale mobile audio contexts.
    }
    try {
      if (typeof wavStreamPlayer.close === 'function') {
        await wavStreamPlayer.close();
      } else {
        await wavStreamPlayer.interrupt();
      }
    } catch {
      // The player may already be disconnected.
    }
  }, [wavRecorder, wavStreamPlayer]);

  const cancelAttempt = useCallback(
    async (recordingId: string, reason: string, message?: string) => {
      if (!audioSessionController.beginStop(recordingId)) return false;
      await stopLocalAudio();
      cancelAudioStream(recordingId, reason);
      audioSessionController.finish(recordingId);
      setAudioConnection('off');
      if (message) toast.warning(message);
      return true;
    },
    [cancelAudioStream, setAudioConnection, stopLocalAudio]
  );

  const startConversation = useCallback(async () => {
    if (audioConnection !== 'off') return false;

    const staleAttemptId = audioSessionController.currentId();
    if (staleAttemptId && audioSessionController.beginStop(staleAttemptId)) {
      await stopLocalAudio();
      cancelAudioStream(staleAttemptId, 'superseded_local_attempt');
      audioSessionController.finish(staleAttemptId);
    }
    if (
      typeof wavRecorder.getStatus === 'function' &&
      wavRecorder.getStatus() !== 'ended'
    ) {
      await stopLocalAudio();
    }

    const recordingId = audioSessionController.begin();
    setAudioConnection('connecting');

    try {
      // begin() is invoked directly from the user gesture. It creates the
      // AudioContext and requests getUserMedia before yielding control.
      await wavRecorder.begin();
    } catch {
      if (audioSessionController.isCurrent(recordingId)) {
        await stopLocalAudio();
        audioSessionController.finish(recordingId);
        setAudioConnection('off');
        toast.error(
          'Le microphone n’a pas pu démarrer. Vérifiez son autorisation puis réessayez.'
        );
      }
      return false;
    }

    if (!audioSessionController.isCurrent(recordingId)) {
      await stopLocalAudio();
      return false;
    }

    audioSessionController.transition(recordingId, 'waiting_server');
    if (!startAudioStream(recordingId)) {
      await cancelAttempt(
        recordingId,
        'socket_unavailable',
        'La connexion au serveur est indisponible. Réessayez dans un instant.'
      );
      return false;
    }

    audioSessionController.armConnectionTimeout(recordingId, () =>
      cancelAttempt(
        recordingId,
        'connection_timeout',
        'Le microphone met trop de temps à se connecter. Réessayez.'
      )
    );
    return true;
  }, [
    audioConnection,
    cancelAudioStream,
    cancelAttempt,
    setAudioConnection,
    startAudioStream,
    stopLocalAudio,
    wavRecorder
  ]);

  const endConversation = useCallback(async () => {
    const recordingId = audioSessionController.currentId();
    if (!recordingId) return false;
    const phase = audioSessionController.currentPhase();

    if (phase === 'flushing' || phase === 'stopping') return false;
    if (phase !== 'recording') {
      return cancelAttempt(recordingId, 'user_cancelled_before_audio');
    }

    if (!audioSessionController.beginFlush(recordingId)) return false;
    setAudioConnection('connecting');
    try {
      await wavRecorder.pause();
    } catch {
      // The final partial buffer is best-effort if mobile audio was suspended.
    }
    if (!audioSessionController.beginStop(recordingId)) return false;
    await stopLocalAudio();
    endAudioStream(recordingId);
    return true;
  }, [
    cancelAttempt,
    endAudioStream,
    setAudioConnection,
    stopLocalAudio,
    wavRecorder
  ]);

  return {
    startConversation,
    endConversation,
    audioConnection,
    isAiSpeaking,
    wavRecorder,
    wavStreamPlayer
  };
};

export { useAudio };
