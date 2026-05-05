import { getDb } from "../client";
import { AlertDb } from "../types";
import { Alert, AlertStatus, ACTIVE_STATUSES } from "@/lib/types";

function toAlert(row: AlertDb): Alert {
  return {
    id: row.id,
    accountId: row.account_id,
    typology: row.typology,
    description: row.description,
    status: row.status as AlertStatus,
    createdAt: row.created_at,
  };
}

const ACTIVE_STATUS_LIST = ACTIVE_STATUSES.join("','");

export function getActiveAlerts(limit = 25, offset = 0): Alert[] {
  const rows = getDb()
    .prepare(`SELECT * FROM alerts WHERE status IN ('${ACTIVE_STATUS_LIST}') ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as AlertDb[];
  return rows.map(toAlert);
}

export function countActiveAlerts(): number {
  return (getDb().prepare(`SELECT COUNT(*) as n FROM alerts WHERE status IN ('${ACTIVE_STATUS_LIST}')`).get() as { n: number }).n;
}

export function countAlertsByStatus(status: AlertStatus): number {
  return (getDb().prepare("SELECT COUNT(*) as n FROM alerts WHERE status = ?").get(status) as { n: number }).n;
}

export function getAlertsByStatus(status: AlertStatus, limit = 25, offset = 0): Alert[] {
  const rows = getDb()
    .prepare("SELECT * FROM alerts WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(status, limit, offset) as AlertDb[];
  return rows.map(toAlert);
}

export function getAlertById(id: number): Alert | null {
  const row = getDb().prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertDb | null;
  return row ? toAlert(row) : null;
}

export function updateAlertStatus(alertId: number, status: Extract<AlertStatus, "escalated" | "rfi">, note: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE alerts SET status = ? WHERE id = ?").run(status, alertId);
    db.prepare("INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, 'analyst', 'flag', ?)").run(alertId, JSON.stringify({ status, note }));
  })();
}

export function closeAlert(alertId: number, outcome: string, note: string, typology: string, description: string, distinguishingFactor: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE alerts SET status = 'closed' WHERE id = ?").run(alertId);
    db.prepare("INSERT INTO case_memory (alert_id, typology, description, outcome, distinguishing_factor) VALUES (?, ?, ?, ?, ?)").run(alertId, typology, description, outcome, distinguishingFactor);
    db.prepare("INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, 'analyst', 'decision', ?)").run(alertId, JSON.stringify({ outcome, note }));
  })();
}

export function countAllAlerts(): number {
  return (getDb().prepare("SELECT COUNT(*) as n FROM alerts").get() as { n: number }).n;
}

export function countClosedAlerts(): number {
  return (getDb().prepare("SELECT COUNT(*) as n FROM alerts WHERE status = 'closed'").get() as { n: number }).n;
}

export function getTypologyTotals(): { typology: string; total: number }[] {
  return getDb()
    .prepare("SELECT typology, COUNT(*) as total FROM alerts GROUP BY typology")
    .all() as { typology: string; total: number }[];
}

export function getTypologyCountsByOutcome(): {
  typology: string;
  sarFiled: number;
  noFile: number;
  unknown: number;
}[] {
  return getDb()
    .prepare(
      `SELECT a.typology,
              COUNT(CASE WHEN cm.outcome = 'SAR_FILED' THEN 1 END) as sarFiled,
              COUNT(CASE WHEN cm.outcome = 'NO_FILE' THEN 1 END) as noFile,
              COUNT(CASE WHEN cm.outcome IS NULL THEN 1 END) as unknown
       FROM alerts a
       LEFT JOIN case_memory cm ON cm.alert_id = a.id
       WHERE a.status = 'closed'
       GROUP BY a.typology`
    )
    .all() as { typology: string; sarFiled: number; noFile: number; unknown: number }[];
}

export function getClosedCasesWithOutcome(): {
  alert_id: number;
  typology: string;
  outcome: string | null;
}[] {
  return getDb()
    .prepare(
      `SELECT a.id as alert_id, a.typology, cm.outcome
       FROM alerts a
       LEFT JOIN case_memory cm ON cm.alert_id = a.id
       WHERE a.status = 'closed'`
    )
    .all() as { alert_id: number; typology: string; outcome: string | null }[];
}
