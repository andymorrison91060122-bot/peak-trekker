import { FIELD_VALIDATION } from './field-parser.ts'
import type { OcrResult, OcrTextBlock, ParsedScreenshotFields } from './types.ts'

export const MIMO_TEXT_FIELD_KEYS = [
  'distanceKm',
  'durationSeconds',
  'speedKmh',
  'paceMinPerKm',
  'elevationMeters',
  'elevationGainMeters',
  'elevationLossMeters',
  'date',
  'location',
] as const

export type MimoTextFieldKey = (typeof MIMO_TEXT_FIELD_KEYS)[number]
export type MimoTextVisibility = 'visible' | 'not_visible' | 'ambiguous'
export type MimoTextSourceKind = 'activity_title' | 'map_label' | 'city_label' | 'route_name' | 'metric_label' | 'unknown'

export type MimoTextBBox = {
  x: number | null
  y: number | null
  width: number | null
  height: number | null
}

export type MimoEvidenceCandidate = {
  raw: string | null
  labelRaw: string | null
  unitRaw: string | null
  bbox: MimoTextBBox | null
  sourceKind: MimoTextSourceKind
  visibility: MimoTextVisibility
  confidence: number
  reason: string | null
}

export type MimoTextPayload = {
  app: string | null
  imageType: string | null
  fields: Partial<Record<MimoTextFieldKey, MimoEvidenceCandidate[]>>
  derivedOnly?: Array<{ field: string; value: string | number | null; reason: string | null }>
  notes?: string[]
}

export type MimoAdjudicatedField = {
  value: number | string | null
  raw: string | null
  labelRaw: string | null
  unitRaw: string | null
  sourceKind: MimoTextSourceKind | null
  visibility: MimoTextVisibility
  confidence: number
  candidateCount: number
  rejectedCount: number
  hints: string[]
  topCandidates: MimoEvidenceCandidate[]
}

export type MimoTextAdjudication = {
  fields: Record<MimoTextFieldKey, MimoAdjudicatedField>
  parsedFields: ParsedScreenshotFields
  acceptedFieldCount: number
  fallbackReason: string | null
}

const SOURCE_KIND_VALUES = new Set<MimoTextSourceKind>([
  'activity_title',
  'map_label',
  'city_label',
  'route_name',
  'metric_label',
  'unknown',
])

const VISIBILITY_VALUES = new Set<MimoTextVisibility>(['visible', 'not_visible', 'ambiguous'])

const LOCATION_ACTIVITY_WORDS = [
  '登山',
  '徒步',
  '跑步',
  '骑行',
  '健走',
  '越野跑',
  '户外',
  '运动',
  'hiking',
  'hike',
  'trekking',
  'running',
  'run',
  'cycling',
  'ride',
  'walk',
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function inRange(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max
}

function compactContext(item: MimoEvidenceCandidate) {
  return `${item.labelRaw ?? ''} ${item.unitRaw ?? ''} ${item.raw ?? ''} ${item.reason ?? ''}`
}

function normalizeCandidate(item: Partial<MimoEvidenceCandidate> | null | undefined): MimoEvidenceCandidate {
  const sourceKind = SOURCE_KIND_VALUES.has(item?.sourceKind as MimoTextSourceKind)
    ? item?.sourceKind as MimoTextSourceKind
    : 'unknown'
  const visibility = VISIBILITY_VALUES.has(item?.visibility as MimoTextVisibility)
    ? item?.visibility as MimoTextVisibility
    : 'ambiguous'
  const confidence = clamp(Number(item?.confidence ?? 0), 0, 1)

  return {
    raw: typeof item?.raw === 'string' ? item.raw.trim() : null,
    labelRaw: typeof item?.labelRaw === 'string' ? item.labelRaw.trim() : null,
    unitRaw: typeof item?.unitRaw === 'string' ? item.unitRaw.trim() : null,
    bbox: normalizeBBox(item?.bbox),
    sourceKind,
    visibility,
    confidence,
    reason: typeof item?.reason === 'string' ? item.reason.trim() : null,
  }
}

function normalizeBBox(value: unknown): MimoTextBBox | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    x: nullableNumber(record.x),
    y: nullableNumber(record.y),
    width: nullableNumber(record.width),
    height: nullableNumber(record.height),
  }
}

function nullableNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function labelScore(key: MimoTextFieldKey, item: MimoEvidenceCandidate) {
  const context = compactContext(item)
  if (key === 'speedKmh' && /平均|均速|avg|average/i.test(context)) return 25
  if (key === 'paceMinPerKm' && /平均配速|配速|pace/i.test(context)) return 25
  if (key === 'elevationGainMeters' && /累计|累积|爬升|上升|gain|ascent|climb/i.test(context)) return 28
  if (key === 'elevationLossMeters' && /累计|累积|下降|下坡|descent|loss|down/i.test(context)) return 28
  if (key === 'elevationMeters' && /最高海拔|最高点|海拔|altitude|elevation/i.test(context)) return 22
  if (key === 'location') {
    if (item.sourceKind === 'city_label' || item.sourceKind === 'map_label') return 26
    if (item.sourceKind === 'route_name') return 20
    if (item.sourceKind === 'activity_title') return 14
  }
  return 0
}

function visibilityScore(item: MimoEvidenceCandidate) {
  if (item.visibility === 'visible') return 15
  if (item.visibility === 'ambiguous') return -20
  return -50
}

function parseNumber(raw: string, mode: 'decimal' | 'meter' = 'decimal') {
  const text = raw.trim().replace(/\s+/g, '')
  const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/u)
  if (!match) return null
  if (mode === 'meter' && /^[0-9]{1,3}[.,][0-9]{3}$/u.test(match[0])) {
    const meterValue = Number(match[0].replace(/[.,]/u, ''))
    return Number.isFinite(meterValue) ? meterValue : null
  }
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

function parseDistanceKm(raw: string, context: string) {
  const value = parseNumber(raw)
  if (value === null) return null
  if (/米|meter|metre/i.test(context) && !/千米|公里|km/i.test(context)) return value / 1000
  return value
}

function parseSpeedCandidate(raw: string, context: string): { value: number | null; hints: string[] } {
  const hints: string[] = []
  if (/最快|最快速度|最大速度|最高速度|slowest|fastest|max/i.test(context)) {
    hints.push('candidate conflict: fastest/max speed')
  }
  if (/配速|\/\s*(?:公里|km)|min\/km|pace/i.test(context) && !/km\/h|公里\/小时|公里\/时/i.test(context)) {
    return { value: null, hints: ['derived only: pace is not speed'] }
  }
  return { value: parseNumber(raw), hints }
}

function parsePaceCandidate(raw: string, context: string): { value: number | null; hints: string[] } {
  if (/km\/h|公里\/小时|公里\/时/i.test(context) && !/配速|pace/i.test(context)) {
    return { value: null, hints: ['derived only: speed is not pace'] }
  }
  if (/最快配速|fastest pace/i.test(context)) return { value: null, hints: ['candidate conflict: fastest pace'] }
  return { value: parsePaceMinutes(raw), hints: [] }
}

