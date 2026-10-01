import { ipcMain } from 'electron'
import os from 'node:os'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '../../shared/commit-message-host-key'
import type {
  JiraIssueSummaryGenerationContext,
  JiraIssueSummaryGenerationResult
} from '../../shared/jira-issue-summary-generation'
import type { Store } from '../persistence'
import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentEnvironmentResolvers
} from '../text-generation/commit-message-agent-environment'
import { resolveTextGenerationParams } from '../text-generation/commit-message-text-generation'
import {
  cancelGenerateJiraIssueSummaryLocal,
  generateJiraIssueSummaryFromContext
} from '../text-generation/jira-issue-summary-text-generation'

/** The create dialog has no workspace, so generations run from the home directory. */
function jiraSummaryGenerationCwd(): string {
  return os.homedir()
}

export function registerJiraIssueSummaryGenerationHandlers(
  store: Store,
  commitMessageAgentEnv?: CommitMessageAgentEnvironmentResolvers
): void {
  ipcMain.handle(
    'jira:generateIssueSummary',
    async (
      _event,
      args: JiraIssueSummaryGenerationContext
    ): Promise<JiraIssueSummaryGenerationResult> => {
      if (typeof args?.description !== 'string' || !args.description.trim()) {
        return { success: false, error: 'Description is required.' }
      }
      // Why: reuses the branch-name agent/model choice — both title free-form
      // work from a short text, and it spares a separate settings surface.
      const resolved = resolveTextGenerationParams(
        store.getSettings(),
        LOCAL_COMMIT_MESSAGE_HOST_KEY,
        'branchName',
        null
      )
      if (!resolved.ok) {
        return { success: false, error: resolved.error }
      }
      const localEnv = await prepareLocalCommitMessageAgentEnv(
        resolved.params.agentId,
        commitMessageAgentEnv
      )
      if (!localEnv.ok) {
        return { success: false, error: localEnv.error }
      }
      return generateJiraIssueSummaryFromContext(
        {
          description: args.description,
          projectName: typeof args.projectName === 'string' ? args.projectName : undefined,
          issueTypeName: typeof args.issueTypeName === 'string' ? args.issueTypeName : undefined
        },
        resolved.params,
        {
          kind: 'local',
          cwd: jiraSummaryGenerationCwd(),
          ...(localEnv.env ? { env: localEnv.env } : {})
        }
      )
    }
  )

  ipcMain.handle('jira:cancelGenerateIssueSummary', () => {
    cancelGenerateJiraIssueSummaryLocal(jiraSummaryGenerationCwd())
  })
}
