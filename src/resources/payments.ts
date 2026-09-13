import type { CryptomusTransport } from '../core/http.js';
import { CryptomusError } from '../core/errors.js';
import type { RequestOptions } from '../types/common.js';
import {
  isFinalPaymentStatus,
  type CreatePaymentParams,
  type MarkAsPaidParams,
  type Payment,
  type PaymentDiscount,
  type PaymentInfoParams,
  type PaymentList,
  type PaymentListParams,
  type PaymentQrParams,
  type PaymentService,
  type QrCodeResult,
  type RefundParams,
  type ResendWebhookParams,
  type SetDiscountParams,
  type SetDiscountResult,
} from '../types/payments.js';

export interface WaitForPaymentOptions extends RequestOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onPoll?: (payment: Payment) => void;
}

export class PaymentsResource {
  constructor(private readonly transport: CryptomusTransport) {}

  create(params: CreatePaymentParams, options?: RequestOptions): Promise<Payment> {
    return this.transport.request<Payment>({
      method: 'POST',
      path: '/v1/payment',
      key: 'payment',
      body: params,
      options,
    });
  }

  async info(params: PaymentInfoParams, options?: RequestOptions): Promise<Payment> {
    requireIdentifier(params, 'payments.info');
    return this.transport.request<Payment>({
      method: 'POST',
      path: '/v1/payment/info',
      key: 'payment',
      body: params,
      options,
    });
  }

  list(
    params: PaymentListParams = {},
    options?: RequestOptions & { cursor?: string },
  ): Promise<PaymentList> {
    const { cursor, ...rest } = options ?? {};
    return this.transport.request<PaymentList>({
      method: 'POST',
      path: '/v1/payment/list',
      key: 'payment',
      body: params,
      options: { ...rest, query: { ...rest.query, cursor } },
    });
  }

  async *listAll(
    params: PaymentListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Payment, void, undefined> {
    let cursor: string | undefined;

    do {
      const page = await this.list(params, { ...options, cursor });
      yield* page.items;
      cursor = page.paginate.nextCursor ?? undefined;
    } while (cursor);
  }

  async waitForFinalStatus(
    params: PaymentInfoParams,
    options: WaitForPaymentOptions = {},
  ): Promise<Payment> {
    const { intervalMs = 5_000, timeoutMs = 900_000, onPoll, ...requestOptions } = options;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const payment = await this.info(params, requestOptions);
      onPoll?.(payment);

      if (payment.is_final || isFinalPaymentStatus(payment.payment_status)) return payment;

      if (Date.now() + intervalMs > deadline) {
        throw new CryptomusError(
          `Invoice did not reach a final status within ${timeoutMs}ms (last status: ${payment.payment_status}).`,
          { endpoint: '/v1/payment/info' },
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async refund(params: RefundParams, options?: RequestOptions): Promise<[]> {
    requireIdentifier(params, 'payments.refund');
    return this.transport.request<[]>({
      method: 'POST',
      path: '/v1/payment/refund',
      key: 'payment',
      body: params,
      options,
    });
  }

  async resendWebhook(params: ResendWebhookParams, options?: RequestOptions): Promise<[]> {
    if (!params.uuid && !params.order_id && !params.txid) {
      throw new CryptomusError('payments.resendWebhook requires one of `uuid`, `order_id` or `txid`.');
    }
    return this.transport.request<[]>({
      method: 'POST',
      path: '/v2/payment/resend',
      key: 'payment',
      body: params,
      options,
    });
  }

  qrCode(params: PaymentQrParams, options?: RequestOptions): Promise<QrCodeResult> {
    return this.transport.request<QrCodeResult>({
      method: 'POST',
      path: '/v1/payment/qr',
      key: 'payment',
      body: params,
      options,
    });
  }

  async markAsPaid(params: MarkAsPaidParams, options?: RequestOptions): Promise<Payment> {
    requireIdentifier(params, 'payments.markAsPaid');
    return this.transport.request<Payment>({
      method: 'POST',
      path: '/v1/payment/mark-as-paid',
      key: 'payment',
      body: params,
      options,
    });
  }

  services(options?: RequestOptions): Promise<PaymentService[]> {
    return this.transport.request<PaymentService[]>({
      method: 'POST',
      path: '/v1/payment/services',
      key: 'payment',
      body: {},
      options,
    });
  }

  discounts(options?: RequestOptions): Promise<PaymentDiscount[]> {
    return this.transport.request<PaymentDiscount[]>({
      method: 'POST',
      path: '/v1/payment/discount/list',
      key: 'payment',
      body: {},
      options,
    });
  }

  setDiscount(params: SetDiscountParams, options?: RequestOptions): Promise<SetDiscountResult> {
    return this.transport.request<SetDiscountResult>({
      method: 'POST',
      path: '/v1/payment/discount/set',
      key: 'payment',
      body: params,
      options,
    });
  }
}

export function requireIdentifier(
  params: { uuid?: string; order_id?: string },
  method: string,
): void {
  if (!params.uuid && !params.order_id) {
    throw new CryptomusError(`${method} requires either \`uuid\` or \`order_id\`.`);
  }
}
