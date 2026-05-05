"use client";

import { useState, useRef } from "react";

interface SARNarrativeProps {
  alertId: number;
  /** Only allow drafting when the alert has a decision recorded */
  isDecided: boolean;
}

type DraftState = "idle" | "streaming" | "done" | "error";

export function SARNarrative({ alertId, isDecided }: SARNarrativeProps) {
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
    // Minimal bold + line-break rendering without a dependency
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} className="text-neutral-200 font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={j}>{part}</span>;
      });
      return (
        <p key={i} className={line.startsWith("**") ? "mt-5 mb-1" : "mb-0.5 text-neutral-400 leading-relaxed"}>
          {parts}
        </p>
      );
    });
  }

  if (!isDecided) {
    return (
      <div className="rounded border border-dashed border-neutral-800 p-5 text-center">
        <p className="text-xs text-neutral-600">
          SAR narrative is available after a decision has been recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500">
          SAR Narrative
        </h2>
        <div className="flex items-center gap-2">
          {state === "done" && (
            <>
              <button
                onClick={handleCopy}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                onClick={handleDownload}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Download .txt
              </button>
              <button
                onClick={startDraft}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                Regenerate
              </button>
            </>
          )}
          {state === "streaming" && (
            <button
              onClick={handleStop}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
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
          className="w-full rounded border border-neutral-800 py-3 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors"
        >
          Draft SAR Narrative
        </button>
      )}

      {/* Streaming / done content */}
      {(state === "streaming" || state === "done") && (
        <div className="rounded border border-neutral-800 bg-neutral-950 p-5 text-sm font-mono">
          {state === "streaming" && narrative.length === 0 && (
            <p className="text-xs text-neutral-500 animate-pulse">Generating narrative…</p>
          )}
          {renderMarkdown(narrative)}
          {state === "streaming" && narrative.length > 0 && (
            <span className="inline-block w-1.5 h-3.5 bg-neutral-500 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="rounded border border-red-900 bg-red-950/30 p-4 text-xs text-red-400">
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
        <p className="text-xs text-neutral-700">
          AI-generated draft — review and edit before filing. This does not
          constitute legal or regulatory advice.
        </p>
      )}
    </div>
  );
}
