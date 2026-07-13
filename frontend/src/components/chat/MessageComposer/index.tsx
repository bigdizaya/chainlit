import { cn, hasMessage } from '@/lib/utils';
import {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import {
  FileSpec,
  IStep,
  commandsState,
  useAuth,
  useChatData,
  useChatInteract,
  useChatMessages
} from '@chainlit/react-client';
import type { IMode, IModeOption } from '@chainlit/react-client';
import { modesState } from '@chainlit/react-client';

import { useTranslation } from 'components/i18n/Translator';

import { useQuery } from '@/hooks/query';
import { useIsMobile } from '@/hooks/use-mobile';

import {
  IAttachment,
  attachmentsState,
  persistentCommandState
} from 'state/chat';

import { Attachments } from './Attachments';
import CommandButtons from './CommandButtons';
import CommandButton from './CommandPopoverButton';
import FavoriteButton from './FavoriteButton';
import Input, { InputMethods } from './Input';
import McpButton from './Mcp';
import ModePicker from './ModePicker';
import ResponseLevelPicker, {
  syncStoredResponseLevel
} from './ResponseLevelPicker';
import SubmitButton from './SubmitButton';
import UploadButton from './UploadButton';
import VoiceButton from './VoiceButton';

interface Props {
  fileSpec: FileSpec;
  onFileUpload: (payload: File[]) => void;
  onFileUploadError: (error: string) => void;
  autoScrollRef: MutableRefObject<boolean>;
}

export default function MessageComposer({
  fileSpec,
  onFileUpload,
  onFileUploadError,
  autoScrollRef
}: Props) {
  const inputRef = useRef<InputMethods>(null);
  const [value, setValue] = useState('');
  const valueRef = useRef(value);
  const draftInputTypeRef = useRef<'audio' | undefined>();
  const [selectedCommand, setSelectedCommand] = useRecoilState(
    persistentCommandState
  );
  const commands = useRecoilValue(commandsState);
  // Pre-select the command marked as selected by the backend
  useEffect(() => {
    const defaultSelected = commands.find((c) => c.selected);
    if (defaultSelected && !selectedCommand) {
      setSelectedCommand(defaultSelected);
    }
  }, [commands]);
  const [attachments, setAttachments] = useRecoilState(attachmentsState);
  const { t } = useTranslation();
  const { messages } = useChatMessages();
  const hasConversation = hasMessage(messages);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const { user } = useAuth();
  const { sendMessage, replyMessage } = useChatInteract();
  const { askUser, disabled: _disabled } = useChatData();

  const disabled =
    _disabled || submitting || !!attachments.find((a) => !a.uploaded);

  const isMobile = useIsMobile();

  // Get/set available modes from state - selections are tracked via the 'default' flag on options
  const [modes, setModes] = useRecoilState(modesState);

  const handleModeSelect = useCallback(
    (modeId: string, optionId: string) => {
      setModes((prevModes) =>
        prevModes.map((mode) => {
          if (mode.id !== modeId) return mode;
          return {
            ...mode,
            options: mode.options.map((opt: IModeOption) => ({
              ...opt,
              default: opt.id === optionId
            }))
          };
        })
      );
    },
    [setModes]
  );

  // Helper to get selected option for a mode (the one with default=true, or first option)
  const getSelectedOptionId = useCallback((mode: IMode): string | undefined => {
    const defaultOpt = mode.options.find((opt) => opt.default);
    return defaultOpt?.id || mode.options[0]?.id;
  }, []);

  let promptValue = '';
  try {
    const query = useQuery();
    promptValue = query.get('prompt') || '';
  } catch {
    console.warn('Could not parse query parameters');
  }

  const [promptUsed, setPromptUsed] = useState(false);

  const onInputChange = useCallback((nextValue: string) => {
    valueRef.current = nextValue;
    setValue(nextValue);
    if (!nextValue.trim()) {
      draftInputTypeRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    const handleAudioDraftMessage = (event: Event) => {
      const data = event instanceof CustomEvent ? event.detail : undefined;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'bayyan_audio_transcription_error') {
        toast.error(
          data.message || 'La transcription vocale a échoué. Réessayez.'
        );
        return;
      }

      if (data.type === 'bayyan_audio_transcription_empty') {
        toast.warning(data.message || "Aucun texte vocal n'a été détecté.");
        return;
      }

      if (data.type !== 'bayyan_audio_transcription_draft') return;

      const transcript = typeof data.text === 'string' ? data.text.trim() : '';
      if (!transcript) return;

      const currentValue = valueRef.current;
      const separator =
        currentValue.trim() && !/[ \n]$/.test(currentValue) ? ' ' : '';
      const nextValue = `${currentValue}${separator}${transcript}`;

      valueRef.current = nextValue;
      draftInputTypeRef.current = 'audio';
      inputRef.current?.setValueExtern(nextValue, { focus: true });
    };

    window.addEventListener('chainlit:window_message', handleAudioDraftMessage);
    return () =>
      window.removeEventListener(
        'chainlit:window_message',
        handleAudioDraftMessage
      );
  }, []);

  const onFavoriteSelect = useCallback((content: string) => {
    draftInputTypeRef.current = undefined;
    setValue(content);
    if (inputRef.current) {
      inputRef.current.setValueExtern(content);
    }
  }, []);

  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      if (event.clipboardData && event.clipboardData.items) {
        const items = Array.from(event.clipboardData.items);

        // If no text data, check for files (e.g., images)
        items.forEach((item) => {
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              onFileUpload([file]);
            }
          }
        });
      }
    },
    [onFileUpload]
  );

  const onSubmit = useCallback(
    async (
      msg: string,
      attachments?: IAttachment[],
      selectedCommand?: string
    ) => {
      await syncStoredResponseLevel();

      // Build modes dict: only include modes that have selections
      const modesDict: Record<string, string> = {};
      modes.forEach((mode) => {
        const selectedId = getSelectedOptionId(mode);
        if (selectedId) {
          modesDict[mode.id] = selectedId;
        }
      });

      const message: IStep = {
        threadId: '',
        command: selectedCommand,
        modes: Object.keys(modesDict).length > 0 ? modesDict : undefined,
        id: uuidv4(),
        name: user?.identifier || 'User',
        type: 'user_message',
        output: msg,
        createdAt: new Date().toISOString(),
        metadata: {
          location: window.location.href,
          input_type: draftInputTypeRef.current === 'audio' ? 'audio' : 'text'
        }
      };

      const fileReferences = attachments
        ?.filter((a) => !!a.serverId)
        .map((a) => ({ id: a.serverId! }));

      if (autoScrollRef) {
        autoScrollRef.current = true;
      }
      return sendMessage(message, fileReferences);
    },
    [user, sendMessage, autoScrollRef, modes, getSelectedOptionId]
  );

  const onReply = useCallback(
    (msg: string) => {
      const message: IStep = {
        threadId: '',
        id: uuidv4(),
        name: user?.identifier || 'User',
        type: 'user_message',
        output: msg,
        createdAt: new Date().toISOString(),
        metadata: {
          location: window.location.href,
          input_type: draftInputTypeRef.current === 'audio' ? 'audio' : 'text'
        }
      };

      replyMessage(message);
      if (autoScrollRef) {
        autoScrollRef.current = true;
      }
      return true;
    },
    [user, replyMessage, autoScrollRef]
  );

  const submit = useCallback(async () => {
    const currentValue = valueRef.current;

    if (
      disabled ||
      (currentValue.trim() === '' &&
        attachments.length === 0 &&
        !selectedCommand)
    ) {
      return;
    }

    setSubmitting(true);
    let sent = false;

    try {
      sent = askUser
        ? onReply(currentValue)
        : await onSubmit(currentValue, attachments, selectedCommand?.id);
    } catch {
      toast.error(
        "Le mode de réponse n'a pas pu être confirmé. Réessayez dans un instant."
      );
      return;
    } finally {
      setSubmitting(false);
    }

    if (!sent) {
      return;
    }

    setAttachments([]);
    valueRef.current = '';
    draftInputTypeRef.current = undefined;
    setValue(''); // Clear the value state
    inputRef.current?.reset();
  }, [
    disabled,
    askUser,
    attachments,
    selectedCommand,
    setAttachments,
    onSubmit,
    onReply
  ]);

  useEffect(() => {
    if (inputRef.current && promptValue && !promptUsed) {
      const prompt = promptValue;
      if (prompt) {
        if (prompt.length > 1000) {
          inputRef.current?.setValueExtern(prompt.slice(0, 1000));
        } else {
          inputRef.current?.setValueExtern(prompt);
        }
        setPromptUsed(true);
      }
    }
  }, [promptValue, promptUsed]);

  return (
    <div
      id="message-composer"
      className={cn(
        'bayyan-message-composer bg-accent dark:bg-card rounded-3xl p-3 px-4 w-full min-h-24 flex flex-col',
        hasConversation ? 'is-conversation' : 'is-welcome'
      )}
    >
      {attachments.length > 0 ? (
        <div className="mb-1">
          <Attachments />
        </div>
      ) : null}
      <Input
        ref={inputRef}
        id="chat-input"
        autoFocus={!isMobile}
        selectedCommand={selectedCommand}
        setSelectedCommand={setSelectedCommand}
        onChange={onInputChange}
        onPaste={onPaste}
        onEnter={submit}
        placeholder={t('chat.input.placeholder')}
      />
      {!hasConversation ? (
        <div className="bayyan-welcome-controls">
          <ResponseLevelPicker disabled={disabled} />
          <div className="bayyan-welcome-actions">
            <div className="bayyan-welcome-utilities">
              <VoiceButton disabled={disabled} />
              <UploadButton
                disabled={disabled}
                fileSpec={fileSpec}
                onFileUploadError={onFileUploadError}
                onFileUpload={onFileUpload}
              />
            </div>
            <SubmitButton
              onSubmit={submit}
              disabled={
                disabled ||
                (!value.trim() && !selectedCommand && attachments.length === 0)
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center -ml-1.5">
            <VoiceButton disabled={disabled} />
            <UploadButton
              disabled={disabled}
              fileSpec={fileSpec}
              onFileUploadError={onFileUploadError}
              onFileUpload={onFileUpload}
            />
            <ResponseLevelPicker disabled={disabled} compact />
            <McpButton disabled={disabled} />
            {modes.map((mode) => (
              <ModePicker
                key={mode.id}
                mode={mode}
                disabled={disabled}
                selectedOptionId={getSelectedOptionId(mode)}
                onOptionSelect={handleModeSelect}
              />
            ))}
            <CommandButton
              disabled={disabled}
              selectedCommandId={selectedCommand?.id}
              onCommandSelect={setSelectedCommand}
            />
            <CommandButtons
              disabled={disabled}
              selectedCommandId={selectedCommand?.id}
              onCommandSelect={setSelectedCommand}
            />

            <FavoriteButton disabled={disabled} onSelect={onFavoriteSelect} />
          </div>
          <div className="flex items-center gap-1">
            <SubmitButton
              onSubmit={submit}
              disabled={
                disabled ||
                (!value.trim() && !selectedCommand && attachments.length === 0)
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
