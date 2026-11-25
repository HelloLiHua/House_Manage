import test from 'node:test'
import assert from 'node:assert/strict'
import { collision, sweep, corners, overlaps, integrateWall, wallPoint, doorPassage, slidingPanels, slidingPanelPolygons } from '../src/geometry.ts'
import { initialPlan, emptyPlan, parsePlan, type Furniture, type Plan, type Door } from '../src/model.ts'

const box = (patch: Partial<Furniture> = {}): Furniture => ({ id: 'box', name: '箱子', kind: 'custom', x: 0, y: 0, width: 40, depth: 40, height: 80, rotation: 0, color: '#aabbcc', ...patch })
const doorPlan = (): Plan => ({ ...emptyPlan(), walls: [{ id: 'w', a: { x: 0, y: -200 }, b: { x: 0, y: 200 }, thickness: 12 }], doors: [{ id: 'd', wallId: 'w', offset: 200, width: 90, height: 210, flip: false }] })

test('sample floor plan starts without collisions and round-trips exactly', () => {
  const p = initialPlan(); for (const i of p.items) assert.equal(collision(i, p), null, i.name)
  assert.deepEqual(parsePlan(JSON.stringify(p)), p)
})

test('orientation preserves legacy plans, round-trips precise angles and rejects invalid data', () => {
  const legacy = initialPlan()
  assert.equal(parsePlan(JSON.stringify(legacy)).northAngle ?? 0, 0)
  for (const northAngle of [0, 90, 180, 270, 30.5, 359.99]) {
    const plan = { ...legacy, northAngle }
    assert.deepEqual(parsePlan(JSON.stringify(plan)), plan)
  }
  for (const northAngle of [-1, 360, 361, null, '90', {}, NaN, Infinity]) {
    assert.throws(() => parsePlan(JSON.stringify({ ...legacy, northAngle })))
  }
})
test('rectangles can touch, but overlapping rotated corners are detected', () => {
  assert.equal(overlaps(corners(box()), corners(box({ x: 40 }))), false)
  assert.equal(overlaps(corners(box()), corners(box({ x: 39 }))), true)
  assert.equal(overlaps(corners(box()), corners(box({ x: 45, rotation: 45 }))), true)
})
test('fast motion cannot teleport through a 1 cm wall', () => {
  const p = { ...emptyPlan(), walls: [{ id: 'thin', a: { x: 0, y: -100 }, b: { x: 0, y: 100 }, thickness: 1 }] }
  const result = sweep(box({ x: -200 }), box({ x: 200 }), p)
  assert.equal(result.blocked?.kind, 'wall'); assert.ok(result.item.x < -20); assert.equal(collision(result.item, p), null)
})
test('furniture passes through a sufficiently wide door', () => {
  const result = sweep(box({ x: -100, depth: 80 }), box({ x: 100, depth: 80 }), doorPlan(), 2)
  assert.equal(result.blocked, null); assert.equal(result.item.x, 100)
})
test('door rejects furniture wider than opening and respects clearance', () => {
  assert.equal(sweep(box({ x: -100, depth: 92 }), box({ x: 100, depth: 92 }), doorPlan()).blocked?.kind, 'wall')
  assert.equal(sweep(box({ x: -100, depth: 88 }), box({ x: 100, depth: 88 }), doorPlan(), 2).blocked?.kind, 'wall')
})
test('door clearance height blocks tall furniture even if width fits', () => {
  assert.equal(sweep(box({ x: -100, height: 220 }), box({ x: 100, height: 220 }), doorPlan()).blocked?.kind, 'height')
  assert.equal(sweep(box({ x: -100, height: 210 }), box({ x: 100, height: 210 }), doorPlan()).blocked, null)
})
test('rotation checks intermediate poses, not only end poses', () => {
  const p = { ...emptyPlan(), items: [box({ id: 'obstacle', x: 0, y: 45, width: 8, depth: 8 })] }
  const from = box({ width: 100, depth: 10 }), to = { ...from, rotation: 180 }
  assert.equal(collision(from, p), null); assert.equal(collision(to, p), null)
  assert.equal(sweep(from, to, p).blocked?.kind, 'item')
})
test('movement stops at other furniture and leaves it unchanged', () => {
  const stationary = box({ id: 'fixed', x: 90 })
  const p = { ...emptyPlan(), items: [stationary] }
  const r = sweep(box(), box({ x: 200 }), p)
  assert.equal(r.blocked?.id, 'fixed'); assert.ok(r.item.x < 50); assert.equal(stationary.x, 90)
})
test('shared collinear room walls merge and preserve existing door world positions', () => {
  const p = { ...emptyPlan(), walls: [{ id: 'original', a: { x: 100, y: 0 }, b: { x: 500, y: 0 }, thickness: 12 }], doors: [{ id: 'd', wallId: 'original', offset: 200, width: 90, height: 210, flip: false }] }
  const next = integrateWall(p, { id: 'new', a: { x: 300, y: 0 }, b: { x: 0, y: 0 }, thickness: 12 })
  assert.equal(next.walls.length, 1); assert.equal(next.doors[0].wallId, 'original')
  assert.deepEqual(wallPoint(next.walls[0], next.doors[0].offset), { x: 300, y: 0 })
  assert.equal(next.walls[0].a.x, 0); assert.equal(next.walls[0].b.x, 500)
})
test('imports reject invalid dimensions, duplicate ids and missing wall references', () => {
  for (const modify of [
    (p: Plan) => { p.items[0].width = -1 },
    (p: Plan) => { p.items[0].height = Infinity },
    (p: Plan) => { p.items[0].id = p.items[1].id },
    (p: Plan) => { p.doors[0].wallId = 'missing' },
    (p: Plan) => { p.doors[0].offset = 0 },
    (p: Plan) => { p.items[0].color = 'url(https://example.com)' },
  ]) { const p = initialPlan(); modify(p); assert.throws(() => parsePlan(JSON.stringify(p))) }
})

