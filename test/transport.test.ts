import { describe, expect, it, vi } from 'vitest';
import { CryptomusClient } from '../src/core/client.js';
import {
  CryptomusApiError,
  CryptomusAuthenticationError,
  CryptomusError,
  CryptomusNetworkError,
  CryptomusRateLimitError,
  CryptomusTimeoutError,
  CryptomusValidationError,
} from '../src/core/errors.js';
import { signPayload } from '../src/core/signature.js';
import { MERCHANT_ID, PAYMENT_KEY, mockFetch, ok, testClient } from './helpers.js';

describe('request signing', () => {
  it('sends merchant, sign and content-type headers', async () => {
    const { client, mock } = testClient({ body: ok({ uuid: 'a' }) });

    await client.payments.create({ amount: '15.00', currency: 'USD', order_id: 'order-1' });

    expect(mock.last?.headers['merchant']).toBe(MERCHANT_ID);
    expect(mock.last?.headers['Content-Type']).toBe('application/json');
    expect(mock.last?.headers['sign']).toBe(signPayload(mock.last!.body!, PAYMENT_KEY));
  });

  it('signs the exact bytes it transmits', async () => {
    const { client, mock } = testClient({ body: ok({}) });

    await client.payments.create({
      amount: '15.00',
      currency: 'USD',
      order_id: 'order-1',
      url_callback: 'https://merchant.test/api/hook',
    });

    expect(mock.last?.body).toContain('https:\\/\\/merchant.test\\/api\\/hook');
    expect(mock.last?.headers['sign']).toBe(signPayload(mock.last!.body!, PAYMENT_KEY));
  });

  it('signs payout endpoints with the payout key', async () => {
    const { client, mock } = testClient({ body: ok({}) });

    await client.payouts.create({
      amount: '10',
      currency: 'USDT',
      order_id: 'payout-1',
      address: 'T...',
      is_subtract: true,
      network: 'tron',
    });

    expect(mock.last?.headers['sign']).toBe(signPayload(mock.last!.body!, 'test-payout-key'));
    expect(mock.last?.headers['sign']).not.toBe(signPayload(mock.last!.body!, PAYMENT_KEY));
  });

  it('signs bodyless endpoints as an empty object', async () => {
    const { client, mock } = testClient({ body: ok([]) });

    await client.payments.services();

    expect(mock.last?.body).toBe('{}');
  });

  it('sends no credentials to the public exchange-rate endpoint', async () => {
    const { client, mock } = testClient({ body: ok([]) });

    await client.misc.exchangeRates('ETH');

    expect(mock.last?.url).toBe('https://api.cryptomus.com/v1/exchange-rate/ETH/list');
    expect(mock.last?.method).toBe('GET');
    expect(mock.last?.headers['merchant']).toBeUndefined();
    expect(mock.last?.headers['sign']).toBeUndefined();
  });

  it('refuses payout calls when no payout key was configured', async () => {
    const mock = mockFetch({ body: ok({}) });
    const client = new CryptomusClient({
      merchantId: MERCHANT_ID,
      paymentKey: PAYMENT_KEY,
      fetch: mock.fetch,
    });

    await expect(
      client.payouts.create({
        amount: '10',
        currency: 'USDT',
        order_id: 'p1',
        address: 'T...',
        is_subtract: true,
      }),
    ).rejects.toThrow(/payout API key/);

    expect(mock.requests).toHaveLength(0);
  });

  it('requires a merchant id', () => {
    expect(() => new CryptomusClient({ merchantId: '' })).toThrow(CryptomusError);
  });
});

describe('response handling', () => {
  it('unwraps the result envelope', async () => {
    const { client } = testClient({ body: ok({ uuid: 'abc', order_id: 'order-1' }) });

    await expect(client.payments.info({ order_id: 'order-1' })).resolves.toEqual({
      uuid: 'abc',
      order_id: 'order-1',
    });
  });

  it('throws on HTTP 200 with a non-zero state', async () => {
    const { client } = testClient({ body: { state: 1, message: 'Payment not found' } });

    await expect(client.payments.info({ uuid: 'missing' })).rejects.toMatchObject({
      name: 'CryptomusApiError',
      message: 'Payment not found',
      state: 1,
    });
  });

  it('maps 422 to a validation error and exposes the field messages', async () => {
    const { client } = testClient({
      status: 422,
      body: { state: 1, errors: { amount: ['The amount field is required.'] } },
    });

    const error = await client.payments
      .create({ amount: '', currency: 'USD', order_id: 'x' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CryptomusValidationError);
    expect((error as CryptomusValidationError).errors).toEqual({
      amount: ['The amount field is required.'],
    });
    expect((error as CryptomusValidationError).validationMessages).toEqual([
      'amount: The amount field is required.',
    ]);
    expect((error as CryptomusValidationError).message).toContain('The amount field is required.');
  });

  it('maps 401 and 403 to an authentication error', async () => {
    for (const status of [401, 403]) {
      const { client } = testClient({ status, body: { state: 1, message: 'Unauthorized' } });
      await expect(client.payments.services()).rejects.toBeInstanceOf(CryptomusAuthenticationError);
    }
  });

  it('maps 429 to a rate-limit error carrying retry-after', async () => {
    const { client } = testClient({
      status: 429,
      body: { state: 1, message: 'Too many requests' },
      headers: { 'retry-after': '7' },
    });

    const error = await client.payments.services().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CryptomusRateLimitError);
    expect((error as CryptomusRateLimitError).retryAfter).toBe(7);
  });

  it('normalises a bare-string validation error into an array', async () => {
    const { client } = testClient({
      status: 422,
      body: { state: 1, errors: { order_id: 'already exists' } },
    });

    const error = await client.payments.services().catch((e: unknown) => e);
    expect((error as CryptomusValidationError).errors).toEqual({ order_id: ['already exists'] });
  });

  it('reports the endpoint that failed', async () => {
    const { client } = testClient({ status: 500, body: { state: 1, message: 'boom' } });

    const error = await client.payments.create({
      amount: '1',
      currency: 'USD',
      order_id: 'x',
    }).catch((e: unknown) => e);

    expect((error as CryptomusApiError).endpoint).toBe('/v1/payment');
    expect((error as CryptomusApiError).status).toBe(500);
  });

  it('raises a clear error for a non-JSON success body', async () => {
    const impl = vi.fn(
      async () => new Response('<html>maintenance</html>', { status: 200 }),
    ) as unknown as typeof globalThis.fetch;

    const client = new CryptomusClient({
      merchantId: MERCHANT_ID,
      paymentKey: PAYMENT_KEY,
      fetch: impl,
      maxRetries: 0,
    });

    await expect(client.payments.services()).rejects.toThrow(/non-JSON/);
  });
});

