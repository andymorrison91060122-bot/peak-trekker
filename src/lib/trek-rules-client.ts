const QA_TREK_RULES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS === 'true'

export const TREK_RULES = {
  minTrackPoints: QA_TREK_RULES_ENABLED ? 2 : 8,
  minSessionSeconds: QA_TREK_RULES_ENABLED ? 1 : 90,
  defaultApproachRadiusM: 500,
  defaultSummitRadiusM: 300,
  maxDriftSpeedMps: 9.5,
} as const
