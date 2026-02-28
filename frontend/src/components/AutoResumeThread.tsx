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

    // Vérifier l'inactivité avant de reprendre le thread
    const INACTIVITY_KEY = 'jawab_last_activity';
    const THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    const lastActivity = parseInt(
      localStorage.getItem(INACTIVITY_KEY) || '0',
      10
    );
    const now = Date.now();

    if (lastActivity > 0 && now - lastActivity > THRESHOLD_MS) {
      // Inactivité > 30min → nouvelle conversation
      clear();
      navigate('/');
      return;
    }

    // Inactivité < 30min → reprendre normalement
    clear();
    setIdToResume(id);
    if (!config?.dataPersistence) {
      navigate('/');
    }
  }, [config?.threadResumable, id]);

  useEffect(() => {
    if (id !== idToResume) {
      return;
    }
    if (session?.error) {
      toast.error("Couldn't resume chat");
      navigate('/');
    }
  }, [session, idToResume, id]);

  useEffect(() => {
    if (resumeThreadError) {
      toast.error("Couldn't resume chat: " + resumeThreadError);
      navigate('/');
      setResumeThreadError(undefined);
    }
  }, [resumeThreadError]);

  return null;
}
