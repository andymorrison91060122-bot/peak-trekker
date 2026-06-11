import type { SupabaseClient } from '@supabase/supabase-js'
import type { CheckinSource, Mountain, User } from '../types/index.ts'
import { isScreenshotRecognitionSource } from './trek-utils.ts'

export type LicenseLevel = User['license_level']
export type DifficultyLevel = Mountain['difficulty']

export const LICENSE_PROGRESS_ORDER = ['none', 'basic', 'intermediate', 'advanced'] as const
export const DIFFICULTY_PROGRESS_ORDER = ['beginner', 'intermediate', 'advanced', 'expert'] as const

const NEXT_LICENSE: Record<LicenseLevel, LicenseLevel | null> = {
  none: 'basic',
  basic: 'intermediate',
  intermediate: 'advanced',
  advanced: null,
}

const NEXT_TARGET_DIFFICULTY: Record<Exclude<LicenseLevel, 'advanced'>, DifficultyLevel> = {
  none: 'beginner',
  basic: 'intermediate',
  intermediate: 'advanced',
}

const DIFFICULTY_TO_RECOMMENDED_LICENSE: Record<DifficultyLevel, LicenseLevel> = {
  beginner: 'none',
  intermediate: 'basic',
  advanced: 'intermediate',
  expert: 'advanced',
}

export type LicenseProgressRecord = {
  mountainId: string | null
  difficulty?: string | null
  completionStatus?: 'complete' | 'incomplete' | null
  verifiedAt?: string | null
  sourceType?: CheckinSource | string | null
  type?: string | null
  source?: CheckinSource | string | null
}

export type LicenseProgressRung = {
  level: LicenseLevel
  state: 'done' | 'current' | 'future'
  requirement: string
}

export type LicenseProgressSummary = {
  storedLevel: LicenseLevel
  derivedLevel: LicenseLevel
  effectiveLevel: LicenseLevel
  nextLevel: LicenseLevel | null
  targetDifficulty: DifficultyLevel | null
  qualifiedCount: number
  remainingCount: number
  validGpsRecordCount: number
  rungs: LicenseProgressRung[]
}

