import { ocr } from 'tencentcloud-sdk-nodejs-ocr'
import type {
  Coord,
  GeneralBasicOCRResponse,
  TextDetection,
} from 'tencentcloud-sdk-nodejs-ocr/tencentcloud/services/ocr/v20181119/ocr_models'
import type { OcrResult, OcrTextBlock } from './types'

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

function toOcrResult(response: GeneralBasicOCRResponse): OcrResult {
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

export async function recognizeScreenshot(imageBase64: string): Promise<OcrResult> {
  const secretId = requiredTencentCredential('TENCENT_CLOUD_SECRET_ID')
  const secretKey = requiredTencentCredential('TENCENT_CLOUD_SECRET_KEY')
  const OcrClient = ocr.v20181119.Client
  const client = new OcrClient({
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

  try {
    const response = (await client.GeneralBasicOCR({
      ImageBase64: imageBase64,
      LanguageType: 'zh',
    })) as GeneralBasicOCRResponse

    return toOcrResult(response)
  } catch (error) {
    throw new Error(`Tencent OCR failed: ${normalizeOcrError(error)}`)
  }
}
