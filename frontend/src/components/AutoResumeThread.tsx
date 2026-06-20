import {
  isBayyanSessionStale,
  redirectToBayyanFreshChat
} from '@/lib/bayyanInactivity';
import { useEffect } from 'react';
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
  const [resumeThreadError, setResumeThreadError] = useRecoilState(
    resumeThreadErrorState
  );

  useEffect(() => {
    if (!config?.threadResumable) return;

    if (isBayyanSessionStale()) {
      // Inactivité > 30min → nouvelle conversation
      clear();
      redirectToBayyanFreshChat();
      return;
    }

    // Inactivité < 30min → reprendre normalement
    clear();
    setIdToResume(id);
    if (!config?.dataPersistence) {
      navigate('/');
    }
  }, [clear, config?.dataPersistence, config?.threadResumable, id, navigate]);

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
      toast.error("Couldn't resume chat: " + resumeThreadError);
      navigate('/');
      setResumeThreadError(undefined);
    }
  }, [navigate, resumeThreadError, setResumeThreadError]);

  return null;
}
