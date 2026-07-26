import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  ADAPTERS,
  CREDIBLE_SOURCE_POLICY_V2,
  DEFAULT_OVERPASS_ENDPOINT,
  MAILRU_OVERPASS_ENDPOINT,
  PILOT_KEYS,
  adaptersForOverpassEndpoint,
  assignDependencyClusters,
  buildOverpassQuery,
  buildParentAnchorAudit,
  buildParentAnchorConsensus,
  buildReviewRecord,
  classifyEntityObservations,
  classifyObservation,
  deriveCoordinateTarget,
  exactTargetNames,
  escapeOverpassLiteral,
  escapeOverpassRegex,
  haversineMeters,
  parseReferenceEvidence,
  planOverpassPartitions,
  renderDeterministicPackage,
  resolveOverpassEndpoint,
  summarizeReviews,
  targetNames,
  validateManifest,
} from './review-coordinates.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

function baseEntity(overrides = {}) {
  const entity = {
    effective_canonical_key: 'huashan',
    primary_name: '华山',
    primary_summit: '南峰',
    aliases: ['华山南峰'],
    provinces: ['陕西省'],
    entity_type: 'peak',
    massif_key: null,
    altitude: { raw: '2154.9m', value_m: 2154.9, parse_quality: 'exact_literal' },
    gps: { raw: '34.45°N, 110.05°E', latitude: 34.45, longitude: 110.05, present: true },
    ...overrides,
  };
  if (!entity.entity_semantics) {
    entity.entity_semantics = {
      effective_canonical_key: entity.effective_canonical_key,
      semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area',
      coordinate_target_role: 'representative_highpoint',
      verification_scope: 'area_or_route',
      representative_highpoint_name: entity.primary_summit || '南峰',
      independent_summit_name: null,
      query_names: [entity.primary_name, entity.primary_summit || '南峰'].filter(Boolean),
      exact_target_names: [entity.primary_summit || '南峰'],
    };
  }
  return entity;
}

function observation(overrides = {}) {
  return {
    effective_canonical_key: 'huashan',
    observation_id: 'wikidata:Q1:claim-1',
    source_id: 'wikidata',
    adapter: 'wikidata-action-v2',
    latitude: 34.4777,
    longitude: 110.078,
    matched_name: '南峰',
    match_kind: 'exact',
    p31_ids: ['Q207326'],
    p31_closure_ids: ['Q207326', 'Q8502'],
    country_ids: ['Q148'],
    admin_hint: ['陕西省'],
    admin_conflict: false,
    provenance_origin: 'wikidata:Q1:claim-1',
    provenance_claim_id: 'claim-1',
    provenance_references: [],
    dependency_family: 'wikidata-unreferenced',
    credibility: 'non_credible',
    osm_element: null,
    osm_version: null,
    osm_source: null,
    osm_tags: null,
    elevation_check: 'available',
    terrain: {
      glo90_m: 2148,
      srtm90_m: 2152,
      glo90_request_id: 'glo:1',
      srtm90_request_id: 'srtm:1',
      nodata: false,
    },
    source_metadata: { qid: 'Q1' },
    ...overrides,
  };
}

function validManifest(overpassEndpoint = DEFAULT_OVERPASS_ENDPOINT) {
  const adapters = adaptersForOverpassEndpoint(overpassEndpoint);
  return {
    schema_version: 3,
    adapter_version: adapters.osm.version,
    credible_source_policy_version: CREDIBLE_SOURCE_POLICY_V2.version,
    frozen_input: { sha256: '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294' },
    entity_semantics_input: {
      path: 'ledger/entity-semantics.jsonl',
      sha256: 'semantic-test-sha',
      entity_count: 359,
    },
    pilot_keys: PILOT_KEYS,
    adapters,
    preflight: {
      checks: { overpass: { ok: true, status: 200 } },
      overpass: {
        generator: 'Overpass API 0.7.test',
        osm_base: '2026-07-23T00:00:00Z',
        copyright: 'OpenStreetMap data is available under the ODbL.',
      },
    },
    overpass_transport: {
      endpoint: overpassEndpoint,
      source_family: 'osm',
      adapter_version: adapters.osm.version,
      generator: 'Overpass API 0.7.test',
      osm_base: '2026-07-23T00:00:00Z',
    },
    requests: [{
      request_id: 'preflight:overpass', source_id: 'overpass',
      url: overpassEndpoint, http_status: 200,
    }],
  };
}

test('derives 12 representative highpoints, 17 independent summits, 7 no-target areas and 2 routes from entity semantics', async () => {
  const entities = (await readFile(join(ROOT, 'ledger/effective_canonicals.jsonl'), 'utf8'))
    .trimEnd().split('\n').map(JSON.parse);
  const semantics = (await readFile(join(ROOT, 'ledger/entity-semantics.jsonl'), 'utf8'))
    .trimEnd().split('\n').map(JSON.parse);
  const byKey = new Map(entities.map((row) => [row.effective_canonical_key, row]));
  const semanticsByKey = new Map(semantics.map((row) => [row.effective_canonical_key, row]));
  const targets = PILOT_KEYS.map((key) => deriveCoordinateTarget({
    ...byKey.get(key),
    entity_semantics: semanticsByKey.get(key),
  }));
  assert.equal(PILOT_KEYS.length, 38);
  assert.equal(new Set(PILOT_KEYS).size, 38);
  assert.equal(targets.filter((row) => row.coordinate_target_role === 'representative_highpoint').length, 12);
  assert.equal(targets.filter((row) => row.coordinate_target_role === 'independent_summit').length, 17);
  assert.equal(targets.filter((row) => row.coordinate_target_role === 'none').length, 7);
  assert.equal(targets.filter((row) => row.coordinate_target_role === 'route_highpoint').length, 2);
});

test('separates broad query names from exact target names', () => {
  const entity = baseEntity({
    effective_canonical_key: 'qiaogeli-feng-k2',
    primary_name: '乔戈里峰（K2）',
    primary_summit: null,
    aliases: ['乔戈里峰'],
    entity_semantics: {
      effective_canonical_key: 'qiaogeli-feng-k2',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'independent_peak',
      coordinate_target_role: 'independent_summit',
      verification_scope: 'summit_proximity',
      representative_highpoint_name: null,
      independent_summit_name: '乔戈里峰（K2）',
      query_names: ['乔戈里峰（K2）', '乔戈里峰', 'K2', 'Chhogori'],
      exact_target_names: ['乔戈里峰（K2）', '乔戈里峰', 'K2', 'Chhogori'],
    },
  });
  assert.deepEqual(targetNames(entity), ['乔戈里峰（K2）', '乔戈里峰', 'K2', 'Chhogori']);
  assert.deepEqual(exactTargetNames(entity), ['乔戈里峰（K2）', '乔戈里峰', 'K2', 'Chhogori']);
  const yuzhu = baseEntity({
    effective_canonical_key: 'yuzhu-feng',
    primary_name: '玉珠峰',
    primary_summit: null,
    entity_semantics: {
      effective_canonical_key: 'yuzhu-feng',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'independent_peak',
      coordinate_target_role: 'independent_summit',
      verification_scope: 'summit_proximity',
      representative_highpoint_name: null,
      independent_summit_name: '玉珠峰',
      query_names: ['玉珠峰', '玉珠峰北坡', '玉珠峰南坡'],
      exact_target_names: ['玉珠峰'],
    },
  });
  assert.deepEqual(targetNames(yuzhu), ['玉珠峰', '玉珠峰北坡', '玉珠峰南坡']);
  assert.deepEqual(exactTargetNames(yuzhu), ['玉珠峰']);
});

