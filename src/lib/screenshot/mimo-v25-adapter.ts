import {
  adjudicateMimoTextPayload,
  MIMO_TEXT_FIELD_KEYS,
  normalizeMimoTextPayload,
  ocrResultFromMimoPayload,
  type MimoTextAdjudication,
  type MimoTextPayload,
} from './mimo-v25-text-adjudicator.ts'
import { readImageDimensions } from './image-dimensions.ts'
import type { OcrResult, ParsedScreenshotFields } from './types.ts'

const MIMO_MODEL = 'mimo-v2.5'
const OPENAI_COMPATIBLE_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions'
export const MIMO_TEXT_TIMEOUT_MS = 45_000
const MIMO_REPAIR_MIN_REMAINING_MS = 4_000

export type MimoTextUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
}

export type MimoTextRecognitionMeta = {
  model: typeof MIMO_MODEL
  latencyMs: number
  usage: MimoTextUsage | null
  parsePath: 'direct' | 'fenced' | 'braced' | 'repair'
  repairAttempts: number
  thinkingAccepted: boolean
  fallbackReason: string | null
}

export type MimoTextRecognitionResult = {
  source: 'mimo_v25'
  ocrResult: OcrResult
  parsedFields: ParsedScreenshotFields
  adjudication: MimoTextAdjudication
  meta: MimoTextRecognitionMeta
}

