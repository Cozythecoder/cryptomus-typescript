import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptomusClient } from '../src/core/client.js';

const MERCHANT_ID = '8b03432e-385b-4670-8d06-064591096795';
const PAYMENT_KEY = 'integration-payment-key';
const PAYOUT_KEY = 'integration-payout-key';

function phpEncode(value: unknown): string {
  return JSON.stringify(value).replace(/[-￿/]/g, (char) =>
    char === '/' ? '\\/' : '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

function expectedSign(rawBody: string, key: string): string {
  return createHash('md5')
    .update(Buffer.from(rawBody, 'utf8').toString('base64') + key, 'utf8')
    .digest('hex');
}

interface ReceivedRequest {
  path: string;
  method: string;
  merchant?: string;
  sign?: string;
  rawBody: string;
  signatureValid: boolean;
  signedWith: 'payment' | 'payout' | 'none';
}

let server: Server;
let baseUrl: string;
let received: ReceivedRequest[] = [];

const routes: Record<string, (body: unknown) => { status?: number; payload: unknown }> = {
  '/v1/payment': (body) => ({
    payload: {
      state: 0,
      result: {
        uuid: 'inv-0001',
        order_id: (body as { order_id: string }).order_id,
        amount: (body as { amount: string }).amount,
        payment_status: 'check',
        url: 'https://pay.cryptomus.com/pay/inv-0001',
        is_final: false,
        currency: 'USD',
        expired_at: 1789000000,
      },
    },
  }),
  '/v1/payment/info': () => ({
    payload: {
      state: 0,
      result: { uuid: 'inv-0001', order_id: 'order-1', payment_status: 'paid', is_final: true },
    },
  }),
  '/v1/payment/services': () => ({
    payload: {
      state: 0,
      result: [
        {
          network: 'tron',
          currency: 'USDT',
          is_available: true,
          limit: { min_amount: '1', max_amount: '10000' },
          commission: { fee_amount: '0', percent: '1' },
        },
      ],
    },
  }),
  '/v1/payout': () => ({
    payload: {
      state: 0,
      result: { uuid: 'pay-0001', status: 'process', is_final: false, balance: 900 },
    },
  }),
  '/v1/balance': () => ({
    payload: {
      state: 0,
      result: [
        {
          balance: {
            merchant: [{ uuid: 'm1', balance: '250.00', currency_code: 'USDT' }],
            user: [{ uuid: 'u1', balance: '0.01', currency_code: 'BTC' }],
          },
        },
      ],
    },
  }),
  '/v1/payment/refund': () => ({
    status: 422,
    payload: { state: 1, errors: { address: ['The address field is required.'] } },
  }),
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const path = (req.url ?? '').split('?')[0] ?? '';
      const sign = req.headers['sign'] as string | undefined;

      const matchesPayment = sign === expectedSign(rawBody, PAYMENT_KEY);
      const matchesPayout = sign === expectedSign(rawBody, PAYOUT_KEY);

      received.push({
        path,
        method: req.method ?? '',
        merchant: req.headers['merchant'] as string | undefined,
        sign,
        rawBody,
        signatureValid: matchesPayment || matchesPayout,
        signedWith: matchesPayment ? 'payment' : matchesPayout ? 'payout' : 'none',
      });

      if (sign && !matchesPayment && !matchesPayout) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ state: 1, message: 'Wrong api key' }));
        return;
      }

      if (path.startsWith('/v1/exchange-rate/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ state: 0, result: [{ from: 'ETH', to: 'USD', course: '3500.00' }] }));
        return;
      }

      const route = routes[path];

      if (!route) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ state: 1, message: `No route for ${path}` }));
        return;
      }

      const { status = 200, payload } = route(rawBody ? JSON.parse(rawBody) : {});
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function client(overrides = {}) {
  received = [];
  return new CryptomusClient({
    merchantId: MERCHANT_ID,
    paymentKey: PAYMENT_KEY,
    payoutKey: PAYOUT_KEY,
    baseUrl,
    maxRetries: 0,
    ...overrides,
  });
}