test('escapes Overpass literals and regex safely for Chinese punctuation and metacharacters', () => {
  assert.equal(escapeOverpassLiteral('K2（乔戈里）"\\'), 'K2（乔戈里）\\"\\\\');
  assert.equal(escapeOverpassRegex('南峰·K2 (test)+'), '南峰·K2 \\\\(test\\\\)\\\\+');
  const query = buildOverpassQuery(['K2（乔戈里）', '南峰·K2 (test)+'], ['CN-SN']);
  assert.match(query, /node\["natural"="peak"\]/);
  assert.match(query, /area\["ISO3166-2"="CN-SN"\]/);
  assert.match(query, /\[timeout:90\]/);
  assert.doesNotMatch(query, /\(\?:/);
  assert.doesNotMatch(query, /out center/);
  const bounded = buildOverpassQuery(['南峰'], ['CN-SN'], { latitude: 34.45, longitude: 110.05 });
  assert.match(bounded, /around:120000,34\.45,110\.05/);
  assert.doesNotMatch(bounded, /area\[/);
});

test('applies the 24-node cap after filtering and partitions names deterministically without truncation', () => {
  assert.deepEqual(planOverpassPartitions(['a', 'b'], 24), []);
  assert.deepEqual(planOverpassPartitions(['a', 'b', 'c', 'd', 'e'], 25), [['a', 'b'], ['c', 'd'], ['e']]);
});

test('only an exact named natural=peak node can be OSM target_exact; ele is optional but caps verification', () => {
  const entity = baseEntity();
  const exactNoEle = classifyObservation(entity, observation({
    observation_id: 'osm:node:10',
    source_id: 'osm',
    adapter: 'osm-overpass-v2',
    matched_name: '南峰',
    p31_ids: [],
    p31_closure_ids: [],
    osm_element: 'node/10',
    osm_version: 4,
    osm_tags: { natural: 'peak', name: '南峰' },
    elevation_check: 'unavailable',
    dependency_family: 'osm',
    credibility: 'credible',
  }));
  assert.equal(exactNoEle.coordinate_role, 'target_exact');
  assert.equal(exactNoEle.elevation_check, 'unavailable');
  assert.notEqual(classifyObservation(entity, { ...exactNoEle, osm_tags: { natural: 'peak' }, matched_name: '' }).coordinate_role, 'target_exact');
  assert.notEqual(classifyObservation(entity, { ...exactNoEle, osm_tags: { natural: 'volcano', name: '南峰' } }).coordinate_role, 'target_exact');
  const nominatim = classifyObservation(entity, observation({ source_id: 'osm', adapter: 'nominatim-search-v2', matched_name: '南峰' }));
  assert.notEqual(nominatim.coordinate_role, 'target_exact');
});

test('Wikidata requires an explicit mountain/summit class and no-target mountain areas stay labels', () => {
  assert.notEqual(classifyObservation(baseEntity(), observation({ p31_ids: [], p31_closure_ids: [] })).coordinate_role, 'target_exact');
  const undefinedBody = baseEntity({
    primary_name: '白云山', primary_summit: null, aliases: [], provinces: ['广东省'],
    entity_semantics: {
      effective_canonical_key: 'huashan',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area',
      coordinate_target_role: 'none',
      verification_scope: 'area_or_route',
      representative_highpoint_name: null,
      independent_summit_name: null,
      query_names: [],
      exact_target_names: [],
    },
  });
  const classified = classifyObservation(undefinedBody, observation({ matched_name: '白云山' }));
  assert.equal(classified.coordinate_role, 'mountain_label');
});

test('credible source policy is closed, versioned and folds OpenTopoMap into the OSM family', () => {
  assert.equal(CREDIBLE_SOURCE_POLICY_V2.version, 2);
  const p143 = parseReferenceEvidence({ hash: 'h1', snaks: { P143: [{ datavalue: { value: { id: 'Q328' } } }] } });
  assert.equal(p143.credible, false);
  assert.equal(p143.dependency_family, 'wikimedia');
  const otm = parseReferenceEvidence({ hash: 'h2', snaks: { P248: [{ datavalue: { value: { id: 'Q88313479' } } }] } });
  assert.equal(otm.credible, true);
  assert.equal(otm.dependency_family, 'osm');
  const official = parseReferenceEvidence({ hash: 'h3', snaks: { P854: [{ datavalue: { value: 'https://www.gov.cn/example' } }] } });
  assert.equal(official.credible, true);
  assert.equal(official.dependency_family, 'official');
  const unknown = parseReferenceEvidence({ hash: 'h4', snaks: { P248: [{ datavalue: { value: { id: 'Q999999999' } } }] } });
  assert.equal(unknown.credible, false);
  assert.deepEqual(unknown.unknown_sources, ['P248:Q999999999']);
});

test('dependency clusters collapse OSM direct and OSM-derived Wikidata claims into one vote', () => {
  const rows = assignDependencyClusters([
    observation({ observation_id: 'osm:node:1', source_id: 'osm', dependency_family: 'osm', credibility: 'credible' }),
    observation({ observation_id: 'wikidata:Q1:claim', dependency_family: 'osm', credibility: 'credible' }),
    observation({ observation_id: 'wikidata:Q2:claim', dependency_family: 'official', credibility: 'credible', source_metadata: { qid: 'Q2' } }),
  ]);
  assert.equal(rows[0].dependency_cluster_id, rows[1].dependency_cluster_id);
  assert.notEqual(rows[0].dependency_cluster_id, rows[2].dependency_cluster_id);
});

test('freezes an explicitly allowed Overpass transport in the manifest without creating a new source family', () => {
  const manifest = validManifest(MAILRU_OVERPASS_ENDPOINT);
  assert.equal(resolveOverpassEndpoint(MAILRU_OVERPASS_ENDPOINT), MAILRU_OVERPASS_ENDPOINT);
  assert.equal(manifest.adapters.osm.endpoint, MAILRU_OVERPASS_ENDPOINT);
  assert.equal(manifest.adapters.osm.source_family, 'osm');
  assert.equal(manifest.overpass_transport.source_family, 'osm');
  assert.equal(validateManifest(manifest), true);

  const mainClusters = assignDependencyClusters([
    observation({ observation_id: 'osm:main:1', source_id: 'osm', dependency_family: 'osm', credibility: 'credible' }),
  ]);
  const mirrorClusters = assignDependencyClusters([
    observation({ observation_id: 'osm:mirror:1', source_id: 'osm', dependency_family: 'osm', credibility: 'credible' }),
  ]);
  assert.equal(mainClusters[0].dependency_cluster_id, mirrorClusters[0].dependency_cluster_id);
});

test('rejects unknown and mixed Overpass transport endpoints', () => {
  assert.throws(() => resolveOverpassEndpoint('https://example.com/overpass'), /unknown Overpass endpoint/);
  const mixed = validManifest(MAILRU_OVERPASS_ENDPOINT);
  mixed.requests.push({
    request_id: 'overpass:huashan:all', source_id: 'overpass',
    url: DEFAULT_OVERPASS_ENDPOINT, http_status: 200,
  });
  assert.throws(() => validateManifest(mixed), /mixes Overpass endpoints/);

  const drifted = validManifest(MAILRU_OVERPASS_ENDPOINT);
  drifted.adapters = adaptersForOverpassEndpoint(DEFAULT_OVERPASS_ENDPOINT);
  assert.throws(() => validateManifest(drifted), /adapters mismatch/);
});

test('any >300m target_exact pair vetoes publication even when one source has unknown provenance', () => {
  const credible = observation({ dependency_family: 'official', credibility: 'credible' });
  const unknownFar = observation({
    observation_id: 'osm:node:9', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '南峰', osm_element: 'node/9', osm_version: 1,
    osm_tags: { natural: 'peak', name: '南峰', ele: '2150' },
    dependency_family: 'unknown', credibility: 'non_credible', latitude: 34.49, longitude: 110.09,
  });
  const result = buildReviewRecord(baseEntity(), [credible, unknownFar], {
    minimum_sources_complete: true, any_source_available: true, source_outcomes: { wikidata: 'complete', osm: 'complete' },
  });
  assert.equal(result.coordinate_status, 'conflict');
  assert.equal(result.publishability, 'quarantined');
  assert.equal(result.reviewed_target_coordinate, null);
  assert.ok(result.pairwise_target_exact_distances_m[0].distance_m > 300);
});

test('Guangdong Baiyun uses 摩星岭 as exact target while 白云山 remains query context', () => {
  const entity = baseEntity({
    effective_canonical_key: 'baiyun-shan-guangdong', primary_name: '白云山', primary_summit: null,
    aliases: [], provinces: ['广东省'], altitude: { raw: '382m', value_m: 382, parse_quality: 'exact_literal' },
    entity_semantics: {
      effective_canonical_key: 'baiyun-shan-guangdong',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area',
      coordinate_target_role: 'representative_highpoint',
      verification_scope: 'area_or_route',
      representative_highpoint_name: '摩星岭',
      independent_summit_name: null,
      query_names: ['白云山', '广州白云山', '摩星岭'],
      exact_target_names: ['摩星岭', '白云山摩星岭'],
    },
  });
  const productLabel = classifyObservation(entity, observation({
    effective_canonical_key: entity.effective_canonical_key,
    matched_name: '白云山',
  }));
  assert.equal(productLabel.coordinate_role, 'mountain_label');
  const parentLabel = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'wikidata:guangzhou-baiyun:label',
    matched_name: '白云山', match_kind: 'product-label',
    latitude: 23.1866417, longitude: 113.2947472, admin_hint: ['广东省'],
  });
  const first = observation({
    effective_canonical_key: entity.effective_canonical_key, matched_name: '摩星岭',
    latitude: 23.1854547, longitude: 113.2955907,
    dependency_family: 'official', credibility: 'credible', admin_hint: ['广东省'],
  });
  const second = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:99',
    source_id: 'osm', adapter: 'osm-overpass-v2', matched_name: '摩星岭',
    latitude: 23.35, longitude: 113.5, admin_hint: ['广东省'],
    osm_element: 'node/99', osm_version: 1, osm_tags: { natural: 'peak', name: '摩星岭', ele: '380' },
    dependency_family: 'unknown', credibility: 'non_credible',
  });
  const result = buildReviewRecord(entity, [parentLabel, first, second], {
    minimum_sources_complete: true, any_source_available: true, source_outcomes: { wikidata: 'complete', osm: 'complete' },
  });
  assert.equal(result.coordinate_status, 'conflict');
  assert.equal(result.publishability, 'quarantined');
});

