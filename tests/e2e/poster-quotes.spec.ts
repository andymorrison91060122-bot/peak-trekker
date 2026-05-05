import { expect, test } from '@playwright/test'
import { IN_PROGRESS_QUOTES, SUMMIT_QUOTES } from '../../src/lib/sharing-quotes'

const POSTER_HEIGHT = 1920
const ALL_QUOTES = [...IN_PROGRESS_QUOTES, ...SUMMIT_QUOTES]

function longestQuoteIndexes(pool: ReadonlyArray<{ text: string; author: string }>, count: number) {
  return [...pool]
    .map((quote, index) => ({ index, length: Array.from(quote.text).length }))
    .sort((left, right) => right.length - left.length)
    .slice(0, count)
    .map((item) => item.index)
}

test('poster share story copy uses literary quotes and trek snapshots expose the in-progress badge', async ({ request }) => {
  const inProgressResponse = await request.get('/api/poster?checkinId=demo&template=trek_snapshot&renderMode=classic_card&format=svg&note=原生硬文案占位')
  expect(inProgressResponse.ok()).toBeTruthy()
  const inProgressSvg = await inProgressResponse.text()

  expect(inProgressSvg).toContain('SHARE STORY')
  expect(inProgressSvg).toContain('记录中')
  expect(inProgressSvg).toContain('IN PROGRESS')
  expect(inProgressSvg).not.toContain('原生硬文案占位')
  expect(IN_PROGRESS_QUOTES.some((quote) => inProgressSvg.includes(quote.text))).toBeTruthy()
  expect(IN_PROGRESS_QUOTES.some((quote) => inProgressSvg.includes(`— ${quote.author}`))).toBeTruthy()

  const summitResponse = await request.get('/api/poster?checkinId=demo&template=summit_card&renderMode=classic_card&format=svg&verified=1&note=峰顶硬文案占位')
  expect(summitResponse.ok()).toBeTruthy()
  const summitSvg = await summitResponse.text()

  expect(summitSvg).toContain('GPS VERIFIED')
  expect(summitSvg).toContain('SUMMIT VERIFIED')
  expect(summitSvg).not.toContain('记录中')
  expect(summitSvg).not.toContain('峰顶硬文案占位')
  expect(SUMMIT_QUOTES.some((quote) => summitSvg.includes(quote.text))).toBeTruthy()
  expect(SUMMIT_QUOTES.some((quote) => summitSvg.includes(`— ${quote.author}`))).toBeTruthy()
})

test('classic poster keeps long literary quotes multiline with stable spacing across snapshot summit and historical templates', async ({ request }) => {
  const [inProgressIndex] = longestQuoteIndexes(IN_PROGRESS_QUOTES, 1)
  const [summitIndex, historicalIndex] = longestQuoteIndexes(SUMMIT_QUOTES, 2)

  const scenarios = [
    {
      url: `/api/poster?checkinId=demo&template=trek_snapshot&renderMode=classic_card&format=svg&quoteIndex=${inProgressIndex}`,
      quote: IN_PROGRESS_QUOTES[inProgressIndex],
      mustContain: ['记录中', 'IN PROGRESS'],
    },
    {
      url: `/api/poster?checkinId=demo&template=summit_card&renderMode=classic_card&format=svg&verified=1&quoteIndex=${summitIndex}`,
      quote: SUMMIT_QUOTES[summitIndex],
      mustContain: ['GPS VERIFIED', 'SUMMIT VERIFIED'],
    },
    {
      url: `/api/poster?checkinId=demo&template=summit_card&renderMode=classic_card&format=svg&verified=0&quoteIndex=${historicalIndex}`,
      quote: SUMMIT_QUOTES[historicalIndex],
      mustContain: ['PHOTO RECORD', '历史补签'],
    },
  ]

  for (const scenario of scenarios) {
    const response = await request.get(scenario.url)
    expect(response.ok()).toBeTruthy()
    const svg = await response.text()

    expect(svg).toContain(`data-full-quote="${scenario.quote.text}"`)
    expect(svg).toContain(`data-quote-author="${scenario.quote.author}"`)
    expect(svg).toContain('data-quote-author-gap="8"')
    expect(svg).toContain('data-author-footer-gap="16"')
    expect(svg).toContain('PEAK TREKKER')
    expect(svg).toContain('MOUNTAIN VERIFIED STORY')

    const lineCount = Number(svg.match(/data-quote-line-count="(\d+)"/)?.[1] ?? '0')
    expect(lineCount).toBeGreaterThan(1)

    const authorY = Number(svg.match(/data-author-y="(\d+)"/)?.[1] ?? '0')
    const footerY = Number(svg.match(/data-footer-y="(\d+)"/)?.[1] ?? '0')
    expect(footerY - authorY).toBeGreaterThanOrEqual(40)

    for (const marker of scenario.mustContain) {
      expect(svg).toContain(marker)
    }
  }
})

function readNumericAttr(svg: string, attribute: string) {
  const match = svg.match(new RegExp(`${attribute}="(\\d+)"`))
  return Number(match?.[1] ?? 'NaN')
}

function readStringAttr(svg: string, attribute: string) {
  const match = svg.match(new RegExp(`${attribute}="([^"]+)"`))
  return match?.[1] ?? null
}

