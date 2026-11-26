import type { Plan } from './model'

export type Selection = { type: 'item' | 'wall' | 'door' | 'window' | 'room'; id: string }
  | { type: 'items'; ids: string[]; id?: never } | null

export function itemIds(selection: Selection): string[] {
  return selection?.type === 'item' ? [selection.id] : selection?.type === 'items' ? selection.ids : []
}

export function selectItems(ids: string[]): Selection {
  const unique = [...new Set(ids)]
  return unique.length === 0 ? null : unique.length === 1 ? { type: 'item', id: unique[0] } : { type: 'items', ids: unique }
}

export function toggleItem(selection: Selection, id: string): Selection {
  const ids = itemIds(selection)
  return selectItems(ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id])
}

export function validSelection(selection: Selection, plan: Plan): Selection {
  if (!selection) return null
  if (selection.type === 'items') {
    const ids = selection.ids.filter(id => plan.items.some(item => item.id === id))
    return ids.length === selection.ids.length && ids.length > 1 ? selection : selectItems(ids)
  }
  const entries = selection.type === 'item' ? plan.items : selection.type === 'wall' ? plan.walls : selection.type === 'door' ? plan.doors : selection.type === 'window' ? plan.windows ?? [] : plan.rooms
  return entries.some(entry => entry.id === selection.id) ? selection : null
}
