import {
  consumeBayyanExplicitThreadResume,
  isBayyanSessionStale,
  markBayyanActivity,
  redirectToBayyanFreshChat
} from '@/lib/bayyanInactivity';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { toast } from 'sonner';

import {
  resumeThreadErrorState,
  useChatInteract,
  useChatSession,
  useConfig
} from '@chainlit/react-client';

interface Props {
  id: string;
}

export default function AutoResumeThread({ id }: Props) {
  const navigate = useNavigate();
  const { config } = useConfig();
  const { clear, setIdToResume } = useChatInteract();
  const { session, idToResume } = useChatSession();
  const clearRef = useRef(clear);
  const setIdToResumeRef = useRef(setIdToResume);
  const lastResumeIdRef = useRef<string>();
  const [resumeThreadError, setResumeThreadError] = useRecoilState(
    resumeThreadErrorState
  );

  useEffect(() => {
    clearRef.current = clear;
  }, [clear]);

  useEffect(() => {
    setIdToResumeRef.current = setIdToResume;
  }, [setIdToResume]);

  useEffect(() => {
    if (!config?.threadResumable) return;
    if (lastResumeIdRef.current === id) return;
    lastResumeIdRef.current = id;

    const explicitResume = consumeBayyanExplicitThreadResume(id);
    if (isBayyanSessionStale() && !explicitResume) {
      redirectToBayyanFreshChat();
      return;
    }

    // A real click on a past thread is an explicit user action. It must resume
    // the selected conversation even if the app would otherwise start fresh
    // after inactivity.
    markBayyanActivity();
    clearRef.current();
    setIdToResumeRef.current(id);
    if (!config?.dataPersistence) {
      navigate('/');
    }
  }, [config?.dataPersistence, config?.threadResumable, id, navigate]);

  useEffect(() => {
    if (id !== idToResume) {
      return;
    }
    if (session?.error) {
      toast.error("Couldn't resume chat");
      navigate('/');
    }
  }, [id, idToResume, navigate, session]);

  useEffect(() => {
    if (resumeThreadError) {
      clearRef.current();
      setResumeThreadError(undefined);
      redirectToBayyanFreshChat();
    }
  }, [resumeThreadError, setResumeThreadError]);

  return null;
}
