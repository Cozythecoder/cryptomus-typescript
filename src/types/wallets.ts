export type StaticWalletStatus = 'active' | 'in_active' | 'blocked';

export interface CreateStaticWalletParams {
  currency: string;
  network: string;
  order_id: string;
  url_callback?: string;
  from_referral_code?: string;
}

export interface StaticWallet {
  wallet_uuid: string;
  uuid: string;
  address: string;
  network: string;
  currency: string;
  url: string;
}

export interface BlockStaticWalletParams {
  uuid?: string;
  order_id?: string;
  is_force_refund?: boolean;
}

export interface BlockStaticWalletResult {
  uuid: string;
  status: StaticWalletStatus;
}

export interface RefundBlockedWalletParams {
  uuid?: string;
  order_id?: string;
  address: string;
}

export interface RefundBlockedWalletResult {
  commission?: string;
  amount?: string;
  [key: string]: unknown;
}

export interface WalletQrParams {
  wallet_address_uuid: string;
}
