export interface Transaction {
  date: string;
  amount: number;
  type: string;
  merchant: string;
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

export interface MerchantHistoryResult {
  account_id: string;
  merchant: string;
  times_used: number;
  first_seen: string | null;
  last_seen: string | null;
  is_new_merchant: boolean;
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
  fetchMerchantHistory(account_id: string, merchant: string): Promise<MerchantHistoryResult>;
  findSimilarCases(pattern: string): Promise<SimilarCasesResult>;
}

export class StubLoader implements CaseDataLoader {
  async fetchTransactionHistory(account_id: string): Promise<TransactionHistoryResult> {
    return {
      account_id,
      transactions: [
        { date: "2024-01-10", amount: 9800, type: "cash_deposit", merchant: "ATM" },
        { date: "2024-01-12", amount: 9500, type: "cash_deposit", merchant: "ATM" },
        { date: "2024-01-14", amount: 9700, type: "cash_deposit", merchant: "ATM" },
        { date: "2024-01-15", amount: 9600, type: "cash_deposit", merchant: "ATM" },
      ],
    };
  }

  async fetchVelocity(account_id: string, window_hours: number): Promise<VelocityResult> {
    return {
      account_id,
      window_hours,
      transaction_count: 4,
      total_amount: 38600,
      average_amount: 9650,
      account_historical_average: 3200,
    };
  }

  async fetchMerchantHistory(account_id: string, merchant: string): Promise<MerchantHistoryResult> {
    return {
      account_id,
      merchant,
      times_used: 0,
      first_seen: null,
      last_seen: null,
      is_new_merchant: true,
    };
  }

  async findSimilarCases(pattern: string): Promise<SimilarCasesResult> {
    return {
      pattern,
      similar_cases: [
        {
          case_id: "CASE-101",
          description: "4 cash deposits under $10k over 9 days",
          outcome: "SAR_FILED",
          distinguishing_factor: "No documented cash business",
        },
        {
          case_id: "CASE-87",
          description: "3 cash deposits under $10k over 7 days",
          outcome: "SAR_FILED",
          distinguishing_factor: "No documented cash business",
        },
        {
          case_id: "CASE-134",
          description: "5 cash deposits under $10k over 12 days",
          outcome: "NO_FILE",
          distinguishing_factor: "Customer owns documented cash business (restaurant)",
        },
      ],
    };
  }
}
