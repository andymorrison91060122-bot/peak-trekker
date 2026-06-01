import { parseFieldsFromOcr } from './field-parser.ts'
import {
  recognizeScreenshotWithMimoV25Text,
  type MimoTextRecognitionResult,
} from './mimo-v25-adapter.ts'
import { getMimoTextFallbackReason } from './mimo-v25-text-adjudicator.ts'
import { recognizeScreenshotWithFallback } from './tencent-ocr-adapter.ts'
import type {
  OcrResult,
  ParsedScreenshotFields,
  ScreenshotOcrSource,
  TencentOcrSource,
} from './types.ts'

export type ScreenshotRecognitionEngineResult = {
  source: ScreenshotOcrSource
  ocrResult: OcrResult
  parsedFields: ParsedScreenshotFields
  fallbackReason?: string
  engineMeta?: {
    primary?: 'mimo_v25'
    fallback?: TencentOcrSource
    mimo?: MimoTextRecognitionResult['meta']
    fallbackChain: string[]
  }
}

type MimoInvoker = (imageBase64: string, mimeType: string) => Promise<MimoTextRecognitionResult>
type TencentInvoker = typeof recognizeScreenshotWithFallback

export type ScreenshotRecognitionOptions = {
  mimoInvoker?: MimoInvoker
  tencentInvoker?: TencentInvoker
  forceTencent?: boolean
}

function tencentSource(source: TencentOcrSource): ScreenshotOcrSource {
  return source
}

function tencentFallbackReason(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function hasUsableMimoResult(result: MimoTextRecognitionResult) {
  return getMimoTextFallbackReason({
    fields: result.adjudication.fields,
    parsedFields: result.parsedFields,
    acceptedFieldCount: result.adjudication.acceptedFieldCount,
  })
}

async function recognizeWithTencent(imageBase64: string, invoker: TencentInvoker, fallbackChain: string[]): Promise<ScreenshotRecognitionEngineResult> {
  const { source, ocrResult, fallbackReason } = await invoker(imageBase64)
  const parsedFields = parseFieldsFromOcr(ocrResult.textBlocks)
  return {
    source: tencentSource(source),
    ocrResult,
    parsedFields,
    fallbackReason,
    engineMeta: {
      fallback: source,
      fallbackChain: fallbackReason ? [...fallbackChain, `tencent_${source}:${fallbackReason}`] : [...fallbackChain, `tencent_${source}`],
    },
  }
}

export async function recognizeScreenshotText(
  imageBase64: string,
  mimeType: string,
  options: ScreenshotRecognitionOptions = {}
): Promise<ScreenshotRecognitionEngineResult> {
  const tencentInvoker = options.tencentInvoker ?? recognizeScreenshotWithFallback
  if (options.forceTencent) {
    return recognizeWithTencent(imageBase64, tencentInvoker, ['forced_tencent'])
  }

  const mimoInvoker = options.mimoInvoker ?? recognizeScreenshotWithMimoV25Text
  const fallbackChain: string[] = []

  try {
    const mimo = await mimoInvoker(imageBase64, mimeType)
    const fallbackReason = hasUsableMimoResult(mimo)
    if (!fallbackReason) {
      return {
        source: 'mimo_v25',
        ocrResult: mimo.ocrResult,
        parsedFields: mimo.parsedFields,
        engineMeta: {
          primary: 'mimo_v25',
          mimo: { ...mimo.meta, fallbackReason: null },
          fallbackChain: ['mimo_v25'],
        },
      }
    }

    fallbackChain.push(`mimo_v25:${fallbackReason}`)
  } catch (error) {
    fallbackChain.push(`mimo_v25:${tencentFallbackReason(error)}`)
  }

  const tencent = await recognizeWithTencent(imageBase64, tencentInvoker, fallbackChain)
  return {
    ...tencent,
    engineMeta: {
      ...tencent.engineMeta,
      primary: 'mimo_v25',
      fallbackChain: tencent.engineMeta?.fallbackChain ?? fallbackChain,
    },
  }
}
