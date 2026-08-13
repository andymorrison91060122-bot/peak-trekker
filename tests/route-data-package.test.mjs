import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRouteDataPackage,
  deterministicGeometryId,
  deterministicMountainId,
  recomputeGeometryFacts,
} from '../scripts/mountains/build-route-data-package.mjs'

const EXPECTED_FROZEN_SHA256 = {
  effective_canonicals: '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  entity_semantics: '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
  enrichment: 'b3f43ef40e009c35ee1ca96aed9d55038afe4eb76a39b9c7bb37f2e4404cfee5',
}

test('builds the incremental source closure without promoting route candidates to active data', () => {
  const pkg = buildRouteDataPackage()

  assert.equal(pkg.geometryImports.length, 196)
  assert.equal(pkg.contentImports.length, 12)
  assert.equal(pkg.coverImports.length, 16)
  assert.equal(pkg.existingEntityUpdates.length, 2)
  assert.equal(pkg.blockers.length, 1)
  assert.equal(pkg.summary.content.ready, 11)
  assert.equal(pkg.summary.content.blocked, 1)
  assert.equal(pkg.summary.geometry.geo_conflicts, 8)
  assert.deepEqual(pkg.summary.geometry.display_mode, {
    map: 196,
    trace_only: 0,
  })

  const promotedIds = new Set([
    'cf7e49b4-e88f-5857-9616-f5412e0e45df',
    '21596c67-fe44-5129-a850-0009761ca8c2',
    '18f70a02-59eb-5686-bcef-1a73ea36430d',
    'd9984023-d6b6-5b27-be7d-0b21696cb3a4',
  ])
  assert.equal(
    pkg.geometryImports.filter((row) => promotedIds.has(row.id)).every((row) => row.display_mode === 'map'),
    true,
  )
  assert.deepEqual(pkg.summary.content.no_track_keys, [
    'aotai-traverse-route',
    'bogeda-grand-loop-route',
    'langta-ancient-trail-route',
  ])
  assert.deepEqual(pkg.summary.frozen_inputs, EXPECTED_FROZEN_SHA256)

  for (const row of pkg.contentImports) {
    assert.equal(row.entity_type, 'route_corridor')
    assert.equal(row.is_active, false)
    assert.equal(row.is_readable, false)
    assert.equal(row.altitude, null)
    assert.equal(row.altitude_m_exact, null)
    assert.equal('length_km' in row, false)
    assert.equal('estimated_duration' in row, false)
  }
})

test('preserves the approved incremental admission provenance without global content-SHA deduplication', () => {
  const pkg = buildRouteDataPackage()
  const manual = pkg.geometryImports.filter((row) => (
    row.source_admission?.decision === 'product_approved_missing_canonical_coordinate'
  ))
  assert.equal(manual.length, 7)
  for (const row of manual) {
    assert.equal(row.geography_check.status, 'product_approved_missing_canonical_coordinate')
    assert.equal(row.geography_check.min_point_distance_km, null)
    assert.equal(row.source_admission.distance_check, 'not_run_missing_canonical_coordinate')
  }

  const gongga = pkg.geometryImports.filter((row) => (
    row.source_file_sha256 === 'd2f6c91d7eaac8200f23efc1d349cf47df2aed1c8e6ea7a80d5a62e8a38c3017'
  ))
  assert.equal(gongga.length, 5)
  assert.equal(new Set(gongga.map((row) => row.effective_canonical_key)).size, 5)
  assert.equal(new Set(gongga.map((row) => row.id)).size, 5)
  assert.equal(new Set(gongga.map((row) => row.source_admission?.decision)).has(
    'product_approved_shared_content_sha_multi_mountain',
  ), true)
})

test('geometry rows use deterministic parent and geometry IDs with recomputed facts', () => {
  const pkg = buildRouteDataPackage()
  const ids = new Set()

  for (const row of pkg.geometryImports) {
    const facts = recomputeGeometryFacts(row.geometry)
    assert.equal(row.id, deterministicGeometryId(
      row.effective_canonical_key,
      row.source_file_sha256,
    ))
    assert.equal(row.point_count, facts.point_count)
    assert.equal(row.segment_count, facts.segment_count)
    assert.deepEqual(row.bbox, facts.bbox)
    assert.equal(row.geometry.type, 'MultiLineString')
    assert.match(row.mountain_id, /^[0-9a-f-]{36}$/)
    assert.equal(row.source_bucket, 'mountain-route-source')
    assert.equal(row.source_object_path.includes(row.source_file_sha256), true)
    assert.equal(JSON.stringify(row).includes('http'), false)
    assert.equal(ids.has(row.id), false)
    ids.add(row.id)
  }

  const taishan = pkg.geometryImports.find((row) => (
    row.effective_canonical_key === 'taishan'
  ))
  assert.equal(taishan.mountain_id, '11e9d0e9-8355-41b4-bc15-0b7e99d43c96')

  const gangrenboqi = pkg.geometryImports.find((row) => (
    row.effective_canonical_key === 'gangrenboqi-cluster'
  ))
  assert.equal(gangrenboqi.mountain_id, '137df8c2-10cd-5705-b65a-60a904744246')

  assert.notEqual(
    deterministicGeometryId('taishan', 'a'.repeat(64)),
    deterministicGeometryId('taishan', 'b'.repeat(64)),
  )
})

