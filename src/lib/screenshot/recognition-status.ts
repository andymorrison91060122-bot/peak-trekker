export function screenshotRecognitionErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/not configured/i.test(message)) return 500
  if (/(?:rate.?limit|too many requests|quota|429)/i.test(message)) return 429

  return 502
}
