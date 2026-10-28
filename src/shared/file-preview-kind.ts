import { IMAGE_FILE_MIME_TYPES } from './image-file-extensions'
import { MEDIA_FILE_MIME_TYPES } from './media-file-extensions'

export type FilePreviewKind = 'image' | 'pdf' | 'audio' | 'video' | 'docx'
export type FilePreview = { kind: FilePreviewKind; mimeType: string }

/** Word documents, which only the editor previews, from a byte-range grant. */
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Images and PDFs, which local reads, `files.readPreview` and git blobs send whole. */
export const IMAGE_AND_PDF_PREVIEW_MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ...IMAGE_FILE_MIME_TYPES,
  '.avif': 'image/avif',
  '.pdf': 'application/pdf'
})

/** The extension as `.ext`, lower-cased; a bare dotfile such as `.mp4` has none. */
export function filePreviewExtension(filePath: string): string {
  const name = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

/** Which viewer opens a file; null means it has no preview and opens as text or as "binary". */
export function filePreviewForPath(filePath: string): FilePreview | null {
  const extension = filePreviewExtension(filePath)
  const document = IMAGE_AND_PDF_PREVIEW_MIME_TYPES[extension]
  if (document) {
    return { kind: document === 'application/pdf' ? 'pdf' : 'image', mimeType: document }
  }
  const media = MEDIA_FILE_MIME_TYPES[extension]
  if (media) {
    return { kind: media.startsWith('audio/') ? 'audio' : 'video', mimeType: media }
  }
  if (extension === '.docx') {
    return { kind: 'docx', mimeType: DOCX_MIME_TYPE }
  }
  return null
}

/** Audio and video always stream by range; their players can't take base64. */
export function streamsPreviewByRange(preview: FilePreview | null): boolean {
  return preview?.kind === 'audio' || preview?.kind === 'video'
}

/**
 * Images, PDFs and Word documents read a URL when their viewer asks; images and PDFs fall back
 * to base64 elsewhere (diffs, the web client), Word documents to the binary placeholder.
 */
export function isDocumentPreview(preview: FilePreview | null): boolean {
  return preview?.kind === 'image' || preview?.kind === 'pdf' || preview?.kind === 'docx'
}

/** Viewers that read their grant's bytes over IPC rather than loading the URL in an element. */
export function readsPreviewRangesOverIpc(preview: FilePreview | null): boolean {
  return preview?.kind === 'pdf' || preview?.kind === 'docx'
}
