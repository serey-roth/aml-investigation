import { createAgent, ReactAgent } from "langchain";
import { InvestigationEvent } from "@/lib/types";
import { CaseDataLoader } from "./loader";
import { investigatorModel } from "./models";
import { INVESTIGATOR_PROMPT } from "./prompts";
import { createTools } from "./tools";

export type { InvestigationEvent };

function extractInput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  if (typeof obj.input === "string") {
    try { return JSON.parse(obj.input); } catch { /* fall through */ }
  }
  return obj;
}

function extractOutput(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const kwargs = obj.kwargs as Record<string, unknown> | undefined;
    if (typeof kwargs?.content === "string") return kwargs.content;
    if (typeof obj.content === "string") return obj.content;
  }
  return JSON.stringify(raw);
}

export class Investigator {
  private agent: ReactAgent;

  constructor(loader: CaseDataLoader) {
    this.agent = createAgent({
      model: investigatorModel,
      systemPrompt: INVESTIGATOR_PROMPT,
      tools: createTools(loader),
    });
  }

  async invoke(alert: string): Promise<string> {
    const result = await this.agent.invoke({
      messages: [{ role: "user", content: `Alert:\n\n${alert}` }],
    });
    const final = result.messages[result.messages.length - 1];
    const content = final.content;
    return typeof content === "string" ? content : JSON.stringify(content);
  }

  async *stream(alert: string): AsyncGenerator<InvestigationEvent> {
    const events = this.agent.streamEvents(
      { messages: [{ role: "user", content: `Alert:\n\n${alert}` }] },
      { version: "v2" }
    );

    for await (const event of events) {
      if (event.event === "on_tool_start") {
        yield { type: "tool_call", name: event.name, input: extractInput(event.data?.input) };
      } else if (event.event === "on_tool_end") {
        yield { type: "tool_result", name: event.name, output: extractOutput(event.data?.output) };
      } else if (event.event === "on_chat_model_stream") {
        const content = event.data?.chunk?.content;
        if (!content) continue;
        const text = typeof content === "string" ? content : JSON.stringify(content);
        yield { type: "token", content: text };
      }
    }

    yield { type: "done" };
  }
}
