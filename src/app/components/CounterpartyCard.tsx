import { CounterpartyHistoryResult } from "@/lib/db/loader";

export function CounterpartyCard({ data }: { data: CounterpartyHistoryResult }) {
  return (
    <div className="mt-2 text-xs space-y-1">
      <div className="flex gap-2">
        <span className="text-neutral-500">Counterparty</span>
        <span className="text-neutral-200">{data.counterparty_id}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">Times transacted</span>
        <span className="text-neutral-200">{data.times_transacted}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">Status</span>
        <span className={data.is_new_counterparty ? "text-amber-400" : "text-emerald-400"}>
          {data.is_new_counterparty ? "New counterparty" : "Known counterparty"}
        </span>
      </div>
      {data.first_seen && (
        <div className="flex gap-2">
          <span className="text-neutral-500">First seen</span>
          <span className="text-neutral-200">{data.first_seen}</span>
        </div>
      )}
      {data.last_seen && data.last_seen !== data.first_seen && (
        <div className="flex gap-2">
          <span className="text-neutral-500">Last seen</span>
          <span className="text-neutral-200">{data.last_seen}</span>
        </div>
      )}
    </div>
  );
}
