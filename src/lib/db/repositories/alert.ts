import pool from "../client";
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
    closedAt: row.closed_at ?? undefined,
  };
}

const ACTIVE_STATUS_LIST = ACTIVE_STATUSES.map((s) => `'${s}'`).join(",");

export async function getActiveAlerts(limit = 25, offset = 0): Promise<Alert[]> {
  const [rows] = await pool.query(
    `SELECT * FROM alerts WHERE status IN (${ACTIVE_STATUS_LIST}) ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  ) as unknown as [AlertDb[], unknown];
  return rows.map(toAlert);
}

export async function countActiveAlerts(): Promise<number> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as n FROM alerts WHERE status IN (${ACTIVE_STATUS_LIST})`
  ) as unknown as [{ n: number }[], unknown];
  return rows[0].n;
}

export async function countAlertsByStatus(status: AlertStatus): Promise<number> {
  const [rows] = await pool.query(
    "SELECT COUNT(*) as n FROM alerts WHERE status = ?",
    [status]
  ) as unknown as [{ n: number }[], unknown];
  return rows[0].n;
}

export async function getAlertsByStatus(status: AlertStatus, limit = 25, offset = 0): Promise<Alert[]> {
  const [rows] = await pool.query(
    "SELECT * FROM alerts WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [status, limit, offset]
  ) as unknown as [AlertDb[], unknown];
  return rows.map(toAlert);
}

export async function getClosedAlerts(limit = 25, offset = 0): Promise<Alert[]> {
  // LEFT JOIN so alerts without a case_memory row still appear with outcome = null.
  const [rows] = await pool.query(
    `SELECT a.*, cm.outcome
     FROM alerts a
     LEFT JOIN case_memory cm ON cm.alert_id = a.id
     WHERE a.status = 'closed'
     ORDER BY a.closed_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  ) as unknown as [(AlertDb & { outcome: string | null })[], unknown];
  return rows.map((row) => ({ ...toAlert(row), outcome: row.outcome ?? undefined }));
}

export async function getAlertById(id: number): Promise<Alert | null> {
  const [rows] = await pool.query(
    "SELECT * FROM alerts WHERE id = ?",
    [id]
  ) as unknown as [AlertDb[], unknown];
  return rows[0] ? toAlert(rows[0]) : null;
}

export async function updateAlertStatus(alertId: number, status: Extract<AlertStatus, "escalated" | "rfi">, note: string): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Atomic: status UPDATE and audit INSERT commit together or both roll back.
    await conn.query("UPDATE alerts SET status = ? WHERE id = ?", [status, alertId]);
    await conn.query(
      "INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, 'analyst', 'flag', ?)",
      [alertId, JSON.stringify({ status, note })]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function closeAlert(
  alertId: number,
  outcome: string,
  note: string,
  typology: string,
  description: string,
  distinguishingFactor: string,
  snapshot: { toolResults: unknown; message: string } | null,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // All four writes are atomic — a failure at any step rolls back everything
    // so the case is never left partially closed.
    await conn.query(
      "UPDATE alerts SET status = 'closed', closed_at = NOW() WHERE id = ?",
      [alertId]
    );
    await conn.query(
      "INSERT INTO case_memory (alert_id, typology, description, outcome, distinguishing_factor) VALUES (?, ?, ?, ?, ?)",
      [alertId, typology, description, outcome, distinguishingFactor]
    );
    await conn.query(
      "INSERT INTO audit_trail (alert_id, actor, action, detail) VALUES (?, 'analyst', 'decision', ?)",
      [alertId, JSON.stringify({ outcome, note })]
    );
    if (snapshot) {
      await conn.query(
        "INSERT INTO investigation_snapshots (alert_id, tool_results, message) VALUES (?, ?, ?)",
        [alertId, JSON.stringify(snapshot.toolResults), snapshot.message]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getInvestigationSnapshot(alertId: number): Promise<{ toolResults: unknown; message: string } | null> {
  const [rows] = await pool.query(
    "SELECT tool_results, message FROM investigation_snapshots WHERE alert_id = ?",
    [alertId]
  ) as unknown as [{ tool_results: unknown; message: string }[], unknown];
  if (!rows[0]) return null;
  return { toolResults: rows[0].tool_results, message: rows[0].message };
}

export async function countAllAlerts(): Promise<number> {
  const [rows] = await pool.query(
    "SELECT COUNT(*) as n FROM alerts"
  ) as unknown as [{ n: number }[], unknown];
  return rows[0].n;
}

export async function countClosedAlerts(): Promise<number> {
  const [rows] = await pool.query(
    "SELECT COUNT(*) as n FROM alerts WHERE status = 'closed'"
  ) as unknown as [{ n: number }[], unknown];
  return rows[0].n;
}

export async function getTypologyTotals(): Promise<{ typology: string; total: number }[]> {
  const [rows] = await pool.query(
    "SELECT typology, COUNT(*) as total FROM alerts GROUP BY typology"
  ) as unknown as [{ typology: string; total: number }[], unknown];
  return rows;
}

export async function getTypologyCountsByOutcome(): Promise<{
  typology: string;
  sarFiled: number;
  noFile: number;
  unknown: number;
}[]> {
  // CASE WHEN inside COUNT pivots outcomes into columns, avoiding post-processing.
  const [rows] = await pool.query(
    `SELECT a.typology,
            COUNT(CASE WHEN cm.outcome = 'SAR_FILED' THEN 1 END) as sarFiled,
            COUNT(CASE WHEN cm.outcome = 'NO_FILE'   THEN 1 END) as noFile,
            COUNT(CASE WHEN cm.outcome IS NULL       THEN 1 END) as unknown
     FROM alerts a
     LEFT JOIN case_memory cm ON cm.alert_id = a.id
     WHERE a.status = 'closed'
     GROUP BY a.typology`
  ) as unknown as [{ typology: string; sarFiled: number; noFile: number; unknown: number }[], unknown];
  return rows;
}

export async function getClosedCasesWithOutcome(): Promise<{
  alert_id: number;
  typology: string;
  outcome: string | null;
}[]> {
  const [rows] = await pool.query(
    `SELECT a.id as alert_id, a.typology, cm.outcome
     FROM alerts a
     LEFT JOIN case_memory cm ON cm.alert_id = a.id
     WHERE a.status = 'closed'`
  ) as unknown as [{ alert_id: number; typology: string; outcome: string | null }[], unknown];
  return rows;
}
