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

export default function QuotaBar() {
  const quota = useRecoilValue(quotaState);

  if (!quota) return null;

  return (
    <div className="flex items-center justify-center gap-3 h-7 bg-muted/50 border-b text-xs text-muted-foreground px-3 shrink-0">
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
