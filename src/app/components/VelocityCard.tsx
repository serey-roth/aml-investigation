import { VelocityResult } from "@/lib/agent/loader";

function fmt(n: number) {
  return "$" + n.toLocaleString();
}

export function VelocityCard({ data }: { data: VelocityResult }) {
  const deviation = Math.round((data.averageAmount / data.accountHistoricalAverage - 1) * 100);

  const fields: [string, string | number][] = [
    ["Transactions", data.transactionCount],
    ["Window", `${data.windowHours}h`],
    ["Total", fmt(data.totalAmount)],
    ["Avg per tx", fmt(data.averageAmount)],
    ["Historical avg", fmt(data.accountHistoricalAverage)],
    ["Deviation", `${deviation}%`],
  ];

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      {fields.map(([label, value]) => (
        <div key={label} className="bg-neutral-100 rounded px-3 py-2">
          <div className="text-neutral-500">{label}</div>
          <div className="text-neutral-900 font-medium mt-0.5">{value}</div>
        </div>
      ))}
    </div>
  );
}
