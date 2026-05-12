import pool from "../client";
import { AuditEntryDb } from "../types";
import { AuditEntry } from "@/lib/types";

function toAuditEntry(row: AuditEntryDb): AuditEntry {
  return {
    id: row.id,
    alertId: row.alert_id,
    actor: row.actor,
    action: row.action,
    detail: row.detail != null && typeof row.detail !== "string" ? JSON.stringify(row.detail) : row.detail,
    createdAt: row.created_at,
  };
}

export async function getAuditTrail(alertId: number): Promise<AuditEntry[]> {
  const [rows] = await pool.query(
    "SELECT * FROM audit_trail WHERE alert_id = ? ORDER BY created_at ASC",
    [alertId]
  ) as unknown as [AuditEntryDb[], unknown];
  return rows.map(toAuditEntry);
}

export async function insertAuditEntry(alertId: number, actor: string, action: string, detail: string): Promise<void> {
  await pool.query(
    "INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, ?, ?, ?)",
    [alertId, actor, action, detail]
  );
}

export async function getLatestRecommendationsAndDecisions(): Promise<{
  alert_id: number;
  action: string;
  detail: string;
  ts_sec: number;
}[]> {
  // Subquery keeps only the MAX(created_at) row per (alert_id, action) pair,
  // deduplicating cases that were re-investigated multiple times.
  // UNIX_TIMESTAMP() converts DATETIME to an integer for numeric comparison.
  const [rows] = await pool.query(
    `SELECT alert_id, action, detail,
            UNIX_TIMESTAMP(created_at) as ts_sec
     FROM audit_trail
     WHERE action IN ('recommendation', 'decision')
       AND (alert_id, action, created_at) IN (
         SELECT alert_id, action, MAX(created_at)
         FROM audit_trail
         WHERE action IN ('recommendation', 'decision')
         GROUP BY alert_id, action
       )
     ORDER BY alert_id, ts_sec ASC`
  ) as unknown as [{ alert_id: number; action: string; detail: string; ts_sec: number }[], unknown];
  return rows;
}
