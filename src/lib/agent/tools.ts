import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { CaseDataLoader } from "./loader";
import { embeddingModel } from "./models";

export function createTools(loader: CaseDataLoader) {
  const getTransactionHistory = tool(
    async ({ accountId }: { accountId: string }) => {
      const data = await loader.fetchTransactionHistory(accountId);
      return JSON.stringify(data);
    },
    {
      name: "get_transaction_history",
      description: "Retrieves recent transaction history for a given account",
      schema: z.object({
        accountId: z.string().describe("The account ID to retrieve history for"),
      }),
    }
  );

  const computeVelocity = tool(
    async ({ accountId, windowHours }: { accountId: string; windowHours: number }) => {
      const data = await loader.fetchVelocity(accountId, windowHours);
      return JSON.stringify(data);
    },
    {
      name: "compute_velocity",
      description: "Computes transaction frequency and volume for an account over a given time window",
      schema: z.object({
        accountId: z.string().describe("The account ID to compute velocity for"),
        windowHours: z.coerce.number().describe("The time window in hours to compute velocity over"),
      }),
    }
  );

  const getCounterpartyHistory = tool(
    async ({ accountId, counterpartyId }: { accountId: string; counterpartyId: string }) => {
      const data = await loader.fetchCounterpartyHistory(accountId, counterpartyId);
      return JSON.stringify(data);
    },
    {
      name: "get_counterparty_history",
      description: "Checks whether an account has transacted with a given counterparty before and how frequently",
      schema: z.object({
        accountId: z.string().describe("The account ID to check"),
        counterpartyId: z.string().describe("The counterparty account ID to look up"),
      }),
    }
  );

  const findSimilarCases = tool(
    async ({ pattern }: { pattern: string }) => {
      const caseEmbeddings = await embeddingModel.embedQuery(pattern);
      const data = await loader.getSimilarCases(caseEmbeddings);
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
