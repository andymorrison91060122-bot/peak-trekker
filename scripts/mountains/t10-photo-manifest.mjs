import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  readJsonl,
  sha256File,
} from './t10-photo-lib.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'data/mountains/photos/feishu-photo-manifest.json'
)
const CANONICAL_PATH = path.join(
  REPO_ROOT,
  'data/mountains/ledger/effective_canonicals.jsonl'
)

function attachmentRows(fields, selected) {
  const normalizedFields = selected.map((field) =>
    field === '用自备图' ? '自备图' : field
  )
  return normalizedFields.flatMap((field) => {
    const attachments = fields[field]
    assert.equal(
      Array.isArray(attachments),
      true,
      `${fields.山名}: selected field ${field} has no attachments`
    )
    return attachments.map((attachment) => ({
      field,
      file_token: attachment.file_token,
      name: attachment.name,
      size: attachment.size,
    }))
  })
}

function candidateKeyFromFilename(filename) {
  return String(filename ?? '').match(/^(.+)_\d+\.[^.]+$/)?.[1] ?? null
}

function provinceKey(name, province) {
  return `${String(name).trim()}\u0000${String(province).trim()}`
}

export function buildManifestFromFeishuRecords(
  records,
  previousManifest,
  canonicals
) {
  assert.equal(records.length >= 359, true)
  assert.equal(previousManifest.length, 359)
  assert.equal(canonicals.length, 359)
  const previousByKey = new Map(
    previousManifest.map((row) => [row.effective_canonical_key, row])
  )
  const previousByName = new Map()
  for (const row of previousManifest) {
    const rows = previousByName.get(row.name) ?? []
    rows.push(row)
    previousByName.set(row.name, rows)
  }
  const canonicalByProvinceIdentity = new Map()
  for (const row of canonicals) {
    for (const province of row.provinces) {
      const identity = provinceKey(row.primary_name, province)
      assert.equal(
        canonicalByProvinceIdentity.has(identity),
        false,
        `duplicate canonical province identity: ${identity}`
      )
      canonicalByProvinceIdentity.set(identity, row.effective_canonical_key)
    }
  }

  const result = []
  const seenKeys = new Set()
  const seenTokens = new Set()
  for (const record of records) {
    const fields = record.fields ?? {}
    const name = String(fields.山名 ?? '').trim()
    if (!name) continue
    const selected = Array.isArray(fields.选中)
      ? fields.选中
      : [fields.选中].filter(Boolean)
    assert.equal(selected.length >= 1, true, `${name}: no selected image`)
    const images = attachmentRows(fields, selected)
    assert.equal(
      images.length >= 1 && images.length <= 3,
      true,
      `${name}: selected image count must be 1..3`
    )
    const filenameKeys = [
      ...new Set(
        images
          .filter((image) => image.field !== '自备图')
          .map((image) => candidateKeyFromFilename(image.name))
          .filter(Boolean)
      ),
    ]
    let key = null
    let keySource = null
    if (filenameKeys.length === 1 && previousByKey.has(filenameKeys[0])) {
      key = filenameKeys[0]
      keySource = 'filename'
    } else {
      assert.equal(
        filenameKeys.length,
        0,
        `${name}: candidate filenames disagree on canonical key`
      )
      const named = previousByName.get(name) ?? []
      if (named.length === 1) {
        key = named[0].effective_canonical_key
        keySource = 'unique_name'
      } else {
        key = canonicalByProvinceIdentity.get(
          provinceKey(name, fields.省份)
        )
        keySource = 'name_province'
      }
    }
    assert(key, `${name}: canonical identity unresolved`)
    assert.equal(previousByKey.has(key), true, `${name}: unknown key ${key}`)
    assert.equal(seenKeys.has(key), false, `duplicate canonical key ${key}`)
    seenKeys.add(key)
    for (const image of images) {
      assert.equal(typeof image.file_token, 'string')
      assert.equal(image.file_token.length > 0, true)
      assert.equal(
        seenTokens.has(image.file_token),
        false,
        `${key}: duplicate file token`
      )
      seenTokens.add(image.file_token)
    }
    result.push({
      effective_canonical_key: key,
      name,
      key_source: keySource,
      selected,
      images,
    })
  }
  result.sort((left, right) =>
    left.effective_canonical_key.localeCompare(
      right.effective_canonical_key,
      'en-US'
    )
  )
  assert.equal(result.length, 359)
  assert.equal(seenKeys.size, 359)
  assert.equal(seenTokens.size, result.reduce(
    (sum, row) => sum + row.images.length,
    0
  ))
  return result
}

export function rebuildPhotoManifest({
  dumpPath = process.env.T10_FEISHU_DUMP_PATH,
} = {}) {
  assert(dumpPath, 'T10_FEISHU_DUMP_PATH is required')
  const records = JSON.parse(fs.readFileSync(dumpPath, 'utf8'))
  const previousManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const canonicals = readJsonl(CANONICAL_PATH)
  const manifest = buildManifestFromFeishuRecords(
    records,
    previousManifest,
    canonicals
  )
  const tempPath = `${MANIFEST_PATH}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 1)}\n`)
  fs.renameSync(tempPath, MANIFEST_PATH)
  return {
    manifest_sha256: sha256File(MANIFEST_PATH),
    mountains: manifest.length,
    images: manifest.reduce((sum, row) => sum + row.images.length, 0),
    single_image_mountains: manifest.filter((row) => row.images.length === 1).length,
    double_image_mountains: manifest.filter((row) => row.images.length === 2).length,
    triple_image_mountains: manifest.filter((row) => row.images.length === 3).length,
    user_supplied_mountains: manifest.filter((row) =>
      row.images.some((image) => image.field === '自备图')
    ).length,
    user_supplied_images: manifest.reduce(
      (sum, row) =>
        sum + row.images.filter((image) => image.field === '自备图').length,
      0
    ),
  }
}

const isCli = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  try {
    console.log(JSON.stringify(rebuildPhotoManifest(), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
