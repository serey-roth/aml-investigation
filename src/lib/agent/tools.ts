import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { CaseDataLoader } from "./loaders";

export function createTools(loader: CaseDataLoader) {
  const getTransactionHistory = tool(
    async ({ account_id }: { account_id: string }) => {
      const data = await loader.fetchTransactionHistory(account_id);
      return JSON.stringify(data);
    },
    {
      name: "get_transaction_history",
      description: "Retrieves recent transaction history for a given account",
      schema: z.object({
        account_id: z.string().describe("The account ID to retrieve history for"),
      }),
    }
  );

  const computeVelocity = tool(
    async ({ account_id, window_hours }: { account_id: string; window_hours: number }) => {
      const data = await loader.fetchVelocity(account_id, window_hours);
      return JSON.stringify(data);
    },
    {
      name: "compute_velocity",
      description: "Computes transaction frequency and volume for an account over a given time window",
      schema: z.object({
        account_id: z.string().describe("The account ID to compute velocity for"),
        window_hours: z.coerce.number().describe("The time window in hours to compute velocity over"),
      }),
    }
  );

  const getMerchantHistory = tool(
    async ({ account_id, merchant }: { account_id: string; merchant: string }) => {
      const data = await loader.fetchMerchantHistory(account_id, merchant);
      return JSON.stringify(data);
    },
    {
      name: "get_merchant_history",
      description: "Checks whether a merchant has appeared before in an account's transaction history",
      schema: z.object({
        account_id: z.string().describe("The account ID to check"),
        merchant: z.string().describe("The merchant name to look up"),
      }),
    }
  );

  const findSimilarCases = tool(
    async ({ pattern }: { pattern: string }) => {
      const data = await loader.findSimilarCases(pattern);
      return JSON.stringify(data);
    },
    {
      name: "find_similar_cases",
      description: "Retrieves similar past cases from case memory with their outcomes and distinguishing factors",
      schema: z.object({
        pattern: z.string().describe("A description of the transaction pattern to search for"),
      }),
    }
  );

  return [getTransactionHistory, computeVelocity, getMerchantHistory, findSimilarCases];
}
