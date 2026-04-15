import { getDb } from "./client";

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

interface TxRecord {
  timestamp: string;
  from_account: string;
  to_account: string;
  amount_paid: number;
  payment_currency: string;
  payment_format: string;
}

interface CaseRecord {
  id: number;
  typology: string;
  description: string;
  outcome: string;
  distinguishing_factor: string;
}

export class SqliteLoader implements CaseDataLoader {
  async fetchTransactionHistory(account_id: string): Promise<TransactionHistoryResult> {
    const db = getDb();
    const rows = db.prepare<[string, string]>(`
      SELECT timestamp, from_account, to_account, amount_paid, payment_currency, payment_format
      FROM transactions
      WHERE from_account = ? OR to_account = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `).all(account_id, account_id) as TxRecord[];

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
    const db = getDb();
    const all = db.prepare<[string, string]>(`
      SELECT timestamp, amount_paid
      FROM transactions
      WHERE from_account = ? OR to_account = ?
      ORDER BY timestamp DESC
    `).all(account_id, account_id) as { timestamp: string; amount_paid: number }[];

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
    const db = getDb();
    const rows = db.prepare<[string, string, string, string]>(`
      SELECT timestamp FROM transactions
      WHERE (from_account = ? AND to_account = ?)
         OR (from_account = ? AND to_account = ?)
      ORDER BY timestamp ASC
    `).all(account_id, counterparty_id, counterparty_id, account_id) as { timestamp: string }[];

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
    const db = getDb();
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

    const rows = db.prepare<[string | null, string | null]>(`
      SELECT id, typology, description, outcome, distinguishing_factor
      FROM case_memory
      WHERE (? IS NULL OR typology = ?)
      ORDER BY RANDOM()
      LIMIT 3
    `).all(typologyFilter, typologyFilter) as CaseRecord[];

    const results = rows.length > 0 ? rows : db.prepare(`
      SELECT id, typology, description, outcome, distinguishing_factor
      FROM case_memory ORDER BY RANDOM() LIMIT 3
    `).all() as CaseRecord[];

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
