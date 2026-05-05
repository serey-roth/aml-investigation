import { getDb } from "../client";
import { AuditEntryDb } from "../types";
import { AuditEntry } from "@/lib/types";

function toAuditEntry(row: AuditEntryDb): AuditEntry {
  return {
    id: row.id,
    alertId: row.alert_id,
    actor: row.actor,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export function getAuditTrail(alertId: number): AuditEntry[] {
  const rows = getDb().prepare("SELECT * FROM audit_trail WHERE alert_id = ? ORDER BY created_at ASC").all(alertId) as AuditEntryDb[];
  return rows.map(toAuditEntry);
}

export function insertAuditEntry(alertId: number, actor: string, action: string, detail: string): void {
  getDb().prepare("INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, ?, ?, ?)").run(alertId, actor, action, detail);
}

export function getLatestRecommendationsAndDecisions(): {
  alert_id: number;
  action: string;
  detail: string;
  ts_sec: number;
}[] {
  return getDb()
    .prepare(
      `SELECT alert_id, action, detail,
              CAST(strftime('%s', created_at) AS INTEGER) as ts_sec
       FROM audit_trail
       WHERE action IN ('recommendation', 'decision')
         AND (alert_id, action, created_at) IN (
           SELECT alert_id, action, MAX(created_at)
           FROM audit_trail
           WHERE action IN ('recommendation', 'decision')
           GROUP BY alert_id, action
         )
       ORDER BY alert_id, ts_sec ASC`
    )
    .all() as { alert_id: number; action: string; detail: string; ts_sec: number }[];
}
