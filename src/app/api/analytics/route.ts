import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

export interface TypologyStats {
  typology: string;
  total: number;
  sarFiled: number;
  noFile: number;
  unknown: number;           // closed but no case_memory entry (bug #7)
  agentMatchCount: number;
  agentTotalCount: number;
  agreementRate: number;
  falsePositiveRate: number;
  avgDecisionMs: number;     // mean (label corrected from "median", bug #4)
}

export interface AnalyticsData {
  totalAlerts: number;
  totalClosed: number;
  totalOpen: number;
  overallSarRate: number;
  overallFalsePositiveRate: number;
  overallAgreementRate: number;
  byTypology: TypologyStats[];
}

function parseAgentRecommendation(
  text: string
): "SAR_FILED" | "NO_FILE" | null {
  if (/file\s+sar/i.test(text)) return "SAR_FILED";
  if (/close\s+case/i.test(text)) return "NO_FILE";
  return null;
}

export async function GET() {
  const db = getDb();

  const totalAlerts = (
    db.prepare("SELECT COUNT(*) as n FROM alerts").get() as { n: number }
  ).n;
  const totalClosed = (
    db
      .prepare("SELECT COUNT(*) as n FROM alerts WHERE status = 'closed'")
      .get() as { n: number }
  ).n;
  const totalOpen = totalAlerts - totalClosed;

  // Bug #7 fix: LEFT JOIN so closed cases with no case_memory row are included
  const closedCases = db
    .prepare(
      `SELECT a.id as alert_id, a.typology, cm.outcome
       FROM alerts a
       LEFT JOIN case_memory cm ON cm.alert_id = a.id
       WHERE a.status = 'closed'`
    )
    .all() as { alert_id: number; typology: string; outcome: string | null }[];

  // Bug #3 fix: track the LATEST recommendation and LATEST decision per alert.
  // Ordered ASC so later rows overwrite earlier ones in the map.
  const auditRows = db
    .prepare(
      `SELECT alert_id, action, detail,
              -- Bug #8 fix: use SQLite unix seconds to avoid JS timezone parsing
              CAST(strftime('%s', created_at) AS INTEGER) as ts_sec
       FROM audit_trail
       WHERE action IN ('recommendation', 'decision')
       ORDER BY alert_id, ts_sec ASC`
    )
    .all() as {
      alert_id: number;
      action: string;
      detail: string;
      ts_sec: number;
    }[];

  interface AuditPair {
    recommendation: { detail: string; ts_sec: number } | null;
    decision: { detail: string; ts_sec: number } | null;
  }
  const auditByAlert = new Map<number, AuditPair>();
  for (const row of auditRows) {
    if (!auditByAlert.has(row.alert_id)) {
      auditByAlert.set(row.alert_id, {
        recommendation: null,
        decision: null,
      });
    }
    const pair = auditByAlert.get(row.alert_id)!;
    // ASC order means last write wins → always the most recent entry
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

  // Seed totals from all alerts (including open)
  const allAlerts = db
    .prepare("SELECT id, typology FROM alerts")
    .all() as { id: number; typology: string }[];
  for (const a of allAlerts) ensureTypology(a.typology).total++;

  const decisionMsList = new Map<string, number[]>();
  let globalMatchCount = 0;
  let globalPairCount = 0;

  for (const c of closedCases) {
    const stat = ensureTypology(c.typology);

    // Bug #7: handle null outcome from LEFT JOIN
    if (c.outcome === "SAR_FILED") stat.sarFiled++;
    else if (c.outcome === "NO_FILE") stat.noFile++;
    else stat.unknown++;

    const pair = auditByAlert.get(c.alert_id);
    if (pair?.recommendation && pair?.decision) {
      const agentVerdict = parseAgentRecommendation(
        pair.recommendation.detail
      );
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
      }

      // Bug #8 fix: latency in ms using Unix seconds (no timezone ambiguity)
      const ms = (pair.decision.ts_sec - pair.recommendation.ts_sec) * 1000;
      if (ms >= 0) {
        if (!decisionMsList.has(c.typology))
          decisionMsList.set(c.typology, []);
        decisionMsList.get(c.typology)!.push(ms);
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
      stat.agentTotalCount > 0
        ? stat.agentMatchCount / stat.agentTotalCount
        : 0;
    const msList = decisionMsList.get(stat.typology) ?? [];
    // Bug #4 fix: this is mean, not median — label updated in UI too
    stat.avgDecisionMs =
      msList.length > 0
        ? msList.reduce((a, b) => a + b, 0) / msList.length
        : 0;
    byTypology.push(stat);
  }

  byTypology.sort((a, b) => b.total - a.total);

  const knownClosed = closedCases.filter((c) => c.outcome !== null);
  const overallSarRate =
    knownClosed.length > 0
      ? knownClosed.filter((c) => c.outcome === "SAR_FILED").length /
        knownClosed.length
      : 0;
  const overallFalsePositiveRate =
    knownClosed.length > 0
      ? knownClosed.filter((c) => c.outcome === "NO_FILE").length /
        knownClosed.length
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
