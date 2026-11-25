export type Point = { x: number; y: number }
export type FurnitureKind = 'sofa' | 'bed' | 'table' | 'chair' | 'cabinet' | 'plant' | 'custom'
export type Furniture = Point & {
  id: string; name: string; kind: FurnitureKind; width: number; depth: number; height: number; rotation: number; color: string
}
export type Wall = { id: string; a: Point; b: Point; thickness: number }
export type DoorType = 'swing' | 'sliding'
export type Door = {
  id: string; wallId: string; offset: number; width: number; height: number; flip: boolean
  // Optional fields preserve compatibility with existing version-1 plans.
  type?: DoorType
  hingeSide?: 'start' | 'end' // Swing-door hinge along the wall; legacy doors use start.
  slidingStyle?: 'bypass' | 'single'
  slideDirection?: 'start' | 'end'
  opening?: number // Percentage of the available travel, not of the entire doorway.
  panelThickness?: number
}
export type Room = Point & { id: string; name: string; width: number; depth: number; color: string }
export type Plan = {
  version: 1; name: string; rooms: Room[]; walls: Wall[]; doors: Door[]; items: Furniture[]
  northAngle?: number // Clockwise from screen-up, in [0, 360). Older plans default to north-up.
  orientationLocked?: boolean // Absent in older plans; defaults to locked.
}
export type Template = Omit<Furniture, 'id' | 'x' | 'y' | 'rotation'>
export const uid = () => crypto.randomUUID()
export const templates: Template[] = [
  { name: '三人沙发', kind: 'sofa', width: 220, depth: 90, height: 85, color: '#bbc8b3' },
  { name: '双人床', kind: 'bed', width: 180, depth: 200, height: 100, color: '#c7bfb3' },
  { name: '餐桌', kind: 'table', width: 140, depth: 80, height: 75, color: '#d5bc98' },
  { name: '单椅', kind: 'chair', width: 55, depth: 55, height: 82, color: '#c6b8ab' },
  { name: '收纳柜', kind: 'cabinet', width: 120, depth: 45, height: 180, color: '#c7b69d' },
  { name: '绿植', kind: 'plant', width: 45, depth: 45, height: 120, color: '#8da783' },
  { name: '书桌', kind: 'table', width: 140, depth: 60, height: 75, color: '#c3b499' },
  { name: '茶几', kind: 'table', width: 100, depth: 55, height: 42, color: '#d2c5b2' },
]
export function initialPlan(): Plan {
  return {
    version: 1, name: '我的理想之家',
    rooms: [
      { id: 'living', name: '客餐厅', x: 0, y: 0, width: 600, depth: 650, color: '#f0eee7' },
      { id: 'bedroom', name: '卧室', x: 600, y: 0, width: 360, depth: 350, color: '#f3efea' },
      { id: 'study', name: '书房', x: 600, y: 350, width: 360, depth: 300, color: '#eeeeda' },
    ],
    walls: [
      { id: 'top', a: { x: 0, y: 0 }, b: { x: 960, y: 0 }, thickness: 14 },
      { id: 'right', a: { x: 960, y: 0 }, b: { x: 960, y: 650 }, thickness: 14 },
      { id: 'bottom', a: { x: 0, y: 650 }, b: { x: 960, y: 650 }, thickness: 14 },
      { id: 'left', a: { x: 0, y: 0 }, b: { x: 0, y: 650 }, thickness: 14 },
      { id: 'middle', a: { x: 600, y: 0 }, b: { x: 600, y: 650 }, thickness: 12 },
      { id: 'divider', a: { x: 600, y: 350 }, b: { x: 960, y: 350 }, thickness: 12 },
    ],
    doors: [
      { id: 'entry', wallId: 'bottom', offset: 470, width: 100, height: 210, flip: true },
      { id: 'beddoor', wallId: 'middle', offset: 270, width: 90, height: 210, flip: false },
      { id: 'studydoor', wallId: 'middle', offset: 540, width: 90, height: 210, flip: false },
    ],
    items: [
      { ...templates[0], id: 'sofa', x: 105, y: 205, rotation: 90 },
      { ...templates[7], id: 'coffee', x: 255, y: 205, rotation: 90 },
      { ...templates[4], id: 'tv', name: '电视柜', width: 160, depth: 40, height: 55, x: 545, y: 190, rotation: 90 },
      { ...templates[2], id: 'dining', x: 220, y: 475, rotation: 0 },
      { ...templates[3], id: 'chair1', x: 220, y: 395, rotation: 180 },
      { ...templates[3], id: 'chair2', x: 220, y: 555, rotation: 0 },
      { ...templates[1], id: 'bed', x: 785, y: 125, rotation: 0 },
      { ...templates[4], id: 'wardrobe', name: '衣柜', width: 180, depth: 50, height: 220, x: 805, y: 310, rotation: 0 },
      { ...templates[6], id: 'desk', x: 805, y: 395, rotation: 0 },
      { ...templates[3], id: 'deskchair', x: 805, y: 465, rotation: 0 },
      { ...templates[5], id: 'plant', x: 535, y: 65, rotation: 0 },
    ],
  }
}
export function emptyPlan(): Plan { return { version: 1, name: '未命名方案', rooms: [], walls: [], doors: [], items: [] } }

