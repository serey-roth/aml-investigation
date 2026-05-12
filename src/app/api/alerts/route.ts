import { getActiveAlerts, getAlertsByStatus, getClosedAlerts, countActiveAlerts, countAlertsByStatus } from "@/lib/db/repositories/alert";
import { AlertStatus } from "@/lib/types";

export const runtime = "nodejs";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "open";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"));

  try {
    const [alerts, total] = await Promise.all([
      status === "active"
        ? getActiveAlerts(PAGE_SIZE, page * PAGE_SIZE)
        : status === "closed"
        ? getClosedAlerts(PAGE_SIZE, page * PAGE_SIZE)
        : getAlertsByStatus(status as AlertStatus, PAGE_SIZE, page * PAGE_SIZE),
      status === "active"
        ? countActiveAlerts()
        : countAlertsByStatus(status as AlertStatus),
    ]);

    return Response.json({ alerts, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}
