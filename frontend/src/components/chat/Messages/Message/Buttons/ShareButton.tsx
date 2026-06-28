import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface Props {
  content: unknown;
}

function labels() {
  const lang = (navigator.language || 'en').split('-')[0].toLowerCase();
  if (lang === 'fr') {
    return {
      button: 'Partager',
      copied: 'Texte copie pour partage',
      error: 'Impossible de partager cette reponse.'
    };
  }
  if (lang === 'ar') {
    return {
      button: 'مشاركة',
      copied: 'تم نسخ النص للمشاركة',
      error: 'تعذرت مشاركة هذه الإجابة.'
    };
  }
  return {
    button: 'Share',
    copied: 'Text copied for sharing',
    error: 'Unable to share this answer.'
  };
}

function textFromContent(content: unknown) {
  const text =
    typeof content === 'object'
      ? JSON.stringify(content, null, 2)
      : String(content);
  return text.replace(/\s+\n/g, '\n').trim();
}

export default function MessageShareButton({ content }: Props) {
  const [sharing, setSharing] = useState(false);
  const text = textFromContent(content);
  const copy = labels();

  const share = async () => {
    if (!text || sharing) return;
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BAYYAN', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success(copy.copied);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        toast.success(copy.copied);
      } catch {
        toast.error(copy.error);
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={share}
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={copy.button}
            disabled={sharing}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copy.button}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
