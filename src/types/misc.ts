export interface BalanceEntry {
  uuid: string;
  balance: string;
  currency_code: string;
}

export interface BalanceBreakdown {
  merchant: BalanceEntry[];
  user: BalanceEntry[];
}

export type BalanceResult = Array<{ balance: BalanceBreakdown }>;

export interface ExchangeRate {
  from: string;
  to: string;
  course: string;
}