test('undefined and route targets are excluded from source-missing and exact denominators', () => {
  const undefinedEntity = baseEntity({
    primary_summit: null,
    entity_semantics: {
      effective_canonical_key: 'huashan',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area',
      coordinate_target_role: 'none',
      verification_scope: 'area_or_route',
      representative_highpoint_name: null,
      independent_summit_name: null,
      query_names: [],
      exact_target_names: [],
    },
  });
  const undefinedReview = buildReviewRecord(undefinedEntity, [], {});
  assert.equal(undefinedReview.coordinate_status, 'needs_target_definition');
  assert.equal(undefinedReview.collection_status, 'complete');
  assert.equal(undefinedReview.reviewed_target_coordinate, null);
  const routeEntity = baseEntity({
    entity_type: 'route_corridor',
    primary_summit: null,
    entity_semantics: {
      effective_canonical_key: 'huashan',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'route_corridor',
      coordinate_target_role: 'route_highpoint',
      verification_scope: 'route_geometry',
      representative_highpoint_name: null,
      independent_summit_name: null,
      query_names: [],
      exact_target_names: [],
    },
  });
  const route = buildReviewRecord(routeEntity, [], {});
  assert.equal(route.coordinate_status, 'not_applicable');
});

test('verified requires two credible independent families, <=100m agreement, ele and observation DEM health', () => {
  const parent = observation({
    observation_id: 'wikidata:Q-huashan-parent:claim', matched_name: '华山', match_kind: 'product-label',
    p31_ids: ['Q8502'], p31_closure_ids: ['Q8502'], source_metadata: { qid: 'Q-huashan-parent' },
  });
  const osmParent = observation({
    observation_id: 'osm:node:huashan-parent', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '华山', osm_element: 'node/huashan-parent', osm_version: 1,
    osm_tags: { natural: 'peak', name: '华山' }, dependency_family: 'osm', credibility: 'credible',
    latitude: 34.4833, longitude: 110.0833,
  });
  const official = observation({ dependency_family: 'official', credibility: 'credible' });
  const osm = observation({
    observation_id: 'osm:node:1', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '南峰', osm_element: 'node/1', osm_version: 2, osm_source: 'survey',
    osm_tags: { natural: 'peak', name: '南峰', ele: '2154' }, dependency_family: 'osm', credibility: 'credible',
    latitude: 34.47772, longitude: 110.07802,
  });
  const verified = buildReviewRecord(baseEntity(), [parent, osmParent, official, osm], {
    minimum_sources_complete: true, any_source_available: true, source_outcomes: { wikidata: 'complete', osm: 'complete' },
  });
  assert.equal(verified.coordinate_status, 'verified');
  assert.equal(verified.credible_independent_cluster_count, 2);
  const noEle = buildReviewRecord(baseEntity(), [parent, osmParent, official, { ...osm, elevation_check: 'unavailable', osm_tags: { natural: 'peak', name: '南峰' } }], {
    minimum_sources_complete: true, any_source_available: true, source_outcomes: { wikidata: 'complete', osm: 'complete' },
  });
  assert.equal(noEle.coordinate_status, 'reference');
});

test('terrain is observation-bound and selected nodata or residual quarantines without switching observations', () => {
  const selected = observation({ dependency_family: 'official', credibility: 'credible', terrain: {
    glo90_m: null, srtm90_m: null, glo90_request_id: 'glo:a', srtm90_request_id: 'srtm:a', nodata: true,
  } });
  const other = observation({
    observation_id: 'osm:node:1', source_id: 'osm', adapter: 'osm-overpass-v2', matched_name: '南峰',
    osm_element: 'node/1', osm_version: 2, osm_tags: { natural: 'peak', name: '南峰', ele: '2154' },
    dependency_family: 'osm', credibility: 'credible', latitude: 34.47772, longitude: 110.07802,
  });
  const result = buildReviewRecord(baseEntity(), [selected, other], {
    minimum_sources_complete: true, any_source_available: true, source_outcomes: { wikidata: 'complete', osm: 'complete' },
  });
  assert.notEqual(result.coordinate_status, 'blocked');
  assert.equal(result.selected_observation_id, selected.observation_id);
  assert.equal(result.reviewed_target_coordinate, null);
  assert.equal(result.publishability, 'quarantined');
  assert.equal(result.selected_observation_dem.glo90_request_id, 'glo:a');
});

test('summary keeps three denominators separate and marks false-verified manual count not evaluable', () => {
  const noTarget = baseEntity({
    effective_canonical_key: 'body',
    primary_summit: null,
    entity_semantics: {
      effective_canonical_key: 'body',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area',
      coordinate_target_role: 'none',
      verification_scope: 'area_or_route',
      representative_highpoint_name: null,
      independent_summit_name: null,
      query_names: [],
      exact_target_names: [],
    },
  });
  const routeEntity = baseEntity({
    effective_canonical_key: 'route',
    primary_summit: null,
    entity_type: 'route_corridor',
    entity_semantics: {
      effective_canonical_key: 'route',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'route_corridor',
      coordinate_target_role: 'route_highpoint',
      verification_scope: 'route_geometry',
      representative_highpoint_name: null,
      independent_summit_name: null,
      query_names: [],
      exact_target_names: [],
    },
  });
  const reviews = [
    buildReviewRecord(baseEntity(), [], { minimum_sources_complete: true, any_source_available: true, source_outcomes: { osm: 'true_not_found', wikidata: 'complete' } }),
    buildReviewRecord(noTarget, [], {}),
    buildReviewRecord(routeEntity, [], {}),
  ];
  const summary = summarizeReviews(Array.from({ length: 359 }, (_, index) => ({ effective_canonical_key: `k${index}` })), [], reviews);
  assert.equal(summary.metrics.target_definition_completeness.denominator, 2);
  assert.equal(summary.metrics.representative_highpoint.exact_candidate_coverage.denominator, 1);
  assert.equal(summary.metrics.independent_summit.exact_candidate_coverage.denominator, 0);
  assert.equal(summary.metrics.product_ready_target_coverage.denominator, 2);
  assert.equal(summary.metrics.false_verified_output_count, 0);
  assert.equal(summary.metrics.false_verified_manual_sample_status, 'not_evaluable');
  assert.equal(summary.metrics.false_verified_manual_sample_count, null);
});

