import { useTranslation } from 'components/i18n/Translator';

export const CURSOR_PLACEHOLDER = '\u200B';

interface Props {
  whitespace?: boolean;
}

export default function BlinkingCursor({ whitespace }: Props) {
  const { t } = useTranslation();

  if (!whitespace) {
    return (
      <span className="sr-only" role="status">
        {t('bayyan.status.searchInProgress')}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="bayyan-stream-cursor ml-1.5 inline-block"
    />
  );
}
