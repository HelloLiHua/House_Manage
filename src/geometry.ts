import type { Point, Furniture, Plan, Wall, Door } from './model'

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export function translateWall(wall: Wall, delta: Point, snap: boolean): Wall {
  if (![delta.x, delta.y].every(Number.isFinite)) return wall
  const step = snap ? 10 : 1
  const shift = (value: number, a: number, b: number) => Math.max(-10000 - Math.min(a, b), Math.min(10000 - Math.max(a, b), Math.round(value / step) * step))
  const x = shift(delta.x, wall.a.x, wall.b.x), y = shift(delta.y, wall.a.y, wall.b.y)
  if (x === 0 && y === 0) return wall
  return { ...wall, a: { x: wall.a.x + x, y: wall.a.y + y }, b: { x: wall.b.x + x, y: wall.b.y + y } }
}
export function wallPoint(w: Wall, offset: number): Point {
  const l = distance(w.a, w.b)
  return { x: w.a.x + (w.b.x - w.a.x) * offset / l, y: w.a.y + (w.b.y - w.a.y) * offset / l }
}
export function projectOnWall(p: Point, w: Wall) {
  const l = distance(w.a, w.b)
  return Math.max(0, Math.min(l, ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / l))
}
export function corners(i: Furniture, padding = 0): Point[] {
  const r = i.rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  const x = i.width / 2 + padding, y = i.depth / 2 + padding
  return [[-x, -y], [x, -y], [x, y], [-x, y]].map(([a, b]) => ({ x: i.x + a * c - b * s, y: i.y + a * s + b * c }))
}
export function wallPolygon(w: Wall, from = 0, to = distance(w.a, w.b)): Point[] {
  const a = wallPoint(w, from), b = wallPoint(w, to), l = distance(w.a, w.b)
  const nx = -(w.b.y - w.a.y) / l * w.thickness / 2, ny = (w.b.x - w.a.x) / l * w.thickness / 2
  return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }]
}
export function overlaps(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const q = poly[i], r = poly[(i + 1) % poly.length], axis = { x: -(r.y - q.y), y: r.x - q.x }
    const pa = a.map(p => p.x * axis.x + p.y * axis.y), pb = b.map(p => p.x * axis.x + p.y * axis.y)
    if (Math.max(...pa) <= Math.min(...pb) + 1e-7 || Math.max(...pb) <= Math.min(...pa) + 1e-7) return false
  }
  return true
}
export function wallPieces(w: Wall, plan: Plan): { from: number; to: number }[] {
  const doors = plan.doors.filter(d => d.wallId === w.id).sort((a, b) => a.offset - b.offset)
  const pieces = []; let start = 0
  for (const d of doors) {
    const end = Math.max(0, d.offset - d.width / 2)
    if (end > start) pieces.push({ from: start, to: end })
    start = Math.max(start, d.offset + d.width / 2)
  }
  const len = distance(w.a, w.b)
  if (start < len) pieces.push({ from: start, to: len })
  return pieces
}
export function doorPassage(d: Door): { from: number; to: number; width: number } {
  const left = d.offset - d.width / 2, right = d.offset + d.width / 2
  if (d.type !== 'sliding') return { from: left, to: right, width: d.width }
  const max = d.width * (d.slidingStyle === 'single' ? 1 : .5)
  const width = max * (d.opening ?? 100) / 100
  return d.slideDirection === 'start' ? { from: right - width, to: right, width } : { from: left, to: left + width, width }
}
// Local coordinates run along the opening; positive Y points to one wall side.
export function swingDoorGeometry(d: Door) {
  const atEnd = d.hingeSide === 'end', x = atEnd ? d.width : 0
  return {
    hinge: { x, y: 0 }, closed: { x: atEnd ? 0 : d.width, y: 0 },
    open: { x, y: (d.flip ? -1 : 1) * d.width },
    sweep: d.flip === atEnd ? 1 : 0,
  }
}
export type SlidingPanel = { x: number; y: number; width: number; depth: number }
// Coordinates are relative to the beginning of the entire opening, along its
// wall. Rendering and collision detection share these exact panel rectangles.
export function slidingPanels(d: Door, w: Wall): SlidingPanel[] {
  if (d.type !== 'sliding') return []
  const travel = doorPassage(d).width, t = d.panelThickness ?? 4, side = d.flip ? -1 : 1, towardStart = d.slideDirection === 'start'
  if (d.slidingStyle === 'single') {
    const centerY = side * (w.thickness / 2 + 2 + t / 2)
    return [{ x: towardStart ? -travel : travel, y: centerY - t / 2, width: d.width, depth: t }]
  }
  const fixedCenter = -side * (t + 2) / 2, movingCenter = side * (t + 2) / 2
  return [
    { x: towardStart ? 0 : d.width / 2, y: fixedCenter - t / 2, width: d.width / 2, depth: t },
    { x: towardStart ? d.width / 2 - travel : travel, y: movingCenter - t / 2, width: d.width / 2, depth: t },
  ]
}
export function slidingPanelPolygons(d: Door, w: Wall): Point[][] {
  const a = wallPoint(w, d.offset - d.width / 2), length = distance(w.a, w.b)
  const dx = (w.b.x - w.a.x) / length, dy = (w.b.y - w.a.y) / length
  return slidingPanels(d, w).map(panel => [
    [panel.x, panel.y], [panel.x + panel.width, panel.y],
    [panel.x + panel.width, panel.y + panel.depth], [panel.x, panel.y + panel.depth],
  ].map(([x, y]) => ({ x: a.x + x * dx - y * dy, y: a.y + x * dy + y * dx })))
}
export type Collision = { kind: 'wall' | 'item' | 'height' | 'door'; message: string; id: string }
export function collision(item: Furniture, plan: Plan, clearance = 0): Collision | null {
  const rect = corners(item, clearance)
  for (const w of plan.walls) {
    for (const s of wallPieces(w, plan)) if (overlaps(rect, wallPolygon(w, s.from, s.to))) return { kind: 'wall', message: '与墙体碰撞，当前方向无法通过', id: w.id }
    for (const d of plan.doors.filter(d => d.wallId === w.id)) {
      if (d.type === 'sliding') {
        const passage = doorPassage(d)
        // Treat the blocked part of the doorway as unavailable across the wall
        // depth. Also check the physical leaf, including its parked portion.
        const blocked = d.slideDirection === 'start'
          ? { from: d.offset - d.width / 2, to: passage.from }
          : { from: passage.to, to: d.offset + d.width / 2 }
        if ((blocked.to - blocked.from > 1e-7 && overlaps(rect, wallPolygon(w, blocked.from, blocked.to))) || slidingPanelPolygons(d, w).some(panel => overlaps(rect, panel))) {
          return { kind: 'door', message: `与推拉门门扇碰撞，当前可通行净宽 ${Number(passage.width.toFixed(1))} cm`, id: d.id }
        }
      }
      if (item.height > d.height && overlaps(rect, wallPolygon(w, d.offset - d.width / 2, d.offset + d.width / 2))) return { kind: 'height', message: `物件高 ${item.height} cm，超过门洞净高 ${d.height} cm`, id: d.id }
    }
  }
  for (const other of plan.items) if (other.id !== item.id && overlaps(rect, corners(other))) return { kind: 'item', message: `与「${other.name}」碰撞`, id: other.id }
  return null
}
export type SweepResult = { item: Furniture; blocked: Collision | null; travelled: number }
// Sample by maximum corner travel (translation + rotation), with a 0.5 cm
// conservative margin. This prevents fast pointer motion from crossing thin walls.
export function sweep(from: Furniture, to: Furniture, plan: Plan, clearance = 0): SweepResult {
  const initial = collision(from, plan, clearance)
  if (initial) return { item: from, blocked: initial, travelled: 0 }
  const delta = ((to.rotation - from.rotation + 540) % 360) - 180
  const travel = distance(from, to), radius = Math.hypot(from.width, from.depth) / 2 + clearance
  const steps = Math.max(1, Math.ceil((travel + Math.abs(delta * Math.PI / 180) * radius) / 1))
  let safe = from
  for (let n = 1; n <= steps; n++) {
    const t = n / steps
    const candidate = { ...from, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, rotation: from.rotation + delta * t }
    const hit = collision(candidate, plan, clearance + 0.5)
    if (hit) return { item: safe, blocked: hit, travelled: distance(from, safe) }
    safe = candidate
  }
  return { item: safe, blocked: null, travelled: travel }
}

