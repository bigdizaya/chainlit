import { apiClient } from '@/api';
import {
  BookOpen,
  Bug,
  ExternalLink,
  Heart,
  Library,
  Lightbulb,
  UserRound
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@chainlit/react-client';

import Translator, { useTranslation } from '@/components/i18n/Translator';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';

type Category = 'book' | 'scholar' | 'suggestion' | 'bug';

export default function FeedbackButton() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<Category>('suggestion');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const locale = i18n.language?.startsWith('ar')
    ? 'ar'
    : i18n.language?.startsWith('fr')
    ? 'fr'
    : i18n.language?.startsWith('es')
    ? 'es'
    : 'en';

  const libraryUrl = `https://jawabdeen.com/${locale}/bibliotheque`;

  function openDialog(cat: Category) {
    setCategory(cat);
    setText('');
    setIsOpen(true);
  }

  const handleSubmit = async () => {
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/api/feedback', {
        text: text.trim(),
        category
      });
      const data = await res.json();
      if (data.success) {
        toast.success(<Translator path="contribute.dialog.success" />);
        setText('');
        setIsOpen(false);
      } else {
        toast.error(data.message || 'Error');
      }
    } catch {
      toast.error(<Translator path="contribute.dialog.error" />);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default" size="sm" className="rounded-full gap-1.5">
            <Heart className="!size-4" />
            <span className="hidden sm:inline">
              <Translator path="contribute.button" />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <Translator path="contribute.menu.title" />
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openDialog('book')}>
            <BookOpen className="mr-2 !size-4" />
            <Translator path="contribute.menu.book" />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog('scholar')}>
            <UserRound className="mr-2 !size-4" />
            <Translator path="contribute.menu.scholar" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openDialog('suggestion')}>
            <Lightbulb className="mr-2 !size-4" />
            <Translator path="contribute.menu.feedback" />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog('bug')}>
            <Bug className="mr-2 !size-4" />
            <Translator path="contribute.menu.bug" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href={libraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center"
            >
              <Library className="mr-2 !size-4" />
              <Translator path="contribute.menu.library" />
              <ExternalLink className="ml-auto !size-3 opacity-50" />
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Translator path={`contribute.dialog.title.${category}`} />
            </DialogTitle>
          </DialogHeader>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(`contribute.dialog.placeholder.${category}`)}
            maxLength={2000}
            className="min-h-[120px]"
          />

          <div className="text-xs text-muted-foreground text-right">
            {text.length}/2000
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              <Translator path="common.actions.cancel" />
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !text.trim()}
            >
              <Translator path="common.actions.submit" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
