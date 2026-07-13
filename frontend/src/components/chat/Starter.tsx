import { ArrowRight } from 'lucide-react';
import { useCallback, useContext } from 'react';
import { useRecoilValue } from 'recoil';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import {
  ChainlitContext,
  IStarter,
  IStep,
  modesState,
  useAuth,
  useChatData,
  useChatInteract
} from '@chainlit/react-client';

import { Button } from '@/components/ui/button';

import { persistentCommandState } from '@/state/chat';

import { syncStoredResponseLevel } from './MessageComposer/ResponseLevelPicker';

interface StarterProps {
  starter: IStarter;
}

export default function Starter({ starter }: StarterProps) {
  const apiClient = useContext(ChainlitContext);
  const selectedCommand = useRecoilValue(persistentCommandState);
  const modes = useRecoilValue(modesState);
  const { sendMessage } = useChatInteract();
  const { loading, connected } = useChatData();
  const { user } = useAuth();

  const disabled = loading || !connected;

  const onSubmit = useCallback(async () => {
    try {
      await syncStoredResponseLevel();
    } catch {
      toast.error(
        "Le mode de réponse n'a pas pu être confirmé. Réessayez dans un instant."
      );
      return;
    }

    // Build modes dict: only include modes that have selections
    // (same logic as MessageComposer)
    const modesDict: Record<string, string> = {};
    modes.forEach((mode) => {
      const defaultOpt = mode.options.find((opt) => opt.default);
      const selectedId = defaultOpt?.id || mode.options[0]?.id;
      if (selectedId) {
        modesDict[mode.id] = selectedId;
      }
    });

    const message: IStep = {
      threadId: '',
      id: uuidv4(),
      command: starter.command ?? selectedCommand?.id,
      modes: Object.keys(modesDict).length > 0 ? modesDict : undefined,
      name: user?.identifier || 'User',
      type: 'user_message',
      output: starter.message,
      createdAt: new Date().toISOString(),
      metadata: { location: window.location.href }
    };

    sendMessage(message, []);
  }, [user, selectedCommand, modes, sendMessage, starter]);

  return (
    <Button
      id={`starter-${starter.label.trim().toLowerCase().replaceAll(' ', '-')}`}
      variant="outline"
      className="bayyan-starter w-fit justify-start rounded-3xl"
      disabled={disabled}
      onClick={onSubmit}
    >
      <div className="flex w-full items-center gap-2">
        {starter.icon ? (
          <img
            className="h-5 w-5 rounded-md"
            src={
              starter.icon?.startsWith('/public')
                ? apiClient.buildEndpoint(starter.icon)
                : starter.icon
            }
            alt={starter.label}
          />
        ) : null}
        <p className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground">
          {starter.label}
        </p>
        <ArrowRight className="bayyan-starter__arrow size-4 shrink-0" />
      </div>
    </Button>
  );
}
