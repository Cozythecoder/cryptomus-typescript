export type CryptomusValidationErrors = Record<string, string[]>;

export interface CryptomusErrorContext {
  status?: number;
  state?: number;
  errors?: CryptomusValidationErrors;
  endpoint?: string;
  raw?: unknown;
  cause?: unknown;
}

export class CryptomusError extends Error {
  readonly status?: number;
  readonly state?: number;
  readonly errors?: CryptomusValidationErrors;
  readonly endpoint?: string;
  readonly raw?: unknown;

  constructor(message: string, context: CryptomusErrorContext = {}) {
    super(message, context.cause !== undefined ? { cause: context.cause } : undefined);
    this.name = new.target.name;
    this.status = context.status;
    this.state = context.state;
    this.errors = context.errors;
    this.endpoint = context.endpoint;
    this.raw = context.raw;
  }

  get validationMessages(): string[] {
    if (!this.errors) return [];
    return Object.entries(this.errors).flatMap(([field, messages]) =>
      messages.map((message) => `${field}: ${message}`),
    );
  }
}

export class CryptomusApiError extends CryptomusError {}

export class CryptomusValidationError extends CryptomusApiError {}

export class CryptomusAuthenticationError extends CryptomusApiError {}

export class CryptomusRateLimitError extends CryptomusApiError {
  readonly retryAfter?: number;

  constructor(message: string, context: CryptomusErrorContext & { retryAfter?: number } = {}) {
    super(message, context);
    this.retryAfter = context.retryAfter;
  }
}

export class CryptomusNetworkError extends CryptomusError {}

export class CryptomusTimeoutError extends CryptomusNetworkError {}

export class CryptomusSignatureError extends CryptomusError {}

export function errorForStatus(
  status: number,
  message: string,
  context: CryptomusErrorContext & { retryAfter?: number } = {},
): CryptomusApiError {
  const full = { ...context, status };

  if (status === 401 || status === 403) return new CryptomusAuthenticationError(message, full);
  if (status === 422) return new CryptomusValidationError(message, full);
  if (status === 429) return new CryptomusRateLimitError(message, full);

  return new CryptomusApiError(message, full);
}
