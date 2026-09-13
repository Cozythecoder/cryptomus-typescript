import type { CourseSource, CryptomusPaginated, DateRangeFilter } from './common.js';

export type PaymentStatus =
  | 'check'
  | 'process'
  | 'confirm_check'
  | 'paid'
  | 'paid_over'
  | 'wrong_amount'
  | 'wrong_amount_waiting'
  | 'fail'
  | 'cancel'
  | 'system_fail'
  | 'refund_process'
  | 'refund_fail'
  | 'refund_paid'
  | 'locked';

export const FINAL_PAYMENT_STATUSES = [
  'paid',
  'paid_over',
  'fail',
  'cancel',
  'system_fail',
  'refund_fail',
  'refund_paid',
  'locked',
] as const satisfies readonly PaymentStatus[];

export const SUCCESSFUL_PAYMENT_STATUSES = ['paid', 'paid_over'] as const satisfies readonly PaymentStatus[];

export function isFinalPaymentStatus(status: PaymentStatus): boolean {
  return (FINAL_PAYMENT_STATUSES as readonly string[]).includes(status);
}

export function isPaidPaymentStatus(status: PaymentStatus): boolean {
  return (SUCCESSFUL_PAYMENT_STATUSES as readonly string[]).includes(status);
}

export interface CreatePaymentParams {
  amount: string;
  currency: string;
  order_id: string;
  network?: string;
  url_return?: string;
  url_success?: string;
  url_callback?: string;
  is_payment_multiple?: boolean;
  lifetime?: number;
  to_currency?: string;
  subtract?: number;
  accuracy_payment_percent?: number;
  additional_data?: string;
  currencies?: PaymentCurrencyFilter[];
  except_currencies?: PaymentCurrencyFilter[];
  course_source?: CourseSource;
  from_referral_code?: string;
  discount_percent?: number;
  is_refresh?: boolean;
}

export interface PaymentCurrencyFilter {
  currency: string;
  network?: string;
}

export interface Payment {
  uuid: string;
  order_id: string;
  amount: string;
  payment_amount: string | null;
  payment_amount_usd?: string | null;
  payer_amount: string | null;
  payer_amount_exchange_rate?: string | null;
  discount_percent: number | null;
  discount: string | null;
  payer_currency: string | null;
  currency: string;
  merchant_amount: string | null;
  commission?: string | null;
  network: string | null;
  address: string | null;
  from: string | null;
  txid: string | null;
  payment_status: PaymentStatus;
  url: string;
  expired_at: number;
  is_final: boolean;
  additional_data: string | null;
  convert?: PaymentConvert | null;
  comments?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentConvert {
  to_currency: string;
  commission: string | null;
  rate: string;
  amount: string;
}

export interface PaymentInfoParams {
  uuid?: string;
  order_id?: string;
}

export interface PaymentListParams extends DateRangeFilter {}

export type PaymentList = CryptomusPaginated<Payment>;

export interface RefundParams {
  uuid?: string;
  order_id?: string;
  address: string;
  is_subtract: boolean;
}

export interface ResendWebhookParams {
  uuid?: string;
  order_id?: string;
  txid?: string;
}

export interface PaymentQrParams {
  merchant_payment_uuid: string;
}

export interface QrCodeResult {
  image: string;
}

export interface MarkAsPaidParams {
  uuid?: string;
  order_id?: string;
}

export interface PaymentService {
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

export interface PaymentDiscount {
  network: string;
  currency: string;
  discount: number;
}

export interface SetDiscountParams {
  currency: string;
  network: string;
  discount_percent: number;
}

export interface SetDiscountResult {
  currency: string;
  network: string;
  discount: number;
}
