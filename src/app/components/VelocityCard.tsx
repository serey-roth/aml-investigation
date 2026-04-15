import { VelocityResult } from "@/lib/agent/loaders";

function fmt(n: number) {
  return "$" + n.toLocaleString();
}

export function VelocityCard({ data }: { data: VelocityResult }) {
  const deviation = Math.round((data.average_amount / data.account_historical_average - 1) * 100);
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      {([
        ["Transactions", data.transaction_count],
        ["Window", `${data.window_hours}h`],
        ["Total", fmt(data.total_amount)],
        ["Avg per tx", fmt(data.average_amount)],
        ["Historical avg", fmt(data.account_historical_average)],
        ["Deviation", `${deviation}%`],
      ] as [string, string | number][]).map(([label, value]) => (
        <div key={label} className="bg-neutral-900 rounded px-3 py-2">
          <div className="text-neutral-500">{label}</div>
          <div className="text-neutral-100 font-medium mt-0.5">{value}</div>
        </div>
      ))}
    </div>
  );
}
