import { NextRequest } from "next/server";
import { Investigator } from "@/lib/agent/investigator";
import { SqliteLoader } from "@/lib/db/loader";

export const runtime = "nodejs";

const investigator = new Investigator(new SqliteLoader());

export async function POST(req: NextRequest) {
  const { alert } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const event of investigator.stream(alert)) {
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
