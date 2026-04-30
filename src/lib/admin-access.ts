type AdminAccessInput = {
  email?: string | null
  isAdmin?: boolean | null
}

function parseAdminEmails(...rawValues: Array<string | undefined>) {
  return rawValues
    .flatMap((rawValue) => {
      if (!rawValue) return []
      return rawValue
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    })
    .filter((value, index, values) => values.indexOf(value) === index)
}

export function canAccessAdminTools({ email, isAdmin }: AdminAccessInput) {
  if (isAdmin) return true

  const allowlist = parseAdminEmails(
    process.env.ADMIN_EMAILS,
    process.env.COMMUNITY_TEST_ADMIN_EMAIL,
    process.env.ONBOARDING_ADMIN_EMAILS
  )
  if (!email) return false
  return allowlist.includes(email.toLowerCase())
}
