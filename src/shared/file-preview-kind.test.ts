import { describe, expect, it } from 'vitest'
import { DOCX_MIME_TYPE, filePreviewForPath } from './file-preview-kind'

describe('filePreviewForPath', () => {
  it.each([
    ['a/b.MP4', { kind: 'video', mimeType: 'video/mp4' }],
    ['a\\b.opus', { kind: 'audio', mimeType: 'audio/ogg' }],
    ['x.avif', { kind: 'image', mimeType: 'image/avif' }],
    ['doc.PDF', { kind: 'pdf', mimeType: 'application/pdf' }],
    ['report.DOCX', { kind: 'docx', mimeType: DOCX_MIME_TYPE }],
    ['dir/.mp4', null],
    ['lib.so', null],
    ['notes.txt', null]
  ])('%s', (path, expected) => {
    expect(filePreviewForPath(path)).toEqual(expected)
  })
})
