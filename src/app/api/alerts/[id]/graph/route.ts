import { NextRequest } from "next/server";
import { getAlert } from "@/lib/db/repositories/alert";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

export interface GraphNode {
  id: string;
  label: string;
  isFocus: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  amount: number;
  count: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const HOP1_CAP = 20; // max direct neighbours — prevents O(n²) layout freeze (bug #5)
const HOP2_CAP = 5;  // max neighbours per hop-1 node

function buildGraph(focusAccountId: string): GraphData {
  const db = getDb();

  function getEdges(
    accountIds: string[]
  ): { from_account: string; to_account: string; total: number; cnt: number }[] {
    if (accountIds.length === 0) return [];
    const placeholders = accountIds.map(() => "?").join(",");
    // Bug #2 fix: AND from_account != to_account excludes self-loops
    return db
      .prepare(
        `SELECT from_account, to_account,
                SUM(amount_paid) as total,
                COUNT(*) as cnt
         FROM transactions
         WHERE (from_account IN (${placeholders}) OR to_account IN (${placeholders}))
           AND from_account != to_account
         GROUP BY from_account, to_account`
      )
      .all(...accountIds, ...accountIds) as {
        from_account: string;
        to_account: string;
        total: number;
        cnt: number;
      }[];
  }

  // Hop 1: all direct neighbours, ranked by tx count, capped at HOP1_CAP
  const hop1Edges = getEdges([focusAccountId]);
  const hop1CountMap = new Map<string, number>();
  for (const e of hop1Edges) {
    const other =
      e.from_account === focusAccountId ? e.to_account : e.from_account;
    hop1CountMap.set(other, (hop1CountMap.get(other) ?? 0) + e.cnt);
  }
  const hop1Neighbours = new Set<string>(
    [...hop1CountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, HOP1_CAP)
      .map(([id]) => id)
  );

  // Hop 2: top-HOP2_CAP neighbours of each hop-1 node
  const hop2Neighbours = new Set<string>();
  const hop1Array = [...hop1Neighbours];

  if (hop1Array.length > 0) {
    const hop2Edges = getEdges(hop1Array);
    const neighbourCounts = new Map<string, Map<string, number>>();
    for (const e of hop2Edges) {
      for (const src of [e.from_account, e.to_account]) {
        if (!hop1Neighbours.has(src) && src !== focusAccountId) continue;
        const other =
          src === e.from_account ? e.to_account : e.from_account;
        if (other === focusAccountId || hop1Neighbours.has(other)) continue;
        if (!neighbourCounts.has(src)) neighbourCounts.set(src, new Map());
        const map = neighbourCounts.get(src)!;
        map.set(other, (map.get(other) ?? 0) + e.cnt);
      }
    }
    for (const [, counts] of neighbourCounts) {
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, HOP2_CAP);
      for (const [id] of sorted) hop2Neighbours.add(id);
    }
  }

  const allIds = new Set([
    focusAccountId,
    ...hop1Neighbours,
    ...hop2Neighbours,
  ]);
  const allEdgesRaw = getEdges([...allIds]);

  const edgeMap = new Map<string, GraphEdge>();
  for (const e of allEdgesRaw) {
    if (!allIds.has(e.from_account) || !allIds.has(e.to_account)) continue;
    const key = `${e.from_account}→${e.to_account}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.amount += e.total;
      existing.count += e.cnt;
    } else {
      edgeMap.set(key, {
        source: e.from_account,
        target: e.to_account,
        amount: Math.round(e.total * 100) / 100,
        count: e.cnt,
      });
    }
  }

  const nodes: GraphNode[] = [...allIds].map((id) => ({
    id,
    label: id,
    isFocus: id === focusAccountId,
  }));

  return { nodes, edges: [...edgeMap.values()] };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const alert = getAlert(parseInt(id));
  if (!alert) return Response.json({ error: "Not found" }, { status: 404 });
  const graph = buildGraph(alert.account_id);
  return Response.json(graph);
}
