import {
  recognizeScreenshotWithMimoV25Text,
  type MimoTextRecognitionResult,
} from './mimo-v25-adapter.ts'
import { getMimoTextFallbackReason } from './mimo-v25-text-adjudicator.ts'
import type {
  OcrResult,
  ParsedScreenshotFields,
  ScreenshotOcrSource,
} from './types.ts'

export type ScreenshotRecognitionEngineResult = {
  source: ScreenshotOcrSource
  ocrResult: OcrResult
  parsedFields: ParsedScreenshotFields
  fallbackReason?: string
  engineMeta?: {
    primary?: 'mimo_v25'
    mimo?: MimoTextRecognitionResult['meta']
    fallbackChain: string[]
  }
}

type MimoInvoker = (imageBase64: string, mimeType: string) => Promise<MimoTextRecognitionResult>

export type ScreenshotRecognitionOptions = {
  mimoInvoker?: MimoInvoker
}

export async function recognizeScreenshotText(
  imageBase64: string,
  mimeType: string,
  options: ScreenshotRecognitionOptions = {},
): Promise<ScreenshotRecognitionEngineResult> {
  const mimoInvoker = options.mimoInvoker ?? recognizeScreenshotWithMimoV25Text
  const mimo = await mimoInvoker(imageBase64, mimeType)
  const fallbackReason = getMimoTextFallbackReason({
    fields: mimo.adjudication.fields,
    parsedFields: mimo.parsedFields,
    acceptedFieldCount: mimo.adjudication.acceptedFieldCount,
  })

  return {
    source: 'mimo_v25',
    ocrResult: mimo.ocrResult,
    parsedFields: mimo.parsedFields,
    fallbackReason: fallbackReason ?? undefined,
    engineMeta: {
      primary: 'mimo_v25',
      mimo: mimo.meta,
      fallbackChain: ['mimo_v25'],
    },
  }
}
