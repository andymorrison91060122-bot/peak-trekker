import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const OUTPUT_DIR = 'output/mtn-001'
const FIXTURE_PATH = '/tmp/mtn-001-manual-review-fixture.json'

type ManualReviewFixture = {
  email: string
  password: string
  mountainId: string
  mountainName: string
}

function readManualReviewFixture(): ManualReviewFixture {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Partial<ManualReviewFixture>
  assert.ok(fixture.email)
  assert.ok(fixture.password)
  assert.ok(fixture.mountainId)
  assert.ok(fixture.mountainName)
  return fixture as ManualReviewFixture
}

function rectanglesOverlap(
  first: { left: number; right: number; top: number; bottom: number },
  second: { left: number; right: number; top: number; bottom: number },
) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top
}

function parseCssColor(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number)
  assert.ok(channels && channels.length >= 3, `Expected an RGB(A) color, received ${value}`)
  return { red: channels[0], green: channels[1], blue: channels[2], alpha: channels[3] ?? 1 }
}

function compositeOver(background: { red: number; green: number; blue: number }, foreground: { red: number; green: number; blue: number; alpha: number }) {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
  }
}

function relativeLuminance(color: { red: number; green: number; blue: number }) {
  const linear = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(first: { red: number; green: number; blue: number }, second: { red: number; green: number; blue: number }) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

type CardMountSnapshot = {
  mountState: string | null
  opacity: number
  transform: string
  altitudeTop: number
  capsuleTop: number
}

async function readCheckedCardMount(page: Page, mountainName: string): Promise<CardMountSnapshot> {
  return page.evaluate((name) => {
    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]'))
      .find((candidate) => candidate.textContent?.includes(name))
    const motionHost = card?.closest<HTMLElement>('.explore-card__link-wrap')
    const altitude = motionHost?.querySelector<HTMLElement>('[data-testid="explore-mountain-card-altitude"]')
    const capsule = motionHost?.querySelector<HTMLElement>('[data-testid="explore-mountain-card-checkin-capsule"]')
    if (!motionHost || !altitude || !capsule) throw new Error('MTN-001 could not locate the shared checked-in card motion host.')

    const style = window.getComputedStyle(motionHost)
    return {
      mountState: motionHost.dataset.exploreMountState ?? null,
      opacity: Number.parseFloat(style.opacity),
      transform: style.transform,
      altitudeTop: altitude.getBoundingClientRect().top,
      capsuleTop: capsule.getBoundingClientRect().top,
    }
  }, mountainName)
}

