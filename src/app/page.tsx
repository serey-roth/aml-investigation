"use client";

import { useState, useRef } from "react";
import { InvestigationEvent } from "@/lib/types";
import { ToolResult } from "./components/ToolResult";

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

const DEFAULT_ALERT =
  "Account ACC-001 made 4 cash deposits in 8 days: $9,800, $9,500, $9,700, $9,600.";

const TOOL_LABELS: Record<string, string> = {
  get_transaction_history: "Transaction History",
  compute_velocity: "Velocity Analysis",
  get_merchant_history: "Merchant History",
  find_similar_cases: "Similar Cases",
};

async function* streamInvestigation(alert: string): AsyncGenerator<InvestigationEvent> {
  const res = await fetch("/api/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alert }),
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

function splitReasoning(content: string) {
  const match = content.match(/recommendation[:\s]/i);
  if (!match?.index) return { findings: content.replace(/^findings[:\s]*/i, "").trim(), recommendation: null, verdict: null };
  const rawRec = content.slice(match.index).replace(/^recommendation[:\s]*/i, "").trim();
  const verdict = /^file sar/i.test(rawRec) ? "FILE SAR" : /^close case/i.test(rawRec) ? "CLOSE CASE" : null;
  return {
    findings: content.slice(0, match.index).replace(/^findings[:\s]*/i, "").trim(),
    recommendation: rawRec.replace(/^(file sar|close case)[.:\s]*/i, "").trim(),
    verdict,
  };
}

export default function Page() {
  const [alert, setAlert] = useState(DEFAULT_ALERT);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<"initial" | "investigation">("initial");
  const tokenBufferRef = useRef("");

  const run = async () => {
    setSteps([]);
    setRunning(true);
    setView("investigation");
    tokenBufferRef.current = "";

    for await (const event of streamInvestigation(alert)) {
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
          if (last?.type === "message") {
            return [...prev.slice(0, -1), { type: "message", content: snapshot }];
          }
          return [...prev, { type: "message", content: snapshot }];
        });
      } else if (event.type === "error") {
        setSteps((prev) => [...prev, { type: "error", message: event.message }]);
      }
    }

    setRunning(false);
  };

  const toolResults = steps.filter((s): s is ToolResultStep => s.type === "tool_result");
  const messageStep = steps.find((s): s is { type: "message"; content: string } => s.type === "message");
  const errorStep = steps.find((s): s is { type: "error"; message: string } => s.type === "error");
  const { findings, recommendation, verdict } = messageStep
    ? splitReasoning(messageStep.content)
    : { findings: null, recommendation: null, verdict: null };

  // Initial view
  if (view === "initial") {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-8">
        <div className="w-full max-w-xl space-y-4">
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-white">AML Investigation Agent</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Enter a suspicious activity alert. The agent will investigate the account, retrieve similar past cases, and recommend whether to file a SAR.
            </p>
          </div>
          <textarea
            value={alert}
            onChange={(e) => setAlert(e.target.value)}
            rows={4}
            className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-sm rounded px-4 py-3 resize-none focus:outline-none focus:border-neutral-500"
            placeholder="Describe the suspicious activity alert…"
          />
          <button
            onClick={run}
            disabled={!alert.trim()}
            className="w-full py-2.5 text-sm rounded text-white bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed"
          >
            Investigate
          </button>
        </div>
      </div>
    );
  }

  // Investigation view
  return (
    <div className="flex flex-col h-screen">

      {/* Top bar */}
      <div className="border-b border-neutral-800 px-6 py-3 flex items-center gap-6">
        <button
          onClick={() => setView("initial")}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← New
        </button>
        <span className="text-xs text-neutral-600">AML Investigation Agent</span>
      </div>

      {/* Alert header */}
      <div className="border-b border-neutral-800 px-8 py-5 flex items-start justify-between gap-6">
        <p className="text-sm text-neutral-200 leading-relaxed">{alert}</p>
        <button
          onClick={run}
          disabled={running}
          className="shrink-0 px-4 py-1.5 text-sm rounded text-white bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:cursor-not-allowed"
        >
          {running ? "Investigating…" : "Re-run"}
        </button>
      </div>

      {/* Main panels */}
      <div className="flex flex-1 overflow-hidden divide-x divide-neutral-800">

        {/* Evidence */}
        <div className="w-1/2 overflow-y-auto px-8 py-6">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-6">Evidence</h2>
          <div className="space-y-8">
            {toolResults.map((step, i) => (
              <div key={i}>
                <h3 className="text-xs font-medium text-neutral-400 mb-2">
                  {TOOL_LABELS[step.tool] ?? step.tool}
                </h3>
                <ToolResult tool={step.tool} data={step.data} />
              </div>
            ))}
            {running && toolResults.length === 0 && (
              <p className="text-xs text-neutral-600">Gathering evidence…</p>
            )}
          </div>
        </div>

        {/* Reasoning */}
        <div className="w-1/2 overflow-y-auto px-8 py-6 space-y-8">
          {errorStep && <p className="text-sm text-red-400">Error: {errorStep.message}</p>}

          {(findings || (running && !messageStep)) && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-4">Findings</h2>
              {findings
                ? <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{findings}</p>
                : <p className="text-xs text-neutral-600">Waiting for agent…</p>
              }
            </div>
          )}

          {recommendation && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-4">Recommendation</h2>
              {verdict && (
                <div className={`inline-block text-xs font-semibold px-2 py-1 rounded mb-3 ${
                  verdict === "FILE SAR" ? "bg-red-900 text-red-300" : "bg-emerald-900 text-emerald-300"
                }`}>
                  {verdict}
                </div>
              )}
              <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{recommendation}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
