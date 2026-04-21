import { OllamaEmbeddings } from "@langchain/ollama";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import path from "path";
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
    const DATA_DIR = path.join(process.cwd(), "src/data");
    const INDEX_PATH = path.join(DATA_DIR, "faiss_index");

    const embeddings = new OllamaEmbeddings({
      model: "nomic-embed-text",
    });

    // Load the index you just built with the seed script
    const vectorStore = await FaissStore.load(INDEX_PATH, embeddings);

    // Search for the top 3 mathematically similar cases
    const results = await vectorStore.similaritySearch(pattern, 3);

    return {
      pattern,
      similar_cases: results.map((doc) => ({
        case_id: `CASE-${doc.metadata.id}`,
        description: doc.pageContent,
        outcome: doc.metadata.outcome as "SAR_FILED" | "NO_FILE",
        distinguishing_factor: doc.pageContent.split("Factors: ")[1] || ""
      })),
    };
  }
}
