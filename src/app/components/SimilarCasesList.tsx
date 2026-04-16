import { SimilarCasesResult } from "@/lib/agent/loader";

export function SimilarCasesList({ data }: { data: SimilarCasesResult }) {
  return (
    <div className="mt-2 space-y-2">
      {data.similar_cases.map((c) => (
        <div key={c.case_id} className="bg-neutral-900 rounded px-3 py-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-neutral-400">{c.case_id}</span>
            <span className={c.outcome === "SAR_FILED" ? "text-red-400" : "text-emerald-400"}>
              {c.outcome === "SAR_FILED" ? "SAR filed" : "No file"}
            </span>
          </div>
          <div className="text-neutral-300">{c.description}</div>
          <div className="text-neutral-500 mt-1">{c.distinguishing_factor}</div>
        </div>
      ))}
    </div>
  );
}
