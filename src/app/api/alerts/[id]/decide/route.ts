import { NextRequest } from "next/server";
import { getAlert, decideAlert, flagAlert } from "@/lib/db/repositories/alert";

export const runtime = "nodejs";

const CLOSING_OUTCOMES = ["SAR_FILED", "NO_FILE"];
const FLAG_OUTCOMES: Record<string, "escalated" | "rfi"> = {
  ESCALATED: "escalated",
  RFI: "rfi",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alertId = parseInt(id);
  const { outcome, note } = await req.json();

  const alert = getAlert(alertId);
  if (!alert) return Response.json({ error: "Not found" }, { status: 404 });
  if (alert.status === "closed") return Response.json({ error: "Alert already closed" }, { status: 409 });

  if (CLOSING_OUTCOMES.includes(outcome)) {
    decideAlert(alertId, outcome, note ?? "", alert.typology, alert.description, note ?? "");
  } else if (FLAG_OUTCOMES[outcome]) {
    flagAlert(alertId, FLAG_OUTCOMES[outcome], note ?? "");
  } else {
    return Response.json({ error: "Unknown outcome" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
