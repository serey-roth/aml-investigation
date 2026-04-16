import { getDb } from "../client";

export interface AlertRow {
  id: number;
  account_id: string;
  typology: string;
  description: string;
  status: string;
  created_at: string;
}

export const ACTIVE_STATUSES = ["open", "escalated", "rfi"] as const;
export type AlertStatus = "open" | "escalated" | "review" | "closed";

export function getAlerts(status = "open", limit = 25, offset = 0): AlertRow[] {
  if (status === "active") {
    return getDb()
      .prepare(`SELECT * FROM alerts WHERE status IN ('open','escalated','rfi') ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(limit, offset) as AlertRow[];
  }
  return getDb()
    .prepare("SELECT * FROM alerts WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(status, limit, offset) as AlertRow[];
}

export function countAlerts(status = "open"): number {
  if (status === "active") {
    return (getDb().prepare(`SELECT COUNT(*) as n FROM alerts WHERE status IN ('open','escalated','rfi')`).get() as { n: number }).n;
  }
  return (getDb().prepare("SELECT COUNT(*) as n FROM alerts WHERE status = ?").get(status) as { n: number }).n;
}

export function getAlert(id: number): AlertRow | null {
  return getDb().prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertRow | null;
}

export interface AuditEntry {
  id: number;
  alert_id: number;
  actor: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export function getAuditTrail(alertId: number): AuditEntry[] {
  return getDb().prepare("SELECT * FROM audit_trail WHERE alert_id = ? ORDER BY created_at ASC").all(alertId) as AuditEntry[];
}

export function insertAuditEntry(alertId: number, actor: string, action: string, detail: string): void {
  getDb().prepare("INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, ?, ?, ?)").run(alertId, actor, action, detail);
}

export function flagAlert(alertId: number, status: "escalated" | "rfi", note: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE alerts SET status = ? WHERE id = ?").run(status, alertId);
    db.prepare("INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, 'analyst', 'flag', ?)").run(alertId, JSON.stringify({ status, note }));
  })();
}

export function decideAlert(alertId: number, outcome: string, note: string, typology: string, description: string, distinguishingFactor: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE alerts SET status = 'closed' WHERE id = ?").run(alertId);
    db.prepare("INSERT INTO case_memory (alert_id, typology, description, outcome, distinguishing_factor) VALUES (?, ?, ?, ?, ?)").run(alertId, typology, description, outcome, distinguishingFactor);
    db.prepare("INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, 'analyst', 'decision', ?)").run(alertId, JSON.stringify({ outcome, note }));
  })();
}
