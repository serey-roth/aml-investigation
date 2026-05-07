"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Alert, AuditEntry, InvestigationEvent, InvestigationSnapshot } from "@/lib/types";
import { ToolResult } from "@/app/components/ToolResult";
import { AuditTrail } from "@/app/components/AuditTrail";
import { NetworkGraph } from "@/app/components/NetworkGraph";
import { SARNarrative } from "@/app/components/SARNarrative";


type ToolResultStep = {
  type: "tool_result";
  tool: string;
  data: Record<string, unknown> | null;
};

type Step =
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | ToolResultStep
  | { type: "message"; content: string }
  | { type: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  get_transaction_history: "Transaction History",
  compute_velocity: "Velocity Analysis",
  get_counterparty_history: "Counterparty History",
  find_similar_cases: "Similar Cases",
};

async function* streamInvestigation(alertId: number): AsyncGenerator<InvestigationEvent> {
  const res = await fetch("/api/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alertId }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      yield JSON.parse(line.slice(6)) as InvestigationEvent;
    }
  }
}

type Verdict = "FILE SAR" | "CLOSE CASE" | "ESCALATE" | "REQUEST INFO" | null;

const VERDICTS: [RegExp, Verdict][] = [
  [/^file\s+sar/i, "FILE SAR"],
  [/^close\s+case/i, "CLOSE CASE"],
  [/^escalate/i, "ESCALATE"],
  [/^request\s+info/i, "REQUEST INFO"],
];

function splitReasoning(content: string) {
  const recMatch = content.match(/^recommendation[:\s]*/im);
  if (!recMatch?.index) {
    return { findings: content.replace(/^findings[:\s]*/i, "").trim(), recommendation: null, verdict: null };
  }

  const findings = content.slice(0, recMatch.index).replace(/^findings[:\s]*/i, "").trim();
  const afterRec = content.slice(recMatch.index + recMatch[0].length).trim();

  let verdict: Verdict = null;
  for (const [pattern, label] of VERDICTS) {
    if (pattern.test(afterRec)) { verdict = label; break; }
  }

  // Reasoning may follow on the next line after "Reasoning:"
  const reasoningMatch = afterRec.match(/^reasoning[:\s]*/im);
  const recommendation = reasoningMatch
    ? afterRec.slice(reasoningMatch.index! + reasoningMatch[0].length).trim()
    : afterRec.replace(/^(file sar|close case|escalate|request info)[.:\s]*/i, "").trim();

  return { findings, recommendation, verdict };
}

