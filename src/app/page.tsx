"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stripTypologyPrefix } from "@/lib/utils";
import type { Alert } from "@/lib/types";

export default function Page() {
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const router = useRouter();

  useEffect(() => {
    setAlerts([]);
    fetch(`/api/alerts?status=${tab}&page=${page}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.alerts) {
          setAlerts(data.alerts);
          setTotal(data.total);
        }
      });
  }, [tab, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function switchTab(t: "active" | "closed") {
    setTab(t);
    setPage(0);
  }

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-neutral-900">Alert Queue</h1>
          <button
            onClick={() => router.push("/analytics")}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            Analytics →
          </button>
        </div>
        <div className="flex items-center gap-1">
          {(["active", "closed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`px-3 py-1.5 text-xs rounded capitalize transition-colors ${
                tab === t ? "bg-neutral-200 text-neutral-800" : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              {t}
            </button>
          ))}
          <span className="ml-3 text-xs text-neutral-400">{total} {tab === "active" ? "alerts" : "cases"}</span>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-neutral-500 border-b border-neutral-200 text-left">
            <th className="py-2 pr-6 font-normal">Account</th>
            {tab === "closed" && <th className="py-2 pr-6 font-normal">Typology</th>}
            <th className="py-2 pr-6 font-normal">Description</th>
            {tab === "closed" && <th className="py-2 font-normal">Closed</th>}
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr
              key={a.id}
              onClick={() => router.push(`/alerts/${a.id}`)}
              className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
            >
              <td className="py-3 pr-6 text-neutral-800 font-mono text-xs">{a.accountId}</td>
              {tab === "closed" && (
                <td className="py-3 pr-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">{a.typology}</span>
                    {a.status === "escalated" && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Escalated</span>
                    )}
                    {a.status === "rfi" && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Awaiting Info</span>
                    )}
                  </div>
                </td>
              )}
              <td className="py-3 pr-6 text-neutral-500 text-xs max-w-xs truncate">
                {stripTypologyPrefix(a.description, a.typology).replace(/\s*pattern detected:?\s*/i, " ").trimStart()}
              </td>
              {tab === "closed" && <td className="py-3 text-neutral-400 text-xs">{a.createdAt}</td>}
            </tr>
          ))}
          {alerts.length === 0 && (
            <tr>
              <td colSpan={tab === "active" ? 2 : 4} className="py-8 text-center text-xs text-neutral-400">
                No {tab} alerts.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
            className="text-xs text-neutral-400 hover:text-neutral-600 disabled:text-neutral-300 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-xs text-neutral-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="text-xs text-neutral-400 hover:text-neutral-600 disabled:text-neutral-300 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
