import type { Case } from "@/lib/types";

export function SimilarCasesList({ cases }: { cases: Case[] }) {
  return (
    <div className="mt-2 space-y-2">
      {cases.map((c) => (
        <div key={c.id} className="bg-neutral-100 rounded px-3 py-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-neutral-500">CASE-{c.id}</span>
            <span className={c.outcome === "SAR_FILED" ? "text-red-600" : "text-emerald-600"}>
              {c.outcome === "SAR_FILED" ? "SAR filed" : "No file"}
            </span>
          </div>
          <div className="text-neutral-700">{c.description}</div>
          <div className="text-neutral-400 mt-1">{c.distinguishingFactor}</div>
        </div>
      ))}
    </div>
  );
}
