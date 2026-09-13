import { describe, expect, it } from 'vitest';
import { CryptomusError } from '../src/core/errors.js';
import { signPayload } from '../src/core/signature.js';
import { ok, testClient } from './helpers.js';

const PAYMENT_KEY = 'test-payment-key';
const PAYOUT_KEY = 'test-payout-key';

describe('endpoint coverage', () => {
  const cases: Array<{
    name: string;
    path: string;
    key: string;
    run: (client: ReturnType<typeof testClient>['client']) => Promise<unknown>;
  }> = [
    {
      name: 'payments.create',
      path: '/v1/payment',
      key: PAYMENT_KEY,
      run: (c) => c.payments.create({ amount: '1', currency: 'USD', order_id: 'o1' }),
    },
    {
      name: 'payments.info',
      path: '/v1/payment/info',
      key: PAYMENT_KEY,
      run: (c) => c.payments.info({ uuid: 'u1' }),
    },
    {
      name: 'payments.list',
      path: '/v1/payment/list',
      key: PAYMENT_KEY,
      run: (c) => c.payments.list(),
    },
    {
      name: 'payments.services',
      path: '/v1/payment/services',
      key: PAYMENT_KEY,
      run: (c) => c.payments.services(),
    },
    {
      name: 'payments.refund',
      path: '/v1/payment/refund',
      key: PAYMENT_KEY,
      run: (c) => c.payments.refund({ uuid: 'u1', address: 'T...', is_subtract: true }),
    },
    {
      name: 'payments.resendWebhook',
      path: '/v2/payment/resend',
      key: PAYMENT_KEY,
      run: (c) => c.payments.resendWebhook({ uuid: 'u1' }),
    },
    {
      name: 'payments.qrCode',
      path: '/v1/payment/qr',
      key: PAYMENT_KEY,
      run: (c) => c.payments.qrCode({ merchant_payment_uuid: 'u1' }),
    },
    {
      name: 'payments.markAsPaid',
      path: '/v1/payment/mark-as-paid',
      key: PAYMENT_KEY,
      run: (c) => c.payments.markAsPaid({ uuid: 'u1' }),
    },
    {
      name: 'payments.discounts',
      path: '/v1/payment/discount/list',
      key: PAYMENT_KEY,
      run: (c) => c.payments.discounts(),
    },
    {
      name: 'payments.setDiscount',
      path: '/v1/payment/discount/set',
      key: PAYMENT_KEY,
      run: (c) => c.payments.setDiscount({ currency: 'USDT', network: 'tron', discount_percent: 5 }),
    },
    {
      name: 'wallets.create',
      path: '/v1/wallet',
      key: PAYMENT_KEY,
      run: (c) => c.wallets.create({ currency: 'USDT', network: 'tron', order_id: 'w1' }),
    },
    {
      name: 'wallets.block',
      path: '/v1/wallet/block-address',
      key: PAYMENT_KEY,
      run: (c) => c.wallets.block({ uuid: 'w1' }),
    },
    {
      name: 'wallets.refundBlocked',
      path: '/v1/wallet/blocked-address-refund',
      key: PAYMENT_KEY,
      run: (c) => c.wallets.refundBlocked({ uuid: 'w1', address: 'T...' }),
    },
    {
      name: 'wallets.qrCode',
      path: '/v1/wallet/qr',
      key: PAYMENT_KEY,
      run: (c) => c.wallets.qrCode({ wallet_address_uuid: 'w1' }),
    },
    {
      name: 'payouts.create',
      path: '/v1/payout',
      key: PAYOUT_KEY,
      run: (c) =>
        c.payouts.create({
          amount: '1',
          currency: 'USDT',
          order_id: 'p1',
          address: 'T...',
          is_subtract: true,
        }),
    },
    {
      name: 'payouts.info',
      path: '/v1/payout/info',
      key: PAYOUT_KEY,
      run: (c) => c.payouts.info({ uuid: 'p1' }),
    },
    {
      name: 'payouts.list',
      path: '/v1/payout/list',
      key: PAYOUT_KEY,
      run: (c) => c.payouts.list(),
    },
    {
      name: 'payouts.services',
      path: '/v1/payout/services',
      key: PAYOUT_KEY,
      run: (c) => c.payouts.services(),
    },
    {
      name: 'payouts.transferToPersonal',
      path: '/v1/transfer/to-personal',
      key: PAYOUT_KEY,
      run: (c) => c.payouts.transferToPersonal({ amount: '1', currency: 'USDT' }),
    },
    {
      name: 'payouts.transferToBusiness',
      path: '/v1/transfer/to-business',
      key: PAYOUT_KEY,
      run: (c) => c.payouts.transferToBusiness({ amount: '1', currency: 'USDT' }),
    },
    {
      name: 'recurring.create',
      path: '/v1/recurrence/create',
      key: PAYMENT_KEY,
      run: (c) =>
        c.recurring.create({ amount: '9', currency: 'USD', name: 'Pro plan', period: 'monthly' }),
    },
    {
      name: 'recurring.info',
      path: '/v1/recurrence/info',
      key: PAYMENT_KEY,
      run: (c) => c.recurring.info({ uuid: 'r1' }),
    },
    {
      name: 'recurring.list',
      path: '/v1/recurrence/list',
      key: PAYMENT_KEY,
      run: (c) => c.recurring.list(),
    },
    {
      name: 'recurring.cancel',
      path: '/v1/recurrence/cancel',
      key: PAYMENT_KEY,
      run: (c) => c.recurring.cancel({ uuid: 'r1' }),
    },
    {
      name: 'misc.balanceRaw',
      path: '/v1/balance',
      key: PAYMENT_KEY,
      run: (c) => c.misc.balanceRaw(),
    },
    {
      name: 'webhooks.testPayment',
      path: '/v1/test-webhook/payment',
      key: PAYMENT_KEY,
      run: (c) =>
        c.webhooks.testPayment({
          url_callback: 'https://a.test/hook',
          currency: 'USDT',
          network: 'tron',
        }),
    },
    {
      name: 'webhooks.testWallet',
      path: '/v1/test-webhook/wallet',
      key: PAYMENT_KEY,
      run: (c) =>
        c.webhooks.testWallet({
          url_callback: 'https://a.test/hook',
          currency: 'USDT',
          network: 'tron',
        }),
    },
  ];

  it.each(cases)('$name posts to $path with the right key', async ({ path, key, run }) => {
    const { client, mock } = testClient({ body: ok([]) });

    await run(client);

    expect(mock.last?.url).toBe(`https://api.cryptomus.com${path}`);
    expect(mock.last?.method).toBe('POST');
    expect(mock.last?.headers['sign']).toBe(signPayload(mock.last!.body!, key));
  });
});

