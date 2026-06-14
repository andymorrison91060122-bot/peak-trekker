import assert from 'node:assert/strict'
import test from 'node:test'

import {
  handleProfileNicknameRequest,
  type ProfileNicknameSupabaseClient,
} from '../src/lib/profile-nickname-update.ts'

function createMockSupabase(error: { message?: string | null } | null = null) {
  const calls: Array<{ table: string; values: { username: string }; column: string; value: string }> = []
  const supabase: ProfileNicknameSupabaseClient = {
    from(table) {
      return {
        update(values) {
          return {
            eq(column, value) {
              calls.push({ table, values, column, value })
              return Promise.resolve({ error })
            },
          }
        },
      }
    },
  }
  return { supabase, calls }
}

test('nickname handler rejects unauthenticated requests', async () => {
  const { supabase, calls } = createMockSupabase()
  const result = await handleProfileNicknameRequest({
    supabase,
    userId: null,
    body: { nickname: '山友新名' },
  })

  assert.equal(result.status, 401)
  assert.deepEqual(result.body, { error: 'unauthorized' })
  assert.equal(calls.length, 0)
})

test('nickname handler rejects invalid nickname with shared copy', async () => {
  const { supabase, calls } = createMockSupabase()
  const result = await handleProfileNicknameRequest({
    supabase,
    userId: 'user-1',
    body: { nickname: '山' },
  })

  assert.equal(result.status, 400)
  assert.deepEqual(result.body, { error: '昵称至少 2 个字' })
  assert.equal(calls.length, 0)
})

test('nickname handler trims and updates only the current user row', async () => {
  const { supabase, calls } = createMockSupabase()
  const result = await handleProfileNicknameRequest({
    supabase,
    userId: 'user-1',
    body: { nickname: '  山友新名  ' },
  })

  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true, username: '山友新名' })
  assert.deepEqual(calls, [
    {
      table: 'profiles',
      values: { username: '山友新名' },
      column: 'id',
      value: 'user-1',
    },
  ])
})

test('nickname handler maps update failure to friendly copy', async () => {
  const { supabase, calls } = createMockSupabase({ message: 'permission denied for table profiles' })
  const result = await handleProfileNicknameRequest({
    supabase,
    userId: 'user-1',
    body: { nickname: '山友新名' },
  })

  assert.equal(result.status, 500)
  assert.deepEqual(result.body, { error: '昵称保存失败，请稍后重试。' })
  assert.equal(calls.length, 1)
})
