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
    noTextDetected?: boolean
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

function isNoTextOcrError(error: unknown) {
  const message = tencentFallbackReason(error)
  return /未检测到文本|no\s+text|text\s+not\s+detected|empty\s+ocr/i.test(message)
}

function hasUsableMimoResult(result: MimoTextRecognitionResult) {
  return getMimoTextFallbackReason({
    fields: result.adjudication.fields,
    parsedFields: result.parsedFields,
    acceptedFieldCount: result.adjudication.acceptedFieldCount,
  })
}

async function recognizeWithTencent(imageBase64: string, invoker: TencentInvoker, fallbackChain: string[]): Promise<ScreenshotRecognitionEngineResult> {
  let tencentResult: Awaited<ReturnType<TencentInvoker>>
  try {
    tencentResult = await invoker(imageBase64)
  } catch (error) {
    if (!isNoTextOcrError(error)) {
      throw error
    }

    const fallbackReason = tencentFallbackReason(error)
    return {
      source: 'accurate',
      ocrResult: { textBlocks: [], rawText: '' },
      parsedFields: {},
      fallbackReason,
      engineMeta: {
        fallback: 'accurate',
        noTextDetected: true,
        fallbackChain: [...fallbackChain, `tencent_accurate:no_text`],
      },
    }
  }

  const { source, ocrResult, fallbackReason } = tencentResult
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
