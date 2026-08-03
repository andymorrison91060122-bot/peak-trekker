export const SCREENSHOT_RECOGNITION_RECOVERY_DEADLINE_MS = 55_000

const INITIAL_RECOVERY_BACKOFF_MS = 1_000
const MAX_RECOVERY_BACKOFF_MS = 4_000

export type ScreenshotRecognitionRecoveryResponse<T> = {
  status: number
  ok: boolean
  payload: T
}

export async function readScreenshotRecognitionResponse<T>(
  response: Pick<Response, 'status' | 'ok' | 'json'>,
): Promise<ScreenshotRecognitionRecoveryResponse<T>> {
  return {
    status: response.status,
    ok: response.ok,
    payload: await response.json() as T,
  }
}

export class ScreenshotRecognitionRecoveryDeadlineError extends Error {
  constructor() {
    super('Screenshot recognition recovery timed out')
    this.name = 'ScreenshotRecognitionRecoveryDeadlineError'
  }
}

function abortError() {
  const error = new Error('Screenshot recognition recovery aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError()
}

function waitForRecovery(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal)
    const onAbort = () => {
      window.clearTimeout(timeout)
      reject(abortError())
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function recoverScreenshotRecognition<T extends { code?: string }>({
  requestId,
  startedAtMs,
  signal,
  read,
  now = () => performance.now(),
  wait = waitForRecovery,
}: {
  requestId: string
  startedAtMs: number
  signal: AbortSignal
  read: (requestId: string, signal: AbortSignal) => Promise<ScreenshotRecognitionRecoveryResponse<T>>
  now?: () => number
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}): Promise<ScreenshotRecognitionRecoveryResponse<T>> {
  const deadlineAtMs = startedAtMs + SCREENSHOT_RECOGNITION_RECOVERY_DEADLINE_MS
  let backoffMs = INITIAL_RECOVERY_BACKOFF_MS

  const waitForNextObservation = async () => {
    const remainingMs = deadlineAtMs - now()
    if (remainingMs <= 0) return false
    await wait(Math.min(backoffMs, remainingMs), signal)
    backoffMs = Math.min(Math.ceil(backoffMs * 1.5), MAX_RECOVERY_BACKOFF_MS)
    return true
  }

  while (now() < deadlineAtMs) {
    throwIfAborted(signal)
    let response: ScreenshotRecognitionRecoveryResponse<T>
    try {
      response = await read(requestId, signal)
    } catch {
      throwIfAborted(signal)
      if (!await waitForNextObservation()) break
      continue
    }
    throwIfAborted(signal)
    if (response.status !== 202 || response.payload.code !== 'screenshot_recognition_pending') {
      return response
    }

    if (!await waitForNextObservation()) break
  }

  throw new ScreenshotRecognitionRecoveryDeadlineError()
}
