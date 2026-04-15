export type InvestigationEvent =
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; output: string }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };
