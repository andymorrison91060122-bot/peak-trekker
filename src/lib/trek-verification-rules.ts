export const TREK_DEV_DEFAULT_MIN_TRACK_POINTS = 1
export const TREK_DEV_DEFAULT_MIN_SESSION_SECONDS = 10
const STRICT_TREK_MIN_TRACK_POINTS = 8
const STRICT_TREK_MIN_SESSION_SECONDS = 90

export type TrekVerificationRules = {
  minTrackPoints: number
  minSessionSeconds: number
}

export type TrekRulesEnv = {
  nodeEnv?: string
  publicMinTrackPoints?: string | null
  publicMinSessionSeconds?: string | null
  allowServerDevBypass?: string | null
}

export function isProductionEnvironment(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv === 'production'
}

function parsePositiveInteger(value: string | null | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

export function isTrekClientTestModeEnabled(
  searchParams: Pick<URLSearchParams, 'get'> | null | undefined,
  env: TrekRulesEnv = {}
) {
  if (isProductionEnvironment(env.nodeEnv)) return false
  return searchParams?.get('testMode') === '1'
}

export function resolveTrekClientVerificationRules({
  testMode,
  env = {},
}: {
  testMode: boolean
  env?: TrekRulesEnv
}): TrekVerificationRules {
  if (!testMode || isProductionEnvironment(env.nodeEnv)) {
    return {
      minTrackPoints: STRICT_TREK_MIN_TRACK_POINTS,
      minSessionSeconds: STRICT_TREK_MIN_SESSION_SECONDS,
    }
  }

  return {
    minTrackPoints: parsePositiveInteger(
      env.publicMinTrackPoints ?? process.env.NEXT_PUBLIC_TREK_TEST_MIN_POINTS,
      TREK_DEV_DEFAULT_MIN_TRACK_POINTS
    ),
    minSessionSeconds: parsePositiveInteger(
      env.publicMinSessionSeconds ?? process.env.NEXT_PUBLIC_TREK_TEST_MIN_SECONDS,
      TREK_DEV_DEFAULT_MIN_SESSION_SECONDS
    ),
  }
}

export function isTrekServerDevBypassAllowed({
  requestedTestMode,
  isLocalSession,
  env = {},
}: {
  requestedTestMode: boolean
  isLocalSession: boolean
  env?: TrekRulesEnv
}) {
  if (!requestedTestMode || isProductionEnvironment(env.nodeEnv)) return false
  return isLocalSession || (env.allowServerDevBypass ?? process.env.ALLOW_TREK_DEV_BYPASS) === '1'
}

export function resolveTrekServerVerificationRules({
  requestedTestMode,
  isLocalSession,
  env = {},
}: {
  requestedTestMode: boolean
  isLocalSession: boolean
  env?: TrekRulesEnv
}): TrekVerificationRules {
  const enabled = isTrekServerDevBypassAllowed({ requestedTestMode, isLocalSession, env })
  if (!enabled) {
    return {
      minTrackPoints: STRICT_TREK_MIN_TRACK_POINTS,
      minSessionSeconds: STRICT_TREK_MIN_SESSION_SECONDS,
    }
  }

  return {
    minTrackPoints: parsePositiveInteger(
      env.publicMinTrackPoints ?? process.env.NEXT_PUBLIC_TREK_TEST_MIN_POINTS,
      TREK_DEV_DEFAULT_MIN_TRACK_POINTS
    ),
    minSessionSeconds: parsePositiveInteger(
      env.publicMinSessionSeconds ?? process.env.NEXT_PUBLIC_TREK_TEST_MIN_SECONDS,
      TREK_DEV_DEFAULT_MIN_SESSION_SECONDS
    ),
  }
}
