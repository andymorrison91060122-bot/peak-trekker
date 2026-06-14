const NICKNAME_ALLOWED_PATTERN = /^[A-Za-z0-9 _\-\u3400-\u4DBF\u4E00-\u9FFF\u8C48-\uFAFF]+$/u
const NICKNAME_CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u

export const PROFILE_NICKNAME_ERRORS = {
  empty: '昵称不能为空',
  tooShort: '昵称至少 2 个字',
  tooLong: '昵称最多 12 个字',
  unsupported: '不支持换行或特殊符号',
} as const

export type NicknameValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: (typeof PROFILE_NICKNAME_ERRORS)[keyof typeof PROFILE_NICKNAME_ERRORS] }

export function normalizeNickname(value: string) {
  return value.trim()
}

export function validateNickname(value: string): NicknameValidationResult {
  if (NICKNAME_CONTROL_PATTERN.test(value)) {
    return { ok: false, error: PROFILE_NICKNAME_ERRORS.unsupported }
  }

  const normalized = normalizeNickname(value)
  if (!normalized) {
    return { ok: false, error: PROFILE_NICKNAME_ERRORS.empty }
  }

  const length = Array.from(normalized).length
  if (length < 2) {
    return { ok: false, error: PROFILE_NICKNAME_ERRORS.tooShort }
  }
  if (length > 12) {
    return { ok: false, error: PROFILE_NICKNAME_ERRORS.tooLong }
  }

  if (!NICKNAME_ALLOWED_PATTERN.test(normalized)) {
    return { ok: false, error: PROFILE_NICKNAME_ERRORS.unsupported }
  }

  return { ok: true, value: normalized }
}