export default function Page() {
  const params = useParams();
  const router = useRouter();
  const alertId = parseInt(params.id as string);

  const [alert, setAlert] = useState<Alert | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [snapshot, setSnapshot] = useState<InvestigationSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState<"evidence" | "graph">("evidence");
  const [decided, setDecided] = useState(false);
  const [note, setNote] = useState("");
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const tokenBufferRef = useRef("");
  const runningRef = useRef(false);
  const isDecided = !!alert && ["closed"].includes(alert.status);
  const isSarFiled = isDecided && auditEntries.some((e) => {
    if (e.action !== "decision") return false;
    try { return JSON.parse(e.detail ?? "{}").outcome === "SAR_FILED"; }
    catch { return false; }
  });

  const refreshAudit = () => {
    fetch(`/api/alerts/${alertId}/audit`).then((r) => r.json()).then(setAuditEntries);
  };

  useEffect(() => {
    fetch(`/api/alerts/${alertId}`)
      .then((r) => r.json())
      .then((a: Alert) => {
        setAlert(a);
        if (a.status === "closed") {
          fetch(`/api/alerts/${alertId}/snapshot`)
            .then((r) => r.json())
            .then((s: InvestigationSnapshot | null) => setSnapshot(s));
        } else if (a.status === "open") {
          run();
        }
      });
    refreshAudit();
  }, [alertId]);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSteps([]);
    setRunning(true);
    tokenBufferRef.current = "";

    for await (const event of streamInvestigation(alertId)) {
      if (event.type === "tool_call") {
        setSteps((prev) => [...prev, { type: "tool_call", name: event.name, input: event.input }]);
      } else if (event.type === "tool_result") {
        const data = (() => { try { return JSON.parse(event.output); } catch { return null; } })();
        setSteps((prev) => [...prev, { type: "tool_result", tool: event.name, data }]);
      } else if (event.type === "token") {
        tokenBufferRef.current += event.content;
        const snapshot = tokenBufferRef.current;
        setSteps((prev) => {
          const last = prev[prev.length - 1];
          if (last?.type === "message") return [...prev.slice(0, -1), { type: "message", content: snapshot }];
          return [...prev, { type: "message", content: snapshot }];
        });
      } else if (event.type === "error") {
        setSteps((prev) => [...prev, { type: "error", message: event.message }]);
      }
    }

    runningRef.current = false;
    setRunning(false);
    refreshAudit();
  };

  const decide = async (outcome: "SAR_FILED" | "NO_FILE" | "ESCALATED" | "RFI") => {
    const messageStep = steps.find((s): s is { type: "message"; content: string } => s.type === "message");
    const closes = outcome === "SAR_FILED" || outcome === "NO_FILE";
    const snap: InvestigationSnapshot | null = closes
      ? { toolResults: toolResults.map((s) => ({ tool: s.tool, data: s.data })), message: messageStep?.content ?? "" }
      : null;
    await fetch(`/api/alerts/${alertId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, note, recommendation: messageStep?.content ?? "", snapshot: snap }),
    });
    setDecided(closes);
    if (closes && snap) setSnapshot(snap);
    refreshAudit();
    setActivityOpen(true);
    fetch(`/api/alerts/${alertId}`).then((r) => r.json()).then(setAlert);
    if (!closes) {
      setNote("");
    }
  };

  const TOOL_ORDER = ["compute_velocity", "get_counterparty_history", "find_similar_cases", "get_transaction_history"];
  const liveToolResults = steps
    .filter((s): s is ToolResultStep => s.type === "tool_result")
    .sort((a, b) => {
      const ai = TOOL_ORDER.indexOf(a.tool);
      const bi = TOOL_ORDER.indexOf(b.tool);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  const toolResults = isDecided && snapshot ? snapshot.toolResults : liveToolResults;
  const messageStep = steps.find((s): s is { type: "message"; content: string } => s.type === "message");
  const activeMessage = isDecided && snapshot ? snapshot.message : (messageStep?.content ?? null);
  const errorStep = steps.find((s): s is { type: "error"; message: string } => s.type === "error");
  const { findings, recommendation, verdict } = activeMessage
    ? splitReasoning(activeMessage)
    : { findings: null, recommendation: null, verdict: null };

  const canDecide = !running && !!messageStep && !decided && alert?.status !== "closed";

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="border-b border-neutral-200 px-6 py-3 flex items-center">
        <button onClick={() => router.push("/")} className="text-xs text-neutral-400 hover:text-neutral-600">
          ← Alerts
        </button>
        <div className="ml-auto flex items-center gap-4">
          {!running && messageStep && alert?.status === "open" && !decided && (
            <button onClick={run} className="text-xs text-neutral-400 hover:text-neutral-600">
              Re-run
            </button>
          )}
          {alert && (
            <button onClick={() => setActivityOpen(true)} className="text-xs text-neutral-400 hover:text-neutral-600">
              Activity
            </button>
          )}
        </div>
      </div>

      {/* Alert header + description */}
      {alert && (
        <div className="border-b border-neutral-200 px-8 py-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-neutral-500 font-mono">{alert.accountId}</span>
            {alert.status === "escalated" && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Escalated</span>}
            {alert.status === "rfi" && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Awaiting Info</span>}
            {alert.status === "closed" && <span className="text-xs text-neutral-400 px-2 py-0.5 rounded border border-neutral-200">Closed</span>}
          </div>
          <p className="text-sm text-neutral-700 leading-relaxed">
            {alert.description}
          </p>
        </div>
      )}

      {/* Activity drawer */}
      {alert && (
        <AuditTrail
          alert={alert}
          entries={auditEntries}
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
        />
      )}

      {/* Main panels */}
      <div className="flex min-h-0 flex-1 overflow-hidden divide-x divide-neutral-200">
        {/* Evidence */}
        <div className="w-1/2 overflow-y-auto px-8 py-6">
          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-6">
            {(["evidence", "graph"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setEvidenceTab(t)}
                className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
                  evidenceTab === t
                    ? "bg-neutral-200 text-neutral-800"
                    : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                {t === "evidence" ? "Evidence" : "Network Graph"}
              </button>
            ))}
          </div>

          {evidenceTab === "evidence" && (
            <div className="space-y-8">
              {toolResults.map((step, i) => (
                <div key={i}>
                  <h3 className="text-xs font-medium text-neutral-500 mb-2">{TOOL_LABELS[step.tool] ?? step.tool}</h3>
                  <ToolResult tool={step.tool} data={step.data} />
                </div>
              ))}
              {running && toolResults.length === 0 && (
                <p className="text-xs text-neutral-400">Gathering evidence…</p>
              )}
              {!running && isDecided && toolResults.length === 0 && (
                <p className="text-xs text-neutral-400">No investigation snapshot recorded for this case.</p>
              )}
            </div>
          )}

          {evidenceTab === "graph" && (
            <NetworkGraph alertId={alertId} />
          )}
        </div>

        {/* Reasoning + Decision */}
        <div className="w-1/2 overflow-y-auto px-8 py-6 flex flex-col">
          <div className="flex-1 space-y-8">
            {errorStep && <p className="text-sm text-red-600">Error: {errorStep.message}</p>}
            {(findings || (running && !messageStep)) && (
              <div>
                <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Findings</h2>
                {findings
                  ? <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{findings}</p>
                  : <p className="text-xs text-neutral-400">Waiting for agent…</p>
                }
              </div>
            )}
            {recommendation && (
              <div>
                <h2 className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Recommendation</h2>
                {verdict && (
                  <div className={`inline-block text-xs font-semibold px-2 py-1 rounded mb-3 ${
                    verdict === "FILE SAR" ? "bg-red-100 text-red-700" :
                    verdict === "CLOSE CASE" ? "bg-emerald-100 text-emerald-700" :
                    verdict === "ESCALATE" ? "bg-amber-100 text-amber-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {verdict}
                  </div>
                )}
                <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{recommendation}</p>
              </div>
            )}
          </div>

          {/* Decision bar */}
          {decided ? (
            <div className="mt-8 pt-6 border-t border-neutral-200">
              <p className="text-xs text-neutral-400">Case closed. <button onClick={() => router.push("/")} className="text-neutral-600 hover:text-neutral-800 underline">Back to Alerts</button></p>
            </div>
          ) : canDecide ? (
            <div className="mt-8 pt-6 border-t border-neutral-200 space-y-3">
              <h2 className="text-xs uppercase tracking-widest text-neutral-400">Decision</h2>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Document your rationale — required for all actions."
                className="w-full bg-neutral-50 border border-neutral-200 text-neutral-700 text-xs rounded px-3 py-2 resize-none focus:outline-none focus:border-neutral-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => decide("SAR_FILED")}
                  disabled={!note.trim()}
                  className="flex-1 py-2 text-xs rounded font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  File SAR
                </button>
                <button
                  onClick={() => decide("NO_FILE")}
                  disabled={!note.trim()}
                  className="flex-1 py-2 text-xs rounded font-medium bg-neutral-200 text-neutral-700 hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Close
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => decide("ESCALATED")}
                  disabled={!note.trim()}
                  className="flex-1 py-1.5 text-xs rounded font-medium border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Escalate
                </button>
                <button
                  onClick={() => decide("RFI")}
                  disabled={!note.trim()}
                  className="flex-1 py-1.5 text-xs rounded font-medium border border-neutral-300 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Request Info
                </button>
              </div>
            </div>
          ) : null}
          {isSarFiled && (
            <div className="mt-8">
              <SARNarrative alertId={alertId} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
