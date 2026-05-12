import { NextRequest } from "next/server";
import { Investigator } from "@/lib/agent/investigator";
import { MysqlLoader } from "@/lib/agent/loader";
import { getAlertById } from "@/lib/db/repositories/alert";
import { insertAuditEntry } from "@/lib/db/repositories/audit";
import { typologyInlineNote } from "@/lib/typologies";

export const runtime = "nodejs";

const investigator = new Investigator(new MysqlLoader());

export async function POST(req: NextRequest) {
  const { alertId } = await req.json();

  const alert = await getAlertById(parseInt(alertId));
  if (!alert) return Response.json({ error: "Alert not found" }, { status: 404 });

  const typologyNote = typologyInlineNote(alert.typology);
  const alertText = `Account ${alert.accountId} — Typology: ${alert.typology}\n${typologyNote}\n\n${alert.description}`;
  const encoder = new TextEncoder();
  let messageBuffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const event of investigator.stream(alertText)) {
          if (event.type === "tool_result") {
            await insertAuditEntry(alert.id, "agent", "tool_call", JSON.stringify({ tool: event.name, output: event.output }));
          } else if (event.type === "token") {
            messageBuffer += event.content;
          } else if (event.type === "done" && messageBuffer) {
            await insertAuditEntry(alert.id, "agent", "recommendation", JSON.stringify(messageBuffer));
          }
          emit(event);
        }
      } catch (err) {
        emit({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
