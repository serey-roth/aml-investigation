"use client";

import { useEffect, useState } from "react";
import { GraphData, GraphNode, GraphEdge } from "@/app/api/alerts/[id]/graph/route";

interface Vec2 { x: number; y: number }

const W = 600;
const H = 380;
const NODE_R = 10;
const FOCUS_R = 14;

// Client-side safety cap — server already caps at ~120 nodes via hop limits,
// but this guards against unexpectedly large API responses (comment 3 refactor)
const MAX_NODES = 150;

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function runLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  iterations = 120
): Map<string, Vec2> {
  const pos = new Map<string, Vec2>();
  const vel = new Map<string, Vec2>();

  for (const n of nodes) {
    if (n.isFocus) {
      pos.set(n.id, { x: W / 2, y: H / 2 });
    } else {
      const angle = Math.random() * 2 * Math.PI;
      const r = 80 + Math.random() * 120;
      pos.set(n.id, {
        x: W / 2 + Math.cos(angle) * r,
        y: H / 2 + Math.sin(angle) * r,
      });
    }
    vel.set(n.id, { x: 0, y: 0 });
  }

  const edgeSet = new Set(edges.map((e) => `${e.source}|${e.target}`));
  const isConnected = (a: string, b: string) =>
    edgeSet.has(`${a}|${b}`) || edgeSet.has(`${b}|${a}`);

  for (let i = 0; i < iterations; i++) {
    const alpha = 1 - i / iterations;

    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const pa = pos.get(nodes[a].id)!;
        const pb = pos.get(nodes[b].id)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (3500 / (dist * dist)) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const va = vel.get(nodes[a].id)!;
        const vb = vel.get(nodes[b].id)!;
        va.x += fx; va.y += fy;
        vb.x -= fx; vb.y -= fy;
      }
    }

    for (const e of edges) {
      const ps = pos.get(e.source);
      const pt = pos.get(e.target);
      if (!ps || !pt) continue;
      const dx = pt.x - ps.x;
      const dy = pt.y - ps.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const ideal = isConnected(e.source, e.target) ? 120 : 200;
      const force = ((dist - ideal) / dist) * 0.15 * alpha;
      const fx = dx * force;
      const fy = dy * force;
      const vs = vel.get(e.source)!;
      const vt = vel.get(e.target)!;
      vs.x += fx; vs.y += fy;
      vt.x -= fx; vt.y -= fy;
    }

    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      v.x += (W / 2 - p.x) * 0.008 * alpha;
      v.y += (H / 2 - p.y) * 0.008 * alpha;
    }

    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      p.x = Math.max(20, Math.min(W - 20, p.x + v.x));
      p.y = Math.max(20, Math.min(H - 20, p.y + v.y));
      v.x *= 0.6;
      v.y *= 0.6;
    }
  }

  return pos;
}

function Arrow({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#9ca3af" />
      </marker>
    </defs>
  );
}

// ── Distinct empty / error states (comment 3 refactor) ───────────────────
function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-neutral-200 bg-neutral-50 py-12 text-center"
      style={{ minHeight: 200 }}>
      <div className="text-2xl mb-2 text-neutral-300">⬡</div>
      <p className="text-sm text-neutral-500">{message}</p>
      {sub && <p className="text-xs text-neutral-400 mt-1">{sub}</p>}
    </div>
  );
}

