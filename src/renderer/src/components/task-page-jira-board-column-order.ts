import type { TaskPageJiraBoardSection } from './task-page-jira-board-sections'

// Device-local, like the Jira list columns: Jira's Agile API exposes board column
// order as read-only, so a reorder here is an Orca view preference, not a Jira edit.
const STORAGE_KEY = 'orca.jira.board-column-order.v1'
// Each Jira project reached from this device keeps its own lane order; cap the record
// so a long tail of one-off project scopes cannot grow the key without bound.
const MAX_SCOPES = 20

type StoredOrders = Record<string, string[]>

function readStoredOrders(): StoredOrders {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const orders: StoredOrders = {}
    for (const [scopeKey, keys] of Object.entries(parsed)) {
      if (Array.isArray(keys)) {
        orders[scopeKey] = keys.filter((key): key is string => typeof key === 'string')
      }
    }
    return orders
  } catch {
    return {}
  }
}

export function loadJiraBoardColumnOrder(scopeKey: string): string[] {
  return readStoredOrders()[scopeKey] ?? []
}

export function saveJiraBoardColumnOrder(scopeKey: string, keys: readonly string[]): void {
  try {
    const { [scopeKey]: _previous, ...others } = readStoredOrders()
    // Re-inserting last makes the record's own key order a least-recently-used list.
    const entries = Object.entries(others).slice(-(MAX_SCOPES - 1))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...Object.fromEntries(entries), [scopeKey]: [...keys] })
    )
  } catch {
    // The live board stays usable when browser storage is unavailable or full.
  }
}

/**
 * Sorts sections by a saved lane order. A column the saved order has never seen,
 * such as one added in Jira since, stays next to the neighbour Jira put it after.
 */
export function applyJiraBoardColumnOrder(
  sections: readonly TaskPageJiraBoardSection[],
  order: readonly string[]
): TaskPageJiraBoardSection[] {
  if (order.length === 0) {
    return [...sections]
  }
  const ranks = new Map(order.map((key, index) => [key, index]))
  let previousRank = -1
  const ranked = sections.map((section, index) => {
    const saved = ranks.get(section.key)
    if (saved !== undefined) {
      previousRank = saved
      return { section, rank: saved, unsaved: 0, index }
    }
    return { section, rank: previousRank, unsaved: 1, index }
  })
  return ranked
    .sort((a, b) => a.rank - b.rank || a.unsaved - b.unsaved || a.index - b.index)
    .map((entry) => entry.section)
}

/** Returns the full lane order with `movedKey` placed where `targetKey` sits. */
export function moveJiraBoardColumn(
  keys: readonly string[],
  movedKey: string,
  targetKey: string
): string[] {
  const from = keys.indexOf(movedKey)
  const to = keys.indexOf(targetKey)
  if (from === -1 || to === -1 || from === to) {
    return [...keys]
  }
  const next = [...keys]
  next.splice(from, 1)
  next.splice(to, 0, movedKey)
  return next
}
