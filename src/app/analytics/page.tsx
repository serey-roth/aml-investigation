"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalyticsData, TypologyStats } from "@/app/api/analytics/route";

function pct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

function fmtMs(ms: number) {
  if (ms <= 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pctWidth = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pctWidth}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-neutral-50 rounded px-4 py-3 border border-neutral-200">
      <div className="text-xs text-neutral-400 mb-1">{label}</div>
      <div className="text-xl font-semibold text-neutral-900">{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function RateCell({ value, invert = false }: { value: number; invert?: boolean }) {
  const pctVal = value * 100;
  const color =
    pctVal === 0
      ? "text-neutral-400"
      : invert
      ? pctVal > 70 ? "text-red-600" : pctVal > 40 ? "text-amber-600" : "text-emerald-600"
      : pctVal > 70 ? "text-emerald-600" : pctVal > 40 ? "text-amber-600" : "text-red-600";
  return <span className={`font-mono text-xs ${color}`}>{pct(value)}</span>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d: AnalyticsData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <p className="text-xs text-neutral-400">Loading analytics…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <p className="text-xs text-red-600">Failed to load analytics.</p>
      </div>
    );
  }

  const maxTotal = Math.max(...data.byTypology.map((t) => t.total), 1);

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-xs text-neutral-400 hover:text-neutral-600"
        >
          ← Queue
        </button>
        <h1 className="text-xl font-semibold text-neutral-900">Analytics</h1>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total Alerts" value={data.totalAlerts.toLocaleString()} />
        <StatCard label="Open" value={data.totalOpen.toLocaleString()} />
        <StatCard label="Closed" value={data.totalClosed.toLocaleString()} />
        <StatCard
          label="SAR Filing Rate"
          value={pct(data.overallSarRate)}
          sub="of closed cases"
        />
      </div>

      {/* Overall quality scores */}
      <div className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Overall Quality</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Agent–Analyst Agreement"
            value={pct(data.overallAgreementRate)}
            sub="recommendation matched decision"
          />
          <StatCard
            label="False Positive Rate"
            value={pct(data.overallFalsePositiveRate)}
            sub="closed with no SAR filed"
          />
          <StatCard
            label="Typologies Tracked"
            value={String(data.byTypology.length)}
            sub="with at least one alert"
          />
        </div>
      </div>

      {/* Per-typology breakdown */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">
          Breakdown by Typology
        </h2>

        {data.totalClosed === 0 ? (
          <p className="text-xs text-neutral-400">No closed cases yet.</p>
        ) : (
          <div className="rounded border border-neutral-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400">
                  <th className="text-left py-2.5 px-4 font-normal">Typology</th>
                  <th className="text-left py-2.5 px-4 font-normal">Alerts</th>
                  <th className="text-left py-2.5 px-4 font-normal">SAR Filed</th>
                  <th className="text-left py-2.5 px-4 font-normal">False+ Rate</th>
                  <th className="text-left py-2.5 px-4 font-normal">Agreement</th>
                  <th className="text-left py-2.5 px-4 font-normal">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {data.byTypology.map((row: TypologyStats) => {
                  const closedCount = row.sarFiled + row.noFile;
                  return (
                    <tr key={row.typology} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-800 mb-1">{row.typology}</div>
                        <Bar value={row.total} max={maxTotal} color="bg-indigo-500" />
                      </td>
                      <td className="py-3 px-4 text-neutral-700">
                        {row.total}
                        {closedCount > 0 && (
                          <span className="text-neutral-400 ml-1">({closedCount} closed)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-700">
                        {row.sarFiled}
                        {closedCount > 0 && (
                          <span className="text-neutral-400 ml-1">
                            ({pct(row.sarFiled / closedCount)})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {closedCount > 0 ? (
                          <RateCell value={row.falsePositiveRate} invert />
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {row.agentTotalCount > 0 ? (
                          <div>
                            <RateCell value={row.agreementRate} />
                            <div className="text-neutral-400 mt-0.5">
                              {row.agentMatchCount}/{row.agentTotalCount} cases
                            </div>
                          </div>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-500 font-mono">
                        {fmtMs(row.avgDecisionMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Explanation footnote */}
        <div className="mt-4 text-[10px] text-neutral-400 space-y-0.5">
          <p>
            <strong className="text-neutral-500">Agreement:</strong> % of closed cases where the agent's recommendation (FILE SAR / CLOSE CASE) matched the analyst's final decision.
          </p>
          <p>
            <strong className="text-neutral-500">False+ Rate:</strong> % of closed cases where no SAR was filed (alert was a false positive).
          </p>
          <p>
            <strong className="text-neutral-500">Avg Latency:</strong> mean time between agent completing its recommendation and the analyst making a decision.
          </p>
        </div>
      </div>
    </div>
  );
}
