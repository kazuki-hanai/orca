import { type JSX, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { FileText, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { scrollTopCache, setWithLRU } from '@/lib/scroll-cache'
import { DOCX_PREVIEW_FRAME_NAME_PREFIX } from '../../../../../shared/docx-preview-frame'
import { openCsvHttpLink } from '../csv/csv-link-routing'
import { EditorCommandOwnerContext } from '../editor-command-owner-context'
import { getPinchZoomFactor, shouldHandleImageZoomWheel } from '../image-viewer-zoom'
import {
  clampPdfScale,
  DOCUMENT_SCALE_BOUNDS,
  stepPdfScalePreference,
  type PdfScalePreference
} from '../pdf-scale-preference'
import { readOrcaMediaRange } from '../pdf-orca-media-range-transport'
import { listenForViewerZoomRequests } from '../viewer-zoom-request'
import {
  inspectDocxArchiveOffThread,
  type DocxArchiveInspection
} from './docx-archive-inspection-client'
import {
  attachDocxFrameEvents,
  DOCX_FRAME_SRCDOC,
  mountDocxNodes,
  renderDocxNodes
} from './docx-preview-frame'

const LOADING_INDICATOR_DELAY_MS = 200
const SCROLL_SAVE_DELAY_MS = 150
// Why: jszip holds the whole archive, so keep the cap whole-file previews already use.
const DOCX_PREVIEW_MAX_BYTES = 50 * 1024 * 1024

type DocxViewerProps = {
  /** The editor's orca-media grant, read over IPC by range. */
  src: string
  byteSize?: number
  filePath: string
  worktreeId?: string
  runtimeEnvironmentId?: string | null
  // Omitted by surfaces that may mount several viewers on one path.
  scrollCacheKey?: string | null
}

type DocxViewerStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }

export default function DocxViewer(props: DocxViewerProps): JSX.Element {
  return (
    <DocxDocumentViewer key={JSON.stringify([props.filePath, props.scrollCacheKey])} {...props} />
  )
}

function DocxDocumentViewer({
  src,
  byteSize,
  filePath,
  worktreeId,
  runtimeEnvironmentId,
  scrollCacheKey = null
}: DocxViewerProps): JSX.Element {
  const frameName = `${DOCX_PREVIEW_FRAME_NAME_PREFIX}${useId()}`
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const scaleRef = useRef(1)
  const preferenceRef = useRef<PdfScalePreference>('page-width')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [status, setStatus] = useState<DocxViewerStatus>({ kind: 'loading' })
  const [showLoading, setShowLoading] = useState(false)
  const [scale, setScale] = useState(1)
  const isCommandOwner = useContext(EditorCommandOwnerContext)
  const filename = filePath.split(/[/\\]/).pop() || filePath

  const applyScale = useCallback((next: number) => {
    const wrapper = wrapperRef.current
    if (!wrapper || Math.abs(next - scaleRef.current) < 0.001) {
      return
    }
    scaleRef.current = next
    wrapper.style.zoom = String(next)
    setScale(next)
  }, [])

  // Why: the frame takes its content's size so the pane's own scrollbar scrolls the pages.
  const layoutFrame = useCallback(() => {
    const container = containerRef.current
    const frame = frameRef.current
    const wrapper = wrapperRef.current
    if (!container || !frame || !wrapper) {
      return
    }
    if (preferenceRef.current === 'page-width') {
      const naturalWidth = wrapper.getBoundingClientRect().width / scaleRef.current
      if (naturalWidth > 0) {
        applyScale(
          clampPdfScale(
            container.clientWidth / naturalWidth,
            DOCUMENT_SCALE_BOUNDS.min,
            DOCUMENT_SCALE_BOUNDS.max
          )
        )
      }
    }
    const rect = wrapper.getBoundingClientRect()
    frame.style.width = `${Math.max(container.clientWidth, Math.ceil(rect.width))}px`
    frame.style.height = `${Math.ceil(rect.height)}px`
  }, [applyScale])

  /** Zooms keeping the content under the anchor (pane-relative pixels) in place. */
  const zoomTo = useCallback(
    (preference: PdfScalePreference, anchor?: { x: number; y: number }) => {
      const container = containerRef.current
      if (!container || !wrapperRef.current) {
        return
      }
      const previous = scaleRef.current
      const x = anchor?.x ?? 0
      const y = anchor?.y ?? 0
      const contentX = container.scrollLeft + x
      const contentY = container.scrollTop + y
      preferenceRef.current = preference
      if (typeof preference === 'number') {
        applyScale(preference)
      }
      layoutFrame()
      const growth = scaleRef.current / previous
      container.scrollLeft = contentX * growth - x
      container.scrollTop = contentY * growth - y
    },
    [applyScale, layoutFrame]
  )

  const stepZoom = useCallback(
    (direction: 'in' | 'out') =>
      zoomTo(stepPdfScalePreference(scaleRef.current, direction, DOCUMENT_SCALE_BOUNDS).preference),
    [zoomTo]
  )
  const zoomIn = useCallback(() => stepZoom('in'), [stepZoom])
  const zoomOut = useCallback(() => stepZoom('out'), [stepZoom])
  const zoomReset = useCallback(() => zoomTo('page-width'), [zoomTo])

  useEffect(() => {
    if (!isCommandOwner) {
      return
    }
    return listenForViewerZoomRequests(
      (direction) => (direction === 'reset' ? zoomReset() : stepZoom(direction)),
      rootRef
    )
  }, [isCommandOwner, stepZoom, zoomReset])

  useEffect(() => {
    const frameDocument = frameLoaded ? frameRef.current?.contentDocument : null
    const container = containerRef.current
    if (!frameDocument || !container) {
      return
    }
    const observer = new ResizeObserver(() => layoutFrame())
    resizeObserverRef.current = observer
    observer.observe(container)
    const detachEvents = attachDocxFrameEvents(frameDocument, {
      openExternalLink: (url, event) =>
        openCsvHttpLink(url, event, { filePath, worktreeId, runtimeEnvironmentId }),
      onCtrlWheel: (event) => {
        const frame = frameRef.current
        if (!frame || !shouldHandleImageZoomWheel(event)) {
          return
        }
        event.preventDefault()
        const frameRect = frame.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        zoomTo(
          clampPdfScale(
            scaleRef.current * getPinchZoomFactor(event.deltaY, event.deltaMode),
            DOCUMENT_SCALE_BOUNDS.min,
            DOCUMENT_SCALE_BOUNDS.max
          ),
          {
            x: frameRect.left + event.clientX - containerRect.left,
            y: frameRect.top + event.clientY - containerRect.top
          }
        )
      }
    })
    return () => {
      detachEvents()
      observer.disconnect()
      resizeObserverRef.current = null
    }
  }, [filePath, frameLoaded, layoutFrame, runtimeEnvironmentId, worktreeId, zoomTo])

  useEffect(() => {
    const frameDocument = frameLoaded ? frameRef.current?.contentDocument : null
    if (!frameDocument) {
      return
    }
    let disposed = false
    let inspection: DocxArchiveInspection | null = null
    setStatus({ kind: 'loading' })
    void (async () => {
      try {
        if (byteSize === undefined || byteSize > DOCX_PREVIEW_MAX_BYTES) {
          throw new Error(`Word document is too large to preview (${byteSize ?? '?'} bytes)`)
        }
        const bytes = await readOrcaMediaRange(src, 0, byteSize, () => disposed)
        // Why: the last piece can land after cleanup, which had no inspection to cancel yet.
        if (disposed) {
          return
        }
        inspection = inspectDocxArchiveOffThread(bytes)
        const nodes = await renderDocxNodes(await inspection.result)
        if (disposed) {
          return
        }
        const wrapper = mountDocxNodes(frameDocument, nodes)
        if (!wrapper) {
          throw new Error('Word document has no renderable body')
        }
        wrapperRef.current = wrapper
        scaleRef.current = 1
        if (typeof preferenceRef.current === 'number') {
          applyScale(preferenceRef.current)
        }
        layoutFrame()
        resizeObserverRef.current?.observe(wrapper)
        const container = containerRef.current
        const cachedScrollTop = scrollCacheKey ? scrollTopCache.get(scrollCacheKey) : undefined
        if (container && cachedScrollTop !== undefined) {
          container.scrollTop = cachedScrollTop
        }
        setStatus({ kind: 'ready' })
      } catch (error) {
        if (!disposed) {
          setStatus({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    })()
    return () => {
      disposed = true
      inspection?.cancel()
    }
  }, [applyScale, byteSize, frameLoaded, layoutFrame, scrollCacheKey, src])

  useEffect(() => {
    if (status.kind !== 'loading') {
      setShowLoading(false)
      return
    }
    // Why deferred: a fast local render should not flash a spinner.
    const timer = setTimeout(() => setShowLoading(true), LOADING_INDICATOR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [status.kind])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !scrollCacheKey) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const save = (): void => setWithLRU(scrollTopCache, scrollCacheKey, container.scrollTop)
    const onScroll = (): void => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(save, SCROLL_SAVE_DELAY_MS)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      // Why: an unrendered document has no height, so leaving early must not erase the position.
      if (wrapperRef.current) {
        save()
      }
      if (timer !== null) {
        clearTimeout(timer)
      }
      container.removeEventListener('scroll', onScroll)
    }
  }, [scrollCacheKey])

  const zoomPercent = Math.round(scale * 100)
  const previewLabel = translate(
    'auto.components.editor.docx.DocxViewer.ad3d9b7460',
    'Word document preview'
  )

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-auto bg-muted scrollbar-editor"
          // Why: a scrollbar appearing at fit-to-width would otherwise re-fit, and could oscillate.
          style={{ scrollbarGutter: 'stable' }}
        >
          <iframe
            ref={frameRef}
            name={frameName}
            title={previewLabel}
            srcDoc={DOCX_FRAME_SRCDOC}
            // Why same-origin without scripts: nothing runs inside; Orca renders and routes from outside.
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            className="block border-0"
            // Why: a scheme differing from the document's makes Chromium paint the frame opaque.
            style={{ colorScheme: 'light' }}
            onLoad={() => setFrameLoaded(true)}
          />
        </div>
        {status.kind === 'error' ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-8 text-sm text-muted-foreground"
          >
            <FileText className="size-10" />
            <div>
              {translate(
                'auto.components.editor.ImageViewer.d9d2944855',
                'Failed to load file preview'
              )}
            </div>
            <div className="max-w-md text-center text-xs">{status.message}</div>
            <div className="max-w-md break-all text-center text-xs">{filename}</div>
          </div>
        ) : status.kind === 'loading' && showLoading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoadingSpinner className="size-4" />
            {translate('auto.components.editor.ImageViewer.3ef9551ba2', 'Loading preview...')}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
            onClick={zoomOut}
            disabled={status.kind !== 'ready' || scale <= DOCUMENT_SCALE_BOUNDS.min}
            title={translate('auto.components.editor.PdfViewer.fa5d096b00', 'Zoom out')}
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
            onClick={zoomReset}
            disabled={status.kind !== 'ready'}
            title={translate('auto.components.editor.PdfViewer.c0119616d6', 'Fit to width')}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
            onClick={zoomIn}
            disabled={status.kind !== 'ready' || scale >= DOCUMENT_SCALE_BOUNDS.max}
            title={translate('auto.components.editor.PdfViewer.2b6eb1ccd6', 'Zoom in')}
          >
            <ZoomIn size={14} />
          </button>
          <span className="ml-1 tabular-nums">{zoomPercent}%</span>
        </div>
        <span className="min-w-0 truncate" title={filename}>
          {filename}
        </span>
        <span>{previewLabel}</span>
      </div>
    </div>
  )
}
