import test from 'node:test'
import assert from 'node:assert/strict'
import { collision, sweep, corners, overlaps, integrateWall, wallPoint, doorPassage, slidingPanels, slidingPanelPolygons, swingDoorGeometry, translateWall, translateItems, itemsInBox, wallPieces, openingFits, slideWindow } from '../src/geometry.ts'
import { initialPlan, emptyPlan, parsePlan, type Furniture, type Plan, type Door } from '../src/model.ts'

const box = (patch: Partial<Furniture> = {}): Furniture => ({ id: 'box', name: '箱子', kind: 'custom', x: 0, y: 0, width: 40, depth: 40, height: 80, rotation: 0, color: '#aabbcc', ...patch })
const doorPlan = (): Plan => ({ ...emptyPlan(), walls: [{ id: 'w', a: { x: 0, y: -200 }, b: { x: 0, y: 200 }, thickness: 12 }], doors: [{ id: 'd', wallId: 'w', offset: 200, width: 90, height: 210, flip: false }] })

test('wall translations preserve precise geometry and door offsets with and without snapping', () => {
  for (const b of [{ x: 500.5, y: 30.25 }, { x: 10.25, y: 600.75 }, { x: 410.75, y: 330.5 }, { x: -500.5, y: -30.25 }]) {
    const wall = { id: 'w', a: { x: 10.25, y: 30.25 }, b, thickness: 12 }
    for (const snap of [false, true]) {
      const moved = translateWall(wall, { x: 23.2, y: -46.1 }, snap)
      const delta = snap ? { x: 20, y: -50 } : { x: 23, y: -46 }
      assert.equal(moved.b.x - moved.a.x, wall.b.x - wall.a.x)
      assert.equal(moved.b.y - moved.a.y, wall.b.y - wall.a.y)
      assert.equal(moved.thickness, wall.thickness)
      const before = wallPoint(wall, 140), after = wallPoint(moved, 140)
      assert.ok(Math.abs(after.x - before.x - delta.x) < 1e-8)
      assert.ok(Math.abs(after.y - before.y - delta.y) < 1e-8)
      assert.deepEqual(moved.a, { x: wall.a.x + delta.x, y: wall.a.y + delta.y })
    }
  }
})

test('wall translations clamp the whole segment at coordinate limits and ignore invalid movement', () => {
  const wall = { id: 'w', a: { x: 9900, y: -9990 }, b: { x: 9990, y: -9800 }, thickness: 12 }
  const moved = translateWall(wall, { x: 50, y: -40 }, true)
  assert.deepEqual(moved.a, { x: 9910, y: -10000 })
  assert.deepEqual(moved.b, { x: 10000, y: -9810 })
  assert.equal(translateWall(wall, { x: 2, y: 4 }, true), wall)
  assert.equal(translateWall(wall, { x: NaN, y: 0 }, false), wall)
})

test('sample floor plan starts without collisions and round-trips exactly', () => {
  const p = initialPlan(); for (const i of p.items) assert.equal(collision(i, p), null, i.name)
  assert.deepEqual(parsePlan(JSON.stringify(p)), p)
})

