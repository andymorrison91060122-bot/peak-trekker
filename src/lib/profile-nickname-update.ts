import { validateNickname } from './profile-nickname.ts'

type ProfileNicknameUpdateError = {
  message?: string | null
}

type ProfileNicknameUpdateQuery = {
  eq: (column: string, value: string) => PromiseLike<{ error: ProfileNicknameUpdateError | null }>
}

type ProfileNicknameUpdateBuilder = {
  update: (values: { username: string }) => ProfileNicknameUpdateQuery
}

export type ProfileNicknameSupabaseClient = {
  from: (table: 'profiles') => ProfileNicknameUpdateBuilder
}

export type ProfileNicknameHandlerResult = {
  status: number
  body: {
    ok?: true
    username?: string
    error?: string
  }
}

export async function handleProfileNicknameRequest({
  supabase,
  userId,
  body,
}: {
  supabase: ProfileNicknameSupabaseClient
  userId: string | null
  body: unknown
}): Promise<ProfileNicknameHandlerResult> {
  if (!userId) {
    return { status: 401, body: { error: 'unauthorized' } }
  }

  const nickname = body && typeof body === 'object' && 'nickname' in body
    ? (body as { nickname?: unknown }).nickname
    : ''
  const validation = validateNickname(typeof nickname === 'string' ? nickname : '')

  if (!validation.ok) {
    return { status: 400, body: { error: validation.error } }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ username: validation.value })
    .eq('id', userId)

  if (error) {
    return { status: 500, body: { error: '昵称保存失败，请稍后重试。' } }
  }

  return {
    status: 200,
    body: {
      ok: true,
      username: validation.value,
    },
  }
}
