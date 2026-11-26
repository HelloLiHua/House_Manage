import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Box, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Copy, DoorOpen, FilePlus2, FolderOpen, Grid2X2, House, Info, Layers, LayoutTemplate, MousePointer2, Package, PanelLeftClose, PanelsLeftBottom, Pencil, Play, Plus, Redo2, RotateCcw, RotateCw, Route, Ruler, Search, Settings2, ShieldCheck, Sofa, Sparkles, Trash2, TriangleAlert, Undo2, X } from 'lucide-react'
import Canvas from './Canvas'
import OrientationSettings from './OrientationSettings'
import SwingDoorSettings from './SwingDoorSettings'
import type { Selection, Tool, RoutePoint } from './Canvas'
import { FurnitureThumbnail } from './FurnitureShape'
import { collision, distance, doorPassage, integrateWall, sweep, translateItems } from './geometry'
import { itemIds, selectItems, toggleItem, validSelection } from './selection'
import { emptyPlan, initialPlan, parsePlan, templates, uid } from './model'
import type { Plan, Furniture, Point, Template, Wall, Door } from './model'
import { STORAGE_KEY, usePlan } from './usePlan'
import './App.css'

function Numeric({ label, value, onChange, min = 1, max = 5000, suffix = 'cm', disabled = false }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(Math.round(value * 10) / 10))
  const [invalid, setInvalid] = useState(false)
  const [previousValue, setPreviousValue] = useState(value)
  if (value !== previousValue) { setPreviousValue(value); setDraft(String(Math.round(value * 10) / 10)); setInvalid(false) }
  function commit() {
    const n = Number(draft)
    if (!draft.trim() || !Number.isFinite(n) || n < min || n > max) { setDraft(String(Math.round(value * 10) / 10)); setInvalid(true); return }
    setInvalid(false); setDraft(String(Math.round(value * 10) / 10)); if (n !== value) onChange(n)
  }
  return <label className={`number-field ${invalid ? 'invalid' : ''}`}><span>{label}</span><div><input aria-label={label} type="number" min={min} max={max} step="any" disabled={disabled} value={draft} onChange={e => { setDraft(e.target.value); setInvalid(false) }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /><em>{suffix}</em></div>{invalid && <small>范围 {min}–{max}</small>}</label>
}

function slideDirectionLabel(wall: Wall, towardStart: boolean) {
  const sign = towardStart ? -1 : 1, dx = (wall.b.x - wall.a.x) * sign, dy = (wall.b.y - wall.a.y) * sign
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  const horizontal = Math.abs(dx) > size * .3 ? (dx < 0 ? '左' : '右') : ''
  const vertical = Math.abs(dy) > size * .3 ? (dy < 0 ? '上' : '下') : ''
  return `向${horizontal}${vertical}滑动`
}

