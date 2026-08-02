import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'

const enabled = process.env.P2_CF_SHARE_RENDER_SMOKE === '1'

type StoredCookie = {
  name: string
  value: string
  options: {
    httpOnly?: boolean
    sameSite?: 'lax' | 'strict' | 'none'
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required share smoke environment variable: ${name}`)
  return value
}

function toPlaywrightSameSite(value: StoredCookie['options']['sameSite']) {
  if (value === 'strict') return 'Strict' as const
  if (value === 'none') return 'None' as const
  return 'Lax' as const
}

async function inspectPng(bytes: Buffer) {
  const image = sharp(bytes)
  const metadata = await image.metadata()
  const stats = await image.removeAlpha().stats()
  const channelSpread = stats.channels.reduce(
    (total, channel) => total + Math.max(0, channel.max - channel.min),
    0,
  )
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    channelSpread,
  }
}

async function inspectGrayscalePhotoRegion(bytes: Buffer) {
  const { data, info } = await sharp(bytes)
    .extract({ left: 100, top: 140, width: 880, height: 300 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let channelDeltaTotal = 0
  let pixelCount = 0

  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index] ?? 0
    const green = data[index + 1] ?? 0
    const blue = data[index + 2] ?? 0
    channelDeltaTotal += Math.max(red, green, blue) - Math.min(red, green, blue)
    pixelCount += 1
  }

  return channelDeltaTotal / Math.max(1, pixelCount)
}

test.describe.configure({ mode: 'serial' })

test('Cloudflare workerd renders color, grayscale, and classic Chinese share PNGs', async ({ browser }) => {
  test.skip(!enabled, 'Set P2_CF_SHARE_RENDER_SMOKE=1 to run the real Worker share smoke.')
  test.setTimeout(180_000)

  const previewUrl = requiredEnv('P2_CF_PREVIEW_URL').replace(/\/$/, '')
  const supabaseUrl = requiredEnv('P2_CF_SUPABASE_URL')
  const anonKey = requiredEnv('P2_CF_SUPABASE_ANON_KEY')
  const serviceRoleKey = requiredEnv('P2_CF_SUPABASE_SERVICE_ROLE_KEY')
  const photoPath = requiredEnv('P2_CF_SHARE_PHOTO_PATH')
  const evidencePath = requiredEnv('P2_CF_SHARE_EVIDENCE_PATH')
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `pt-cf-share-smoke-${randomUUID()}@example.test`
  const checkinId = randomUUID()
  let userId: string | null = null
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    assert.equal(createError, null, 'share smoke user creation failed')
    assert.ok(created.user)
    userId = created.user.id

    const { error: insertError } = await admin.from('checkins').insert({
      id: checkinId,
      user_id: userId,
      mountain_id: null,
      type: 'gps',
      source: 'track_import',
      completion_status: 'complete',
      start_time: '2026-05-02T07:44:00.000Z',
      distance_meters: 13420,
      duration_seconds: 19820,
      elevation_gain_meters: 897,
      max_elevation_meters: 1265,
      track_name: '云海山行',
    })
    assert.equal(insertError, null, 'share smoke checkin insert failed')

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    assert.equal(linkError, null)
    assert.ok(link.properties.hashed_token)
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    })
    assert.equal(verifyError, null)
    assert.ok(verified.session)

    const storedCookies = new Map<string, StoredCookie>()
    const ssr = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => Array.from(storedCookies.values()),
        setAll: (cookies) => {
          for (const cookie of cookies) storedCookies.set(cookie.name, cookie)
        },
      },
    })
    const { error: sessionError } = await ssr.auth.setSession({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    })
    assert.equal(sessionError, null)
    assert.ok(storedCookies.size > 0)

    context = await browser.newContext()
    await context.addCookies(Array.from(storedCookies.values()).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: previewUrl,
      httpOnly: cookie.options.httpOnly ?? false,
      secure: false,
      sameSite: toPlaywrightSameSite(cookie.options.sameSite),
    })))

    const sharedBody = {
      checkinId,
      fieldVisibility: {
        duration: true,
        elevationGain: true,
        date: true,
        location: true,
        pace: false,
        mountainName: true,
      },
      transparent: false,
    }
    const posterParams = new URLSearchParams({
      checkinId: 'demo',
      renderMode: 'classic_card',
      mountainName: '四姑娘山',
      province: '四川',
      username: '山野记录者',
      note: '山顶风很大，但这次活动完整记录下来了。',
    })
    const photoBase64 = readFileSync(photoPath).toString('base64')
    const cases = [
      {
        name: 'photo-composite',
        request: () => context!.request.post(`${previewUrl}/api/share/render`, {
          data: {
            ...sharedBody,
            template: 'premium-photo-composite',
            photoBase64,
          },
        }),
      },
      {
        name: 'mono-film',
        request: () => context!.request.post(`${previewUrl}/api/share/render`, {
          data: {
            ...sharedBody,
            template: 'premium-mono-film',
            photoBase64,
          },
        }),
      },
      {
        name: 'classic-poster',
        request: () => context!.request.get(`${previewUrl}/api/poster?${posterParams}`),
      },
    ]
    const renders = []

    for (const renderCase of cases) {
      const response = await renderCase.request()
      expect(response.status(), renderCase.name).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')
      const bytes = Buffer.from(await response.body())
      assert.ok(bytes.length > 1000, `${renderCase.name} PNG is unexpectedly small`)
      assert.doesNotMatch(
        bytes.toString('latin1'),
        /MIMO_API_KEY|SUPABASE_SERVICE_ROLE_KEY|QWEATHER_API_KEY|WEATHER_REFRESH_SECRET/,
      )
      const image = await inspectPng(bytes)
      assert.equal(image.width, 1080)
      assert.equal(image.height, 1920)
      assert.ok(image.channelSpread > 30, `${renderCase.name} PNG appears blank`)
      const grayscaleMeanChannelDelta = renderCase.name === 'mono-film'
        ? await inspectGrayscalePhotoRegion(bytes)
        : null
      if (grayscaleMeanChannelDelta !== null) {
        assert.ok(
          grayscaleMeanChannelDelta < 8,
          `mono-film photo region is not grayscale: mean channel delta ${grayscaleMeanChannelDelta}`,
        )
      }
      const outputPath = join(dirname(evidencePath), `${renderCase.name}.png`)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, bytes)
      renders.push({
        name: renderCase.name,
        outputFile: basename(outputPath),
        bytes: bytes.length,
        grayscaleMeanChannelDelta,
        ...image,
      })
    }

    await writeFile(evidencePath, `${JSON.stringify({
      previewUrl,
      checkin: {
        trackName: '云海山行',
        source: 'track_import',
      },
      renders,
    }, null, 2)}\n`, 'utf8')
  } finally {
    await context?.close()
    if (userId) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
      assert.equal(deleteError, null, 'share smoke user cleanup failed')
      const { data: deleted, error: readbackError } = await admin.auth.admin.getUserById(userId)
      assert.ok(readbackError)
      assert.equal(deleted.user, null)
    }
  }
})
