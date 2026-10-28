export type DocxArchiveInspectionResponse =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; message: string }

export type DocxArchiveInspection = {
  /** Resolves with the same bytes, handed back by the worker, once the archive is within limits. */
  result: Promise<Uint8Array<ArrayBuffer>>
  cancel: () => void
}

/** One worker per document: inflating a crafted archive is CPU-bound and must not block the UI. */
export function inspectDocxArchiveOffThread(bytes: Uint8Array<ArrayBuffer>): DocxArchiveInspection {
  const worker = new Worker(new URL('./docx-archive-inspection.worker.ts', import.meta.url), {
    type: 'module'
  })
  let settle: ((error?: Error) => void) | null = null
  const result = new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    settle = (error) => {
      settle = null
      worker.terminate()
      if (error) {
        reject(error)
      }
    }
    worker.onmessage = (event: MessageEvent<DocxArchiveInspectionResponse>) => {
      const response = event.data
      if (response.ok) {
        settle?.()
        resolve(response.bytes)
      } else {
        settle?.(new Error(response.message))
      }
    }
    worker.onerror = () => settle?.(new Error('Word document check failed. Reload the file.'))
    worker.postMessage(bytes, [bytes.buffer])
  })
  return { result, cancel: () => settle?.(new Error('Word document preview was canceled')) }
}