test('manifest adapter drift is a hard failure and never rewrites source-manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pt-coordinate-manifest-'));
  try {
    const path = join(root, 'source-manifest.json');
    const original = JSON.stringify({
      schema_version: 3,
      adapter_version: 'old',
      credible_source_policy_version: CREDIBLE_SOURCE_POLICY_V2.version,
      frozen_input: { sha256: '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294' },
      entity_semantics_input: { path: 'ledger/entity-semantics.jsonl', sha256: 'old', entity_count: 359 },
      adapters: {},
      pilot_keys: PILOT_KEYS,
    }) + '\n';
    await writeFile(path, original);
    assert.throws(() => validateManifest(JSON.parse(original), ADAPTERS), /adapter/i);
    assert.equal(await readFile(path, 'utf8'), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renders deterministic Round 2 outputs including traceability and >300m conflict files', () => {
  const far = observation({ observation_id: 'osm:node:2', source_id: 'osm', adapter: 'osm-overpass-v2', matched_name: '南峰', osm_element: 'node/2', osm_version: 1, osm_tags: { natural: 'peak', name: '南峰', ele: '2100' }, dependency_family: 'unknown', credibility: 'non_credible', latitude: 34.49, longitude: 110.09 });
  const review = buildReviewRecord(baseEntity(), [observation(), far], { minimum_sources_complete: true, any_source_available: true, source_outcomes: { wikidata: 'complete', osm: 'complete' } });
  const baseline = [{ effective_canonical_key: 'huashan', coordinate_status: 'reference', selected_observation_id: 'old' }];
  const first = renderDeterministicPackage(Array.from({ length: 359 }, (_, index) => ({ effective_canonical_key: `k${index}` })), [observation(), far], [review], baseline);
  const second = renderDeterministicPackage(Array.from({ length: 359 }, (_, index) => ({ effective_canonical_key: `k${index}` })), [observation(), far], [review], baseline);
  assert.deepEqual(first, second);
  assert.ok(first['round1-baseline.jsonl']);
  assert.ok(first['status-traceability.jsonl']);
  assert.ok(first['downstream-impact.md']);
  assert.match(first['conflicts-over-300m.jsonl'], /distance_m/);
  assert.doesNotMatch(JSON.stringify(first), /retrieved_at/);
  assert.ok(haversineMeters(34.4777, 110.078, 34.49, 110.09) > 300);
});

test('administrative identity mismatches are retained for audit but cannot remain target_exact or cause a conflict', () => {
  const k2 = baseEntity({
    effective_canonical_key: 'qiaogeli-feng-k2',
    primary_name: '乔戈里峰（K2）',
    primary_summit: null,
    provinces: ['新疆维吾尔自治区'],
    entity_semantics: {
      effective_canonical_key: 'qiaogeli-feng-k2',
      semantic_status: 'confirmed',
      catalog_entity_kind: 'independent_peak',
      coordinate_target_role: 'independent_summit',
      verification_scope: 'summit_proximity',
      representative_highpoint_name: null,
      independent_summit_name: '乔戈里峰（K2）',
      query_names: ['乔戈里峰（K2）', 'K2'],
      exact_target_names: ['乔戈里峰（K2）', 'K2'],
    },
  });
  const correct = observation({
    effective_canonical_key: k2.effective_canonical_key,
    observation_id: 'wikidata:Q43512:claim',
    matched_name: 'K2', latitude: 35.8811111, longitude: 76.5133333,
    country_ids: ['Q148', 'Q843'], admin_hint: ['新疆维吾尔自治区'],
    dependency_family: 'wikidata-unreferenced:Q43512',
  });
  const austria = observation({
    effective_canonical_key: k2.effective_canonical_key,
    observation_id: 'wikidata:Q872294:claim',
    matched_name: 'K2', latitude: 46.96556, longitude: 10.79417,
    country_ids: ['Q40'], admin_hint: ['奥地利'],
    dependency_family: 'wikidata-unreferenced:Q872294',
  });
  const classified = classifyObservation(k2, austria);
  assert.equal(classified.admin_conflict, true);
  assert.equal(classified.coordinate_role, 'wrong_entity');
  assert.equal(classified.excluded_reason, 'administrative identity mismatch');
  const review = buildReviewRecord(k2, [correct, austria], {
    minimum_sources_complete: true,
    any_source_available: true,
    source_outcomes: { osm: 'true_not_found', wikidata: 'complete' },
  });
  assert.equal(review.coordinate_status, 'reference');
  assert.deepEqual(review.target_exact_observation_ids, ['wikidata:Q43512:claim']);
  assert.deepEqual(review.pairwise_target_exact_distances_m, []);
});

test('representative highpoint candidates outside their parent mountain area are excluded before conflict evaluation', () => {
  const huangshan = baseEntity({
    effective_canonical_key: 'huangshan', primary_name: '黄山', primary_summit: '莲花峰',
    provinces: ['安徽省'],
    entity_semantics: {
      effective_canonical_key: 'huangshan', semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area', coordinate_target_role: 'representative_highpoint',
      verification_scope: 'area_or_route', representative_highpoint_name: '莲花峰', independent_summit_name: null,
      query_names: ['黄山', '莲花峰'], exact_target_names: ['莲花峰'],
    },
  });
  const parentLabel = observation({
    observation_id: 'wikidata:huangshan:label', matched_name: '黄山', match_kind: 'product-label',
    latitude: 30.125, longitude: 118.166667, admin_hint: ['安徽省'],
  });
  const osmParent = observation({
    effective_canonical_key: huangshan.effective_canonical_key,
    observation_id: 'osm:node:huangshan-parent', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '黄山', latitude: 30.1251, longitude: 118.1667, admin_hint: ['安徽省'],
    osm_element: 'node/huangshan-parent', osm_version: 1,
    osm_tags: { natural: 'peak', name: '黄山' }, dependency_family: 'osm', credibility: 'credible',
  });
  const lotus = observation({
    observation_id: 'osm:node:2239653006', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '莲花峰', latitude: 30.1271128, longitude: 118.1652327, admin_hint: ['安徽省'],
    osm_element: 'node/2239653006', osm_version: 1, osm_tags: { natural: 'peak', name: '莲花峰', ele: '1864.8' },
    dependency_family: 'osm', credibility: 'credible',
  });
  const remoteLotus = observation({
    observation_id: 'osm:node:9133798073', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '莲花峰', latitude: 30.2013029, longitude: 118.8062213, admin_hint: ['安徽省'],
    osm_element: 'node/9133798073', osm_version: 1, osm_tags: { natural: 'peak', name: '莲花峰', ele: '1083' },
    dependency_family: 'osm', credibility: 'credible',
  });
  const review = buildReviewRecord(huangshan, [parentLabel, osmParent, lotus, remoteLotus], {
    minimum_sources_complete: true,
    any_source_available: true,
    source_outcomes: { osm: 'complete', wikidata: 'complete' },
  });
  assert.equal(review.coordinate_status, 'reference');
  assert.deepEqual(review.target_exact_observation_ids, ['osm:node:2239653006']);
  assert.deepEqual(review.pairwise_target_exact_distances_m, []);
});

