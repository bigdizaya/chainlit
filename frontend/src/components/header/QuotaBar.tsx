import { useRecoilValue } from 'recoil';

import { quotaState, type QuotaData } from '@/state/quota';

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

function costLabel(name: string, cost: number | undefined, fallback: number) {
  const safeCost = cost || fallback;
  return `${name} ${safeCost} ${safeCost > 1 ? 'points' : 'point'}`;
}

function quotaTitle(quota: QuotaData) {
  const costs = quota.units.costs || {};
  return [
    costLabel('Simple', costs.concise, 1),
    costLabel('Standard', costs.standard, 2),
    costLabel('Approfondi', costs.deep, 3)
  ].join(' | ');
}

/**
 * Version inline pour le header desktop — cachée sur mobile.
 */
export function QuotaInline() {
  const quota = useRecoilValue(quotaState);

  if (!quota) return null;
  const { units } = quota;

  return (
    <div
      aria-label={`Points restants: ${units.remaining} sur ${units.limit}`}
      className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground mr-1"
      title={quotaTitle(quota)}
    >
      <span className="text-[11px]">⚡</span>
      <span className="flex items-center gap-1">
        <span className="font-semibold">Points</span>
        <QuotaValue remaining={units.remaining} limit={units.limit} />
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
  const { units } = quota;

  return (
    <div
      aria-label={`Points restants: ${units.remaining} sur ${units.limit}`}
      className="flex md:hidden items-center justify-center gap-1.5 h-7 bg-muted/50 border-b text-xs text-muted-foreground px-3 shrink-0"
      title={quotaTitle(quota)}
    >
      <span>⚡</span>
      <span className="flex items-center gap-1">
        <span className="font-semibold">Points</span>
        <QuotaValue remaining={units.remaining} limit={units.limit} />
      </span>
    </div>
  );
}
