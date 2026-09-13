import type { CourseSource, CryptomusPaginated, DateRangeFilter } from './common.js';

export type PayoutStatus =
  | 'process'
  | 'check'
  | 'paid'
  | 'fail'
  | 'cancel'
  | 'system_fail';

export const FINAL_PAYOUT_STATUSES = [
  'paid',
  'fail',
  'cancel',
  'system_fail',
] as const satisfies readonly PayoutStatus[];

export function isFinalPayoutStatus(status: PayoutStatus): boolean {
  return (FINAL_PAYOUT_STATUSES as readonly string[]).includes(status);
}

export type PayoutPriority = 'recommended' | 'economy' | 'high' | 'highest';

export interface CreatePayoutParams {
  amount: string;
  currency: string;
  order_id: string;
  address: string;
  is_subtract: boolean;
  network?: string;
  url_callback?: string;
  to_currency?: string;
  from_currency?: string;
  course_source?: CourseSource;
  priority?: PayoutPriority;
  memo?: string;
}

export interface Payout {
  uuid: string;
  order_id?: string;
  amount: string;
  currency: string;
  network: string;
  address: string;
  txid: string | null;
  status: PayoutStatus;
  is_final: boolean;
  balance: number | string;
  payer_currency: string;
  payer_amount: string | number;
  commission?: string | null;
  memo?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PayoutInfoParams {
  uuid?: string;
  order_id?: string;
}

export interface PayoutListParams extends DateRangeFilter {}

export type PayoutList = CryptomusPaginated<Payout>;

export interface PayoutService {
  network: string;
  currency: string;
  is_available: boolean;
  limit: {
    min_amount: string;
    max_amount: string;
  };
  commission: {
    fee_amount: string;
    percent: string;
  };
}

export interface TransferParams {
  amount: string;
  currency: string;
}

export interface TransferResult {
  user_wallet_transaction_uuid: string;
  user_wallet_balance: string;
  merchant_transaction_uuid: string;
  merchant_balance: string;
}
