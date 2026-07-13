import { cn } from '@/lib/utils';
import { Check, ChevronDown, Gauge } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { useTranslation } from 'components/i18n/Translator';

type ResponseLevelOption = {
  value: string;
};

type ResponseLevelPayload = {
  success?: boolean;
  level?: string;
  levels?: ResponseLevelOption[];
};

const STORAGE_KEY = 'bayyan_response_level';

const FALLBACK_LEVELS: ResponseLevelOption[] = [
  { value: 'concise' },
  { value: 'deep' }
];

function normalizeLevel(value: unknown) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (
    text === 'deep' ||
    text === 'deep_search' ||
    text === 'deep search' ||
    text === 'approfondie' ||
    text === 'approfondi'
  ) {
    return 'deep';
  }
  return 'concise';
}

export function readStoredResponseLevel() {
  try {
    return normalizeLevel(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'concise';
  }
}

function rememberLevel(level: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizeLevel(level));
  } catch {
    // Storage is only a UI hint.
  }
}

function normalizeOptions(options: unknown) {
  if (!Array.isArray(options) || options.length === 0) {
    return FALLBACK_LEVELS;
  }

  const levels = options
    .map((option) => {
      if (!option || typeof option !== 'object') return null;
      const record = option as Record<string, unknown>;
      const value = normalizeLevel(record.value);
      return { value };
    })
    .filter(Boolean) as ResponseLevelOption[];

  return levels.length ? levels : FALLBACK_LEVELS;
}

export async function syncStoredResponseLevel() {
  const response = await fetch('/api/response-level', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: readStoredResponseLevel() })
  });

  const payload = (await response.json()) as ResponseLevelPayload;
  if (!response.ok || payload.success === false) {
    throw new Error('response-level sync failed');
  }
  return payload;
}

export default function ResponseLevelPicker({
  disabled = false,
  compact = false
}: {
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(readStoredResponseLevel);
  const [levels, setLevels] = useState<ResponseLevelOption[]>(FALLBACK_LEVELS);
  const [syncing, setSyncing] = useState(false);
  const { t } = useTranslation();

  const localizedLevels = useMemo(
    () =>
      levels.map((item) => {
        const key = item.value === 'deep' ? 'deep' : 'concise';
        return {
          ...item,
          label: t(`bayyan.responseLevel.${key}.label`),
          short_label: t(`bayyan.responseLevel.${key}.short`),
          description: t(`bayyan.responseLevel.${key}.description`)
        };
      }),
    [levels, t]
  );

  const selectedLevel = useMemo(
    () =>
      localizedLevels.find((item) => item.value === level) ||
      localizedLevels[0],
    [level, localizedLevels]
  );

  const applyPayload = useCallback((payload: ResponseLevelPayload) => {
    const nextLevels = normalizeOptions(payload.levels);
    const nextLevel = normalizeLevel(payload.level);
    setLevels(nextLevels);
    setLevel(nextLevel);
    rememberLevel(nextLevel);
  }, []);

  const syncLevel = useCallback(
    async (nextLevel?: string) => {
      const response = await fetch('/api/response-level', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          nextLevel ? { level: normalizeLevel(nextLevel) } : {}
        )
      });

      const payload = (await response.json()) as ResponseLevelPayload;
      if (!response.ok || payload.success === false) {
        throw new Error('response-level sync failed');
      }
      applyPayload(payload);
    },
    [applyPayload]
  );

  useEffect(() => {
    syncLevel().catch(() => {
      // Keep the locally remembered value when the endpoint is unavailable.
    });

    const handleWindowMessage = (event: Event) => {
      const data = event instanceof CustomEvent ? event.detail : undefined;
      if (!data || typeof data !== 'object') return;
      const record = data as Record<string, unknown>;
      if (record.type !== 'response_level_update') return;
      const nextLevel = normalizeLevel(record.level);
      setLevel(nextLevel);
      rememberLevel(nextLevel);
    };

    window.addEventListener('chainlit:window_message', handleWindowMessage);
    return () =>
      window.removeEventListener(
        'chainlit:window_message',
        handleWindowMessage
      );
  }, [syncLevel]);

  const selectLevel = useCallback(
    (nextLevel: string) => {
      const normalized = normalizeLevel(nextLevel);
      const previous = level;

      setLevel(normalized);
      rememberLevel(normalized);
      setOpen(false);
      setSyncing(true);

      syncLevel(normalized)
        .catch(() => {
          setLevel(previous);
          rememberLevel(previous);
          toast.error(t('bayyan.responseLevel.changeError'));
        })
        .finally(() => setSyncing(false));
    },
    [level, syncLevel, t]
  );

  if (!compact) {
    return (
      <fieldset
        className="bayyan-response-level"
        disabled={disabled || syncing}
      >
        <legend>{t('bayyan.responseLevel.legend')}</legend>
        <div className="bayyan-response-level__segments">
          {localizedLevels.map((item) => {
            const selected = item.value === level;
            return (
              <label
                className={cn(
                  'bayyan-response-level__option',
                  selected && 'is-selected'
                )}
                key={item.value}
              >
                <input
                  type="radio"
                  name="bayyan-response-level"
                  value={item.value}
                  checked={selected}
                  onChange={() => selectLevel(item.value)}
                />
                <span>{item.short_label || item.label}</span>
              </label>
            );
          })}
        </div>
        <p aria-live="polite">{selectedLevel.description}</p>
      </fieldset>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || syncing}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium',
            'hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          )}
          aria-label={t('bayyan.responseLevel.ariaLabel')}
        >
          <Gauge className="!size-4 text-muted-foreground" />
          <span className="max-w-[110px] truncate">
            {selectedLevel.short_label || selectedLevel.label}
          </span>
          <ChevronDown className="!size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[280px] p-1">
        <div className="flex flex-col gap-1">
          {localizedLevels.map((item) => {
            const selected = item.value === level;
            return (
              <button
                key={item.value}
                type="button"
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-2 py-2 text-start text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  selected && 'bg-accent text-accent-foreground'
                )}
                onClick={() => selectLevel(item.value)}
              >
                <Check
                  className={cn(
                    'mt-0.5 !size-4 shrink-0',
                    selected ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-tight">
                    {item.label}
                  </span>
                  {item.description ? (
                    <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
