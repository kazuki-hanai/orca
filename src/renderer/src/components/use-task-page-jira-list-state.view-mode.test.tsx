// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskPageLinearViewStateModel } from './use-task-page-linear-view-state'
import { useTaskPageJiraListState } from './use-task-page-jira-list-state'

vi.mock('@/runtime/runtime-jira-client', () => ({
  jiraListPrioritiesForTarget: vi.fn().mockResolvedValue([]),
  jiraListPriorities: vi.fn().mockResolvedValue([])
}))

function fixture(): TaskPageLinearViewStateModel {
  const model = {
    settings: { activeRuntimeEnvironmentId: 'focus' },
    accountBackedTaskSourceHostId: 'runtime:account',
    jiraConnected: true,
    selectedJiraSiteId: 'site-1',
    taskSource: 'jira',
    repos: [],
    selectedRepos: [],
    pageData: {},
    jiraTaskSourceContext: null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This isolated hook reads only the listed pipeline fields.
  return model as unknown as TaskPageLinearViewStateModel
}

/** Leaving Tasks and coming back unmounts the hook, so a fresh render is the real test. */
function openTasks(): { current: ReturnType<typeof useTaskPageJiraListState> } {
  return renderHook(() => useTaskPageJiraListState(fixture())).result
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(cleanup)

describe('Jira Tasks view mode', () => {
  it('reopens on the board after the view mode was switched', async () => {
    const first = openTasks()
    await act(async () => first.current.setJiraViewMode('board'))
    expect(first.current.jiraViewMode).toBe('board')
    cleanup()

    expect(openTasks().current.jiraViewMode).toBe('board')
  })

  it('reopens on the list again once the view mode is switched back', async () => {
    const first = openTasks()
    await act(async () => first.current.setJiraViewMode('board'))
    await act(async () => first.current.setJiraViewMode('list'))
    cleanup()

    expect(openTasks().current.jiraViewMode).toBe('list')
  })
})
