import { getAlerts, countAlerts } from "@/lib/db/repositories/alert";

export const runtime = "nodejs";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "open";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"));
  const alerts = getAlerts(status, PAGE_SIZE, page * PAGE_SIZE);
  const total = countAlerts(status);
  return Response.json({ alerts, total, page, pageSize: PAGE_SIZE });
}