function parsePaceMinutes(raw: string) {
  const text = raw.trim()
  const quote = text.match(/(\d{1,2})\s*['′:]\s*(\d{2})/u)
  if (quote) return Number(quote[1]) + Number(quote[2]) / 60
  return parseNumber(text)
}

function parseMeterCandidate(
  raw: string,
  context: string,
  kind: 'altitude' | 'gain' | 'loss'
): { value: number | null; hints: string[] } {
  if (kind === 'altitude' && /累计|累积|爬升|上升|下降|gain|ascent|climb|descent|loss/i.test(context)) {
    return { value: null, hints: ['candidate conflict: gain/loss label is not elevation'] }
  }
  if (
    (kind === 'gain' || kind === 'loss') &&
    /最高海拔|最低海拔|最高点|最低点|altitude/i.test(context) &&
    !/累计|累积|爬升|上升|下降|gain|ascent|climb|descent|loss/i.test(context)
  ) {
    return { value: null, hints: ['candidate conflict: elevation label is not gain/loss'] }
  }
  if (kind === 'gain' && /下降|descent|loss|down/i.test(context) && !/上升|爬升|gain|ascent|climb/i.test(context)) {
    return { value: null, hints: ['candidate conflict: loss label is not gain'] }
  }
  if (kind === 'loss' && /上升|爬升|gain|ascent|climb/i.test(context) && !/下降|descent|loss|down/i.test(context)) {
    return { value: null, hints: ['candidate conflict: gain label is not loss'] }
  }
  return { value: parseNumber(raw, 'meter'), hints: [] }
}

function cleanLocationText(raw: string) {
  let cleaned = raw
    .replace(/\s+/gu, ' ')
    .replace(/^[·,，/／\-\s]+|[·,，/／\-\s]+$/gu, '')
    .trim()
  if (!cleaned) return null

  const activityOnly = new RegExp(`^(?:${LOCATION_ACTIVITY_WORDS.join('|')})$`, 'iu')
  if (activityOnly.test(cleaned)) return null

  for (const word of LOCATION_ACTIVITY_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned
      .replace(new RegExp(`(?:^|[\\s·,，/／-])${escaped}(?:$|[\\s·,，/／-])`, 'giu'), ' ')
      .replace(/\s+/gu, ' ')
      .trim()
  }

  cleaned = cleaned.replace(/^[·,，/／\-\s]+|[·,，/／\-\s]+$/gu, '').trim()
  return cleaned || null
}

function parseLocationCandidate(raw: string, item: MimoEvidenceCandidate): { value: string | null; hints: string[] } {
  const cleaned = cleanLocationText(raw)
  const hints: string[] = []
  if (!cleaned) return { value: null, hints: ['activity type is not location'] }
  if (/^[A-Za-z\s,.-]+$/u.test(cleaned) && /[\u4e00-\u9fa5]/u.test(item.reason ?? '')) {
    hints.push('source ambiguous: possible translation')
  }
  if (item.sourceKind === 'unknown') hints.push('source ambiguous')
  return { value: cleaned, hints }
}

export function parseDurationCandidate(raw: string, context = ''): { value: number | null; hints: string[] } {
  const normalized = raw.trim()
  const chinese = normalized.match(/(?:(\d+(?:\.\d+)?)\s*(?:小时|时|h))?\s*(?:(\d+(?:\.\d+)?)\s*(?:分钟|分|m|min))?\s*(?:(\d+(?:\.\d+)?)\s*(?:秒|s))?/iu)
  if (chinese?.[0]?.trim() && (chinese[1] || chinese[2] || chinese[3])) {
    const hours = Number(chinese[1] ?? 0)
    const minutes = Number(chinese[2] ?? 0)
    const seconds = Number(chinese[3] ?? 0)
    return { value: Math.round(hours * 3600 + minutes * 60 + seconds), hints: [] }
  }

  const suunto = normalized.match(/^(\d{1,3}):(\d{2})['′](\d{2})$/u)
  if (suunto) return { value: Number(suunto[1]) * 3600 + Number(suunto[2]) * 60 + Number(suunto[3]), hints: [] }

  const token = normalized.match(/\d{1,3}:\d{2}(?::\d{2}(?:\.\d+)?)?/)?.[0]
  if (!token) return { value: null, hints: ['raw missing'] }
  const parts = token.split(':').map(Number)
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return { value: Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]), hints: [] }
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    const first = parts[0]
    const second = parts[1]
    const hourContext = /耗时|用时|时长|时间|全程耗时|总时长|总时间|总用时|elapsed|moving time/i.test(context)
    if (first >= 24) return { value: first * 60 + second, hints: [] }
    return { value: first * 3600 + second * 60, hints: hourContext ? [] : ['partial duration: interpreted as hours:minutes'] }
  }
  return { value: null, hints: ['raw missing'] }
}

export function parseDateCandidate(raw: string): { value: string | null; hints: string[] } {
  const text = raw.trim()
  const ymd = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/u) ?? text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/u)
  if (ymd) return { value: `${ymd[1]}-${pad2(ymd[2])}-${pad2(ymd[3])}`, hints: [] }

  const dmy = text.match(/(\d{1,2})[.](\d{1,2})[.](20\d{2})/u)
  if (dmy) return { value: `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`, hints: [] }

  const md = text.match(/(\d{1,2})月\s*(\d{1,2})日(?:\s*(?:@)?\s*(?:上午|下午)?\s*(\d{1,2})[:：](\d{2}))?/u)
  if (md) {
    const hour = md[3] ? normalizeHour(text, Number(md[3])) : null
    const minute = md[4] ? pad2(md[4]) : null
    return { value: `${pad2(md[1])}-${pad2(md[2])}${hour !== null && minute ? ` ${pad2(hour)}:${minute}` : ''}`, hints: ['partial date'] }
  }

  return { value: null, hints: ['raw missing'] }
}