describe('parameter forwarding', () => {
  it('passes create-invoice parameters through verbatim', async () => {
    const { client, mock } = testClient({ body: ok({}) });

    await client.payments.create({
      amount: '19.99',
      currency: 'USD',
      order_id: 'order-1024',
      network: 'tron',
      lifetime: 7200,
      is_payment_multiple: false,
      subtract: 100,
      currencies: [{ currency: 'USDT', network: 'tron' }],
      additional_data: 'seat-12',
    });

    expect(mock.last?.json).toEqual({
      amount: '19.99',
      currency: 'USD',
      order_id: 'order-1024',
      network: 'tron',
      lifetime: 7200,
      is_payment_multiple: false,
      subtract: 100,
      currencies: [{ currency: 'USDT', network: 'tron' }],
      additional_data: 'seat-12',
    });
  });

  it('defaults the webhook test status to paid', async () => {
    const { client, mock } = testClient({ body: ok([]) });

    await client.webhooks.testPayment({
      url_callback: 'https://a.test/hook',
      currency: 'USDT',
      network: 'tron',
    });

    expect(mock.last?.json).toMatchObject({ status: 'paid' });
  });

  it('lets an explicit webhook test status win over the default', async () => {
    const { client, mock } = testClient({ body: ok([]) });

    await client.webhooks.testPayment({
      url_callback: 'https://a.test/hook',
      currency: 'USDT',
      network: 'tron',
      status: 'wrong_amount',
    });

    expect(mock.last?.json).toMatchObject({ status: 'wrong_amount' });
  });
});

