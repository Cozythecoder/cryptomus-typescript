export type CryptomusKeyKind = 'payment' | 'payout' | 'none';

export interface CryptomusEnvelope<T> {
  state: number;
  result: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface CryptomusPaginate {
  count: number;
  hasPages: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
  perPage: number;
}

export interface CryptomusPaginated<T> {
  items: T[];
  paginate: CryptomusPaginate;
}

export interface DateRangeFilter {
  date_from?: string;
  date_to?: string;
}

export type CourseSource = 'Binance' | 'BinanceP2P' | 'Exmo' | 'Kucoin';

export type ResourceIdentifier =
  | { uuid: string; order_id?: string }
  | { uuid?: string; order_id: string };

export interface RequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
}

export interface CryptomusClientConfig {
  merchantId: string;
  paymentKey?: string;
  payoutKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: typeof globalThis.fetch;
  defaultHeaders?: Record<string, string>;
  onRequest?: (info: RequestTelemetry) => void;
}

export interface RequestTelemetry {
  endpoint: string;
  method: string;
  status?: number;
  attempt: number;
  durationMs: number;
  error?: unknown;
}