function normalizeHour(text: string, hour: number) {
  if (/下午/u.test(text) && hour < 12) return hour + 12
  if (/上午/u.test(text) && hour === 12) return 0
  return hour
}

function pad2(value: string | number) {
  return String(value).padStart(2, '0')
}

function parseCandidateValue(
  key: MimoTextFieldKey,
  item: MimoEvidenceCandidate
): { value: number | string | null; hints: string[] } {
  const raw = item.raw?.trim() ?? ''
  const context = compactContext(item)
  if (!raw) return { value: null, hints: ['raw missing'] }
  if (item.visibility === 'not_visible') return { value: null, hints: ['candidate marked not_visible'] }

  if (key === 'distanceKm') return { value: parseDistanceKm(raw, context), hints: [] }
  if (key === 'durationSeconds') return parseDurationCandidate(raw, context)
  if (key === 'speedKmh') return parseSpeedCandidate(raw, context)
  if (key === 'paceMinPerKm') return parsePaceCandidate(raw, context)
  if (key === 'elevationMeters') return parseMeterCandidate(raw, context, 'altitude')
  if (key === 'elevationGainMeters') return parseMeterCandidate(raw, context, 'gain')
  if (key === 'elevationLossMeters') return parseMeterCandidate(raw, context, 'loss')
  if (key === 'date') return parseDateCandidate(raw)
  return parseLocationCandidate(raw, item)
}

function sanityCheck(key: MimoTextFieldKey, value: number | string): string | null {
  if (typeof value !== 'number') return null
  if (key === 'distanceKm' && !inRange(value, FIELD_VALIDATION.distance.min, FIELD_VALIDATION.distance.max)) return 'sanity rejected: distance out of range'
  if (key === 'durationSeconds' && !inRange(value, FIELD_VALIDATION.duration.min, FIELD_VALIDATION.duration.max)) return 'sanity rejected: duration out of range'
  if (key === 'speedKmh' && !inRange(value, FIELD_VALIDATION.speed.min, FIELD_VALIDATION.speed.max)) return 'sanity rejected: speed out of range'
  if (key === 'paceMinPerKm' && !inRange(value, FIELD_VALIDATION.pace.min, FIELD_VALIDATION.pace.max)) return 'sanity rejected: pace out of range'
  if (key === 'elevationMeters' && !inRange(value, FIELD_VALIDATION.altitude.min, FIELD_VALIDATION.altitude.max)) return 'sanity rejected: elevation out of range'
  if (
    (key === 'elevationGainMeters' || key === 'elevationLossMeters') &&
    !inRange(value, FIELD_VALIDATION.elevation_gain.min, FIELD_VALIDATION.elevation_gain.max)
  ) {
    return 'sanity rejected: ascent/descent out of range'
  }
  return null
}

