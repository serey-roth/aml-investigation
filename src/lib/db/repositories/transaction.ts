import { getDb } from "../client";

export interface TxRow {
  timestamp: string;
  from_account: string;
  to_account: string;
  amount_paid: number;
  payment_currency: string;
  payment_format: string;
}

export function getTransactions(accountId: string): TxRow[] {
  return getDb().prepare<[string, string]>(`
    SELECT timestamp, from_account, to_account, amount_paid, payment_currency, payment_format
    FROM transactions
    WHERE from_account = ? OR to_account = ?
    ORDER BY timestamp DESC
    LIMIT 50
  `).all(accountId, accountId) as TxRow[];
}

export function getTransactionAmounts(accountId: string): { timestamp: string; amount_paid: number }[] {
  return getDb().prepare<[string, string]>(`
    SELECT timestamp, amount_paid
    FROM transactions
    WHERE from_account = ? OR to_account = ?
    ORDER BY timestamp DESC
  `).all(accountId, accountId) as { timestamp: string; amount_paid: number }[];
}

export function getCounterpartyTransactions(accountId: string, counterpartyId: string): { timestamp: string }[] {
  return getDb().prepare<[string, string, string, string]>(`
    SELECT timestamp FROM transactions
    WHERE (from_account = ? AND to_account = ?)
       OR (from_account = ? AND to_account = ?)
    ORDER BY timestamp ASC
  `).all(accountId, counterpartyId, counterpartyId, accountId) as { timestamp: string }[];
}
