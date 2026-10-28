import { parseAsync, renderDocument, type Options } from 'docx-preview'
import { replayAppKeyDown } from '@/lib/app-keyboard-router'
import { motionSafeScrollBehavior } from '@/hooks/usePrefersReducedMotion'

// Why this policy: docx-preview interpolates document strings into CSS, so the frame may load
// nothing but the inline data URLs the renderer gives its images and embedded fonts.
const FRAME_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'"

const FRAME_BASE_CSS = `
:root { color-scheme: light; }
html, body { margin: 0; background: transparent; overflow: hidden; }
body .docx-wrapper { background: transparent; padding: 16px; width: max-content; margin: 0 auto; box-sizing: border-box; }
body .docx-wrapper > section.docx { margin-bottom: 16px; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.12); }
/* Word's page when a document omits its size or margins; docx-preview sets present ones inline. */
body .docx-wrapper > section.docx { width: 8.5in; min-height: 11in; padding: 1in; }
body .docx-wrapper > section.docx:last-child { margin-bottom: 0; }
`

/** Static shell; the renderer fills the two hosts because docx-preview owns no frame of its own. */
export const DOCX_FRAME_SRCDOC = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><style>${FRAME_BASE_CSS}</style></head><body><div data-docx-styles></div><div data-docx-body></div></body></html>`

const RENDER_OPTIONS: Partial<Options> = {
  className: 'docx',
  inWrapper: true,
  breakPages: true,
  ignoreLastRenderedPageBreak: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  // Why: its default writes document-supplied HTML into an iframe of its own.
  renderAltChunks: false,
  renderComments: false,
  renderChanges: false,
  // Why: experimental tab stops measure against Orca's own body on a timer.
  experimental: false,
  useBase64URL: true
}

export async function renderDocxNodes(bytes: Uint8Array<ArrayBuffer>): Promise<Node[]> {
  const document = await parseAsync(bytes, RENDER_OPTIONS)
  return renderDocument(document, RENDER_OPTIONS)
}

/** Replaces the frame's document content; returns the page wrapper zoom and sizing act on. */
export function mountDocxNodes(frameDocument: Document, nodes: Node[]): HTMLElement | null {
  const styleHost = frameDocument.querySelector('[data-docx-styles]')
  const bodyHost = frameDocument.querySelector('[data-docx-body]')
  if (!styleHost || !bodyHost) {
    return null
  }
  styleHost.replaceChildren(...nodes.filter((node) => node.nodeName === 'STYLE'))
  bodyHost.replaceChildren(...nodes.filter((node) => node.nodeName !== 'STYLE'))
  for (const anchor of bodyHost.querySelectorAll('a[href]')) {
    const url = parseExternalUrl(anchor.getAttribute('href'))
    if (url) {
      anchor.setAttribute('title', url.href)
    }
  }
  return bodyHost.querySelector<HTMLElement>('.docx-wrapper')
}

function parseExternalUrl(href: string | null): URL | null {
  if (!href || href.startsWith('#')) {
    return null
  }
  // Why URL parsing, not a prefix test: browsers drop tabs and newlines anywhere in an href.
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

type DocxFrameEventHandlers = {
  openExternalLink: (url: string, event: MouseEvent) => void
  onCtrlWheel: (event: WheelEvent) => void
}

/** Wires the parent's handlers into the script-free frame; returns the teardown. */
export function attachDocxFrameEvents(
  frameDocument: Document,
  handlers: DocxFrameEventHandlers
): () => void {
  const frameWindow = frameDocument.defaultView
  const onClick = (event: MouseEvent): void => {
    // Why Orca's Element: docx-preview builds every rendered node, links included, with Orca's document.
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!anchor) {
      return
    }
    // Why always: no click may navigate the frame; main's frame guard is only the backstop.
    event.preventDefault()
    const href = anchor.getAttribute('href') ?? ''
    if (href.startsWith('#')) {
      // Why raw: docx-preview writes bookmark names into ids and hrefs unencoded.
      frameDocument
        .getElementById(href.slice(1))
        ?.scrollIntoView({ behavior: motionSafeScrollBehavior() })
      return
    }
    const url = parseExternalUrl(href)
    if (url && event.button === 0) {
      handlers.openExternalLink(url.href, event)
    }
  }
  const onWheel = (event: WheelEvent): void => handlers.onCtrlWheel(event)
  // Why: chords pressed while the document has focus never reach Orca's window listeners; plain
  // keys stay with the document so reading (arrows, space) cannot trigger app shortcuts.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      replayAppKeyDown(event)
    }
  }
  frameDocument.addEventListener('click', onClick, true)
  frameDocument.addEventListener('auxclick', onClick, true)
  frameDocument.addEventListener('wheel', onWheel, { passive: false })
  frameWindow?.addEventListener('keydown', onKeyDown, true)
  return () => {
    frameDocument.removeEventListener('click', onClick, true)
    frameDocument.removeEventListener('auxclick', onClick, true)
    frameDocument.removeEventListener('wheel', onWheel)
    frameWindow?.removeEventListener('keydown', onKeyDown, true)
  }
}