test('a representative highpoint without a reliable parent anchor cannot upgrade to verified', () => {
  const noAnchor = baseEntity({
    gps: { raw: null, latitude: null, longitude: null, present: false },
    entity_semantics: {
      effective_canonical_key: 'huashan', semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area', coordinate_target_role: 'representative_highpoint',
      verification_scope: 'area_or_route', representative_highpoint_name: '南峰', independent_summit_name: null,
      query_names: ['南峰'], exact_target_names: ['南峰'],
    },
  });
  const official = observation({ dependency_family: 'official', credibility: 'credible' });
  const osm = observation({
    observation_id: 'osm:node:no-anchor', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '南峰', osm_element: 'node/no-anchor', osm_version: 1,
    osm_tags: { natural: 'peak', name: '南峰', ele: '2154' }, dependency_family: 'osm', credibility: 'credible',
    latitude: 34.47772, longitude: 110.07802,
  });
  const review = buildReviewRecord(noAnchor, [official, osm], {
    minimum_sources_complete: true, any_source_available: true,
    source_outcomes: { osm: 'complete', wikidata: 'complete', terrain: 'complete' },
  });
  assert.equal(review.coordinate_status, 'reference');
  assert.equal(review.publishability, 'quarantined');
  assert.ok(review.quarantine_reasons.includes('parent_anchor_unknown'));
});

test('independent summits do not use the representative-highpoint parent radius', () => {
  const peak = baseEntity({
    effective_canonical_key: 'yuzhu-feng', primary_name: '玉珠峰', primary_summit: null,
    gps: { raw: null, latitude: null, longitude: null, present: false }, provinces: ['青海省'],
    entity_semantics: {
      effective_canonical_key: 'yuzhu-feng', semantic_status: 'confirmed',
      catalog_entity_kind: 'independent_peak', coordinate_target_role: 'independent_summit',
      verification_scope: 'summit_proximity', representative_highpoint_name: null, independent_summit_name: '玉珠峰',
      query_names: ['玉珠峰', '玉珠峰北坡'], exact_target_names: ['玉珠峰'],
    },
  });
  const candidate = observation({
    effective_canonical_key: peak.effective_canonical_key, observation_id: 'osm:node:yuzhu', source_id: 'osm',
    adapter: 'osm-overpass-v2', matched_name: '玉珠峰', latitude: 35.652509, longitude: 94.250761,
    admin_hint: ['青海省'], osm_element: 'node/yuzhu', osm_version: 1,
    osm_tags: { natural: 'peak', name: '玉珠峰', ele: '6178' }, dependency_family: 'osm', credibility: 'credible',
  });
  const review = buildReviewRecord(peak, [candidate], {
    minimum_sources_complete: true, any_source_available: true,
    source_outcomes: { osm: 'complete', wikidata: 'true_not_found', terrain: 'complete' },
  });
  assert.equal(review.coordinate_status, 'reference');
  assert.deepEqual(review.target_exact_observation_ids, ['osm:node:yuzhu']);
});

test('a seed-only parent anchor remains diagnostic and cannot publish a representative highpoint', () => {
  const entity = baseEntity({
    effective_canonical_key: 'seed-only-area',
    primary_name: '种子山体',
    primary_summit: '种子高点',
    gps: { raw: '34.45°N, 110.05°E', latitude: 34.45, longitude: 110.05, present: true },
  });
  const candidate = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'osm:node:seed-nearby', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '种子高点', latitude: 34.51, longitude: 110.05,
    osm_element: 'node/seed-nearby', osm_version: 1,
    osm_tags: { natural: 'peak', name: '种子高点', ele: '2154' }, dependency_family: 'osm', credibility: 'credible',
  });
  const classified = classifyEntityObservations(entity, [candidate]);
  assert.equal(classified[0].target_locality_status, 'unknown');
  assert.equal(classified[0].parent_anchor_status, 'unknown');
  assert.deepEqual(classified[0].trusted_parent_anchor_ids, []);
  assert.deepEqual(classified[0].diagnostic_parent_anchor_ids, ['seed:seed-only-area']);
  const review = buildReviewRecord(entity, [candidate], {
    minimum_sources_complete: true, any_source_available: true,
    source_outcomes: { osm: 'complete', wikidata: 'true_not_found', terrain: 'complete' },
  });
  assert.equal(review.coordinate_status, 'reference');
  assert.equal(review.publishability, 'quarantined');
  assert.equal(review.reviewed_target_coordinate, null);
  assert.ok(review.quarantine_reasons.includes('parent_anchor_unknown'));
});

test('a Nominatim-only product label remains diagnostic and cannot make an exact target matched', () => {
  const entity = baseEntity({
    effective_canonical_key: 'nominatim-only-area',
    primary_name: '地名山体',
    primary_summit: '地名高点',
    gps: { raw: null, latitude: null, longitude: null, present: false },
  });
  const nominatim = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'nominatim:place:1', source_id: 'osm', adapter: 'nominatim-search-v2',
    matched_name: '地名山体', match_kind: 'product-label', latitude: 34.45, longitude: 110.05,
    p31_ids: [], p31_closure_ids: [], osm_element: null, osm_tags: null,
  });
  const candidate = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'osm:node:nominatim-nearby', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '地名高点', latitude: 34.46, longitude: 110.05,
    osm_element: 'node/nominatim-nearby', osm_version: 1,
    osm_tags: { natural: 'peak', name: '地名高点', ele: '2154' }, dependency_family: 'osm', credibility: 'credible',
  });
  const classified = classifyEntityObservations(entity, [nominatim, candidate]);
  const exact = classified.find((row) => row.observation_id === candidate.observation_id);
  assert.equal(exact.target_locality_status, 'unknown');
  assert.deepEqual(exact.trusted_parent_anchor_ids, []);
  assert.deepEqual(exact.diagnostic_parent_anchor_ids, ['nominatim:place:1']);
});

test('a city or administrative product label cannot become a parent-anchor consensus candidate', () => {
  const entity = baseEntity({
    effective_canonical_key: 'city-label-area',
    primary_name: '同名山体',
    primary_summit: '同名高点',
    gps: { raw: null, latitude: null, longitude: null, present: false },
  });
  const city = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'wikidata:Q-city:claim', matched_name: '同名山体', match_kind: 'product-label',
    latitude: 34.45, longitude: 110.05, p31_ids: ['Q515'], p31_closure_ids: ['Q515'],
    source_metadata: { qid: 'Q-city' },
  });
  const candidate = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'osm:node:city-nearby', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '同名高点', latitude: 34.46, longitude: 110.05,
    osm_element: 'node/city-nearby', osm_version: 1,
    osm_tags: { natural: 'peak', name: '同名高点', ele: '2154' }, dependency_family: 'osm', credibility: 'credible',
  });
  const classified = classifyEntityObservations(entity, [city, candidate]);
  const exact = classified.find((row) => row.observation_id === candidate.observation_id);
  assert.equal(exact.parent_anchor_status, 'unknown');
  assert.deepEqual(exact.trusted_parent_anchor_ids, []);
  assert.deepEqual(exact.diagnostic_parent_anchor_ids, ['wikidata:Q-city:claim']);
});

