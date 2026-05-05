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
