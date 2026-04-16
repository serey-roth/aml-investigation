export interface TypologyDefinition {
  label: string;
  description: string;
  amlSignificance: string;
}

export const TYPOLOGIES: Record<string, TypologyDefinition> = {
  "FAN-OUT": {
    label: "Fan-Out",
    description: "One account distributes funds to many accounts in a short period.",
    amlSignificance: "Suggests layering — distributing funds from a single source across multiple destinations to distance them from their origin and complicate tracing.",
  },
  "FAN-IN": {
    label: "Fan-In",
    description: "Many accounts funnel funds into a single account.",
    amlSignificance: "Suggests layering — aggregating dispersed funds into one account before onward transfer or extraction. Funds are already within the financial system, making this a layering rather than placement activity.",
  },
  "CYCLE": {
    label: "Cycle",
    description: "Funds are routed through a chain of accounts and return to the originating account.",
    amlSignificance: "Suggests circular movement to simulate legitimate transaction activity and obscure the money trail — a recognised layering technique.",
  },
  "GATHER-SCATTER": {
    label: "Gather-Scatter",
    description: "Funds are first consolidated from multiple sources into one account (FAN-IN), then dispersed to multiple destinations (FAN-OUT).",
    amlSignificance: "Combines aggregation and dispersal in sequence — funds are pooled then broken up to obscure their origin.",
  },
  "SCATTER-GATHER": {
    label: "Scatter-Gather",
    description: "Funds are dispersed from one account to many (FAN-OUT), then reconsolidated into a single destination account (FAN-IN).",
    amlSignificance: "Combines dispersal and reaggregation — the inverse of GATHER-SCATTER. Funds arrive at a clean endpoint after passing through multiple intermediaries.",
  },
  "BIPARTITE": {
    label: "Bipartite",
    description: "A hub account receives funds from a set of source accounts, then redistributes most of the received amount to a separate set of destination accounts — a two-layer directed flow through a central node.",
    amlSignificance: "Suggests a coordinated network using a central hub to receive, consolidate, and redistribute funds, obscuring the link between original sources and final beneficiaries.",
  },
  "STACK": {
    label: "Stack",
    description: "Funds move through multiple sequential layers of accounts (stacked bipartite), with accounts in each layer transferring to accounts in the next layer.",
    amlSignificance: "Suggests deep layering through multiple tiers of intermediary accounts, making it significantly harder to trace funds back to their origin than a simple pass-through chain.",
  },
  "RANDOM": {
    label: "Random",
    description: "Funds move through a network of connected accounts via randomised paths, with no fixed structural pattern — modelled as a random walk among accounts in the same laundering subgraph.",
    amlSignificance: "Suggests deliberate obfuscation through unpredictable routing within a controlled account network, making structural pattern detection harder.",
  },
};

export function getTypologyDefinition(typology: string): TypologyDefinition | undefined {
  return TYPOLOGIES[typology];
}

/** One-line summary for use in alert text passed to the agent. */
export function typologyInlineNote(typology: string): string {
  const t = TYPOLOGIES[typology];
  if (!t) return "";
  return `${t.description} ${t.amlSignificance}`;
}

/** Formatted block for the agent system prompt. */
export function typologyPromptBlock(): string {
  return Object.entries(TYPOLOGIES)
    .map(([key, t]) => `- ${key}: ${t.description} ${t.amlSignificance}`)
    .join("\n");
}
