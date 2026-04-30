type DebugAccessInput = {
  email?: string | null
  isAdmin?: boolean | null
}

export function parseOnboardingAdminEmails(rawValue: string | undefined) {
  if (!rawValue) return []
  return rawValue
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function canAccessOnboardingDebugTools({ email, isAdmin }: DebugAccessInput) {
  if (process.env.NODE_ENV !== 'production') return true
  if (isAdmin) return true

  const allowlist = parseOnboardingAdminEmails(process.env.ONBOARDING_ADMIN_EMAILS)
  if (!email) return false
  return allowlist.includes(email.toLowerCase())
}