export function adjudicateField(key: MimoTextFieldKey, candidates: Array<Partial<MimoEvidenceCandidate>>): MimoAdjudicatedField {
  const normalized = candidates.map(normalizeCandidate)
  const accepted: Array<{ candidate: MimoEvidenceCandidate; value: number | string; hints: string[]; score: number }> = []
  const rejectedHints: string[] = []

  for (const item of normalized) {
    const result = parseCandidateValue(key, item)
    if (result.value === null) {
      rejectedHints.push(...result.hints)
      continue
    }
    const sanity = sanityCheck(key, result.value)
    if (sanity) {
      rejectedHints.push(sanity)
      continue
    }
    accepted.push({
      candidate: item,
      value: result.value,
      hints: result.hints,
      score: item.confidence * 100 + labelScore(key, item) + visibilityScore(item),
    })
  }

  accepted.sort((a, b) => b.score - a.score)
  const best = accepted[0]
  const hints = [...new Set([...(best?.hints ?? []), ...rejectedHints])]

  if (!best) {
    return {
      value: null,
      raw: null,
      labelRaw: null,
      unitRaw: null,
      sourceKind: null,
      visibility: normalized.length ? 'ambiguous' : 'not_visible',
      confidence: 0,
      candidateCount: normalized.length,
      rejectedCount: normalized.length,
      hints: normalized.length ? [...hints, 'no accepted candidate'] : ['raw missing'],
      topCandidates: normalized.slice(0, 3),
    }
  }

  return {
    value: best.value,
    raw: best.candidate.raw,
    labelRaw: best.candidate.labelRaw,
    unitRaw: best.candidate.unitRaw,
    sourceKind: best.candidate.sourceKind,
    visibility: best.candidate.visibility,
    confidence: clamp(best.score / 140, 0, 1),
    candidateCount: normalized.length,
    rejectedCount: normalized.length - accepted.length,
    hints,
    topCandidates: normalized.slice(0, 3),
  }
}

