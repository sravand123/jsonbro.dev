/**
 * Shareable links.
 *
 * The document is compressed and placed in the URL fragment, which browsers never
 * send to a server — so "share a link" does not become "upload my data".
 *
 * The payload is prefixed with a one-character format marker so a link stays
 * readable even when compression is unavailable: `z` = raw deflate, `r` = plain
 * UTF-8 bytes.
 */

const HASH_PREFIX = '#doc='
const MAX_ENCODED_LENGTH = 40_000

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function through(transform: TransformStream, input: Uint8Array): Promise<Uint8Array> {
  const writer = transform.writable.getWriter()
  void writer.write(input)
  void writer.close()
  const buffer = await new Response(transform.readable).arrayBuffer()
  return new Uint8Array(buffer)
}

async function encodePayload(text: string): Promise<string> {
  const input = new TextEncoder().encode(text)
  if (typeof CompressionStream !== 'undefined') {
    try {
      return `z${toBase64Url(await through(new CompressionStream('deflate-raw'), input))}`
    } catch {
      // Environment lacks working stream plumbing; fall through to raw bytes.
    }
  }
  return `r${toBase64Url(input)}`
}

async function decodePayload(payload: string): Promise<string> {
  const marker = payload[0]
  const bytes = fromBase64Url(payload.slice(1))

  if (marker === 'r') return new TextDecoder().decode(bytes)
  if (marker === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Cannot decompress')
    return new TextDecoder().decode(await through(new DecompressionStream('deflate-raw'), bytes))
  }
  throw new Error('Unknown payload format')
}

export interface ShareResult {
  url: string | null
  reason?: string
}

export async function buildShareUrl(text: string): Promise<ShareResult> {
  if (text.trim() === '') return { url: null, reason: 'Nothing to share yet.' }

  try {
    const encoded = await encodePayload(text)
    if (encoded.length > MAX_ENCODED_LENGTH) {
      return {
        url: null,
        reason: 'This document is too large to fit in a link. Download it instead.',
      }
    }
    const { origin, pathname } = window.location
    return { url: `${origin}${pathname}${HASH_PREFIX}${encoded}` }
  } catch {
    return { url: null, reason: 'Could not build a link in this browser.' }
  }
}

/** Reads and clears a shared document from the current URL, if present. */
export async function consumeSharedDocument(): Promise<string | null> {
  const hash = window.location.hash
  if (!hash.startsWith(HASH_PREFIX)) return null

  const payload = hash.slice(HASH_PREFIX.length)
  try {
    const text = await decodePayload(payload)
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return text
  } catch {
    return null
  }
}
