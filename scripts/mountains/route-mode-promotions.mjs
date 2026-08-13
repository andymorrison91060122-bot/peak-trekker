import assert from 'node:assert/strict'

export const ROUTE_MAP_MODE_PROMOTIONS = Object.freeze([
  Object.freeze({
    geometryId: 'cf7e49b4-e88f-5857-9616-f5412e0e45df',
    mountainId: '98786a61-8c62-5c36-84bb-c9c09a518394',
    effectiveCanonicalKey: 'wusun-ancient-trail-route',
    sourceFileSha256: 'c17d63eb6febfceabbebb20ebeb8cc7a26fee48b017e071818e61e3848ead434',
  }),
  Object.freeze({
    geometryId: '21596c67-fe44-5129-a850-0009761ca8c2',
    mountainId: 'ab65bafe-b7a5-516c-bef8-e6efbb8cc7ff',
    effectiveCanonicalKey: 'everest-east-kama-valley-route',
    sourceFileSha256: '7c6f3526649a8bbfc37b8678ee92d71679d1a50f8fc0b839974cf355b2a3688a',
  }),
  Object.freeze({
    geometryId: '18f70a02-59eb-5686-bcef-1a73ea36430d',
    mountainId: 'e461af81-2f6a-5631-8dc4-23eaef276ff4',
    effectiveCanonicalKey: 'kanas-hemu-traverse-route',
    sourceFileSha256: '3f8041d656889d959f7b3c3b64ee4552ea49e2f60eb2c3fb199e974ec284dbe5',
  }),
  Object.freeze({
    geometryId: 'd9984023-d6b6-5b27-be7d-0b21696cb3a4',
    mountainId: 'eca11851-2fe2-5417-b938-a45201282ed6',
    effectiveCanonicalKey: 'gongga-grand-loop-route',
    sourceFileSha256: '837b7c2fa76d497b7a43428b01ec21b69be7077ce6f1eb38f1ce55385d1ac2f8',
  }),
])

export function applyRouteMapModePromotions(rows) {
  const promotionsByGeometryId = new Map(
    ROUTE_MAP_MODE_PROMOTIONS.map((promotion) => [promotion.geometryId, promotion]),
  )
  const applied = new Set()
  const promotedRows = rows.map((row) => {
    const promotion = promotionsByGeometryId.get(row.id)
    if (!promotion) return row
    assert.equal(row.mountain_id, promotion.mountainId, `promotion mountain drift: ${row.id}`)
    assert.equal(
      row.geography_check?.reference?.effective_canonical_key,
      promotion.effectiveCanonicalKey,
      `promotion canonical drift: ${row.id}`,
    )
    assert.equal(
      row.source_file_sha256,
      promotion.sourceFileSha256,
      `promotion source SHA drift: ${row.id}`,
    )
    assert(
      ['trace_only_candidate', 'map_candidate'].includes(row.display_mode),
      `invalid source mode for promotion: ${promotion.geometryId}`,
    )
    applied.add(promotion.geometryId)
    return { ...row, display_mode: 'map_candidate' }
  })
  assert.deepEqual(
    [...applied].sort(),
    ROUTE_MAP_MODE_PROMOTIONS.map((entry) => entry.geometryId).sort(),
    'route map mode promotion closure changed',
  )
  return promotedRows
}
