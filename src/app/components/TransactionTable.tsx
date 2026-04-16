import { Transaction } from "@/lib/agent/loader";

function fmt(n: number) {
  return "$" + n.toLocaleString();
}

export function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <table className="w-full text-xs mt-2">
      <thead>
        <tr className="text-neutral-500 border-b border-neutral-800">
          <th className="text-left py-1 pr-4 font-normal">Date</th>
          <th className="text-left py-1 pr-4 font-normal">Format</th>
          <th className="text-left py-1 pr-4 font-normal">Counterparty</th>
          <th className="text-left py-1 pr-4 font-normal">Dir</th>
          <th className="text-right py-1 font-normal">Amount</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((tx, i) => (
          <tr key={i} className="border-b border-neutral-900">
            <td className="py-1 pr-4 text-neutral-400">{tx.date}</td>
            <td className="py-1 pr-4 text-neutral-400">{tx.payment_format}</td>
            <td className="py-1 pr-4 text-neutral-400 font-mono">{tx.counterparty}</td>
            <td className="py-1 pr-4">
              <span className={tx.direction === "sent" ? "text-red-400" : "text-emerald-400"}>
                {tx.direction === "sent" ? "↑" : "↓"}
              </span>
            </td>
            <td className="py-1 text-right text-neutral-200">{fmt(tx.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
