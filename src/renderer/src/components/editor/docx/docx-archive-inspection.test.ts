import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  DocxArchiveRejectedError,
  inspectDocxArchive,
  type DocxArchiveLimits
} from './docx-archive-inspection'

const LIMITS: DocxArchiveLimits = { maxEntries: 10, maxTotalBytes: 8192, maxMarkupPartBytes: 1024 }

function markup(bytes: number): Uint8Array {
  return strToU8(`<w:document>${'x'.repeat(bytes - 25)}</w:document>`)
}

function png(bytes: number): Uint8Array {
  const data = new Uint8Array(bytes)
  data.set([0x89, 0x50, 0x4e, 0x47])
  return data
}

function rejection(bytes: Uint8Array, limits = LIMITS): string | null {
  try {
    inspectDocxArchive(bytes, limits)
    return null
  } catch (error) {
    if (error instanceof DocxArchiveRejectedError) {
      return error.reason
    }
    throw error
  }
}

function centralHeaderOffsets(zip: Uint8Array): { endOfCentral: number; headers: number[] } {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const endOfCentral = zip.byteLength - 22
  const headers: number[] = []
  let cursor = view.getUint32(endOfCentral + 16, true)
  while (view.getUint32(cursor, true) === 0x02014b50) {
    headers.push(cursor)
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true)
  }
  return { endOfCentral, headers }
}

describe('inspectDocxArchive', () => {
  it('accepts an ordinary document with media larger than the markup cap', () => {
    const zip = zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
      'word/document.xml': markup(900),
      'word/media/image1.png': [png(4000), { level: 0 }]
    })
    expect(rejection(zip)).toBeNull()
  })

  it('caps a part that parses as XML even when named like media', () => {
    const zip = zipSync({ 'word/media/image1.png': markup(4000) })
    expect(rejection(zip)).toBe('too-large')
  })

  it('caps the total inflated size across parts', () => {
    const zip = zipSync({
      'word/media/a.png': png(5000),
      'word/media/b.png': png(5000)
    })
    expect(rejection(zip)).toBe('too-large')
  })

  it('refuses an entry that inflates past its declared size', () => {
    const zip = zipSync({ 'word/media/a.png': png(5000) })
    const { headers } = centralHeaderOffsets(zip)
    new DataView(zip.buffer).setUint32(headers[0] + 24, 100, true)
    expect(rejection(zip)).toBe('unsupported')
  })

  it('counts every central header jszip will read, not the declared record count', () => {
    const files: Record<string, Uint8Array> = {}
    for (let index = 0; index < 12; index += 1) {
      files[`word/media/${index}.png`] = png(8)
    }
    const zip = zipSync(files)
    const { endOfCentral } = centralHeaderOffsets(zip)
    const view = new DataView(zip.buffer)
    view.setUint16(endOfCentral + 8, 1, true)
    view.setUint16(endOfCentral + 10, 1, true)
    expect(rejection(zip)).toBe('too-large')
  })

  it('refuses bytes prepended before the archive, which jszip would re-base onto', () => {
    const zip = zipSync({ 'word/document.xml': markup(100) })
    const shifted = new Uint8Array(zip.byteLength + 16)
    shifted.set(zip, 16)
    expect(rejection(shifted)).toBe('unsupported')
  })

  it('refuses bytes that are not a zip archive', () => {
    expect(rejection(strToU8('plain text, not a document'))).toBe('unsupported')
  })
})
