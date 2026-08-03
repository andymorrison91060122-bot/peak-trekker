import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const enabled = process.env.P2_CF_RUNTIME_SMOKE === '1'

type StoredCookie = {
  name: string
  value: string
  options: {
    path?: string
    domain?: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'lax' | 'strict' | 'none'
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required runtime smoke environment variable: ${name}`)
  return value
}

function toPlaywrightSameSite(value: StoredCookie['options']['sameSite']) {
  if (value === 'strict') return 'Strict' as const
  if (value === 'none') return 'None' as const
  return 'Lax' as const
}

async function countUserRows(admin: ReturnType<typeof createClient>, table: 'checkins' | 'trek_sessions', userId: string) {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  assert.equal(error, null, `${table} count failed`)
  return count ?? 0
}

test.describe.configure({ mode: 'serial' })

test('Cloudflare workerd preserves one MIMO recognition and parse-only GPX/KML/FIT imports', async ({ browser }) => {
  test.skip(!enabled, 'Set P2_CF_RUNTIME_SMOKE=1 to run the real Worker smoke.')
  test.setTimeout(180_000)

  const previewUrl = requiredEnv('P2_CF_PREVIEW_URL').replace(/\/$/, '')
  const supabaseUrl = requiredEnv('P2_CF_SUPABASE_URL')
  const anonKey = requiredEnv('P2_CF_SUPABASE_ANON_KEY')
  const serviceRoleKey = requiredEnv('P2_CF_SUPABASE_SERVICE_ROLE_KEY')
  const screenshotPath = requiredEnv('P2_CF_SCREENSHOT_PATH')
  const evidencePath = requiredEnv('P2_CF_RUNTIME_EVIDENCE_PATH')
  const fixtures = [
    { format: 'gpx', path: requiredEnv('P2_CF_GPX_PATH'), mimeType: 'application/gpx+xml' },
    { format: 'kml', path: requiredEnv('P2_CF_KML_PATH'), mimeType: 'application/vnd.google-earth.kml+xml' },
    { format: 'fit', path: requiredEnv('P2_CF_FIT_PATH'), mimeType: 'application/octet-stream' },
  ] as const

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `pt-cf-runtime-smoke-${randomUUID()}@example.test`
  let userId: string | null = null
  let cleanupConfirmed = false
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    assert.equal(createError, null, 'disposable test user creation failed')
    assert.ok(created.user, 'disposable test user was not returned')
    userId = created.user.id

    const { data: generatedLink, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    assert.equal(linkError, null, 'magic link generation failed')
    const tokenHash = generatedLink.properties.hashed_token
    assert.ok(tokenHash, 'magic link did not return a token hash')

    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    })
    assert.equal(verifyError, null, 'magic link verification failed')
    assert.ok(verified.session, 'magic link verification did not return a session')

    const storedCookies = new Map<string, StoredCookie>()
    const ssr = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => Array.from(storedCookies.values()),
        setAll: (cookies) => {
          for (const cookie of cookies) {
            storedCookies.set(cookie.name, cookie)
          }
        },
      },
    })
    const { error: sessionError } = await ssr.auth.setSession({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    })
    assert.equal(sessionError, null, 'SSR session cookie creation failed')
    assert.ok(storedCookies.size > 0, 'SSR session did not emit cookies')

    context = await browser.newContext()
    await context.addCookies(Array.from(storedCookies.values()).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: previewUrl,
      httpOnly: cookie.options.httpOnly ?? false,
      secure: false,
      sameSite: toPlaywrightSameSite(cookie.options.sameSite),
    })))

    assert.equal(await countUserRows(admin, 'checkins', userId), 0)
    assert.equal(await countUserRows(admin, 'trek_sessions', userId), 0)

    const recognitionResponse = await context.request.post(`${previewUrl}/api/screenshot/recognize`, {
      multipart: {
        image: {
          name: basename(screenshotPath),
          mimeType: 'image/png',
          buffer: readFileSync(screenshotPath),
        },
      },
    })
    expect(recognitionResponse.status()).toBe(200)
    const recognition = await recognitionResponse.json()
    expect(recognition.ok).toBe(true)
    expect(recognition.ocrSource).toBe('mimo_v25')
    expect(recognition.recognitionMeta?.primary).toBe('mimo_v25')
    expect(recognition.recognitionMeta?.fallbackChain).toEqual(['mimo_v25'])
    expect(recognition.parsedFields).toBeTruthy()
    expect(JSON.stringify(recognition)).not.toMatch(/TENCENT|MIMO_API_KEY|SERVICE_ROLE|SUPABASE_SERVICE_ROLE/i)

    const { data: attempts, error: attemptsError } = await admin
      .from('screenshot_quota_attempts')
      .select('status, consumed_at, refunded_at')
      .eq('user_id', userId)
    assert.equal(attemptsError, null, 'screenshot quota attempt lookup failed')
    assert.equal(attempts?.length, 1, 'one recognition must create exactly one quota attempt')
    assert.equal(attempts?.[0]?.status, 'consumed')
    assert.ok(attempts?.[0]?.consumed_at, 'successful recognition must finalize its quota attempt')
    assert.equal(attempts?.[0]?.refunded_at, null)

    const parsedFormats: Array<{ format: string; pointCount: number; hasContentHash: boolean; candidateCount: number }> = []
    for (const fixture of fixtures) {
      const response = await context.request.post(`${previewUrl}/api/import/parse`, {
        multipart: {
          file: {
            name: basename(fixture.path),
            mimeType: fixture.mimeType,
            buffer: readFileSync(fixture.path),
          },
        },
      })
      expect(response.status(), `${fixture.format} parse status`).toBe(200)
      const body = await response.json()
      expect(body.ok, `${fixture.format} parse ok`).toBe(true)
      expect(body.parsedData?.trackPoints?.length, `${fixture.format} points`).toBeGreaterThan(0)
      expect(body.parsedData?.trackContentHash, `${fixture.format} content hash`).toBeTruthy()
      expect(Array.isArray(body.parsedData?.suggestedCandidates), `${fixture.format} candidates`).toBe(true)
      parsedFormats.push({
        format: fixture.format,
        pointCount: body.parsedData.trackPoints.length,
        hasContentHash: Boolean(body.parsedData.trackContentHash),
        candidateCount: body.parsedData.suggestedCandidates.length,
      })
    }

    assert.equal(await countUserRows(admin, 'checkins', userId), 0)
    assert.equal(await countUserRows(admin, 'trek_sessions', userId), 0)

    await mkdir(dirname(evidencePath), { recursive: true })
    await writeFile(evidencePath, `${JSON.stringify({
      previewUrl,
      recognition: {
        httpStatus: recognitionResponse.status(),
        ocrSource: recognition.ocrSource,
        primary: recognition.recognitionMeta?.primary,
        fallbackChain: recognition.recognitionMeta?.fallbackChain,
        quotaAttemptStatus: attempts?.[0]?.status,
      },
      parses: parsedFormats,
      writes: {
        screenshotQuotaAttempts: attempts?.length ?? 0,
        checkins: 0,
        trekSessions: 0,
      },
    }, null, 2)}\n`, 'utf8')
  } finally {
    await context?.close()
    if (userId) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
      if (!deleteError) {
        const { data: deletedUser, error: readbackError } = await admin.auth.admin.getUserById(userId)
        cleanupConfirmed = Boolean(readbackError) && deletedUser.user === null
      }
      if (!cleanupConfirmed) {
        const recoveryPath = `${evidencePath}.recovery.json`
        await mkdir(dirname(recoveryPath), { recursive: true })
        await writeFile(recoveryPath, `${JSON.stringify({
          syntheticUserId: userId,
          purpose: 'Cloudflare runtime smoke cleanup recovery',
        }, null, 2)}\n`, 'utf8')
        throw new Error(`Synthetic runtime smoke user cleanup failed; recovery manifest: ${recoveryPath}`)
      }
    }
  }
})
