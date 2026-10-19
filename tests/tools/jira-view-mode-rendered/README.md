# Jira Tasks view mode survives leaving the page

Run `ORCA_BACKGROUND_LAUNCH=1 node tests/tools/jira-view-mode-rendered/run.mjs`.
Add `ORCA_JIRA_VIEW_MODE_BASELINE=1` for the before proof, which reproduces the old
plain component state instead of reading the stored preference.

Uses the production `TaskPageJiraViewControls`, `TaskPageJiraBoard`,
`TaskPageJiraIssueList`, and the view-mode storage module in a hidden Electron
renderer with the canonical CSS. All windows stay invisible and unfocused. No
dependency install is needed.

The probe switches to Board, remounts the panel the way returning to Tasks does,
and captures the result over CDP. Before stays on Board only until the remount and
then falls back to List; after reopens on Board. Reports and screenshots are local
under `.bench-fixtures/jira-view-mode-*`.

Issues, project, statuses, and the user are invented; no Jira site is contacted and
no real issue data appears. Relative times are fixed strings so captures reproduce.
This renders the panel only: it does not exercise Jira fetching, the surrounding
Tasks page routing, or a real navigation between pages.
