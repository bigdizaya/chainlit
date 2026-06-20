import { atom } from 'recoil';

type QuotaBucket = { remaining: number; limit: number; unit_cost?: number };

export type QuotaCosts = {
  concise?: number;
  standard?: number;
  deep?: number;
};

export interface QuotaUnits {
  remaining: number;
  used: number;
  limit: number;
  requested_cost?: number;
  allowed?: boolean;
  costs?: QuotaCosts;
}

export interface QuotaData {
  units: QuotaUnits;
  normal?: QuotaBucket;
  deep?: QuotaBucket;
}

export const quotaState = atom<QuotaData | null>({
  key: 'quotaData',
  default: null
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBucket(value: unknown): QuotaBucket | null {
  const bucket = asRecord(value);
  if (!bucket) return null;

  return {
    remaining: toNumber(bucket.remaining, 0),
    limit: toNumber(bucket.limit, 0),
    unit_cost:
      bucket.unit_cost === undefined ? undefined : toNumber(bucket.unit_cost, 1)
  };
}

function normalizeCosts(value: unknown): QuotaCosts {
  const costs = asRecord(value);
  if (!costs) return {};

  return {
    concise:
      costs.concise === undefined ? undefined : toNumber(costs.concise, 1),
    standard:
      costs.standard === undefined ? undefined : toNumber(costs.standard, 2),
    deep: costs.deep === undefined ? undefined : toNumber(costs.deep, 3)
  };
}

export function normalizeQuotaPayload(payload: unknown): QuotaData | null {
  const data = asRecord(payload);
  if (!data) return null;

  const normal = normalizeBucket(data.normal);
  const deep = normalizeBucket(data.deep);
  const units = asRecord(data.units);

  if (units) {
    return {
      units: {
        remaining: toNumber(units.remaining, 0),
        used: toNumber(units.used, 0),
        limit: toNumber(units.limit, 0),
        requested_cost:
          units.requested_cost === undefined
            ? undefined
            : toNumber(units.requested_cost, 1),
        allowed: units.allowed === undefined ? undefined : units.allowed !== false,
        costs: normalizeCosts(units.costs)
      },
      normal: normal || undefined,
      deep: deep || undefined
    };
  }

  if (!normal) return null;

  return {
    units: {
      remaining: normal.remaining,
      used: Math.max(0, normal.limit - normal.remaining),
      limit: normal.limit,
      costs: {
        concise: normal.unit_cost || 1,
        standard: 2,
        deep: deep?.unit_cost || 3
      }
    },
    normal,
    deep: deep || undefined
  };
}
