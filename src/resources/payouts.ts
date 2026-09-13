import type { CryptomusTransport } from '../core/http.js';
import type { RequestOptions } from '../types/common.js';
import type {
  CreatePayoutParams,
  Payout,
  PayoutInfoParams,
  PayoutList,
  PayoutListParams,
  PayoutService,
  TransferParams,
  TransferResult,
} from '../types/payouts.js';
import { requireIdentifier } from './payments.js';

export class PayoutsResource {
  constructor(private readonly transport: CryptomusTransport) {}

  create(params: CreatePayoutParams, options?: RequestOptions): Promise<Payout> {
    return this.transport.request<Payout>({
      method: 'POST',
      path: '/v1/payout',
      key: 'payout',
      body: params,
      options,
    });
  }

  async info(params: PayoutInfoParams, options?: RequestOptions): Promise<Payout> {
    requireIdentifier(params, 'payouts.info');
    return this.transport.request<Payout>({
      method: 'POST',
      path: '/v1/payout/info',
      key: 'payout',
      body: params,
      options,
    });
  }

  list(
    params: PayoutListParams = {},
    options?: RequestOptions & { cursor?: string },
  ): Promise<PayoutList> {
    const { cursor, ...rest } = options ?? {};
    return this.transport.request<PayoutList>({
      method: 'POST',
      path: '/v1/payout/list',
      key: 'payout',
      body: params,
      options: { ...rest, query: { ...rest.query, cursor } },
    });
  }

  async *listAll(
    params: PayoutListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Payout, void, undefined> {
    let cursor: string | undefined;

    do {
      const page = await this.list(params, { ...options, cursor });
      yield* page.items;
      cursor = page.paginate.nextCursor ?? undefined;
    } while (cursor);
  }

  services(options?: RequestOptions): Promise<PayoutService[]> {
    return this.transport.request<PayoutService[]>({
      method: 'POST',
      path: '/v1/payout/services',
      key: 'payout',
      body: {},
      options,
    });
  }

  transferToPersonal(params: TransferParams, options?: RequestOptions): Promise<TransferResult> {
    return this.transport.request<TransferResult>({
      method: 'POST',
      path: '/v1/transfer/to-personal',
      key: 'payout',
      body: params,
      options,
    });
  }

  transferToBusiness(params: TransferParams, options?: RequestOptions): Promise<TransferResult> {
    return this.transport.request<TransferResult>({
      method: 'POST',
      path: '/v1/transfer/to-business',
      key: 'payout',
      body: params,
      options,
    });
  }
}
