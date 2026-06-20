import { useCallback, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';

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

  const { startAudioStream, endAudioStream } = useChatInteract();

  const stopLocalAudio = useCallback(async () => {
    setAudioConnection('off');
    try {
      await wavRecorder.end();
    } catch {
      // Best-effort cleanup. The recorder handles stale mobile audio contexts.
    }
    try {
      await wavStreamPlayer.interrupt();
    } catch {
      // The player may already be disconnected.
    }
  }, [setAudioConnection, wavRecorder, wavStreamPlayer]);

  const startConversation = useCallback(async () => {
    if (
      typeof wavRecorder.getStatus === 'function' &&
      wavRecorder.getStatus() !== 'ended'
    ) {
      await stopLocalAudio();
    }
    setAudioConnection('connecting');
    await startAudioStream();
  }, [setAudioConnection, startAudioStream, stopLocalAudio, wavRecorder]);

  const endConversation = useCallback(async () => {
    await stopLocalAudio();
    await endAudioStream();
  }, [endAudioStream, stopLocalAudio]);

  useEffect(() => {
    if (audioConnection !== 'connecting') return;

    const timeout = window.setTimeout(() => {
      setAudioConnection('off');
    }, 12000);

    return () => window.clearTimeout(timeout);
  }, [audioConnection, setAudioConnection]);

  useEffect(() => {
    const stopIfActive = () => {
      const shouldNotifyServer = audioConnection !== 'off';
      const recorderStatus =
        typeof wavRecorder.getStatus === 'function'
          ? wavRecorder.getStatus()
          : 'ended';

      if (!shouldNotifyServer && recorderStatus === 'ended') return;

      void stopLocalAudio().finally(() => {
        if (shouldNotifyServer) {
          endAudioStream();
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopIfActive();
        return;
      }

      if (audioConnection === 'off') {
        stopIfActive();
      } else if (
        audioConnection === 'on' &&
        typeof wavRecorder.resume === 'function'
      ) {
        void wavRecorder.resume().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopIfActive);
    window.addEventListener('pageshow', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', stopIfActive);
      window.removeEventListener('pageshow', handleVisibilityChange);
    };
  }, [
    audioConnection,
    endAudioStream,
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
