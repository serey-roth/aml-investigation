import {
  TransactionHistoryResult,
  VelocityResult,
  CounterpartyHistoryResult,
  SimilarCasesResult,
} from "@/lib/db/loader";
import { TransactionTable } from "./TransactionTable";
import { VelocityCard } from "./VelocityCard";
import { CounterpartyCard } from "./CounterpartyCard";
import { SimilarCasesList } from "./SimilarCasesList";

interface Props {
  tool: string;
  data: Record<string, unknown> | null;
}

export function ToolResult({ tool, data }: Props) {
  if (!data) return null;

  if (tool === "get_transaction_history") {
    return <TransactionTable transactions={(data as unknown as TransactionHistoryResult).transactions} />;
  }
  if (tool === "compute_velocity") {
    return <VelocityCard data={data as unknown as VelocityResult} />;
  }
  if (tool === "get_counterparty_history") {
    return <CounterpartyCard data={data as unknown as CounterpartyHistoryResult} />;
  }
  if (tool === "find_similar_cases") {
    return <SimilarCasesList data={data as unknown as SimilarCasesResult} />;
  }

  return (
    <pre className="mt-1 text-xs text-neutral-500 whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
