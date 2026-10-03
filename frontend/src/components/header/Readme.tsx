import { useConfig } from '@chainlit/react-client';

import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Translator } from 'components/i18n';

import { useLayoutMaxWidth } from 'hooks/useLayoutMaxWidth';

interface ReadmeDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  children?: React.ReactNode;
}

/** The chainlit.md dialog; opened by the header button or the avatar menu. */
export function ReadmeDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  children
}: ReadmeDialogProps) {
  const { config } = useConfig();
  const layoutMaxWidth = useLayoutMaxWidth();

  if (!config?.markdown) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent
        className="flex flex-col h-screen w-screen max-w-screen max-h-screen border-none !rounded-none overflow-y-auto"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div
          className="mx-auto flex flex-col flex-grow gap-6"
          style={{
            maxWidth: layoutMaxWidth
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <Translator path="navigation.header.readme" />
            </DialogTitle>
          </DialogHeader>
          <Markdown
            className="flex flex-col flex-grow overflow-y-auto"
            allowHtml={config?.features?.unsafe_allow_html}
            latex={config?.features?.latex}
            renderMarkdown={true}
          >
            {config.markdown}
          </Markdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReadmeButton() {
  return (
    <ReadmeDialog>
      <Button id="readme-button" variant="ghost">
        <Translator path="navigation.header.readme" />
      </Button>
    </ReadmeDialog>
  );
}
