import {
  CryptomusApiError,
  CryptomusError,
  CryptomusNetworkError,
  CryptomusTimeoutError,
  errorForStatus,
  type CryptomusValidationErrors,
} from './errors.js';
import { signPayload, signValue } from './signature.js';
import type {
  CryptomusClientConfig,
  CryptomusEnvelope,
  CryptomusKeyKind,
  RequestOptions,
} from '../types/common.js';

export const DEFAULT_BASE_URL = 'https://api.cryptomus.com';

interface DispatchArgs {
  method: 'GET' | 'POST';
  path: string;
  key: CryptomusKeyKind;
  body?: unknown;
  options?: RequestOptions;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class CryptomusTransport {
  private readonly merchantId: string;
  private readonly paymentKey?: string;
  private readonly payoutKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly onRequest?: CryptomusClientConfig['onRequest'];

  constructor(config: CryptomusClientConfig) {
    if (!config.merchantId) {
      throw new CryptomusError('`merchantId` is required to create a Cryptomus client.');
    }

    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new CryptomusError(
        'No global fetch available. Use Node 18+, or pass a `fetch` implementation in the client config.',
      );
    }

    this.merchantId = config.merchantId;
    this.paymentKey = config.paymentKey;
    this.payoutKey = config.payoutKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.retryDelayMs = config.retryDelayMs ?? 300;
    this.fetchImpl = config.fetch ? fetchImpl : fetchImpl.bind(globalThis);
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.onRequest = config.onRequest;
  }

  private resolveKey(kind: CryptomusKeyKind): string | undefined {
    if (kind === 'none') return undefined;

    if (kind === 'payout') {
      if (!this.payoutKey) {
        throw new CryptomusError(
          'This endpoint is signed with the payout API key. Pass `payoutKey` when creating the client.',
        );
      }
      return this.payoutKey;
    }

    if (!this.paymentKey) {
      throw new CryptomusError(
        'This endpoint is signed with the payment API key. Pass `paymentKey` when creating the client.',
      );
    }
    return this.paymentKey;
  }

  async request<T>({ method, path, key, body, options = {} }: DispatchArgs): Promise<T> {
    const apiKey = this.resolveKey(key);
    const url = this.buildUrl(path, options.query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };

    let payload: string | undefined;

    if (apiKey) {
      headers['merchant'] = this.merchantId;

      if (method === 'POST') {
        const signed = signValue(body ?? {}, apiKey);
        payload = signed.body;
        headers['sign'] = signed.signature;
        headers['Content-Type'] = 'application/json';
      } else {
        headers['sign'] = signPayload('', apiKey);
      }
    }

    const maxRetries = options.maxRetries ?? this.maxRetries;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startedAt = Date.now();

      try {
        const response = await this.send(url, method, headers, payload, options);

        this.onRequest?.({
          endpoint: path,
          method,
          status: response.status,
          attempt,
          durationMs: Date.now() - startedAt,
        });

        if (!response.ok && RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
          lastError = await this.toApiError(response, path);
          await this.backoff(attempt, response.headers.get('retry-after'));
          continue;
        }

        return await this.unwrap<T>(response, path);
      } catch (error) {
        if (error instanceof CryptomusApiError) throw error;

        this.onRequest?.({
          endpoint: path,
          method,
          attempt,
          durationMs: Date.now() - startedAt,
          error,
        });

        lastError = error;

        if (options.signal?.aborted === true || attempt >= maxRetries) {
          if (error instanceof CryptomusError) throw error;
          throw new CryptomusNetworkError(
            `Request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
            { endpoint: path, cause: error },
          );
        }

        await this.backoff(attempt);
      }
    }

    if (lastError instanceof CryptomusError) throw lastError;
    throw new CryptomusNetworkError(`Request to ${path} failed after ${maxRetries + 1} attempts.`, {
      endpoint: path,
      cause: lastError,
    });
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

    if (query) {
      for (const [name, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(name, String(value));
        }
      }
    }

    return url.toString();
  }

  private async send(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    options: RequestOptions,
  ): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) {
        throw new CryptomusNetworkError('Request aborted by caller.', { cause: error });
      }
      if (controller.signal.aborted) {
        throw new CryptomusTimeoutError(`Request timed out after ${timeoutMs}ms.`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private async unwrap<T>(response: Response, endpoint: string): Promise<T> {
    const text = await response.text();
    let parsed: unknown;

    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      if (!response.ok) {
        throw errorForStatus(response.status, `Cryptomus returned HTTP ${response.status}.`, {
          endpoint,
          raw: text,
        });
      }
      throw new CryptomusApiError('Cryptomus returned a non-JSON response.', {
        status: response.status,
        endpoint,
        raw: text,
      });
    }

    const envelope = parsed as Partial<CryptomusEnvelope<T>> | undefined;

    if (!response.ok) {
      throw errorForStatus(response.status, extractMessage(envelope, response.status), {
        endpoint,
        state: envelope?.state,
        errors: normaliseErrors(envelope?.errors),
        raw: parsed,
        retryAfter: parseRetryAfter(response.headers.get('retry-after')),
      });
    }

    if (envelope && typeof envelope.state === 'number' && envelope.state !== 0) {
      throw new CryptomusApiError(extractMessage(envelope, response.status), {
        status: response.status,
        endpoint,
        state: envelope.state,
        errors: normaliseErrors(envelope.errors),
        raw: parsed,
      });
    }

    return (envelope?.result ?? (parsed as T)) as T;
  }

  private async toApiError(response: Response, endpoint: string): Promise<CryptomusError> {
    try {
      await this.unwrap(response.clone(), endpoint);
    } catch (error) {
      if (error instanceof CryptomusError) return error;
    }
    return new CryptomusApiError(`Cryptomus returned HTTP ${response.status}.`, {
      status: response.status,
      endpoint,
    });
  }

  private async backoff(attempt: number, retryAfterHeader?: string | null): Promise<void> {
    const retryAfter = parseRetryAfter(retryAfterHeader);
    const delay =
      retryAfter !== undefined
        ? retryAfter * 1000
        : Math.round(this.retryDelayMs * 2 ** attempt * (0.5 + Math.random() * 0.5));

    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function extractMessage(
  envelope: Partial<CryptomusEnvelope<unknown>> | undefined,
  status: number,
): string {
  if (envelope?.message) return envelope.message;

  const errors = normaliseErrors(envelope?.errors);
  if (errors) {
    const lines = Object.entries(errors).flatMap(([field, messages]) =>
      messages.map((message) => `${field}: ${message}`),
    );
    if (lines.length) return lines.join('; ');
  }

  return `Cryptomus returned HTTP ${status}.`;
}

function normaliseErrors(errors: unknown): CryptomusValidationErrors | undefined {
  if (!errors || typeof errors !== 'object') return undefined;

  const out: CryptomusValidationErrors = {};
  for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
    out[field] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return Object.keys(out).length ? out : undefined;
}

function parseRetryAfter(header?: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
