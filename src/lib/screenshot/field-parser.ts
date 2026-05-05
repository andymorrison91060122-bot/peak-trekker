import type { OcrTextBlock, ParsedScreenshotFields } from './types'

function normalizeNumber(value: string) {
  const numberValue = Number(value.replace(/,/g, ''))
  return Number.isFinite(numberValue) ? numberValue : null
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeOcrText(textBlocks: OcrTextBlock[]) {
  return textBlocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')
}

function compactOcrText(text: string) {
  return text.replace(/\s+/g, '')
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match
  }
  return null
}

function parseDistance(text: string, compactText: string): ParsedScreenshotFields['distance'] {
  const kmMatch = firstMatch(text, [
    /(?:距离|里程|总里程|路程)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:km|KM|公里|千米)/u,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:km|KM|公里|千米)/u,
  ])
  if (kmMatch?.[1]) {
    const value = normalizeNumber(kmMatch[1])
    if (value !== null) return { value, unit: 'km', raw: kmMatch[0] }
  }

  const meterMatch = firstMatch(compactText, [
    /(?:距离|里程|总里程|路程)([0-9]+(?:\.[0-9]+)?)(?:m|米)/u,
    /([0-9]{4,}(?:\.[0-9]+)?)(?:m|米)/u,
  ])
  if (meterMatch?.[1]) {
    const meters = normalizeNumber(meterMatch[1])
    if (meters !== null && meters > 100) {
      return { value: roundTo(meters / 1000, 3), unit: 'km', raw: meterMatch[0] }
    }
  }

  return undefined
}

function parseDuration(text: string, compactText: string): ParsedScreenshotFields['duration'] {
  const hmsMatch = compactText.match(/\b([0-9]{1,2}):([0-9]{2}):([0-9]{2})\b/u)
  if (hmsMatch) {
    const hours = Number(hmsMatch[1])
    const minutes = Number(hmsMatch[2])
    const seconds = Number(hmsMatch[3])
    return { value: hours * 3600 + minutes * 60 + seconds, raw: hmsMatch[0] }
  }

  const hourMinuteMatch = compactText.match(/(?:用时|时长|耗时)?([0-9]+)\s*(?:小时|h|H)([0-9]+)\s*(?:分钟|分|min|MIN)?/u)
  if (hourMinuteMatch) {
    const hours = Number(hourMinuteMatch[1])
    const minutes = Number(hourMinuteMatch[2])
    return { value: hours * 3600 + minutes * 60, raw: hourMinuteMatch[0] }
  }

  const minuteMatch = text.match(/(?:用时|时长|耗时)?\s*([0-9]+)\s*(?:分钟|分|min|MIN)\b/u)
  if (minuteMatch?.[1]) {
    return { value: Number(minuteMatch[1]) * 60, raw: minuteMatch[0] }
  }

  return undefined
}

