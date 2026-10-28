import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { createDocxPreviewFixture } from './helpers/docx-preview-fixture'

const FRAME = 'iframe[name^="orca-docx-preview:"]'

test('Word documents render as pages and route links without navigating the preview', async ({
  orcaPage,
  electronApp,
  seededRepoPath,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const url = 'https://example.com/report?from=docx'
  const name = 'quarterly-report.docx'
  const filePath = path.join(seededRepoPath, name)
  writeFileSync(filePath, createDocxPreviewFixture({ linkUrl: url }))
  registerPostElectronShutdownCleanup(async () => rmSync(filePath, { force: true }))
  await orcaPage.evaluate(async () => {
    await window.__store?.getState().updateSettings({ openLinksInApp: true })
  })
  await orcaPage.evaluate(
    ({ name, filePath }) => {
      const state = window.__store?.getState()
      if (!state?.activeWorktreeId) {
        throw new Error('Missing fixture worktree')
      }
      state.openFile(
        {
          filePath,
          relativePath: name,
          worktreeId: state.activeWorktreeId,
          language: 'plaintext',
          mode: 'edit'
        },
        { preview: false }
      )
    },
    { name, filePath }
  )

  const frame = orcaPage.locator(FRAME)
  const frameState = (): Promise<{ text: string; pages: number; zoom: string; location: string }> =>
    frame.evaluate((element) => {
      const document = element instanceof HTMLIFrameElement ? element.contentDocument : null
      return {
        text: document?.body.innerText ?? '',
        pages: document?.querySelectorAll('section.docx').length ?? 0,
        zoom: document?.querySelector<HTMLElement>('.docx-wrapper')?.style.zoom ?? '',
        location: document?.location.href ?? ''
      }
    })
  await expect
    .poll(async () => (await frameState()).text, { timeout: 30_000 })
    .toContain('Quarterly report')
  const rendered = await frameState()
  expect(rendered.text).toContain('Appendix on the second page')
  expect(rendered.pages).toBe(2)
  await expect(orcaPage.getByText('Word document preview', { exact: true })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('docx-preview.png') })

  await orcaPage.getByTitle('Zoom in', { exact: true }).click()
  await expect
    .poll(async () => Number((await frameState()).zoom))
    .toBeCloseTo(Number(rendered.zoom || 1) * 1.25, 2)

  const link = await frame.evaluate((element) => {
    const anchor =
      element instanceof HTMLIFrameElement
        ? element.contentDocument?.querySelector('a[href]')
        : null
    if (!anchor) {
      throw new Error('Missing document link')
    }
    anchor.scrollIntoView({ block: 'center' })
    const frameRect = element.getBoundingClientRect()
    const rect = anchor.getBoundingClientRect()
    return {
      x: frameRect.left + rect.left + rect.width / 2,
      y: frameRect.top + rect.top + rect.height / 2,
      title: anchor.getAttribute('title')
    }
  })
  expect(link.title).toBe(url)
  const browserTabs = (): Promise<{ id: string; url: string }[]> =>
    orcaPage.evaluate(() =>
      Object.values(window.__store?.getState().browserTabsByWorktree ?? {})
        .flat()
        .map((tab) => ({ id: tab.id, url: tab.url }))
    )
  const tabsBefore = (await browserTabs()).length
  const rendererUrl = orcaPage.url()
  await orcaPage.mouse.click(link.x, link.y)
  await expect.poll(async () => (await browserTabs()).length).toBe(tabsBefore + 1)
  const opened = (await browserTabs()).at(-1)
  expect(opened?.url).toBe(url)
  await expect(orcaPage.locator(`[data-tab-id="${opened?.id}"]`)).toBeVisible()
  expect((await frameState()).location).toBe('about:srcdoc')
  expect(orcaPage.url()).toBe(rendererUrl)

  if (
    process.env.ORCA_E2E_FORCE_HEADFUL !== '1' &&
    testInfo.project.metadata.orcaHeadful !== true
  ) {
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isVisible())
      )
    ).toBe(false)
  }
})
