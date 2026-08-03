import {
  MAX_CLIENT_ERROR_DIAGNOSTIC_BYTES,
  validateClientErrorDiagnosticPayload,
} from './client-error-diagnostic.ts'

const ALLOWED_HOSTNAMES = new Set(['peaktrekker.cc', 'www.peaktrekker.cc', 'localhost'])

function noContent(status = 204) {
  return new Response(null, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function isAllowedSameOriginRequest(request: Request) {
  const requestUrl = new URL(request.url)
  const requestHost = request.headers.get('host')?.trim().toLowerCase()
  const origin = request.headers.get('origin')
  const hostname = requestUrl.hostname.toLowerCase()

  if (!requestHost || requestHost !== requestUrl.host.toLowerCase() || !ALLOWED_HOSTNAMES.has(hostname)) {
    return false
  }

  if (hostname !== 'localhost' && requestUrl.protocol !== 'https:') return false
  if (!origin) return false

  try {
    return new URL(origin).origin === requestUrl.origin
  } catch {
    return false
  }
}

function hasJsonContentType(request: Request) {
  return request.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false
}

function exceedsDeclaredBodyLimit(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (!contentLength) return false

  const parsedLength = Number(contentLength)
  return Number.isFinite(parsedLength) && parsedLength > MAX_CLIENT_ERROR_DIAGNOSTIC_BYTES
}

async function readBoundedRequestBody(request: Request) {
  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      byteLength += value.byteLength
      if (byteLength > MAX_CLIENT_ERROR_DIAGNOSTIC_BYTES) {
        await reader.cancel().catch(() => undefined)
        return null
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function handleClientErrorDiagnosticPost(request: Request) {
  try {
    if (!isAllowedSameOriginRequest(request)) return noContent(403)
    if (!hasJsonContentType(request)) return noContent(415)
    if (exceedsDeclaredBodyLimit(request)) return noContent(413)

    const bytes = await readBoundedRequestBody(request)
    if (bytes === null) return noContent(413)
    if (bytes.byteLength === 0) return noContent(400)

    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!validateClientErrorDiagnosticPayload(payload)) return noContent(400)

    console.error('[client-error-diagnostic]', payload)
    return noContent()
  } catch {
    return noContent(400)
  }
}
