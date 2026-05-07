"use client";

import { useState, useRef } from "react";

interface SARNarrativeProps {
  alertId: number;
}

type DraftState = "idle" | "streaming" | "done" | "error";

export function SARNarrative({ alertId }: SARNarrativeProps) {
  const [state, setState] = useState<DraftState>("idle");
  const [narrative, setNarrative] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  async function startDraft() {
    setNarrative("");
    setError("");
    setState("streaming");

    const res = await fetch(`/api/alerts/${alertId}/sar`);
    if (!res.ok || !res.body) {
      setError("Failed to start SAR generation.");
      setState("error");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let cancelled = false;

    abortRef.current = () => {
      cancelled = true;
      reader.cancel();
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelled) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.done) {
            setState("done");
            return;
          }
          if (payload.error) {
            setError(payload.error);
            setState("error");
            return;
          }
          if (payload.token) {
            setNarrative((prev) => prev + payload.token);
          }
        }
      }
      if (!cancelled) setState("done");
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Stream error");
        setState("error");
      }
    }
  }

  function handleStop() {
    abortRef.current?.();
    setState("done");
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(narrative);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([narrative], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SAR-alert-${alertId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderMarkdown(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} className="text-neutral-800 font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={j}>{part}</span>;
      });
      return (
        <p key={i} className={line.startsWith("**") ? "mt-5 mb-1" : "mb-0.5 text-neutral-500 leading-relaxed"}>
          {parts}
        </p>
      );
    });
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-neutral-400">
          SAR Narrative
        </h2>
        <div className="flex items-center gap-2">
          {state === "done" && (
            <>
              <button
                onClick={handleCopy}
                className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                onClick={handleDownload}
                className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Download .txt
              </button>
              <button
                onClick={startDraft}
                className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Regenerate
              </button>
            </>
          )}
          {state === "streaming" && (
            <button
              onClick={handleStop}
              className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Draft button */}
      {state === "idle" && (
        <button
          onClick={startDraft}
          className="w-full rounded border border-neutral-200 py-3 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
        >
          Draft FinCEN SAR narrative
        </button>
      )}

      {/* Streaming / done content */}
      {(state === "streaming" || state === "done") && (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-5 text-sm font-mono">
          {state === "streaming" && narrative.length === 0 && (
            <p className="text-xs text-neutral-400 animate-pulse">Generating narrative…</p>
          )}
          {renderMarkdown(narrative)}
          {state === "streaming" && narrative.length > 0 && (
            <span className="inline-block w-1.5 h-3.5 bg-neutral-400 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-xs text-red-600">
          {error || "Something went wrong. Please try again."}
          <button
            onClick={startDraft}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Disclaimer */}
      {state === "done" && (
        <p className="text-xs text-neutral-400">
          AI-generated draft — review and edit before filing. This does not
          constitute legal or regulatory advice.
        </p>
      )}
    </div>
  );
}