function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a')
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const { plan, current, setPlan, checkpoint, undo, redo, canUndo, canRedo, revision, initialError } = usePlan()
  const [selectionState, setSelection] = useState<Selection>(plan.items[0] ? { type: 'item', id: plan.items[0].id } : null)
  const selection = validSelection(selectionState, plan)
  if (selection !== selectionState) setSelection(selection)
  const selectedIds = new Set(itemIds(selection))
  const selectedItems = plan.items.filter(item => selectedIds.has(item.id))
  const [tool, setTool] = useState<Tool>('select'), [mode, setMode] = useState<'design' | 'move'>('design')
  const [snap, setSnap] = useState(true), [showDims, setShowDims] = useState(true), [fitKey, setFitKey] = useState(0)
  const [search, setSearch] = useState(''), [category, setCategory] = useState('全部')
  const [leftTab, setLeftTab] = useState<'library' | 'objects'>('library')
  const [modal, setModal] = useState<'custom' | 'help' | 'new' | 'orientation' | null>(null)
  const [exportMenu, setExportMenu] = useState(false), [toast, setToast] = useState(initialError)
  const [savedPlan, setSavedPlan] = useState(plan), [saveError, setSaveError] = useState(initialError ? '读取失败' : '')
  const saveStatus = saveError || (savedPlan === plan ? '已保存至本机' : '正在保存…')
  const [route, setRoute] = useState<RoutePoint[]>([]), [travel, setTravel] = useState(0), [blocked, setBlocked] = useState('')
  const [clearance, setClearance] = useState(2), [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 760)
  const [custom, setCustom] = useState({ name: '自定义物件', width: '100', depth: '60', height: '80', color: '#b7c5a3' })
  const [customError, setCustomError] = useState('')
  const simulationStart = useRef<Furniture | null>(null), fileRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null), slidingGesture = useRef(false)
  const selected = selection?.type === 'item' ? plan.items.find(i => i.id === selection.id) : undefined
  const selectedWall = selection?.type === 'wall' ? plan.walls.find(w => w.id === selection.id) : undefined
  const selectedDoor = selection?.type === 'door' ? plan.doors.find(d => d.id === selection.id) : undefined
  const selectedRoom = selection?.type === 'room' ? plan.rooms.find(r => r.id === selection.id) : undefined
  const selectedHit = selected ? collision(selected, plan) : null
  const hits = plan.items.filter(i => collision(i, plan)).length
  const totalArea = plan.rooms.reduce((s, r) => s + r.width * r.depth, 0) / 10000
  const locked = mode === 'move'

  useEffect(() => {
    if (!revision) return
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); setSavedPlan(plan); setSaveError('') }
      catch { setSaveError('保存失败，请导出备份'); setToast('浏览器存储不可用，请导出 JSON 方案保存。') }
    }, 450)
    return () => clearTimeout(timer)
  }, [plan, revision])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) }, [toast])
  useEffect(() => {
    const flush = () => {
      if (!revision) return
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current.current)) } catch { /* Save error is reported by the regular autosave. */ }
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [current, revision])
  useEffect(() => {
    if (!modal) return
    const previous = document.activeElement as HTMLElement | null
    const panel = modalRef.current
    panel?.querySelector<HTMLElement>('input, button')?.focus()
    function trap(e: KeyboardEvent) {
      if (e.key === 'Escape') setModal(null)
      if (e.key !== 'Tab' || !panel) return
      const focusable = panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.removeEventListener('keydown', trap); previous?.focus() }
  }, [modal])

  function select(s: Selection) {
    if (locked && (s?.type !== 'item' || s.id !== selected?.id)) return
    setSelection(s); setBlocked('')
  }
  function changeNorthAngle(northAngle: number) {
    const p = current.current
    if (locked || (p.orientationLocked ?? true) || northAngle === (p.northAngle ?? 0)) return
    setPlan({ ...p, northAngle })
  }
  function changeOrientationLock(orientationLocked: boolean) {
    if (!locked) setPlan(p => ({ ...p, orientationLocked }))
  }
  function updateItem(patch: Partial<Furniture>, record = true) {
    if (!selected) return
    setPlan(p => ({ ...p, items: p.items.map(i => i.id === selected.id ? { ...i, ...patch } : i) }), record)
  }
  function onMove(target: Furniture) {
    const from = current.current.items.find(i => i.id === target.id)
    if (!from) return
    if (locked && target.id !== simulationStart.current?.id) return
    if (Math.abs(target.x) > 10000 || Math.abs(target.y) > 10000) return
    let next = target
    if (locked) {
      const result = sweep(from, target, current.current, clearance)
      next = result.item; setBlocked(result.blocked?.message ?? '')
      if (result.travelled > .1 || Math.abs(from.rotation - next.rotation) > .1) {
        setRoute(points => [...points, { x: next.x, y: next.y, rotation: next.rotation }])
        setTravel(v => v + result.travelled)
      }
    }
    setPlan(p => ({ ...p, items: p.items.map(i => i.id === next.id ? next : i) }), false)
  }
  function rotate(degrees: number) {
    if (!selected) return
    if (locked) onMove({ ...selected, rotation: selected.rotation + degrees })
    else updateItem({ rotation: (selected.rotation + degrees + 360) % 360 })
  }
  function moveItems(items: Furniture[]) {
    if (locked || items.some(item => ![item.x, item.y].every(v => Number.isFinite(v) && Math.abs(v) <= 10000))) return
    const updates = new Map(items.map(item => [item.id, item]))
    const p = current.current
    if (!p.items.some(item => { const next = updates.get(item.id); return next && (next.x !== item.x || next.y !== item.y) })) return
    setPlan({ ...p, items: p.items.map(item => updates.get(item.id) ?? item) })
  }
  function findPlacement(template: Template, id: string, preferred?: Point): Furniture {
    const item: Furniture = { ...template, id, x: preferred?.x ?? 350, y: preferred?.y ?? 330, rotation: 0 }
    if (preferred && !collision(item, current.current, 3)) return item
    for (const room of current.current.rooms) {
      for (let y = room.y + template.depth / 2 + 20; y < room.y + room.depth - template.depth / 2 - 10; y += 30) {
        for (let x = room.x + template.width / 2 + 20; x < room.x + room.width - template.width / 2 - 10; x += 30) {
          const candidate = { ...item, x, y }; if (!collision(candidate, current.current, 3)) return candidate
        }
      }
    }
    const right = Math.max(800, ...current.current.walls.flatMap(w => [w.a.x, w.b.x]), ...current.current.items.map(i => i.x + Math.hypot(i.width, i.depth) / 2))
    return { ...item, x: current.current.walls.length || current.current.items.length ? right + template.width / 2 + 50 : 480, y: 325 }
  }
  function addItem(template: Template) {
    if (locked) return
    const item = findPlacement(template, uid())
    setPlan(p => ({ ...p, items: [...p.items, item] })); setSelection({ type: 'item', id: item.id }); setTool('select'); setFitKey(v => v + 1)
    setToast(`已添加${template.name}，可拖动摆放或修改尺寸`)
  }
  function duplicate() {
    if (locked || !selectedItems.length) return
    if (plan.items.length + selectedItems.length > 500) { setToast('每个方案最多放置 500 件物品'); return }
    const copies = selected ? [findPlacement({ ...selected, name: `${selected.name} 副本`.slice(0, 100) }, uid(), { x: selected.x + 40, y: selected.y + 40 })]
      : translateItems(selectedItems, { x: 40, y: 40 }, false).map(item => ({ ...item, id: uid(), name: `${item.name} 副本`.slice(0, 100) }))
    setPlan(p => ({ ...p, items: [...p.items, ...copies] })); setSelection(selectItems(copies.map(item => item.id))); setFitKey(v => v + 1)
  }
  function remove() {
    if (!selection || locked) return
    const { type, id } = selection
    setPlan(p => ({ ...p, items: selectedIds.size ? p.items.filter(i => !selectedIds.has(i.id)) : p.items, rooms: type === 'room' ? p.rooms.filter(r => r.id !== id) : p.rooms, walls: type === 'wall' ? p.walls.filter(w => w.id !== id) : p.walls, doors: p.doors.filter(d => !(type === 'door' && d.id === id) && !(type === 'wall' && d.wallId === id)) }))
    setSelection(null); if (type === 'room') setToast('已移除房间标注。墙体可单独选中删除。')
  }
  function draw(a: Point, b: Point, type: 'wall' | 'room') {
    if (locked) return
    if ([a.x, a.y, b.x, b.y].some(v => Math.abs(v) > 10000)) { setToast('绘制范围应在 ±10000 cm 内'); return }
    if (type === 'wall') {
      if (distance(a, b) < 20) { setToast('请拖动绘制至少 20 cm 的墙体'); return }
      const wall = { id: uid(), a, b, thickness: 12 }
      setPlan(p => integrateWall(p, wall)); setTool('select'); setSelection(null)
    } else {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), width = Math.abs(a.x - b.x), depth = Math.abs(a.y - b.y)
      if (width < 50 || depth < 50 || width > 5000 || depth > 5000) { setToast('房间长宽请控制在 50–5000 cm'); return }
      if (plan.rooms.some(r => x < r.x + r.width - 1 && x + width > r.x + 1 && y < r.y + r.depth - 1 && y + depth > r.y + 1)) { setToast('新房间不能与已有房间重叠；可绘制墙体划分空间'); return }
      const id = uid(), points = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + depth }, { x, y: y + depth }]
      let next: Plan = { ...plan, rooms: [...plan.rooms, { id, name: `房间 ${plan.rooms.length + 1}`, x, y, width, depth, color: '#f0eee7' }] }
      for (let i = 0; i < 4; i++) next = integrateWall(next, { id: uid(), a: points[i], b: points[(i + 1) % 4], thickness: 12 })
      setPlan(next); setSelection({ type: 'room', id }); setTool('select')
    }
  }
  function addDoor(wall: Wall, offset: number) {
    const length = distance(wall.a, wall.b), sliding = tool === 'sliding-door', width = sliding ? Math.min(180, Math.floor((length - 10) / 10) * 10) : 90
    if (width < 40 || length < width + 10) { setToast('墙体太短，至少需要 100 cm 才能添加此门洞'); return }
    offset = Math.max(width / 2 + 5, Math.min(length - width / 2 - 5, Math.round(offset / 5) * 5))
    if (plan.doors.some(d => d.wallId === wall.id && Math.abs(d.offset - offset) < (d.width + width) / 2 + 2)) { setToast('门洞与现有门洞重叠，请换一个位置'); return }
    const door: Door = { id: uid(), wallId: wall.id, offset, width, height: 210, flip: false, ...(sliding ? { type: 'sliding', slidingStyle: 'bypass', slideDirection: 'end', opening: 100, panelThickness: 4 } as const : {}) }
    setPlan(p => ({ ...p, doors: [...p.doors, door] })); setSelection({ type: 'door', id: door.id }); setTool('select')
  }
  function updateWall(patch: Partial<Wall>) {
    if (!selectedWall) return
    const wall = { ...selectedWall, ...patch }, length = distance(wall.a, wall.b)
    if (length < 1 || length > 20000 || [wall.a.x, wall.a.y, wall.b.x, wall.b.y].some(v => Math.abs(v) > 10000)) { setToast('墙体端点不能重合，坐标范围为 ±10000 cm'); return }
    if (plan.doors.some(d => d.wallId === wall.id && d.offset + d.width / 2 > length)) { setToast('修改后门洞会超出墙体，请先调整门洞'); return }
    setPlan(p => ({ ...p, walls: p.walls.map(w => w.id === wall.id ? wall : w) }))
  }
  function moveWall(wall: Wall) {
    if (locked) return
    const previous = current.current.walls.find(w => w.id === wall.id)
    if (!previous || [wall.a.x, wall.a.y, wall.b.x, wall.b.y].some(v => !Number.isFinite(v) || Math.abs(v) > 10000)) return
    if (previous.a.x === wall.a.x && previous.a.y === wall.a.y && previous.b.x === wall.b.x && previous.b.y === wall.b.y) return
    setPlan(p => ({ ...p, walls: p.walls.map(w => w.id === wall.id ? wall : w) }))
  }
  function updateDoor(patch: Partial<Door>, record = true) {
    if (!selectedDoor) return
    if (locked) return
    const next = { ...selectedDoor, ...patch }, wall = plan.walls.find(w => w.id === next.wallId)!
    if (next.offset - next.width / 2 < 0 || next.offset + next.width / 2 > distance(wall.a, wall.b) || plan.doors.some(d => d.id !== next.id && d.wallId === next.wallId && Math.abs(d.offset - next.offset) < (d.width + next.width) / 2)) { setToast('门洞超出墙体或与其他门洞重叠'); return }
    setPlan(p => ({ ...p, doors: p.doors.map(d => d.id === next.id ? next : d) }), record)
  }
  function startSimulation() {
    if (!selected) { setToast('请先选择一件要搬运的物件'); return }
    const hit = collision(selected, plan, clearance + .5)
    if (hit) { setToast(`起点空间不足：${hit.message}。请调整摆放或预留间隙。`); return }
    checkpoint(); simulationStart.current = { ...selected }; setMode('move'); setTool('select'); setRoute([{ x: selected.x, y: selected.y, rotation: selected.rotation }]); setTravel(0); setBlocked('')
  }
  function restartSimulation() {
    const initial = simulationStart.current; if (!initial) return
    setPlan(p => ({ ...p, items: p.items.map(i => i.id === initial.id ? initial : i) }), false); setRoute([{ x: initial.x, y: initial.y, rotation: initial.rotation }]); setTravel(0); setBlocked('')
  }
  function finishSimulation() { setMode('design'); setBlocked(''); setRoute([]); simulationStart.current = null; setToast('已保留当前摆放位置，可用撤销返回搬运前') }
  function exportJson() { download(JSON.stringify(current.current, null, 2), `${plan.name || '房屋方案'}.json`, 'application/json'); setExportMenu(false); setToast('已导出可继续编辑的方案文件') }
  function exportSvg() {
    const original = document.querySelector<SVGSVGElement>('.floor-canvas'); if (!original) return
    const copy = original.cloneNode(true) as SVGSVGElement
    const points = [...plan.walls.flatMap(w => [w.a, w.b]), ...plan.items.flatMap(i => [{ x: i.x - Math.hypot(i.width, i.depth) / 2, y: i.y - Math.hypot(i.width, i.depth) / 2 }, { x: i.x + Math.hypot(i.width, i.depth) / 2, y: i.y + Math.hypot(i.width, i.depth) / 2 }]), ...plan.rooms.flatMap(r => [r, { x: r.x + r.width, y: r.y + r.depth }])]
    const minX = Math.min(0, ...points.map(p => p.x)) - 80, minY = Math.min(0, ...points.map(p => p.y)) - 80, maxX = Math.max(800, ...points.map(p => p.x)) + 80, maxY = Math.max(600, ...points.map(p => p.y)) + 80
    copy.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`); copy.setAttribute('width', String(maxX - minX)); copy.setAttribute('height', String(maxY - minY)); copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    // Reserve a separate header so the orientation remains visible at every export extent.
    const compass = document.querySelector<SVGSVGElement>('[data-testid="canvas-compass"] .compass-rose')?.cloneNode(true) as SVGSVGElement | undefined
    if (compass) {
      const headerHeight = 130
      copy.setAttribute('viewBox', `${minX} ${minY - headerHeight} ${maxX - minX} ${maxY - minY + headerHeight}`)
      copy.setAttribute('height', String(maxY - minY + headerHeight))
      const header = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      header.setAttribute('class', 'plan-orientation'); header.setAttribute('data-north-angle', String(plan.northAngle ?? 0))
      compass.setAttribute('x', String(maxX - 120)); compass.setAttribute('y', String(minY - 115))
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', String(minX + 20)); label.setAttribute('y', String(minY - 60))
      label.setAttribute('font-size', '17'); label.setAttribute('fill', '#71845b')
      label.textContent = `房屋朝向 · 北向 ${plan.northAngle ?? 0}°（从图上方顺时针）`
      header.append(label, compass); copy.append(header)
    }
    copy.querySelector('[data-background]')?.remove()
    copy.querySelectorAll('[data-selection-overlay]').forEach(element => element.remove())
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = 'text{font-family:Arial,"Microsoft YaHei",sans-serif}.room-name{font-size:21px;fill:#8a8d7d;text-anchor:middle}.room-area{font-size:13px;fill:#aaa99d;text-anchor:middle}.dimension path{fill:none;stroke:#abb09e;stroke-width:1}.dimension text{font-size:13px;fill:#7f8772;text-anchor:middle}'
    copy.prepend(style); download(new XMLSerializer().serializeToString(copy), `${plan.name || '房屋方案'}.svg`, 'image/svg+xml'); setExportMenu(false)
  }
  async function importFile(file?: File) {
    if (!file) return
    if (file.size > 3_000_000) { setToast('文件过大，请选择小于 3 MB 的方案'); return }
    try { const imported = parsePlan(await file.text()); setPlan(imported); setSelection(null); setFitKey(v => v + 1); setToast('方案已导入，可撤销返回原方案') }
    catch (error) { setToast(error instanceof Error ? error.message : '导入失败') }
  }
  function createCustom() {
    const width = Number(custom.width), depth = Number(custom.depth), height = Number(custom.height)
    if (!custom.name.trim() || ![width, depth, height].every(Number.isFinite) || width < 5 || width > 2000 || depth < 5 || depth > 2000 || height < 1 || height > 1000) { setCustomError('请填写名称；长宽为 5–2000 cm，高度为 1–1000 cm。'); return }
    addItem({ name: custom.name.trim(), kind: 'custom', width, depth, height, color: custom.color }); setModal(null); setCustomError('')
  }
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if (modal || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      const key = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey
      if (mod && key === 's') { e.preventDefault(); exportJson(); return }
      if (mod && key === 'z' && !locked) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && key === 'y' && !locked) { e.preventDefault(); redo(); return }
      if (mod && key === 'd' && !locked) { e.preventDefault(); duplicate(); return }
      if (mod) return
      if (key === 'delete' || key === 'backspace') { e.preventDefault(); remove() }
      if (key === 'q') rotate(-15)
      if (key === 'e') rotate(15)
      if (key === 'escape') { setTool('select'); if (!locked) setSelection(null); setExportMenu(false) }
      if (key === '/') { e.preventDefault(); document.querySelector<HTMLInputElement>('[aria-label="搜索家具"]')?.focus() }
      const shortcuts: Record<string, Tool> = { v: 'select', h: 'pan', b: 'room', w: 'wall', d: 'door', s: 'sliding-door', m: 'measure' }
      if (shortcuts[key] && (!locked || ['v', 'h', 'm'].includes(key))) setTool(shortcuts[key])
      if (selectedItems.length && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const delta = { x: key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, y: key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0 }
        if (locked && selected) onMove({ ...selected, x: selected.x + delta.x, y: selected.y + delta.y })
        else moveItems(translateItems(selectedItems, delta, false))
      }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard)
  })

  const filtered = templates.filter(t => t.name.includes(search) && (category === '全部' || (category === '客厅' && ['sofa', 'table', 'plant'].includes(t.kind)) || (category === '卧室' && ['bed', 'cabinet'].includes(t.kind)) || (category === '书房' && ['table', 'chair', 'cabinet'].includes(t.kind))))
  const hint = { select: selection?.type === 'wall' ? '拖动墙体整体移动 · 门随墙移动 · Esc 取消拖动' : selectedItems.length > 1 ? `已选 ${selectedItems.length} 件 · 拖动一起移动 · Shift 点击增减` : '空白处拖动框选 · Shift 点击多选 · 拖动物件或墙体移动', room: '拖动绘制矩形房间 · 相邻墙体自动合并', wall: '拖动绘制墙体 · 按住 Shift 绘制斜墙', door: '点击墙体添加门洞 · 默认净宽 90 cm', 'sliding-door': '点击墙体添加推拉门 · 可设置双扇或单扇、开合程度', pan: '拖动画布平移 · 滚轮缩放', measure: '拖动两点测量距离 · 按 V 返回选择' }[tool]

  return <div className="app">
    <header className="app-header">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Roomly 空间预想"><span className="brand-mark"><House size={24} strokeWidth={1.7} /></span><span>roomly<span className="brand-dot">.</span></span><em>空间预想</em></a>
      <div className="project-heading"><span className="project-divider" /><input aria-label="方案名称" maxLength={100} disabled={locked} value={plan.name} onChange={e => setPlan(p => ({ ...p, name: e.target.value }))} /><Pencil size={12} /><span className="save-status"><span className="live-dot" />{saveStatus}</span></div>
      <div className="header-actions"><button className="icon-button help-button" title="使用帮助" aria-label="使用帮助" onClick={() => setModal('help')}><CircleHelp size={19} /></button><button className="subtle-button" disabled={locked} onClick={() => setModal('new')}><FilePlus2 size={15} />新建方案</button><div className="export-wrapper"><button className="primary-button" onClick={() => setExportMenu(v => !v)}><ArrowDownToLine size={15} />导出方案<ChevronDown size={13} /></button>{exportMenu && <><div className="menu-dismiss" onClick={() => setExportMenu(false)} /><div className="export-menu"><button onClick={exportJson}><FolderOpen size={17} /><span>可编辑方案<small>JSON · 保存全部尺寸与布局</small></span></button><button onClick={exportSvg}><LayoutTemplate size={17} /><span>平面图<small>SVG · 矢量图片，方便分享</small></span></button></div></>}</div><div className="avatar">我</div></div>
    </header>
    <div className="workspace-bar"><div className="breadcrumb"><House size={14} /><span>我的空间</span><ChevronRight size={13} /><strong>平面布置</strong><span className="beta-tag">BETA</span></div><div className="mode-switch"><button className={!locked ? 'selected' : ''} onClick={() => locked && finishSimulation()}><Grid2X2 size={15} />布局设计</button><button className={locked ? 'selected' : ''} onClick={() => !locked && startSimulation()}><Route size={15} />搬运试验</button></div><div className="history-actions"><button aria-label="撤销" title="撤销 Ctrl+Z" disabled={!canUndo || locked} onClick={undo}><Undo2 size={17} /></button><button aria-label="重做" title="重做 Ctrl+Shift+Z" disabled={!canRedo || locked} onClick={redo}><Redo2 size={17} /></button><i /><button aria-label="显示或隐藏家具库" title="显示或隐藏家具库" onClick={() => setLeftOpen(v => !v)}><PanelLeftClose size={17} /></button></div></div>
    <main className={`workspace ${!leftOpen ? 'library-hidden' : ''}`}>
      {leftOpen && <aside className="library-panel">
        <div className="panel-tabs"><button className={leftTab === 'library' ? 'active' : ''} onClick={() => setLeftTab('library')}><Sofa size={17} />家具库</button><button className={leftTab === 'objects' ? 'active' : ''} onClick={() => setLeftTab('objects')}><Layers size={16} />已放置<span>{plan.items.length}</span></button></div>
        {leftTab === 'library' ? <div className="library-content"><div className="panel-intro"><h2>让空间，有你的样子</h2><p>按真实尺寸，提前安放每一件心仪好物。</p></div><label className="search-field"><Search size={16} /><input aria-label="搜索家具" placeholder="搜索家具、物件…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>/</kbd></label><div className="category-tabs">{['全部', '客厅', '卧室', '书房'].map(c => <button className={category === c ? 'active' : ''} key={c} onClick={() => setCategory(c)}>{c}</button>)}</div>
          <div className="section-label"><span>常用家具</span><span>{filtered.length} 件</span></div>
          <div className="furniture-grid">{filtered.map((t, i) => <button key={i} className="furniture-card" disabled={locked} onClick={() => addItem(t)} aria-label={`添加${t.name}`}><div className="furniture-preview"><FurnitureThumbnail item={t} /><span className="add-indicator"><Plus size={13} /></span></div><strong>{t.name}</strong><span>{t.width} × {t.depth} × {t.height} cm</span></button>)}</div>
          {!filtered.length && <div className="empty-search"><Search size={23} /><p>没有找到对应家具</p><button onClick={() => { setSearch(''); setCategory('全部') }}>查看全部</button></div>}

          <div className="library-note"><Sparkles size={15} /><p>家具尺寸只是起点。选中后，随时修改为你的实际尺寸。</p></div>
        </div> : <div className="objects-list"><div className="panel-intro"><h2>空间里的物件</h2><p>Shift 点击可追加或取消选择。</p></div>{plan.items.map(i => <button key={i.id} className={selectedIds.has(i.id) ? 'active' : ''} aria-pressed={selectedIds.has(i.id)} disabled={locked && selected?.id !== i.id} onClick={e => { select(e.shiftKey && !locked ? toggleItem(selection, i.id) : { type: 'item', id: i.id }); setTool('select') }}><FurnitureThumbnail item={i} /><span><strong>{i.name}</strong><small>{i.width} × {i.depth} × {i.height} cm</small></span>{collision(i, plan) ? <TriangleAlert size={15} className="warning-color" /> : <ChevronRight size={14} />}</button>)}{!plan.items.length && <p className="muted">还没有物件，从家具库添加一件吧。</p>}</div>}
        <div className="library-footer"><button className="custom-button" disabled={locked} onClick={() => { setCustomError(''); setModal('custom') }}><span><Plus size={18} /></span><div><strong>创建自定义物件</strong><small>输入尺寸，什么都能放进来</small></div><ChevronRight size={16} /></button><button disabled={locked} onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={15} />导入已有方案<ChevronRight size={14} /></button></div>
      </aside>}
      <input ref={fileRef} type="file" accept=".json,application/json" aria-label="导入方案文件" hidden onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value = '' }} />
      <section className="editor-panel">
        <div className="editor-topline"><div><span className="plan-dot" />{locked ? `正在试搬 · ${selected?.name}` : '户型平面图'}<span className="view-tag">俯视图</span></div><div className="canvas-toggles"><button role="switch" aria-checked={snap} className={snap ? 'on' : ''} onClick={() => setSnap(v => !v)}><span className="mini-check">{snap && <Check size={10} />}</span>网格吸附</button><button role="switch" aria-checked={showDims} className={showDims ? 'on' : ''} onClick={() => setShowDims(v => !v)}><span className="mini-check">{showDims && <Check size={10} />}</span>尺寸标注</button></div></div>
        <Canvas plan={plan} selection={selection} tool={tool} mode={mode} snap={snap} showDims={showDims} fitKey={fitKey} route={route} blocked={!!blocked} clearance={clearance} onOrientation={() => { if (!locked) setModal('orientation') }} onNorthAngle={changeNorthAngle} onOrientationLock={changeOrientationLock} onSelect={select} onTool={setTool} onMove={onMove} onItemsMove={moveItems} onWallMove={moveWall} onRotate={rotate} onDraw={draw} onDoor={addDoor} />
        <div className="canvas-hint"><MousePointer2 size={13} /><span>{locked ? '拖动已选物件试搬 · Q / E 旋转 · 碰撞时自动停下' : hint}</span><span className="hint-right">滚轮缩放 <span>·</span> Alt + 拖动平移</span></div>
      </section>
      <aside className="properties-panel">
        <div className="properties-title"><Settings2 size={16} /><h2>{locked ? '搬运试验' : '物件与空间'}</h2><span className="tiny-tag">{locked ? '实时检测' : '属性'}</span></div>
        <div className="properties-scroll">
          {selectedItems.length > 1 ? <div className="multi-selection" data-testid="multi-selection">
            <div className="multi-selection-heading"><span className="multi-selection-icon"><Layers size={24} /></span><div><span className="eyebrow">MULTIPLE OBJECTS</span><h3>已选中 {selectedItems.length} 件物品</h3></div><button className="icon-button" aria-label="取消多选" onClick={() => setSelection(null)}><X size={15} /></button></div>
            <p className="multi-selection-note">拖动其中任意一件，一起调整位置。物品之间的距离保持不变。</p>
            <div className="multi-selection-list">{selectedItems.map(item => <div key={item.id}><FurnitureThumbnail item={item} /><span><strong>{item.name}</strong><small>{item.width} × {item.depth} × {item.height} cm</small></span><button className="icon-button" aria-label={`取消选择${item.name}`} onClick={() => select(toggleItem(selection, item.id))}><X size={13} /></button></div>)}</div>
            <div className="object-actions"><button onClick={duplicate}><Copy size={14} />复制所选</button><button className="danger" onClick={remove}><Trash2 size={14} />删除所选</button></div>
            <div className="info-box"><Info size={16} /><p>Shift 点击可增减物件；方向键可一起微调。要修改尺寸或试搬，请单独选中一件。</p></div>
          </div> : selected ? <>
            <div className="selected-object"><div className="selected-preview"><FurnitureThumbnail item={selected} /></div><div><span className="eyebrow">{selected.kind === 'custom' ? 'CUSTOM OBJECT' : 'FURNITURE'}</span><h3>{selected.name}</h3><span className="muted">{locked ? '保持直立 · 地面搬运' : '已选中 · 可编辑'}</span></div><button className="icon-button" aria-label="取消选择" disabled={locked} onClick={() => setSelection(null)}><X size={15} /></button></div>
            <div className="property-section"><h4>基本信息</h4><label className="text-field"><span>物件名称</span><input aria-label="物件名称" disabled={locked} value={selected.name} maxLength={100} onChange={e => updateItem({ name: e.target.value })} /></label><div className="section-heading"><h4>实际尺寸</h4><span>厘米 cm</span></div><div className="dimensions-grid"><Numeric label="长度" value={selected.width} max={2000} min={5} onChange={v => updateItem({ width: v })} disabled={locked} /><Numeric label="宽度" value={selected.depth} max={2000} min={5} onChange={v => updateItem({ depth: v })} disabled={locked} /><Numeric label="高度" value={selected.height} max={1000} onChange={v => updateItem({ height: v })} disabled={locked} /></div><p className="field-note"><Info size={12} />高度用于门洞净高检查</p></div>
            <div className="property-section"><div className="section-heading"><h4>位置与角度</h4><span>以物件中心为准</span></div><div className="two-fields"><Numeric label="X 坐标" value={selected.x} min={-10000} max={10000} disabled={locked} onChange={v => updateItem({ x: v })} /><Numeric label="Y 坐标" value={selected.y} min={-10000} max={10000} disabled={locked} onChange={v => updateItem({ y: v })} /></div><div className="rotation-row"><Numeric label="旋转角度" value={(selected.rotation % 360 + 360) % 360} min={0} max={360} suffix="°" disabled={locked} onChange={v => updateItem({ rotation: v })} /><button className="icon-button" aria-label="逆时针旋转90度" title="逆时针 90°" onClick={() => rotate(-90)}><RotateCcw size={17} /></button><button className="icon-button" aria-label="顺时针旋转90度" title="顺时针 90°" onClick={() => rotate(90)}><RotateCw size={17} /></button></div>{!locked && <div className="color-row"><span>物件颜色</span><div>{['#bbc8b3', '#c7bfb3', '#d5bc98', '#a7bbbe', '#c5a7a0'].map(c => <button key={c} aria-label={`颜色 ${c}`} style={{ background: c }} className={selected.color === c ? 'selected' : ''} onClick={() => updateItem({ color: c })}>{selected.color === c && <Check size={12} />}</button>)}</div></div>}</div>
            {locked ? <div className="simulation-card"><div className="simulation-heading"><Route size={18} /><strong>正在检查这段路线</strong></div><div className={`pass-status ${blocked ? 'blocked' : ''}`}>{blocked ? <TriangleAlert size={19} /> : <ShieldCheck size={19} />}<div><strong>{blocked ? '此处无法通过' : route.length > 1 ? '已走过的路线可通过' : '起点空间充足'}</strong><small>{blocked || '拖动家具，沿途检测墙体和物件'}</small></div></div><div className="travel-metric"><span>已移动距离</span><strong>{(travel / 100).toFixed(2)}<small> m</small></strong></div><p className="simulation-disclaimer">只验证你走过的路线；不代表已找到所有可行路径。已检测推拉门扇；未模拟抬起、倾斜、平开门扇和搬运人员。</p><div className="simulation-buttons"><button className="secondary-button" onClick={restartSimulation}><RotateCcw size={14} />回到起点</button><button className="primary-button" onClick={finishSimulation}>结束试验<Check size={14} /></button></div></div> : <>
              <div className={`placement-status ${selectedHit ? 'has-collision' : ''}`}>{selectedHit ? <TriangleAlert size={17} /> : <CheckCheck size={17} />}<div><strong>{selectedHit ? '当前位置存在碰撞' : '当前位置没有碰撞'}</strong><small>{selectedHit?.message ?? '试试能否顺利搬到这里'}</small></div></div>
              <div className="move-card"><div className="move-card-icon"><Route size={21} /></div><h3>放得下，也要搬得进</h3><p>试着移动、旋转这件家具，提前看看路上有没有阻碍。</p><Numeric label="预留间隙" value={clearance} min={0} max={30} onChange={setClearance} /><span className="move-card-footnote">按物件外沿预留 · 包含 0.5 cm 检测余量</span></div>
            </>}
            {!locked && <div className="object-actions"><button onClick={duplicate}><Copy size={14} />复制物件</button><button className="danger" onClick={remove}><Trash2 size={14} />删除</button></div>}
          </> : selectedDoor ? <>
            <div className="simple-selected">{selectedDoor.type === 'sliding' ? <PanelsLeftBottom size={27} /> : <DoorOpen size={27} />}<h3>{selectedDoor.type === 'sliding' ? '推拉门' : '平开门'}</h3><p>{selectedDoor.type === 'sliding' ? '沿轨道滑动，按当前开度检查通行空间。' : '门洞是墙体中的实际开口。弧线表示开启方向。'}</p></div>
            <div className="property-section">
              <h4>门的类型</h4>
              <div className="door-segmented" role="group" aria-label="门的类型">
                <button aria-pressed={selectedDoor.type !== 'sliding'} onClick={() => updateDoor({ type: 'swing' })}><DoorOpen size={15} />平开门</button>
                <button aria-pressed={selectedDoor.type === 'sliding'} onClick={() => updateDoor({ type: 'sliding', slidingStyle: selectedDoor.slidingStyle ?? 'bypass', slideDirection: selectedDoor.slideDirection ?? 'end', opening: selectedDoor.opening ?? 100, panelThickness: selectedDoor.panelThickness ?? 4 })}><PanelsLeftBottom size={15} />推拉门</button>
              </div>
              <div className="two-fields"><Numeric label={selectedDoor.type === 'sliding' ? '门洞总宽' : '门洞净宽'} value={selectedDoor.width} min={20} max={500} onChange={v => updateDoor({ width: v })} /><Numeric label="门洞净高" value={selectedDoor.height} min={20} max={1000} onChange={v => updateDoor({ height: v })} /></div>
              <Numeric label="距墙起点（中心）" value={selectedDoor.offset} min={0} max={10000} onChange={v => updateDoor({ offset: v })} />
              {selectedDoor.type === 'sliding' ? <>
                <label className="text-field door-style-field"><span>推拉形式</span><select aria-label="推拉形式" value={selectedDoor.slidingStyle ?? 'bypass'} onChange={e => updateDoor({ slidingStyle: e.target.value as 'single' | 'bypass' })}><option value="bypass">双扇错叠 · 最多打开一半</option><option value="single">单扇沿墙 · 可全部打开</option></select></label>
                <div className="section-heading"><h4>门扇滑向</h4><span>与画布箭头一致</span></div>
                <div className="door-segmented" role="group" aria-label="门扇滑向"><button aria-pressed={selectedDoor.slideDirection === 'start'} onClick={() => updateDoor({ slideDirection: 'start' })}>{slideDirectionLabel(plan.walls.find(w => w.id === selectedDoor.wallId)!, true)}</button><button aria-pressed={selectedDoor.slideDirection !== 'start'} onClick={() => updateDoor({ slideDirection: 'end' })}>{slideDirectionLabel(plan.walls.find(w => w.id === selectedDoor.wallId)!, false)}</button></div>
                <div className="two-fields"><Numeric label="开启程度" value={selectedDoor.opening ?? 100} min={0} max={100} suffix="%" onChange={v => updateDoor({ opening: v })} /><Numeric label="门扇厚度" value={selectedDoor.panelThickness ?? 4} min={1} max={20} onChange={v => updateDoor({ panelThickness: v })} /></div>
                <input className="door-opening-slider" aria-label="拖动调整开启程度" type="range" min={0} max={100} step={5} value={selectedDoor.opening ?? 100} onPointerDown={e => { checkpoint(); slidingGesture.current = true; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerUp={() => { slidingGesture.current = false }} onPointerCancel={() => { slidingGesture.current = false }} onChange={e => updateDoor({ opening: Number(e.target.value) }, !slidingGesture.current)} />
                <div className="door-presets"><button onClick={() => updateDoor({ opening: 0 })}>关闭</button><button onClick={() => updateDoor({ opening: 50 })}>半开</button><button onClick={() => updateDoor({ opening: 100 })}>全开</button></div>
                <div className="door-passage" role="status"><span>当前可通行净宽</span><strong>{Number(doorPassage(selectedDoor).width.toFixed(1))}<small> cm</small></strong></div>
                <button className="secondary-button full-width" onClick={() => updateDoor({ flip: !selectedDoor.flip })}><RotateCw size={15} />切换轨道所在墙侧</button>
              </> : <SwingDoorSettings door={selectedDoor} wall={plan.walls.find(w => w.id === selectedDoor.wallId)!} onChange={updateDoor} />}
            </div>
            <div className="info-box"><Info size={16} /><p>{selectedDoor.type === 'sliding' ? '绿色虚线是可通行开口。双扇错叠全开时净宽为总宽的一半；单扇沿墙需预留门扇停靠空间。检测包含当前门扇位置，未模拟推门动作和门框五金余量。' : '请填写实际可通过的净尺寸。搬运检测同时检查门宽与高度；平开门的门扇暂未作为障碍物。'}</p></div>
            <button className="delete-button" onClick={remove}><Trash2 size={15} />删除{selectedDoor.type === 'sliding' ? '推拉门' : '门洞'}</button>
          </> : selectedWall ? <><div className="simple-selected"><Ruler size={28} /><h3>墙体</h3><p>拖动墙体整体移动，门随墙移动；也可输入尺寸和端点坐标。</p></div><div className="property-section"><Numeric label="墙体长度" value={distance(selectedWall.a, selectedWall.b)} min={20} max={5000} onChange={v => {
              const len = distance(selectedWall.a, selectedWall.b)
              if (plan.doors.some(d => d.wallId === selectedWall.id && d.offset + d.width / 2 > v)) { setToast('缩短后门洞会超出墙体，请先调整门洞'); return }
              const b = { x: selectedWall.a.x + (selectedWall.b.x - selectedWall.a.x) * v / len, y: selectedWall.a.y + (selectedWall.b.y - selectedWall.a.y) * v / len }
              updateWall({ b })
            }} /><Numeric label="墙体厚度" value={selectedWall.thickness} min={1} max={100} onChange={v => updateWall({ thickness: v })} /><div className="section-heading"><h4>端点坐标</h4><span>厘米 cm</span></div><div className="two-fields"><Numeric label="起点 X" value={selectedWall.a.x} min={-10000} max={10000} onChange={v => updateWall({ a: { ...selectedWall.a, x: v } })} /><Numeric label="起点 Y" value={selectedWall.a.y} min={-10000} max={10000} onChange={v => updateWall({ a: { ...selectedWall.a, y: v } })} /></div><div className="two-fields"><Numeric label="终点 X" value={selectedWall.b.x} min={-10000} max={10000} onChange={v => updateWall({ b: { ...selectedWall.b, x: v } })} /><Numeric label="终点 Y" value={selectedWall.b.y} min={-10000} max={10000} onChange={v => updateWall({ b: { ...selectedWall.b, y: v } })} /></div><button className="secondary-button full-width" onClick={() => { setTool('door'); setToast('点击这面墙上的位置添加门洞') }}><DoorOpen size={16} />在墙体上添加门洞</button></div><div className="info-box"><Info size={16} /><p>墙体长度按中心线计算。修改端点后，相连墙体与房间区域标注需手动调整。</p></div><button className="delete-button" onClick={remove}><Trash2 size={15} />删除墙体及其门洞</button></> : selectedRoom ? <><div className="simple-selected"><LayoutTemplate size={28} /><h3>{selectedRoom.name}</h3><p>房间区域用于地面与面积标注。</p></div><div className="property-section"><label className="text-field"><span>房间名称</span><input aria-label="房间名称" maxLength={100} value={selectedRoom.name} onChange={e => setPlan(p => ({ ...p, rooms: p.rooms.map(r => r.id === selectedRoom.id ? { ...r, name: e.target.value } : r) }))} /></label><div className="room-dimensions"><span>{selectedRoom.width} × {selectedRoom.depth}<small> cm</small></span><strong>{(selectedRoom.width * selectedRoom.depth / 10000).toFixed(1)} m²</strong></div><label className="room-color">地面颜色<input aria-label="地面颜色" type="color" value={selectedRoom.color} onChange={e => setPlan(p => ({ ...p, rooms: p.rooms.map(r => r.id === selectedRoom.id ? { ...r, color: e.target.value } : r) }))} /></label></div><div className="info-box"><Info size={16} /><p>面积按绘制区域计算，未扣墙体。选择墙体可修改长度或添加门洞；删除区域标注会保留墙体。</p></div><button className="delete-button" onClick={remove}><Trash2 size={15} />删除房间标注</button></> : <div className="inspector-empty"><div><MousePointer2 size={31} strokeWidth={1.3} /></div><h3>把想法放进空间</h3><p>在画布中选择家具、墙体或门洞，查看和调整它们的参数。</p><ol><li><span>1</span>绘制房间与墙体</li><li><span>2</span>按实际尺寸摆放家具</li><li><span>3</span>试搬，找到合适的路线</li></ol><button className="secondary-button" onClick={() => setModal('help')}>查看操作指南<ArrowRight size={15} /></button></div>}
        </div>
        {selected && !locked && <div className="inspector-primary-action"><button className="primary-button" onClick={startSimulation}><Play size={14} />开始搬运试验<ArrowRight size={15} /></button></div>}
        <div className="property-footer"><ShieldCheck size={14} /><span>方案保存在当前浏览器 · 建议导出备份</span></div>
      </aside>
    </main>
    <footer className="status-bar"><span><span className="live-dot" />本地工作空间</span><i /><span>{plan.rooms.length} 个房间</span><span>{totalArea.toFixed(1)} m² <em>标注面积</em></span><i /><span><Box size={13} />{plan.items.length} 件物品</span><span className={`global-collision ${hits ? 'warning-color' : ''}`}>{hits ? <TriangleAlert size={13} /> : <ShieldCheck size={13} />}{hits ? `${hits} 件物品存在碰撞` : '布局无碰撞'}</span><span className="status-right">先想好，再安放。<span className="version">v0.1</span></span></footer>
    {toast && <div className="toast" role="status"><Info size={17} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={15} /></button></div>}
    {modal && <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}><div ref={modalRef} className={`modal ${modal === 'help' ? 'help-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" aria-label="关闭对话框" onClick={() => setModal(null)}><X size={20} /></button>
      {modal === 'orientation' ? <OrientationSettings angle={plan.northAngle ?? 0} locked={plan.orientationLocked ?? true} onCancel={() => setModal(null)} onApply={(northAngle, orientationLocked) => { if (!locked && (northAngle !== (plan.northAngle ?? 0) || orientationLocked !== (plan.orientationLocked ?? true))) setPlan(p => ({ ...p, northAngle, orientationLocked })); setModal(null) }} /> : modal === 'custom' ? <><div className="modal-symbol"><Package size={27} /></div><h2 id="modal-title">每件物品，都有自己的位置</h2><p className="modal-description">输入真实尺寸，在搬进家之前先试着摆一摆。</p><label className="text-field"><span>物件名称</span><input autoFocus aria-label="自定义物件名称" maxLength={100} value={custom.name} onChange={e => setCustom(v => ({ ...v, name: e.target.value }))} /></label><div className="custom-dimensions">{[{ key: 'width', label: '长度' }, { key: 'depth', label: '宽度' }, { key: 'height', label: '高度' }].map(f => <label className="number-field" key={f.key}><span>{f.label}</span><div><input aria-label={`自定义${f.label}`} type="number" min={f.key === 'height' ? 1 : 5} max={f.key === 'height' ? 1000 : 2000} value={custom[f.key as 'width' | 'depth' | 'height']} onChange={e => setCustom(v => ({ ...v, [f.key]: e.target.value }))} /><em>cm</em></div></label>)}</div><label className="room-color">物件颜色<input type="color" aria-label="自定义物件颜色" value={custom.color} onChange={e => setCustom(v => ({ ...v, color: e.target.value }))} /></label>{customError && <p role="alert" className="form-error">{customError}</p>}<div className="modal-note"><Info size={15} /><p>物件以矩形占地轮廓显示，高度用于检查门洞净高。</p></div><button className="primary-button full-width" onClick={createCustom}><Plus size={16} />添加到画布</button></> : modal === 'new' ? <><div className="modal-symbol"><House size={28} /></div><h2 id="modal-title">开始一个新的空间</h2><p className="modal-description">当前方案会被替换，可使用撤销恢复。需要长期保留时，请先导出。</p><button className="new-plan-option" onClick={() => { setPlan(emptyPlan()); setSelection(null); setModal(null); setTool('room'); setFitKey(v => v + 1) }}><FilePlus2 size={26} /><span><strong>从空白开始</strong><small>亲手绘制房间、墙体与门洞</small></span><ArrowRight size={18} /></button><button className="new-plan-option" onClick={() => { setPlan(initialPlan()); setSelection({ type: 'item', id: 'sofa' }); setModal(null); setTool('select'); setFitKey(v => v + 1) }}><LayoutTemplate size={26} /><span><strong>使用示例户型</strong><small>一间客厅、一间卧室、一间书房</small></span><ArrowRight size={18} /></button><button className="text-button" onClick={exportJson}><ArrowDownToLine size={14} />先导出当前方案</button></> : <><div className="modal-symbol"><Sparkles size={28} /></div><h2 id="modal-title">在屏幕里，先把家安顿好</h2><p className="modal-description">所有尺寸以厘米为单位，画布按比例显示。</p><div className="help-steps"><div><span>01</span><h3>画出你的空间</h3><p>绘制房间（B）会自动创建四面墙。绘制墙体（W）默认水平或垂直，按住 Shift 可画斜墙。选中墙体能输入精确长度。</p></div><div><span>02</span><h3>给每件家具真实的尺寸</h3><p>从家具库添加，或创建自定义物件。选中物件后修改长宽高。在空白处按住拖动可框选多件，Shift 点击可增减选择，拖动其中一件即可一起移动。方向键微调 1 cm，Shift + 方向键微调 10 cm。</p></div><div><span>03</span><h3>试一条真实的搬运路线</h3><p>用门洞（D）或推拉门（S）工具在墙体上开门，设置尺寸与开度。已有门洞也可切换为推拉门。选中家具开始搬运，Q / E 每次旋转 15°，碰到障碍会停下。</p></div></div><div className="modal-note"><Info size={17} /><p>试验采用直立矩形外轮廓与门洞净高，仅验证手动走过的路径。已检测推拉门当前门扇位置；未模拟倾斜、抬起、拆卸、平开门扇和搬运人员；实际搬运还应核实这些条件。</p></div><div className="shortcut-list"><span><kbd>Ctrl Z</kbd>撤销</span><span><kbd>Ctrl D</kbd>复制物件</span><span><kbd>Delete</kbd>删除</span><span><kbd>Ctrl S</kbd>导出方案</span></div><button className="primary-button full-width" onClick={() => setModal(null)}>开始规划<ArrowRight size={15} /></button></>}
    </div></div>}
  </div>
}

export default App
