import { useCallback, useMemo, useState } from 'react'
import {
  readJiraBoardColumnDragData,
  writeJiraBoardColumnDragData
} from '@/lib/jira-board-drag-payload'
import {
  applyJiraBoardColumnOrder,
  loadJiraBoardColumnOrder,
  moveJiraBoardColumn,
  saveJiraBoardColumnOrder
} from './task-page-jira-board-column-order'
import type { TaskPageJiraBoardSection } from './task-page-jira-board-sections'

export type JiraBoardColumnOrderModel = {
  /** Board sections in the saved lane order. */
  sections: TaskPageJiraBoardSection[]
  draggingColumnKey: string | null
  dragOverColumnKey: string | null
  onColumnDragStart: (key: string, event: React.DragEvent<HTMLElement>) => void
  onColumnDragEnd: () => void
  /** Each returns true when a lane drag consumed the event, so card handling can stay untouched. */
  onColumnDragOver: (key: string, event: React.DragEvent<HTMLElement>) => boolean
  onColumnDrop: (key: string, event: React.DragEvent<HTMLElement>) => boolean
  moveColumnBy: (key: string, offset: number) => void
}

export function useJiraBoardColumnOrder(
  boardSections: readonly TaskPageJiraBoardSection[],
  scopeKey: string
): JiraBoardColumnOrderModel {
  const [order, setOrder] = useState(() => loadJiraBoardColumnOrder(scopeKey))
  const [loadedScopeKey, setLoadedScopeKey] = useState(scopeKey)
  if (loadedScopeKey !== scopeKey) {
    // Another project's board: adopt its own saved order rather than this one's.
    setLoadedScopeKey(scopeKey)
    setOrder(loadJiraBoardColumnOrder(scopeKey))
  }
  const [draggingColumnKey, setDraggingColumnKey] = useState<string | null>(null)
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null)

  const sections = useMemo(
    () => applyJiraBoardColumnOrder(boardSections, order),
    [boardSections, order]
  )

  const move = useCallback(
    (movedKey: string, targetKey: string) => {
      if (movedKey === targetKey) {
        return
      }
      const next = moveJiraBoardColumn(
        sections.map((section) => section.key),
        movedKey,
        targetKey
      )
      saveJiraBoardColumnOrder(scopeKey, next)
      setOrder(next)
    },
    [scopeKey, sections]
  )

  const onColumnDragStart = useCallback((key: string, event: React.DragEvent<HTMLElement>) => {
    if (!writeJiraBoardColumnDragData(event.dataTransfer, key)) {
      event.preventDefault()
      return
    }
    event.stopPropagation()
    setDraggingColumnKey(key)
  }, [])

  const onColumnDragEnd = useCallback(() => {
    setDraggingColumnKey(null)
    setDragOverColumnKey(null)
  }, [])

  const onColumnDragOver = useCallback(
    (key: string, event: React.DragEvent<HTMLElement>): boolean => {
      if (!draggingColumnKey) {
        return false
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDragOverColumnKey(key)
      return true
    },
    [draggingColumnKey]
  )

  const onColumnDrop = useCallback(
    (key: string, event: React.DragEvent<HTMLElement>): boolean => {
      const payload = readJiraBoardColumnDragData(event.dataTransfer)
      // Electron hides getData during a drag, so fall back to the key we started with.
      const movedKey = payload.status === 'column' ? payload.key : draggingColumnKey
      if (!movedKey || (payload.status === 'missing' && !draggingColumnKey)) {
        return false
      }
      event.preventDefault()
      event.stopPropagation()
      setDraggingColumnKey(null)
      setDragOverColumnKey(null)
      move(movedKey, key)
      return true
    },
    [draggingColumnKey, move]
  )

  const moveColumnBy = useCallback(
    (key: string, offset: number) => {
      const index = sections.findIndex((section) => section.key === key)
      const target = index === -1 ? undefined : sections[index + offset]
      if (target) {
        move(key, target.key)
      }
    },
    [move, sections]
  )

  return {
    sections,
    draggingColumnKey,
    dragOverColumnKey,
    onColumnDragStart,
    onColumnDragEnd,
    onColumnDragOver,
    onColumnDrop,
    moveColumnBy
  }
}
