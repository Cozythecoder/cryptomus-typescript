import { describe, expect, it } from 'vitest';
import { CryptomusClient } from '../src/core/client.js';
import { CryptomusSignatureError } from '../src/core/errors.js';
import { phpJsonEncode, signPayload } from '../src/core/signature.js';
import { createWebhookVerifier } from '../src/resources/webhooks.js';
import { CRYPTOMUS_WEBHOOK_IP, type CryptomusWebhookPayload } from '../src/types/webhook.js';
import { MERCHANT_ID, PAYMENT_KEY, PAYOUT_KEY, mockFetch, ok } from './helpers.js';

function buildWebhook(fields: Record<string, unknown>, key: string): string {
  const body = phpJsonEncode(fields);
  const sign = signPayload(body, key);
  return `{${body.slice(1, -1)},"sign":"${sign}"}`;
}

const paymentFields = {
  type: 'payment',
  uuid: '2ba3d4a0-1f79-4e8e-9d8f-0d0c8b2d1f21',
  order_id: 'order-1024',
  amount: '19.99',
  payment_amount: '19.99',
  payment_amount_usd: '19.99',
  merchant_amount: '19.79',
  commission: '0.20',
  is_final: true,
  status: 'paid',
  from: 'TXn5...',
  wallet_address_uuid: null,
  network: 'tron',
  currency: 'USD',
  payer_currency: 'USDT',
  payer_amount: '19.99',
  additional_data: null,
  txid: '0f3c...',
};

const payoutFields = {
  type: 'payout',
  uuid: 'a7c1f3e2-55aa-4b10-9c33-77bb01d9e442',
  order_id: 'payout-77',
  amount: '50.00',
  is_final: true,
  status: 'paid',
  txid: '9be1...',
  currency: 'USDT',
  network: 'tron',
};

function client() {
  const mock = mockFetch({ body: ok([]) });
  return {
    mock,
    client: new CryptomusClient({
      merchantId: MERCHANT_ID,
      paymentKey: PAYMENT_KEY,
      payoutKey: PAYOUT_KEY,
      fetch: mock.fetch,
      maxRetries: 0,
    }),
  };
}

describe('verify', () => {
  it('accepts a genuine payment webhook', () => {
    const { client: c } = client();
    expect(c.webhooks.verify(buildWebhook(paymentFields, PAYMENT_KEY))).toBe(true);
  });

  it('accepts a payout webhook signed with the payout key', () => {
    const { client: c } = client();
    expect(c.webhooks.verify(buildWebhook(payoutFields, PAYOUT_KEY))).toBe(true);
  });

  it('rejects a payout webhook when told to use the payment key', () => {
    const { client: c } = client();
    expect(c.webhooks.verify(buildWebhook(payoutFields, PAYOUT_KEY), { key: 'payment' })).toBe(false);
  });

  it('rejects a forged webhook', () => {
    const { client: c } = client();
    expect(c.webhooks.verify(buildWebhook(paymentFields, 'attacker-key'))).toBe(false);
  });

  it('rejects a webhook whose amount was altered in transit', () => {
    const { client: c } = client();
    const tampered = buildWebhook(paymentFields, PAYMENT_KEY).replace('"19.99"', '"0.01"');
    expect(c.webhooks.verify(tampered)).toBe(false);
  });

  it('throws when no key is available for the requested kind', () => {
    const mock = mockFetch({ body: ok([]) });
    const c = new CryptomusClient({ merchantId: MERCHANT_ID, paymentKey: PAYMENT_KEY, fetch: mock.fetch });

    expect(() => c.webhooks.verify('{}', { key: 'payout' })).toThrow(/payoutKey/);
  });
});

describe('constructEvent', () => {
  it('returns the typed payload for a genuine webhook', () => {
    const { client: c } = client();
    const event = c.webhooks.constructEvent(buildWebhook(paymentFields, PAYMENT_KEY));

    expect(event.type).toBe('payment');
    expect(event.order_id).toBe('order-1024');
    if (event.type === 'payment') expect(event.status).toBe('paid');
  });

  it('throws a signature error for a forged webhook', () => {
    const { client: c } = client();

    expect(() => c.webhooks.constructEvent(buildWebhook(paymentFields, 'wrong'))).toThrow(
      CryptomusSignatureError,
    );
  });

  it('narrows on the type discriminator', () => {
    const { client: c } = client();
    const event: CryptomusWebhookPayload = c.webhooks.constructEvent(
      buildWebhook(payoutFields, PAYOUT_KEY),
    );

    expect(event.type).toBe('payout');
    if (event.type === 'payout') expect(event.status).toBe('paid');
  });

  it('reports malformed JSON that still carries a valid signature', () => {
    const { client: c } = client();
    const broken = '{"a":1,"sign":"' + signPayload('{"a":1,', PAYMENT_KEY) + '"';
    expect(() => c.webhooks.constructEvent(broken)).toThrow(CryptomusSignatureError);
  });
});

describe('verifyParsed', () => {
  it('verifies a body that a framework already parsed', () => {
    const { client: c } = client();
    const raw = buildWebhook(paymentFields, PAYMENT_KEY);

    expect(c.webhooks.verifyParsed(JSON.parse(raw))).toBe(true);
  });

  it('rejects a parsed body that was altered', () => {
    const { client: c } = client();
    const parsed = JSON.parse(buildWebhook(paymentFields, PAYMENT_KEY));
    parsed.amount = '1.00';

    expect(c.webhooks.verifyParsed(parsed)).toBe(false);
  });
});

describe('isTrustedIp', () => {
  const { client: c } = client();

  it('accepts the documented Cryptomus address', () => {
    expect(c.webhooks.isTrustedIp(CRYPTOMUS_WEBHOOK_IP)).toBe(true);
  });

  it('accepts the IPv4-mapped IPv6 form Node reports behind proxies', () => {
    expect(c.webhooks.isTrustedIp(`::ffff:${CRYPTOMUS_WEBHOOK_IP}`)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(c.webhooks.isTrustedIp('203.0.113.9')).toBe(false);
    expect(c.webhooks.isTrustedIp(null)).toBe(false);
    expect(c.webhooks.isTrustedIp(undefined)).toBe(false);
  });
});

describe('createWebhookVerifier', () => {
  it('verifies without an HTTP client', () => {
    const verifier = createWebhookVerifier({ paymentKey: PAYMENT_KEY });

    expect(verifier.verify(buildWebhook(paymentFields, PAYMENT_KEY))).toBe(true);
  });

  it('explains that the test endpoints need a full client', async () => {
    const verifier = createWebhookVerifier({ paymentKey: PAYMENT_KEY });

    await expect(
      verifier.testPayment({ url_callback: 'https://a.test/h', currency: 'USDT', network: 'tron' }),
    ).rejects.toThrow(/full client/);
  });
});

describe('webhook test endpoints reject rather than throwing synchronously', () => {
  const verifier = createWebhookVerifier({ paymentKey: PAYMENT_KEY });

  const cases: Array<[string, () => Promise<unknown>]> = [
    ['testPayment', () => verifier.testPayment({ url_callback: 'https://a.test/h', currency: 'USDT', network: 'tron' })],
    ['testWallet', () => verifier.testWallet({ url_callback: 'https://a.test/h', currency: 'USDT', network: 'tron' })],
  ];

  it.each(cases)('%s rejects when no transport is attached', async (_name, run) => {
    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = run();
    }).not.toThrow();

    await expect(promise).rejects.toThrow(/full client/);
  });
});
