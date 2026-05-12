import pool from "../client";
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

// OR across two indexed columns triggers two index scans whose rowid sets are
// merged — avoids a full table scan even though it's not a simple equality filter.
export async function getTransactions(accountId: string): Promise<Transaction[]> {
  const [rows] = await pool.query(
    `SELECT * FROM transactions
     WHERE from_account = ? OR to_account = ?
     ORDER BY timestamp DESC
     LIMIT 50`,
    [accountId, accountId]
  ) as unknown as [TransactionDb[], unknown];
  return rows.map(toTransaction);
}

export async function getTransactionAmounts(accountId: string): Promise<{ timestamp: string; amountPaid: number }[]> {
  const [rows] = await pool.query(
    `SELECT timestamp, amount_paid
     FROM transactions
     WHERE from_account = ? OR to_account = ?
     ORDER BY timestamp DESC`,
    [accountId, accountId]
  ) as unknown as [TransactionAmountDb[], unknown];
  return rows.map((r) => ({ timestamp: r.timestamp, amountPaid: r.amount_paid }));
}

// Both transfer directions matched explicitly so the planner can use
// idx_tx_from and idx_tx_to. Used to detect round-tripping between two accounts.
export async function getCounterpartyTransactions(accountId: string, counterpartyId: string): Promise<{ timestamp: string }[]> {
  const [rows] = await pool.query(
    `SELECT timestamp FROM transactions
     WHERE (from_account = ? AND to_account = ?)
        OR (from_account = ? AND to_account = ?)
     ORDER BY timestamp ASC`,
    [accountId, counterpartyId, counterpartyId, accountId]
  ) as unknown as [{ timestamp: string }[], unknown];
  return rows;
}

export async function getGraphEdges(
  accountIds: string[]
): Promise<{ from_account: string; to_account: string; total: number; cnt: number }[]> {
  if (accountIds.length === 0) return [];
  // Placeholders built dynamically; list passed twice to capture both transfer
  // directions. GROUP BY collapses payments into weighted edges for the network graph.
  const placeholders = accountIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT from_account, to_account,
            SUM(amount_paid) as total,
            COUNT(*) as cnt
     FROM transactions
     WHERE (from_account IN (${placeholders}) OR to_account IN (${placeholders}))
       AND from_account != to_account
     GROUP BY from_account, to_account`,
    [...accountIds, ...accountIds]
  ) as unknown as [{ from_account: string; to_account: string; total: number; cnt: number }[], unknown];
  return rows;
}
