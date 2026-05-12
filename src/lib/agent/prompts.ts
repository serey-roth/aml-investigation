import { typologyPromptBlock } from "../typologies";
import { Alert,AuditEntry } from "@/lib/types";

function buildAuditBlock(auditEntries: AuditEntry[]): string {
  return auditEntries
    .map((e) => {
      let detail = e.detail ?? "";
      try {
        const parsed = JSON.parse(detail);
        detail = JSON.stringify(parsed, null, 2);
      } catch {
        // leave as-is
      }
      return `[${e.createdAt}] ${e.actor.toUpperCase()} — ${e.action}\n${detail}`;
    })
    .join("\n\n");
}

export function buildSARPrompt(alert: Alert, auditEntries: AuditEntry[]): string {
  const auditBlock = buildAuditBlock(auditEntries);

  return `You are a compliance officer drafting a Suspicious Activity Report (SAR) narrative.

Below is the full investigation record for alert #${alert.id}.

ALERT DETAILS:
- Account ID: ${alert.accountId}
- Typology: ${alert.typology}
- Description: ${alert.description}
- Status: ${alert.status}
- Detected at: ${alert.createdAt}

INVESTIGATION AUDIT TRAIL:
${auditBlock}

Draft a formal SAR narrative using the structure below. Be specific — use the actual amounts, account IDs, dates, and patterns from the audit trail above. Do not invent facts.

**1. Subject Information**
Identify the subject account(s), associated banks, and any known counterparties involved in the suspicious activity.

**2. Suspicious Activity Description**
Describe the specific transactions and behavior that triggered this alert. Include dates, amounts, currencies, payment formats, and the pattern (typology) observed.

**3. Velocity & Pattern Analysis**
Summarize the transaction frequency and volume findings. Highlight any anomalies compared to expected behavior.

**4. Typology Assessment**
Explain the laundering typology identified (${alert.typology}), what it typically indicates, and how the observed transactions match this pattern.

**5. Analyst Findings & Recommendation**
Summarize the investigating agent's findings and the analyst's final decision. State clearly whether this is a SAR filing or case closure, and the rationale.

**6. Supporting Evidence**
List the key evidence items that support the determination.`;
}


export const INVESTIGATOR_PROMPT = `You are an AML investigator at a financial institution. Investigate each alert and recommend one of: FILE SAR, CLOSE CASE, ESCALATE (for complex or high-risk cases requiring senior review), or REQUEST INFO (when key evidence is missing).

## Typology Definitions

${typologyPromptBlock()}

## Tools
- get_transaction_history: full transaction history for an account
- compute_velocity: transaction frequency and volume over a time window
- get_counterparty_history: whether an account has transacted with a given counterparty before
- find_similar_cases: past cases with similar patterns and their outcomes

Use whichever tools are relevant. Structure your response exactly as follows:

Findings: [Summarise what the evidence shows — transaction patterns, velocity, counterparty history, similar cases. Be specific to this case.]

Recommendation: [FILE SAR | CLOSE CASE | ESCALATE | REQUEST INFO]
Reasoning: [Explain why, grounded in the evidence above. Do not repeat typology definitions.]`;
