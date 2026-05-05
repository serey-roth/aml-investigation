import { NextRequest } from "next/server";
import { getAlertById} from "@/lib/db/repositories/alert";
import { getAuditTrail } from "@/lib/db/repositories/audit";
import { buildSARPrompt } from "@/lib/agent/prompts";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const alertId = parseInt(id);

  const alert = getAlertById(alertId);
  if (!alert) return Response.json({ error: "Not found" }, { status: 404 });

  const auditEntries = getAuditTrail(alertId);

  const prompt = buildSARPrompt(alert, auditEntries);

  // Abort the upstream request if Ollama doesn't respond within 10 s.
  // This keeps the route non-blocking during the demo — the client receives
  // a clean SSE error event instead of a hanging connection.
  const ollamaAbort = new AbortController();
  const ollamaTimeout = setTimeout(() => ollamaAbort.abort(), 10_000);

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:3b",
        prompt,
        stream: true,
      }),
      signal: ollamaAbort.signal,
    });
  } catch (err) {
    clearTimeout(ollamaTimeout);
    const msg = err instanceof Error && err.name === "AbortError"
      ? "Ollama timed out after 10 s — is the model loaded?"
      : "Ollama unreachable";
    return Response.json({ error: msg }, { status: 502 });
  }
  clearTimeout(ollamaTimeout);

  if (!ollamaRes.ok || !ollamaRes.body) {
    return Response.json({ error: "Ollama unavailable" }, { status: 502 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Per-chunk timeout: if Ollama stalls mid-stream (e.g. model OOM)
      // surface an error SSE event rather than silently hanging.
      function readWithTimeout() {
        return Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Chunk read timed out after 15 s")), 15_000)
          ),
        ]);
      }

      try {
        while (true) {
          const { done, value } = await readWithTimeout();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.response) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ token: json.response })}\n\n`)
                );
              }
              if (json.done) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
                );
              }
            } catch {
              // skip malformed lines
            }
          }
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}