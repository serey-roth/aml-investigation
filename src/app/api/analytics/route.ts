import {
  countAllAlerts,
  countClosedAlerts,
  getTypologyTotals,
  getTypologyCountsByOutcome,
  getClosedCasesWithOutcome,
} from "@/lib/db/repositories/alert";
import { getLatestRecommendationsAndDecisions } from "@/lib/db/repositories/audit";
import type { TypologyStats, AnalyticsData } from "@/lib/types";
export type { TypologyStats, AnalyticsData };
export const runtime = "nodejs";


function parseAgentRecommendation(
  text: string
): "SAR_FILED" | "NO_FILE" | null {
  if (/file\s+sar/i.test(text)) return "SAR_FILED";
  if (/close\s+case/i.test(text)) return "NO_FILE";
  return null;
}

export async function GET() {
  const totalAlerts = countAllAlerts();
  const totalClosed = countClosedAlerts();
  const totalOpen = totalAlerts - totalClosed;

  const closedCases = getClosedCasesWithOutcome();
  const typologyCountsByOutcome = getTypologyCountsByOutcome();
  const typologyTotals = getTypologyTotals();
  const auditLatestRows = getLatestRecommendationsAndDecisions();

  // Map latest audit entries per alert
  interface AuditPair {
    recommendation: { detail: string; ts_sec: number } | null;
    decision: { detail: string; ts_sec: number } | null;
  }
  const auditByAlert = new Map<number, AuditPair>();
  for (const row of auditLatestRows) {
    if (!auditByAlert.has(row.alert_id)) {
      auditByAlert.set(row.alert_id, { recommendation: null, decision: null });
    }
    const pair = auditByAlert.get(row.alert_id)!;
    if (row.action === "recommendation") {
      pair.recommendation = { detail: row.detail, ts_sec: row.ts_sec };
    } else if (row.action === "decision") {
      pair.decision = { detail: row.detail, ts_sec: row.ts_sec };
    }
  }

  const typologyMap = new Map<string, TypologyStats>();
  const ensureTypology = (t: string) => {
    if (!typologyMap.has(t)) {
      typologyMap.set(t, {
        typology: t,
        total: 0,
        sarFiled: 0,
        noFile: 0,
        unknown: 0,
        agentMatchCount: 0,
        agentTotalCount: 0,
        agreementRate: 0,
        falsePositiveRate: 0,
        avgDecisionMs: 0,
      });
    }
    return typologyMap.get(t)!;
  };

  for (const { typology, total } of typologyTotals) {
    ensureTypology(typology).total = total;
  }

  for (const row of typologyCountsByOutcome) {
    const stat = ensureTypology(row.typology);
    stat.sarFiled = row.sarFiled;
    stat.noFile = row.noFile;
    stat.unknown = row.unknown;
  }

  const decisionMsList = new Map<string, number[]>();
  let globalMatchCount = 0;
  let globalPairCount = 0;

  for (const c of closedCases) {
    const pair = auditByAlert.get(c.alert_id);
    if (pair?.recommendation && pair?.decision) {
      const stat = ensureTypology(c.typology);
      const agentVerdict = parseAgentRecommendation(pair.recommendation.detail);
      let analystVerdict: "SAR_FILED" | "NO_FILE" | null = null;
      try {
        const parsed = JSON.parse(pair.decision.detail);
        if (parsed.outcome === "SAR_FILED") analystVerdict = "SAR_FILED";
        else if (parsed.outcome === "NO_FILE") analystVerdict = "NO_FILE";
      } catch {
        /* ignore malformed entries */
      }

      if (agentVerdict && analystVerdict) {
        stat.agentTotalCount++;
        globalPairCount++;
        if (agentVerdict === analystVerdict) {
          stat.agentMatchCount++;
          globalMatchCount++;
        }
        const ms = (pair.decision.ts_sec - pair.recommendation.ts_sec) * 1000;
        if (ms >= 0) {
          if (!decisionMsList.has(c.typology)) decisionMsList.set(c.typology, []);
          decisionMsList.get(c.typology)!.push(ms);
        }
      }
    }
  }

  const byTypology: TypologyStats[] = [];
  for (const [, stat] of typologyMap) {
    const closedKnown = stat.sarFiled + stat.noFile;
    // False positive rate excludes unknown-outcome cases from denominator
    stat.falsePositiveRate =
    closedKnown > 0 ? stat.noFile / closedKnown : 0;  
    stat.agreementRate =
      stat.agentTotalCount > 0 ? stat.agentMatchCount / stat.agentTotalCount : 0;
    const msList = decisionMsList.get(stat.typology) ?? [];
    stat.avgDecisionMs =
      msList.length > 0 ? msList.reduce((a, b) => a + b, 0) / msList.length : 0;
    byTypology.push(stat);
  }

  byTypology.sort((a, b) => b.total - a.total);

  const knownClosed = closedCases.filter((c) => c.outcome !== null);
  const overallSarRate =
    knownClosed.length > 0
      ? knownClosed.filter((c) => c.outcome === "SAR_FILED").length / knownClosed.length
      : 0;
  const overallFalsePositiveRate =
    knownClosed.length > 0
      ? knownClosed.filter((c) => c.outcome === "NO_FILE").length / knownClosed.length
      : 0;
  const overallAgreementRate =
    globalPairCount > 0 ? globalMatchCount / globalPairCount : 0;

  const data: AnalyticsData = {
    totalAlerts,
    totalClosed,
    totalOpen,
    overallSarRate,
    overallFalsePositiveRate,
    overallAgreementRate,
    byTypology,
  };

  return Response.json(data);
}