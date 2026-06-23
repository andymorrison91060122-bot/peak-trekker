export const SCREENSHOT_RECOGNITION_RETRY_MESSAGE = '识别服务暂时不可用，请稍后重试。'
export const SCREENSHOT_RECOGNITION_TEMPORARY_MESSAGE = '识别服务暂时不可用，请稍后重试。本次未消耗识别次数。'
export const SCREENSHOT_QUOTA_RETRY_MESSAGE = '识别额度暂时不可用，请稍后重试。'

const SAFE_RETRY_MESSAGES = new Set([
  SCREENSHOT_RECOGNITION_RETRY_MESSAGE,
  SCREENSHOT_RECOGNITION_TEMPORARY_MESSAGE,
  SCREENSHOT_QUOTA_RETRY_MESSAGE,
])

export function isSafeScreenshotRetryMessage(message: string) {
  return SAFE_RETRY_MESSAGES.has(message)
}
