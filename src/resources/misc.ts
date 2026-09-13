import type { CryptomusTransport } from '../core/http.js';
import type { RequestOptions } from '../types/common.js';
import type { BalanceBreakdown, BalanceResult, ExchangeRate } from '../types/misc.js';

export class MiscResource {
  constructor(private readonly transport: CryptomusTransport) {}

  async balance(options?: RequestOptions): Promise<BalanceBreakdown> {
    const result = await this.transport.request<BalanceResult>({
      method: 'POST',
      path: '/v1/balance',
      key: 'payment',
      body: {},
      options,
    });

    return result?.[0]?.balance ?? { merchant: [], user: [] };
  }

  balanceRaw(options?: RequestOptions): Promise<BalanceResult> {
    return this.transport.request<BalanceResult>({
      method: 'POST',
      path: '/v1/balance',
      key: 'payment',
      body: {},
      options,
    });
  }

  exchangeRates(currency: string, options?: RequestOptions): Promise<ExchangeRate[]> {
    return this.transport.request<ExchangeRate[]>({
      method: 'GET',
      path: `/v1/exchange-rate/${encodeURIComponent(currency)}/list`,
      key: 'none',
      options,
    });
  }
}
