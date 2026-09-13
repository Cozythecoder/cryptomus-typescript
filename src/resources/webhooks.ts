import { CryptomusError, CryptomusSignatureError } from '../core/errors.js';
import type { CryptomusTransport } from '../core/http.js';
import { verifyWebhookObject, verifyWebhookSignature } from '../core/signature.js';
import type { RequestOptions } from '../types/common.js';
import {
  CRYPTOMUS_WEBHOOK_IP,
  type CryptomusWebhookPayload,
  type TestPaymentWebhookParams,
  type TestWalletWebhookParams,
} from '../types/webhook.js';

export type WebhookKeyKind = 'payment' | 'payout' | 'auto';

export interface VerifyWebhookOptions {
  signature?: string;
  key?: WebhookKeyKind;
}

export interface WebhookKeys {
  paymentKey?: string;
  payoutKey?: string;
}

export class WebhooksResource {
  constructor(
    private readonly transport: CryptomusTransport | undefined,
    private readonly keys: WebhookKeys,
  ) {}

  static readonly SOURCE_IP = CRYPTOMUS_WEBHOOK_IP;

  isTrustedIp(ip: string | null | undefined): boolean {
    if (!ip) return false;
    return ip.replace(/^::ffff:/, '').trim() === CRYPTOMUS_WEBHOOK_IP;
  }

  verify(rawBody: string, options: VerifyWebhookOptions = {}): boolean {
    const keys = this.keysFor(options.key ?? 'auto');
    return keys.some((key) => verifyWebhookSignature(rawBody, key, options.signature));
  }

  verifyParsed(payload: Record<string, unknown>, options: VerifyWebhookOptions = {}): boolean {
    const keys = this.keysFor(options.key ?? 'auto');
    return keys.some((key) => verifyWebhookObject(payload, key, options.signature));
  }

  constructEvent(rawBody: string, options: VerifyWebhookOptions = {}): CryptomusWebhookPayload {
    if (!this.verify(rawBody, options)) {
      throw new CryptomusSignatureError(
        'Cryptomus webhook signature verification failed. Ensure you passed the raw, unparsed request body and the correct API key.',
      );
    }

    try {
      return JSON.parse(rawBody) as CryptomusWebhookPayload;
    } catch (error) {
      throw new CryptomusSignatureError('Cryptomus webhook body is not valid JSON.', {
        cause: error,
        raw: rawBody,
      });
    }
  }

  async testPayment(params: TestPaymentWebhookParams, options?: RequestOptions): Promise<[]> {
    return this.requireTransport().request<[]>({
      method: 'POST',
      path: '/v1/test-webhook/payment',
      key: 'payment',
      body: { status: 'paid', ...params },
      options,
    });
  }

  async testWallet(params: TestWalletWebhookParams, options?: RequestOptions): Promise<[]> {
    return this.requireTransport().request<[]>({
      method: 'POST',
      path: '/v1/test-webhook/wallet',
      key: 'payment',
      body: { status: 'paid', ...params },
      options,
    });
  }

  private keysFor(kind: WebhookKeyKind): string[] {
    const candidates =
      kind === 'payment'
        ? [this.keys.paymentKey]
        : kind === 'payout'
          ? [this.keys.payoutKey]
          : [this.keys.paymentKey, this.keys.payoutKey];

    const keys = candidates.filter((key): key is string => Boolean(key));

    if (!keys.length) {
      throw new CryptomusError(
        `No API key available to verify this webhook. Pass ${kind === 'payout' ? '`payoutKey`' : '`paymentKey`'} when creating the client.`,
      );
    }

    return keys;
  }

  private requireTransport(): CryptomusTransport {
    if (!this.transport) {
      throw new CryptomusError(
        'The webhook test endpoints need a full client. Use `new CryptomusClient(...)` rather than the standalone verifier.',
      );
    }
    return this.transport;
  }
}

export function createWebhookVerifier(keys: WebhookKeys): WebhooksResource {
  return new WebhooksResource(undefined, keys);
}