describe('identifier validation', () => {
  it.each([
    ['payments.info', (c: ReturnType<typeof testClient>['client']) => c.payments.info({})],
    [
      'payments.refund',
      (c: ReturnType<typeof testClient>['client']) =>
        c.payments.refund({ address: 'T...', is_subtract: true }),
    ],
    ['payouts.info', (c: ReturnType<typeof testClient>['client']) => c.payouts.info({})],
    ['recurring.cancel', (c: ReturnType<typeof testClient>['client']) => c.recurring.cancel({})],
    ['wallets.block', (c: ReturnType<typeof testClient>['client']) => c.wallets.block({})],
  ])('%s fails fast without uuid or order_id', async (_name, run) => {
    const { client, mock } = testClient({ body: ok({}) });

    await expect(run(client)).rejects.toBeInstanceOf(CryptomusError);
    expect(mock.requests).toHaveLength(0);
  });

  it('resendWebhook accepts txid alone', async () => {
    const { client, mock } = testClient({ body: ok([]) });

    await client.payments.resendWebhook({ txid: '0xabc' });

    expect(mock.requests).toHaveLength(1);
  });

  it('resendWebhook fails fast with no identifier at all', async () => {
    const { client, mock } = testClient({ body: ok([]) });

    await expect(client.payments.resendWebhook({})).rejects.toThrow(/uuid.*order_id.*txid/);
    expect(mock.requests).toHaveLength(0);
  });
});

describe('pagination', () => {
  it('sends the cursor as a query parameter', async () => {
    const { client, mock } = testClient({
      body: ok({ items: [], paginate: { count: 0, hasPages: false, nextCursor: null, previousCursor: null, perPage: 15 } }),
    });

    await client.payments.list({ date_from: '2026-01-01 00:00:00' }, { cursor: 'abc123' });

    expect(mock.last?.url).toBe('https://api.cryptomus.com/v1/payment/list?cursor=abc123');
    expect(mock.last?.json).toEqual({ date_from: '2026-01-01 00:00:00' });
  });

  it('walks every page with listAll', async () => {
    const page = (items: string[], nextCursor: string | null) =>
      ok({
        items: items.map((order_id) => ({ order_id })),
        paginate: { count: items.length, hasPages: nextCursor !== null, nextCursor, previousCursor: null, perPage: 2 },
      });

    const { client, mock } = testClient([
      { body: page(['a', 'b'], 'cursor-2') },
      { body: page(['c', 'd'], 'cursor-3') },
      { body: page(['e'], null) },
    ]);

    const collected: string[] = [];
    for await (const payment of client.payments.listAll()) collected.push(payment.order_id);

    expect(collected).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(mock.requests).toHaveLength(3);
    expect(mock.requests[1]?.url).toContain('cursor=cursor-2');
    expect(mock.requests[2]?.url).toContain('cursor=cursor-3');
  });

  it('walks payout history too', async () => {
    const { client, mock } = testClient({
      body: ok({
        items: [{ uuid: 'p1' }],
        paginate: { count: 1, hasPages: false, nextCursor: null, previousCursor: null, perPage: 15 },
      }),
    });

    const collected = [];
    for await (const payout of client.payouts.listAll()) collected.push(payout.uuid);

    expect(collected).toEqual(['p1']);
    expect(mock.requests).toHaveLength(1);
  });
});

