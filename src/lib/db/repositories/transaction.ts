import { getDb } from "../client";
import { TransactionDb, TransactionAmountDb } from "../types";
import { Transaction } from "@/lib/types";


function toTransaction(tx: TransactionDb): Transaction {
  return {
    timestamp: tx.timestamp,
    fromBank: tx.from_bank,
    fromAccount: tx.from_account,
    toBank: tx.to_bank,
    toAccount: tx.to_account,
    amountPaid: tx.amount_paid,
    paymentCurrency: tx.payment_currency,
    amountReceived: tx.amount_received,
    receivingCurrency: tx.receiving_currency,
    paymentFormat: tx.payment_format,
    isLaundering: tx.is_laundering === 1,
  };
}

export function getTransactions(accountId: string): Transaction[] {
  const rows = getDb().prepare<[string, string]>(`
    SELECT  *
    FROM transactions
    WHERE from_account = ? OR to_account = ?
    ORDER BY timestamp DESC
    LIMIT 50
  `).all(accountId, accountId) as TransactionDb[];
  return rows.map(toTransaction);
}

export function getTransactionAmounts(accountId: string): { timestamp: string; amountPaid: number }[] {
  const rows = getDb().prepare<[string, string]>(`
    SELECT timestamp, amount_paid
    FROM transactions
    WHERE from_account = ? OR to_account = ?
    ORDER BY timestamp DESC
  `).all(accountId, accountId) as TransactionAmountDb[];
  return rows.map((r) => ({ timestamp: r.timestamp, amountPaid: r.amount_paid }));
}

export function getCounterpartyTransactions(accountId: string, counterpartyId: string): { timestamp: string }[] {
  return getDb().prepare<[string, string, string, string]>(`
    SELECT timestamp FROM transactions
    WHERE (from_account = ? AND to_account = ?)
       OR (from_account = ? AND to_account = ?)
    ORDER BY timestamp ASC
  `).all(accountId, counterpartyId, counterpartyId, accountId) as { timestamp: string }[];
}

export function getGraphEdges(
  accountIds: string[]
): { from_account: string; to_account: string; total: number; cnt: number }[] {
  if (accountIds.length === 0) return [];
  const placeholders = accountIds.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT from_account, to_account,
              SUM(amount_paid) as total,
              COUNT(*) as cnt
       FROM transactions
       WHERE (from_account IN (${placeholders}) OR to_account IN (${placeholders}))
         AND from_account != to_account
       GROUP BY from_account, to_account`
    )
    .all(...accountIds, ...accountIds) as {
      from_account: string;
      to_account: string;
      total: number;
      cnt: number;
    }[];
}
