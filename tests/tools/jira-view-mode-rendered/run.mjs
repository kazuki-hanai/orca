import { _electron as electron, expect } from '@stablyai/playwright-test'
import { build as buildMain } from 'esbuild'
import { build as buildRenderer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
if (process.env.ORCA_BACKGROUND_LAUNCH !== '1') {
  throw new Error('Requires ORCA_BACKGROUND_LAUNCH=1')
}
const root = fileURLToPath(new URL('../../../', import.meta.url))
const parent = path.join(root, '.bench-fixtures')
mkdirSync(parent, { recursive: true })
const output = mkdtempSync(path.join(parent, 'jira-view-mode-'))
const main = path.join(output, 'main.cjs')
await buildMain({
  entryPoints: [path.join(root, 'tests/tools/benchmarks/spinner-rendering/main.ts')],
  outfile: main,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron']
})
await buildRenderer({
  configFile: false,
  root: import.meta.dirname,
  base: './',
  logLevel: 'silent',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(root, 'src/renderer/src') } },
  build: { outDir: path.join(output, 'renderer'), emptyOutDir: true }
})
const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env
const app = await electron.launch({ args: [main], env: { ...env, ORCA_BACKGROUND_LAUNCH: '1' } })
const report = {
  scope:
    'Production Jira view controls, board, list, and view-mode storage in a hidden Electron renderer with invented issues. No Jira site is contacted and no real issue data is used.'
}
try {
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error(error)
  })
  const baseline = process.env.ORCA_JIRA_VIEW_MODE_BASELINE === '1'
  const fixtureUrl = pathToFileURL(path.join(output, 'renderer/index.html'))
  if (baseline) {
    fixtureUrl.searchParams.set('baseline', '1')
  }
  await page.goto(fixtureUrl.href)
  const view = page.getByTestId('jira-view')
  await expect(view).toHaveAttribute('data-mode', 'list')
  await page.getByRole('radio', { name: 'Board' }).click()
  await expect(view).toHaveAttribute('data-mode', 'board')

  await page.getByRole('button', { name: 'Leave Tasks and come back' }).click()
  const reopened = page.getByTestId('jira-view')
  await expect(reopened).toHaveAttribute('data-mode', baseline ? 'list' : 'board')
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {}))
    )
  })
  const cdp = await page.context().newCDPSession(page)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    path.join(output, baseline ? 'before.png' : 'after.png'),
    Buffer.from(data, 'base64')
  )
  report.baseline = baseline
  report.modeAfterReopen = await reopened.getAttribute('data-mode')
  expect(errors).toEqual([])
  report.windows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      visible: window.isVisible(),
      focused: window.isFocused()
    }))
  )
  expect(report.windows.every((window) => !window.visible && !window.focused)).toBe(true)
} finally {
  writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Jira view mode evidence: ${output}`)
  await app.close()
}
