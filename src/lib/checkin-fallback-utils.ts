export function isMissingOptionalCheckinColumnError(message: string | null | undefined, column: string) {
  const normalized = String(message ?? '').toLowerCase()
  const target = column.toLowerCase()

  if (!normalized.includes(target)) return false

  return (
    normalized.includes('does not exist') ||
    normalized.includes('schema cache') ||
    normalized.includes('could not find') ||
    normalized.includes(`'${target}' column`)
  )
}
