import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadTemplateAccess() {
  return import(`../src/lib/monetization/template-access.${sourceExtension}`)
}

async function withPaywallFlag<T>(value: string | undefined, callback: () => Promise<T> | T) {
  const previous = process.env.ENABLE_PREMIUM_TEMPLATE_PAYWALL

  if (value === undefined) {
    delete process.env.ENABLE_PREMIUM_TEMPLATE_PAYWALL
  } else {
    process.env.ENABLE_PREMIUM_TEMPLATE_PAYWALL = value
  }

  try {
    return await callback()
  } finally {
    if (previous === undefined) {
      delete process.env.ENABLE_PREMIUM_TEMPLATE_PAYWALL
    } else {
      process.env.ENABLE_PREMIUM_TEMPLATE_PAYWALL = previous
    }
  }
}

test('basic templates are always allowed without watermark', async () => {
  const { checkTemplateAccess, isPremiumTemplate } = await loadTemplateAccess()

  await withPaywallFlag('true', () => {
    assert.equal(isPremiumTemplate('basic-classic'), false)
    assert.deepEqual(checkTemplateAccess('basic-classic', 'free', null), {
      allowed: true,
      watermark: false,
    })
  })
})

test('premium templates are free during beta when paywall flag is off', async () => {
  const { checkTemplateAccess, isPremiumTemplate } = await loadTemplateAccess()

  await withPaywallFlag(undefined, () => {
    assert.equal(isPremiumTemplate('premium-photo-overlay'), true)
    assert.deepEqual(checkTemplateAccess('premium-photo-overlay', 'free', null), {
      allowed: true,
      watermark: false,
    })
  })
})

test('premium templates are locked for free users when paywall flag is on', async () => {
  const { checkTemplateAccess } = await loadTemplateAccess()

  await withPaywallFlag('true', () => {
    assert.deepEqual(checkTemplateAccess('premium-bold-number', 'free', null), {
      allowed: false,
      watermark: true,
      reason: 'premium_template_locked',
    })
  })
})

test('premium templates are allowed for premium users when paywall flag is on', async () => {
  const { checkTemplateAccess } = await loadTemplateAccess()

  await withPaywallFlag('true', () => {
    assert.deepEqual(checkTemplateAccess('premium-bold-number', 'premium', null), {
      allowed: true,
      watermark: false,
    })
  })
})

test('premium templates are allowed for active premium trial users', async () => {
  const { checkTemplateAccess } = await loadTemplateAccess()

  await withPaywallFlag('true', () => {
    const future = new Date(Date.now() + 60_000).toISOString()

    assert.deepEqual(checkTemplateAccess('premium-photo-overlay', 'premium_trial', future), {
      allowed: true,
      watermark: false,
    })
  })
})

test('premium templates are locked for expired premium trial users', async () => {
  const { checkTemplateAccess } = await loadTemplateAccess()

  await withPaywallFlag('true', () => {
    const past = new Date(Date.now() - 60_000).toISOString()

    assert.deepEqual(checkTemplateAccess('premium-photo-overlay', 'premium_trial', past), {
      allowed: false,
      watermark: true,
      reason: 'premium_template_locked',
    })
  })
})
