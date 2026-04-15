import { MerchantHistoryResult } from "@/lib/agent/loaders";

export function MerchantCard({ data }: { data: MerchantHistoryResult }) {
  return (
    <div className="mt-2 text-xs space-y-1">
      <div className="flex gap-2">
        <span className="text-neutral-500">Merchant</span>
        <span className="text-neutral-200">{data.merchant}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">Times used</span>
        <span className="text-neutral-200">{data.times_used}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-neutral-500">Status</span>
        <span className={data.is_new_merchant ? "text-amber-400" : "text-emerald-400"}>
          {data.is_new_merchant ? "New merchant" : "Known merchant"}
        </span>
      </div>
      {data.first_seen && (
        <div className="flex gap-2">
          <span className="text-neutral-500">First seen</span>
          <span className="text-neutral-200">{data.first_seen}</span>
        </div>
      )}
    </div>
  );
}