test('MTN-001 keeps the checked-in capsule left-aligned, non-navigating, and visually separate from altitude', async ({ browser, baseURL }) => {
  test.setTimeout(90_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'
  const fixture = readManualReviewFixture()
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'no-preference',
  })

  try {
    await context.addInitScript(() => {
      window.localStorage.setItem('peak_trekker_intro_seen', '2026-v2')
    })
    const page = await context.newPage()
    await page.route('**/api/analytics/event', (route) => route.fulfill({ status: 204, body: '' }))

    await page.goto(`${root}/auth/login?from=${encodeURIComponent('/explore')}`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('your@email.com').fill(fixture.email)
    await page.getByPlaceholder(/至少6位|••••••••/).fill(fixture.password)
    await page.getByRole('button', { name: '▶ 开始登山' }).click()
    await page.waitForURL(/\/explore/, { timeout: 30_000, waitUntil: 'domcontentloaded' })

    const checkedCard = page.locator('[data-testid="explore-mountain-card"]', { hasText: fixture.mountainName }).first()
    const checkButton = checkedCard.locator('xpath=..').getByTestId('explore-mountain-card-checkin')
    const capsule = checkButton.getByTestId('explore-mountain-card-checkin-capsule')
    await expect(checkedCard).toBeVisible()
    await expect(checkButton).toBeVisible()
    await expect(capsule).toHaveText('已打卡')

    mkdirSync(OUTPUT_DIR, { recursive: true })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction((name) => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]'))
        .find((candidate) => candidate.textContent?.includes(name))
      return card?.closest<HTMLElement>('[data-explore-motion-card]')?.dataset.exploreMotionParticipation === 'first-screen'
    }, fixture.mountainName)

    await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((node) => node.remove()))
    const initialMount = await readCheckedCardMount(page, fixture.mountainName)
    await page.screenshot({ path: join(OUTPUT_DIR, 'explore-checkin-motion-r1-initial-375.png'), fullPage: false })

    expect(initialMount.mountState).toBe('pending')
    expect(initialMount.opacity).toBe(0)

    await page.waitForFunction((name) => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]'))
        .find((candidate) => candidate.textContent?.includes(name))
      const host = card?.closest<HTMLElement>('.explore-card__link-wrap')
      if (!host || host.dataset.exploreMountState !== 'pending') return false
      const opacity = Number.parseFloat(window.getComputedStyle(host).opacity)
      return opacity > 0.05 && opacity < 0.95
    }, fixture.mountainName)
    const enteringMount = await readCheckedCardMount(page, fixture.mountainName)
    await page.screenshot({ path: join(OUTPUT_DIR, 'explore-checkin-motion-r1-entering-375.png'), fullPage: false })

    await page.waitForFunction((name) => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="explore-mountain-card"]'))
        .find((candidate) => candidate.textContent?.includes(name))
      const host = card?.closest<HTMLElement>('.explore-card__link-wrap')
      if (!host || host.dataset.exploreMountState !== 'settled') return false
      const style = window.getComputedStyle(host)
      return Number.parseFloat(style.opacity) === 1 && style.transform === 'none'
    }, fixture.mountainName)
    const settledMount = await readCheckedCardMount(page, fixture.mountainName)
    await page.screenshot({ path: join(OUTPUT_DIR, 'explore-checkin-motion-r1-settled-375.png'), fullPage: false })

    expect(enteringMount.opacity).toBeGreaterThan(0)
    expect(enteringMount.opacity).toBeLessThan(1)
    expect(settledMount.mountState).toBe('settled')
    expect(settledMount.opacity).toBe(1)
    expect(settledMount.transform).toBe('none')
    expect(Math.abs((initialMount.altitudeTop - settledMount.altitudeTop) - (initialMount.capsuleTop - settledMount.capsuleTop))).toBeLessThanOrEqual(1)
    expect(Math.abs((enteringMount.altitudeTop - settledMount.altitudeTop) - (enteringMount.capsuleTop - settledMount.capsuleTop))).toBeLessThanOrEqual(1)
    writeFileSync(join(OUTPUT_DIR, 'explore-checkin-motion-r1-evidence.json'), `${JSON.stringify({
      initial: initialMount,
      entering: enteringMount,
      settled: settledMount,
    }, null, 2)}\n`)

    const beforeCheckUrl = page.url()
    await checkButton.click({ position: { x: 42, y: 42 } })
    await expect(page.getByRole('alert').filter({ hasText: '你已打卡这座山' })).toHaveText('你已打卡这座山')
    expect(page.url()).toBe(beforeCheckUrl)

    const evidence = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="explore-mountain-card-checkin"]') as HTMLElement | null
      const card = button?.closest('.explore-card__link-wrap')
      const capsule = card?.querySelector('[data-testid="explore-mountain-card-checkin-capsule"]') as HTMLElement | null
      const altitude = card?.querySelector('[data-testid="explore-mountain-card-altitude"]') as HTMLElement | null
      const buttonStyle = button ? window.getComputedStyle(button) : null
      const capsuleStyle = capsule ? window.getComputedStyle(capsule) : null
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        button: button ? { left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right, top: button.getBoundingClientRect().top, bottom: button.getBoundingClientRect().bottom, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height } : null,
        capsule: capsule ? { left: capsule.getBoundingClientRect().left, right: capsule.getBoundingClientRect().right, top: capsule.getBoundingClientRect().top, bottom: capsule.getBoundingClientRect().bottom, width: capsule.getBoundingClientRect().width, height: capsule.getBoundingClientRect().height } : null,
        altitude: altitude ? { left: altitude.getBoundingClientRect().left, right: altitude.getBoundingClientRect().right, top: altitude.getBoundingClientRect().top, bottom: altitude.getBoundingClientRect().bottom, width: altitude.getBoundingClientRect().width, height: altitude.getBoundingClientRect().height } : null,
        buttonBackground: buttonStyle?.backgroundColor ?? null,
        capsuleBackground: capsuleStyle?.backgroundColor ?? null,
        capsuleColor: capsuleStyle?.color ?? null,
      }
    })

    assert.ok(evidence.button)
    assert.ok(evidence.capsule)
    assert.ok(evidence.altitude)
    expect(evidence.documentWidth).toBe(evidence.viewportWidth)
    expect(evidence.button.width).toBeGreaterThanOrEqual(44)
    expect(evidence.button.height).toBeGreaterThanOrEqual(44)
    expect(Math.abs(evidence.capsule.top - evidence.altitude.top)).toBeLessThanOrEqual(1)
    expect(rectanglesOverlap(evidence.capsule, evidence.altitude)).toBe(false)
    expect(evidence.buttonBackground).toBe('rgba(0, 0, 0, 0)')
    expect(evidence.capsuleBackground).not.toBe('rgba(0, 0, 0, 0)')

    const capsuleBackground = parseCssColor(evidence.capsuleBackground!)
    const capsuleColor = parseCssColor(evidence.capsuleColor!)
    const brightCoverContrast = contrastRatio(capsuleColor, compositeOver({ red: 255, green: 255, blue: 255 }, capsuleBackground))
    const darkCoverContrast = contrastRatio(capsuleColor, compositeOver({ red: 0, green: 0, blue: 0 }, capsuleBackground))
    expect(brightCoverContrast).toBeGreaterThanOrEqual(4.5)
    expect(darkCoverContrast).toBeGreaterThanOrEqual(4.5)

    await page.evaluate(() => {
      document.querySelectorAll('nextjs-portal').forEach((node) => node.remove())

      const sourceButton = document.querySelector('[data-testid="explore-mountain-card-checkin"]') as HTMLElement | null
      const sourceCard = sourceButton?.closest('.explore-card__link-wrap') as HTMLElement | null
      if (!sourceCard) throw new Error('MTN-001 could not locate the checked-in card for controlled overlay evidence.')

      const evidenceRoot = document.createElement('div')
      evidenceRoot.dataset.testid = 'mtn-001-overlay-evidence-root'
      Object.assign(evidenceRoot.style, {
        position: 'fixed',
        top: '145px',
        left: '16px',
        right: '16px',
        zIndex: '80',
        display: 'grid',
        gridTemplateRows: 'repeat(2, 186px)',
        gap: '12px',
        pointerEvents: 'none',
      })

      for (const variant of ['dark', 'bright'] as const) {
        const clone = sourceCard.cloneNode(true) as HTMLElement
        clone.dataset.mtnOverlayEvidenceVariant = variant
        clone.style.width = '100%'
        clone.style.height = '186px'

        if (variant === 'bright') {
          const cover = clone.querySelector('[data-testid="explore-mountain-card-cover"]') as HTMLElement | null
          const image = clone.querySelector('[data-testid="explore-mountain-card-cover-image"]') as HTMLElement | null
          const scrim = cover?.querySelector('.explore-card__scrim')
          if (!cover || !image || !scrim) throw new Error('MTN-001 could not create the controlled bright-cover evidence clone.')

          image.style.visibility = 'hidden'
          const brightWash = document.createElement('span')
          brightWash.dataset.mtnOverlayBrightnessSimulation = 'bright'
          Object.assign(brightWash.style, {
            position: 'absolute',
            inset: '0',
            background: 'linear-gradient(135deg, #fffdf1 0%, #d8f2ff 48%, #eef7bf 100%)',
          })
          cover.insertBefore(brightWash, scrim)
        }

        evidenceRoot.append(clone)
      }

      document.body.append(evidenceRoot)
    })

    const controlledOverlayEvidence = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="mtn-001-overlay-evidence-root"]') as HTMLElement | null
      const cards = Array.from(root?.querySelectorAll<HTMLElement>('[data-mtn-overlay-evidence-variant]') ?? []).map((card) => {
        const capsule = card.querySelector('[data-testid="explore-mountain-card-checkin-capsule"]') as HTMLElement | null
        const altitude = card.querySelector('[data-testid="explore-mountain-card-altitude"]') as HTMLElement | null
        const capsuleStyle = capsule ? window.getComputedStyle(capsule) : null
        return {
          variant: card.dataset.mtnOverlayEvidenceVariant,
          capsule: capsule ? { left: capsule.getBoundingClientRect().left, right: capsule.getBoundingClientRect().right, top: capsule.getBoundingClientRect().top, bottom: capsule.getBoundingClientRect().bottom, width: capsule.getBoundingClientRect().width, height: capsule.getBoundingClientRect().height } : null,
          altitude: altitude ? { left: altitude.getBoundingClientRect().left, right: altitude.getBoundingClientRect().right, top: altitude.getBoundingClientRect().top, bottom: altitude.getBoundingClientRect().bottom, width: altitude.getBoundingClientRect().width, height: altitude.getBoundingClientRect().height } : null,
          capsuleBackground: capsuleStyle?.backgroundColor ?? null,
          capsuleVisibility: capsuleStyle?.visibility ?? null,
        }
      })
      return { rootPresent: Boolean(root), cards }
    })

    expect(controlledOverlayEvidence.rootPresent).toBe(true)
    expect(controlledOverlayEvidence.cards).toHaveLength(2)
    expect(controlledOverlayEvidence.cards.map((card) => card.variant)).toEqual(['dark', 'bright'])
    for (const card of controlledOverlayEvidence.cards) {
      assert.ok(card.capsule)
      assert.ok(card.altitude)
      expect(Math.abs(card.capsule.top - card.altitude.top)).toBeLessThanOrEqual(1)
      expect(rectanglesOverlap(card.capsule, card.altitude)).toBe(false)
      expect(card.capsuleBackground).toBe('rgba(7, 13, 12, 0.78)')
      expect(card.capsuleVisibility).toBe('visible')
    }

    await checkButton.click({ position: { x: 42, y: 42 } })
    await expect(page.getByRole('alert').filter({ hasText: '你已打卡这座山' })).toHaveText('你已打卡这座山')
    mkdirSync(OUTPUT_DIR, { recursive: true })
    await page.screenshot({ path: join(OUTPUT_DIR, 'explore-checkin-overlay-r1-375.png'), fullPage: false })
    await page.evaluate(() => document.querySelector('[data-testid="mtn-001-overlay-evidence-root"]')?.remove())

    await checkedCard.getByTestId('explore-mountain-card-body').click()
    await page.waitForURL(new RegExp(`/mountain/${fixture.mountainId}`), { timeout: 30_000 })
    const detailStatus = page.getByTestId('mountain-detail-checked-in')
    await expect(detailStatus).toBeVisible()
    const detailEvidence = await page.evaluate(() => {
      const status = document.querySelector('[data-testid="mountain-detail-checked-in"]')?.getBoundingClientRect()
      const title = document.querySelector('[data-mountain-hero-item="title"]')?.getBoundingClientRect()
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        status: status ? { top: status.top, bottom: status.bottom, width: status.width } : null,
        title: title ? { top: title.top, bottom: title.bottom } : null,
      }
    })
    expect(detailEvidence.documentWidth).toBe(detailEvidence.viewportWidth)
    expect(detailEvidence.status).not.toBeNull()
    expect(detailEvidence.title).not.toBeNull()
    expect(detailEvidence.status!.bottom).toBeLessThanOrEqual(detailEvidence.title!.top)

    await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((node) => node.remove()))
    await page.screenshot({ path: join(OUTPUT_DIR, 'mountain-detail-status-r1-375.png'), fullPage: false })
    writeFileSync(join(OUTPUT_DIR, 'overlay-r1-evidence.json'), `${JSON.stringify({
      explore: evidence,
      brightCoverContrast,
      darkCoverContrast,
      controlledBrightnessSimulation: controlledOverlayEvidence,
      detail: detailEvidence,
    }, null, 2)}\n`)
  } finally {
    await context.close()
  }
})