describe('retries', () => {
  it('retries a 500 and returns the eventual success', async () => {
    const { client, mock } = testClient(
      [
        { status: 500, body: { state: 1, message: 'server error' } },
        { body: ok({ uuid: 'recovered' }) },
      ],
      { maxRetries: 2 },
    );

    await expect(client.payments.info({ uuid: 'x' })).resolves.toEqual({ uuid: 'recovered' });
    expect(mock.requests).toHaveLength(2);
  });

  it('retries a transport failure', async () => {
    const { client, mock } = testClient(
      [{ throws: new TypeError('fetch failed') }, { body: ok({ uuid: 'recovered' }) }],
      { maxRetries: 2 },
    );

    await expect(client.payments.info({ uuid: 'x' })).resolves.toEqual({ uuid: 'recovered' });
    expect(mock.requests).toHaveLength(2);
  });

  it('does not retry a 422, because the request will never become valid', async () => {
    const { client, mock } = testClient(
      { status: 422, body: { state: 1, errors: { amount: ['required'] } } },
      { maxRetries: 3 },
    );

    await expect(client.payments.services()).rejects.toBeInstanceOf(CryptomusValidationError);
    expect(mock.requests).toHaveLength(1);
  });

  it('does not retry a business failure returned with HTTP 200', async () => {
    const { client, mock } = testClient(
      { body: { state: 1, message: 'Payment not found' } },
      { maxRetries: 3 },
    );

    await expect(client.payments.info({ uuid: 'x' })).rejects.toBeInstanceOf(CryptomusApiError);
    expect(mock.requests).toHaveLength(1);
  });

  it('gives up after maxRetries and surfaces the last error', async () => {
    const { client, mock } = testClient({ throws: new TypeError('fetch failed') }, { maxRetries: 2 });

    await expect(client.payments.services()).rejects.toBeInstanceOf(CryptomusNetworkError);
    expect(mock.requests).toHaveLength(3);
  });
});

describe('timeouts and cancellation', () => {
  it('raises a timeout error when the request outlives the deadline', async () => {
    const impl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof globalThis.fetch;

    const client = new CryptomusClient({
      merchantId: MERCHANT_ID,
      paymentKey: PAYMENT_KEY,
      fetch: impl,
      timeoutMs: 20,
      maxRetries: 0,
    });

    await expect(client.payments.services()).rejects.toBeInstanceOf(CryptomusTimeoutError);
  });

  it('honours a caller-supplied abort signal', async () => {
    const controller = new AbortController();

    const impl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof globalThis.fetch;

    const client = new CryptomusClient({
      merchantId: MERCHANT_ID,
      paymentKey: PAYMENT_KEY,
      fetch: impl,
      maxRetries: 3,
    });

    const promise = client.payments.services({ signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow(/aborted by caller/i);
  });
});

describe('telemetry', () => {
  it('reports every attempt to onRequest', async () => {
    const onRequest = vi.fn();
    const { client } = testClient(
      [{ status: 503, body: { state: 1, message: 'down' } }, { body: ok({}) }],
      { maxRetries: 2, onRequest },
    );

    await client.payments.services();

    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(onRequest.mock.calls[0]?.[0]).toMatchObject({
      endpoint: '/v1/payment/services',
      method: 'POST',
      status: 503,
      attempt: 0,
    });
    expect(onRequest.mock.calls[1]?.[0]).toMatchObject({ status: 200, attempt: 1 });
  });
});

describe('configuration', () => {
  it('respects a custom base URL', async () => {
    const { client, mock } = testClient({ body: ok([]) }, { baseUrl: 'https://sandbox.test/api/' });

    await client.payments.services();

    expect(mock.last?.url).toBe('https://sandbox.test/api/v1/payment/services');
  });

  it('merges default headers', async () => {
    const { client, mock } = testClient(
      { body: ok([]) },
      { defaultHeaders: { 'x-trace-id': 'abc123' } },
    );

    await client.payments.services();

    expect(mock.last?.headers['x-trace-id']).toBe('abc123');
  });

  it('builds from environment variables', () => {
    const client = CryptomusClient.fromEnv({}, {
      CRYPTOMUS_MERCHANT_ID: MERCHANT_ID,
      CRYPTOMUS_PAYMENT_KEY: PAYMENT_KEY,
      CRYPTOMUS_PAYOUT_KEY: 'payout',
    });

    expect(client).toBeInstanceOf(CryptomusClient);
  });

  it('names the missing environment variable', () => {
    expect(() => CryptomusClient.fromEnv({}, {})).toThrow(/CRYPTOMUS_MERCHANT_ID/);
  });
});
