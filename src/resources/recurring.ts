import type { CryptomusTransport } from '../core/http.js';
import type { RequestOptions } from '../types/common.js';
import type {
  CancelRecurringParams,
  CreateRecurringParams,
  RecurringInfoParams,
  RecurringList,
  RecurringPayment,
} from '../types/recurring.js';
import { requireIdentifier } from './payments.js';

export class RecurringResource {
  constructor(private readonly transport: CryptomusTransport) {}

  create(params: CreateRecurringParams, options?: RequestOptions): Promise<RecurringPayment> {
    return this.transport.request<RecurringPayment>({
      method: 'POST',
      path: '/v1/recurrence/create',
      key: 'payment',
      body: params,
      options,
    });
  }

  async info(params: RecurringInfoParams, options?: RequestOptions): Promise<RecurringPayment> {
    requireIdentifier(params, 'recurring.info');
    return this.transport.request<RecurringPayment>({
      method: 'POST',
      path: '/v1/recurrence/info',
      key: 'payment',
      body: params,
      options,
    });
  }

  list(options?: RequestOptions & { cursor?: string }): Promise<RecurringList> {
    const { cursor, ...rest } = options ?? {};
    return this.transport.request<RecurringList>({
      method: 'POST',
      path: '/v1/recurrence/list',
      key: 'payment',
      body: {},
      options: { ...rest, query: { ...rest.query, cursor } },
    });
  }

  async *listAll(options?: RequestOptions): AsyncGenerator<RecurringPayment, void, undefined> {
    let cursor: string | undefined;

    do {
      const page = await this.list({ ...options, cursor });
      yield* page.items;
      cursor = page.paginate.nextCursor ?? undefined;
    } while (cursor);
  }

  async cancel(params: CancelRecurringParams, options?: RequestOptions): Promise<RecurringPayment> {
    requireIdentifier(params, 'recurring.cancel');
    return this.transport.request<RecurringPayment>({
      method: 'POST',
      path: '/v1/recurrence/cancel',
      key: 'payment',
      body: params,
      options,
    });
  }
}
