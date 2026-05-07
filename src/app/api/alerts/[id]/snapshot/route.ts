import { NextRequest } from "next/server";
import { getInvestigationSnapshot } from "@/lib/db/repositories/alert";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = getInvestigationSnapshot(parseInt(id));
  if (!snapshot) return Response.json(null);
  return Response.json({
    toolResults: JSON.parse(snapshot.toolResults),
    message: snapshot.message,
  });
}