test('a two-family natural mountain parent consensus excludes a remote representative highpoint', () => {
  const entity = baseEntity({
    effective_canonical_key: 'trusted-area',
    primary_name: '可信山体',
    primary_summit: '可信高点',
    gps: { raw: '34.45°N, 110.05°E', latitude: 34.45, longitude: 110.05, present: true },
  });
  const osmParent = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'osm:node:trusted-parent', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '可信山体', latitude: 34.4505, longitude: 110.0505,
    osm_element: 'node/trusted-parent', osm_version: 1,
    osm_tags: { natural: 'peak', name: '可信山体' }, dependency_family: 'osm', credibility: 'credible',
  });
  const parent = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'wikidata:Q-mountain:claim', matched_name: '可信山体', match_kind: 'product-label',
    latitude: 34.45, longitude: 110.05, p31_ids: ['Q8502'], p31_closure_ids: ['Q8502'],
    source_metadata: { qid: 'Q-mountain' },
  });
  const local = observation({
    effective_canonical_key: entity.effective_canonical_key,
    observation_id: 'osm:node:trusted-local', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '可信高点', latitude: 34.46, longitude: 110.05,
    osm_element: 'node/trusted-local', osm_version: 1,
    osm_tags: { natural: 'peak', name: '可信高点', ele: '2154' }, dependency_family: 'osm', credibility: 'credible',
  });
  const remote = { ...local, observation_id: 'osm:node:trusted-remote', latitude: 35.5, longitude: 111.05 };
  const classified = classifyEntityObservations(entity, [parent, osmParent, local, remote]);
  const localExact = classified.find((row) => row.observation_id === local.observation_id);
  const remoteExact = classified.find((row) => row.observation_id === remote.observation_id);
  assert.equal(localExact.parent_anchor_status, 'consensus');
  assert.deepEqual(localExact.parent_anchor_ids, ['osm:node:trusted-parent', 'wikidata:Q-mountain:claim']);
  assert.equal(localExact.target_locality_status, 'matched');
  assert.equal(remoteExact.coordinate_role, 'wrong_entity');
  assert.equal(remoteExact.target_locality_status, 'outside_parent_area');
});

test('two eligible parent anchors outside the radius become an entity-level conflict', () => {
  const entity = baseEntity({
    effective_canonical_key: 'two-anchor-conflict', primary_name: '同省山体', primary_summit: '同省高点',
    gps: { raw: null, latitude: null, longitude: null, present: false },
  });
  const osmParent = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:conflict-parent',
    source_id: 'osm', adapter: 'osm-overpass-v2', matched_name: '同省山体', latitude: 34.45, longitude: 110.05,
    osm_element: 'node/conflict-parent', osm_tags: { natural: 'peak', name: '同省山体' }, dependency_family: 'osm',
  });
  const wikidataParent = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'wikidata:Q-conflict:claim',
    matched_name: '同省山体', latitude: 34.85, longitude: 110.05, p31_ids: ['Q8502'], p31_closure_ids: ['Q8502'],
    source_metadata: { qid: 'Q-conflict' }, dependency_family: 'wikidata',
  });
  const target = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:conflict-target', source_id: 'osm',
    adapter: 'osm-overpass-v2', matched_name: '同省高点', latitude: 34.46, longitude: 110.05,
    osm_element: 'node/conflict-target', osm_tags: { natural: 'peak', name: '同省高点', ele: '2154' }, dependency_family: 'osm',
  });
  const classified = classifyEntityObservations(entity, [osmParent, wikidataParent, target]);
  const exact = classified.find((row) => row.observation_id === target.observation_id);
  assert.equal(exact.anchor_candidate_classification, 'not_candidate');
  assert.equal(exact.parent_anchor_status, 'conflict');
  assert.equal(exact.target_locality_status, 'unknown');
  const review = buildReviewRecord(entity, [osmParent, wikidataParent, target], {
    minimum_sources_complete: true, any_source_available: true,
    source_outcomes: { osm: 'complete', wikidata: 'complete', terrain: 'complete' },
  });
  assert.equal(review.publishability, 'quarantined');
  assert.equal(review.reviewed_target_coordinate, null);
  assert.ok(review.quarantine_reasons.includes('parent_anchor_conflict'));
});

test('a unique local two-family parent cluster wins while a remote candidate becomes an outlier', () => {
  const entity = baseEntity({
    effective_canonical_key: 'parent-consensus', primary_name: '共识山体', primary_summit: '共识高点',
    gps: { raw: null, latitude: null, longitude: null, present: false },
  });
  const localOsm = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:local-parent', source_id: 'osm',
    adapter: 'osm-overpass-v2', matched_name: '共识山体', latitude: 34.45, longitude: 110.05,
    osm_element: 'node/local-parent', osm_tags: { natural: 'peak', name: '共识山体' }, dependency_family: 'osm',
  });
  const localWikidata = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'wikidata:Q-local:claim',
    matched_name: '共识山体', latitude: 34.451, longitude: 110.051, p31_ids: ['Q8502'], p31_closure_ids: ['Q8502'],
    source_metadata: { qid: 'Q-local' }, dependency_family: 'wikidata',
  });
  const remoteWikidata = observation({
    ...localWikidata, observation_id: 'wikidata:Q-remote:claim', latitude: 35.4, longitude: 111.05,
    source_metadata: { qid: 'Q-remote' },
  });
  const target = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:local-target', source_id: 'osm',
    adapter: 'osm-overpass-v2', matched_name: '共识高点', latitude: 34.455, longitude: 110.055,
    osm_element: 'node/local-target', osm_tags: { natural: 'peak', name: '共识高点', ele: '2154' }, dependency_family: 'osm',
  });
  const classified = classifyEntityObservations(entity, [localOsm, localWikidata, remoteWikidata, target]);
  const exact = classified.find((row) => row.observation_id === target.observation_id);
  const remote = classified.find((row) => row.observation_id === remoteWikidata.observation_id);
  assert.equal(exact.parent_anchor_status, 'consensus');
  assert.equal(exact.target_locality_status, 'matched');
  assert.deepEqual(exact.parent_anchor_ids, ['osm:node:local-parent', 'wikidata:Q-local:claim']);
  assert.equal(remote.parent_anchor_outlier, true);
});

test('a single source-family parent anchor remains single_source and cannot publish a representative highpoint', () => {
  const entity = baseEntity({
    effective_canonical_key: 'single-anchor', primary_name: '单源山体', primary_summit: '单源高点',
    gps: { raw: null, latitude: null, longitude: null, present: false },
  });
  const parent = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:single-parent', source_id: 'osm',
    adapter: 'osm-overpass-v2', matched_name: '单源山体', latitude: 34.45, longitude: 110.05,
    osm_element: 'node/single-parent', osm_tags: { natural: 'peak', name: '单源山体' }, dependency_family: 'osm',
  });
  const target = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:single-target', source_id: 'osm',
    adapter: 'osm-overpass-v2', matched_name: '单源高点', latitude: 34.46, longitude: 110.05,
    osm_element: 'node/single-target', osm_tags: { natural: 'peak', name: '单源高点', ele: '2154' }, dependency_family: 'osm',
  });
  const review = buildReviewRecord(entity, [parent, target], {
    minimum_sources_complete: true, any_source_available: true,
    source_outcomes: { osm: 'complete', wikidata: 'complete', terrain: 'complete' },
  });
  assert.equal(review.parent_anchor_status, 'single_source');
  assert.equal(review.publishability, 'quarantined');
  assert.equal(review.reviewed_target_coordinate, null);
});

test('a single parent anchor can reject only a remote duplicate supported by two local target families', () => {
  const entity = baseEntity({
    effective_canonical_key: 'duplicate-peak', primary_name: '黄山', primary_summit: '莲花峰',
    gps: { raw: null, latitude: null, longitude: null, present: false },
  });
  const parent = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'wikidata:Q-huangshan:parent',
    matched_name: '黄山', match_kind: 'product-label', latitude: 30.125, longitude: 118.166,
    p31_ids: ['Q46831'], p31_closure_ids: ['Q46831'], source_metadata: { qid: 'Q-huangshan' },
  });
  const localOsm = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'osm:node:lotus-local', source_id: 'osm',
    adapter: 'osm-overpass-v2', matched_name: '莲花峰', latitude: 30.127, longitude: 118.165,
    osm_element: 'node/lotus-local', osm_tags: { natural: 'peak', name: '莲花峰', ele: '1864' }, dependency_family: 'osm', credibility: 'credible',
  });
  const localWikidata = observation({
    effective_canonical_key: entity.effective_canonical_key, observation_id: 'wikidata:Q-lotus:local',
    matched_name: '莲花峰', latitude: 30.14, longitude: 118.169, source_metadata: { qid: 'Q-lotus' },
  });
  const remote = { ...localOsm, observation_id: 'osm:node:lotus-remote', latitude: 30.201, longitude: 118.806 };
  const classified = classifyEntityObservations(entity, [parent, localOsm, localWikidata, remote]);
  const remoteResult = classified.find((row) => row.observation_id === remote.observation_id);
  const localResult = classified.find((row) => row.observation_id === localOsm.observation_id);
  assert.equal(localResult.parent_anchor_status, 'single_source');
  assert.equal(localResult.target_locality_status, 'unknown');
  assert.equal(remoteResult.coordinate_role, 'wrong_entity');
  assert.equal(remoteResult.identity_eligible, false);
  assert.equal(remoteResult.target_locality_status, 'unknown');
});

