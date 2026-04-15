import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { CaseDataLoader } from "@/lib/db/loader";

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

  const getCounterpartyHistory = tool(
    async ({ account_id, counterparty_id }: { account_id: string; counterparty_id: string }) => {
      const data = await loader.fetchCounterpartyHistory(account_id, counterparty_id);
      return JSON.stringify(data);
    },
    {
      name: "get_counterparty_history",
      description: "Checks whether an account has transacted with a given counterparty before and how frequently",
      schema: z.object({
        account_id: z.string().describe("The account ID to check"),
        counterparty_id: z.string().describe("The counterparty account ID to look up"),
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

  return [getTransactionHistory, computeVelocity, getCounterpartyHistory, findSimilarCases];
}
