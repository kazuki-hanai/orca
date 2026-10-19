// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadJiraViewMode, saveJiraViewMode } from './jira-view-mode-storage'

const STORAGE_KEY = 'orca.jira.view-mode.v1'

describe('Jira view mode local storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to the list view when nothing is stored', () => {
    expect(loadJiraViewMode()).toBe('list')
  })

  it('round-trips the board view', () => {
    saveJiraViewMode('board')

    expect(loadJiraViewMode()).toBe('board')
  })

  it('clears the key when the view returns to the default', () => {
    saveJiraViewMode('board')

    saveJiraViewMode('list')

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadJiraViewMode()).toBe('list')
  })

  it('falls back to the list view when the stored value is unrecognised', () => {
    localStorage.setItem(STORAGE_KEY, 'kanban')

    expect(loadJiraViewMode()).toBe('list')
  })
})
