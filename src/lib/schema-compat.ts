const SCHEMA_COMPATIBILITY_PATTERNS = [
  'could not find',
  'schema cache',
  'does not exist',
  'relationship',
  'column',
]

export function isSchemaCompatibilityErrorMessage(message?: string | null) {
  if (!message) return false
  const normalized = message.toLowerCase()
  return SCHEMA_COMPATIBILITY_PATTERNS.some((pattern) => normalized.includes(pattern))
}
