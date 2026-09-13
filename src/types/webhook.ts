import type { PaymentConvert, PaymentStatus } from './payments.js';
import type { PayoutStatus } from './payouts.js';

export const CRYPTOMUS_WEBHOOK_IP = '91.227.144.54';

export type TestWebhookStatus =
  | 'process'
  | 'check'
  | 'paid'
  | 'paid_over'
  | 'fail'
  | 'wrong_amount'
  | 'cancel'
  | 'system_fail'
  | 'refund_process'
  | 'refund_fail'
  | 'refund_paid';

interface WebhookBase {
  uuid: string;
  order_id: string;
  amount: string;
  payment_amount: string;
  payment_amount_usd: string;
  merchant_amount: string;
  commission: string;
  is_final: boolean;
  from: string | null;
  wallet_address_uuid: string | null;
  network: string;
  currency: string;
  payer_currency: string;
  payer_amount: string;
  payer_amount_exchange_rate?: string | null;
  transfer_id?: string | null;
  additional_data: string | null;
  convert?: PaymentConvert | null;
  txid: string | null;
  sign: string;
}

export interface PaymentWebhookPayload extends WebhookBase {
  type: 'payment';
  status: PaymentStatus;
}

export interface WalletWebhookPayload extends WebhookBase {
  type: 'wallet';
  status: PaymentStatus;
}

export interface PayoutWebhookPayload {
  type: 'payout';
  uuid: string;
  order_id: string;
  amount: string;
  merchant_amount?: string;
  commission?: string;
  is_final: boolean;
  status: PayoutStatus;
  txid: string | null;
  currency: string;
  network: string;
  payer_currency?: string;
  payer_amount?: string;
  sign: string;
}

export type CryptomusWebhookPayload =
  | PaymentWebhookPayload
  | WalletWebhookPayload
  | PayoutWebhookPayload;

export interface TestPaymentWebhookParams {
  url_callback: string;
  currency: string;
  network: string;
  uuid?: string;
  order_id?: string;
  status?: TestWebhookStatus;
}

export interface TestWalletWebhookParams extends TestPaymentWebhookParams {}