// Imported plans are untrusted. Validate numeric bounds and all relationships before using them.
export function parsePlan(raw: string): Plan {
  const p = JSON.parse(raw)
  const fail = () => { throw new Error('文件格式不正确，请选择本应用导出的 .json 方案。') }
  if (!p || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 100) return fail()
  for (const k of ['rooms', 'walls', 'doors', 'items']) if (!Array.isArray(p[k]) || p[k].length > 500) return fail()
  const ids = new Set<string>()
  const id = (s: unknown) => { if (typeof s !== 'string' || !s || s.length > 100 || ids.has(s)) fail(); ids.add(s as string) }
  const n = (v: unknown, min = -10000, max = 10000) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  if (p.northAngle !== undefined && (!n(p.northAngle, 0, 360) || p.northAngle === 360)) return fail()
  if (p.orientationLocked !== undefined && typeof p.orientationLocked !== 'boolean') return fail()
  const xy = (o: Point) => o && n(o.x) && n(o.y)
  const name = (v: unknown) => typeof v === 'string' && v.length <= 100
  const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
  for (const r of p.rooms) { id(r.id); if (!xy(r) || !n(r.width, 20, 5000) || !n(r.depth, 20, 5000) || !name(r.name) || !color(r.color)) fail() }
  for (const w of p.walls) { id(w.id); if (!xy(w.a) || !xy(w.b) || Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y) < 1 || !n(w.thickness, 1, 100)) fail() }
  for (const d of p.doors) {
    id(d.id)
    const w = p.walls.find((v: Wall) => v.id === d.wallId)
    if (!w || !n(d.width, 20, 500) || !n(d.height, 20, 1000) || !n(d.offset, d.width / 2, Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) - d.width / 2) || typeof d.flip !== 'boolean') fail()
    if (d.type !== undefined && !['swing', 'sliding'].includes(d.type)) fail()
    if (d.hingeSide !== undefined && !['start', 'end'].includes(d.hingeSide)) fail()
    if (d.slidingStyle !== undefined && !['bypass', 'single'].includes(d.slidingStyle)) fail()
    if (d.slideDirection !== undefined && !['start', 'end'].includes(d.slideDirection)) fail()
    if (d.opening !== undefined && !n(d.opening, 0, 100)) fail()
    if (d.panelThickness !== undefined && !n(d.panelThickness, 1, 20)) fail()
  }
  for (let a = 0; a < p.doors.length; a++) for (let b = a + 1; b < p.doors.length; b++) {
    const x = p.doors[a], y = p.doors[b]
    if (x.wallId === y.wallId && Math.abs(x.offset - y.offset) < (x.width + y.width) / 2) fail()
  }
  for (const i of p.items) {
    id(i.id)
    if (!xy(i) || !name(i.name) || !['sofa', 'bed', 'table', 'chair', 'cabinet', 'plant', 'custom'].includes(i.kind) || !n(i.width, 5, 2000) || !n(i.depth, 5, 2000) || !n(i.height, 1, 1000) || !n(i.rotation, -36000, 36000) || !color(i.color)) fail()
  }
  return p as Plan
}
