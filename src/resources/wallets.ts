import type { CryptomusTransport } from '../core/http.js';
import type { RequestOptions } from '../types/common.js';
import type { QrCodeResult } from '../types/payments.js';
import type {
  BlockStaticWalletParams,
  BlockStaticWalletResult,
  CreateStaticWalletParams,
  RefundBlockedWalletParams,
  RefundBlockedWalletResult,
  StaticWallet,
  WalletQrParams,
} from '../types/wallets.js';
import { requireIdentifier } from './payments.js';

export class WalletsResource {
  constructor(private readonly transport: CryptomusTransport) {}

  create(params: CreateStaticWalletParams, options?: RequestOptions): Promise<StaticWallet> {
    return this.transport.request<StaticWallet>({
      method: 'POST',
      path: '/v1/wallet',
      key: 'payment',
      body: params,
      options,
    });
  }

  async block(
    params: BlockStaticWalletParams,
    options?: RequestOptions,
  ): Promise<BlockStaticWalletResult> {
    requireIdentifier(params, 'wallets.block');
    return this.transport.request<BlockStaticWalletResult>({
      method: 'POST',
      path: '/v1/wallet/block-address',
      key: 'payment',
      body: params,
      options,
    });
  }

  async refundBlocked(
    params: RefundBlockedWalletParams,
    options?: RequestOptions,
  ): Promise<RefundBlockedWalletResult> {
    requireIdentifier(params, 'wallets.refundBlocked');
    return this.transport.request<RefundBlockedWalletResult>({
      method: 'POST',
      path: '/v1/wallet/blocked-address-refund',
      key: 'payment',
      body: params,
      options,
    });
  }

  qrCode(params: WalletQrParams, options?: RequestOptions): Promise<QrCodeResult> {
    return this.transport.request<QrCodeResult>({
      method: 'POST',
      path: '/v1/wallet/qr',
      key: 'payment',
      body: params,
      options,
    });
  }
}