test('OSM-derived observations do not create a second parent-anchor vote', () => {
  const anchors = buildParentAnchorConsensus([
    { id: 'osm:node:1', latitude: 34.45, longitude: 110.05, dependency_family: 'osm', classification: 'candidate' },
    { id: 'wikidata:Q1:claim', latitude: 34.451, longitude: 110.051, dependency_family: 'osm', classification: 'candidate' },
  ], 25_000);
  assert.equal(anchors.status, 'single_source');
  assert.equal(anchors.clusters[0].independent_source_family_count, 1);
  assert.equal(anchors.dependency_duplicate_vote_count, 0);
});

test('parent-anchor clustering preserves both maximal bridge cliques and rejects a tie', () => {
  const anchors = buildParentAnchorConsensus([
    { id: 'A', latitude: 34.45, longitude: 110.05, dependency_family: 'osm', classification: 'candidate' },
    { id: 'B', latitude: 34.63, longitude: 110.05, dependency_family: 'wikidata', classification: 'candidate' },
    { id: 'C', latitude: 34.81, longitude: 110.05, dependency_family: 'official', classification: 'candidate' },
  ], 25_000);
  assert.deepEqual(anchors.maximal_clusters.map((cluster) => cluster.observation_ids), [['A', 'B'], ['B', 'C']]);
  assert.equal(anchors.status, 'conflict');
  assert.equal(anchors.selected_cluster, null);
  assert.deepEqual(anchors.selected_anchor_ids, []);
  assert.equal(anchors.top_score_tie, true);
});

function coordinateClusterSets(result, anchors) {
  const coordinateById = new Map(anchors.map((anchor) => [anchor.id, `${anchor.latitude.toFixed(6)},${anchor.longitude.toFixed(6)}`]));
  return result.maximal_clusters.map((cluster) => cluster.observation_ids.map((id) => coordinateById.get(id)).sort().join('|')).sort();
}

test('parent-anchor overlap decisions are invariant to observation ID renaming and input order', () => {
  const original = [
    { id: 'A', latitude: 34.45, longitude: 110.05, dependency_family: 'osm', classification: 'candidate' },
    { id: 'B', latitude: 34.63, longitude: 110.05, dependency_family: 'wikidata', classification: 'candidate' },
    { id: 'C', latitude: 34.81, longitude: 110.05, dependency_family: 'official', classification: 'candidate' },
  ];
  const renamedAndReordered = [
    { ...original[2], id: 'A' },
    { ...original[0], id: 'C' },
    { ...original[1], id: 'B' },
  ];
  const first = buildParentAnchorConsensus(original, 25_000);
  const second = buildParentAnchorConsensus(renamedAndReordered, 25_000);
  assert.equal(first.status, 'conflict');
  assert.equal(second.status, 'conflict');
  assert.deepEqual(coordinateClusterSets(first, original), coordinateClusterSets(second, renamedAndReordered));
  for (const permutation of [original, [...original].reverse(), [original[1], original[2], original[0]]]) {
    const result = buildParentAnchorConsensus(permutation, 25_000);
    assert.equal(result.status, first.status);
    assert.deepEqual(coordinateClusterSets(result, permutation), coordinateClusterSets(first, original));
  }
});

test('a unique two-family local maximal clique wins while a remote single-family clique is an outlier', () => {
  const anchors = [
    { id: 'local-osm', latitude: 34.45, longitude: 110.05, dependency_family: 'osm', classification: 'candidate' },
    { id: 'local-wikidata', latitude: 34.451, longitude: 110.051, dependency_family: 'wikidata', classification: 'candidate' },
    { id: 'remote-osm', latitude: 35.4, longitude: 111.05, dependency_family: 'osm', classification: 'candidate' },
  ];
  const result = buildParentAnchorConsensus(anchors, 25_000);
  assert.equal(result.status, 'consensus');
  assert.deepEqual(result.selected_anchor_ids, ['local-osm', 'local-wikidata']);
  assert.deepEqual(result.outlier_ids, ['remote-osm']);
  assert.equal(result.top_score_tie, false);
});

test('two separate two-family maximal cliques remain a parent-anchor conflict', () => {
  const result = buildParentAnchorConsensus([
    { id: 'left-osm', latitude: 34.45, longitude: 110.05, dependency_family: 'osm', classification: 'candidate' },
    { id: 'left-wikidata', latitude: 34.451, longitude: 110.051, dependency_family: 'wikidata', classification: 'candidate' },
    { id: 'right-osm', latitude: 35.45, longitude: 111.05, dependency_family: 'osm', classification: 'candidate' },
    { id: 'right-wikidata', latitude: 35.451, longitude: 111.051, dependency_family: 'wikidata', classification: 'candidate' },
  ], 25_000);
  assert.equal(result.status, 'conflict');
  assert.equal(result.top_score_tie, true);
  assert.equal(result.selected_cluster, null);
  assert.deepEqual(result.selected_anchor_ids, []);
});

test('parent-anchor candidate safety cap fails rather than truncating a consensus graph', () => {
  const anchors = Array.from({ length: 25 }, (_, index) => ({
    id: `candidate:${index}`,
    latitude: 34.45 + index / 10_000,
    longitude: 110.05,
    dependency_family: index % 2 === 0 ? 'osm' : 'wikidata',
    classification: 'candidate',
  }));
  assert.throws(() => buildParentAnchorConsensus(anchors, 25_000), /candidate count exceeds 24/);
});

test('candidate review gate rejects a publishable seed-only representative highpoint', () => {
  const review = {
    ...buildReviewRecord(baseEntity(), [], { minimum_sources_complete: true, any_source_available: true }),
    coordinate_status: 'reference', publishability: 'publishable', coordinate_target_role: 'representative_highpoint',
    target_definition_status: 'defined', parent_anchor_status: 'unknown', trusted_parent_anchor_ids: [],
    diagnostic_parent_anchor_ids: ['seed:huashan'],
  };
  const summary = summarizeReviews(
    Array.from({ length: 359 }, (_, index) => ({ effective_canonical_key: `k${index}` })),
    [], [review], {
      collection_integrity: { review_closure: true, request_cas_complete: true, manifest_valid: true, offline_render_byte_identical: true },
      identity_gold: { cases: 1, false_accept_count: 0, false_reject_count: 0, role_mismatch_count: 0, anchor_trust_mismatch_count: 0 },
      semantic_readiness: { needs_review_count: 1 },
      parent_anchor_audit: { seed_only_publishable_count: 1, nominatim_only_publishable_count: 0, wrong_class_trusted_anchor_count: 0 },
    },
  );
  assert.equal(summary.candidate_review_decision, 'NO-GO');
  assert.ok(summary.decision_reasons.candidate_review.includes('seed_only_parent_anchor_publishable'));
});