function slidingPlan(patch: Partial<Door> = {}): Plan {
  const plan = doorPlan()
  plan.doors[0] = { ...plan.doors[0], width: 180, type: 'sliding', slidingStyle: 'bypass', slideDirection: 'end', opening: 100, panelThickness: 4, ...patch }
  return plan
}
test('legacy doors remain fully open swing doors without a data migration', () => {
  const plan = parsePlan(JSON.stringify(doorPlan()))
  assert.equal(plan.doors[0].type, undefined)
  assert.equal(doorPassage(plan.doors[0]).width, 90)
  assert.deepEqual(slidingPanels(plan.doors[0], plan.walls[0]), [])
})
test('bypass opening is half the total width at full travel and switches sides', () => {
  const d = slidingPlan().doors[0]
  assert.deepEqual(doorPassage(d), { from: 110, to: 200, width: 90 })
  assert.deepEqual(doorPassage({ ...d, opening: 50 }), { from: 110, to: 155, width: 45 })
  assert.deepEqual(doorPassage({ ...d, slideDirection: 'start' }), { from: 200, to: 290, width: 90 })
  assert.equal(doorPassage({ ...d, opening: 0 }).width, 0)
})
test('bypass passage accepts fitting furniture and blocks the parked panel side', () => {
  const plan = slidingPlan()
  assert.equal(sweep(box({ x: -100, y: -45, depth: 60 }), box({ x: 100, y: -45, depth: 60 }), plan, 2).blocked, null)
  assert.equal(sweep(box({ x: -100, y: 45 }), box({ x: 100, y: 45 }), plan).blocked?.kind, 'door')
  const reversed = slidingPlan({ slideDirection: 'start' })
  assert.equal(sweep(box({ x: -100, y: 45, depth: 60 }), box({ x: 100, y: 45, depth: 60 }), reversed, 2).blocked, null)
  assert.equal(sweep(box({ x: -100, y: -45 }), box({ x: 100, y: -45 }), reversed).blocked?.kind, 'door')
})
test('half-open and closed doors obstruct furniture despite a wide structural opening', () => {
  const half = slidingPlan({ opening: 50 })
  assert.equal(sweep(box({ x: -100, y: -67.5, depth: 30 }), box({ x: 100, y: -67.5, depth: 30 }), half, 2).blocked, null)
  assert.equal(sweep(box({ x: -100, y: -45, depth: 60 }), box({ x: 100, y: -45, depth: 60 }), half).blocked?.kind, 'door')
  assert.equal(sweep(box({ x: -100 }), box({ x: 100 }), slidingPlan({ opening: 0 })).blocked?.kind, 'door')
})
test('single sliding door opens the entire aperture and its parked leaf remains an obstacle', () => {
  const p: Plan = { ...emptyPlan(), walls: [{ id: 'w', a: { x: -300, y: 0 }, b: { x: 300, y: 0 }, thickness: 12 }], doors: [{ id: 'd', wallId: 'w', offset: 300, width: 100, height: 210, flip: false, type: 'sliding', slidingStyle: 'single', opening: 100, slideDirection: 'end' }] }
  assert.equal(doorPassage(p.doors[0]).width, 100)
  assert.equal(sweep(box({ x: 0, y: -100, width: 80 }), box({ x: 0, y: 100, width: 80 }), p, 2).blocked, null)
  assert.equal(collision(box({ x: 100, y: 12, width: 20, depth: 6 }), p)?.kind, 'door')
  assert.equal(collision(box({ x: -100, y: 12, width: 20, depth: 6 }), p), null)
  p.doors[0].slideDirection = 'start'
  assert.equal(collision(box({ x: -100, y: 12, width: 20, depth: 6 }), p)?.kind, 'door')
  p.doors[0].flip = true
  assert.equal(collision(box({ x: -100, y: -12, width: 20, depth: 6 }), p)?.kind, 'door')
  assert.equal(collision(box({ x: -100, y: 12, width: 20, depth: 6 }), p), null)
})
test('sliding door still checks furniture height and supports diagonal walls', () => {
  const p = slidingPlan()
  assert.equal(sweep(box({ x: -100, y: -45, height: 220 }), box({ x: 100, y: -45, height: 220 }), p).blocked?.kind, 'height')
  const angle = Math.PI / 4
  const rotated = { ...p, walls: p.walls.map(w => ({ ...w, a: { x: -200 * Math.cos(angle), y: -200 * Math.sin(angle) }, b: { x: 200 * Math.cos(angle), y: 200 * Math.sin(angle) } })) }
  const polygon = slidingPanelPolygons(rotated.doors[0], rotated.walls[0])[0]
  const center = { x: polygon.reduce((sum, v) => sum + v.x, 0) / 4, y: polygon.reduce((sum, v) => sum + v.y, 0) / 4 }
  assert.equal(collision(box({ ...center, width: 5, depth: 5 }), rotated)?.kind, 'door')
})
test('merging a reversed wall preserves sliding panel locations and open side', () => {
  const p: Plan = { ...emptyPlan(), walls: [{ id: 'w', a: { x: 400, y: 0 }, b: { x: 0, y: 0 }, thickness: 12 }], doors: [{ id: 'd', wallId: 'w', offset: 200, width: 180, height: 210, flip: false, type: 'sliding', slidingStyle: 'bypass', opening: 50 }] }
  const before = slidingPanelPolygons(p.doors[0], p.walls[0])
  const next = integrateWall(p, { id: 'new', a: { x: -100, y: 0 }, b: { x: 150, y: 0 }, thickness: 12 })
  const normalize = (polys: { x: number; y: number }[][]) => polys.map(poly => poly.map(v => `${v.x.toFixed(3)},${v.y.toFixed(3)}`).sort()).sort()
  assert.deepEqual(normalize(slidingPanelPolygons(next.doors[0], next.walls[0])), normalize(before))
  const oldOpening = doorPassage(p.doors[0]), newOpening = doorPassage(next.doors[0])
  assert.deepEqual(wallPoint(p.walls[0], oldOpening.from), wallPoint(next.walls[0], newOpening.to))
})
test('sliding parameters round-trip and malformed options are rejected', () => {
  const p = slidingPlan({ opening: 35, panelThickness: 6, slideDirection: 'start' })
  assert.deepEqual(parsePlan(JSON.stringify(p)), p)
  for (const invalid of [{ type: 'unknown' }, { opening: -1 }, { opening: 101 }, { opening: null }, { opening: '50' }, { panelThickness: 0 }, { panelThickness: 21 }, { slidingStyle: 'unknown' }, { slideDirection: 'left' }]) {
    const raw = { ...p, doors: [{ ...p.doors[0], ...invalid }] }
    assert.throws(() => parsePlan(JSON.stringify(raw)))
  }
})
