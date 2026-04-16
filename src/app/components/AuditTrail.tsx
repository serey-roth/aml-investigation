"use client";

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface AlertSummary {
  account_id: string;
  typology: string;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  label: string;
  description: string;
  timestamp: string;
  highlight?: "red" | "green";
}

function extractVerdict(text: string): "FILE SAR" | "CLOSE CASE" | null {
  if (/file\s+sar/i.test(text)) return "FILE SAR";
  if (/close\s+case/i.test(text)) return "CLOSE CASE";
  return null;
}

function extractReasoningSummary(text: string): string {
  const match = text.match(/recommendation[:\s]+(file\s+sar|close\s+case)[.:\s]*([\s\S]*)/i);
  if (match?.[2]) {
    const rest = match[2].replace(/^reasoning[:\s]*/i, "").trim();
    return rest.slice(0, 140) + (rest.length > 140 ? "…" : "");
  }
  const findings = text.replace(/^findings[:\s]*/i, "").trim();
  return findings.slice(0, 140) + (findings.length > 140 ? "…" : "");
}

function parseDecision(detail: string | null): { outcome: string; note?: string } | null {
  if (!detail) return null;
  try {
    const p = JSON.parse(detail);
    return p.outcome ? { outcome: p.outcome, note: p.note || undefined } : null;
  } catch { return null; }
}

function buildEvents(alert: AlertSummary, entries: AuditEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: "alert",
      label: "Alert Opened",
      description: `Account ${alert.account_id} flagged for ${alert.typology}.`,
      timestamp: alert.created_at,
    },
  ];

  for (const e of entries.filter((e) => ["recommendation","decision","flag"].includes(e.action))) {
    if (e.action === "recommendation") {
      const verdict = extractVerdict(e.detail ?? "");
      const summary = extractReasoningSummary(e.detail ?? "");
      events.push({
        id: String(e.id),
        label: "AI Investigation Complete",
        description: verdict ? `Recommended ${verdict}. ${summary}` : summary || "Investigation complete.",
        timestamp: e.created_at,
        highlight: verdict === "FILE SAR" ? "red" : verdict === "CLOSE CASE" ? "green" : undefined,
      });
    } else if (e.action === "decision") {
      const d = parseDecision(e.detail);
      const isSAR = d?.outcome === "SAR_FILED";
      events.push({
        id: String(e.id),
        label: "Analyst Decision",
        description: isSAR
          ? `SAR filed by analyst.${d?.note ? ` "${d.note}"` : ""}`
          : `Case closed, no filing.${d?.note ? ` "${d.note}"` : ""}`,
        timestamp: e.created_at,
        highlight: isSAR ? "red" : "green",
      });
    } else if (e.action === "flag") {
      try {
        const d = JSON.parse(e.detail ?? "{}");
        const isEscalated = d.status === "escalated";
        events.push({
          id: String(e.id),
          label: isEscalated ? "Escalated" : "Request for Information Sent",
          description: isEscalated
            ? `Escalated.${d.note ? ` "${d.note}"` : ""}`
            : `More information requested.${d.note ? ` "${d.note}"` : ""}`,
          timestamp: e.created_at,
          highlight: isEscalated ? "red" : undefined,
        });
      } catch { /* ignore */ }
    }
  }

  return events;
}

function formatTimeOnly(ts: string) {
  return ts.slice(11, 16);
}

function formatDateLabel(ts: string) {
  const d = new Date(ts.replace(" ", "T") + "Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function AuditTrail({
  alert,
  entries,
  open,
  onClose,
}: {
  alert: AlertSummary;
  entries: AuditEntry[];
  open: boolean;
  onClose: () => void;
}) {
  const meaningful = entries.filter((e) => ["recommendation", "decision", "flag"].includes(e.action));
  const events = buildEvents(alert, meaningful);

  // Group by date
  const grouped: { date: string; items: TimelineEvent[] }[] = [];
  for (const ev of events) {
    const date = formatDateLabel(ev.timestamp);
    const last = grouped[grouped.length - 1];
    if (last?.date === date) last.items.push(ev);
    else grouped.push({ date, items: [ev] });
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-20" onClick={onClose} />}

      <div className={`fixed top-0 right-0 h-full w-72 bg-neutral-950 border-l border-neutral-800 z-30 flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 shrink-0">
          <span className="text-xs uppercase tracking-widest text-neutral-400 font-medium">Activity</span>
          <button onClick={onClose} className="text-neutral-600 hover:text-neutral-300 text-xs">✕</button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {grouped.map((group) => (
            <div key={group.date}>
              {/* Date divider */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-neutral-600 uppercase tracking-wider">{group.date}</span>
                <div className="flex-1 h-px bg-neutral-800" />
              </div>

              {/* Events for this date */}
              <ol className="space-y-0">
                {group.items.map((ev, i) => {
                  const isLast = i === group.items.length - 1;
                  const dotColor =
                    ev.highlight === "red" ? "bg-red-500" :
                    ev.highlight === "green" ? "bg-emerald-500" :
                    "bg-neutral-600";

                  return (
                    <li key={ev.id} className="flex gap-3">
                      {/* Dot + line */}
                      <div className="flex flex-col items-center">
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${dotColor}`} />
                        {!isLast && <div className="w-px flex-1 bg-neutral-800 my-1" />}
                      </div>

                      {/* Content */}
                      <div className={`pb-4 min-w-0 ${isLast ? "" : ""}`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-neutral-200">{ev.label}</span>
                          <span className="text-[10px] text-neutral-600 font-mono ml-auto shrink-0">{formatTimeOnly(ev.timestamp)}</span>
                        </div>
                        <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">{ev.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
