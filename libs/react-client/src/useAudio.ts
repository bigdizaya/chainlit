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
import {
  type BayyanLocale,
  useBayyanLocale
} from './utils/bayyanLocale';

type BayyanAudioMessageKey =
  | 'startPermission'
  | 'serverUnavailable'
  | 'connectionTimeout'
  | 'blockedOrUnavailable'
  | 'browserUnsupported'
  | 'startGeneric'
  | 'noAudioReceived';

const BAYYAN_AUDIO_MESSAGES: Record<
  BayyanLocale,
  Record<BayyanAudioMessageKey, string>
> = {
  fr: {
    startPermission:
      'Le microphone n’a pas pu démarrer. Vérifiez son autorisation puis réessayez.',
    serverUnavailable:
      'La connexion au serveur est indisponible. Réessayez dans un instant.',
    connectionTimeout:
      'Le microphone met trop de temps à se connecter. Réessayez.',
    blockedOrUnavailable:
      'Le microphone est bloqué ou indisponible. Vérifiez son autorisation puis réessayez.',
    browserUnsupported:
      'Le microphone n’a pas pu démarrer dans ce navigateur. Fermez puis rouvrez l’application.',
    startGeneric: 'Le microphone n’a pas pu démarrer. Veuillez réessayer.',
    noAudioReceived:
      'Le microphone est ouvert, mais aucun son n’arrive. Vérifiez le micro puis réessayez.'
  },
  ar: {
    startPermission:
      'تعذّر تشغيل الميكروفون. تحقّق من منحه الإذن ثم أعد المحاولة.',
    serverUnavailable:
      'تعذّر الاتصال بالخادم. أعد المحاولة بعد قليل.',
    connectionTimeout:
      'يستغرق اتصال الميكروفون وقتًا أطول من المتوقع. أعد المحاولة.',
    blockedOrUnavailable:
      'الميكروفون محظور أو غير متاح. تحقّق من منحه الإذن ثم أعد المحاولة.',
    browserUnsupported:
      'تعذّر تشغيل الميكروفون في هذا المتصفح. أغلق التطبيق ثم افتحه من جديد.',
    startGeneric: 'تعذّر تشغيل الميكروفون. أعد المحاولة.',
    noAudioReceived:
      'الميكروفون مفتوح، لكن لا يصل أي صوت. تحقّق من الميكروفون ثم أعد المحاولة.'
  },
  en: {
    startPermission:
      'The microphone could not start. Check its permission and try again.',
    serverUnavailable:
      'The server connection is unavailable. Please try again shortly.',
    connectionTimeout:
      'The microphone is taking too long to connect. Please try again.',
    blockedOrUnavailable:
      'The microphone is blocked or unavailable. Check its permission and try again.',
    browserUnsupported:
      'The microphone could not start in this browser. Close and reopen the app.',
    startGeneric: 'The microphone could not start. Please try again.',
    noAudioReceived:
      'The microphone is open, but no audio is coming through. Check the microphone and try again.'
  },
  es: {
    startPermission:
      'No se pudo iniciar el micrófono. Compruebe el permiso e inténtelo de nuevo.',
    serverUnavailable:
      'La conexión con el servidor no está disponible. Inténtelo de nuevo en unos instantes.',
    connectionTimeout:
      'El micrófono está tardando demasiado en conectarse. Inténtelo de nuevo.',
    blockedOrUnavailable:
      'El micrófono está bloqueado o no está disponible. Compruebe el permiso e inténtelo de nuevo.',
    browserUnsupported:
      'No se pudo iniciar el micrófono en este navegador. Cierre y vuelva a abrir la aplicación.',
    startGeneric: 'No se pudo iniciar el micrófono. Inténtelo de nuevo.',
    noAudioReceived:
      'El micrófono está abierto, pero no llega ningún sonido. Compruebe el micrófono e inténtelo de nuevo.'
  }
};

export function getBayyanAudioMessage(
  locale: BayyanLocale,
  key: BayyanAudioMessageKey
) {
  return BAYYAN_AUDIO_MESSAGES[locale][key];
}

const useAudio = () => {
  const { locale } = useBayyanLocale();
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
        toast.error(getBayyanAudioMessage(locale, 'startPermission'));
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
        getBayyanAudioMessage(locale, 'serverUnavailable')
      );
      return false;
    }

    audioSessionController.armConnectionTimeout(recordingId, () =>
      cancelAttempt(
        recordingId,
        'connection_timeout',
        getBayyanAudioMessage(locale, 'connectionTimeout')
      )
    );
    return true;
  }, [
    audioConnection,
    cancelAudioStream,
    cancelAttempt,
    locale,
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
