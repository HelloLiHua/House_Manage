import { useRef, useState } from 'react'
import { initialPlan, parsePlan, type Plan } from './model'

export const STORAGE_KEY = 'roomly.plan.v1'
export function usePlan() {
  const [state, setState] = useState(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); return { plan: saved ? parsePlan(saved) : initialPlan(), error: '' } }
    catch { return { plan: initialPlan(), error: '本地方案无法读取，已显示示例。请重新导入备份；编辑后将覆盖本地数据。' } }
  })
  const current = useRef(state.plan)
  const past = useRef<Plan[]>([]), future = useRef<Plan[]>([])
  const [revision, setRevision] = useState(0)
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false })
  function syncHistory() { setHistoryStatus({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 }) }
  function setPlan(next: Plan | ((p: Plan) => Plan), record = true) {
    const p = typeof next === 'function' ? next(current.current) : next
    if (p === current.current) return
    if (record) { past.current = [...past.current.slice(-79), current.current]; future.current = [] }
    current.current = p
    setState(s => ({ ...s, plan: p }))
    setRevision(v => v + 1)
    syncHistory()
  }
  function checkpoint() { past.current = [...past.current.slice(-79), current.current]; future.current = []; syncHistory() }
  function undo() {
    const p = past.current.pop(); if (!p) return
    future.current.push(current.current); current.current = p; setState(s => ({ ...s, plan: p })); setRevision(v => v + 1)
    syncHistory()
  }
  function redo() {
    const p = future.current.pop(); if (!p) return
    past.current.push(current.current); current.current = p; setState(s => ({ ...s, plan: p })); setRevision(v => v + 1)
    syncHistory()
  }
  return { plan: state.plan, initialError: state.error, current, setPlan, checkpoint, undo, redo, ...historyStatus, revision }
}
