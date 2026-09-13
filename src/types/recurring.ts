import type { CryptomusPaginated } from './common.js';

export type RecurringPeriod = 'weekly' | 'monthly' | 'three_month';

export type RecurringStatus =
  | 'wait_accept'
  | 'active'
  | 'cancel_by_merchant'
  | 'cancel_by_user';

export interface CreateRecurringParams {
  amount: string;
  currency: string;
  name: string;
  period: RecurringPeriod;
  to_currency?: string;
  order_id?: string;
  url_callback?: string;
  discount_days?: number;
  discount_amount?: string;
  additional_data?: string;
}

export interface RecurringPayment {
  uuid: string;
  name: string;
  order_id: string | null;
  amount: string;
  currency: string;
  payer_currency: string | null;
  payer_amount: string | null;
  payer_amount_usd?: string | null;
  url_callback: string | null;
  period: RecurringPeriod;
  status: RecurringStatus;
  url: string;
  last_pay_off: string | null;
  additional_data: string | null;
  discount_days: number | null;
  discount_amount: string | null;
  end_of_discount: string | null;
}

export interface RecurringInfoParams {
  uuid?: string;
  order_id?: string;
}

export interface CancelRecurringParams {
  uuid?: string;
  order_id?: string;
}

export type RecurringList = CryptomusPaginated<RecurringPayment>;
