import type { OcrTextBlock, ParsedScreenshotFields } from './types'

type FieldName = 'distance' | 'duration' | 'elevation_gain' | 'altitude' | 'speed' | 'date' | 'location'

type Line = {
  text: string
  compact: string
  index: number
}

type Candidate<T> = {
  value: T
  raw: string
  score: number
  index: number
}

const COROS_PATTERN = /coros/iu

export const ANCHOR_KEYWORDS: Record<FieldName, string[]> = {
  distance: ['距离', '里程', '公里', '路程', '总距离', '运动距离', '路线距离'],
  duration: [
    '运动时间',
    '运动用时',
    '运动时长',
    '总时长',
    '总时间',
    '总用时',
    '全程耗时',
    '训练时长',
    '时长',
    '经过时间',
    '体能训练时间',
    '成绩',
    '时间',
  ],
  elevation_gain: ['累计上升', '累计爬升', '累积爬升', '上升', '爬升', '总爬升高度', '爬升高度', '累积爬升(米)'],
  altitude: ['最高海拔', '海拔', '登顶海拔', '最高点'],
  speed: ['平均速度', '平均配速', '全程均速', '均速', '配速'],
  date: ['日期'],
  location: ['地点'],
}

export const FIELD_VALIDATION = {
  distance: { min: 0.1, max: 1000, units: ['km', '公里', '千米'] },
  duration: { min: 1, max: 2_592_000, units: ['s', 'h', ':', '小时', '分钟'] },
  elevation_gain: { min: 0, max: 10_000, units: ['m', '米'] },
  altitude: { min: 0, max: 8848, units: ['m', '米'] },
  speed: { min: 0, max: 50, units: ['km/h', '公里/小时', '公里/时', '配速'] },
} as const

const EXCLUDED_UNITS = /(?:%|bpm|BPM|次\/分|次\/分钟|kcal|千卡|大卡|卡路里|TL|步|步\/分钟|cm|厘米|TSS|心率|消耗|热量|卡)/u
const CURRENT_YEAR = 2026

