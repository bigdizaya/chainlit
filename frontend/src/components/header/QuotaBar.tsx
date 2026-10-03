import { Zap } from 'lucide-react';
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
          ? 'bayyan-quota__value text-red-500 font-semibold'
          : isLow
          ? 'bayyan-quota__value text-orange-500 font-semibold'
          : 'bayyan-quota__value'
      }
      data-level={isEmpty ? 'empty' : isLow ? 'low' : 'ok'}
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
      className="bayyan-quota bayyan-quota--inline hidden md:flex items-center gap-1.5 text-xs text-muted-foreground me-1"
      title={quotaTitle(quota, t)}
    >
      <Zap className="bayyan-quota__icon size-3.5" aria-hidden="true" />
      <span className="bayyan-quota__body flex items-center gap-1">
        <span className="bayyan-quota__label font-semibold">
          {t('bayyan.quota.points')}
        </span>
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
      className="bayyan-quota bayyan-quota--strip flex md:hidden items-center justify-center gap-1.5 h-7 bg-muted/50 border-b text-xs text-muted-foreground px-3 shrink-0"
      title={quotaTitle(quota, t)}
    >
      <Zap className="bayyan-quota__icon size-3.5" aria-hidden="true" />
      <span className="bayyan-quota__body flex items-center gap-1">
        <span className="bayyan-quota__label font-semibold">
          {t('bayyan.quota.points')}
        </span>
        <QuotaValue remaining={units.remaining} limit={units.limit} />
      </span>
    </div>
  );
}