describe('live HTTP round trips', () => {
  it('creates an invoice with a signature the server independently accepts', async () => {
    const invoice = await client().payments.create({
      amount: '19.99',
      currency: 'USD',
      order_id: 'order-1',
      url_callback: 'https://merchant.test/api/cryptomus/webhook',
      url_success: 'https://merchant.test/checkout/done',
    });

    expect(invoice.uuid).toBe('inv-0001');
    expect(invoice.url).toBe('https://pay.cryptomus.com/pay/inv-0001');

    const request = received[0]!;
    expect(request.signatureValid).toBe(true);
    expect(request.signedWith).toBe('payment');
    expect(request.merchant).toBe(MERCHANT_ID);
    expect(request.rawBody).toContain('https:\\/\\/merchant.test\\/api\\/cryptomus\\/webhook');
  });

  it('signs payouts with the payout key', async () => {
    const payout = await client().payouts.create({
      amount: '100',
      currency: 'USDT',
      network: 'tron',
      order_id: 'payout-1',
      address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
      is_subtract: true,
    });

    expect(payout.uuid).toBe('pay-0001');
    expect(received[0]!.signedWith).toBe('payout');
  });

  it('signs a body-less request as {}', async () => {
    const services = await client().payments.services();

    expect(services[0]?.currency).toBe('USDT');
    expect(received[0]!.rawBody).toBe('{}');
    expect(received[0]!.signatureValid).toBe(true);
  });

  it('unwraps the nested balance envelope', async () => {
    const balance = await client().misc.balance();

    expect(balance.merchant[0]).toEqual({ uuid: 'm1', balance: '250.00', currency_code: 'USDT' });
    expect(balance.user[0]?.currency_code).toBe('BTC');
  });

  it('calls the public exchange-rate endpoint without credentials', async () => {
    const rates = await client().misc.exchangeRates('ETH');

    expect(rates).toEqual([{ from: 'ETH', to: 'USD', course: '3500.00' }]);
    expect(received[0]!.merchant).toBeUndefined();
    expect(received[0]!.method).toBe('GET');
  });

  it('surfaces a 422 as a validation error with field messages', async () => {
    const error = (await client()
      .payments.refund({ uuid: 'inv-0001', address: '', is_subtract: true })
      .catch((e: unknown) => e)) as Error;

    expect(error).toMatchObject({
      name: 'CryptomusValidationError',
      status: 422,
      endpoint: '/v1/payment/refund',
    });
    expect(error.message).toContain('The address field is required.');
  });

  it('is rejected by the server when the key is wrong', async () => {
    const wrong = new CryptomusClient({
      merchantId: MERCHANT_ID,
      paymentKey: 'not-the-right-key',
      baseUrl,
      maxRetries: 0,
    });
    received = [];

    await expect(wrong.payments.services()).rejects.toMatchObject({
      name: 'CryptomusAuthenticationError',
      status: 403,
    });
    expect(received[0]!.signatureValid).toBe(false);
  });

  it('signs non-ASCII payloads the server accepts', async () => {
    await client().payments.create({
      amount: '5.00',
      currency: 'USD',
      order_id: 'order-khmer',
      additional_data: 'ការទូទាត់ · héllo · 🚀',
    });

    const request = received[0]!;
    expect(request.signatureValid).toBe(true);
    expect(request.rawBody).toContain('\\u1780\\u17b6\\u179a');
    expect(request.rawBody).toContain('h\\u00e9llo');
    expect(request.rawBody).toContain('\\ud83d\\ude80');
    expect(request.rawBody).not.toContain('ការ');
  });

  it('matches an independent PHP-style encoder byte for byte', async () => {
    const params = {
      amount: '19.99',
      currency: 'USD',
      order_id: 'order-1',
      url_callback: 'https://merchant.test/hook?a=1&b=2',
      additional_data: 'héllo/world',
    };

    await client().payments.create(params);

    expect(received[0]!.rawBody).toBe(phpEncode(params));
    expect(received[0]!.sign).toBe(expectedSign(phpEncode(params), PAYMENT_KEY));
  });

  it('walks a real 404 into a typed API error', async () => {
    const error = await client()
      .recurring.info({ uuid: 'r1' })
      .catch((e: unknown) => e as Error);

    expect(error).toMatchObject({ name: 'CryptomusApiError', status: 404 });
  });
});

describe('live retry behaviour', () => {
  it('retries a flapping endpoint and succeeds', async () => {
    let hits = 0;

    const flaky = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        hits++;
        if (hits < 3) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ state: 1, message: 'temporarily unavailable' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ state: 0, result: [] }));
      });
    });

    await new Promise<void>((resolve) => flaky.listen(0, '127.0.0.1', resolve));
    const port = (flaky.address() as AddressInfo).port;

    try {
      const c = new CryptomusClient({
        merchantId: MERCHANT_ID,
        paymentKey: PAYMENT_KEY,
        baseUrl: `http://127.0.0.1:${port}`,
        maxRetries: 3,
        retryDelayMs: 5,
      });

      await expect(c.payments.services()).resolves.toEqual([]);
      expect(hits).toBe(3);
    } finally {
      await new Promise<void>((resolve) => flaky.close(() => resolve()));
    }
  });
});
