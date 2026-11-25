import { useRef, useState } from 'react'
import type { PointerEvent, KeyboardEvent } from 'react'
import CompassRose from './CompassRose'

type Props = {
  angle: number; locked: boolean; disabled?: boolean; className?: string; testId?: string;
  onChange: (angle: number) => void; onOpen?: () => void;
}
const normalize = (angle: number) => ((Math.round(angle * 10) % 3600) + 3600) % 3600 / 10

export default function CompassDial({ angle, locked, disabled = false, className = '', testId, onChange, onOpen }: Props) {
  const [preview, setPreview] = useState<number | null>(null)
  const gesture = useRef<{ id: number; x: number; y: number; cx: number; cy: number; start: number; angle: number; next: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const shown = preview ?? angle
  function start(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || !e.isPrimary || gesture.current) return
    const box = e.currentTarget.querySelector('svg')!.getBoundingClientRect()
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    suppressClick.current = false
    // The center has no reliable angle. A click there still opens the settings.
    if (Math.hypot(e.clientX - cx, e.clientY - cy) < 8) return
    e.stopPropagation()
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cx, cy, start: Math.atan2(e.clientY - cy, e.clientX - cx), angle, next: angle, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    e.stopPropagation()
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 3) g.moved = true
    if (!g.moved || locked || disabled || Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 8) return
    g.next = normalize(g.angle + (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) - g.start) * 180 / Math.PI)
    setPreview(g.next)
  }
  function finish(e: PointerEvent<HTMLButtonElement>, cancel = false) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null; suppressClick.current = g.moved || cancel; setPreview(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!cancel && g.moved && !locked && !disabled && g.next !== angle) onChange(g.next)
  }
  function keyboard(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape' && gesture.current) {
      const g = gesture.current
      gesture.current = null; suppressClick.current = true; setPreview(null)
      if (e.currentTarget.hasPointerCapture(g.id)) e.currentTarget.releasePointerCapture(g.id)
      e.preventDefault(); e.stopPropagation(); return
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return
    e.preventDefault(); e.stopPropagation()
    if (locked || disabled || gesture.current) return
    const step = e.shiftKey ? 15 : 1
    onChange(e.key === 'Home' ? 0 : normalize(angle + (['ArrowLeft', 'ArrowDown'].includes(e.key) ? -step : step)))
  }
  return <button type="button" className={`compass-dial ${locked ? 'is-locked' : 'is-editable'} ${preview !== null ? 'is-dragging' : ''} ${className}`} data-testid={testId} disabled={disabled}
    aria-label={onOpen ? '设置房屋朝向' : '旋转房屋朝向'} aria-description={locked ? '朝向已锁定，打开自由调整后可旋转。' : '拖动旋转；方向键微调 1 度，按住 Shift 微调 15 度。'}
    title={disabled ? '结束搬运试验后可修改朝向' : locked ? '朝向已锁定 · 点击设置' : '拖动指南针调整方向 · 点击输入角度'}
    onPointerDown={start} onPointerMove={move} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)} onLostPointerCapture={e => finish(e, true)}
    onKeyDown={keyboard} onClick={e => { if (suppressClick.current && e.detail !== 0) { suppressClick.current = false; return }; onOpen?.() }}>
    <CompassRose angle={shown} /><span>{shown}° · {locked ? '已锁定' : '拖动调向'}</span>
  </button>
}
