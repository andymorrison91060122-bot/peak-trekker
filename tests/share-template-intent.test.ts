import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildExploreShareTemplateUrl,
  buildImportUrl,
  buildImprintImportUrl,
  buildImprintScreenshotUrl,
  buildImprintSourceUrl,
  buildScreenshotUrl,
  buildShareUrlForCheckin,
  buildShareUrl,
  buildTrekUrl,
  consumePendingShareTemplateForTrekUrl,
  DEFAULT_SHARE_TEMPLATE,
  peekPendingShareTemplate,
  resolveCompletionShareTemplate,
  resolveInitialShareTemplate,
  resolveShareTemplateParam,
  SHARE_TEMPLATE_PENDING_STORAGE_KEY,
  storePendingShareTemplate,
} from '../src/lib/share-template-intent.ts'

function withSessionStorage(callback: (store: Map<string, string>) => void) {
  const store = new Map<string, string>()
  const previousWindow = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  }
  try {
    callback(store)
  } finally {
    ;(globalThis as { window?: unknown }).window = previousWindow
  }
}

test('share template parser accepts known ids and ignores unknown values', () => {
  assert.equal(resolveShareTemplateParam('premium-bold-number'), 'premium-bold-number')
  assert.equal(resolveShareTemplateParam(['base-classic']), 'base-classic')
  assert.equal(resolveShareTemplateParam('minimal'), null)
  assert.equal(resolveShareTemplateParam(undefined), null)
})

test('URL template wins over pending imprint intent and pending is one-shot', () => {
  withSessionStorage(() => {
    storePendingShareTemplate('premium-photo-overlay')

    assert.equal(
      resolveInitialShareTemplate({
        urlTemplate: 'premium-bold-number',
        allowPending: true,
      }),
      'premium-bold-number',
    )
    assert.equal(
      resolveInitialShareTemplate({
        urlTemplate: undefined,
        allowPending: true,
      }),
      'premium-photo-overlay',
    )
    assert.equal(
      resolveInitialShareTemplate({
        urlTemplate: undefined,
        allowPending: true,
      }),
      DEFAULT_SHARE_TEMPLATE,
    )
  })
})

test('non-facade share reads do not consume pending template intent', () => {
  withSessionStorage(() => {
    storePendingShareTemplate('premium-photo-composite')
    assert.equal(resolveInitialShareTemplate({ urlTemplate: undefined }), DEFAULT_SHARE_TEMPLATE)
    assert.equal(resolveInitialShareTemplate({ urlTemplate: undefined, allowPending: true }), 'premium-photo-composite')
  })
})

test('completion template resolver validates pending source and TTL before consuming', () => {
  withSessionStorage((store) => {
    store.set(SHARE_TEMPLATE_PENDING_STORAGE_KEY, JSON.stringify({
      source: 'trek',
      template: 'premium-bold-number',
      createdAt: Date.now(),
    }))
    assert.equal(resolveCompletionShareTemplate({ allowPending: true }), null)
    assert.equal(store.has(SHARE_TEMPLATE_PENDING_STORAGE_KEY), false)

    store.set(SHARE_TEMPLATE_PENDING_STORAGE_KEY, JSON.stringify({
      source: 'imprint',
      template: 'premium-bold-number',
      createdAt: Date.now() - 31 * 60 * 1000,
    }))
    assert.equal(resolveCompletionShareTemplate({ allowPending: true }), null)
    assert.equal(store.has(SHARE_TEMPLATE_PENDING_STORAGE_KEY), false)

    storePendingShareTemplate('premium-bold-number')
    assert.equal(peekPendingShareTemplate(), 'premium-bold-number')
    assert.equal(resolveCompletionShareTemplate({ allowPending: true }), 'premium-bold-number')
    assert.equal(store.has(SHARE_TEMPLATE_PENDING_STORAGE_KEY), false)
  })
})

test('ordinary trek completion without URL template does not consume old pending intent', () => {
  withSessionStorage((store) => {
    storePendingShareTemplate('premium-photo-overlay')
    assert.equal(resolveCompletionShareTemplate({ urlTemplate: undefined, allowPending: false }), null)
    assert.equal(peekPendingShareTemplate(), 'premium-photo-overlay')
    assert.equal(store.has(SHARE_TEMPLATE_PENDING_STORAGE_KEY), true)
  })
})

test('template URL builders use a single helper surface', () => {
  assert.equal(buildShareUrl({ checkinId: 'abc', template: 'premium-bold-number' }), '/share?checkinId=abc&template=premium-bold-number')
  assert.equal(buildShareUrl({ checkinId: 'abc' }), '/share?checkinId=abc')
  assert.equal(buildShareUrlForCheckin({ checkinId: 'abc', template: 'premium-bold-number' }), '/share?checkinId=abc&template=premium-bold-number')
  assert.equal(buildShareUrlForCheckin({ checkinId: null, template: 'premium-bold-number' }), null)
  assert.equal(buildImportUrl('base-classic'), '/import?template=base-classic')
  assert.equal(buildScreenshotUrl('premium-photo-overlay'), '/screenshot?template=premium-photo-overlay')
  assert.equal(buildImprintImportUrl('base-classic'), '/import?template=base-classic&from=imprint')
  assert.equal(buildImprintScreenshotUrl('premium-photo-overlay'), '/screenshot?template=premium-photo-overlay&from=imprint')
  assert.equal(buildImprintSourceUrl('premium-bold-number'), '/imprint?template=premium-bold-number&step=source')
  assert.equal(buildImprintSourceUrl(null), '/imprint?step=source')
  assert.equal(buildExploreShareTemplateUrl('premium-photo-composite'), '/explore?shareTemplate=premium-photo-composite')
  assert.equal(buildTrekUrl({ mountainId: 'huangshan', template: 'premium-bold-number' }), '/trek?mountainId=huangshan&shareTemplate=premium-bold-number')
  assert.equal(buildTrekUrl({ mountainId: 'huangshan' }), '/trek?mountainId=huangshan')
})

test('trek entry consumes pending imprint intent before building explicit trek URL', () => {
  withSessionStorage((store) => {
    storePendingShareTemplate('premium-bold-number')
    assert.equal(
      consumePendingShareTemplateForTrekUrl({ mountainId: 'huangshan' }),
      '/trek?mountainId=huangshan&shareTemplate=premium-bold-number',
    )
    assert.equal(store.has(SHARE_TEMPLATE_PENDING_STORAGE_KEY), false)
    assert.equal(buildTrekUrl({ mountainId: 'huangshan' }), '/trek?mountainId=huangshan')
    assert.equal(consumePendingShareTemplateForTrekUrl({ mountainId: 'huangshan' }), '/trek?mountainId=huangshan')
  })
})