function parseElevation(text: string, compactText: string): ParsedScreenshotFields['elevation'] {
  const match = firstMatch(compactText, [
    /最高海拔([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
    /海拔([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
  ])
  if (match?.[1]) {
    const value = normalizeNumber(match[1])
    if (value !== null) return { value, raw: match[0] }
  }

  const contextMatch = text.match(/(?:最高|海拔)[^\d\n]{0,8}([0-9]{3,5})\s*m\b/u)
  if (contextMatch?.[1]) {
    const value = normalizeNumber(contextMatch[1])
    if (value !== null) return { value, raw: contextMatch[0] }
  }

  return undefined
}

function parseElevationGain(text: string, compactText: string): ParsedScreenshotFields['elevationGain'] {
  const match = firstMatch(text, [
    /(?:累计爬升|正爬升|爬升|上升|累计上升)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
    /(?:↑|⬆)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
    /D\+?\s*([0-9]+(?:\.[0-9]+)?)/iu,
  ]) ?? firstMatch(compactText, [
    /(?:累计爬升|正爬升|爬升|上升|累计上升)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
    /(?:↑|⬆)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
  ])
  if (!match?.[1]) return undefined
  const value = normalizeNumber(match[1])
  return value === null ? undefined : { value, raw: match[0] }
}

function parseElevationLoss(text: string, compactText: string): ParsedScreenshotFields['elevationLoss'] {
  const match = firstMatch(text, [
    /(?:累计下降|下降|负爬升)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
    /(?:↓|⬇)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
    /D-\s*([0-9]+(?:\.[0-9]+)?)/iu,
  ]) ?? firstMatch(compactText, [
    /(?:累计下降|下降|负爬升)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
    /(?:↓|⬇)([0-9]+(?:\.[0-9]+)?)(?:m|米)?/u,
  ])
  if (!match?.[1]) return undefined
  const value = normalizeNumber(match[1])
  return value === null ? undefined : { value, raw: match[0] }
}

function toIsoDate(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function parseDate(compactText: string): ParsedScreenshotFields['date'] {
  const separated = compactText.match(/([12][0-9]{3})[年./-]([0-9]{1,2})[月./-]([0-9]{1,2})日?/u)
  if (separated) {
    const value = toIsoDate(separated[1], separated[2], separated[3])
    if (value) return { value, raw: separated[0] }
  }

  const compact = compactText.match(/\b([12][0-9]{3})([0-9]{2})([0-9]{2})\b/u)
  if (compact) {
    const value = toIsoDate(compact[1], compact[2], compact[3])
    if (value) return { value, raw: compact[0] }
  }

  return undefined
}

function parseSpeed(text: string, compactText: string): ParsedScreenshotFields['speed'] {
  const speedMatch = firstMatch(text, [
    /([0-9]+(?:\.[0-9]+)?)\s*(?:km\/h|公里\/小时|千米\/时)/iu,
    /(?:均速|平均速度|速度)\s*([0-9]+(?:\.[0-9]+)?)/u,
  ])
  if (speedMatch?.[1]) {
    const value = normalizeNumber(speedMatch[1])
    if (value !== null) return { value, raw: speedMatch[0] }
  }

  const paceMatch = compactText.match(/配速([0-9]+)[’'′:]([0-9]{2})(?:[”"″])?/u)
  if (paceMatch) {
    const minutes = Number(paceMatch[1])
    const seconds = Number(paceMatch[2])
    const paceMinutes = minutes + seconds / 60
    if (paceMinutes > 0) return { value: roundTo(60 / paceMinutes, 2), raw: paceMatch[0] }
  }

  return undefined
}

function parseCalories(compactText: string): ParsedScreenshotFields['calories'] {
  const match = compactText.match(/([0-9]+(?:\.[0-9]+)?)(?:kcal|千卡|大卡|卡路里)/iu)
  if (!match?.[1]) return undefined
  const value = normalizeNumber(match[1])
  return value === null ? undefined : { value, raw: match[0] }
}

function parseLocation(textBlocks: OcrTextBlock[]): ParsedScreenshotFields['location'] {
  const candidate = textBlocks
    .map((block) => block.text.trim())
    .find((text) => /(?:地点|位置|路线|山|峰|岭|徒步)/u.test(text) && !/[0-9]{2,}/u.test(text))
  if (!candidate) return undefined
  const cleaned = candidate.replace(/^(地点|位置|路线)[:：]?/u, '').trim()
  return cleaned ? { value: cleaned.slice(0, 60), raw: candidate } : undefined
}

export function parseFieldsFromOcr(textBlocks: OcrTextBlock[]): ParsedScreenshotFields {
  const text = normalizeOcrText(textBlocks)
  const compactText = compactOcrText(text)
  const distance = parseDistance(text, compactText)
  const duration = parseDuration(text, compactText)
  const elevation = parseElevation(text, compactText)
  const elevationGain = parseElevationGain(text, compactText)
  const elevationLoss = parseElevationLoss(text, compactText)
  const date = parseDate(compactText)
  const speed = parseSpeed(text, compactText)
  const calories = parseCalories(compactText)
  const location = parseLocation(textBlocks)

  return {
    ...(distance ? { distance } : {}),
    ...(duration ? { duration } : {}),
    ...(elevation ? { elevation } : {}),
    ...(elevationGain ? { elevationGain } : {}),
    ...(elevationLoss ? { elevationLoss } : {}),
    ...(date ? { date } : {}),
    ...(speed ? { speed } : {}),
    ...(calories ? { calories } : {}),
    ...(location ? { location } : {}),
  }
}

export type { OcrTextBlock, ParsedScreenshotFields }
