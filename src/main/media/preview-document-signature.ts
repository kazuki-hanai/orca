import type { FilePreview } from '../../shared/file-preview-kind'

/** pdf.js accepts a PDF header anywhere in the first 1 KiB. */
export const DOCUMENT_SIGNATURE_PROBE_BYTES = 1024

/**
 * Whether a document's first bytes fit its extension: a PDF names `%PDF-`, an SVG opens with markup,
 * a Word document is a zip, and a raster image is none of these. Only catches a mislabel, such as a
 * link to another kind of file.
 */
export function prefixFitsDocumentPreview(preview: FilePreview, prefix: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(prefix)
  if (preview.kind === 'docx') {
    return head.startsWith('PK\x03\x04')
  }
  const isPdf = head.includes('%PDF-')
  if (preview.kind === 'pdf') {
    return isPdf
  }
  const isMarkup = /^(?:ï»¿)?\s*</.test(head)
  return preview.mimeType === 'image/svg+xml' ? isMarkup : !isPdf && !isMarkup
}
