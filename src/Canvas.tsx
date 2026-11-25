import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Minus, Plus, Maximize, MousePointer2, Hand, Pentagon, DoorOpen, PanelsLeftBottom, Ruler, SquareDashed, RotateCcw, RotateCw } from 'lucide-react'
import type { Plan, Point, Furniture, Wall, Room } from './model'
import { distance, wallPoint, wallPieces, projectOnWall, corners, collision, overlaps } from './geometry'
import { FurnitureShape } from './FurnitureShape'
import DoorShape from './DoorShape'
import CompassDial from './CompassDial'
import OrientationToggle from './OrientationToggle'

export type Tool = 'select' | 'room' | 'wall' | 'door' | 'sliding-door' | 'measure' | 'pan'
export type Selection = { type: 'item' | 'wall' | 'door' | 'room'; id: string } | null
export type RoutePoint = Point & { rotation: number }
type Props = {
  plan: Plan; selection: Selection; tool: Tool; mode: 'design' | 'move'; snap: boolean; showDims: boolean; fitKey: number;
  route: RoutePoint[]; blocked: boolean; clearance: number;
  onSelect: (s: Selection) => void; onTool: (t: Tool) => void;
  onOrientation: () => void;
  onNorthAngle: (angle: number) => void; onOrientationLock: (locked: boolean) => void;
  onDragStart: () => void; onMove: (item: Furniture) => void; onRotate: (degrees: number) => void;
  onDraw: (a: Point, b: Point, type: 'wall' | 'room') => void; onDoor: (wall: Wall, offset: number) => void;
}
const tools = [
  { id: 'select', icon: MousePointer2, name: '选择物件', key: 'V' },
  { id: 'pan', icon: Hand, name: '平移画布', key: 'H' },
  { id: 'room', icon: SquareDashed, name: '绘制房间', key: 'B' },
  { id: 'wall', icon: Pentagon, name: '绘制墙体', key: 'W' },
  { id: 'door', icon: DoorOpen, name: '添加门洞', key: 'D' },
  { id: 'sliding-door', icon: PanelsLeftBottom, name: '添加推拉门', key: 'S' },
  { id: 'measure', icon: Ruler, name: '测量距离', key: 'M' },
] as const

