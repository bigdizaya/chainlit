import { useRecoilValue } from 'recoil';

import { useTranslation } from 'components/i18n/Translator';

import { type QuotaData, quotaState } from '@/state/quota';

type Translate = ReturnType<typeof useTranslation>['t'];

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

function costLabel(
  name: string,
  cost: number | undefined,
  fallback: number,
  t: Translate
) {
  const safeCost = cost || fallback;
  const unit = t(
    safeCost > 1 ? 'bayyan.quota.pointsUnit' : 'bayyan.quota.point'
  );
  return `${name} ${safeCost} ${unit}`;
}

function quotaTitle(quota: QuotaData, t: Translate) {
  const costs = quota.units.costs || {};
  return [
    costLabel(t('bayyan.quota.concise'), costs.concise, 1, t),
    costLabel(t('bayyan.quota.standard'), costs.standard, 2, t),
    costLabel(t('bayyan.quota.deep'), costs.deep, 3, t)
  ].join(' | ');
}

/**
 * Version inline pour le header desktop — cachée sur mobile.
 */
export function QuotaInline() {
  const quota = useRecoilValue(quotaState);
  const { t } = useTranslation();

  if (!quota) return null;
  const { units } = quota;

  return (
    <div
      aria-label={t('bayyan.quota.remainingLabel', {
        remaining: units.remaining,
        limit: units.limit
      })}
      className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground mr-1"
      title={quotaTitle(quota, t)}
    >
      <span className="text-[11px]">⚡</span>
      <span className="flex items-center gap-1">
        <span className="font-semibold">{t('bayyan.quota.points')}</span>
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
  const { t } = useTranslation();

  if (!quota) return null;
  const { units } = quota;

  return (
    <div
      aria-label={t('bayyan.quota.remainingLabel', {
        remaining: units.remaining,
        limit: units.limit
      })}
      className="flex md:hidden items-center justify-center gap-1.5 h-7 bg-muted/50 border-b text-xs text-muted-foreground px-3 shrink-0"
      title={quotaTitle(quota, t)}
    >
      <span>⚡</span>
      <span className="flex items-center gap-1">
        <span className="font-semibold">{t('bayyan.quota.points')}</span>
        <QuotaValue remaining={units.remaining} limit={units.limit} />
      </span>
    </div>
  );
}
