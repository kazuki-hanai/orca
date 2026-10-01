/** Jira rejects summaries longer than 255 characters. */
export const JIRA_ISSUE_SUMMARY_MAX_LENGTH = 255

export type JiraIssueSummaryGenerationContext = {
  /** The issue description drafted in the create dialog. */
  description: string
  projectName?: string
  issueTypeName?: string
}

export type JiraIssueSummaryGenerationResult =
  | { success: true; summary: string; agentLabel?: string }
  | { success: false; error: string; canceled?: boolean }

/**
 * Build the text-generation prompt that asks the configured agent to title a
 * Jira issue. Kept in shared so the host and tests agree on the contract.
 */
export function buildJiraIssueSummaryPrompt(context: JiraIssueSummaryGenerationContext): string {
  const sections: string[] = [
    'Generate a concise Jira issue summary (title) for the issue described below.',
    'Output ONLY the summary on a single line, nothing else — no quotes, no markdown, no trailing period.',
    'Write the summary in the same language as the description.',
    ''
  ]
  if (context.projectName?.trim()) {
    sections.push(`Project: ${context.projectName.trim()}`)
  }
  if (context.issueTypeName?.trim()) {
    sections.push(`Issue type: ${context.issueTypeName.trim()}`)
  }
  sections.push('Description:', context.description.trim())
  return sections.join('\n')
}

/**
 * Turn raw model output into a usable single-line summary. Returns '' when
 * nothing usable remains, which callers treat as a failed generation.
 */
export function sanitizeGeneratedJiraIssueSummary(raw: string): string {
  const line = raw
    .split('\n')
    .map((candidate) => candidate.trim())
    .find(Boolean)
  if (!line) {
    return ''
  }
  const cleaned = line
    .replace(/^#+\s*/, '')
    .replace(/^["'`“”「»]+|["'`“”」«]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, JIRA_ISSUE_SUMMARY_MAX_LENGTH).trim()
}