describe('misc', () => {
  it('unwraps the single-element balance array', async () => {
    const breakdown = {
      merchant: [{ uuid: 'm1', balance: '100.00', currency_code: 'USDT' }],
      user: [{ uuid: 'u1', balance: '5.00', currency_code: 'BTC' }],
    };

    const { client } = testClient({ body: ok([{ balance: breakdown }]) });

    await expect(client.misc.balance()).resolves.toEqual(breakdown);
  });

  it('returns empty wallets rather than throwing on an unexpected balance shape', async () => {
    const { client } = testClient({ body: ok([]) });

    await expect(client.misc.balance()).resolves.toEqual({ merchant: [], user: [] });
  });

  it('url-encodes the exchange-rate currency', async () => {
    const { client, mock } = testClient({ body: ok([]) });

    await client.misc.exchangeRates('BTC/USD');

    expect(mock.last?.url).toBe('https://api.cryptomus.com/v1/exchange-rate/BTC%2FUSD/list');
  });
});

describe('waitForFinalStatus', () => {
  it('polls until the invoice is final', async () => {
    const { client, mock } = testClient([
      { body: ok({ uuid: 'u1', payment_status: 'check', is_final: false }) },
      { body: ok({ uuid: 'u1', payment_status: 'confirm_check', is_final: false }) },
      { body: ok({ uuid: 'u1', payment_status: 'paid', is_final: true }) },
    ]);

    const seen: string[] = [];
    const payment = await client.payments.waitForFinalStatus(
      { uuid: 'u1' },
      { intervalMs: 1, onPoll: (p) => seen.push(p.payment_status) },
    );

    expect(payment.payment_status).toBe('paid');
    expect(seen).toEqual(['check', 'confirm_check', 'paid']);
    expect(mock.requests).toHaveLength(3);
  });

  it('treats a final status as final even when is_final is absent', async () => {
    const { client } = testClient({ body: ok({ uuid: 'u1', payment_status: 'cancel' }) });

    const payment = await client.payments.waitForFinalStatus({ uuid: 'u1' }, { intervalMs: 1 });

    expect(payment.payment_status).toBe('cancel');
  });

  it('gives up once the deadline passes', async () => {
    const { client } = testClient({ body: ok({ uuid: 'u1', payment_status: 'check', is_final: false }) });

    await expect(
      client.payments.waitForFinalStatus({ uuid: 'u1' }, { intervalMs: 20, timeoutMs: 10 }),
    ).rejects.toThrow(/did not reach a final status/);
  });
});

describe('validation rejects rather than throwing synchronously', () => {
  type Client = ReturnType<typeof testClient>['client'];

  const validating: Array<[string, (c: Client) => Promise<unknown>]> = [
    ['payments.info', (c) => c.payments.info({})],
    ['payments.refund', (c) => c.payments.refund({ address: 'T...', is_subtract: true })],
    ['payments.markAsPaid', (c) => c.payments.markAsPaid({})],
    ['payments.resendWebhook', (c) => c.payments.resendWebhook({})],
    ['payouts.info', (c) => c.payouts.info({})],
    ['recurring.info', (c) => c.recurring.info({})],
    ['recurring.cancel', (c) => c.recurring.cancel({})],
    ['wallets.block', (c) => c.wallets.block({})],
    ['wallets.refundBlocked', (c) => c.wallets.refundBlocked({ address: 'T...' })],
  ];

  it.each(validating)('%s rejects and never throws synchronously', async (_name, run) => {
    const { client, mock } = testClient({ body: ok({}) });

    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = run(client);
    }).not.toThrow();

    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toBeInstanceOf(CryptomusError);
    expect(mock.requests).toHaveLength(0);
  });

  it('a missing payout key rejects rather than throwing synchronously', async () => {
    const { client, mock } = testClient({ body: ok({}) }, { payoutKey: undefined });

    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = client.payouts.create({
        amount: '1',
        currency: 'USDT',
        order_id: 'p1',
        address: 'T...',
        is_subtract: true,
      });
    }).not.toThrow();

    await expect(promise).rejects.toThrow(/payout API key/);
    expect(mock.requests).toHaveLength(0);
  });
});
