import { CryptomusTransport } from './http.js';
import { MiscResource } from '../resources/misc.js';
import { PaymentsResource } from '../resources/payments.js';
import { PayoutsResource } from '../resources/payouts.js';
import { RecurringResource } from '../resources/recurring.js';
import { WalletsResource } from '../resources/wallets.js';
import { WebhooksResource } from '../resources/webhooks.js';
import type { CryptomusClientConfig } from '../types/common.js';

export class CryptomusClient {
  readonly payments: PaymentsResource;
  readonly wallets: WalletsResource;
  readonly payouts: PayoutsResource;
  readonly recurring: RecurringResource;
  readonly misc: MiscResource;
  readonly webhooks: WebhooksResource;

  private readonly transport: CryptomusTransport;

  constructor(config: CryptomusClientConfig) {
    this.transport = new CryptomusTransport(config);

    this.payments = new PaymentsResource(this.transport);
    this.wallets = new WalletsResource(this.transport);
    this.payouts = new PayoutsResource(this.transport);
    this.recurring = new RecurringResource(this.transport);
    this.misc = new MiscResource(this.transport);
    this.webhooks = new WebhooksResource(this.transport, {
      paymentKey: config.paymentKey,
      payoutKey: config.payoutKey,
    });
  }

  static fromEnv(
    overrides: Partial<CryptomusClientConfig> = {},
    env: Record<string, string | undefined> = globalThis.process?.env ?? {},
  ): CryptomusClient {
    const merchantId = overrides.merchantId ?? env['CRYPTOMUS_MERCHANT_ID'];

    if (!merchantId) {
      throw new Error(
        'CRYPTOMUS_MERCHANT_ID is not set. Add it to your environment, or pass `merchantId` explicitly.',
      );
    }

    return new CryptomusClient({
      ...overrides,
      merchantId,
      paymentKey: overrides.paymentKey ?? env['CRYPTOMUS_PAYMENT_KEY'],
      payoutKey: overrides.payoutKey ?? env['CRYPTOMUS_PAYOUT_KEY'],
    });
  }
}
