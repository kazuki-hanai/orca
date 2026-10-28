import { inspectDocxArchive } from './docx-archive-inspection'
import type { DocxArchiveInspectionResponse } from './docx-archive-inspection-client'

self.onmessage = (event: MessageEvent<Uint8Array<ArrayBuffer>>): void => {
  const bytes = event.data
  try {
    inspectDocxArchive(bytes)
    const response: DocxArchiveInspectionResponse = { ok: true, bytes }
    self.postMessage(response, { transfer: [bytes.buffer] })
  } catch (error) {
    const response: DocxArchiveInspectionResponse = {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
    self.postMessage(response)
  }
}
