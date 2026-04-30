const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const DEV_TRACE_PATTERN =
  /\b(?:qa|debug|helper|seed|staging|fixture|sandbox)\b|系统\s*id|开发说明|测试用户名|qa\s*console|manual acceptance|product qa/i
const USERNAME_TRACE_PATTERN =
  /^(?:qa|test|debug|seed|helper|system|dev)[-_ ]|(?:qa|test|debug|seed|helper|system|dev)[-_ ]\d+$/i
const SYSTEM_NUMERIC_TITLE_PATTERN = /^[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z\s_-]{0,24}\s+\d{8,}$/u

function collapseWhitespace(value: string) {
  return value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function isSuspiciousUiTrace(value: string) {
  const normalized = value.trim()
  if (!normalized) return false
  return UUID_PATTERN.test(normalized) || EMAIL_PATTERN.test(normalized) || DEV_TRACE_PATTERN.test(normalized)
}

function filterTraceLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isSuspiciousUiTrace(line))
    .join('\n')
}

export function sanitizeCommunityUsername(username: string | null | undefined, fallback = '山友') {
  const normalized = collapseWhitespace(typeof username === 'string' ? username : '')
  if (!normalized) return fallback
  if (USERNAME_TRACE_PATTERN.test(normalized) || isSuspiciousUiTrace(normalized)) {
    return fallback
  }
  return normalized
}

export function sanitizeCommunityTitle(value: string | null | undefined, fallback: string) {
  const normalized = collapseWhitespace(typeof value === 'string' ? value : '')
  if (!normalized || isSuspiciousUiTrace(normalized) || SYSTEM_NUMERIC_TITLE_PATTERN.test(normalized)) {
    return fallback
  }
  return normalized
}

export function sanitizeCommunityText(value: string | null | undefined, fallback = '') {
  const normalized = collapseWhitespace(filterTraceLines(typeof value === 'string' ? value : ''))
  if (!normalized || isSuspiciousUiTrace(normalized)) {
    return fallback
  }
  return normalized
}

export function sanitizeCommunityLine(value: string | null | undefined, fallback = '') {
  const normalized = collapseWhitespace(typeof value === 'string' ? value : '')
  if (!normalized || isSuspiciousUiTrace(normalized)) {
    return fallback
  }
  return normalized
}
