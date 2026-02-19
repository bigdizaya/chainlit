import { useRecoilValue } from 'recoil';

import { Translator } from '@/components/i18n';

import { quotaState } from '@/state/quota';

function QuotaValue({
  remaining,
  limit
}: {
  remaining: number;
  limit: number;
}) {
  const isLow = remaining > 0 && remaining <= 3;
  const isEmpty = remaining <= 0;

  return (
    <span
      className={
        isEmpty
          ? 'text-red-500 font-semibold'
          : isLow
          ? 'text-orange-500 font-semibold'
          : ''
      }
    >
      {remaining}/{limit}
    </span>
  );
}

/**
 * Version inline pour le header desktop — cachée sur mobile.
 */
export function QuotaInline() {
  const quota = useRecoilValue(quotaState);

  if (!quota) return null;

  return (
    <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground mr-1">
      <span className="flex items-center gap-1">
        <span className="text-[11px]">🔍</span>
        <QuotaValue
          remaining={quota.normal.remaining}
          limit={quota.normal.limit}
        />
      </span>

      <span className="text-border/60">|</span>

      <span className="flex items-center gap-1">
        <span className="text-[11px]">🔬</span>
        <QuotaValue remaining={quota.deep.remaining} limit={quota.deep.limit} />
      </span>
    </div>
  );
}

/**
 * Bandeau mobile uniquement — caché sur desktop.
 */
export default function QuotaBar() {
  const quota = useRecoilValue(quotaState);

  if (!quota) return null;

  return (
    <div className="flex md:hidden items-center justify-center gap-3 h-7 bg-muted/50 border-b text-xs text-muted-foreground px-3 shrink-0">
      <span className="flex items-center gap-1">
        <span>🔍</span>
        <Translator path="quota.normal" />{' '}
        <QuotaValue
          remaining={quota.normal.remaining}
          limit={quota.normal.limit}
        />
      </span>

      <span className="text-border">|</span>

      <span className="flex items-center gap-1">
        <span>🔬</span>
        <Translator path="quota.deep" />{' '}
        <QuotaValue remaining={quota.deep.remaining} limit={quota.deep.limit} />
      </span>
    </div>
  );
}
