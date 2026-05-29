import test from 'node:test'
import assert from 'node:assert/strict'

const sourceExtension = 'ts'

async function loadSanitizeConfig() {
  return import(`../src/components/mountain/mountain-description-sanitize.${sourceExtension}`)
}

test('mountain description sanitizer allows only the rich text subset', async () => {
  const { MOUNTAIN_DESCRIPTION_ALLOWED_TAGS } = await loadSanitizeConfig()

  assert.deepEqual([...MOUNTAIN_DESCRIPTION_ALLOWED_TAGS].sort(), [
    'b',
    'br',
    'em',
    'h2',
    'h3',
    'h4',
    'i',
    'li',
    'ol',
    'p',
    'span',
    'strong',
    'ul',
  ].sort())
})

test('mountain description sanitizer strips every attribute', async () => {
  const { MOUNTAIN_DESCRIPTION_ALLOWED_ATTR, getMountainDescriptionSanitizeConfig } = await loadSanitizeConfig()

  assert.deepEqual(MOUNTAIN_DESCRIPTION_ALLOWED_ATTR, [])
  assert.deepEqual(getMountainDescriptionSanitizeConfig().ALLOWED_ATTR, [])
})

test('mountain description sanitizer forbids images, links, scripts, iframes, and styles', async () => {
  const { MOUNTAIN_DESCRIPTION_FORBID_TAGS } = await loadSanitizeConfig()

  assert.deepEqual([...MOUNTAIN_DESCRIPTION_FORBID_TAGS].sort(), [
    'a',
    'iframe',
    'img',
    'script',
    'style',
  ].sort())
})

test('stripTagsForFallback removes tag syntax for SSR and no-JS fallback', async () => {
  const { stripTagsForFallback } = await loadSanitizeConfig()

  assert.equal(
    stripTagsForFallback('<h2>标题</h2><p>第一段 <strong>重点</strong></p><img src=x><script>alert(1)</script>'),
    '标题第一段 重点alert(1)',
  )
})
