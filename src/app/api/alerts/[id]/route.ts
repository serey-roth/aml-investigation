import { NextRequest } from "next/server";
import { getAlert } from "@/lib/db/repositories/alert";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = getAlert(parseInt(id));
  if (!alert) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(alert);
}
