import { NextRequest } from "next/server";
import { getAuditTrail } from "@/lib/db/repositories/audit";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entries = getAuditTrail(parseInt(id));
  return Response.json(entries);
}