test('identity adjudication gold is present and the pilot summary exposes dynamic gate decisions', async () => {
  const gold = JSON.parse(await readFile(join(ROOT, 'coordinate-review/identity-adjudication-gold.json'), 'utf8'));
  assert.equal(gold.schema_version, 3);
  assert.ok(Array.isArray(gold.cases));
  assert.ok(gold.cases.length >= 10);
  for (const row of gold.cases) {
    assert.equal(typeof row.effective_canonical_key, 'string');
    assert.ok(row.observation_id === null || typeof row.observation_id === 'string');
    assert.equal(typeof row.expected_identity_eligible, 'boolean');
    assert.equal(typeof row.expected_coordinate_role, 'string');
    assert.equal(typeof row.expected_parent_anchor_status, 'string');
    assert.equal(typeof (row.expected_anchor_candidate_classification ?? row.expected_parent_anchor_classification), 'string');
    assert.ok(row.expected_target_locality_status === null || typeof row.expected_target_locality_status === 'string');
    assert.equal(typeof row.expected_publishability, 'string');
  }
  assert.ok(Array.isArray(gold.synthetic_parent_anchor_cases));
  assert.ok(gold.synthetic_parent_anchor_cases.length >= 5);
  assert.ok(Array.isArray(gold.round2e_parent_anchor_contract_cases));
  assert.ok(gold.round2e_parent_anchor_contract_cases.length >= 4);
  const review = buildReviewRecord(baseEntity(), [], {
    minimum_sources_complete: true,
    any_source_available: true,
    source_outcomes: { osm: 'true_not_found', wikidata: 'complete' },
  });
  const summary = summarizeReviews(
    Array.from({ length: 359 }, (_, index) => ({ effective_canonical_key: `k${index}` })),
    [],
    [review],
  );
  assert.equal(typeof summary.collection_decision, 'string');
  assert.equal(typeof summary.candidate_review_decision, 'string');
  assert.equal(typeof summary.auto_publish_decision, 'string');
  assert.equal(typeof summary.full_359_target_run_decision, 'string');
  assert.equal(typeof summary.metrics.identity_gold_cases, 'number');
});

test('decision gates are calculated from their inputs and can all become GO in a complete fixture', () => {
  const parent = observation({
    observation_id: 'wikidata:Q-huashan-parent:claim', matched_name: '华山', match_kind: 'product-label',
    p31_ids: ['Q8502'], p31_closure_ids: ['Q8502'], source_metadata: { qid: 'Q-huashan-parent' },
  });
  const osmParent = observation({
    observation_id: 'osm:node:huashan-parent', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '华山', osm_element: 'node/huashan-parent', osm_version: 1,
    osm_tags: { natural: 'peak', name: '华山' }, dependency_family: 'osm', credibility: 'credible',
    latitude: 34.4833, longitude: 110.0833,
  });
  const official = observation({ dependency_family: 'official', credibility: 'credible' });
  const osm = observation({
    observation_id: 'osm:node:1', source_id: 'osm', adapter: 'osm-overpass-v2',
    matched_name: '南峰', osm_element: 'node/1', osm_version: 2,
    osm_tags: { natural: 'peak', name: '南峰', ele: '2154' },
    dependency_family: 'osm', credibility: 'credible', latitude: 34.47772, longitude: 110.07802,
  });
  const review = buildReviewRecord(baseEntity(), [parent, osmParent, official, osm], {
    minimum_sources_complete: true,
    any_source_available: true,
    source_outcomes: { osm: 'complete', wikidata: 'complete', terrain: 'complete' },
  });
  const summary = summarizeReviews(
    Array.from({ length: 359 }, (_, index) => ({ effective_canonical_key: `k${index}` })),
    [parent, osmParent, official, osm],
    [review],
    {
      collection_integrity: { review_closure: true, request_cas_complete: true, manifest_valid: true, offline_render_byte_identical: true },
      identity_gold: { cases: 1, false_accept_count: 0, false_reject_count: 0, role_mismatch_count: 0, anchor_trust_mismatch_count: 0, locality_mismatch_count: 0, publishability_mismatch_count: 0 },
      semantic_readiness: { needs_review_count: 0 },
      parent_anchor_audit: { seed_only_publishable_count: 0, nominatim_only_publishable_count: 0, wrong_class_trusted_anchor_count: 0 },
      auto_publish_thresholds: { verified_minimum: 1, double_cluster_rate_minimum: 0, manual_gold_evaluable: true },
      manual_accuracy_gold: { status: 'evaluable', false_verified_count: 0 },
    },
  );
  assert.equal(summary.collection_decision, 'GO');
  assert.equal(summary.candidate_review_decision, 'GO');
  assert.equal(summary.auto_publish_decision, 'GO');
  assert.equal(summary.full_359_target_run_decision, 'GO');
});

test('fails duplicate parent-anchor candidate observation IDs before building a consensus graph', () => {
  const duplicate = {
    id: 'osm:node:duplicate',
    latitude: 34.4777,
    longitude: 110.078,
    dependency_family: 'osm',
    classification: 'candidate',
  };
  assert.throws(
    () => buildParentAnchorConsensus([duplicate, { ...duplicate, dependency_family: 'wikidata' }], 25_000),
    /duplicate parent-anchor candidate observation id: osm:node:duplicate/,
  );
});

test('derives duplicate-vote consistency from folded cluster family votes', () => {
  const result = buildParentAnchorConsensus([
    {
      id: 'osm:node:one', latitude: 34.4777, longitude: 110.078,
      dependency_family: 'osm', classification: 'candidate',
    },
    {
      id: 'osm:node:two', latitude: 34.4778, longitude: 110.0781,
      dependency_family: 'osm', classification: 'candidate',
    },
    {
      id: 'wikidata:Q1:claim', latitude: 34.47775, longitude: 110.07805,
      dependency_family: 'wikidata', classification: 'candidate',
    },
  ], 25_000);
  assert.deepEqual(result.dependency_vote_audit, {
    checked_cluster_count: 1,
    consistency_violation_count: 0,
    declared_family_vote_count: 2,
    duplicate_observation_count: 1,
    unique_family_count: 2,
  });
  assert.equal(result.dependency_duplicate_vote_count, 0);
});

test('reports a malformed same-family cluster as a dynamic duplicate-vote violation', () => {
  const audit = buildParentAnchorAudit([baseEntity()], [], [{
    effective_canonical_key: 'huashan',
    primary_name: '华山',
    target_name: '南峰',
    coordinate_target_role: 'representative_highpoint',
    coordinate_status: 'missing',
    publishability: 'blocked',
    parent_anchor_status: 'single_source',
    parent_anchor_ids: ['osm:a', 'osm:b'],
    selected_parent_anchor_ids: [],
    diagnostic_parent_anchor_ids: [],
    parent_anchor_reasons: [],
    parent_anchor_radius_m: 25_000,
    parent_anchor_pairwise_distances_m: [],
    parent_anchor_clusters: [{
      cluster_id: 'parent-cluster:malformed',
      observation_ids: ['osm:a', 'osm:b'],
      dependency_families: ['osm'],
      family_votes: [
        { dependency_family: 'osm', observation_id: 'osm:a', duplicate_observation_ids: [] },
        { dependency_family: 'osm', observation_id: 'osm:b', duplicate_observation_ids: [] },
      ],
      independent_source_family_count: 1,
      max_pairwise_distance_m: 1,
      pairwise_distances_m: [],
    }],
    parent_anchor_maximal_clusters: [{
      cluster_id: 'parent-cluster:malformed',
      observation_ids: ['osm:a', 'osm:b'],
      dependency_families: ['osm'],
      family_votes: [
        { dependency_family: 'osm', observation_id: 'osm:a', duplicate_observation_ids: [] },
        { dependency_family: 'osm', observation_id: 'osm:b', duplicate_observation_ids: [] },
      ],
      independent_source_family_count: 1,
      max_pairwise_distance_m: 1,
      pairwise_distances_m: [],
    }],
    parent_anchor_overlapping_cluster_relationships: [],
    parent_anchor_top_score: 1,
    parent_anchor_top_score_tie: false,
    parent_anchor_top_score_cluster_ids: ['parent-cluster:malformed'],
    parent_anchor_outlier_ids: [],
    target_locality_status: 'unknown',
  }]);
  assert.equal(audit.dependency_duplicate_vote_count, 1);
});
