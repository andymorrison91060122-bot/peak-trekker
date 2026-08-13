import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import {
  buildRouteGeometryAdmission,
} from '../scripts/mountains/admit-route-geometries.mjs'

const KML = `<?xml version="1.0"?><kml><Document><Placemark><LineString><coordinates>108.5000,23.3000,1000 108.5010,23.3010,1050 108.5020,23.3020,1100</coordinates></LineString></Placemark></Document></kml>`
const SHA = crypto.createHash('sha256').update(KML).digest('hex')

const canonicalRows = [
  {
    effective_canonical_key: 'daming-shan-guangxi',
    primary_name: '大明山',
    aliases: [],
    provinces: ['广西壮族自治区'],
    entity_type: 'peak',
    gps: { present: true, latitude: 23.3, longitude: 108.55 },
  },
  {
    effective_canonical_key: 'kongur-feng',
    primary_name: '公格尔峰',
    aliases: [],
    provinces: ['新疆维吾尔自治区'],
    entity_type: 'peak',
    gps: { present: false, latitude: null, longitude: null },
  },
  {
    effective_canonical_key: 'gongga-shan',
    primary_name: '贡嘎雪山主峰',
    aliases: [],
    provinces: ['四川省'],
    entity_type: 'peak',
    gps: { present: true, latitude: 23.3, longitude: 108.55 },
  },
]

function candidate(overrides = {}) {
  return {
    record_id: 'rec-test-1',
    mountain_name: '大明山（广西）',
    region: '广西',
    route_name: '大明山景区正门-龙头峰',
    source_name: 'fixture.kml',
    file_token: 'file-test-1',
    sha256: SHA,
    category: 'mountain_unresolved',
    ...overrides,
  }
}

test('admits province-disambiguated and missing-coordinate KML with auditable non-fabricated provenance', () => {
  const plan = buildRouteGeometryAdmission({
    candidates: [
      candidate(),
      candidate({
        record_id: 'rec-test-2',
        mountain_name: '公格尔峰',
        region: '新疆',
        route_name: '大本营-主峰',
        file_token: 'file-test-2',
        category: 'invalid_or_unreadable',
        canonical_key: 'kongur-feng',
        reason: 'missing_canonical_coordinate',
      }),
    ],
    canonicalRows,
    existingSourceRows: [],
    readAttachment: () => Buffer.from(KML),
  })

  assert.equal(plan.admitted.length, 2)
  const [provinceResolved, missingCoordinate] = plan.admitted
  assert.equal(provinceResolved.geography_check.status, 'parsed_geo_match')
  assert.equal(provinceResolved.admission.decision, 'product_approved_province_disambiguation')
  assert.equal(provinceResolved.geography_check.reference.effective_canonical_key, 'daming-shan-guangxi')
  assert.equal(missingCoordinate.terminal_status, 'product_approved_missing_canonical_coordinate')
  assert.equal(missingCoordinate.geography_check.status, 'product_approved_missing_canonical_coordinate')
  assert.equal(missingCoordinate.geography_check.min_point_distance_km, null)
  assert.equal(missingCoordinate.admission.distance_check, 'not_run_missing_canonical_coordinate')
})

test('keeps a product-approved province mapping auditable when the automatic distance screen does not pass', () => {
  const plan = buildRouteGeometryAdmission({
    candidates: [candidate({
      record_id: 'rec-test-5',
      mountain_name: '贡嘎雪山主峰（四川）',
      region: '四川',
      route_name: '环线',
      file_token: 'file-test-5',
      category: 'mountain_unresolved',
    })],
    canonicalRows: canonicalRows.map((row) => row.effective_canonical_key === 'gongga-shan'
      ? { ...row, primary_name: '贡嘎雪山主峰', gps: { present: true, latitude: 30, longitude: 101 } }
      : row),
    existingSourceRows: [],
    readAttachment: () => Buffer.from(KML),
  })

  const [row] = plan.admitted
  assert.equal(row.terminal_status, 'product_approved_province_disambiguation')
  assert.equal(row.geography_check.status, 'product_approved_province_disambiguation')
  assert.equal(row.geography_check.automatic_status, 'parsed_geo_mismatch')
  assert.equal(row.admission.decision, 'product_approved_province_disambiguation')
})

test('allows shared content SHA across mountains but rejects a duplicate mountain and content SHA pair', () => {
  const shared = candidate({
    record_id: 'rec-test-3',
    mountain_name: '贡嘎雪山主峰',
    region: '四川',
    route_name: '环线',
    file_token: 'file-test-3',
    category: 'new_valid',
    canonical_key: 'gongga-shan',
  })

  const plan = buildRouteGeometryAdmission({
    candidates: [candidate(), shared],
    canonicalRows,
    existingSourceRows: [],
    readAttachment: () => Buffer.from(KML),
  })
  assert.equal(plan.admitted.length, 2)
  assert.equal(new Set(plan.admitted.map((row) => row.source_file_sha256)).size, 1)
  assert.equal(new Set(plan.admitted.map((row) => row.geography_check.reference.effective_canonical_key)).size, 2)

  assert.throws(() => buildRouteGeometryAdmission({
    candidates: [shared, { ...shared, record_id: 'rec-test-4', file_token: 'file-test-4' }],
    canonicalRows,
    existingSourceRows: [],
    readAttachment: () => Buffer.from(KML),
  }), /duplicate geometry source pair/)
})
