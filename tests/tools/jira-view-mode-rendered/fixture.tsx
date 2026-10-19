import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '../../../src/renderer/src/components/ui/tooltip'
import { TaskPageJiraViewControls } from '../../../src/renderer/src/components/task-page-jira-view-controls'
import { TaskPageJiraBoard } from '../../../src/renderer/src/components/task-page-jira-board'
import { TaskPageJiraIssueList } from '../../../src/renderer/src/components/task-page-jira-issue-list'
import { getJiraStatusTone } from '../../../src/renderer/src/components/task-page-jira-status-tone'
import {
  defaultJiraListColumnIds,
  jiraListGridStyle,
  visibleJiraListColumns
} from '../../../src/renderer/src/components/jira-list-columns'
import {
  loadJiraViewMode,
  saveJiraViewMode,
  type JiraViewMode
} from '../../../src/renderer/src/components/jira-view-mode-storage'
import type { JiraIssue, JiraProjectStatusOrder, JiraStatus } from '../../../src/shared/jira-types'
import './fixture.css'

const baseline = new URLSearchParams(window.location.search).get('baseline') === '1'

const statusOrder: JiraProjectStatusOrder = {
  statusIdsByColumn: [['10001'], ['10002'], ['10003']],
  columns: [
    { name: 'To Do', statusIds: ['10001'] },
    { name: 'In Progress', statusIds: ['10002'] },
    { name: 'Done', statusIds: ['10003'] }
  ]
}

const statuses = {
  todo: { id: '10001', name: 'To Do', categoryKey: 'new', categoryName: 'To Do' },
  doing: {
    id: '10002',
    name: 'In Progress',
    categoryKey: 'indeterminate',
    categoryName: 'In Progress'
  },
  done: { id: '10003', name: 'Done', categoryKey: 'done', categoryName: 'Done' }
}

// Invented sample data. No real site, project, person, or issue appears here.
function sampleIssue(
  key: string,
  title: string,
  status: JiraStatus,
  priority: string,
  updated: string
): JiraIssue {
  return {
    id: `id-${key}`,
    key,
    title,
    url: `https://example.invalid/browse/${key}`,
    project: { id: 'p1', key: 'DEMO', name: 'Demo' },
    issueType: { id: 't1', name: 'Task' },
    status,
    labels: [],
    priority: { id: `pr-${priority}`, name: priority },
    assignee: { accountId: 'a1', displayName: 'Sample User' },
    updatedAt: updated,
    createdAt: updated
  }
}

const issues: JiraIssue[] = [
  sampleIssue(
    'DEMO-104',
    'Paginate the export history table',
    statuses.doing,
    'High',
    '3 hours ago'
  ),
  sampleIssue(
    'DEMO-101',
    'Cache the colour palette between launches',
    statuses.doing,
    'Medium',
    '1 day ago'
  ),
  sampleIssue('DEMO-112', 'Retry the webhook delivery once', statuses.todo, 'Medium', '2 days ago'),
  sampleIssue('DEMO-108', 'Document the import file format', statuses.todo, 'Low', '3 days ago'),
  sampleIssue('DEMO-97', 'Trim trailing spaces from tag names', statuses.todo, 'Low', '4 days ago'),
  sampleIssue('DEMO-93', 'Collapse duplicate toast messages', statuses.done, 'Medium', '6 days ago')
]

const columns = visibleJiraListColumns(defaultJiraListColumnIds())
// Fixed strings keep the captures reproducible; relative time is not what this proves.
const formatUpdatedAt = (updatedAt: string): string => updatedAt

function JiraPanel(): React.JSX.Element {
  // Baseline reproduces the old plain component state, which a remount reset to List.
  const [mode, setModeState] = useState<JiraViewMode>(baseline ? 'list' : loadJiraViewMode)
  const setMode = useCallback((next: JiraViewMode) => {
    setModeState(next)
    if (!baseline) {
      saveJiraViewMode(next)
    }
  }, [])

  return (
    <div
      style={jiraListGridStyle(columns)}
      className="@container flex max-h-[520px] min-h-0 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm"
    >
      <div className="flex min-h-10 flex-none flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/35 px-3 py-1">
        <div className="min-w-0 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Jira issues
        </div>
        <TaskPageJiraViewControls
          mode={mode}
          onModeChange={setMode}
          currentSprint={false}
          onCurrentSprintChange={() => {}}
        />
        <div className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground">
          <span>{issues.length} shown</span>
        </div>
      </div>
      <div
        data-testid="jira-view"
        data-mode={mode}
        className="min-h-0 flex-1 overflow-auto scrollbar-sleek"
      >
        {mode === 'board' ? (
          <TaskPageJiraBoard
            formatUpdatedAt={formatUpdatedAt}
            getStatusTone={getJiraStatusTone}
            issues={issues}
            onMoveIssue={async () => {}}
            onOpenIssue={() => {}}
            onStartWorkspace={() => {}}
            selectedIssue={null}
            showSiteContext={false}
            statusOrder={statusOrder}
            updatingIssueKeys={new Set()}
          />
        ) : (
          <TaskPageJiraIssueList
            columns={columns}
            formatUpdatedAt={formatUpdatedAt}
            getStatusTone={getJiraStatusTone}
            issues={issues}
            onOpenIssue={() => {}}
            onStartWorkspace={() => {}}
            selectedIssue={null}
            showSiteContext={false}
            statusOrder={statusOrder}
          />
        )}
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  // Remounting the panel is what visiting an agent and returning to Tasks does.
  const [visit, setVisit] = useState(0)
  return (
    <TooltipProvider>
      <main className="space-y-3 bg-background p-6 text-foreground">
        <button
          type="button"
          className="rounded-md border border-border/50 px-3 py-1.5 text-xs"
          onClick={() => setVisit((value) => value + 1)}
        >
          Leave Tasks and come back
        </button>
        <JiraPanel key={visit} />
      </main>
    </TooltipProvider>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<App />)
}