test('orientation preserves legacy plans, round-trips precise angles and rejects invalid data', () => {
  const legacy = initialPlan()
  assert.equal(parsePlan(JSON.stringify(legacy)).northAngle ?? 0, 0)
  assert.equal(parsePlan(JSON.stringify(legacy)).orientationLocked ?? true, true)
  for (const northAngle of [0, 90, 180, 270, 30.5, 359.99]) {
    const plan = { ...legacy, northAngle }
    assert.deepEqual(parsePlan(JSON.stringify(plan)), plan)
  }
  for (const northAngle of [-1, 360, 361, null, '90', {}, NaN, Infinity]) {
    assert.throws(() => parsePlan(JSON.stringify({ ...legacy, northAngle })))
  }
  for (const orientationLocked of [true, false]) {
    const plan = { ...legacy, northAngle: 37.5, orientationLocked }
    assert.deepEqual(parsePlan(JSON.stringify(plan)), plan)
  }
  for (const orientationLocked of [null, 'false', 0, 1, {}, []]) {
    assert.throws(() => parsePlan(JSON.stringify({ ...legacy, orientationLocked })))
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

test('swing doors support both hinges and wall sides while preserving legacy drawings', () => {
  const door = { ...doorPlan().doors[0], width: 100 }
  assert.deepEqual(swingDoorGeometry(door), { hinge: { x: 0, y: 0 }, closed: { x: 100, y: 0 }, open: { x: 0, y: 100 }, sweep: 1 })
  for (const hingeSide of ['start', 'end'] as const) for (const flip of [false, true]) {
    const d = { ...door, hingeSide, flip }, shape = swingDoorGeometry(d)
    const x = hingeSide === 'end' ? 100 : 0
    assert.deepEqual(shape.hinge, { x, y: 0 })
    assert.deepEqual(shape.open, { x, y: flip ? -100 : 100 })
    assert.deepEqual(shape.closed, { x: 100 - x, y: 0 })
    assert.equal(shape.sweep, hingeSide === 'end' ? Number(flip) : Number(!flip))
    const plan = { ...doorPlan(), doors: [d] }
    assert.deepEqual(parsePlan(JSON.stringify(plan)), plan)
  }
  for (const hingeSide of ['left', 'right', '', null, false, 0]) {
    assert.throws(() => parsePlan(JSON.stringify({ ...doorPlan(), doors: [{ ...door, hingeSide }] })))
  }
})

test('merging reversed horizontal and vertical walls preserves swing hinges and open leaves', () => {
  for (const vertical of [false, true]) for (const hingeSide of [undefined, 'start', 'end'] as const) for (const flip of [false, true]) {
    const point = (n: number) => vertical ? { x: 0, y: n } : { x: n, y: 0 }
    const p: Plan = { ...emptyPlan(), walls: [{ id: 'w', a: point(400), b: point(0), thickness: 12 }], doors: [{ id: 'd', wallId: 'w', offset: 180, width: 100, height: 210, flip, hingeSide }] }
    const endpoints = (plan: Plan) => {
      const d = plan.doors[0], w = plan.walls[0], shape = swingDoorGeometry(d)
      const origin = wallPoint(w, d.offset - d.width / 2), length = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
      const dx = (w.b.x - w.a.x) / length, dy = (w.b.y - w.a.y) / length
      return [shape.hinge, shape.closed, shape.open].map(v => ({ x: origin.x + v.x * dx - v.y * dy, y: origin.y + v.x * dy + v.y * dx }))
    }
    const next = integrateWall(p, { id: 'new', a: point(-100), b: point(100), thickness: 12 })
    assert.deepEqual(endpoints(next), endpoints(p))
  }
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

test('marquee selection intersects rotated footprints in either direction and excludes empty corners', () => {
  const rotated = box({ x: 100, y: 100, width: 100, depth: 20, rotation: 45 })
  assert.deepEqual(itemsInBox([rotated], { x: 125, y: 125 }, { x: 140, y: 140 }), ['box'])
  assert.deepEqual(itemsInBox([rotated], { x: 140, y: 140 }, { x: 125, y: 125 }), ['box'])
  assert.deepEqual(itemsInBox([rotated], { x: 60, y: 125 }, { x: 75, y: 140 }), [])
  assert.deepEqual(itemsInBox([rotated], { x: 100, y: 50 }, { x: 100, y: 150 }), [])
})

test('group translations preserve spacing, rotations and fractional coordinates and clamp as a whole', () => {
  const items = [box({ x: 100.25, y: 200.5 }), box({ id: 'second', x: 275.75, y: 330.25, rotation: 38 })]
  const moved = translateItems(items, { x: 73, y: -44 }, true)
  assert.deepEqual(moved, items.map(item => ({ ...item, x: item.x + 70, y: item.y - 40 })))
  assert.deepEqual(translateItems(items, { x: 23, y: 17 }, false), items.map(item => ({ ...item, x: item.x + 23, y: item.y + 17 })))
  const bounded = translateItems(items, { x: 20000, y: -20000 }, true)
  assert.equal(bounded[1].x, 10000); assert.equal(bounded[0].y, -10000)
  assert.equal(bounded[1].x - bounded[0].x, items[1].x - items[0].x)
  assert.equal(bounded[1].y - bounded[0].y, items[1].y - items[0].y)
  assert.equal(translateItems(items, { x: 1, y: 2 }, true), items)
  assert.equal(translateItems(items, { x: NaN, y: 0 }, true), items)
})

const windowPlan = (): Plan => ({ ...emptyPlan(), walls: [{ id: 'wall', a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, thickness: 14 }],
  windows: [{ id: 'window', wallId: 'wall', offset: 200, width: 120, height: 150, sillHeight: 90 }],
  doors: [{ id: 'door', wallId: 'wall', offset: 450, width: 90, height: 210, flip: false }] })

test('window plans round-trip while legacy version-1 files remain unchanged', () => {
  assert.deepEqual(parsePlan(JSON.stringify(emptyPlan())), emptyPlan())
  for (const sillHeight of [0, 90, 125.5, 1000]) {
    const p = windowPlan(); p.windows![0].sillHeight = sillHeight
    assert.deepEqual(parsePlan(JSON.stringify(p)), p)
  }
})

test('window imports reject invalid arrays, dimensions, references, duplicate ids and overlapping openings', () => {
  const plan = windowPlan(), window = plan.windows![0]
  for (const windows of [null, {}, 'windows', [null], Array(501).fill(window)]) assert.throws(() => parsePlan(JSON.stringify({ ...plan, windows })))
  for (const patch of [{ id: 'wall' }, { id: 'door' }, { wallId: 'missing' }, { width: 0 }, { width: 1001 }, { height: 19 }, { height: null }, { sillHeight: -1 }, { sillHeight: '90' }, { sillHeight: 1001 }, { sillHeight: null }, { offset: 10 }, { offset: 590 }, { offset: 450 }]) {
    assert.throws(() => parsePlan(JSON.stringify({ ...plan, windows: [{ ...window, ...patch }] })))
  }
  assert.throws(() => parsePlan(JSON.stringify({ ...plan, windows: [window, { ...window, id: 'second', offset: 250 }] })))
  assert.equal(openingFits(plan, plan.walls[0], { ...plan.doors[0], offset: 230 }), false)
})

test('windows cut the plan drawing but never open a ground-level moving passage', () => {
  const plan = windowPlan(), wall = plan.walls[0]
  assert.deepEqual(wallPieces(wall, plan, true), [{ from: 0, to: 140 }, { from: 260, to: 405 }, { from: 495, to: 600 }])
  assert.deepEqual(wallPieces(wall, plan), [{ from: 0, to: 405 }, { from: 495, to: 600 }])
  for (const sillHeight of [0, 90]) {
    plan.windows![0].sillHeight = sillHeight
    assert.equal(sweep(box({ x: 200, y: -100, height: 40 }), box({ x: 200, y: 100, height: 40 }), plan).blocked?.kind, 'wall')
  }
  assert.equal(sweep(box({ x: 450, y: -100 }), box({ x: 450, y: 100 }), plan).blocked, null)
})

test('window dragging snaps along the wall, preserves size and clamps at wall edges and neighbours', () => {
  const plan = windowPlan(), wall = plan.walls[0], window = plan.windows![0]
  assert.equal(slideWindow(window, wall, plan, 27, true).offset, 230)
  assert.equal(slideWindow(window, wall, plan, 27, false).offset, 227)
  assert.equal(slideWindow(window, wall, plan, -1000, false).offset, 60)
  const limited = slideWindow(window, wall, plan, 1000, true)
  assert.equal(limited.offset, 345); assert.equal(openingFits(plan, wall, limited), true)
  assert.deepEqual(limited, { ...window, offset: 345 })
  assert.equal(slideWindow(window, wall, plan, NaN, true), window)
  plan.windows!.push({ ...window, id: 'left', offset: 70, width: 40 })
  assert.equal(slideWindow(window, wall, plan, -1000, false).offset, 150)
})

test('merging reversed walls preserves window position and dimensions in either axis', () => {
  for (const vertical of [false, true]) {
    const point = (v: number) => vertical ? { x: 0, y: v } : { x: v, y: 0 }
    const plan: Plan = { ...emptyPlan(), walls: [{ id: 'wall', a: point(600), b: point(100), thickness: 14 }], windows: [{ id: 'window', wallId: 'wall', offset: 200, width: 120, height: 150, sillHeight: 90 }] }
    const next = integrateWall(plan, { id: 'extra', a: point(-100), b: point(100), thickness: 14 })
    assert.deepEqual(wallPoint(next.walls[0], next.windows![0].offset), point(400))
    assert.deepEqual(next.windows![0], { ...plan.windows![0], offset: 500 })
    assert.deepEqual(parsePlan(JSON.stringify(next)), next)
  }
})

test('wall merges reject door-window conflicts without mutating the original plan', () => {
  const plan = windowPlan(); plan.walls.push({ id: 'other', a: { x: 100, y: 0 }, b: { x: 400, y: 0 }, thickness: 14 })
  plan.windows!.push({ ...plan.windows![0], id: 'second', wallId: 'other', offset: 100 })
  const before = JSON.stringify(plan)
  assert.throws(() => integrateWall(plan, { id: 'extra', a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, thickness: 14 }), /门窗重叠/)
  assert.equal(JSON.stringify(plan), before)
})
