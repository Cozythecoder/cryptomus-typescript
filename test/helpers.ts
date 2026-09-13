import { vi } from 'vitest';
import { CryptomusClient } from '../src/core/client.js';

export const MERCHANT_ID = '8b03432e-385b-4670-8d06-064591096795';
export const PAYMENT_KEY = 'test-payment-key';
export const PAYOUT_KEY = 'test-payout-key';

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  json?: unknown;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  throws?: Error;
}

export interface MockFetch {
  fetch: typeof globalThis.fetch;
  requests: CapturedRequest[];
  readonly last: CapturedRequest | undefined;
}

export function mockFetch(responses: MockResponse | MockResponse[]): MockFetch {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const requests: CapturedRequest[] = [];

  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : undefined;

    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      body,
      json: body ? safeParse(body) : undefined,
    });

    const next = queue.length > 1 ? queue.shift()! : (queue[0] ?? { body: { state: 0, result: {} } });

    if (next.throws) throw next.throws;

    return new Response(next.body === undefined ? '' : JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json', ...next.headers },
    });
  });

  return {
    fetch: impl as unknown as typeof globalThis.fetch,
    requests,
    get last() {
      return requests[requests.length - 1];
    },
  };
}

export function testClient(responses: MockResponse | MockResponse[], overrides = {}) {
  const mock = mockFetch(responses);

  const client = new CryptomusClient({
    merchantId: MERCHANT_ID,
    paymentKey: PAYMENT_KEY,
    payoutKey: PAYOUT_KEY,
    fetch: mock.fetch,
    maxRetries: 0,
    retryDelayMs: 1,
    ...overrides,
  });

  return { client, mock };
}

export const ok = (result: unknown) => ({ state: 0, result });

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
