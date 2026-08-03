export const CLIENT_ERROR_DIAGNOSTIC_PATH = '/api/diagnostics/client-error'
export const MAX_CLIENT_ERROR_DIAGNOSTIC_BYTES = 2048

const MAX_ERROR_NAME_LENGTH = 80
const MAX_ERROR_MESSAGE_LENGTH = 512
const MAX_DIGEST_LENGTH = 128
const MAX_PATHNAME_LENGTH = 256
const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RUNTIME_MARKERS = new Set(['next', 'cloudflare'])

export type ClientErrorRuntime = 'next' | 'cloudflare'

export type ClientErrorDiagnosticPayload = {
  correlationId: string
  name: string
  message: string
  digest: string | null
  pathname: string
  runtime: ClientErrorRuntime
}

type ClientErrorLike = Pick<Error, 'name' | 'message'> & { digest?: unknown }
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>

export type ClientErrorDiagnosticReporter = (payload: ClientErrorDiagnosticPayload) => unknown | Promise<unknown>

export type ClientErrorDiagnosticPreparation = {
  getPathname: () => string
  getRuntime: () => ClientErrorRuntime
  createCorrelationId: () => string
  buildPayload?: typeof buildClientErrorDiagnosticPayload
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''

  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b(?:authorization|cookie|set-cookie|access_token|id_token|refresh_token|token)\b\s*(?:=|:)\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .trim()
    .slice(0, maxLength)
}

function diagnosticPathname(value: string) {
  const pathname = value
    .split(/[?#]/, 1)[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id')
  return pathname.startsWith('/') ? pathname.slice(0, MAX_PATHNAME_LENGTH) : '/'
}

function diagnosticDigest(value: unknown) {
  const digest = boundedText(value, MAX_DIGEST_LENGTH)
  return digest || null
}

export function buildClientErrorDiagnosticPayload(
  error: ClientErrorLike,
  pathname: string,
  runtime: ClientErrorRuntime,
  correlationId: string,
): ClientErrorDiagnosticPayload {
  return {
    correlationId,
    name: boundedText(error.name, MAX_ERROR_NAME_LENGTH) || 'Error',
    message: boundedText(error.message, MAX_ERROR_MESSAGE_LENGTH) || 'Unknown client error',
    digest: diagnosticDigest(error.digest),
    pathname: diagnosticPathname(pathname),
    runtime,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

export function validateClientErrorDiagnosticPayload(value: unknown): value is ClientErrorDiagnosticPayload {
  if (!isRecord(value)) return false

  const keys = Object.keys(value).sort()
  if (keys.join(',') !== 'correlationId,digest,message,name,pathname,runtime') return false

  const { correlationId, name, message, digest, pathname, runtime } = value
  if (typeof correlationId !== 'string' || !CORRELATION_ID_PATTERN.test(correlationId)) return false
  if (!isBoundedString(name, MAX_ERROR_NAME_LENGTH) || name !== boundedText(name, MAX_ERROR_NAME_LENGTH)) return false
  if (!isBoundedString(message, MAX_ERROR_MESSAGE_LENGTH) || message !== boundedText(message, MAX_ERROR_MESSAGE_LENGTH)) return false
  if (digest !== null && (!isBoundedString(digest, MAX_DIGEST_LENGTH) || digest !== boundedText(digest, MAX_DIGEST_LENGTH))) return false
  if (!isBoundedString(pathname, MAX_PATHNAME_LENGTH) || pathname !== diagnosticPathname(pathname)) return false
  if (typeof runtime !== 'string' || !RUNTIME_MARKERS.has(runtime)) return false

  return true
}

export function createOneShotClientErrorReporter(fetchImpl: FetchLike) {
  let reported = false

  return async (payload: ClientErrorDiagnosticPayload) => {
    if (reported) return false
    reported = true

    try {
      await fetchImpl(CLIENT_ERROR_DIAGNOSTIC_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        keepalive: true,
        referrerPolicy: 'no-referrer',
      })
    } catch {
      // Reporting must not alter the existing error boundary or retry flow.
    }

    return true
  }
}

export function reportClientErrorDiagnostic(
  reporter: ClientErrorDiagnosticReporter,
  error: ClientErrorLike,
  preparation: ClientErrorDiagnosticPreparation,
) {
  try {
    const buildPayload = preparation.buildPayload ?? buildClientErrorDiagnosticPayload
    const payload = buildPayload(
      error,
      preparation.getPathname(),
      preparation.getRuntime(),
      preparation.createCorrelationId(),
    )

    void Promise.resolve(reporter(payload)).catch(() => undefined)
  } catch {
    // Diagnostics must never obscure the original error boundary or retry UI.
  }
}
