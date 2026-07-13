import { cn, hasMessage } from '@/lib/utils';
import {
  MutableRefObject,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  ChainlitContext,
  FileSpec,
  useChatMessages,
  useChatSession,
  useConfig
} from '@chainlit/react-client';

import { Logo } from '@/components/Logo';
import { Markdown } from '@/components/Markdown';

import MessageComposer from './MessageComposer';
import Starters from './Starters';

interface Props {
  fileSpec: FileSpec;
  onFileUpload: (payload: File[]) => void;
  onFileUploadError: (error: string) => void;
  autoScrollRef: MutableRefObject<boolean>;
}

export default function WelcomeScreen(props: Props) {
  const apiClient = useContext(ChainlitContext);
  const { config } = useConfig();
  const { chatProfile } = useChatSession();
  const { messages } = useChatMessages();
  const [isVisible, setIsVisible] = useState(false);

  const chatProfiles = config?.chatProfiles;

  const allowHtml = config?.features?.unsafe_allow_html;
  const latex = config?.features?.latex;

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const logo = useMemo(() => {
    if (chatProfile && chatProfiles) {
      const currentChatProfile = chatProfiles.find(
        (cp) => cp.name === chatProfile
      );
      if (currentChatProfile?.icon) {
        return (
          <div className="flex flex-col gap-2 mb-2 items-center">
            <img
              className="h-16 w-16 rounded-full"
              src={
                currentChatProfile?.icon.startsWith('/public')
                  ? apiClient.buildEndpoint(currentChatProfile?.icon)
                  : currentChatProfile?.icon
              }
            />
            {currentChatProfile?.markdown_description ? (
              <Markdown
                allowHtml={allowHtml}
                latex={latex}
                renderMarkdown={true}
              >
                {currentChatProfile.markdown_description}
              </Markdown>
            ) : null}
          </div>
        );
      }
    }

    return <Logo className="bayyan-welcome-logo" />;
  }, [chatProfiles, chatProfile]);

  if (hasMessage(messages)) return null;

  return (
    <div
      id="welcome-screen"
      className={cn(
        'bayyan-welcome-screen flex flex-col w-full flex-grow items-stretch justify-start welcome-screen mx-auto transition-opacity duration-500 opacity-0 delay-100',
        isVisible && 'opacity-100'
      )}
    >
      <div className="bayyan-welcome-brand">{logo}</div>
      <div className="bayyan-welcome-copy">
        <p>RECHERCHE DOCUMENTAIRE</p>
        <h1>Que souhaitez-vous éclaircir&nbsp;?</h1>
        <span>
          Interrogez la bibliothèque et retrouvez les passages utilisés dans
          chaque réponse.
        </span>
      </div>
      <MessageComposer {...props} />
      <Starters />
    </div>
  );
}