export default function Canvas(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null), boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 900, height: 750 })
  const [view, setView] = useState({ x: 480, y: 325, scale: .65 })
  const [draft, setDraft] = useState<{ a: Point; b: Point; type: 'wall' | 'room' | 'measure' } | null>(null)
  const [measurement, setMeasurement] = useState<{ a: Point; b: Point } | null>(null)
  const drag = useRef<{ type: 'item'; item: Furniture; offset: Point } | { type: 'pan'; start: Point; view: typeof view } | { type: 'draw'; a: Point; kind: 'wall' | 'room' | 'measure' } | null>(null)
  const drawLatest = useRef(draft)
  const activeItem = p.plan.items.find(i => p.selection?.type === 'item' && i.id === p.selection.id)
  const viewWidth = size.width / view.scale, viewHeight = size.height / view.scale
  const snapPoint = (point: Point) => p.snap ? { x: Math.round(point.x / 10) * 10, y: Math.round(point.y / 10) * 10 } : { x: Math.round(point.x), y: Math.round(point.y) }
  function world(e: { clientX: number; clientY: number }): Point {
    const m = svgRef.current?.getScreenCTM()?.inverse()
    if (!m) return { x: 0, y: 0 }
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return { x: point.x, y: point.y }
  }
  function fit() {
    const points = [...p.plan.walls.flatMap(w => [w.a, w.b]), ...p.plan.items.flatMap(i => corners(i)), ...p.plan.rooms.flatMap(r => [r, { x: r.x + r.width, y: r.y + r.depth }])]
    if (!points.length) { setView({ x: 480, y: 325, scale: Math.min(size.width / 1250, size.height / 1000) }); return }
    const minX = Math.min(...points.map(v => v.x)), maxX = Math.max(...points.map(v => v.x)), minY = Math.min(...points.map(v => v.y)), maxY = Math.max(...points.map(v => v.y))
    const paddingX = size.width < 500 ? 80 : 150
    setView({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale: Math.max(.12, Math.min(1.5, (size.width - paddingX) / (maxX - minX + 100), (size.height - 180) / (maxY - minY + 100))) })
  }
  useEffect(() => {
    if (!boxRef.current) return
    const observer = new ResizeObserver(entries => { const r = entries[0].contentRect; setSize({ width: r.width, height: r.height }) })
    observer.observe(boxRef.current); return () => observer.disconnect()
  }, [])
  const fitOnRequest = useEffectEvent(fit)
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitOnRequest())
    return () => cancelAnimationFrame(frame)
  }, [p.fitKey, size.width, size.height]) // Keep the viewport stable during furniture movement.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    function wheel(e: WheelEvent) {
      e.preventDefault()
      const point = world(e)
      setView(v => {
        const scale = Math.max(.12, Math.min(3, v.scale * Math.exp(-e.deltaY * .0015)))
        return { x: point.x - (point.x - v.x) * v.scale / scale, y: point.y - (point.y - v.y) * v.scale / scale, scale }
      })
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [])

  function start(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.button !== 1) return
    if (p.tool === 'pan' || e.button === 1 || e.altKey) {
      drag.current = { type: 'pan', start: { x: e.clientX, y: e.clientY }, view }; e.currentTarget.setPointerCapture(e.pointerId); return
    }
    const point = snapPoint(world(e))
    if (p.tool === 'wall' || p.tool === 'room' || p.tool === 'measure') {
      drag.current = { type: 'draw', a: point, kind: p.tool }; const d = { a: point, b: point, type: p.tool }; setDraft(d); drawLatest.current = d
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (p.tool === 'door' || p.tool === 'sliding-door') {
      let best: Wall | undefined, offset = 0, nearest = 25 / view.scale
      for (const w of p.plan.walls) { const o = projectOnWall(point, w), d = distance(point, wallPoint(w, o)); if (d < nearest) { nearest = d; best = w; offset = o } }
      if (best) p.onDoor(best, offset)
    } else if (e.target === e.currentTarget || (e.target as Element).getAttribute('data-background')) p.onSelect(null)
  }
  function startItem(e: ReactPointerEvent<SVGGElement>, item: Furniture) {
    if (p.tool !== 'select' || e.button !== 0 || e.altKey) return
    e.stopPropagation(); p.onSelect({ type: 'item', id: item.id }); p.onDragStart()
    const point = world(e); drag.current = { type: 'item', item, offset: { x: point.x - item.x, y: point.y - item.y } }
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current; if (!d) return
    if (d.type === 'pan') { setView({ ...d.view, x: d.view.x - (e.clientX - d.start.x) / view.scale, y: d.view.y - (e.clientY - d.start.y) / view.scale }); return }
    if (d.type === 'item') {
      const w = world(e), point = { x: w.x - d.offset.x, y: w.y - d.offset.y }
      p.onMove({ ...d.item, ...(p.mode === 'move' ? point : snapPoint(point)), rotation: p.plan.items.find(i => i.id === d.item.id)?.rotation ?? d.item.rotation })
    } else {
      const point = snapPoint(world(e))
      if (d.kind === 'wall' && !e.shiftKey) { if (Math.abs(point.x - d.a.x) > Math.abs(point.y - d.a.y)) point.y = d.a.y; else point.x = d.a.x }
      const next = { a: d.a, b: point, type: d.kind }; drawLatest.current = next; setDraft(next)
    }
  }
  function stop(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current, latest = drawLatest.current
    if (d?.type === 'draw' && latest) {
      if (d.kind === 'measure') setMeasurement({ a: d.a, b: latest.b })
      else p.onDraw(d.a, latest.b, d.kind)
    }
    drag.current = null; drawLatest.current = null; setDraft(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  function dimension(a: Point, b: Point, label: string, key?: string) {
    const horizontal = Math.abs(b.y - a.y) < .01
    return <g key={key} className="dimension" pointerEvents="none">
      <path d={`M ${a.x} ${a.y} L ${b.x} ${b.y} M ${a.x - (horizontal ? 0 : 6)} ${a.y - (horizontal ? 6 : 0)} l ${horizontal ? 0 : 12} ${horizontal ? 12 : 0} M ${b.x - (horizontal ? 0 : 6)} ${b.y - (horizontal ? 6 : 0)} l ${horizontal ? 0 : 12} ${horizontal ? 12 : 0}`} />
      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - (horizontal ? 9 : 0)} transform={!horizontal ? `rotate(-90 ${(a.x + b.x) / 2 - 12} ${(a.y + b.y) / 2})` : undefined} dx={!horizontal ? -12 : 0}>{label}</text>
    </g>
  }
  const ruler = measurement ?? (draft?.type === 'measure' ? draft : null)
  function roomLabelY(r: Room) {
    for (const factor of [.5, .7, .85, .3]) {
      const x = r.x + r.width / 2, y = r.y + r.depth * factor
      const area = [{ x: x - 55, y: y - 14 }, { x: x + 55, y: y - 14 }, { x: x + 55, y: y + 32 }, { x: x - 55, y: y + 32 }]
      if (!p.plan.items.some(item => overlaps(area, corners(item)))) return y
    }
    return r.y + r.depth / 2
  }
  return <div className={`canvas-shell tool-${p.tool} ${p.mode === 'move' ? 'moving-mode' : ''}`} ref={boxRef}>
    <div className="canvas-label"><span className="live-dot" /> {p.mode === 'move' ? '搬运试验' : '二维平面'}<span className="label-divider" />单位：cm</div>
    <div className="compass-widget">
      <CompassDial className="compass-control" testId="canvas-compass" angle={p.plan.northAngle ?? 0} locked={p.plan.orientationLocked ?? true} disabled={p.mode === 'move'} onChange={p.onNorthAngle} onOpen={p.onOrientation} />
      <OrientationToggle locked={p.plan.orientationLocked ?? true} disabled={p.mode === 'move'} onChange={p.onOrientationLock} />
    </div>
    <div className="floating-tools" aria-label="绘图工具栏">{tools.map(t => <button key={t.id} disabled={p.mode === 'move' && !['select', 'pan', 'measure'].includes(t.id)} aria-label={t.name} title={`${t.name} · ${t.key}`} className={p.tool === t.id ? 'active' : ''} onClick={() => { p.onTool(t.id); setMeasurement(null) }}><t.icon size={19} /></button>)}</div>
    <svg ref={svgRef} className="floor-canvas" data-testid="floor-canvas" aria-label="房屋平面布置画布" viewBox={`${view.x - viewWidth / 2} ${view.y - viewHeight / 2} ${viewWidth} ${viewHeight}`} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={() => { drag.current = null; drawLatest.current = null; setDraft(null) }}>
      <defs>
        <pattern id="grid-small" width={10} height={10} patternUnits="userSpaceOnUse"><circle cx={0} cy={0} r={.65} fill="#cacdc4" /></pattern>
        <pattern id="grid-large" width={50} height={50} patternUnits="userSpaceOnUse"><rect width={50} height={50} fill="url(#grid-small)" /><path d="M 50 0 H 0 V 50" fill="none" stroke="#dfe1d9" strokeWidth={.45} /></pattern>
        <pattern id="floorboards" width={90} height={22} patternUnits="userSpaceOnUse"><path d="M 0 22 H 90 M 45 0 V 22" fill="none" stroke="#bfb7a3" strokeWidth={.5} opacity={.2} /></pattern>
        <filter id="item-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx={1} dy={3} stdDeviation={3} floodColor="#4c5141" floodOpacity={.1} /></filter>
      </defs>
      <rect data-background="true" x={view.x - viewWidth / 2} y={view.y - viewHeight / 2} width={viewWidth} height={viewHeight} fill="url(#grid-large)" />
      {p.plan.rooms.map(r => <g key={r.id} onPointerDown={e => { if (p.tool === 'select' && !e.altKey && e.button === 0) { e.stopPropagation(); p.onSelect({ type: 'room', id: r.id }) } }}>
        <rect x={r.x} y={r.y} width={r.width} height={r.depth} fill={r.color} stroke={p.selection?.id === r.id ? '#637c55' : 'none'} strokeWidth={2} />
        <rect x={r.x} y={r.y} width={r.width} height={r.depth} fill="url(#floorboards)" pointerEvents="none" />
        <text className="room-name" x={r.x + r.width / 2} y={roomLabelY(r) + 6} pointerEvents="none">{r.name}</text>
        <text className="room-area" x={r.x + r.width / 2} y={roomLabelY(r) + 28} pointerEvents="none">{(r.width * r.depth / 10000).toFixed(1)} m²</text>
      </g>)}
      {p.showDims && p.plan.rooms.map(r => dimension({ x: r.x, y: r.y - 37 }, { x: r.x + r.width, y: r.y - 37 }, `${r.width}`, r.id))}
      {p.showDims && p.plan.rooms[0] && dimension({ x: p.plan.rooms[0].x - 37, y: p.plan.rooms[0].y }, { x: p.plan.rooms[0].x - 37, y: p.plan.rooms[0].y + p.plan.rooms[0].depth }, `${p.plan.rooms[0].depth}`)}
      {p.plan.walls.map(w => <g key={w.id} onPointerDown={e => {
        if (e.altKey || e.button !== 0) return
        if (p.tool === 'door' || p.tool === 'sliding-door') { e.stopPropagation(); p.onDoor(w, projectOnWall(world(e), w)) }
        else if (p.tool === 'select' && p.mode === 'design') { e.stopPropagation(); p.onSelect({ type: 'wall', id: w.id }) }
      }}>
        <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="transparent" strokeWidth={Math.max(20, w.thickness)} />
        {wallPieces(w, p.plan).map((seg, n) => { const a = wallPoint(w, seg.from), b = wallPoint(w, seg.to); return <line key={n} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={p.selection?.id === w.id ? '#879765' : '#60695f'} strokeWidth={w.thickness} strokeLinecap="butt" /> })}
      </g>)}
      {p.plan.doors.map(d => {
        const w = p.plan.walls.find(v => v.id === d.wallId); if (!w) return null
        const a = wallPoint(w, d.offset - d.width / 2), angle = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180 / Math.PI
        return <g key={d.id} data-testid={`door-${d.id}`} data-door-type={d.type ?? 'swing'} transform={`translate(${a.x},${a.y}) rotate(${angle})`} className="door-shape" onPointerDown={e => { if (p.tool === 'select' && p.mode === 'design' && !e.altKey && e.button === 0) { e.stopPropagation(); p.onSelect({ type: 'door', id: d.id }) } }}>
          <DoorShape door={d} wall={w} selected={p.selection?.id === d.id} />
        </g>
      })}
      {p.route.length > 1 && <g pointerEvents="none"><polyline points={p.route.map(v => `${v.x},${v.y}`).join(' ')} fill="none" stroke="#779850" strokeWidth={3} strokeDasharray="7 5" /><circle cx={p.route[0].x} cy={p.route[0].y} r={7} fill="#fff" stroke="#779850" strokeWidth={3} /></g>}
      {p.plan.items.map(item => {
        const selected = p.selection?.type === 'item' && p.selection.id === item.id
        const hit = collision(item, p.plan)
        return <g key={item.id} data-testid={`item-${item.id}`} data-item-name={item.name} transform={`translate(${item.x},${item.y}) rotate(${item.rotation})`} onPointerDown={e => startItem(e, item)} className={p.tool === 'select' ? 'furniture-draggable' : ''}>
          <g filter="url(#item-shadow)"><FurnitureShape item={item} stroke={hit ? '#ba7160' : undefined} /></g>
          {selected && <g pointerEvents="none">
            {p.mode === 'move' && p.clearance > 0 && <rect x={-item.width / 2 - p.clearance} y={-item.depth / 2 - p.clearance} width={item.width + p.clearance * 2} height={item.depth + p.clearance * 2} fill="none" stroke="#9cae87" strokeDasharray="3 4" />}
            <rect x={-item.width / 2 - 5} y={-item.depth / 2 - 5} width={item.width + 10} height={item.depth + 10} rx={4} fill="none" stroke={p.blocked || hit ? '#be765c' : '#698543'} strokeWidth={2} />
            {[-1, 1].flatMap(x => [-1, 1].map(y => <rect key={`${x},${y}`} x={x * (item.width / 2 + 5) - 3.5} y={y * (item.depth / 2 + 5) - 3.5} width={7} height={7} rx={1} fill="#fff" stroke="#698543" strokeWidth={1.5} />))}
            {p.showDims && <text x={0} y={-item.depth / 2 - 17} textAnchor="middle" fill="#617c46" fontSize={12}>{item.width} × {item.depth} cm</text>}
          </g>}
        </g>
      })}
      {draft && draft.type !== 'measure' && <g pointerEvents="none">
        {draft.type === 'room' ? <rect x={Math.min(draft.a.x, draft.b.x)} y={Math.min(draft.a.y, draft.b.y)} width={Math.abs(draft.b.x - draft.a.x)} height={Math.abs(draft.b.y - draft.a.y)} fill="#dde6cd" fillOpacity={.6} stroke="#708447" strokeWidth={3} strokeDasharray="8 5" /> : <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="#708447" strokeWidth={12} opacity={.65} />}
        <text x={(draft.a.x + draft.b.x) / 2} y={Math.min(draft.a.y, draft.b.y) - 14} textAnchor="middle" fontSize={16} fill="#4c633b">{draft.type === 'room' ? `${Math.abs(draft.b.x - draft.a.x)} × ${Math.abs(draft.b.y - draft.a.y)} cm` : `${Math.round(distance(draft.a, draft.b))} cm`}</text>
      </g>}
      {ruler && <g className="ruler-measure" pointerEvents="none"><line x1={ruler.a.x} y1={ruler.a.y} x2={ruler.b.x} y2={ruler.b.y} stroke="#b77d44" strokeWidth={2} strokeDasharray="5 3" />{[ruler.a, ruler.b].map((v, i) => <circle key={i} cx={v.x} cy={v.y} r={4} fill="#b77d44" />)}<text x={(ruler.a.x + ruler.b.x) / 2} y={(ruler.a.y + ruler.b.y) / 2 - 14} textAnchor="middle" fontSize={16} fill="#986833">{distance(ruler.a, ruler.b).toFixed(1)} cm</text></g>}
    </svg>
    {!p.plan.walls.length && !p.plan.items.length && <div className="canvas-empty"><SquareDashed size={40} strokeWidth={1} /><h2>从一个房间开始</h2><p>选择「绘制房间」，在画布上拖出你的空间</p><button className="primary-button" onClick={() => p.onTool('room')}>绘制第一个房间</button></div>}
    <div className="canvas-bottom">
      <div className="scale-guide"><span><i style={{ width: 100 * view.scale }} />1 m</span></div>
      {activeItem && <div className="rotate-controls"><button onClick={() => p.onRotate(-15)} title="逆时针旋转 15°（Q）" aria-label="逆时针旋转"><RotateCcw size={16} /></button><span>{Math.round((activeItem.rotation % 360 + 360) % 360)}°</span><button onClick={() => p.onRotate(15)} title="顺时针旋转 15°（E）" aria-label="顺时针旋转"><RotateCw size={16} /></button></div>}
      <div className="zoom-controls"><button aria-label="缩小" onClick={() => setView(v => ({ ...v, scale: Math.max(.12, v.scale / 1.2) }))}><Minus size={16} /></button><span>{Math.round(view.scale * 100)}%</span><button aria-label="放大" onClick={() => setView(v => ({ ...v, scale: Math.min(3, v.scale * 1.2) }))}><Plus size={16} /></button><i /><button aria-label="适应画布" title="适应画布" onClick={fit}><Maximize size={16} /></button></div>
    </div>
  </div>
}