test('classic poster quote geometry stays inside bounds for every applicable quote and template', async ({ request, page }) => {
  const scenarios = [
    ...ALL_QUOTES.map((quote, index) => ({
      label: `trek-${index}`,
      url: `/api/poster?checkinId=demo&template=trek_snapshot&renderMode=classic_card&format=svg&quotePool=all&quoteIndex=${index}`,
      expectedQuote: quote,
      expectedTemplate: 'trek_snapshot',
      maxBottomGap: 260,
    })),
    ...ALL_QUOTES.map((quote, index) => ({
      label: `summit-${index}`,
      url: `/api/poster?checkinId=demo&template=summit_card&renderMode=classic_card&format=svg&verified=1&quotePool=all&quoteIndex=${index}`,
      expectedQuote: quote,
      expectedTemplate: 'summit_card',
      maxBottomGap: 520,
    })),
    ...ALL_QUOTES.map((quote, index) => ({
      label: `historical-${index}`,
      url: `/api/poster?checkinId=demo&template=summit_card&renderMode=classic_card&format=svg&verified=0&quotePool=all&quoteIndex=${index}`,
      expectedQuote: quote,
      expectedTemplate: 'summit_card',
      maxBottomGap: 520,
    })),
  ]

  for (const scenario of scenarios) {
    const response = await request.get(scenario.url)
    expect(response.ok(), scenario.label).toBeTruthy()
    const svg = await response.text()
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#111;">${svg}</body></html>`)

    const template = readStringAttr(svg, 'data-poster-template')
    const contentHeight = readNumericAttr(svg, 'data-quote-content-height')
    const maxHeight = readNumericAttr(svg, 'data-quote-max-height')
    const dataBottom = readNumericAttr(svg, 'data-data-block-bottom-y')
    const bottomGap = readNumericAttr(svg, 'data-bottom-gap')
    const overflowMode = readStringAttr(svg, 'data-quote-overflow-mode')
    const geometry = await page.evaluate(() => {
      const svgRoot = document.querySelector('svg')
      const quotePanel = svgRoot?.querySelector('[data-quote-panel="true"]')
      const firstLine = svgRoot?.querySelector('[data-quote-line-index="0"]')
      const label = svgRoot?.querySelector('[data-quote-label="true"]')
      const footer = svgRoot?.querySelector('[data-footer-brand="true"]')

      const readBox = (node: Element | null | undefined) => {
        if (!node) return null
        const box = (node as SVGGraphicsElement).getBBox()
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          bottom: box.y + box.height,
        }
      }

      return {
        panel: readBox(quotePanel),
        firstLine: readBox(firstLine),
        label: readBox(label),
        footer: readBox(footer),
      }
    })

    expect(template, scenario.label).toBe(scenario.expectedTemplate)
    expect(Number.isFinite(contentHeight), `${scenario.label}: contentHeight`).toBeTruthy()
    expect(Number.isFinite(maxHeight), `${scenario.label}: maxHeight`).toBeTruthy()
    expect(Number.isFinite(dataBottom), `${scenario.label}: dataBottom`).toBeTruthy()
    expect(Number.isFinite(bottomGap), `${scenario.label}: bottomGap`).toBeTruthy()
    expect(geometry.panel, `${scenario.label}: panel`).not.toBeNull()
    expect(geometry.firstLine, `${scenario.label}: firstLine`).not.toBeNull()
    expect(geometry.footer, `${scenario.label}: footer`).not.toBeNull()

    expect(geometry.panel!.y, scenario.label).toBeGreaterThanOrEqual(dataBottom + 24)
    expect(geometry.firstLine!.y, scenario.label).toBeGreaterThanOrEqual(geometry.panel!.y + 1)
    expect(geometry.firstLine!.bottom, scenario.label).toBeLessThan(geometry.footer!.y - 15)
    expect(geometry.footer!.bottom, scenario.label).toBeLessThanOrEqual(geometry.panel!.bottom - 12)
    expect(geometry.panel!.bottom, scenario.label).toBeLessThanOrEqual(POSTER_HEIGHT - 1)
    expect(contentHeight, scenario.label).toBeLessThanOrEqual(maxHeight)
    expect(geometry.panel!.height, scenario.label).toBeLessThanOrEqual(POSTER_HEIGHT / 3)
    expect(bottomGap, scenario.label).toBeLessThanOrEqual(scenario.maxBottomGap)

    if (scenario.expectedTemplate === 'trek_snapshot') {
      expect(geometry.label, `${scenario.label}: label`).not.toBeNull()
      const labelGap = geometry.firstLine!.y - geometry.label!.bottom
      expect(labelGap, `${scenario.label}: label gap too small`).toBeGreaterThanOrEqual(8)
      expect(labelGap, `${scenario.label}: label gap too large`).toBeLessThanOrEqual(12)
    }

    if (overflowMode === 'fit') {
      expect(svg, `${scenario.label}: full quote should be present`).toContain(`data-full-quote="${scenario.expectedQuote.text}"`)
    } else {
      expect(overflowMode, `${scenario.label}: unexpected overflow mode`).toBe('truncated')
      expect(svg, `${scenario.label}: truncated quote should keep ellipsis`).toContain('…')
    }
  }
})