function numberValue(value: number | string | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function applyCrossFieldConsistency(fields: Record<MimoTextFieldKey, MimoAdjudicatedField>) {
  const distance = numberValue(fields.distanceKm.value)
  const duration = numberValue(fields.durationSeconds.value)
  const speed = numberValue(fields.speedKmh.value)
  if (!distance || !duration || !speed) return

  const expected = distance / (duration / 3600)
  if (Math.abs(expected - speed) > Math.max(0.4, expected * 0.12)) {
    fields.speedKmh.hints.push(`candidate conflict: speed ${speed.toFixed(2)} differs from distance/duration ${expected.toFixed(2)}`)
    fields.speedKmh.confidence = Math.min(fields.speedKmh.confidence, 0.45)
  }
}

function toParsedFields(fields: Record<MimoTextFieldKey, MimoAdjudicatedField>): ParsedScreenshotFields {
  const parsed: ParsedScreenshotFields = {}
  const distance = numberValue(fields.distanceKm.value)
  if (distance !== null) parsed.distance = { value: Math.round(distance * 100) / 100, unit: 'km', raw: fields.distanceKm.raw ?? String(distance) }

  const duration = numberValue(fields.durationSeconds.value)
  if (duration !== null) parsed.duration = { value: Math.round(duration), raw: fields.durationSeconds.raw ?? String(duration) }

  const speed = numberValue(fields.speedKmh.value)
  if (speed !== null) parsed.speed = { value: Math.round(speed * 100) / 100, raw: fields.speedKmh.raw ?? String(speed) }

  const pace = numberValue(fields.paceMinPerKm.value)
  if (pace !== null) parsed.paceMinPerKm = { value: Math.round(pace * 100) / 100, raw: fields.paceMinPerKm.raw ?? String(pace) }

  const elevation = numberValue(fields.elevationMeters.value)
  if (elevation !== null) parsed.elevation = { value: Math.round(elevation), raw: fields.elevationMeters.raw ?? String(elevation) }

  const gain = numberValue(fields.elevationGainMeters.value)
  if (gain !== null) parsed.elevationGain = { value: Math.round(gain), raw: fields.elevationGainMeters.raw ?? String(gain) }

  const loss = numberValue(fields.elevationLossMeters.value)
  if (loss !== null) parsed.elevationLoss = { value: Math.round(loss), raw: fields.elevationLossMeters.raw ?? String(loss) }

  if (typeof fields.date.value === 'string' && fields.date.value.trim()) {
    parsed.date = { value: fields.date.value.trim(), raw: fields.date.raw ?? fields.date.value.trim() }
  }

  if (typeof fields.location.value === 'string' && fields.location.value.trim()) {
    parsed.location = { value: fields.location.value.trim(), raw: fields.location.raw ?? fields.location.value.trim() }
  }

  return parsed
}

export function normalizeMimoTextPayload(payload: Partial<MimoTextPayload> | null | undefined): MimoTextPayload {
  const rawFields = payload?.fields ?? {}
  const fields = {} as Record<MimoTextFieldKey, MimoEvidenceCandidate[]>
  for (const key of MIMO_TEXT_FIELD_KEYS) {
    const value = rawFields[key]
    fields[key] = Array.isArray(value) ? value.map((item) => normalizeCandidate(item)) : []
  }

  return {
    app: typeof payload?.app === 'string' ? payload.app : null,
    imageType: typeof payload?.imageType === 'string' ? payload.imageType : null,
    fields,
    derivedOnly: Array.isArray(payload?.derivedOnly) ? payload.derivedOnly : [],
    notes: Array.isArray(payload?.notes) ? payload.notes.filter((item): item is string => typeof item === 'string') : [],
  }
}

export function adjudicateMimoTextPayload(payload: MimoTextPayload | null): MimoTextAdjudication {
  const normalized = normalizeMimoTextPayload(payload)
  const fields = Object.fromEntries(
    MIMO_TEXT_FIELD_KEYS.map((key) => [key, adjudicateField(key, normalized.fields[key] ?? [])])
  ) as Record<MimoTextFieldKey, MimoAdjudicatedField>

  applyCrossFieldConsistency(fields)
  const parsedFields = toParsedFields(fields)
  const acceptedFieldCount = MIMO_TEXT_FIELD_KEYS.filter((key) => fields[key].value !== null).length
  const fallbackReason = getMimoTextFallbackReason({ fields, parsedFields, acceptedFieldCount })

  return { fields, parsedFields, acceptedFieldCount, fallbackReason }
}

export function getMimoTextFallbackReason(result: Pick<MimoTextAdjudication, 'fields' | 'parsedFields' | 'acceptedFieldCount'>) {
  if (!result.parsedFields.distance) return 'mimo_missing_required_distance'
  if (result.fields.distanceKm.confidence < 0.45) return 'mimo_low_confidence_distance'
  if (result.acceptedFieldCount < 2 && result.fields.distanceKm.confidence < 0.7) return 'mimo_too_few_confident_fields'
  return null
}

function blockFromCandidate(candidate: MimoEvidenceCandidate, index: number): OcrTextBlock | null {
  const text = [candidate.labelRaw, candidate.raw, candidate.unitRaw].filter(Boolean).join(' ').trim()
  if (!text) return null
  return {
    text,
    confidence: Math.round(candidate.confidence * 100),
    x: Math.max(0, Math.round(candidate.bbox?.x ?? 0)),
    y: Math.max(0, Math.round(candidate.bbox?.y ?? index * 18)),
    width: Math.max(0, Math.round(candidate.bbox?.width ?? 0)),
    height: Math.max(0, Math.round(candidate.bbox?.height ?? 0)),
  }
}

export function ocrResultFromMimoPayload(payload: MimoTextPayload | null): OcrResult {
  const normalized = normalizeMimoTextPayload(payload)
  const blocks = MIMO_TEXT_FIELD_KEYS.flatMap((key) => normalized.fields[key] ?? [])
    .flatMap((candidate, index) => {
      const block = blockFromCandidate(candidate, index)
      return block ? [block] : []
    })
  const rawText = [...new Set(blocks.map((block) => block.text))].join('\n')
  return { textBlocks: blocks, rawText }
}
