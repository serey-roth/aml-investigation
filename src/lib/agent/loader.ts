import {
  getTransactions,
  getTransactionAmounts,
  getCounterpartyTransactions,
} from "@/lib/db/repositories/transaction";
import { getCasesByTypology, getRandomCases } from "@/lib/db/repositories/case";

export interface Transaction {
  date: string;
  amount: number;
  payment_format: string;
  counterparty: string;
  direction: "sent" | "received";
}

export interface TransactionHistoryResult {
  account_id: string;
  transactions: Transaction[];
}

export interface VelocityResult {
  account_id: string;
  window_hours: number;
  transaction_count: number;
  total_amount: number;
  average_amount: number;
  account_historical_average: number;
}

export interface CounterpartyHistoryResult {
  account_id: string;
  counterparty_id: string;
  times_transacted: number;
  first_seen: string | null;
  last_seen: string | null;
  is_new_counterparty: boolean;
}

export interface SimilarCase {
  case_id: string;
  description: string;
  outcome: "SAR_FILED" | "NO_FILE";
  distinguishing_factor: string;
}

export interface SimilarCasesResult {
  pattern: string;
  similar_cases: SimilarCase[];
}

export interface CaseDataLoader {
  fetchTransactionHistory(account_id: string): Promise<TransactionHistoryResult>;
  fetchVelocity(account_id: string, window_hours: number): Promise<VelocityResult>;
  fetchCounterpartyHistory(account_id: string, counterparty_id: string): Promise<CounterpartyHistoryResult>;
  findSimilarCases(pattern: string): Promise<SimilarCasesResult>;
}

export class SqliteLoader implements CaseDataLoader {
  async fetchTransactionHistory(account_id: string): Promise<TransactionHistoryResult> {
    const rows = getTransactions(account_id);
    return {
      account_id,
      transactions: rows.map((r) => ({
        date: r.timestamp,
        amount: r.amount_paid,
        payment_format: r.payment_format,
        counterparty: r.from_account === account_id ? r.to_account : r.from_account,
        direction: r.from_account === account_id ? "sent" : "received",
      })),
    };
  }

  async fetchVelocity(account_id: string, window_hours: number): Promise<VelocityResult> {
    const all = getTransactionAmounts(account_id);

    if (all.length === 0) {
      return { account_id, window_hours, transaction_count: 0, total_amount: 0, average_amount: 0, account_historical_average: 0 };
    }

    const parseTs = (ts: string) => new Date(ts.replace("/", "-").replace("/", "-")).getTime();
    const latest = parseTs(all[0].timestamp);
    const cutoff = latest - window_hours * 3600 * 1000;

    const inWindow = all.filter((r) => parseTs(r.timestamp) >= cutoff);
    const total = inWindow.reduce((s, r) => s + r.amount_paid, 0);
    const historicalTotal = all.reduce((s, r) => s + r.amount_paid, 0);

    return {
      account_id,
      window_hours,
      transaction_count: inWindow.length,
      total_amount: Math.round(total * 100) / 100,
      average_amount: inWindow.length ? Math.round((total / inWindow.length) * 100) / 100 : 0,
      account_historical_average: Math.round((historicalTotal / all.length) * 100) / 100,
    };
  }

  async fetchCounterpartyHistory(account_id: string, counterparty_id: string): Promise<CounterpartyHistoryResult> {
    const rows = getCounterpartyTransactions(account_id, counterparty_id);
    return {
      account_id,
      counterparty_id,
      times_transacted: rows.length,
      first_seen: rows[0]?.timestamp ?? null,
      last_seen: rows[rows.length - 1]?.timestamp ?? null,
      is_new_counterparty: rows.length === 0,
    };
  }

  async findSimilarCases(pattern: string): Promise<SimilarCasesResult> {
    const keywords = pattern.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

    const typologyMap: Record<string, string> = {
      "fan-out": "FAN-OUT", fanout: "FAN-OUT",
      "fan-in": "FAN-IN", fanin: "FAN-IN",
      cycle: "CYCLE", circular: "CYCLE",
      scatter: "SCATTER-GATHER", gather: "GATHER-SCATTER",
      bipartite: "BIPARTITE", stack: "STACK", random: "RANDOM",
    };

    const matched = keywords.map((k) => typologyMap[k]).filter(Boolean);
    const typologyFilter = matched.length > 0 ? matched[0] : null;

    const rows = getCasesByTypology(typologyFilter);
    const results = rows.length > 0 ? rows : getRandomCases();

    return {
      pattern,
      similar_cases: results.map((r) => ({
        case_id: `CASE-${r.id}`,
        description: r.description,
        outcome: r.outcome as "SAR_FILED" | "NO_FILE",
        distinguishing_factor: r.distinguishing_factor,
      })),
    };
  }
}
