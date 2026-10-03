import type { NodeKind, WfEdge, WfNode } from "@/lib/data/workflows";

export interface Pt { x: number; y: number }
export interface Box { id: string; cx: number; cy: number; w: number; h: number; node: WfNode }

export const NODE_SIZE: Record<NodeKind, { w: number; h: number }> = {
  start: { w: 120, h: 36 }, end: { w: 120, h: 36 }, ask: { w: 176, h: 54 }, capture: { w: 200, h: 68 },
  decision: { w: 200, h: 80 }, tool: { w: 176, h: 54 }, escalate: { w: 176, h: 48 },
};
const PAD = 48;

export interface Layout { boxes: Map<string, Box>; width: number; height: number }

/** Node x/y from the data are treated as centre points; canvas is sized to the node bounds plus padding. */
export function computeLayout(nodes: WfNode[]): Layout {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const { w, h } = NODE_SIZE[n.kind];
    minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w / 2);
    minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h / 2);
  }
  const ox = PAD - minX, oy = PAD - minY;
  const boxes = new Map<string, Box>();
  for (const n of nodes) {
    const { w, h } = NODE_SIZE[n.kind];
    boxes.set(n.id, { id: n.id, cx: n.x + ox, cy: n.y + oy, w, h, node: n });
  }
  // Extra right margin to leave room for loop-back routes and labels.
  return { boxes, width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2 };
}

export function routeEdge(a: Box, b: Box): Pt[] {
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  if (Math.abs(dy) < 8) {
    const dir = dx > 0 ? 1 : -1;
    return [{ x: a.cx + (dir * a.w) / 2, y: a.cy }, { x: b.cx - (dir * b.w) / 2, y: b.cy }];
  }
  if (Math.abs(dx) < 8) {
    if (dy > 0) return [{ x: a.cx, y: a.cy + a.h / 2 }, { x: b.cx, y: b.cy - b.h / 2 }];
    const lx = Math.min(a.cx - a.w / 2, b.cx - b.w / 2) - 36;
    return [{ x: a.cx - a.w / 2, y: a.cy }, { x: lx, y: a.cy }, { x: lx, y: b.cy }, { x: b.cx - b.w / 2, y: b.cy }];
  }
  const dir = dx > 0 ? 1 : -1;
  if (dy > 0) return [{ x: a.cx + (dir * a.w) / 2, y: a.cy }, { x: b.cx, y: a.cy }, { x: b.cx, y: b.cy - b.h / 2 }];
  return [{ x: a.cx, y: a.cy - a.h / 2 }, { x: a.cx, y: b.cy }, { x: b.cx - (dir * b.w) / 2, y: b.cy }];
}

export function pathD(pts: Pt[], r = 12): string {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = { x: c.x - ((c.x - p.x) / l1) * rr, y: c.y - ((c.y - p.y) / l1) * rr };
    const b = { x: c.x + ((n.x - c.x) / l2) * rr, y: c.y + ((n.y - c.y) / l2) * rr };
    d += ` L${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x},${last.y}`;
}

/** Midpoint of the longest segment: where the edge label sits. */
export function labelPoint(pts: Pt[]): Pt {
  let best = 0, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (l > best) { best = l; bi = i; }
  }
  return { x: (pts[bi].x + pts[bi + 1].x) / 2, y: (pts[bi].y + pts[bi + 1].y) / 2 };
}

/** Happy-path order used by "Simulate run": avoids escalation and loop-backs, prefers the deepest forward step. */
export function simulationPath(nodes: WfNode[], edges: WfEdge[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => n.kind === "start") ?? nodes[0];
  const path = [start.id];
  const seen = new Set(path);
  let cur = start;
  for (let i = 0; i < nodes.length; i++) {
    const outs = edges.filter((e) => e.from === cur.id).map((e) => byId.get(e.to)).filter((n): n is WfNode => !!n && !seen.has(n.id) && n.kind !== "escalate");
    if (!outs.length) break;
    const next = outs.reduce((a, b) => (b.y > a.y ? b : a));
    path.push(next.id); seen.add(next.id); cur = next;
  }
  return path;
}