// Merge collinear walls so shared room boundaries never leave a hidden wall
// across a doorway. Preserve door positions when the wall origin changes.
export function integrateWall(plan: Plan, added: Wall): Plan {
  const horizontal = Math.abs(added.a.y - added.b.y) < 0.01
  const vertical = Math.abs(added.a.x - added.b.x) < 0.01
  if (!horizontal && !vertical) return { ...plan, walls: [...plan.walls, added] }
  const coord = (p: Point) => horizontal ? p.x : p.y
  const fixed = (p: Point) => horizontal ? p.y : p.x
  let lo = Math.min(coord(added.a), coord(added.b)), hi = Math.max(coord(added.a), coord(added.b))
  const matches = new Set<string>(); let found = true
  while (found) {
    found = false
    for (const w of plan.walls) if (!matches.has(w.id) && Math.abs(fixed(w.a) - fixed(added.a)) < 0.01 && Math.abs(fixed(w.b) - fixed(added.a)) < 0.01) {
      const a = Math.min(coord(w.a), coord(w.b)), b = Math.max(coord(w.a), coord(w.b))
      if (b >= lo && a <= hi) { matches.add(w.id); lo = Math.min(lo, a); hi = Math.max(hi, b); found = true }
    }
  }
  const point = (v: number) => horizontal ? { x: v, y: added.a.y } : { x: added.a.x, y: v }
  const original = plan.walls.find(w => matches.has(w.id))
  const wall = { ...added, id: original?.id ?? added.id, thickness: original?.thickness ?? added.thickness, a: point(lo), b: point(hi) }
  return {
    ...plan, walls: [...plan.walls.filter(w => !matches.has(w.id)), wall],
    doors: plan.doors.map(d => {
      if (!matches.has(d.wallId)) return d
      const old = plan.walls.find(w => w.id === d.wallId)!
      const reversed = coord(old.b) < coord(old.a)
      const orientation = reversed
        ? { flip: !d.flip, hingeSide: d.hingeSide === 'end' ? 'start' as const : 'end' as const,
          ...(d.type === 'sliding' ? { slideDirection: d.slideDirection === 'start' ? 'end' as const : 'start' as const } : {}) }
        : {}
      return { ...d, ...orientation, wallId: wall.id, offset: coord(wallPoint(old, d.offset)) - lo }
    }),
  }
}