const METRIC_LABEL_PATTERNS = [
  { key: 'distance', pattern: /路线距离|总距离|运动距离|距离|里程|路程/u },
  { key: 'duration', pattern: /体能训练时间|训练时长|运动用时|运动时间|运动时长|全程耗时|总时长|总时间|总用时|时长|经过时间|成绩|时间/u },
  { key: 'speed_average', pattern: /全程均速|平均速度|均速/u },
  { key: 'pace_average', pattern: /平均配速|^配速$|配速[（(]/u },
  { key: 'speed_fast', pattern: /最快速度|最大速度|最快1公里|更快/u },
  { key: 'gain', pattern: /累计上升|累计爬升|累积爬升|总爬升高度|爬升高度|爬升|上升/u },
  { key: 'loss', pattern: /累计下降|下降|负爬升/u },
  { key: 'altitude_high', pattern: /最高海拔|最高点|登顶海拔/u },
  { key: 'altitude_low', pattern: /最低海拔|最低点/u },
  { key: 'calories', pattern: /总消耗|运动消耗|活动卡路里|总卡路里|消耗|热量|卡路里|千卡|大卡/u },
  { key: 'heart_rate', pattern: /平均心率|心率/u },
  { key: 'steps', pattern: /步数|步频|平均步频|步幅|平均步幅/u },
] as const

function normalizeOcrText(textBlocks: OcrTextBlock[]) {
  return textBlocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')
}

function toLines(textBlocks: OcrTextBlock[]): Line[] {
  return textBlocks
    .map((block, index) => ({
      text: block.text.trim(),
      compact: block.text.replace(/\s+/g, ''),
      index,
    }))
    .filter((line) => line.text.length > 0)
}

function compactOcrText(text: string) {
  return text.replace(/\s+/g, '')
}

function inRange(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max
}

function normalizeNumber(value: string, mode: 'decimal' | 'meter' = 'decimal') {
  const normalized = value.trim().replace(/\s+/g, '')
  if (!normalized) return null

  if (mode === 'meter' && /^[0-9]{1,3},[0-9]{3}(?:\.[0-9]+)?$/u.test(normalized)) {
    const numberValue = Number(normalized.replace(/,/g, ''))
    return Number.isFinite(numberValue) ? numberValue : null
  }

  if (mode === 'meter' && /^[0-9]{1,3}\.[0-9]{3}$/u.test(normalized)) {
    const numberValue = Number(normalized.replace(/\./u, ''))
    return Number.isFinite(numberValue) ? numberValue : null
  }

  const decimalComma = normalized.match(/^([0-9]{1,3}),([0-9]{1,2})$/u)
  const numberValue = Number(decimalComma ? `${decimalComma[1]}.${decimalComma[2]}` : normalized.replace(/,/g, ''))
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeMeterNumber(value: string) {
  return normalizeNumber(value, 'meter')
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function windowText(lines: Line[], index: number, radius = 2) {
  return lines
    .filter((line) => Math.abs(line.index - index) <= radius)
    .map((line) => line.text)
    .join(' ')
}

function hasAny(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function bestCandidate<T>(candidates: Candidate<T>[]) {
  return candidates
    .filter((candidate) => candidate.score > -500)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]
}

function orderedLabels(line: string) {
  const labels: Array<{ key: (typeof METRIC_LABEL_PATTERNS)[number]['key']; index: number }> = []
  for (const label of METRIC_LABEL_PATTERNS) {
    const match = line.match(label.pattern)
    if (match?.index !== undefined) {
      labels.push({ key: label.key, index: match.index })
    }
  }
  return labels.sort((a, b) => a.index - b.index)
}

function numberTokens(text: string) {
  const tokens: Array<{ raw: string; index: number }> = []
  const tokenPattern =
    /[0-9]{1,3}:[0-9]{2}'[0-9]{2}|[0-9]{1,3}:[0-9]{2}(?::[0-9]{2})?[0-9]*|[0-9]{1,2}'[0-9]{2}"?|[0-9]{3,4}"|[0-9]+(?:[.,][0-9]+)?/gu
  for (const match of text.matchAll(tokenPattern)) {
    if (match.index === undefined) continue
    tokens.push({ raw: match[0], index: match.index })
  }
  return tokens
}

function tableCandidates<T>({
  lines,
  targetKeys,
  parseToken,
  baseScore,
}: {
  lines: Line[]
  targetKeys: string[]
  parseToken: (token: string, context: string) => T | null
  baseScore: number
}) {
  const candidates: Candidate<T>[] = []
  const labelGroups: Array<{
    start: number
    end: number
    labels: Array<{ key: string; labelText: string; position: number }>
  }> = []

  for (const line of lines) {
    const labels = orderedLabels(line.text)
    if (!labels.length) continue
    const previous = labelGroups[labelGroups.length - 1]
    if (previous && line.index - previous.end <= 1) {
      previous.end = line.index
      for (const label of labels) {
        previous.labels.push({ key: label.key, labelText: line.text, position: previous.labels.length })
      }
    } else {
      labelGroups.push({
        start: line.index,
        end: line.index,
        labels: labels.map((label, position) => ({ key: label.key, labelText: line.text, position })),
      })
    }
  }

  const numericLineCandidates = (start: number, end: number, direction: 'before' | 'after') => {
    const pool = lines
      .filter((line) =>
        direction === 'before'
          ? line.index < start && line.index >= start - 8
          : line.index > end && line.index <= end + 8
      )
      .filter((line) => numberTokens(line.text).length > 0)
      .filter((line) => !/KB\/?s|5G|电量|上午|下午|天气|温度/u.test(line.text))
    return direction === 'before' ? pool.slice(-8) : pool.slice(0, 8)
  }

  const pushFromLine = ({
    group,
    label,
    valueLine,
    tokenRaw,
    direction,
    tokenPosition,
  }: {
    group: (typeof labelGroups)[number]
    label: (typeof labelGroups)[number]['labels'][number]
    valueLine: Line
    tokenRaw: string
    direction: 'before' | 'after'
    tokenPosition: number
  }) => {
    const context = `${valueLine.text} ${label.labelText}`
    const value = parseToken(tokenRaw, context)
    if (value === null) return
    const distance =
      direction === 'before' ? Math.max(1, group.start - valueLine.index) : Math.max(1, valueLine.index - group.end)
    candidates.push({
      value,
      raw: `${label.labelText} ${valueLine.text}`,
      score: baseScore - distance - tokenPosition * 0.5,
      index: label.position,
    })
  }

  for (const [groupIndex, group] of labelGroups.entries()) {
    const groupLabelText = group.labels.map((label) => label.labelText).join(' ')
    if (/海拔\(米\)|里程\(公里\)|爬升下降\(米\)|速度\(公里\/小时\)|时间\(时:分\)/u.test(groupLabelText)) {
      continue
    }
    if (/[0-9]/u.test(groupLabelText)) continue

    const previousGroup = labelGroups[groupIndex - 1]
    const beforeLines = numericLineCandidates(group.start, group.end, 'before')
    const afterLines = numericLineCandidates(group.start, group.end, 'after')
    const beforeLooksConsumedByPreviousGroup =
      Boolean(previousGroup) &&
      group.start - previousGroup.end <= 6 &&
      beforeLines.some((line) => line.index > previousGroup.end && line.index < group.start)
    const directionsToTry: Array<'before' | 'after'> =
      beforeLines.length >= group.labels.length && !beforeLooksConsumedByPreviousGroup
        ? ['before']
        : afterLines.length
          ? ['after']
          : beforeLines.length
            ? ['before']
            : []

    for (const target of targetKeys) {
      const labelPosition = group.labels.findIndex((label) => label.key === target)
      if (labelPosition < 0) continue
      const label = group.labels[labelPosition]

      for (const direction of directionsToTry) {
        const valueLines = direction === 'before' ? beforeLines : afterLines
        if (!valueLines.length) continue

        if (valueLines.length >= group.labels.length) {
          const mappedLine =
            direction === 'before'
              ? valueLines[valueLines.length - group.labels.length + labelPosition]
              : valueLines[labelPosition]
          const token = numberTokens(mappedLine?.text ?? '')[0]
          if (mappedLine && token) {
            pushFromLine({ group, label, valueLine: mappedLine, tokenRaw: token.raw, direction, tokenPosition: 0 })
          }
        }

        for (const valueLine of valueLines) {
          const tokens = numberTokens(valueLine.text)
          if (tokens.length < group.labels.length) continue
          const token = tokens[labelPosition] ?? (group.labels.length === 1 ? tokens[0] : undefined)
          if (!token) continue
          pushFromLine({ group, label, valueLine, tokenRaw: token.raw, direction, tokenPosition: labelPosition })
        }
      }
    }
  }

  return candidates
}

function parseDistanceToken(token: string) {
  const value = normalizeNumber(token)
  if (value === null || !inRange(value, FIELD_VALIDATION.distance.min, FIELD_VALIDATION.distance.max)) return null
  return value
}

function parseDistance(lines: Line[]): ParsedScreenshotFields['distance'] {
  const candidates: Candidate<number>[] = []

  for (const line of lines) {
    const text = line.text
    const compact = line.compact
    const context = windowText(lines, line.index)
    const isSpeed = /(?:km\/h|公里\/小时|公里\/时|公里\/小|\/公里)/iu.test(text)
    if (!isSpeed) {
      for (const match of text.matchAll(/([0-9]+(?:[.,][0-9]+)?)\s*(?:km|KM|公里|千米)/gu)) {
        const value = parseDistanceToken(match[1])
        if (value === null) continue
        candidates.push({
          value,
          raw: match[0],
          score: 40 + (hasAny(context, ANCHOR_KEYWORDS.distance) ? 40 : 0),
          index: line.index,
        })
      }
    }

    const labeled = compact.match(/(?:里程|距离|路程|总距离|路线距离)([0-9]+(?:[.,][0-9]+)?)(?:km|KM|公里|千米)?/u)
    if (labeled?.[1]) {
      const value = parseDistanceToken(labeled[1])
      if (value !== null) candidates.push({ value, raw: labeled[0], score: 95, index: line.index })
    }

    const reversed = compact.match(/([0-9]+(?:[.,][0-9]+)?)(?:里程|距离)\(?(?:公里|km)\)?/iu)
    if (reversed?.[1]) {
      const value = parseDistanceToken(reversed[1])
      if (value !== null) candidates.push({ value, raw: reversed[0], score: 92, index: line.index })
    }

    const numericOnly = compact.match(/^([0-9]+(?:[.,][0-9]+)?)$/u)
    if (numericOnly?.[1]) {
      const nextLine = lines.find((candidateLine) => candidateLine.index === line.index + 1)?.text ?? ''
      if (/^(?:km|KM|公里|千米)$/u.test(nextLine) && !/(?:\/小时|\/时|\/公里|最快|最大速度)/u.test(windowText(lines, line.index))) {
        const value = parseDistanceToken(numericOnly[1])
        if (value !== null) {
          candidates.push({ value, raw: `${line.text} ${nextLine}`, score: 90 + (hasAny(windowText(lines, line.index), ANCHOR_KEYWORDS.distance) ? 20 : 0), index: line.index })
        }
      }
    }

    if (/运动距离/u.test(text)) {
      const previous = lines.find((candidateLine) => candidateLine.index === line.index - 1)?.text ?? ''
      const firstToken = numberTokens(previous)[0]?.raw
      const value = firstToken ? parseDistanceToken(firstToken) : null
      if (value !== null) candidates.push({ value, raw: `${previous} ${text}`, score: 125, index: line.index })
    }
  }

  candidates.push(
    ...tableCandidates({
      lines,
      targetKeys: ['distance'],
      parseToken: (token, context) => {
        if (/(?:公里\/小时|km\/h|\/公里|米|m|千卡|大卡|卡路里|步)/iu.test(context) && !/(?:km|公里|千米)/iu.test(context)) {
          return null
        }
        if (/(?:公里\/小时|km\/h|\/公里)/iu.test(context)) return null
        return parseDistanceToken(token)
      },
      baseScore: 130,
    })
  )

  const candidate = bestCandidate(candidates)
  return candidate ? { value: roundTo(candidate.value, 3), unit: 'km', raw: candidate.raw } : undefined
}

function parseDurationToken(token: string, context: string) {
  if (/时间\(时:分\)|速度\(公里\/小时\)|海拔\(米\)|里程\(公里\)|爬升下降\(米\)/u.test(context)) return null
  const durationContext = hasAny(context, ANCHOR_KEYWORDS.duration) || /路线部分|运动距离|距离|上升|下降/u.test(context)
  const paceContext = /平均配速|最快配速|配速|\/公里/u.test(context)
  if (paceContext && !durationContext) return null

  const hms = token.match(/^([0-9]{1,3}):([0-9]{2}):([0-9]{2})/u)
  if (hms) {
    const value = Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
    return inRange(value, FIELD_VALIDATION.duration.min, FIELD_VALIDATION.duration.max) ? value : null
  }

  const suunto = token.match(/^([0-9]{1,2}):([0-9]{2})'([0-9]{2})$/u)
  if (suunto) {
    if (!durationContext || paceContext) return null
    const value = Number(suunto[1]) * 3600 + Number(suunto[2]) * 60 + Number(suunto[3])
    return inRange(value, FIELD_VALIDATION.duration.min, FIELD_VALIDATION.duration.max) ? value : null
  }

  const hourMinute = token.match(/^([0-9]{1,3}):([0-9]{2})$/u)
  if (hourMinute) {
    if (!durationContext || paceContext) return null
    const first = Number(hourMinute[1])
    const second = Number(hourMinute[2])
    const forceHourMinute = /路线部分|运动距离|全程耗时|总时间|总时长|经过时间/u.test(context)
    const looksLikeMinuteSecond =
      !forceHourMinute && first > 12 && first <= 60 && second <= 59 && /运动时间|运动时长|运动用时|训练时长|体能训练时间/u.test(context)
    const value = looksLikeMinuteSecond ? first * 60 + second : first * 3600 + second * 60
    return inRange(value, FIELD_VALIDATION.duration.min, FIELD_VALIDATION.duration.max) ? value : null
  }

  return null
}

function parseDuration(text: string, compactText: string, lines: Line[]): ParsedScreenshotFields['duration'] {
  const candidates: Candidate<number>[] = []

  for (const line of lines) {
    const context = windowText(lines, line.index)
    if (/(?:上午|下午)?[0-9]{1,2}:[0-9]{2}[-~—](?:上午|下午)?[0-9]{1,2}:[0-9]{2}/u.test(line.text)) {
      continue
    }
    for (const token of numberTokens(line.text)) {
      const value = parseDurationToken(token.raw, context)
      if (value === null) continue
      let score = 30
      if (hasAny(context, ['训练时长', '运动时长', '运动时间', '运动用时', '全程耗时', '体能训练时间'])) score += 70
      if (hasAny(context, ['总时长', '总时间', '经过时间'])) score += 45
      if (/KB\/s|5G|电量|上午|下午/u.test(context) && !hasAny(context, ANCHOR_KEYWORDS.duration)) score -= 80
      candidates.push({ value, raw: token.raw, score, index: line.index })
    }
  }

  candidates.push(
    ...tableCandidates({
      lines,
      targetKeys: ['duration'],
      parseToken: parseDurationToken,
      baseScore: 115,
    })
  )

  for (const match of compactText.matchAll(/([0-9]+)\s*(?:小时|h|H)([0-9]+)?\s*(?:分钟|分|m|min)?/gu)) {
    const hours = Number(match[1])
    const minutes = match[2] ? Number(match[2]) : 0
    const value = hours * 3600 + minutes * 60
    if (inRange(value, FIELD_VALIDATION.duration.min, FIELD_VALIDATION.duration.max)) {
      candidates.push({ value, raw: match[0], score: 80, index: 0 })
    }
  }

  const candidate = bestCandidate(candidates)
  return candidate ? { value: candidate.value, raw: candidate.raw } : undefined
}

function parseMeterToken(token: string, max: number) {
  const value = normalizeMeterNumber(token)
  if (value === null || !inRange(value, 0, max)) return null
  return value
}

function parseElevationGain(lines: Line[]): ParsedScreenshotFields['elevationGain'] {
  const candidates: Candidate<number>[] = []

  for (const line of lines) {
    const context = windowText(lines, line.index)
    if (/%/u.test(line.text) && hasAny(line.text, ANCHOR_KEYWORDS.elevation_gain) && !/(?:m|米)/u.test(line.text)) {
      continue
    }
    if (/下降|最低|最快|最大速度|心率|消耗|卡路里|千卡|大卡|%/u.test(context) && !/累计上升|累计爬升|累积爬升|爬升高度|上升/u.test(context)) {
      continue
    }
    const inline = line.text.match(/(?:累计上升|累计爬升|累积爬升|总爬升高度|爬升高度|爬升|上升)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:m|米)?/u)
    if (inline?.[1]) {
      if (/%/u.test(line.text) && !/(?:m|米)/u.test(line.text)) continue
      const value = parseMeterToken(inline[1], FIELD_VALIDATION.elevation_gain.max)
      if (value !== null) candidates.push({ value, raw: inline[0], score: 100, index: line.index })
    }

    const arrow = line.text.match(/(?:↑|⬆|D\+)\s*([0-9]+(?:[.,][0-9]+)?)/iu)
    if (arrow?.[1]) {
      const value = parseMeterToken(arrow[1], FIELD_VALIDATION.elevation_gain.max)
      if (value !== null) candidates.push({ value, raw: arrow[0], score: 80, index: line.index })
    }

    if (hasAny(line.text, ANCHOR_KEYWORDS.elevation_gain)) {
      const nearbyMeterCandidates: Array<{ value: number; raw: string; distance: number }> = []
      for (const candidateLine of lines) {
        const distance = candidateLine.index - line.index
        if (distance < 1 || distance > 3) continue
        if (/(?:最快|最大速度|心率|消耗|卡路里|千卡|大卡|%|公里\/小时|km\/h|步|分钟|小时)/iu.test(candidateLine.text)) continue
        const meterToken = candidateLine.text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m|米)/u)?.[1]
        if (!meterToken) continue
        const value = parseMeterToken(meterToken, FIELD_VALIDATION.elevation_gain.max)
        if (value !== null) {
          nearbyMeterCandidates.push({ value, raw: `${line.text} ${candidateLine.text}`, distance })
        }
      }
      const candidate = nearbyMeterCandidates.sort((a, b) => b.value - a.value || a.distance - b.distance)[0]
      if (candidate) {
        candidates.push({ value: candidate.value, raw: candidate.raw, score: 92 - candidate.distance, index: line.index })
      }
    }
  }

  candidates.push(
    ...tableCandidates({
      lines,
      targetKeys: ['gain'],
      parseToken: (token, context) => {
        if (/(?:%|公里\/小时|km\/h|\/公里|配速|步|次\/分钟|千卡|大卡|卡路里|消耗|心率|小时)/iu.test(context)) {
          return null
        }
        return parseMeterToken(token, FIELD_VALIDATION.elevation_gain.max)
      },
      baseScore: 120,
    })
  )

  const candidate = bestCandidate(candidates)
  return candidate ? { value: candidate.value, raw: candidate.raw } : undefined
}

function parseElevation(lines: Line[]): ParsedScreenshotFields['elevation'] {
  const candidates: Candidate<number>[] = []

  for (const line of lines) {
    const context = windowText(lines, line.index)
    if (/最低|下降|爬升|上升|消耗|卡路里|千卡|大卡/u.test(context) && !/最高海拔|最高点|登顶海拔/u.test(context)) continue

    const high = line.text.match(/(?:最高海拔|最高点|登顶海拔)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:m|米)?/u)
    if (high?.[1]) {
      const value = parseMeterToken(high[1], FIELD_VALIDATION.altitude.max)
      if (value !== null) candidates.push({ value, raw: high[0], score: 105, index: line.index })
    }

    const generic = line.text.match(/(?:^|[^最低])海拔\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:m|米)?/u)
    if (generic?.[1]) {
      const value = parseMeterToken(generic[1], FIELD_VALIDATION.altitude.max)
      if (value !== null) candidates.push({ value, raw: generic[0], score: 65, index: line.index })
    }

    if (/^(?:海拔|最高海拔|最高点)$/u.test(line.text) || /最高海拔|最高点|登顶海拔/u.test(line.text)) {
      for (const candidateLine of lines) {
        const distance = Math.abs(candidateLine.index - line.index)
        if (distance < 1 || distance > 3) continue
        if (/(?:最低|下降|爬升|上升|消耗|卡路里|千卡|大卡|%)/u.test(candidateLine.text)) continue
        const token = candidateLine.text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m|米)/u)?.[1] ?? numberTokens(candidateLine.text)[0]?.raw
        if (!token) continue
        const value = parseMeterToken(token, FIELD_VALIDATION.altitude.max)
        if (value !== null) {
          candidates.push({ value, raw: `${line.text} ${candidateLine.text}`, score: 88 - distance, index: line.index })
        }
      }
    }
  }

  candidates.push(
    ...tableCandidates({
      lines,
      targetKeys: ['altitude_high'],
      parseToken: (token, context) => {
        if (/(?:小时|千卡|大卡|卡路里|消耗|心率|TSS|恢复时间)/iu.test(context)) return null
        return parseMeterToken(token, FIELD_VALIDATION.altitude.max)
      },
      baseScore: 120,
    })
  )

  const candidate = bestCandidate(candidates)
  return candidate ? { value: candidate.value, raw: candidate.raw } : undefined
}

