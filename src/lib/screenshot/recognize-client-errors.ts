import {
  isSafeScreenshotRetryMessage,
  SCREENSHOT_RECOGNITION_RETRY_MESSAGE,
} from './recognize-error-copy.ts'

export type RecognizeErrorKind = 'auth' | 'too_large' | 'unsupported' | 'network' | 'file' | 'quota'

export function responseKind(status: number): RecognizeErrorKind {
  if (status === 401) return 'auth'
  if (status === 402) return 'quota'
  if (status === 413) return 'too_large'
  if (status === 415) return 'unsupported'
  if (status >= 500) return 'network'
  return 'file'
}

export function readableError(message: string, kind: RecognizeErrorKind) {
  if (kind === 'auth') return '登录后才能识别截图。'
  if (kind === 'quota') return '本月截图识别次数已用完。'
  if (kind === 'network') {
    return isSafeScreenshotRetryMessage(message) ? message : SCREENSHOT_RECOGNITION_RETRY_MESSAGE
  }
  if (/unauthorized/i.test(message)) return '登录后才能识别截图。'
  return '这张截图暂时无法识别，请换一张再试。'
}
