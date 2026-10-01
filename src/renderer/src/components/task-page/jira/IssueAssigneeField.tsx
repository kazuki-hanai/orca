import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { getJiraSelfUser } from '@/components/jira-self-user'
import { JiraUserPicker, type JiraUserPickerFixedOption } from '@/components/jira-user-picker'
import { translate } from '@/i18n/i18n'

/**
 * Assignee picker of the new-issue dialog: Automatic (Jira's project default),
 * one-click "Assign to me", or any searched user.
 */
export function TaskPageJiraIssueAssigneeField({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element {
  const {
    settings,
    jiraTaskSourceContext,
    jiraStatus,
    newJiraIssueTargetProject,
    newJiraIssueAssignee,
    setNewJiraIssueAssignee,
    newJiraIssueSubmitting
  } = model
  const selfUser = getJiraSelfUser(jiraStatus, newJiraIssueTargetProject?.siteId ?? null)
  const assigneeLabel = translate(
    'auto.components.task.page.jira.IssueAssigneeField.9f36a855a2',
    'Assignee'
  )
  const automaticLabel = translate(
    'auto.components.task.page.jira.IssueAssigneeField.3a45582d68',
    'Automatic'
  )
  const fixedOptions: JiraUserPickerFixedOption[] = [
    {
      key: 'automatic',
      label: automaticLabel,
      onSelect: () => setNewJiraIssueAssignee(null)
    },
    ...(selfUser
      ? [
          {
            key: 'self',
            label: translate(
              'auto.components.task.page.jira.IssueAssigneeField.b2693ea957',
              'Assign to me ({{value0}})',
              { value0: selfUser.displayName }
            ),
            onSelect: () => setNewJiraIssueAssignee(selfUser)
          }
        ]
      : [])
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1">
        <label className="text-[11px] font-medium text-muted-foreground">{assigneeLabel}</label>
        <JiraUserPicker
          providerSettings={jiraTaskSourceContext ?? settings}
          siteId={newJiraIssueTargetProject?.siteId ?? undefined}
          value={newJiraIssueAssignee ? newJiraIssueAssignee.accountId : automaticLabel}
          selectedUser={newJiraIssueAssignee}
          onSelect={(user) => setNewJiraIssueAssignee(user)}
          disabled={newJiraIssueSubmitting}
          label={assigneeLabel}
          fixedOptions={fixedOptions}
        />
      </div>
    </div>
  )
}
