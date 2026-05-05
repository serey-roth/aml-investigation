import {
  getTransactions,
  getTransactionAmounts,
  getCounterpartyTransactions,
} from "@/lib/db/repositories/transaction";
import { findSimilarCases } from "@/lib/db/repositories/case";
import { Transaction } from "../types";
import { Case } from "@/lib/types";

export interface TransactionHistoryResult {
  accountId: string;
  transactions: (Transaction & {
    counterparty: string;
    direction: "sent" | "received";
  })[];
}

export interface VelocityResult {
  accountId: string;
  windowHours: number;
  transactionCount: number;
  totalAmount: number;
  averageAmount: number;
  accountHistoricalAverage: number;
}

export interface CounterpartyHistoryResult {
  accountId: string;
  counterpartyId: string;
  timesTransacted: number;
  firstSeen: string | null;
  lastSeen: string | null;
  isNewCounterparty: boolean;
}

export interface CaseDataLoader {
  fetchTransactionHistory(accountId: string): Promise<TransactionHistoryResult>;
  fetchVelocity(accountId: string, windowHours: number): Promise<VelocityResult>;
  fetchCounterpartyHistory(accountId: string, counterpartyId: string): Promise<CounterpartyHistoryResult>;
  getSimilarCases(caseEmbeddings: number[]): Promise<Case[]>;
}

export class SqliteLoader implements CaseDataLoader {
  async fetchTransactionHistory(accountId: string): Promise<TransactionHistoryResult> {
    const accountTransactions = getTransactions(accountId);
    return {
      accountId,
      transactions: accountTransactions.map((r) => ({
        ...r,
        counterparty: r.fromAccount === accountId ? r.toAccount : r.fromAccount,
        direction: r.fromAccount === accountId ? "sent" : "received",
      })),
    };
  }

  async fetchVelocity(accountId: string, windowHours: number): Promise<VelocityResult> {
    const transactionAmounts = getTransactionAmounts(accountId);

    if (transactionAmounts.length === 0) {
      return { accountId, windowHours, transactionCount: 0, totalAmount: 0, averageAmount: 0, accountHistoricalAverage: 0 };
    }

    const parseTs = (ts: string) => new Date(ts.replace("/", "-").replace("/", "-")).getTime();
    const latest = parseTs(transactionAmounts[0].timestamp);
    const cutoff = latest - windowHours * 3600 * 1000;

    const inWindow = transactionAmounts.filter((r) => parseTs(r.timestamp) >= cutoff);
    const total = inWindow.reduce((s, r) => s + r.amountPaid, 0);
    const historicalTotal = transactionAmounts.reduce((s, r) => s + r.amountPaid, 0);

    return {
      accountId,
      windowHours,
      transactionCount: inWindow.length,
      totalAmount: Math.round(total * 100) / 100,
      averageAmount: inWindow.length ? Math.round((total / inWindow.length) * 100) / 100 : 0,
      accountHistoricalAverage: Math.round((historicalTotal / transactionAmounts.length) * 100) / 100,
    };
  }

  async fetchCounterpartyHistory(accountId: string, counterpartyId: string): Promise<CounterpartyHistoryResult> {
    const counterpartyTransactions = getCounterpartyTransactions(accountId, counterpartyId);
    return {
      accountId,
      counterpartyId,
      timesTransacted: counterpartyTransactions.length,
      firstSeen: counterpartyTransactions[0]?.timestamp ?? null,
      lastSeen: counterpartyTransactions[counterpartyTransactions.length - 1]?.timestamp ?? null,
      isNewCounterparty: counterpartyTransactions.length === 0,
    };
  }

  async getSimilarCases(caseEmbeddings: number[]): Promise<Case[]> {
    return findSimilarCases(caseEmbeddings);
  }
}
