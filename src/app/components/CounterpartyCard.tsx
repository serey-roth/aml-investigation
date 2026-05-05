import { CounterpartyHistoryResult } from "@/lib/agent/loader";

export function CounterpartyCard({ data }: { data: CounterpartyHistoryResult }) {
  return (
    <div className="mt-2 text-xs space-y-1">
      <div className="flex gap-2">
        <span className="text-neutral-500">Counterparty</span>
        <span className="text-neutral-200">{data.counterpartyId}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">Times transacted</span>
        <span className="text-neutral-200">{data.timesTransacted}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">Status</span>
        <span className={data.isNewCounterparty ? "text-amber-400" : "text-emerald-400"}>
          {data.isNewCounterparty ? "New counterparty" : "Known counterparty"}
        </span>
      </div>
      {data.firstSeen && (
        <div className="flex gap-2">
          <span className="text-neutral-500">First seen</span>
          <span className="text-neutral-200">{data.firstSeen}</span>
        </div>
      )}
      {data.lastSeen && data.lastSeen !== data.firstSeen && (
        <div className="flex gap-2">
          <span className="text-neutral-500">Last seen</span>
          <span className="text-neutral-200">{data.lastSeen}</span>
        </div>
      )}
    </div>
  );
}
