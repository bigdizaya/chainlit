import { cn } from '@/lib/utils';
import { Mic, Square } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';

import { useAudio, useConfig } from '@chainlit/react-client';

import AudioPresence from '@/components/AudioPresence';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Translator } from 'components/i18n';

import { Loader } from '../../Loader';
import { Button } from '../../ui/button';

interface Props {
  disabled?: boolean;
}

const VoiceButton = ({ disabled }: Props) => {
  const { config } = useConfig();
  const { startConversation, endConversation, audioConnection } = useAudio();
  const isEnabled = !!config?.features.audio.enabled;

  useHotkeys(
    'p',
    () => {
      if (!isEnabled) return;

      // Double-check at execution time that we're not in a form field
      const getDeepActiveElement = (): Element | null => {
        let activeElement = document.activeElement;
        while (
          activeElement &&
          activeElement.shadowRoot &&
          activeElement.shadowRoot.activeElement
        ) {
          activeElement = activeElement.shadowRoot.activeElement;
        }
        return activeElement;
      };

      const activeElement = getDeepActiveElement();
      if (activeElement) {
        const tagName = activeElement.tagName.toLowerCase();
        const isFormField = ['input', 'textarea', 'select'].includes(tagName);
        const isContentEditable =
          activeElement.getAttribute('contenteditable') === 'true';

        if (isFormField || isContentEditable) {
          return; // Don't execute the hotkey
        }
      }

      if (audioConnection === 'on') return endConversation();
      if (audioConnection === 'off') return startConversation();
    },
    {
      enableOnFormTags: false,
      preventDefault: false // Don't prevent default - let letters be typed
    },
    [isEnabled, audioConnection, startConversation, endConversation]
  );

  if (!isEnabled) return null;

  const buttonLabel =
    audioConnection === 'on'
      ? 'Stop recording'
      : audioConnection === 'connecting'
      ? 'Connecting microphone'
      : 'Start recording';

  return (
    <div className="flex items-center gap-1">
      {audioConnection === 'on' ? (
        <AudioPresence
          type="client"
          height={18}
          width={36}
          barCount={4}
          barSpacing={2}
        />
      ) : null}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={buttonLabel}
              aria-pressed={audioConnection === 'on'}
              disabled={disabled || audioConnection === 'connecting'}
              variant="ghost"
              size="icon"
              className={cn(
                'rounded-full transition-colors',
                audioConnection === 'on'
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive'
                  : audioConnection === 'connecting'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              onClick={
                audioConnection === 'on'
                  ? endConversation
                  : audioConnection === 'off'
                  ? startConversation
                  : undefined
              }
            >
              {audioConnection === 'on' ? (
                <Square className="!size-4" fill="currentColor" />
              ) : null}
              {audioConnection === 'off' ? (
                <Mic className="!size-5" />
              ) : null}
              {audioConnection === 'connecting' ? (
                <Loader className="!size-5" />
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              <Translator
                path={
                  audioConnection === 'on'
                    ? 'chat.speech.stop'
                    : audioConnection === 'off'
                    ? 'chat.speech.start'
                    : 'chat.speech.connecting'
                }
                suffix=" (P)"
              />
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
export default VoiceButton;
