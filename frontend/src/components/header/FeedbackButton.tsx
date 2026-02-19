import { apiClient } from '@/api';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@chainlit/react-client';

import { Translator } from '@/components/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';

const CATEGORIES = ['suggestion', 'bug', 'question'] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_ICONS: Record<Category, string> = {
  suggestion: '💡',
  bug: '🐛',
  question: '❓'
};

export default function FeedbackButton() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<Category>('suggestion');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

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
        toast.success(<Translator path="feedback.dialog.success" />);
        setText('');
        setCategory('suggestion');
        setIsOpen(false);
      } else {
        toast.error(data.message || 'Error');
      }
    } catch {
      toast.error(<Translator path="feedback.dialog.error" />);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(true)}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            <MessageCircle className="!size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <Translator path="feedback.button" />
        </TooltipContent>
      </Tooltip>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Translator path="feedback.dialog.title" />
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                variant={category === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategory(cat)}
                className="flex-1"
              >
                {CATEGORY_ICONS[cat]}{' '}
                <Translator path={`feedback.dialog.category.${cat}`} />
              </Button>
            ))}
          </div>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            className="min-h-[100px]"
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