type MimoResponseBody = {
  choices?: Array<{ message?: { content?: unknown } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

function requiredMimoApiKey() {
  const value = process.env.MIMO_API_KEY
  if (!value) throw new Error('MIMO_API_KEY is not configured')
  return value
}

function dataUriFromImage(imageBase64: string, mimeType: string) {
  return `data:${mimeType};base64,${imageBase64}`
}

function promptForImage(width: number | null, height: number | null) {
  const coordinateRule = width && height
    ? `Use the original image pixel coordinate system: x=0..${width}, y=0..${height}, origin at top-left.`
    : 'Use the original image pixel coordinate system when returning bbox values.'

  return `You are a visual evidence extraction engine for hiking, trekking, running, cycling, and outdoor activity screenshots.

Return JSON only. Do not use Markdown.
${coordinateRule}

Hard rules:
- No sample id, app/style hint, expected value, or prior knowledge is available. Read only the image.
- Extract visible evidence candidates. Do not calculate derived stats.
- Do not translate place names. Preserve the visible original text.
- Do not infer a missing year. If only month/day is visible, keep only the partial visible date.
- Do not collapse conflicting values into one. Return multiple candidates with reasons.
- Speed is km/h. Pace is min/km. They are separate fields.
- Elevation/highest altitude/current altitude is not cumulative gain/ascent/climb.
- Descent/loss/down is separate from ascent/gain/climb.
- Calories, heart rate, steps, cadence, training load, fastest speed, and fastest pace must not be used as another field.

Return this schema:
{
  "app": string | null,
  "imageType": "activity_summary" | "route_summary" | "watch_summary" | "map_route" | "unclear",
  "fields": {
    "distanceKm": [candidate],
    "durationSeconds": [candidate],
    "speedKmh": [candidate],
    "paceMinPerKm": [candidate],
    "elevationMeters": [candidate],
    "elevationGainMeters": [candidate],
    "elevationLossMeters": [candidate],
    "date": [candidate],
    "location": [candidate]
  },
  "derivedOnly": [{"field": string, "value": string | number | null, "reason": string | null}],
  "notes": [string]
}

candidate:
{
  "raw": string | null,
  "labelRaw": string | null,
  "unitRaw": string | null,
  "bbox": {"x": number | null, "y": number | null, "width": number | null, "height": number | null} | null,
  "sourceKind": "activity_title" | "map_label" | "city_label" | "route_name" | "metric_label" | "unknown",
  "visibility": "visible" | "not_visible" | "ambiguous",
  "confidence": number,
  "reason": string | null
}

Field-specific guidance:
- distanceKm: visible distance/route length only. raw should be the visible value text, e.g. "10.32".
- durationSeconds: visible duration/time only. raw should remain visible time text, e.g. "3:34:19"; do not convert to seconds.
- speedKmh: visible average speed in km/h only. Exclude fastest/max/slowest speed.
- paceMinPerKm: visible average pace in min/km only. Exclude fastest pace.
- elevationMeters: highest/current altitude/elevation only.
- elevationGainMeters: cumulative ascent/gain/climb/up only.
- elevationLossMeters: cumulative descent/loss/down only.
- date: visible date/time text only. Preserve partial month/day if no year is visible.
- location: visible title, city, route name, or map label candidates. Preserve original text, do not translate.

Product fields: ${MIMO_TEXT_FIELD_KEYS.join(', ')}.`
}

function openAiPayload(dataUri: string, width: number | null, height: number | null, includeThinking: boolean) {
  return {
    model: MIMO_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptForImage(width, height) },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 3200,
    ...(includeThinking ? { thinking: { type: 'disabled' } } : {}),
  }
}

function repairPayload(invalidText: string) {
  return {
    model: MIMO_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Repair this model response into valid JSON matching the same schema. Return JSON only. Do not add or infer values.\n\n${invalidText.slice(0, 12000)}`,
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 3200,
  }
}

function usageFromBody(body: MimoResponseBody): MimoTextUsage {
  const usage = body.usage ?? {}
  return {
    inputTokens: Number(usage.prompt_tokens ?? 0),
    cachedInputTokens: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
  }
}

function messageText(body: MimoResponseBody) {
  const content = body.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (!part || typeof part !== 'object') return ''
      const text = (part as { text?: unknown }).text
      return typeof text === 'string' ? text : ''
    }).join('\n')
  }
  return ''
}

function parseJsonText(text: string): { ok: true; value: MimoTextPayload; path: 'direct' | 'fenced' | 'braced' } | { ok: false } {
  const candidates = [
    { path: 'direct' as const, text },
    { path: 'fenced' as const, text: text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1] ?? '' },
    { path: 'braced' as const, text: text.slice(Math.max(0, text.indexOf('{')), text.lastIndexOf('}') + 1) },
  ].filter((item) => item.text.trim())

  for (const candidate of candidates) {
    try {
      return { ok: true, value: normalizeMimoTextPayload(JSON.parse(candidate.text) as Partial<MimoTextPayload>), path: candidate.path }
    } catch {
      // Try the next JSON candidate.
    }
  }
  return { ok: false }
}

function remainingMs(deadline: number) {
  return Math.max(0, deadline - Date.now())
}

async function postMimo(payload: unknown, key: string, timeoutMs: number): Promise<{ body: MimoResponseBody; status: number }> {
  if (timeoutMs <= 0) throw new Error('MIMO request timed out before dispatch')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(OPENAI_COMPATIBLE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      const safeText = text.replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]')
      throw new Error(`MIMO request failed: HTTP ${response.status} ${safeText.slice(0, 300)}`)
    }
    return { status: response.status, body: JSON.parse(text) as MimoResponseBody }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`MIMO request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function primaryMimoRequest(dataUri: string, width: number | null, height: number | null, key: string, deadline: number) {
  try {
    return {
      response: await postMimo(openAiPayload(dataUri, width, height, true), key, remainingMs(deadline)),
      thinkingAccepted: true,
    }
  } catch (error) {
    if (!(error instanceof Error) || !/thinking|unsupported|invalid/i.test(error.message)) throw error
    return {
      response: await postMimo(openAiPayload(dataUri, width, height, false), key, remainingMs(deadline)),
      thinkingAccepted: false,
    }
  }
}

export async function recognizeScreenshotWithMimoV25Text(
  imageBase64: string,
  mimeType: string,
  timeoutMs = MIMO_TEXT_TIMEOUT_MS
): Promise<MimoTextRecognitionResult> {
  const key = requiredMimoApiKey()
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  const { width, height } = readImageDimensions(Buffer.from(imageBase64, 'base64'), mimeType)
  const dataUri = dataUriFromImage(imageBase64, mimeType)
  const { response, thinkingAccepted } = await primaryMimoRequest(dataUri, width, height, key, deadline)
  const text = messageText(response.body)
  const parsed = parseJsonText(text)
  let parsePath: MimoTextRecognitionMeta['parsePath']
  let payload: MimoTextPayload
  let repairAttempts = 0
  let usage = usageFromBody(response.body)

  if (parsed.ok) {
    parsePath = parsed.path
    payload = parsed.value
  } else {
    const repairRemaining = remainingMs(deadline)
    if (repairRemaining < MIMO_REPAIR_MIN_REMAINING_MS) {
      throw new Error('MIMO response was not parseable and no repair time remained')
    }
    repairAttempts = 1
    const repaired = await postMimo(repairPayload(text), key, repairRemaining)
    const repairedText = messageText(repaired.body)
    const repairedJson = parseJsonText(repairedText)
    if (!repairedJson.ok) throw new Error('MIMO response was not parseable after repair')
    parsePath = 'repair'
    payload = repairedJson.value
    const repairUsage = usageFromBody(repaired.body)
    usage = {
      inputTokens: usage.inputTokens + repairUsage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens + repairUsage.cachedInputTokens,
      outputTokens: usage.outputTokens + repairUsage.outputTokens,
      totalTokens: usage.totalTokens + repairUsage.totalTokens,
    }
  }

  const adjudication = adjudicateMimoTextPayload(payload)

  return {
    source: 'mimo_v25',
    ocrResult: ocrResultFromMimoPayload(payload),
    parsedFields: adjudication.parsedFields,
    adjudication,
    meta: {
      model: MIMO_MODEL,
      latencyMs: Date.now() - startedAt,
      usage,
      parsePath,
      repairAttempts,
      thinkingAccepted,
      fallbackReason: adjudication.fallbackReason,
    },
  }
}