type CheckinLicenseRow = {
  mountain_id: string | null
  type?: string | null
  source?: CheckinSource | string | null
  completion_status?: 'complete' | 'incomplete' | null
  verified_at?: string | null
  mountains: { difficulty?: string | null } | Array<{ difficulty?: string | null }> | null
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export function normalizeLicenseProgressLevel(value: string | null | undefined): LicenseLevel {
  if (value === 'basic' || value === 'intermediate' || value === 'advanced') return value
  return 'none'
}

export function normalizeDifficultyProgressLevel(value: string | null | undefined): DifficultyLevel {
  if (value === 'intermediate' || value === 'advanced' || value === 'expert') return value
  return 'beginner'
}

export function getLicenseProgressRank(level: string | null | undefined) {
  return LICENSE_PROGRESS_ORDER.indexOf(normalizeLicenseProgressLevel(level))
}

export function getDifficultyProgressRank(level: string | null | undefined) {
  return DIFFICULTY_PROGRESS_ORDER.indexOf(normalizeDifficultyProgressLevel(level))
}

export function getRecommendedLicenseForDifficulty(level: string | null | undefined): LicenseLevel {
  return DIFFICULTY_TO_RECOMMENDED_LICENSE[normalizeDifficultyProgressLevel(level)]
}

export function compareLicenseLevels(a: string | null | undefined, b: string | null | undefined) {
  return getLicenseProgressRank(a) - getLicenseProgressRank(b)
}

export function maxLicenseLevel(a: string | null | undefined, b: string | null | undefined): LicenseLevel {
  return compareLicenseLevels(a, b) >= 0 ? normalizeLicenseProgressLevel(a) : normalizeLicenseProgressLevel(b)
}

function resolveLicenseRecordSource({
  source,
  type,
}: {
  source?: CheckinSource | string | null
  type?: string | null
}): CheckinSource {
  if (
    source === 'realtime_gps' ||
    source === 'historical_photo' ||
    source === 'track_import' ||
    isScreenshotRecognitionSource(source)
  ) {
    return source
  }

  return type === 'gps' ? 'realtime_gps' : 'historical_photo'
}

function isRealtimeGpsRecord(record: LicenseProgressRecord) {
  const sourceType = record.sourceType ?? resolveLicenseRecordSource({ source: record.source, type: record.type })
  return sourceType === 'realtime_gps'
}

function isValidLicenseRecord(record: LicenseProgressRecord) {
  return (
    record.completionStatus !== 'incomplete' &&
    Boolean(record.verifiedAt) &&
    Boolean(record.mountainId) &&
    Boolean(record.difficulty) &&
    isRealtimeGpsRecord(record)
  )
}

function distinctMountainCountAtDifficulty(records: LicenseProgressRecord[], targetDifficulty: DifficultyLevel) {
  const targetRank = getDifficultyProgressRank(targetDifficulty)
  const mountainIds = new Set<string>()

  for (const record of records) {
    if (!isValidLicenseRecord(record) || !record.mountainId) continue
    if (getDifficultyProgressRank(record.difficulty) >= targetRank) {
      mountainIds.add(record.mountainId)
    }
  }

  return mountainIds.size
}

export function countValidGpsRecords(records: LicenseProgressRecord[]) {
  return records.filter(isValidLicenseRecord).length
}

export function deriveLicenseLevelFromRecords(records: LicenseProgressRecord[]): LicenseLevel {
  if (distinctMountainCountAtDifficulty(records, 'advanced') >= 3) return 'advanced'
  if (distinctMountainCountAtDifficulty(records, 'intermediate') >= 3) return 'intermediate'
  if (distinctMountainCountAtDifficulty(records, 'beginner') >= 3) return 'basic'
  return 'none'
}

function getRequirementCopy(level: LicenseLevel) {
  switch (level) {
    case 'basic':
      return '3 座 入门线 及以上 GPS 记录'
    case 'intermediate':
      return '3 座 进阶线 及以上 GPS 记录'
    case 'advanced':
      return '3 座 高阶线 及以上 GPS 记录 (含专家线)'
    default:
      return '开始积累 GPS 记录'
  }
}

export function buildLicenseProgressSummary({
  storedLevel,
  records,
}: {
  storedLevel: string | null | undefined
  records: LicenseProgressRecord[]
}): LicenseProgressSummary {
  const normalizedStoredLevel = normalizeLicenseProgressLevel(storedLevel)
  const derivedLevel = deriveLicenseLevelFromRecords(records)
  const effectiveLevel = maxLicenseLevel(normalizedStoredLevel, derivedLevel)
  const nextLevel = NEXT_LICENSE[effectiveLevel]
  const targetDifficulty = effectiveLevel === 'advanced' ? null : NEXT_TARGET_DIFFICULTY[effectiveLevel]
  const qualifiedCount = targetDifficulty ? distinctMountainCountAtDifficulty(records, targetDifficulty) : 3
  const remainingCount = targetDifficulty ? Math.max(0, 3 - qualifiedCount) : 0
  const effectiveRank = getLicenseProgressRank(effectiveLevel)

  return {
    storedLevel: normalizedStoredLevel,
    derivedLevel,
    effectiveLevel,
    nextLevel,
    targetDifficulty,
    qualifiedCount: Math.min(3, qualifiedCount),
    remainingCount,
    validGpsRecordCount: countValidGpsRecords(records),
    rungs: LICENSE_PROGRESS_ORDER.map((level, index) => ({
      level,
      state: index < effectiveRank ? 'done' : index === effectiveRank ? 'current' : 'future',
      requirement: getRequirementCopy(level),
    })),
  }
}

function toLicenseProgressRecord(row: CheckinLicenseRow): LicenseProgressRecord {
  const mountain = firstRelation(row.mountains)
  return {
    mountainId: row.mountain_id,
    type: row.type,
    source: row.source,
    completionStatus: row.completion_status ?? 'complete',
    verifiedAt: row.verified_at ?? null,
    difficulty: mountain?.difficulty ?? null,
  }
}

async function loadCurrentLicenseLevel({
  supabase,
  userId,
}: {
  supabase: SupabaseClient
  userId: string
}) {
  const { data, error } = await supabase
    .from('profiles')
    .select('license_level')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return normalizeLicenseProgressLevel((data as { license_level?: string | null } | null)?.license_level)
}

async function loadLicenseProgressRecords({
  supabase,
  userId,
}: {
  supabase: SupabaseClient
  userId: string
}) {
  const { data, error } = await supabase
    .from('checkins')
    .select('mountain_id, type, source, completion_status, verified_at, mountains(difficulty)')
    .eq('user_id', userId)

  if (error) throw error
  return ((data ?? []) as CheckinLicenseRow[]).map(toLicenseProgressRecord)
}

export async function syncUserLicenseLevel({
  supabase,
  userId,
  currentLevel,
  records,
}: {
  supabase: SupabaseClient
  userId: string
  currentLevel?: string | null
  records?: LicenseProgressRecord[]
}) {
  const [resolvedCurrentLevel, resolvedRecords] = await Promise.all([
    currentLevel === undefined ? loadCurrentLicenseLevel({ supabase, userId }) : Promise.resolve(normalizeLicenseProgressLevel(currentLevel)),
    records ? Promise.resolve(records) : loadLicenseProgressRecords({ supabase, userId }),
  ])

  const progress = buildLicenseProgressSummary({
    storedLevel: resolvedCurrentLevel,
    records: resolvedRecords,
  })

  if (compareLicenseLevels(progress.derivedLevel, resolvedCurrentLevel) > 0) {
    const { error } = await supabase
      .from('profiles')
      .update({ license_level: progress.derivedLevel })
      .eq('id', userId)

    if (error) throw error

    return {
      ...progress,
      effectiveLevel: progress.derivedLevel,
      didUpdate: true,
    }
  }

  return {
    ...progress,
    didUpdate: false,
  }
}