test('only track-backed missing coordinates become track-derived area coordinates', () => {
  const pkg = buildRouteDataPackage()
  const byKey = new Map(pkg.contentImports.map((row) => [
    row.effective_canonical_key,
    row,
  ]))

  for (const key of ['kanas-hemu-traverse-route', 'wusun-ancient-trail-route']) {
    const row = byKey.get(key)
    assert.equal(row.import_status, 'ready')
    assert.equal(row.coordinate.coordinate_role, 'track_bbox_center_area')
    assert.equal(row.coordinate.source_kind, 'parsed_track_bbox')
    assert.equal(Number.isFinite(row.latitude), true)
    assert.equal(Number.isFinite(row.longitude), true)
  }

  const langta = byKey.get('langta-ancient-trail-route')
  assert.equal(langta.import_status, 'blocked')
  assert.equal(langta.coordinate, null)
  assert.equal(langta.latitude, null)
  assert.equal(langta.longitude, null)
  assert.deepEqual(langta.blocker_codes, ['missing_required_area_coordinate'])
  assert.deepEqual(pkg.blockers.map((row) => row.effective_canonical_key), [
    'langta-ancient-trail-route',
  ])
})

test('cover plan excludes Gangrenboqi candidates and preserves runtime thumbnail compatibility', () => {
  const pkg = buildRouteDataPackage()
  const keys = new Set(pkg.contentImports.map((row) => row.effective_canonical_key))

  assert.equal(pkg.coverImports.some((row) => row.mountain_name === '冈仁波齐'), false)
  assert.equal(new Set(pkg.coverImports.map((row) => row.effective_canonical_key)).size, 12)
  for (const row of pkg.coverImports) {
    assert.equal(keys.has(row.effective_canonical_key), true)
    assert.equal(row.provider, 'user_supplied')
    assert.equal(row.license, 'user_owned')
    assert.equal(row.review_status, 'approved_by_user')
    assert.match(row.storage_object_path, new RegExp(
      `^catalog/${row.effective_canonical_key}/[0-9]{2}-user-supplied-`,
    ))
    assert.match(row.thumbnail_object_path, new RegExp(
      `^catalog/${row.effective_canonical_key}/thumb-v1-`,
    ))
    assert.equal(row.public_url, null)
  }
})

test('existing entity updates reproduce the R1 association proposals without inventing fields', () => {
  const pkg = buildRouteDataPackage()
  const byKey = new Map(pkg.existingEntityUpdates.map((row) => [
    row.existing_effective_canonical_key,
    row,
  ]))

  const gangrenboqi = byKey.get('gangrenboqi-cluster')
  assert.equal(gangrenboqi.existing_id, '137df8c2-10cd-5705-b65a-60a904744246')
  assert.equal(gangrenboqi.proposal_type, 'correct_existing_entity_semantics_and_bind_route')
  assert.equal(gangrenboqi.proposed_product_primary_name, '冈仁波齐')
  assert.equal(gangrenboqi.proposed_catalog_entity_kind, 'mountain_area')
  assert.equal(gangrenboqi.proposed_route_name, '冈仁波齐转山环线')
  assert.deepEqual(gangrenboqi.proposed_distance_km_range, [52, 57])
  assert.equal(gangrenboqi.proposed_access_status, 'pilgrimage_only')
  assert.equal(gangrenboqi.altitude_resolution, 'needs_product_decision')

  const hutiaoxia = byKey.get('hutiaoxia-gaolu-route')
  assert.equal(hutiaoxia.existing_id, '9bef8995-54c4-5e7a-8b38-4342bb818faf')
  assert.equal(hutiaoxia.proposal_type, 'enrich_existing_route_relationship')
  assert.equal(hutiaoxia.retain_length_km, 22)
  assert.deepEqual(hutiaoxia.proposed_related_mountain_keys, [
    'yulong-xueshan',
    'haba-xueshan',
  ])
})

test('mountain ID derivation remains compatible with the existing S3A contract', () => {
  assert.equal(
    deterministicMountainId('gangrenboqi-cluster'),
    '137df8c2-10cd-5705-b65a-60a904744246',
  )
  assert.equal(
    deterministicMountainId('hutiaoxia-gaolu-route'),
    '9bef8995-54c4-5e7a-8b38-4342bb818faf',
  )
})
