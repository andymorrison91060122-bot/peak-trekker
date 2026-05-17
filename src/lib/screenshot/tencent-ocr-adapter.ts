import { ocr } from 'tencentcloud-sdk-nodejs-ocr'
import type {
  Coord,
  GeneralAccurateOCRResponse,
  GeneralBasicOCRResponse,
  TextDetection,
} from 'tencentcloud-sdk-nodejs-ocr/tencentcloud/services/ocr/v20181119/ocr_models'
import type { OcrResult, OcrTextBlock, TencentOcrSource } from './types'

const OCR_REGION = 'ap-guangzhou'

function requiredTencentCredential(name: 'TENCENT_CLOUD_SECRET_ID' | 'TENCENT_CLOUD_SECRET_KEY') {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function polygonBounds(polygon: Coord[] | undefined) {
  const coordinates = (polygon ?? []).flatMap((point) => {
    const x = Number(point.X)
    const y = Number(point.Y)
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : []
  })

  if (!coordinates.length) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const xs = coordinates.map((point) => point.x)
  const ys = coordinates.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

function normalizeTextDetection(detection: TextDetection): OcrTextBlock | null {
  const text = detection.DetectedText?.trim()
  if (!text) return null

  return {
    text,
    confidence: Number.isFinite(Number(detection.Confidence)) ? Number(detection.Confidence) : 0,
    ...polygonBounds(detection.Polygon),
  }
}

function toOcrResult(response: GeneralBasicOCRResponse | GeneralAccurateOCRResponse): OcrResult {
  const textBlocks = (response.TextDetections ?? []).flatMap((detection) => {
    const normalized = normalizeTextDetection(detection)
    return normalized ? [normalized] : []
  })

  return {
    textBlocks,
    rawText: textBlocks.map((block) => block.text).join('\n'),
  }
}

function normalizeOcrError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Tencent OCR request failed'
}

function createTencentOcrClient() {
  const secretId = requiredTencentCredential('TENCENT_CLOUD_SECRET_ID')
  const secretKey = requiredTencentCredential('TENCENT_CLOUD_SECRET_KEY')
  const OcrClient = ocr.v20181119.Client
  return new OcrClient({
    credential: { secretId, secretKey },
    region: OCR_REGION,
    profile: {
      signMethod: 'TC3-HMAC-SHA256',
      httpProfile: {
        reqMethod: 'POST',
        reqTimeout: 30,
      },
    },
  })
}

export async function recognizeScreenshotWithSource(
  imageBase64: string,
  source: TencentOcrSource
): Promise<OcrResult> {
  const client = createTencentOcrClient()
  try {
    const response = source === 'accurate'
      ? (await client.GeneralAccurateOCR({
          ImageBase64: imageBase64,
        })) as GeneralAccurateOCRResponse
      : (await client.GeneralBasicOCR({
          ImageBase64: imageBase64,
          LanguageType: 'zh',
        })) as GeneralBasicOCRResponse

    return toOcrResult(response)
  } catch (error) {
    throw new Error(`Tencent ${source} OCR failed: ${normalizeOcrError(error)}`)
  }
}

function shouldFallbackToAccurate(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/not configured/i.test(message)) return false
  return /limit|quota|rate|timeout|timed out|socket|network|ECONN|failed/i.test(message)
}

export async function recognizeScreenshotWithFallback(
  imageBase64: string,
  invoker = recognizeScreenshotWithSource
): Promise<{ source: TencentOcrSource; ocrResult: OcrResult; fallbackReason?: string }> {
  try {
    const basicResult = await invoker(imageBase64, 'basic')
    if (basicResult.textBlocks.length > 0) {
      return { source: 'basic', ocrResult: basicResult }
    }

    const accurateResult = await invoker(imageBase64, 'accurate')
    return {
      source: 'accurate',
      ocrResult: accurateResult,
      fallbackReason: 'basic_empty_result',
    }
  } catch (error) {
    if (!shouldFallbackToAccurate(error)) {
      throw error
    }

    const accurateResult = await invoker(imageBase64, 'accurate')
    return {
      source: 'accurate',
      ocrResult: accurateResult,
      fallbackReason: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function recognizeScreenshot(imageBase64: string): Promise<OcrResult> {
  return recognizeScreenshotWithSource(imageBase64, 'basic')
}
