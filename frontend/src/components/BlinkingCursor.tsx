export const CURSOR_PLACEHOLDER = '\u200B';

interface Props {
  whitespace?: boolean;
}

export default function BlinkingCursor({ whitespace }: Props) {
  if (!whitespace) {
    return (
      <span className="sr-only" role="status">
        Recherche en cours
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
