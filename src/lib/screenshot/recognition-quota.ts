import type { SupabaseClient } from '@supabase/supabase-js'
import { consumeScreenshotQuota } from './quota.ts'
import { recognizeScreenshotText } from './recognition-service.ts'
import type { ScreenshotQuotaState } from './types.ts'

type RecognitionResult = Awaited<ReturnType<typeof recognizeScreenshotText>>
type QuotaResult = Awaited<ReturnType<typeof consumeScreenshotQuota>>

export async function recognizeThenConsumeScreenshotQuota({
  imageBase64,
  mimeType,
  userId,
  quota,
  adminClient,
  recognize = recognizeScreenshotText,
  consume = consumeScreenshotQuota,
}: {
  imageBase64: string
  mimeType: string
  userId: string
  quota: ScreenshotQuotaState
  adminClient: SupabaseClient
  recognize?: typeof recognizeScreenshotText
  consume?: typeof consumeScreenshotQuota
}): Promise<{ recognition: RecognitionResult; quotaResult: QuotaResult }> {
  const recognition = await recognize(imageBase64, mimeType)
  const quotaResult = await consume(adminClient, userId, quota)
  return { recognition, quotaResult }
}