export function NetworkGraph({ alertId }: { alertId: number }) {
  const [data, setData] = useState<GraphData | null>(null);
  const [pos, setPos] = useState<Map<string, Vec2>>(new Map());
  const [loading, setLoading] = useState(true);
  const [layoutReady, setLayoutReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Tracks whether the API returned more nodes than we can safely render
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLayoutReady(false);
    setTruncated(false);
    setError(null);  // Bug #3 fix: clear stale error from previous alertId
    fetch(`/api/alerts/${alertId}/graph`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then((d: GraphData) => {
        // Client-side safety slice — keeps browser responsive (comment 3)
        let safeData = d;
        if (d.nodes.length > MAX_NODES) {
          setTruncated(true);
          // Bug #5 fix: rank by degree (edge count) before slicing so the most
          // analytically relevant nodes are kept, not just the first N in set order
          const degreeMap = new Map<string, number>();
          for (const e of d.edges) {
            degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
            degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
          }
          const focusNode = d.nodes.find((n) => n.isFocus);
          const others = d.nodes
            .filter((n) => !n.isFocus)
            .sort((a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0))
            .slice(0, MAX_NODES - 1);
          const safeIds = new Set([
            ...(focusNode ? [focusNode.id] : []),
            ...others.map((n) => n.id),
          ]);
          safeData = {
            nodes: d.nodes.filter((n) => safeIds.has(n.id)),
            edges: d.edges.filter(
              (e) => safeIds.has(e.source) && safeIds.has(e.target)
            ),
          };
        }

        setData(safeData);
        setLoading(false);
        setTimeout(() => {
          const computed = runLayout(safeData.nodes, safeData.edges);
          setPos(computed);
          setLayoutReady(true);
        }, 0);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [alertId]);

  if (loading) return <p className="text-xs text-neutral-400 py-4">Loading graph data…</p>;

  if (error) return (
    <EmptyState
      message="Could not load graph"
      sub={error}
    />
  );

  if (!data || data.nodes.length === 0) return (
    <EmptyState
      message="No transaction data for this account"
      sub="This account has no recorded counterparty activity in the dataset."
    />
  );

  if (!layoutReady) return <p className="text-xs text-neutral-400 py-4">Building graph…</p>;

  const markerId = `arrow-head-${alertId}`;

  const hoveredEdges = hovered
    ? data.edges.filter((e) => e.source === hovered || e.target === hovered)
    : [];

  const isFocusMap = new Map<string, boolean>(
    data.nodes.map((n) => [n.id, n.isFocus])
  );

  return (
    <div>
      {/* Truncation warning banner (comment 3) */}
      {truncated && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Graph capped at {MAX_NODES} nodes to keep the browser responsive.
          The server already limits hop-1 to 20 and hop-2 to 5 per node — this
          account has unusually high connectivity.
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="rounded border border-neutral-200 bg-neutral-50"
        style={{ maxHeight: 380 }}
      >
        <Arrow id={markerId} />

        {data.edges.map((e, i) => {
          const ps = pos.get(e.source);
          const pt = pos.get(e.target);
          if (!ps || !pt) return null;

          const isHighlighted =
            hovered && (e.source === hovered || e.target === hovered);
          const dx = pt.x - ps.x;
          const dy = pt.y - ps.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) return null;

          const focusR = isFocusMap.get(e.target) ? FOCUS_R : NODE_R;
          const trimX = pt.x - (dx / len) * (focusR + 2);
          const trimY = pt.y - (dy / len) * (focusR + 2);

          return (
            <line
              key={i}
              x1={ps.x}
              y1={ps.y}
              x2={trimX}
              y2={trimY}
              stroke={isHighlighted ? "#6366f1" : "#d1d5db"}
              strokeWidth={isHighlighted ? 2 : 1}
              markerEnd={`url(#${markerId})`}
            />
          );
        })}

        {data.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const r = n.isFocus ? FOCUS_R : NODE_R;
          const isHovered = hovered === n.id;
          const isConnectedToHovered = hovered
            ? hoveredEdges.some((e) => e.source === n.id || e.target === n.id)
            : false;

          const fill = n.isFocus
            ? "#dc2626"
            : isHovered
            ? "#6366f1"
            : isConnectedToHovered
            ? "#4f46e5"
            : "#e5e7eb";

          const stroke = n.isFocus
            ? "#ef4444"
            : isHovered
            ? "#818cf8"
            : "#9ca3af";

          return (
            <g
              key={n.id}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "default" }}
            >
              <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={stroke} strokeWidth={1.5} />
              {(n.isFocus || isHovered) && (
                <text
                  x={p.x}
                  y={p.y - r - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={n.isFocus ? "#ef4444" : "#525252"}
                  fontFamily="monospace"
                >
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="mt-2 text-xs text-neutral-500 space-y-1">
          <span className="font-mono text-neutral-800">{hovered}</span>
          {hoveredEdges.length > 0 && (
            <div className="space-y-0.5 mt-1">
              {hoveredEdges.slice(0, 5).map((e, i) => (
                <div key={i} className="flex gap-2 text-neutral-400">
                  <span className="font-mono">{e.source}</span>
                  <span>→</span>
                  <span className="font-mono">{e.target}</span>
                  <span className="ml-auto">{fmt(e.amount)} ({e.count} tx)</span>
                </div>
              ))}
              {hoveredEdges.length > 5 && (
                <div className="text-neutral-400">+{hoveredEdges.length - 5} more</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-[10px] text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" /> Focus account
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-300" /> Counterparty
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500" /> Highlighted
        </span>
        <span className="ml-auto">{data.nodes.length} nodes · {data.edges.length} edges</span>
      </div>
    </div>
  );
}
