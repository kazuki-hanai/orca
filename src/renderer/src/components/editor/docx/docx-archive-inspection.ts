import { Inflate } from 'fflate'

export type DocxArchiveLimits = {
  maxEntries: number
  maxTotalBytes: number
  /** Bounds a part DOMParser would build into a tree, which costs far more than its bytes. */
  maxMarkupPartBytes: number
}

export const DOCX_ARCHIVE_LIMITS: DocxArchiveLimits = {
  maxEntries: 2000,
  maxTotalBytes: 256 * 1024 * 1024,
  maxMarkupPartBytes: 32 * 1024 * 1024
}

export type DocxArchiveRejection = 'too-large' | 'unsupported'

export class DocxArchiveRejectedError extends Error {
  constructor(readonly reason: DocxArchiveRejection) {
    super(
      reason === 'too-large'
        ? 'Word document expands past the preview size limit'
        : 'Word document is damaged or uses an unsupported archive format'
    )
  }
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_SIGNATURE = 0x06054b50
const LOCAL_HEADER_BYTES = 30
const CENTRAL_HEADER_BYTES = 46
const END_OF_CENTRAL_BYTES = 22
const ZIP64_MARKER_16 = 0xffff
const ZIP64_MARKER_32 = 0xffffffff
// Why small: a 16 KiB deflate chunk inflates to at most ~16 MiB before the next size check.
const INFLATE_INPUT_BYTES = 16 * 1024

/**
 * Inflates every entry where jszip will find it, discarding the output, so an archive that
 * expands past the limits is refused before docx-preview buffers and parses it whole.
 */
export function inspectDocxArchive(
  bytes: Uint8Array,
  limits: DocxArchiveLimits = DOCX_ARCHIVE_LIMITS
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endOfCentral = lastIndexOfSignature(view, END_OF_CENTRAL_SIGNATURE)
  if (endOfCentral < 0 || endOfCentral + END_OF_CENTRAL_BYTES > bytes.byteLength) {
    throw new DocxArchiveRejectedError('unsupported')
  }
  const directoryRecords = view.getUint16(endOfCentral + 10, true)
  const directorySize = view.getUint32(endOfCentral + 12, true)
  const directoryOffset = view.getUint32(endOfCentral + 16, true)
  // Why exact: jszip re-bases every offset on prepended bytes; refusing keeps both readers aligned.
  if (
    directoryRecords === ZIP64_MARKER_16 ||
    directorySize === ZIP64_MARKER_32 ||
    directoryOffset === ZIP64_MARKER_32 ||
    directoryOffset + directorySize !== endOfCentral
  ) {
    throw new DocxArchiveRejectedError('unsupported')
  }

  let totalBytes = 0
  let entries = 0
  let cursor = directoryOffset
  // Why by signature: jszip reads every consecutive central header, whatever the record count says.
  while (
    cursor + 4 <= bytes.byteLength &&
    view.getUint32(cursor, true) === CENTRAL_HEADER_SIGNATURE
  ) {
    entries += 1
    if (entries > limits.maxEntries) {
      throw new DocxArchiveRejectedError('too-large')
    }
    requireRange(bytes, cursor, CENTRAL_HEADER_BYTES)
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const declaredSize = view.getUint32(cursor + 24, true)
    const localOffset = view.getUint32(cursor + 42, true)
    if (
      (flags & 0x1) !== 0 ||
      (method !== 0 && method !== 8) ||
      compressedSize === ZIP64_MARKER_32 ||
      declaredSize === ZIP64_MARKER_32 ||
      localOffset === ZIP64_MARKER_32
    ) {
      throw new DocxArchiveRejectedError('unsupported')
    }
    cursor +=
      CENTRAL_HEADER_BYTES +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true)

    requireRange(bytes, localOffset, LOCAL_HEADER_BYTES)
    if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new DocxArchiveRejectedError('unsupported')
    }
    const dataStart =
      localOffset +
      LOCAL_HEADER_BYTES +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true)
    requireRange(bytes, dataStart, compressedSize)
    const remaining = limits.maxTotalBytes - totalBytes
    if (declaredSize > remaining) {
      throw new DocxArchiveRejectedError('too-large')
    }
    totalBytes += measureEntry(
      bytes.subarray(dataStart, dataStart + compressedSize),
      method,
      declaredSize,
      limits.maxMarkupPartBytes
    )
  }
  if (entries === 0) {
    throw new DocxArchiveRejectedError('unsupported')
  }
}

/** Inflated size of one entry; refuses one that outgrows its declared size or a markup cap. */
function measureEntry(
  data: Uint8Array,
  method: number,
  declaredSize: number,
  maxMarkupPartBytes: number
): number {
  const sniffer = new MarkupSniffer()
  let size = 0
  const accept = (chunk: Uint8Array): void => {
    size += chunk.byteLength
    if (size > declaredSize) {
      throw new DocxArchiveRejectedError('unsupported')
    }
    // Why by content: jszip takes names from local headers or extra fields, and rels pick what parses as XML.
    if (sniffer.feed(chunk) && size > maxMarkupPartBytes) {
      throw new DocxArchiveRejectedError('too-large')
    }
  }
  if (method === 0) {
    accept(data)
    return size
  }
  const inflate = new Inflate((chunk) => accept(chunk))
  try {
    for (let offset = 0; offset < data.byteLength; offset += INFLATE_INPUT_BYTES) {
      const end = Math.min(offset + INFLATE_INPUT_BYTES, data.byteLength)
      inflate.push(data.subarray(offset, end), end === data.byteLength)
    }
    if (data.byteLength === 0) {
      inflate.push(data, true)
    }
  } catch (error) {
    throw error instanceof DocxArchiveRejectedError
      ? error
      : new DocxArchiveRejectedError('unsupported')
  }
  return size
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]

/** True while the part could still be XML: only whitespace or a UTF-8 BOM so far, or a leading `<`. */
class MarkupSniffer {
  private verdict: boolean | null = null
  private seen = 0

  feed(chunk: Uint8Array): boolean {
    for (let index = 0; this.verdict === null && index < chunk.byteLength; index += 1) {
      const byte = chunk[index]
      const isBom = this.seen < UTF8_BOM.length && byte === UTF8_BOM[this.seen]
      this.seen += 1
      if (!isBom && byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
        this.verdict = byte === 0x3c
      }
    }
    return this.verdict !== false
  }
}

function lastIndexOfSignature(view: DataView, signature: number): number {
  for (let index = view.byteLength - 4; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === signature) {
      return index
    }
  }
  return -1
}

function requireRange(bytes: Uint8Array, start: number, length: number): void {
  if (start + length > bytes.byteLength) {
    throw new DocxArchiveRejectedError('unsupported')
  }
}
