const { chromium } = require('playwright')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

function readEnvFile(path) {
  return Object.fromEntries(
    fs
      .readFileSync(path, 'utf8')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

async function main() {
  const env = readEnvFile('.env.local')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: mountain, error: mountainError } = await supabase
    .from('mountains')
    .select('id,name,latitude,longitude,altitude')
    .eq('is_active', true)
    .order('checkin_count', { ascending: false })
    .limit(1)
    .single()

  if (mountainError || !mountain) {
    throw mountainError ?? new Error('Missing mountain data')
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage()

  page.on('console', (msg) => {
    console.log('BROWSER_CONSOLE', msg.type(), msg.text())
  })

  page.on('request', (req) => {
    if (req.url().includes('/api/trek/actions')) {
      console.log('TREK_REQUEST', req.method(), req.url(), req.postData())
    }
  })

  page.on('response', async (res) => {
    if (!res.url().includes('/api/trek/actions')) return
    let body = ''
    try {
      body = await res.text()
    } catch {}
    console.log('TREK_RESPONSE', res.status(), body)
  })

  page.on('requestfailed', (req) => {
    if (req.url().includes('/api/trek/actions')) {
      console.log('TREK_REQUEST_FAILED', req.url(), JSON.stringify(req.failure()))
    }
  })

  await page.addInitScript(
    ({ latitude, longitude, altitude }) => {
      const points = [
        { latitude: latitude - 0.00012, longitude: longitude - 0.00012, accuracy: 6, altitude: altitude - 60 },
        { latitude, longitude, accuracy: 4, altitude },
      ]

      const timers = new Map()
      let watchId = 0

      const buildPosition = (point) =>
        ({
          coords: {
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
            altitude: point.altitude,
            altitudeAccuracy: 1,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        })

      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success) {
            success(buildPosition(points[0]))
          },
          watchPosition(success) {
            const id = ++watchId
            const handles = [
              setTimeout(() => success(buildPosition(points[0])), 60),
              setTimeout(() => success(buildPosition(points[1])), 1400),
            ]
            timers.set(id, handles)
            return id
          },
          clearWatch(id) {
            for (const handle of timers.get(id) ?? []) {
              clearTimeout(handle)
            }
            timers.delete(id)
          },
        },
      })
    },
    {
      latitude: mountain.latitude,
      longitude: mountain.longitude,
      altitude: mountain.altitude,
    }
  )

  const timestamp = Date.now()
  const email = `debug-${timestamp}@example.com`
  const password = 'PeakTrekker123!'

  await page.goto(`http://127.0.0.1:3100/auth/register?from=${encodeURIComponent(`/trek?mountainId=${mountain.id}`)}`)
  await page.getByPlaceholder('your@email.com').fill(email)
  await page.getByPlaceholder('至少6位').fill(password)
  await page.getByRole('button', { name: '下一步 →' }).click()
  await page.getByPlaceholder('你的登山代号').fill(`debug-${timestamp}`)
  await page.locator('select').selectOption('四川')
  await page.getByRole('button', { name: '▶ 创建登山档案' }).click()
  await page.waitForFunction(
    (mountainId) => window.location.href.includes(`/trek?mountainId=${mountainId}`),
    mountain.id,
    { timeout: 20000 }
  )

  console.log('AT_TREK', page.url())

  await page.getByRole('button', { name: 'Start 开启记录' }).click()
  await page.getByRole('button', { name: '停止记录' }).waitFor({ timeout: 15000 })
  await page.getByText('已接近峰顶').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: '确认登顶' }).waitFor({ timeout: 15000 })

  console.log('BODY_BEFORE_CONFIRM')
  console.log(await page.locator('body').innerText())

  await page.getByRole('button', { name: '确认登顶' }).click()
  await page.waitForTimeout(6000)

  console.log('BODY_AFTER_CONFIRM')
  console.log(await page.locator('body').innerText())

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