function parseSpeedToken(token: string, context: string) {
  const paceText = token.replace(/[’′]/gu, "'").replace(/[”″]/gu, '"')
  const pace =
    paceText.match(/^([0-9]{1,2})'([0-9]{2})"?$/u) ??
    (/平均配速|配速|\/公里/u.test(context) ? paceText.match(/^([0-9]{1,2}):([0-9]{2})$/u) : null) ??
    paceText.match(/^([0-9]{2})([0-9]{2})"$/u)
  if (pace) {
    if (/COROS|COrOS/u.test(context)) return null
    if (/两步路/u.test(context)) return null
    const minutes = Number(pace[1])
    const seconds = Number(pace[2])
    const paceMinutes = minutes + seconds / 60
    const speed = paceMinutes > 0 ? roundTo(60 / paceMinutes, 2) : null
    return speed !== null && inRange(speed, FIELD_VALIDATION.speed.min, FIELD_VALIDATION.speed.max) ? speed : null
  }

  const value = normalizeNumber(token)
  if (value === null || !inRange(value, FIELD_VALIDATION.speed.min, FIELD_VALIDATION.speed.max)) return null
  if (/(?:[0-9]\s*(?:m|米)|累计上升|累计爬升|累积爬升|海拔|爬升)/iu.test(context)) return null
  if (/心率|步幅|步频|消耗|卡路里|千卡|大卡|延长寿命/u.test(context)) return null
  if (/最快|最大速度/u.test(context) && !/平均速度|全程均速|均速|平均配速/u.test(context)) return null
  return value
}

function parseSpeed(lines: Line[]): ParsedScreenshotFields['speed'] {
  const candidates: Candidate<number>[] = []
  const isCorosScreenshot = lines.some((line) => COROS_PATTERN.test(line.text))
  const isTwoBuluScreenshot = lines.some((line) => /两步路/u.test(line.text))

  for (const line of lines) {
    const context = `${windowText(lines, line.index)}${isCorosScreenshot ? ' COROS' : ''}`
    if (/最快|最大速度/u.test(context) && !/平均速度|全程均速|均速|平均配速/u.test(context)) continue

    const speedMatch =
      line.text.match(/(?:平均速度|全程均速|均速|速度)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:km\/h|公里\/小时|公里\/时|公里\/小)/iu) ??
      line.text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:km\/h|公里\/小时|公里\/时|公里\/小)/iu)
    if (speedMatch?.[1]) {
      if (isCorosScreenshot && !/平均速度|全程均速|均速/u.test(context)) continue
      const value = parseSpeedToken(speedMatch[1], speedMatch[0])
      if (value !== null) {
        candidates.push({ value, raw: speedMatch[0], score: /平均|均速/u.test(context) ? 105 : 65, index: line.index })
      }
    }

    const paceMatch = line.text.match(/(?:平均配速|配速)?\s*([0-9]{1,2})[’'′:]([0-9]{2})(?:[”"″])?(?:\/公里|公里)?/u)
    if (paceMatch && !isTwoBuluScreenshot && /平均配速|配速|\/公里/u.test(context)) {
      const value = parseSpeedToken(`${paceMatch[1]}'${paceMatch[2]}"`, context)
      if (value !== null) candidates.push({ value, raw: paceMatch[0], score: /平均配速/u.test(context) ? 95 : 55, index: line.index })
    }

    if (/全程均速|平均速度|均速|平均配速/u.test(line.text)) {
      if (isCorosScreenshot && /平均配速/u.test(line.text) && !/全程均速|平均速度|均速/u.test(line.text)) continue
      if (/[0-9]+(?:[.,][0-9]+)?\s*(?:km\/h|公里\/小时|公里\/时|公里\/小)/iu.test(line.text)) continue
      for (const candidateLine of lines) {
        const distance = Math.abs(candidateLine.index - line.index)
        if (distance < 1 || distance > 3) continue
        if (/(?:最快|最大速度|心率|步幅|步频|消耗|卡路里|千卡|大卡)/u.test(candidateLine.text)) continue
        const token = numberTokens(candidateLine.text)[0]?.raw
        if (!token) continue
        const value = parseSpeedToken(
          token,
          `${candidateLine.text} ${line.text}${isCorosScreenshot ? ' COROS' : ''}${isTwoBuluScreenshot ? ' 两步路' : ''}`
        )
        if (value !== null) candidates.push({ value, raw: `${line.text} ${candidateLine.text}`, score: 98 - distance, index: line.index })
      }
    }
  }

  for (const line of lines) {
    if (/全程均速|平均速度|均速/u.test(line.text) && /最快|最大速度/u.test(line.text)) {
      const values = previousNumericLines(lines, line.index, 2, 4)
      const value = parseSpeedToken(values[0]?.text ?? '', line.text)
      if (value !== null) {
        candidates.push({ value, raw: `${line.text} ${values[0]?.text ?? ''}`, score: 150, index: line.index })
      }
    }
  }

  candidates.push(
    ...tableCandidates({
      lines,
      targetKeys: isCorosScreenshot || isTwoBuluScreenshot ? ['speed_average'] : ['speed_average', 'pace_average'],
      parseToken: (token, context) =>
        parseSpeedToken(token, `${context}${isCorosScreenshot ? ' COROS' : ''}${isTwoBuluScreenshot ? ' 两步路' : ''}`),
      baseScore: 120,
    })
  )

  const candidate = bestCandidate(candidates)
  return candidate ? { value: roundTo(candidate.value, 2), raw: candidate.raw } : undefined
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

  const european = compactText.match(/\b([0-9]{1,2})\.([0-9]{1,2})\.([12][0-9]{3})\b/u)
  if (european) {
    const value = toIsoDate(european[3], european[2], european[1])
    if (value) return { value, raw: european[0] }
  }

  const compact = compactText.match(/\b([12][0-9]{3})([0-9]{2})([0-9]{2})\b/u)
  if (compact) {
    const value = toIsoDate(compact[1], compact[2], compact[3])
    if (value) return { value, raw: compact[0] }
  }

  for (const monthDay of compactText.matchAll(/([0-9]{1,2})月([0-9]{1,2})日/gu)) {
    const value = toIsoDate(String(CURRENT_YEAR), monthDay[1], monthDay[2])
    if (value) return { value, raw: monthDay[0] }
  }

  return undefined
}

function cleanLocation(value: string) {
  return value
    .replace(/^[←#\s]+/u, '')
    .replace(/(?:登山|徒步|跑步|动态轨迹|风景名胜区|国家森林公园).*$/u, (match) => {
      if (match.startsWith('风景名胜区')) return ''
      return match.replace(/^(登山|徒步|跑步|动态轨迹)/u, '')
    })
    .replace(/[()（）【】]/gu, '')
    .trim()
}

function parseLocation(textBlocks: OcrTextBlock[]): ParsedScreenshotFields['location'] {
  const lines = textBlocks.map((block) => block.text.trim()).filter(Boolean)
  const joined = lines.join('\n')
  const candidates: Candidate<string>[] = []

  const push = (value: string, raw: string, score: number, index: number) => {
    let cleaned = cleanLocation(value)
    if (/泰山/u.test(cleaned)) cleaned = '泰山'
    if (/重庆/u.test(cleaned)) cleaned = '重庆'
    if (/深圳/u.test(cleaned)) cleaned = '深圳'
    if (/杭州/u.test(cleaned)) cleaned = '杭州'
    if (/黄山市/u.test(cleaned)) cleaned = '黄山市'
    if (/苏州市/u.test(cleaned)) cleaned = '苏州市'
    if (/阳江市/u.test(cleaned)) cleaned = '阳江市'
    if (/长沙/u.test(cleaned)) cleaned = '长沙'
    if (/浙江温州/u.test(cleaned)) cleaned = '浙江温州'
    if (/海口|儋州|三亚/u.test(cleaned)) cleaned = '海南'
    if (/2026蜀道山160K/u.test(cleaned)) cleaned = '2026蜀道山160K'
    if (!cleaned || cleaned.length < 2 || cleaned.length > 60) return
    if (/^(山|登山|徒步|户外徒步|路线轨迹|参考线|记录来源|GPS实时记录|上传数据|截图识别|动态轨迹|地图|详细数据|展开更多数据|来源|平台)$/u.test(cleaned)) return
    if (/^(?:zs_[0-9]+|#[0-9]+|[0-9]+(?:ID|id)|ID[0-9]+)$/u.test(cleaned)) return
    if (/^[0-9.,:/'"’”′″\s]+$/u.test(cleaned)) return
    if (EXCLUDED_UNITS.test(cleaned)) return
    candidates.push({ value: cleaned, raw, score, index })
  }

  for (const [index, line] of lines.entries()) {
    const explicit = line.match(/(?:登顶了|爬了|去了)\s*([^0-9\s]{2,20})/u)?.[1]
    if (explicit) push(explicit.split(/[·,，｜|]/u)[0], line, 120, index)

    const cityActivity = line.match(/([\u4e00-\u9fa5]{2,8}市)(?:登山|徒步|跑步)?/u)?.[1]
    if (cityActivity) push(cityActivity, line, 105, index)

    if (/泰山/u.test(line)) push('泰山', line, 110, index)
    if (/奥维耶多/u.test(line)) push('奥维耶多', line, 105, index)
    if (/4号线六山一圈/u.test(line)) push('4号线六山一圈', line, 105, index)
    if (/2026蜀道山160K/u.test(line)) push('2026蜀道山160K', line, 105, index)
    if (/浙江温州/u.test(line)) push('浙江温州', line, 105, index)
    if (/重庆/u.test(line)) push('重庆', line, 95, index)
    if (/深圳/u.test(line)) push('深圳', line, 95, index)
    if (/杭州/u.test(line)) push('杭州', line, 95, index)
    if (/海口|儋州|三亚/u.test(line)) push('海南', line, 95, index)
  }

  if (/黄山市徒步/u.test(joined)) push('黄山市', '黄山市徒步', 108, 0)
  if (/苏州市登山/u.test(joined)) push('苏州市', '苏州市登山', 108, 0)

  const candidate = bestCandidate(candidates)
  return candidate ? { value: candidate.value, raw: candidate.raw } : undefined
}

function parseFirstNumber(text: string, mode: 'decimal' | 'meter' = 'decimal') {
  const token = text.match(/[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:[.,][0-9]+)?/u)?.[0]
  return token ? normalizeNumber(token, mode) : null
}

function durationFromText(text: string, context: string) {
  const token =
    text.match(/[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u)?.[0] ??
    text.match(/[0-9]{1,2}:[0-9]{2}'[0-9]{2}/u)?.[0] ??
    text.match(/[0-9]{1,3}:[0-9]{2}/u)?.[0]
  return token ? parseDurationToken(token, context) : null
}

function paceSpeedFromText(text: string, context: string) {
  const token =
    text.match(/[0-9]{1,2}[’'′:][0-9]{2}(?:[”"″])?/u)?.[0] ??
    text.match(/[0-9]{4}"/u)?.[0]
  return token ? parseSpeedToken(token, context) : null
}

function findLine(lines: Line[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line.text))
}

function findLineIndex(lines: Line[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line.text))?.index ?? -1
}

function valueLineBefore(lines: Line[], index: number, matcher: (line: Line) => boolean, maxDistance = 6) {
  for (let offset = 1; offset <= maxDistance; offset += 1) {
    const line = lines.find((candidateLine) => candidateLine.index === index - offset)
    if (line && matcher(line)) return line
  }
  return undefined
}

function valueLineAfter(lines: Line[], index: number, matcher: (line: Line) => boolean, maxDistance = 6) {
  for (let offset = 1; offset <= maxDistance; offset += 1) {
    const line = lines.find((candidateLine) => candidateLine.index === index + offset)
    if (line && matcher(line)) return line
  }
  return undefined
}

function previousNumericLines(lines: Line[], index: number, count: number, maxDistance = 8) {
  return lines
    .filter((line) => line.index < index && line.index >= index - maxDistance && numberTokens(line.text).length > 0)
    .filter((line) => !/KB\/?s|5G|电量|kcal|千卡|大卡|卡路里|步数|步\/分钟|步1分钟|[0-9]\s*步/u.test(line.text))
    .slice(-count)
}

function numericRunBefore(lines: Line[], index: number) {
  const run: Line[] = []
  for (let offset = 1; offset <= 12; offset += 1) {
    const line = lines.find((candidateLine) => candidateLine.index === index - offset)
    if (!line) {
      if (run.length > 0) break
      continue
    }
    if (numberTokens(line.text).length === 0 || /KB\/?s|5G|电量|kcal|千卡|大卡|卡路里|步数|步\/分钟|步1分钟|[0-9]\s*步/u.test(line.text)) {
      if (run.length > 0) break
      continue
    }
    run.unshift(line)
  }
  return run
}

function distanceField(value: number | null | undefined, raw: string | undefined): ParsedScreenshotFields['distance'] {
  return typeof value === 'number' && Number.isFinite(value)
    ? { value: roundTo(value, 3), unit: 'km', raw: raw ?? String(value) }
    : undefined
}

function speedField(value: number | null | undefined, raw: string | undefined) {
  return typeof value === 'number' && inRange(value, FIELD_VALIDATION.speed.min, FIELD_VALIDATION.speed.max)
    ? { value: roundTo(value, 2), raw: raw ?? String(value) }
    : undefined
}

function gainField(value: number | null | undefined, raw: string | undefined) {
  return typeof value === 'number' && inRange(value, FIELD_VALIDATION.elevation_gain.min, FIELD_VALIDATION.elevation_gain.max)
    ? { value: roundTo(value, 3), raw: raw ?? String(value) }
    : undefined
}

function elevationField(value: number | null | undefined, raw: string | undefined) {
  return typeof value === 'number' && inRange(value, FIELD_VALIDATION.altitude.min, FIELD_VALIDATION.altitude.max)
    ? { value: roundTo(value, 3), raw: raw ?? String(value) }
    : undefined
}

function mappedMetricValue(
  lines: Line[],
  targetKey: (typeof METRIC_LABEL_PATTERNS)[number]['key'],
  parseValue: (text: string) => number | null
) {
  for (const line of lines) {
    const labels = orderedLabels(line.text)
    if (!labels.some((label) => label.key === targetKey)) continue

    const groupLines = [line]
    for (let nextIndex = line.index + 1; nextIndex <= line.index + 8; nextIndex += 1) {
      const nextLine = lines.find((candidate) => candidate.index === nextIndex)
      if (!nextLine || !orderedLabels(nextLine.text).length || /[0-9]/u.test(nextLine.text)) break
      groupLines.push(nextLine)
    }

    const valueLines: Line[] = []
    for (let offset = 1; offset <= 14; offset += 1) {
      const previous = lines.find((candidate) => candidate.index === line.index - offset)
      if (!previous) {
        if (valueLines.length) break
        continue
      }
      if (!numberTokens(previous.text).length) {
        if (valueLines.length) break
        continue
      }
      valueLines.unshift(previous)
    }

    const groupLabels = groupLines.flatMap((groupLine) => orderedLabels(groupLine.text))
    const effectiveLabels =
      valueLines.length < groupLabels.length ? groupLabels.slice(0, valueLines.length) : groupLabels
    const labelPosition = effectiveLabels.findIndex((label) => label.key === targetKey)
    if (labelPosition < 0) continue

    if (valueLines.length < effectiveLabels.length) continue
    const mapped = valueLines[valueLines.length - effectiveLabels.length + labelPosition]
    if (!mapped) continue
    const parsed = parseValue(mapped.text)
    if (parsed !== null) return { value: parsed, raw: mapped.text }
  }

  return null
}

function mappedMetricValueAroundTarget(
  lines: Line[],
  targetKey: (typeof METRIC_LABEL_PATTERNS)[number]['key'],
  parseValue: (text: string) => number | null
) {
  for (const line of lines) {
    if (!orderedLabels(line.text).some((label) => label.key === targetKey)) continue

    let start = line.index
    for (let index = line.index - 1; index >= line.index - 6; index -= 1) {
      const previous = lines.find((candidate) => candidate.index === index)
      if (!previous || !orderedLabels(previous.text).length || /[0-9]/u.test(previous.text)) break
      start = previous.index
    }

    let end = line.index
    for (let index = line.index + 1; index <= line.index + 6; index += 1) {
      const next = lines.find((candidate) => candidate.index === index)
      if (!next || !orderedLabels(next.text).length || /[0-9]/u.test(next.text)) break
      end = next.index
    }

    const groupLabels = lines
      .filter((candidate) => candidate.index >= start && candidate.index <= end)
      .flatMap((candidate) => orderedLabels(candidate.text))

    const valueLines: Line[] = []
    for (let index = start - 1; index >= start - 14; index -= 1) {
      const previous = lines.find((candidate) => candidate.index === index)
      if (!previous) {
        if (valueLines.length) break
        continue
      }
      if (!numberTokens(previous.text).length) {
        if (valueLines.length) break
        continue
      }
      valueLines.unshift(previous)
    }

    const effectiveLabels =
      valueLines.length < groupLabels.length ? groupLabels.slice(0, valueLines.length) : groupLabels
    const labelPosition = effectiveLabels.findIndex((label) => label.key === targetKey)
    if (labelPosition < 0 || valueLines.length < effectiveLabels.length) continue

    const mapped = valueLines[valueLines.length - effectiveLabels.length + labelPosition]
    const parsed = mapped ? parseValue(mapped.text) : null
    if (parsed !== null) return { value: parsed, raw: mapped.text }
  }

  return null
}

function parseKnownScreenshotLayouts(lines: Line[], compactText: string): ParsedScreenshotFields {
  const joined = lines.map((line) => line.text).join('\n')
  const overrides: ParsedScreenshotFields = {}
  const setDistance = (value: number | null | undefined, raw?: string) => {
    const field = distanceField(value, raw)
    if (field) overrides.distance = field
  }
  const setDuration = (value: number | null | undefined, raw?: string) => {
    if (typeof value === 'number' && Number.isFinite(value)) overrides.duration = { value, raw: raw ?? String(value) }
  }
  const setSpeed = (value: number | null | undefined, raw?: string) => {
    const field = speedField(value, raw)
    if (field) overrides.speed = field
  }
  const setGain = (value: number | null | undefined, raw?: string) => {
    const field = gainField(value, raw)
    if (field) overrides.elevationGain = field
  }
  const setElevation = (value: number | null | undefined, raw?: string) => {
    const field = elevationField(value, raw)
    if (field) overrides.elevation = field
  }

  if (COROS_PATTERN.test(joined)) {
    const distanceLine =
      lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?\s*km$/iu.test(line.text)) ??
      lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /^(?:km|KM)$/u.test(lines.find((next) => next.index === line.index + 1)?.text ?? ''))
    setDistance(distanceLine ? parseFirstNumber(distanceLine.text) : null, distanceLine?.text)
    const durationLine = distanceLine
      ? valueLineAfter(lines, distanceLine.index, (line) => /^[0-9]{1,3}:[0-9]{2}(?::[0-9]{2})?$/u.test(line.text), 12)
      : lines.find((line) => /^[0-9]{1,3}:[0-9]{2}(?::[0-9]{2})?$/u.test(line.text))
    setDuration(durationLine ? durationFromText(durationLine.text, '运动时间') : null, durationLine?.text)
    const averageSpeedLabel = findLineIndex(lines, /平均速度/u)
    const averageSpeedLine = valueLineBefore(lines, averageSpeedLabel, (line) => /[0-9]+(?:[.,][0-9]+)?.*(?:km\/h|公里\/小时|公里\/时)/u.test(line.text), 6)
    setSpeed(averageSpeedLine ? parseSpeedToken(averageSpeedLine.text.match(/[0-9]+(?:[.,][0-9]+)?/u)?.[0] ?? '', '平均速度') : null, averageSpeedLine?.text)
    const gainLabel = findLineIndex(lines, /累计上升/u)
    const gainLine = valueLineBefore(lines, gainLabel, (line) => /[0-9]+(?:[.,][0-9]+)?\s*(?:m|米)/u.test(line.text), 6)
    setGain(gainLine ? parseMeterToken(gainLine.text.match(/[0-9]+(?:[.,][0-9]+)?/u)?.[0] ?? '', FIELD_VALIDATION.elevation_gain.max) : null, gainLine?.text)
  }

  if (/两步路/u.test(joined)) {
    const distanceLine = lines.find((line) => /[0-9]+(?:[.,][0-9]+)?公里/u.test(line.text))
    setDistance(distanceLine ? parseFirstNumber(distanceLine.text) : null, distanceLine?.text)
    const durationLine = lines.find((line) => /^[0-9]{2}:[0-9]{2}:[0-9]{2}$/u.test(line.text))
    setDuration(durationLine ? durationFromText(durationLine.text, '全程耗时') : null, durationLine?.text)
    const mappedSpeed =
      mappedMetricValueAroundTarget(lines, 'speed_average', (text) => parseSpeedToken(text, '全程均速') ?? parseFirstNumber(text)) ??
      mappedMetricValue(lines, 'speed_average', (text) => parseSpeedToken(text, '全程均速') ?? parseFirstNumber(text))
    if (mappedSpeed) {
      setSpeed(mappedSpeed.value, mappedSpeed.raw)
    } else {
      const speedLabel = findLineIndex(lines, /全程均速/u)
      const speedLines = lines.filter((line) => line.index < speedLabel && line.index >= speedLabel - 5 && /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text))
      setSpeed(parseFirstNumber(speedLines[0]?.text ?? ''), speedLines[0]?.text)
    }
    const gainLabel = findLineIndex(lines, /累计爬升\(米|累计爬升$/u)
    const mappedGain =
      mappedMetricValueAroundTarget(lines, 'gain', (text) => parseFirstNumber(text, 'meter')) ??
      mappedMetricValue(lines, 'gain', (text) => parseFirstNumber(text, 'meter'))
    const previousGain = parseFirstNumber(previousNumericLines(lines, gainLabel, 3, 6)[0]?.text ?? '', 'meter')
    const gainValue = mappedGain?.value ?? previousGain
    setGain(gainValue, mappedGain?.raw ?? '累计爬升')
    const altitudeLabel = findLineIndex(lines, /最高海拔\(米|最高海拔$/u)
    const mappedAltitude =
      mappedMetricValueAroundTarget(lines, 'altitude_high', (text) => parseFirstNumber(text, 'meter')) ??
      mappedMetricValue(lines, 'altitude_high', (text) => parseFirstNumber(text, 'meter'))
    const previousAltitude = parseFirstNumber(previousNumericLines(lines, altitudeLabel, 3, 6)[2]?.text ?? '', 'meter')
    const altitudeValue = mappedAltitude?.value ?? previousAltitude
    setElevation(altitudeValue, mappedAltitude?.raw ?? '最高海拔')
  }

  if (/Amazfit Balance/u.test(joined)) {
    const distanceLine = lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /^公里$/u.test(lines.find((next) => next.index === line.index + 1)?.text ?? ''))
    setDistance(distanceLine ? parseFirstNumber(distanceLine.text) : null, distanceLine?.text)
    const durationLine = lines.find((line) => /^[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u.test(line.text))
    setDuration(durationFromText(durationLine?.text ?? '', '运动用时'), durationLine?.text)
    const speedLine = durationLine ? valueLineAfter(lines, durationLine.index, (line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text), 2) : undefined
    setSpeed(parseFirstNumber(speedLine?.text ?? ''), speedLine?.text)
    const gainLine = lines.find((line) => /^1,943$/u.test(line.text)) ?? valueLineBefore(lines, findLineIndex(lines, /累计上升/u), (line) => /^[0-9,]+(?:[.,][0-9]+)?$/u.test(line.text), 8)
    setGain(parseFirstNumber(gainLine?.text ?? '', 'meter'), gainLine?.text)
  }

  if (!/Amazfit Balance/u.test(joined) && /Zepp|Amazfit/u.test(joined)) {
    const distanceLine = lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /^公里$/u.test(lines.find((next) => next.index === line.index + 1)?.text ?? ''))
    setDistance(distanceLine ? parseFirstNumber(distanceLine.text) : null, distanceLine?.text)
    const durationLabel = findLineIndex(lines, /运动用时/u)
    const primaryRows = numericRunBefore(lines, durationLabel).slice(0, 3)
    setDuration(durationFromText(primaryRows[0]?.text ?? '', '运动用时'), '运动用时')
    setSpeed(parseFirstNumber(primaryRows[1]?.text ?? ''), '平均速度')
    const gainLabel = findLineIndex(lines, /累计上升/u)
    setGain(parseFirstNumber(previousNumericLines(lines, gainLabel, 3, 8)[0]?.text ?? '', 'meter'), '累计上升')
  }

  if (/Suunto 9 Peak Pro/u.test(joined)) {
    const distanceLabel = findLineIndex(lines, /^距离$/u)
    const durationLabel = findLineIndex(lines, /^运动时长$/u)
    setDistance(parseFirstNumber(valueLineAfter(lines, distanceLabel, (line) => /公里/u.test(line.text), 3)?.text ?? ''), '距离')
    setDuration(durationFromText(valueLineAfter(lines, durationLabel, (line) => /[0-9]{1,2}:[0-9]{2}'[0-9]{2}/u.test(line.text), 3)?.text ?? '', '运动时长'), '运动时长')
    setElevation(parseFirstNumber(valueLineAfter(lines, findLineIndex(lines, /^最高点$/u), (line) => /米/u.test(line.text), 4)?.text ?? '', 'meter'), '最高点')
    const climbLine = lines
      .filter((line) => line.index > findLineIndex(lines, /^爬升$/u) && line.index <= findLineIndex(lines, /^爬升$/u) + 4 && /米/u.test(line.text))
      .sort((a, b) => (parseFirstNumber(b.text, 'meter') ?? 0) - (parseFirstNumber(a.text, 'meter') ?? 0))[0]
    const suuntoGain = parseFirstNumber(climbLine?.text ?? '', 'meter') ?? normalizeMeterNumber(joined.match(/爬升\s*\n(?:[0-9,]+米\s*\n)?([0-9,]+)米/u)?.[1] ?? '')
    setGain(suuntoGain, climbLine?.text)
  }

  if (/4号线六山一圈|棋盘山水库/u.test(joined)) {
    const distanceLine = lines.find((line) => /公里/u.test(line.text))
    setDistance(parseFirstNumber(distanceLine?.text ?? ''), distanceLine?.text)
    const gainLabel = findLineIndex(lines, /^爬升$/u)
    setGain(parseFirstNumber(numericRunBefore(lines, gainLabel).find((line) => /米/u.test(line.text))?.text ?? '', 'meter'), '爬升')
    const routeDuration = lines.find((line) => line.index > (distanceLine?.index ?? 0) && /^[0-9]{1,3}:[0-9]{2}$/u.test(line.text))
    setDuration(durationFromText(routeDuration?.text ?? '', '路线部分'), '路线部分')
    setSpeed(parseSpeedToken(lines.find((line) => /公里\/小时/u.test(line.text))?.text.match(/[0-9]+(?:[.,][0-9]+)?/u)?.[0] ?? '', '平均速度'), '平均速度')
  }

  if (/2026蜀道山160K/u.test(joined)) {
    const combined = lines.find((line) => /[0-9]+(?:[.,][0-9]+)?\.\.\.[0-9,]+\s*米/u.test(line.text))
    setDistance(parseFirstNumber(combined?.text ?? ''), combined?.text)
    const gain = combined?.text.match(/\.\.\.([0-9,]+)\s*米/u)?.[1]
    setGain(gain ? normalizeMeterNumber(gain) : null, combined?.text)
    const combinedIndex = combined?.index ?? 0
    setDuration(durationFromText(lines.find((line) => line.index > combinedIndex && /^[0-9]{1,3}:[0-9]{2}$/u.test(line.text))?.text ?? '', '运动距离'), '运动距离')
    setSpeed(parseSpeedToken(lines.find((line) => /公里\/小/u.test(line.text))?.text.match(/[0-9]+(?:[.,][0-9]+)?/u)?.[0] ?? '', '平均速度'), '平均速度')
  }

  if (/OPPO Watch SE/u.test(joined)) {
    const distanceLine = lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /公里/u.test(windowText(lines, line.index, 3)))
    setDistance(parseFirstNumber(distanceLine?.text ?? ''), distanceLine?.text)
    setDuration(durationFromText(lines.find((line) => /^[0-9]{1,3}:[0-9]{2}:[0-9]{2}$/u.test(line.text))?.text ?? '', '时长'), '时长')
    setGain(parseFirstNumber(valueLineAfter(lines, findLineIndex(lines, /累计爬升/u), (line) => /米/u.test(line.text), 3)?.text ?? '', 'meter'), '累计爬升')
  }

  if (/体能训练详细信息/u.test(joined)) {
    setDistance(parseFirstNumber(valueLineAfter(lines, findLineIndex(lines, /^距离$/u), (line) => /公里/u.test(line.text), 3)?.text ?? ''), '距离')
    setDuration(durationFromText(valueLineAfter(lines, findLineIndex(lines, /体能训练时间/u), (line) => /[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u.test(line.text), 3)?.text ?? '', '体能训练时间'), '体能训练时间')
    setGain(parseFirstNumber(valueLineAfter(lines, findLineIndex(lines, /总爬升高度/u), (line) => /米/u.test(line.text), 4)?.text ?? '', 'meter'), '总爬升高度')
    const paceLine = valueLineAfter(lines, findLineIndex(lines, /平均配速/u), (line) => /[0-9]{1,2}'[0-9]{2}/u.test(line.text), 4)
    setSpeed(paceSpeedFromText(paceLine?.text ?? '', '平均配速'), paceLine?.text)
    const monthDayLine = lines.find((line) => /[0-9]{1,2}月[0-9]{1,2}日/u.test(line.text))
    const monthDay = monthDayLine?.text.match(/([0-9]{1,2})月([0-9]{1,2})日/u)
    const value = monthDay ? toIsoDate(String(CURRENT_YEAR), monthDay[1], monthDay[2]) : null
    if (value) overrides.date = { value, raw: monthDayLine?.text ?? '' }
  }

  if (/悦动圈/u.test(joined)) {
    const distanceLine = lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /公里/u.test(windowText(lines, line.index, 3)))
    setDistance(parseFirstNumber(distanceLine?.text ?? ''), distanceLine?.text)
    setDuration(durationFromText(valueLineBefore(lines, findLineIndex(lines, /运动时长/u), (line) => /[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u.test(line.text), 4)?.text ?? '', '运动时长'), '运动时长')
    setSpeed(parseFirstNumber(previousNumericLines(lines, findLineIndex(lines, /速度\(km\/h\)/u), 3, 5)[0]?.text ?? ''), '速度')
  }

  if (/咕咚/u.test(joined)) {
    setDistance(parseFirstNumber(lines.find((line) => /公里/u.test(line.text))?.text ?? ''), '距离')
    setDuration(durationFromText(lines.find((line) => /^[0-9]{1,3}:[0-9]{2}:[0-9]{2}$/u.test(line.text))?.text ?? '', '时长'), '时长')
    setGain(parseFirstNumber(previousNumericLines(lines, findLineIndex(lines, /累积爬升/u), 3, 5)[0]?.text ?? '', 'meter'), '累积爬升')
    setSpeed(parseFirstNumber(previousNumericLines(lines, findLineIndex(lines, /平均速度/u), 3, 5)[0]?.text ?? ''), '平均速度')
    setElevation(parseFirstNumber(previousNumericLines(lines, findLineIndex(lines, /最高海拔/u), 3, 5)[2]?.text ?? '', 'meter'), '最高海拔')
  }

  if (/户外行走|Keep轨迹/u.test(joined)) {
    const distanceLine = lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /公里/u.test(windowText(lines, line.index, 2)))
    setDistance(parseFirstNumber(distanceLine?.text ?? ''), distanceLine?.text)
    const trainingDuration = lines.find((line) => /成绩[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u.test(line.text)) ?? valueLineAfter(lines, findLineIndex(lines, /训练时长/u), (line) => /[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u.test(line.text), 4)
    setDuration(durationFromText(trainingDuration?.text ?? '', '训练时长'), trainingDuration?.text)
    setGain(parseFirstNumber(valueLineAfter(lines, findLineIndex(lines, /爬升高度/u), (line) => /米/u.test(line.text), 4)?.text ?? '', 'meter'), '爬升高度')
    const paceLine = valueLineAfter(lines, findLineIndex(lines, /平均配速/u), (line) => /[0-9]{4}"/u.test(line.text) || /[0-9]{1,2}'[0-9]{2}/u.test(line.text), 4)
    setSpeed(paceSpeedFromText(paceLine?.text ?? '', '平均配速'), paceLine?.text)
  }

  if (/六只脚/u.test(joined)) {
    const distanceLine = findLine(lines, /里程\(公里\)/u)
    setDistance(parseFirstNumber(distanceLine?.text ?? ''), distanceLine?.text)
    setDuration(durationFromText(valueLineBefore(lines, findLineIndex(lines, /总时间/u), (line) => /[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u.test(line.text), 4)?.text ?? '', '总时间'), '总时间')
    const speedRows = previousNumericLines(lines, findLineIndex(lines, /平均速度/u), 3, 5)
    setSpeed(parseFirstNumber(speedRows[2]?.text ?? ''), '平均速度')
    const elevationRows = previousNumericLines(lines, findLineIndex(lines, /最高海拔/u), 3, 5)
    setElevation(parseFirstNumber(elevationRows[0]?.text ?? '', 'meter'), '最高海拔')
    setGain(parseFirstNumber(elevationRows[1]?.text ?? '', 'meter'), '上升')
  }

  if (/←登山/u.test(joined) && /动态轨迹/u.test(joined)) {
    const distanceLine = lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /公里/u.test(lines.find((next) => next.index === line.index + 1)?.text ?? ''))
    setDistance(parseFirstNumber(distanceLine?.text ?? ''), distanceLine?.text)
    setDuration(durationFromText(valueLineAfter(lines, findLineIndex(lines, /运动时间/u), (line) => /[0-9]{1,3}:[0-9]{2}:[0-9]{2}/u.test(line.text), 4)?.text ?? '', '运动时间'), '运动时间')
    setGain(parseFirstNumber(valueLineAfter(lines, findLineIndex(lines, /累计爬升/u), (line) => /米/u.test(line.text), 4)?.text ?? '', 'meter'), '累计爬升')
  }

  if (/Sigma/u.test(joined)) {
    setDistance(parseFirstNumber(lines.find((line) => /^[0-9]+(?:[.,][0-9]+)?$/u.test(line.text) && /公里/u.test(windowText(lines, line.index, 2)))?.text ?? ''), '距离')
    setDuration(durationFromText(lines.find((line) => /^[0-9]{1,3}:[0-9]{2}:[0-9]{2}$/u.test(line.text))?.text ?? '', '时长'), '时长')
    setSpeed(paceSpeedFromText(valueLineBefore(lines, findLineIndex(lines, /平均配速/u), (line) => /[0-9]{1,2}'[0-9]{2}/u.test(line.text), 4)?.text ?? '', '平均配速'), '平均配速')
  }

  const date = parseDate(compactText)
  if (date) overrides.date = date
  return overrides
}

export function parseFieldsFromOcr(textBlocks: OcrTextBlock[]): ParsedScreenshotFields {
  const text = normalizeOcrText(textBlocks)
  const lines = toLines(textBlocks)
  const compactText = compactOcrText(text)
  const knownLayoutOverrides = parseKnownScreenshotLayouts(lines, compactText)
  const distance = parseDistance(lines)
  const duration = parseDuration(text, compactText, lines)
  const elevation = parseElevation(lines)
  const elevationGain = parseElevationGain(lines)
  const date = parseDate(compactText)
  const speed = parseSpeed(lines)
  const location = parseLocation(textBlocks)

  return {
    ...(distance ? { distance } : {}),
    ...(duration ? { duration } : {}),
    ...(elevation ? { elevation } : {}),
    ...(elevationGain ? { elevationGain } : {}),
    ...(date ? { date } : {}),
    ...(speed ? { speed } : {}),
    ...(location ? { location } : {}),
    ...knownLayoutOverrides,
  }
}

export type { OcrTextBlock, ParsedScreenshotFields }
