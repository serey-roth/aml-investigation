"use client";

import { useEffect, useState } from "react";
import { GraphData, GraphNode, GraphEdge } from "@/app/api/alerts/[id]/graph/route";

interface Vec2 { x: number; y: number }

const W = 600;
const H = 380;
const NODE_R = 10;
const FOCUS_R = 14;

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
        <path d="M0,0 L0,6 L8,3 z" fill="#404040" />
      </marker>
    </defs>
  );
}

export function NetworkGraph({ alertId }: { alertId: number }) {
  const [data, setData] = useState<GraphData | null>(null);
  const [pos, setPos] = useState<Map<string, Vec2>>(new Map());
  const [loading, setLoading] = useState(true);
  const [layoutReady, setLayoutReady] = useState(false); // Bug #6: track layout separately
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLayoutReady(false);
    fetch(`/api/alerts/${alertId}/graph`)
      .then((r) => r.json())
      .then((d: GraphData) => {
        setData(d);
        setLoading(false);
        // Bug #6 fix: defer layout to next tick so loading state can paint first
        setTimeout(() => {
          const computed = runLayout(d.nodes, d.edges);
          setPos(computed);
          setLayoutReady(true);
        }, 0);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [alertId]);

  if (loading) return <p className="text-xs text-neutral-600 py-4">Loading graph data…</p>;
  if (error) return <p className="text-xs text-red-400 py-4">Failed to load graph: {error}</p>;
  if (!data || data.nodes.length === 0)
    return <p className="text-xs text-neutral-600 py-4">No transaction data.</p>;
  if (!layoutReady)
    return <p className="text-xs text-neutral-600 py-4">Building graph…</p>;

  // Bug #9 fix: unique marker ID per alertId so multiple instances don't clash
  const markerId = `arrow-head-${alertId}`;

  const hoveredEdges = hovered
    ? data.edges.filter((e) => e.source === hovered || e.target === hovered)
    : [];

  // Bug #11 fix: build isFocus lookup map once outside render loop
  const isFocusMap = new Map<string, boolean>(
    data.nodes.map((n) => [n.id, n.isFocus])
  );

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="rounded border border-neutral-800 bg-neutral-950"
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

          // Bug #1 fix: skip zero-length edges to prevent NaN coords
          if (len === 0) return null;

          // Bug #11 fix: O(1) lookup instead of O(n) find()
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
              stroke={isHighlighted ? "#6366f1" : "#2a2a2a"}
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
            : "#262626";

          const stroke = n.isFocus
            ? "#ef4444"
            : isHovered
            ? "#818cf8"
            : "#404040";

          return (
            <g
              key={n.id}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "default" }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.5}
              />
              {(n.isFocus || isHovered) && (
                <text
                  x={p.x}
                  y={p.y - r - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={n.isFocus ? "#ef4444" : "#a3a3a3"}
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
        <div className="mt-2 text-xs text-neutral-400 space-y-1">
          <span className="font-mono text-neutral-200">{hovered}</span>
          {hoveredEdges.length > 0 && (
            <div className="space-y-0.5 mt-1">
              {hoveredEdges.slice(0, 5).map((e, i) => (
                <div key={i} className="flex gap-2 text-neutral-500">
                  <span className="font-mono">{e.source}</span>
                  <span>→</span>
                  <span className="font-mono">{e.target}</span>
                  <span className="ml-auto">
                    {fmt(e.amount)} ({e.count} tx)
                  </span>
                </div>
              ))}
              {hoveredEdges.length > 5 && (
                <div className="text-neutral-600">
                  +{hoveredEdges.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-[10px] text-neutral-600">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" /> Focus account
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-neutral-700" /> Counterparty
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500" /> Highlighted
        </span>
        <span className="ml-auto">
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
      </div>
    </div>
  );
}
