import { expect, test, type Page } from '@playwright/test'
import {
  createHistoricalCheckinViaApi,
  dismissActivationChecklistIfPresent,
  fetchMountainByIdViaApi,
  getFirstMountain,
  registerFreshUser,
} from './community.helpers'

async function seedHistoricalActivity(page: Page, root: string, note: string) {
  await registerFreshUser(page, root, { returnTo: '/profile' })
  const { mountainId } = await getFirstMountain(page, root)
  const checkinId = await createHistoricalCheckinViaApi(page, mountainId, note)
  return { checkinId, mountainId }
}

async function readHeroCoverage(page: Page) {
  return page.getByTestId('activity-hero').evaluate((hero) => {
    const heroElement = hero as HTMLElement
    const image = heroElement.querySelector('[data-testid="activity-hero-image"]') as HTMLImageElement | null
    const parent = heroElement.parentElement as HTMLElement | null
    const heroStyle = window.getComputedStyle(heroElement)
    const imageStyle = image ? window.getComputedStyle(image) : null
    const parentStyle = parent ? window.getComputedStyle(parent) : null
    const heroRect = heroElement.getBoundingClientRect()
    const imageRect = image?.getBoundingClientRect() ?? null
    const parentRect = parent?.getBoundingClientRect() ?? null

    return {
      heroSource: heroElement.getAttribute('data-hero-source'),
      heroWidth: parseFloat(heroStyle.width),
      heroHeight: parseFloat(heroStyle.height),
      heroPaddingLeft: heroStyle.paddingLeft,
      heroPaddingRight: heroStyle.paddingRight,
      imageWidth: imageStyle ? parseFloat(imageStyle.width) : null,
      imageHeight: imageStyle ? parseFloat(imageStyle.height) : null,
      imageObjectFit: imageStyle?.objectFit ?? null,
      parentWidth: parentStyle ? parseFloat(parentStyle.width) : null,
      parentPaddingLeft: parentStyle?.paddingLeft ?? null,
      parentPaddingRight: parentStyle?.paddingRight ?? null,
      heroRect: heroRect
        ? {
            left: heroRect.left,
            right: heroRect.right,
            width: heroRect.width,
            height: heroRect.height,
          }
        : null,
      imageRect: imageRect
        ? {
            left: imageRect.left,
            right: imageRect.right,
            width: imageRect.width,
            height: imageRect.height,
          }
        : null,
      parentRect: parentRect
        ? {
            left: parentRect.left,
            right: parentRect.right,
            width: parentRect.width,
            height: parentRect.height,
          }
        : null,
    }
  })
}

test('activity hero follows the photo → mountain → solid fallback chain', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  const { checkinId, mountainId } = await seedHistoricalActivity(page, root, `hero-photo-${Date.now()}`)
  const mountain = await fetchMountainByIdViaApi(page, mountainId)

  await page.goto(`${root}/activity/${checkinId}`)
  await dismissActivationChecklistIfPresent(page)
  const hero = page.getByTestId('activity-hero')
  await expect(hero).toBeVisible()
  await expect(hero).toHaveAttribute('data-hero-source', 'photo')
  await expect(hero.getByTestId('activity-hero-image')).toBeVisible()
  const photoCoverage = await readHeroCoverage(page)
  expect(photoCoverage.imageObjectFit).toBe('cover')
  expect(Math.abs((photoCoverage.parentWidth ?? 0) - photoCoverage.heroWidth)).toBeLessThan(1.5)

  await page.goto(`${root}/activity/${checkinId}?qaHero=mountain`)
  await expect(hero).toHaveAttribute('data-hero-source', 'mountain')
  await expect(hero.getByTestId('activity-hero-image')).toHaveAttribute('src', /activity-hero-mountain/)
  const mountainCoverage = await readHeroCoverage(page)
  expect(mountainCoverage.imageObjectFit).toBe('cover')
  expect(Math.abs((mountainCoverage.parentWidth ?? 0) - mountainCoverage.heroWidth)).toBeLessThan(1.5)

  await page.goto(`${root}/activity/${checkinId}?qaHero=solid`)
  await expect(hero).toHaveAttribute('data-hero-source', 'default')
  await expect(hero.getByTestId('activity-hero-image')).toHaveAttribute('src', /\/images\/default-activity-cover\.png$/)
  await expect(hero).toContainText(mountain.name)
  await expect(hero.getByTestId('activity-hero-fallback-solid')).toHaveCount(0)
  const defaultCoverage = await readHeroCoverage(page)
  expect(defaultCoverage.imageObjectFit).toBe('cover')
  expect(Math.abs((defaultCoverage.parentWidth ?? 0) - defaultCoverage.heroWidth)).toBeLessThan(1.5)
})

test('activity hero removes static-reference copy and keeps only accessible icon controls', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  const { checkinId } = await seedHistoricalActivity(page, root, `hero-copy-${Date.now()}`)

  await page.goto(`${root}/activity/${checkinId}`)
  await dismissActivationChecklistIfPresent(page)
  const hero = page.getByTestId('activity-hero')

  await expect(hero).not.toContainText('STATIC REFERENCE')
  await expect(hero).not.toContainText('攀登记录封面')
  await expect(hero).not.toContainText('参考线')
  await expect(hero.getByRole('button', { name: '返回' })).toBeVisible()
  await expect(hero.getByRole('button', { name: '分享' })).toBeVisible()
})

test('activity hero share icon opens the existing share sheet', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  const { checkinId } = await seedHistoricalActivity(page, root, `hero-share-${Date.now()}`)

  await page.goto(`${root}/activity/${checkinId}`)
  await dismissActivationChecklistIfPresent(page)
  const hero = page.getByTestId('activity-hero')

  await hero.getByRole('button', { name: '分享' }).click()
  await expect(page.getByRole('dialog', { name: '分享素材' })).toBeVisible()
})

test('activity route section keeps only concise Chinese copy in the empty state', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  const { checkinId } = await seedHistoricalActivity(page, root, `hero-no-track-${Date.now()}`)
  await page.goto(`${root}/activity/${checkinId}`)
  await dismissActivationChecklistIfPresent(page)
  const routeSection = page.getByTestId('activity-route-section')
  await expect(routeSection).toBeVisible()
  await expect(routeSection).toContainText('活动路线')
  await expect(routeSection).toContainText('暂无轨迹数据')
  await expect(routeSection).not.toContainText('优先回看这次攀登记录')
  await expect(routeSection).not.toContainText('不伪装成完整路线图')
  await expect(routeSection).not.toContainText('STATIC REFERENCE')
})

test('activity hero stays near a 16:9 cover ratio on 375px', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const root = baseURL ?? 'http://127.0.0.1:3100'

  await page.setViewportSize({ width: 375, height: 812 })
  const { checkinId } = await seedHistoricalActivity(page, root, `hero-ratio-${Date.now()}`)

  await page.goto(`${root}/activity/${checkinId}`)
  await dismissActivationChecklistIfPresent(page)
  const hero = page.getByTestId('activity-hero')
  const box = await hero.boundingBox()

  expect(box).toBeTruthy()
  const ratio = Number(box!.width / box!.height)
  expect(Math.abs(ratio - 16 / 9)).toBeLessThan(0.12)
})
