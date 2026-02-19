import { atom } from 'recoil';

export interface QuotaData {
  normal: { remaining: number; limit: number };
  deep: { remaining: number; limit: number };
}

export const quotaState = atom<QuotaData | null>({
  key: 'quotaData',
  default: null
});
