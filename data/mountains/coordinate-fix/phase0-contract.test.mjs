import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { writeArrayBuffer } from 'geotiff';
import {
  deriveCopDemWindow,
  deriveWorldCoverSurfaceContext,
} from './cop-dem-glo30-adapter.mjs';
import {
  analyzePseudoPrecision,
  bestIndependentSourcePairDistanceMeters,
  canonicalArtifactBytes,
  computeMechanicalSanityGates,
  coordinatePrecisionFromLiterals,
  deriveSourceAdapterOutput,
  computeStratifiedSampleBinding,
  mechanicalEvidenceSha256,
  normalizedRequestHash,
  validateEffectiveQueryTarget,
  validateSourceRequestManifest,
  validateSourceRequestEntry,
  validateSummitTargetProposal,
  validateT13CoordinateRecord,
} from './phase0-contract.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SOURCE_FEATURES = [
  {
    source_family: 'overpass',
    source_id: 'node:1',
    latitude: 30.1234,
    longitude: 110.5678,
    latitude_literal: '30.1234',
    longitude_literal: '110.5678',
    datum: 'WGS-84',
    elevation_m: 3230,
    source_names: [{ field: 'name:zh', value: 'Fixture Peak' }],
  },
  {
    source_family: 'nga-gns',
    source_id: 'ufi:2',
    latitude: 30.1235,
    longitude: 110.5679,
    latitude_literal: '30.1235',
    longitude_literal: '110.5679',
    datum: 'WGS-84',
    elevation_m: 3231,
    source_names: [{ field: 'full_name', value: 'Fixture Summit' }],
  },
];
const FIXTURE_CANDIDATE = { latitude: 30.1234, longitude: 110.5678 };
const FIXTURE_DEM_PIXEL_DEGREES = 1 / 3600;
const FIXTURE_DEM_WIDTH = 25;
const FIXTURE_DEM_VALUES = new Float32Array(FIXTURE_DEM_WIDTH ** 2).fill(3228);
FIXTURE_DEM_VALUES[(12 * FIXTURE_DEM_WIDTH) + 12] = 3232;
const FIXTURE_DEM_SOURCE_BYTES = Buffer.from(writeArrayBuffer(
  FIXTURE_DEM_VALUES,
  {
    width: FIXTURE_DEM_WIDTH,
    height: FIXTURE_DEM_WIDTH,
    ModelPixelScale: [
      FIXTURE_DEM_PIXEL_DEGREES,
      FIXTURE_DEM_PIXEL_DEGREES,
      0,
    ],
    ModelTiepoint: [
      0,
      0,
      0,
      FIXTURE_CANDIDATE.longitude - (12 * FIXTURE_DEM_PIXEL_DEGREES),
      FIXTURE_CANDIDATE.latitude + (12 * FIXTURE_DEM_PIXEL_DEGREES),
      0,
    ],
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: 2,
    GeographicTypeGeoKey: 4326,
    VerticalCSTypeGeoKey: 3855,
    SampleFormat: [3],
    BitsPerSample: [32],
    SamplesPerPixel: 1,
    PhotometricInterpretation: 1,
    GDAL_NODATA: '-32767',
  },
));
const FIXTURE_DEM_WINDOW = await deriveCopDemWindow(
  FIXTURE_DEM_SOURCE_BYTES,
  { candidate: FIXTURE_CANDIDATE, radius_m: 300 },
);
const FIXTURE_DEM_SAMPLES = FIXTURE_DEM_WINDOW.samples;
const FIXTURE_DEM_PARSED_BYTES = canonicalArtifactBytes(FIXTURE_DEM_WINDOW);

const FIXTURE_SURFACE_PIXEL_DEGREES = 1 / 10800;
const FIXTURE_SURFACE_WIDTH = 75;
const FIXTURE_SURFACE_SOURCE_BYTES = Buffer.from(writeArrayBuffer(
  new Uint8Array(FIXTURE_SURFACE_WIDTH ** 2).fill(60),
  {
    width: FIXTURE_SURFACE_WIDTH,
    height: FIXTURE_SURFACE_WIDTH,
    ModelPixelScale: [
      FIXTURE_SURFACE_PIXEL_DEGREES,
      FIXTURE_SURFACE_PIXEL_DEGREES,
      0,
    ],
    ModelTiepoint: [
      0,
      0,
      0,
      FIXTURE_CANDIDATE.longitude - (37 * FIXTURE_SURFACE_PIXEL_DEGREES),
      FIXTURE_CANDIDATE.latitude + (37 * FIXTURE_SURFACE_PIXEL_DEGREES),
      0,
    ],
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: 1,
    GeographicTypeGeoKey: 4326,
    SampleFormat: [1],
    BitsPerSample: [8],
    SamplesPerPixel: 1,
    PhotometricInterpretation: 1,
    GDAL_NODATA: '0',
  },
));
const FIXTURE_SURFACE_CONTEXT = await deriveWorldCoverSurfaceContext(
  FIXTURE_SURFACE_SOURCE_BYTES,
  {
    candidate: FIXTURE_CANDIDATE,
    radius_m: 300,
    ledger_altitude_m: 3234,
  },
);
const FIXTURE_SURFACE_PARSED_BYTES = canonicalArtifactBytes(
  FIXTURE_SURFACE_CONTEXT,
);

function sourceArtifact(feature) {
  const adapterVersion = `${feature.source_family}-v1`;
  const primarySourceName = feature.source_names[0];
  const responseBytes = feature.source_family === 'overpass'
    ? Buffer.from(
      `{"elements":[{"type":"node","id":1,"lat":${feature.latitude_literal},"lon":${feature.longitude_literal},"tags":{"natural":"peak",${JSON.stringify(primarySourceName.field)}:${JSON.stringify(primarySourceName.value)},"ele":"${feature.elevation_m}"}}]}`,
    )
    : Buffer.from(
      `{"features":[{"attributes":{"ufi":2,"full_name":${JSON.stringify(primarySourceName.value)},"all_names":"","desig_cd":"PK","lat_dd":${feature.latitude_literal},"long_dd":${feature.longitude_literal},"elevation_m":${feature.elevation_m}}}]}`,
    );
  const derivedOutput = deriveSourceAdapterOutput(adapterVersion, responseBytes);
  assert.deepEqual(derivedOutput.features, [feature]);
  const parsedOutputBytes = canonicalArtifactBytes(derivedOutput);
  const responseHash = createHash('sha256').update(responseBytes).digest('hex');
  const parsedOutputHash = createHash('sha256').update(parsedOutputBytes).digest('hex');
  const normalizedRequestParams = {
    endpoint: `https://fixture.invalid/${feature.source_family}`,
    source_id: feature.source_id,
  };
  return {
    manifestEntry: {
      request_id: `request:${feature.source_family}:${feature.source_id}`,
      effective_canonical_key: 'fixture-peak',
      source_family: feature.source_family,
      adapter_version: adapterVersion,
      normalized_request_params: normalizedRequestParams,
      request_hash: normalizedRequestHash(normalizedRequestParams),
      response_hash: responseHash,
      response_cas_path: `source-cache/sha256/${responseHash}`,
      parsed_output_hash: parsedOutputHash,
      parsed_output_cas_path: `source-cache/sha256/${parsedOutputHash}`,
      http_status: 200,
      fetched_at: '2026-07-26T00:00:00.000Z',
      cache_hit: false,
      source_license: {
        license_id: 'fixture-license',
        license_url: null,
        attribution_required: false,
      },
      outcome: 'complete',
      outcome_reason: null,
      rate_limit_signal: false,
    },
    responseBytes,
    parsedOutputBytes,
    adapter_version: adapterVersion,
  };
}

const FIXTURE_MECHANICAL_EVIDENCE = {
  schema_version: 't13-mechanical-evidence-v1',
  effective_canonical_key: 'fixture-peak',
  ledger: {
    primary_name: 'Fixture Peak',
    primary_summit: null,
    aliases: ['Fixture Summit'],
    altitude_m: 3234,
    province_bbox: {
      source_id: 'province-bbox-v1:fixture',
      min_latitude: 29,
      max_latitude: 31,
      min_longitude: 109,
      max_longitude: 112,
    },
    seed_coordinate: {
      latitude: 30.12,
      longitude: 110.56,
      datum: 'WGS-84',
    },
  },
  source_features: FIXTURE_SOURCE_FEATURES,
  dem: {
    dataset_id: 'COP-DEM_GLO-30-DGED',
    horizontal_datum: 'WGS-84',
    vertical_datum: 'EGM2008',
    resolution_m: 30,
    source_cas_sha256: createHash('sha256').update(FIXTURE_DEM_SOURCE_BYTES).digest('hex'),
    adapter_version: 'cop-dem-glo30-v1',
    samples_sha256: createHash('sha256').update(FIXTURE_DEM_PARSED_BYTES).digest('hex'),
    samples: FIXTURE_DEM_SAMPLES,
    surface_context: {
      adapter_version: 'esa-worldcover-2021-v1',
      source_cas_sha256: createHash('sha256')
        .update(FIXTURE_SURFACE_SOURCE_BYTES)
        .digest('hex'),
      parsed_sha256: createHash('sha256')
        .update(FIXTURE_SURFACE_PARSED_BYTES)
        .digest('hex'),
      derived: FIXTURE_SURFACE_CONTEXT,
    },
  },
};
const FIXTURE_EVIDENCE_CONTEXT = {
  mechanicalEvidence: FIXTURE_MECHANICAL_EVIDENCE,
  ledgerRecord: FIXTURE_MECHANICAL_EVIDENCE.ledger,
  catalogSourceFeature: FIXTURE_SOURCE_FEATURES[0],
  sourceArtifacts: Object.fromEntries(
    FIXTURE_SOURCE_FEATURES.map((feature) => [
      `${feature.source_family}:${feature.source_id}`,
      sourceArtifact(feature),
    ]),
  ),
  demArtifact: {
    sourceBytes: FIXTURE_DEM_SOURCE_BYTES,
    parsedSamplesBytes: FIXTURE_DEM_PARSED_BYTES,
    adapter_version: 'cop-dem-glo30-v1',
  },
  surfaceArtifact: {
    sourceBytes: FIXTURE_SURFACE_SOURCE_BYTES,
    parsedSurfaceBytes: FIXTURE_SURFACE_PARSED_BYTES,
    adapter_version: 'esa-worldcover-2021-v1',
  },
};

async function readJson(name) {
  return JSON.parse(await readFile(join(ROOT, name), 'utf8'));
}

async function readJsonl(name) {
  return (await readFile(join(ROOT, name), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sanity(status = 'passed') {
  return { status, details: {} };
}

function pendingProposal() {
  return {
    schema_version: 't13-summit-target-proposal-v1',
    proposal_id: 'proposal:fixture-peak:v1',
    effective_canonical_key: 'fixture-peak',
    proposal_status: 'pending_review',
    effective_sidecar_eligible: false,
    proposed_target_role: 'independent_summit',
    proposed_target_name: 'Fixture Peak',
    evidence: {
      peak_feature: {
        source_family: 'overpass',
        source_feature_id: 'node:1',
        natural: 'peak',
        datum: 'WGS-84',
        latitude: 30.1234,
        longitude: 110.5678,
      },
      name_match: {
        passed: true,
        match_type: 'exact_normalized',
        candidate_name: 'Fixture Peak',
        matched_ledger_name: 'Fixture Peak',
        source_name_fields: ['name:zh'],
      },
      elevation_match: {
        passed: true,
        ledger_altitude_m: 3234,
        source_altitude_m: 3230,
        delta_m: 4,
        tolerance_m: 250,
      },
      sanity_gates: computeMechanicalSanityGates(
        {
          latitude: 30.1234,
          longitude: 110.5678,
          datum: 'WGS-84',
        },
        FIXTURE_MECHANICAL_EVIDENCE,
        FIXTURE_EVIDENCE_CONTEXT,
      ),
      provenance_ids: ['overpass:node:1'],
    },
    review: {
      status: 'pending',
      review_artifact_id: null,
      reviewed_at: null,
    },
  };
}

async function approvedReview(proposal) {
  const contract = await import('./phase0-contract.mjs');
  return {
    schema_version: 't13-summit-target-review-v1',
    proposal_id: proposal.proposal_id,
    proposal_sha256: contract.proposalSha256(proposal),
    effective_canonical_key: proposal.effective_canonical_key,
    decision: 'approved',
    review_artifact_id: 'review:fixture-peak:v1',
    reviewed_at: '2026-07-26T00:00:00.000Z',
    reviewer_note: 'Fixture approval.',
    approved_override: {
      coordinate_target_role: 'independent_summit',
      target_name: 'Fixture Peak',
    },
  };
}

function resolvedRecord() {
  const record = {
    schema_version: 't13-coordinate-sidecar-v1',
    effective_canonical_key: 'fixture-peak',
    primary_name: 'Fixture Peak',
    catalog_coordinate: {
      latitude: 30.1234,
      longitude: 110.5678,
      latitude_literal: '30.1234',
      longitude_literal: '110.5678',
      datum: 'WGS-84',
      precision_decimals: 4,
      source_class: 'fixture',
      provenance_ids: ['fixture:catalog'],
      source_binding: {
        kind: 'provider_feature',
        source_family: 'overpass',
        source_id: 'node:1',
      },
      status: 'available',
      notes: [],
    },
    summit_coordinate: {
      status: 'resolved',
      supports_summit_verification: true,
      latitude: 30.1234,
      longitude: 110.5678,
      latitude_literal: '30.1234',
      longitude_literal: '110.5678',
      datum: 'WGS-84',
      precision_decimals: 4,
      target_role: 'independent_summit',
      query_target: {
        kind: 'existing_semantic_target',
        names: ['Fixture Peak'],
        semantic_source_id: 'entity-semantics:fixture-peak',
      },
      source_votes: [
        { source_family: 'overpass', source_lineage: 'osm', source_id: 'node:1', datum: 'WGS-84', latitude: 30.1234, longitude: 110.5678, latitude_literal: '30.1234', longitude_literal: '110.5678' },
        { source_family: 'nga-gns', source_lineage: 'gns', source_id: 'ufi:2', datum: 'WGS-84', latitude: 30.1235, longitude: 110.5679, latitude_literal: '30.1235', longitude_literal: '110.5679' },
      ],
      independent_source_count: 2,
      best_pair_distance_m: null,
      province_bbox_sanity: sanity(),
      elevation_sanity: sanity(),
      seed_displacement_sanity: sanity(),
      dem_local_maximum_sanity: sanity(),
      rejection_reasons: [],
      mechanical_evidence_sha256: null,
    },
  };
  record.summit_coordinate.best_pair_distance_m = bestIndependentSourcePairDistanceMeters(
    record.summit_coordinate.source_votes,
  );
  Object.assign(
    record.summit_coordinate,
    computeMechanicalSanityGates(
      record.summit_coordinate,
      FIXTURE_MECHANICAL_EVIDENCE,
      FIXTURE_EVIDENCE_CONTEXT,
    ),
  );
  record.summit_coordinate.mechanical_evidence_sha256 = mechanicalEvidenceSha256(
    FIXTURE_MECHANICAL_EVIDENCE,
  );
  return record;
}

function unresolvedRecord(targetRole = 'none') {
  const record = resolvedRecord();
  record.summit_coordinate = {
    status: 'unresolved',
    supports_summit_verification: false,
    latitude: null,
    longitude: null,
    latitude_literal: null,
    longitude_literal: null,
    datum: null,
    precision_decimals: null,
    target_role: targetRole,
    query_target: null,
    source_votes: [],
    independent_source_count: 0,
    best_pair_distance_m: null,
    province_bbox_sanity: sanity('not_run'),
    elevation_sanity: sanity('not_run'),
    seed_displacement_sanity: sanity('not_run'),
    dem_local_maximum_sanity: sanity('not_run'),
    rejection_reasons: ['fixture'],
    mechanical_evidence_sha256: null,
  };
  return record;
}

async function expectRejected(record, pattern) {
  await assert.rejects(
    validateT13CoordinateRecord(record, FIXTURE_EVIDENCE_CONTEXT),
    pattern,
  );
}

test('gold set separates the three denominators and defaults all legacy rows out of accuracy', async () => {
  const rows = await readJsonl('gold-set.jsonl');
  assert.equal(rows.length, 31);
  assert.equal(new Set(rows.map((row) => row.gold_case_id)).size, 31);

  const legacy = rows.filter((row) => row.gold_group === 'legacy_regression_18');
  const authority = rows.filter((row) => row.gold_group === 'authority_catalog_accuracy_13');
  const summit = authority.filter((row) => row.accuracy_memberships.summit_accuracy);

  assert.equal(legacy.length, 18);
  assert.equal(authority.length, 13);
  assert.equal(summit.length, 7);
  assert.deepEqual(
    summit.map((row) => row.effective_canonical_key),
    [
      'bogeda-feng',
      'broad-peak',
      'kawagebo',
      'kongur-jiubie-feng',
      'muztagata-feng',
      'namchabarwa',
      'qiaogeli-feng-k2',
    ],
  );
  assert.equal(legacy.every((row) => row.validation.accuracy_eligible === false), true);
  assert.equal(legacy.every((row) => row.accuracy_memberships.catalog_accuracy === false), true);
  assert.equal(
    legacy.every((row) => !/gold truth/i.test(row.verification_target.semantic_note)),
    true,
  );
});

test('legacy promotion remains case-by-case and promotes zero rows in Phase 0', async () => {
  const policy = await readJson('validation-policy.json');
  assert.equal(policy.legacy_promotion_policy.mode, 'case_by_case_only');
  assert.deepEqual(policy.legacy_promotion_policy.promoted_case_ids, []);
  assert.equal(policy.legacy_promotion_policy.promoted_count, 0);
  assert.deepEqual(
    policy.denominators.summit_accuracy_independent_summit_7.forbidden_aggregates_while_sample_size_is_single_digit,
    ['median', 'p95', 'max'],
  );
});

test('legacy grid evidence keeps strong, medium, and weak signals separate', async () => {
  const rows = await readJsonl('gold-set.jsonl');
  const counts = rows
    .filter((row) => row.gold_group === 'legacy_regression_18')
    .reduce((result, row) => {
      const strength = row.validation.pseudo_precision.signal_strength;
      result[strength] = (result[strength] || 0) + 1;
      return result;
    }, {});
  assert.deepEqual(counts, {
    strong_two_axis_arcminute: 6,
    medium_two_axis_arcsecond_or_mixed: 8,
    weak_single_axis: 4,
  });
});

test('pseudo-precision detector distinguishes two-axis, single-axis, and no-grid signals', () => {
  const strong = analyzePseudoPrecision(39.0333, 113.5667, 4);
  const weak = analyzePseudoPrecision(34.4869, 110.0877, 4);
  const none = analyzePseudoPrecision(34.48691, 110.08773, 5);
  assert.equal(strong.status, 'two_axis_grid_signal');
  assert.equal(strong.signal_strength, 'strong_two_axis_arcminute');
  assert.equal(weak.status, 'single_axis_grid_signal');
  assert.equal(weak.signal_strength, 'weak_single_axis');
  assert.equal(none.status, 'no_grid_signal');
  assert.equal(none.signal_strength, 'none');
});

test('coordinate precision is derived from original literals rather than a supplied label', () => {
  assert.equal(
    coordinatePrecisionFromLiterals(30.1234, 110.56789, '30.1234', '110.56789'),
    4,
  );
  assert.equal(
    coordinatePrecisionFromLiterals(30.1, 110.5, '30.1', '110.5'),
    1,
  );
  assert.throws(
    () => coordinatePrecisionFromLiterals(30.1, 110.5, '30.1001', '110.5000'),
    /numeric latitude exactly/,
  );
});

test('武夷山 semantic merge displacement is excluded from coordinate inaccuracy evidence', async () => {
  const policy = await readJson('validation-policy.json');
  const exclusion = policy.semantic_difference_exclusions.find((entry) => entry.gold_case_id === 'prod-legacy-wuyishan');
  assert.ok(exclusion);
  assert.match(exclusion.reason, /semantic/i);
  assert.doesNotMatch(exclusion.reason, /untrust|inaccurate/i);
});

test('existing frozen-ledger target validates through the pinned DEM and surface adapters', async () => {
  const record = resolvedRecord();
  assert.equal(
    validateEffectiveQueryTarget(
      record.summit_coordinate.query_target,
      FIXTURE_EVIDENCE_CONTEXT,
      record,
      record.summit_coordinate,
    ),
    true,
  );
  assert.equal(
    await validateT13CoordinateRecord(record, FIXTURE_EVIDENCE_CONTEXT),
    true,
  );
});

test('effective validation rejects tampered DEM and WorldCover artifacts', async () => {
  const demTampered = Buffer.from(FIXTURE_DEM_SOURCE_BYTES);
  demTampered[demTampered.length - 1] ^= 1;
  await assert.rejects(
    validateT13CoordinateRecord(resolvedRecord(), {
      ...FIXTURE_EVIDENCE_CONTEXT,
      demArtifact: {
        ...FIXTURE_EVIDENCE_CONTEXT.demArtifact,
        sourceBytes: demTampered,
      },
    }),
    /DEM source CAS SHA/i,
  );

  const surfaceTampered = Buffer.from(FIXTURE_SURFACE_SOURCE_BYTES);
  surfaceTampered[surfaceTampered.length - 1] ^= 1;
  await assert.rejects(
    validateT13CoordinateRecord(resolvedRecord(), {
      ...FIXTURE_EVIDENCE_CONTEXT,
      surfaceArtifact: {
        ...FIXTURE_EVIDENCE_CONTEXT.surfaceArtifact,
        sourceBytes: surfaceTampered,
      },
    }),
    /surface source CAS SHA/i,
  );

  const forgedSurfaceEvidence = structuredClone(FIXTURE_MECHANICAL_EVIDENCE);
  forgedSurfaceEvidence.dem.surface_context.derived.surface_regime =
    'low_elevation_tree_cover';
  const forgedRecord = resolvedRecord();
  forgedRecord.summit_coordinate.mechanical_evidence_sha256 =
    mechanicalEvidenceSha256(forgedSurfaceEvidence);
  await assert.rejects(
    validateT13CoordinateRecord(forgedRecord, {
      ...FIXTURE_EVIDENCE_CONTEXT,
      mechanicalEvidence: forgedSurfaceEvidence,
    }),
    /WorldCover evidence|surface context/i,
  );
});

test('resolved summit rejects null coordinates, false support, weak sources, low precision, and non-summit roles', async () => {
  const nullCoordinate = resolvedRecord();
  nullCoordinate.summit_coordinate.latitude = null;
  await expectRejected(nullCoordinate, /requires coordinates/);

  const falseSupport = resolvedRecord();
  falseSupport.summit_coordinate.supports_summit_verification = false;
  await expectRejected(falseSupport, /must support/);

  const weakSources = resolvedRecord();
  weakSources.summit_coordinate.independent_source_count = 0;
  await expectRejected(weakSources, /two independent sources/);

  const duplicateLineage = resolvedRecord();
  duplicateLineage.summit_coordinate.source_votes[1].source_lineage = 'osm';
  await expectRejected(duplicateLineage, /distinct source lineages/);

  const lowPrecision = resolvedRecord();
  lowPrecision.summit_coordinate.precision_decimals = 3;
  await expectRejected(lowPrecision, /precision_decimals/);

  const forgedCatalogPrecision = resolvedRecord();
  forgedCatalogPrecision.catalog_coordinate.latitude = 30.1;
  forgedCatalogPrecision.catalog_coordinate.longitude = 110.5;
  forgedCatalogPrecision.catalog_coordinate.latitude_literal = '30.1000';
  forgedCatalogPrecision.catalog_coordinate.longitude_literal = '110.5000';
  forgedCatalogPrecision.catalog_coordinate.precision_decimals = 4;
  await expectRejected(forgedCatalogPrecision, /adapter-derived provider feature/);

  const noneRole = resolvedRecord();
  noneRole.summit_coordinate.target_role = 'none';
  await expectRejected(noneRole, /explicit summit role/);
});

test('resolved summit recomputes independent-source distances instead of trusting the supplied label', async () => {
  const farApart = resolvedRecord();
  farApart.summit_coordinate.source_votes = [
    { source_family: 'overpass', source_lineage: 'osm', source_id: 'node:1', datum: 'WGS-84', latitude: 30.1234, longitude: 110.5678, latitude_literal: '30.1234', longitude_literal: '110.5678' },
    { source_family: 'wikidata', source_lineage: 'wikimedia', source_id: 'Q2', datum: 'WGS-84', latitude: 39.9042, longitude: 116.4074, latitude_literal: '39.9042', longitude_literal: '116.4074' },
  ];
  farApart.summit_coordinate.best_pair_distance_m = 15;
  await expectRejected(farApart, /150m|computed/i);

  const forgedBestPair = resolvedRecord();
  forgedBestPair.summit_coordinate.best_pair_distance_m = 1;
  await expectRejected(forgedBestPair, /computed best pair distance/i);

  const detachedAdoptedCoordinate = resolvedRecord();
  detachedAdoptedCoordinate.summit_coordinate.latitude = 31.1234;
  detachedAdoptedCoordinate.summit_coordinate.longitude = 111.5678;
  detachedAdoptedCoordinate.summit_coordinate.latitude_literal = '31.1234';
  detachedAdoptedCoordinate.summit_coordinate.longitude_literal = '111.5678';
  await expectRejected(detachedAdoptedCoordinate, /must equal one source vote/i);

  const adoptedOutlier = resolvedRecord();
  adoptedOutlier.summit_coordinate.source_votes.push({
    source_family: 'wikidata',
    source_lineage: 'wikimedia',
    source_id: 'Q-outlier',
    datum: 'WGS-84',
    latitude: 39.9042,
    longitude: 116.4074,
    latitude_literal: '39.9042',
    longitude_literal: '116.4074',
  });
  adoptedOutlier.summit_coordinate.independent_source_count = 3;
  adoptedOutlier.summit_coordinate.latitude = 39.9042;
  adoptedOutlier.summit_coordinate.longitude = 116.4074;
  adoptedOutlier.summit_coordinate.latitude_literal = '39.9042';
  adoptedOutlier.summit_coordinate.longitude_literal = '116.4074';
  await expectRejected(adoptedOutlier, /adopted summit.*150m/i);

  const oneLineage = resolvedRecord();
  oneLineage.summit_coordinate.source_votes[1].source_lineage = 'osm';
  oneLineage.summit_coordinate.independent_source_count = 1;
  await expectRejected(oneLineage, /two independent sources|distinct source lineages/);

  const forgedLineages = resolvedRecord();
  forgedLineages.summit_coordinate.source_votes = [
    { source_family: 'wikidata', source_lineage: 'wikidata', source_id: 'Q1', datum: 'WGS-84', latitude: 30.1234, longitude: 110.5678, latitude_literal: '30.1234', longitude_literal: '110.5678' },
    { source_family: 'wikipedia', source_lineage: 'wikipedia', source_id: 'zh:Fixture_Peak', datum: 'WGS-84', latitude: 30.1235, longitude: 110.5679, latitude_literal: '30.1235', longitude_literal: '110.5679' },
  ];
  forgedLineages.summit_coordinate.best_pair_distance_m = 15;
  await expectRejected(forgedLineages, /source lineage/i);
});

test('resolved summit requires mechanically recomputed raw evidence instead of a boolean callback', async () => {
  await assert.rejects(
    validateT13CoordinateRecord(resolvedRecord(), {
      catalogSourceFeature: FIXTURE_SOURCE_FEATURES[0],
      sourceArtifacts: FIXTURE_EVIDENCE_CONTEXT.sourceArtifacts,
    }),
    /mechanical evidence/i,
  );

  const missingDemGate = resolvedRecord();
  delete missingDemGate.summit_coordinate.dem_local_maximum_sanity;
  await expectRejected(missingDemGate, /dem_local_maximum_sanity/);

  const forgedLabels = resolvedRecord();
  const farEvidence = structuredClone(FIXTURE_MECHANICAL_EVIDENCE);
  farEvidence.dem.samples = [
    { latitude: 30.1234, longitude: 110.5678, elevation_m: 1000 },
    { latitude: 30.1255, longitude: 110.5678, elevation_m: 1232 },
  ];
  forgedLabels.summit_coordinate.mechanical_evidence_sha256 = mechanicalEvidenceSha256(farEvidence);
  await assert.rejects(
    validateT13CoordinateRecord(forgedLabels, {
      ...FIXTURE_EVIDENCE_CONTEXT,
      mechanicalEvidence: farEvidence,
    }),
    /DEM parsed samples|mechanically computed dem_local_maximum_sanity/i,
  );

  const paddedLiteralRecord = resolvedRecord();
  const paddedLiteralEvidence = structuredClone(FIXTURE_MECHANICAL_EVIDENCE);
  paddedLiteralRecord.summit_coordinate.latitude_literal = '30.123400';
  paddedLiteralRecord.summit_coordinate.precision_decimals = 4;
  paddedLiteralRecord.summit_coordinate.source_votes[0].latitude_literal = '30.123400';
  paddedLiteralEvidence.source_features[0].latitude_literal = '30.123400';
  paddedLiteralRecord.summit_coordinate.mechanical_evidence_sha256 = mechanicalEvidenceSha256(
    paddedLiteralEvidence,
  );
  await assert.rejects(
    validateT13CoordinateRecord(paddedLiteralRecord, {
      ...FIXTURE_EVIDENCE_CONTEXT,
      mechanicalEvidence: paddedLiteralEvidence,
    }),
    /parsed output must contain the mechanical feature/i,
  );
});

test('non-resolved statuses cannot support summit verification', async () => {
  for (const status of ['needs_review', 'unresolved', 'not_applicable']) {
    const record = unresolvedRecord();
    record.summit_coordinate.status = status;
    record.summit_coordinate.supports_summit_verification = true;
    await expectRejected(record, new RegExp(`${status} summit cannot support`));
  }
});

test('none and route_highpoint targets cannot carry summit coordinates', async () => {
  for (const role of ['none', 'route_highpoint']) {
    assert.equal(
      await validateT13CoordinateRecord(unresolvedRecord(role), FIXTURE_EVIDENCE_CONTEXT),
      true,
    );
    const record = unresolvedRecord(role);
    record.summit_coordinate.latitude = 30.1;
    await expectRejected(record, /cannot carry summit coordinates/);
  }
});

test('catalog precision is bound to adapter output or frozen ledger gps.raw', async () => {
  const providerRecord = unresolvedRecord();
  assert.equal(
    await validateT13CoordinateRecord(providerRecord, FIXTURE_EVIDENCE_CONTEXT),
    true,
  );

  const paddedProvider = unresolvedRecord();
  paddedProvider.catalog_coordinate.latitude = 30.1;
  paddedProvider.catalog_coordinate.longitude = 110.5;
  paddedProvider.catalog_coordinate.latitude_literal = '30.1000';
  paddedProvider.catalog_coordinate.longitude_literal = '110.5000';
  paddedProvider.catalog_coordinate.precision_decimals = 4;
  await expectRejected(paddedProvider, /adapter-derived provider feature/);

  const ledgerRecord = {
    effective_canonical_key: 'fixture-peak',
    gps: {
      raw: '30.1000°N, 110.5000°E',
      latitude: 30.1,
      longitude: 110.5,
      present: true,
    },
  };
  const ledgerBound = unresolvedRecord();
  ledgerBound.catalog_coordinate = {
    latitude: 30.1,
    longitude: 110.5,
    latitude_literal: '30.1000',
    longitude_literal: '110.5000',
    datum: 'WGS-84',
    precision_decimals: 4,
    source_class: 'seed_literal',
    provenance_ids: ['ledger:fixture-peak'],
    source_binding: {
      kind: 'frozen_ledger_gps_raw',
      ledger_record_sha256: createHash('sha256')
        .update(canonicalArtifactBytes(ledgerRecord))
        .digest('hex'),
    },
    status: 'coarse',
    notes: ['Precision describes expression only, not trust.'],
  };
  assert.equal(
    await validateT13CoordinateRecord(ledgerBound, { ledgerRecord }),
    true,
  );
  ledgerBound.catalog_coordinate.latitude_literal = '30.10000';
  ledgerBound.catalog_coordinate.precision_decimals = 5;
  await assert.rejects(
    validateT13CoordinateRecord(ledgerBound, { ledgerRecord }),
    /frozen ledger gps.raw/,
  );
});

test('unreviewed earned peak target cannot enter the effective sidecar', async () => {
  const schemaBytes = await readFile(join(ROOT, 't13-coordinate-sidecar.schema.json'), 'utf8');
  assert.doesNotMatch(schemaBytes, /earned_peak_target/);

  const record = resolvedRecord();
  record.summit_coordinate.query_target.kind = 'earned_peak_target';
  await expectRejected(record, /unreviewed earned peak proposals/);
});

test('collector output remains a pending proposal and is not effective', () => {
  const proposal = pendingProposal();
  assert.equal(validateSummitTargetProposal(proposal, FIXTURE_EVIDENCE_CONTEXT), true);

  proposal.effective_sidecar_eligible = true;
  assert.throws(
    () => validateSummitTargetProposal(proposal, FIXTURE_EVIDENCE_CONTEXT),
    /cannot be effective/,
  );

  const missingProvenance = structuredClone(proposal);
  missingProvenance.effective_sidecar_eligible = false;
  missingProvenance.evidence.provenance_ids = [];
  assert.throws(
    () => validateSummitTargetProposal(missingProvenance, FIXTURE_EVIDENCE_CONTEXT),
    /provenance ids/,
  );

  const incompleteNameEvidence = structuredClone(proposal);
  incompleteNameEvidence.effective_sidecar_eligible = false;
  delete incompleteNameEvidence.evidence.name_match.matched_ledger_name;
  assert.throws(
    () => validateSummitTargetProposal(incompleteNameEvidence, FIXTURE_EVIDENCE_CONTEXT),
    /matched ledger name/,
  );

  const incompleteElevationEvidence = structuredClone(proposal);
  incompleteElevationEvidence.effective_sidecar_eligible = false;
  delete incompleteElevationEvidence.evidence.elevation_match.tolerance_m;
  assert.throws(
    () => validateSummitTargetProposal(incompleteElevationEvidence, FIXTURE_EVIDENCE_CONTEXT),
    /complete elevation match evidence/,
  );

  const missingSanityDetails = structuredClone(proposal);
  missingSanityDetails.effective_sidecar_eligible = false;
  delete missingSanityDetails.evidence.sanity_gates.province_bbox_sanity.details;
  assert.throws(
    () => validateSummitTargetProposal(missingSanityDetails, FIXTURE_EVIDENCE_CONTEXT),
    /province_bbox_sanity details/,
  );

  const forgedElevationDelta = structuredClone(proposal);
  forgedElevationDelta.effective_sidecar_eligible = false;
  forgedElevationDelta.evidence.elevation_match.delta_m = 1;
  assert.throws(
    () => validateSummitTargetProposal(forgedElevationDelta, FIXTURE_EVIDENCE_CONTEXT),
    /computed elevation delta/i,
  );

  const forgedNameMatch = structuredClone(proposal);
  forgedNameMatch.effective_sidecar_eligible = false;
  forgedNameMatch.evidence.name_match.candidate_name = 'Different Peak';
  assert.throws(
    () => validateSummitTargetProposal(forgedNameMatch, FIXTURE_EVIDENCE_CONTEXT),
    /computed name match/i,
  );

  const selfReportedTolerance = pendingProposal();
  selfReportedTolerance.evidence.elevation_match.source_altitude_m = -8665;
  selfReportedTolerance.evidence.elevation_match.delta_m = 11899;
  selfReportedTolerance.evidence.elevation_match.tolerance_m = 10000;
  assert.throws(
    () => validateSummitTargetProposal(selfReportedTolerance, FIXTURE_EVIDENCE_CONTEXT),
    /policy tolerance|bound source feature/i,
  );

  const inventedAlias = pendingProposal();
  inventedAlias.evidence.name_match.candidate_name = 'Invented Alias';
  inventedAlias.evidence.name_match.matched_ledger_name = 'Invented Alias';
  inventedAlias.evidence.name_match.match_type = 'alias_normalized';
  assert.throws(
    () => validateSummitTargetProposal(inventedAlias, FIXTURE_EVIDENCE_CONTEXT),
    /target name|frozen ledger/i,
  );

  const spoofedLedgerAlias = pendingProposal();
  spoofedLedgerAlias.proposed_target_name = 'Fixture Summit';
  spoofedLedgerAlias.evidence.name_match.candidate_name = 'Fixture Summit';
  spoofedLedgerAlias.evidence.name_match.matched_ledger_name = 'Fixture Summit';
  spoofedLedgerAlias.evidence.name_match.match_type = 'alias_normalized';
  const differentRawNameEvidence = structuredClone(FIXTURE_MECHANICAL_EVIDENCE);
  differentRawNameEvidence.source_features[0].source_names = [
    { field: 'name:zh', value: 'Completely Different Peak' },
  ];
  const differentRawNameContext = {
    ...FIXTURE_EVIDENCE_CONTEXT,
    mechanicalEvidence: differentRawNameEvidence,
    sourceArtifacts: {
      ...FIXTURE_EVIDENCE_CONTEXT.sourceArtifacts,
      'overpass:node:1': sourceArtifact(differentRawNameEvidence.source_features[0]),
    },
  };
  assert.throws(
    () => validateSummitTargetProposal(spoofedLedgerAlias, differentRawNameContext),
    /pinned source adapter output/i,
  );
});

test('review approval is hash-bound to the exact canonical proposal before effective use', async () => {
  const contract = await import('./phase0-contract.mjs');
  assert.equal(typeof contract.proposalSha256, 'function');
  assert.equal(typeof contract.validateSummitTargetReviewBinding, 'function');

  const proposal = pendingProposal();
  const review = await approvedReview(proposal);
  assert.equal(
    contract.validateSummitTargetReviewBinding(
      proposal,
      review,
      FIXTURE_EVIDENCE_CONTEXT,
    ),
    true,
  );

  const forged = structuredClone(review);
  forged.proposal_sha256 = '0'.repeat(64);
  assert.throws(
    () => contract.validateSummitTargetReviewBinding(
      proposal,
      forged,
      FIXTURE_EVIDENCE_CONTEXT,
    ),
    /proposal SHA/i,
  );

  const effective = resolvedRecord();
  effective.summit_coordinate.query_target = {
    kind: 'reviewed_semantic_override',
    names: ['Fixture Peak'],
    semantic_source_id: 'entity-semantics-overrides:fixture-peak',
    review_status: 'approved',
    review_artifact_id: review.review_artifact_id,
    proposal_id: proposal.proposal_id,
    proposal_sha256: contract.proposalSha256(proposal),
  };
  await assert.rejects(
    validateT13CoordinateRecord(effective, FIXTURE_EVIDENCE_CONTEXT),
    /bound proposal and review/i,
  );
  const reviewedContext = {
      ...FIXTURE_EVIDENCE_CONTEXT,
      reviewBinding: { proposal, review },
  };
  assert.equal(
    validateEffectiveQueryTarget(
      effective.summit_coordinate.query_target,
      reviewedContext,
      effective,
      effective.summit_coordinate,
    ),
    true,
  );
  assert.equal(
    await validateT13CoordinateRecord(effective, reviewedContext),
    true,
  );

  const changedAfterApproval = structuredClone(proposal);
  changedAfterApproval.evidence.provenance_ids.push('manual:changed-after-approval');
  const changedEffective = structuredClone(effective);
  await assert.rejects(
    validateT13CoordinateRecord(changedEffective, {
      ...FIXTURE_EVIDENCE_CONTEXT,
      reviewBinding: { proposal: changedAfterApproval, review },
    }),
    /proposal SHA/i,
  );
});

test('network manifest entry is reproducible and distinguishes missing, rate-limited, and blocked', () => {
  const normalizedRequestParams = {
    endpoint: 'https://overpass-api.de/api/interpreter',
    method: 'POST',
    query: '[out:json];node[natural=peak];out;',
  };
  const responseBytes = Buffer.from('{"elements":[]}');
  const parsedOutputBytes = canonicalArtifactBytes(
    deriveSourceAdapterOutput('overpass-v1', responseBytes),
  );
  const responseHash = createHash('sha256').update(responseBytes).digest('hex');
  const parsedOutputHash = createHash('sha256').update(parsedOutputBytes).digest('hex');
  const evidence = {
    responseBytes,
    parsedOutputBytes,
    adapter_version: 'overpass-v1',
  };
  const base = {
    request_id: 'request:fixture:missing',
    effective_canonical_key: 'fixture-peak',
    source_family: 'overpass',
    adapter_version: 'overpass-v1',
    normalized_request_params: normalizedRequestParams,
    request_hash: normalizedRequestHash(normalizedRequestParams),
    response_hash: responseHash,
    response_cas_path: `source-cache/sha256/${responseHash}`,
    parsed_output_hash: parsedOutputHash,
    parsed_output_cas_path: `source-cache/sha256/${parsedOutputHash}`,
    http_status: 200,
    fetched_at: '2026-07-26T00:00:00.000Z',
    cache_hit: false,
    source_license: {
      license_id: 'ODbL-1.0',
      license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution_required: true,
    },
    outcome: 'missing',
    outcome_reason: 'parsed response contains no matching peak',
    rate_limit_signal: false,
  };
  assert.throws(
    () => validateSourceRequestEntry(base),
    /original response bytes/i,
  );
  assert.equal(validateSourceRequestEntry(base, evidence), true);

  const falseMissing = { ...base, http_status: 429 };
  assert.throws(
    () => validateSourceRequestEntry(falseMissing, evidence),
    /successful HTTP response/,
  );

  const rateLimited = {
    ...base,
    outcome: 'rate_limited',
    http_status: 429,
    outcome_reason: 'provider returned 429',
    parsed_output_hash: null,
    parsed_output_cas_path: null,
  };
  assert.equal(validateSourceRequestEntry(rateLimited, evidence), true);

  const blocked = {
    ...base,
    outcome: 'blocked',
    http_status: 403,
    outcome_reason: null,
    parsed_output_hash: null,
    parsed_output_cas_path: null,
  };
  assert.throws(
    () => validateSourceRequestEntry(blocked, evidence),
    /blocked requires a reason/,
  );

  assert.throws(
    () => validateSourceRequestEntry(base, {
      ...evidence,
      responseBytes: Buffer.from('forged bytes'),
    }),
    /response hash/i,
  );
  assert.throws(
    () => validateSourceRequestEntry(base, {
      ...evidence,
      parsedOutputBytes: Buffer.from('{"peak_features":[1]}'),
    }),
    /parsed output hash/i,
  );

  const contradictoryResponseBytes = Buffer.from(
    '{"elements":[{"type":"node","id":9,"lat":30.1,"lon":110.5,"tags":{"natural":"peak","name":"Fixture Peak","ele":"1234"}}]}',
  );
  const contradictoryParsedBytes = canonicalArtifactBytes({
    adapter_version: 'overpass-v1',
    features: [],
  });
  const contradictoryResponseHash = createHash('sha256')
    .update(contradictoryResponseBytes)
    .digest('hex');
  const contradictoryParsedHash = createHash('sha256')
    .update(contradictoryParsedBytes)
    .digest('hex');
  const contradictory = {
    ...base,
    response_hash: contradictoryResponseHash,
    response_cas_path: `source-cache/sha256/${contradictoryResponseHash}`,
    parsed_output_hash: contradictoryParsedHash,
    parsed_output_cas_path: `source-cache/sha256/${contradictoryParsedHash}`,
  };
  assert.throws(
    () => validateSourceRequestEntry(contradictory, {
      responseBytes: contradictoryResponseBytes,
      parsedOutputBytes: contradictoryParsedBytes,
      adapter_version: 'overpass-v1',
    }),
    /pinned adapter output|manifest outcome/i,
  );
});

test('source request manifests are bound to recomputed frozen sample artifacts', async () => {
  const bindingArtifacts = {
    sampleBytes: await readFile(join(ROOT, 'stratified-manual-audit-sample.jsonl')),
    sampleManifestBytes: await readFile(
      join(ROOT, 'stratified-manual-audit-sample.manifest.json'),
    ),
    canonicalsBytes: await readFile(
      join(ROOT, '..', 'ledger', 'effective_canonicals.jsonl'),
    ),
    enrichmentBytes: await readFile(
      join(ROOT, '..', 'ledger', 'effective-canonical-enrichment.jsonl'),
    ),
    policyBytes: await readFile(join(ROOT, 'validation-policy.json')),
  };
  const binding = computeStratifiedSampleBinding(bindingArtifacts);
  const requestEntry = (requestId) => {
    const normalizedRequestParams = {
      endpoint: 'https://overpass-api.de/api/interpreter',
      method: 'POST',
      query: `[out:json];node["name"="${requestId}"];out;`,
    };
    return {
      request_id: requestId,
      effective_canonical_key: 'fixture-peak',
      source_family: 'overpass',
      adapter_version: 'overpass-v1',
      normalized_request_params: normalizedRequestParams,
      request_hash: normalizedRequestHash(normalizedRequestParams),
      response_hash: null,
      response_cas_path: null,
      parsed_output_hash: null,
      parsed_output_cas_path: null,
      http_status: 429,
      fetched_at: '2026-07-26T00:00:00.000Z',
      cache_hit: false,
      source_license: {
        license_id: 'ODbL-1.0',
        license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
        attribution_required: true,
      },
      outcome: 'rate_limited',
      outcome_reason: 'fixture rate limit',
      rate_limit_signal: true,
    };
  };
  const requestManifest = (requestId) => ({
    schema_version: 't13-source-request-manifest-v1',
    ...binding,
    network_collection_contract: {
      overpass_endpoint: 'https://overpass-api.de/api/interpreter',
      user_agent: 'PeakTrekker-T13/1.0',
      timeout_ms: 30000,
      retry_limit: 3,
      backoff: 'exponential-jitter',
      checkpoint_resume: true,
      outcome_enum: [
        'complete',
        'missing',
        'blocked',
        'rate_limited',
        'transport_error',
        'invalid_response',
      ],
      source_independence_rule: 'Wikidata and Wikipedia count as one lineage',
      datum_policy: 'WGS-84 only',
    },
    requests: [requestEntry(requestId)],
  });
  const manifests = [
    requestManifest('request:fixture:one'),
    requestManifest('request:fixture:two'),
  ];

  for (const manifest of manifests) {
    assert.equal(
      await validateSourceRequestManifest(manifest, { bindingArtifacts }),
      true,
    );
  }

  for (const field of [
    'stratified_sample_sha256',
    'stratified_sample_manifest_sha256',
    'population_binding_sha256',
  ]) {
    const tampered = structuredClone(manifests[0]);
    tampered[field] = '0'.repeat(64);
    await assert.rejects(
      validateSourceRequestManifest(tampered, { bindingArtifacts }),
      new RegExp(field, 'i'),
    );
  }

  const tamperedSampleArtifacts = {
    ...bindingArtifacts,
    sampleBytes: Buffer.concat([
      bindingArtifacts.sampleBytes,
      Buffer.from('{"tampered":true}\n'),
    ]),
  };
  let acceptedAfterSampleTamper = 0;
  for (const manifest of manifests) {
    try {
      await validateSourceRequestManifest(manifest, {
        bindingArtifacts: tamperedSampleArtifacts,
      });
      acceptedAfterSampleTamper += 1;
    } catch {
      // Expected: changing the frozen sample invalidates every prior manifest.
    }
  }
  assert.equal(acceptedAfterSampleTamper, 0);
});

test('raster request manifests replay DEM and WorldCover adapters from cached bytes', async () => {
  const bindingArtifacts = {
    sampleBytes: await readFile(join(ROOT, 'stratified-manual-audit-sample.jsonl')),
    sampleManifestBytes: await readFile(
      join(ROOT, 'stratified-manual-audit-sample.manifest.json'),
    ),
    canonicalsBytes: await readFile(
      join(ROOT, '..', 'ledger', 'effective_canonicals.jsonl'),
    ),
    enrichmentBytes: await readFile(
      join(ROOT, '..', 'ledger', 'effective-canonical-enrichment.jsonl'),
    ),
    policyBytes: await readFile(join(ROOT, 'validation-policy.json')),
  };
  const binding = computeStratifiedSampleBinding(bindingArtifacts);
  const rasterEntry = ({
    requestId,
    sourceFamily,
    adapterVersion,
    responseBytes,
    parsedOutputBytes,
    ledgerAltitudeM,
  }) => {
    const normalizedRequestParams = {
      endpoint: `https://fixture.invalid/${sourceFamily}.tif`,
      method: 'GET',
      candidate_latitude: FIXTURE_CANDIDATE.latitude,
      candidate_longitude: FIXTURE_CANDIDATE.longitude,
      radius_m: 300,
      ...(ledgerAltitudeM === undefined
        ? {}
        : { ledger_altitude_m: ledgerAltitudeM }),
    };
    const responseHash = createHash('sha256').update(responseBytes).digest('hex');
    const parsedHash = createHash('sha256').update(parsedOutputBytes).digest('hex');
    return {
      request_id: requestId,
      effective_canonical_key: 'fixture-peak',
      source_family: sourceFamily,
      adapter_version: adapterVersion,
      normalized_request_params: normalizedRequestParams,
      request_hash: normalizedRequestHash(normalizedRequestParams),
      response_hash: responseHash,
      response_cas_path: `source-cache/sha256/${responseHash}`,
      parsed_output_hash: parsedHash,
      parsed_output_cas_path: `source-cache/sha256/${parsedHash}`,
      http_status: 200,
      fetched_at: '2026-07-26T00:00:00.000Z',
      cache_hit: false,
      source_license: {
        license_id: 'fixture-license',
        license_url: null,
        attribution_required: true,
      },
      outcome: 'complete',
      outcome_reason: null,
      rate_limit_signal: false,
    };
  };
  const demEntry = rasterEntry({
    requestId: 'raster:dem',
    sourceFamily: 'cop-dem-glo30',
    adapterVersion: 'cop-dem-glo30-v1',
    responseBytes: FIXTURE_DEM_SOURCE_BYTES,
    parsedOutputBytes: FIXTURE_DEM_PARSED_BYTES,
  });
  const surfaceEntry = rasterEntry({
    requestId: 'raster:surface',
    sourceFamily: 'esa-worldcover',
    adapterVersion: 'esa-worldcover-2021-v1',
    responseBytes: FIXTURE_SURFACE_SOURCE_BYTES,
    parsedOutputBytes: FIXTURE_SURFACE_PARSED_BYTES,
    ledgerAltitudeM: 3234,
  });
  const manifest = {
    schema_version: 't13-source-request-manifest-v1',
    ...binding,
    network_collection_contract: {
      overpass_endpoint: 'https://overpass-api.de/api/interpreter',
      user_agent: 'PeakTrekker-T13/1.0',
      timeout_ms: 30000,
      retry_limit: 3,
      backoff: 'exponential-jitter',
      checkpoint_resume: true,
      outcome_enum: [
        'complete',
        'missing',
        'blocked',
        'rate_limited',
        'transport_error',
        'invalid_response',
      ],
      source_independence_rule: 'Wikidata and Wikipedia count as one lineage',
      datum_policy: 'WGS-84 only',
    },
    requests: [demEntry, surfaceEntry],
  };
  assert.equal(
    await validateSourceRequestManifest(manifest, {
      bindingArtifacts,
      requestArtifacts: {
        'raster:dem': {
          responseBytes: FIXTURE_DEM_SOURCE_BYTES,
          parsedOutputBytes: FIXTURE_DEM_PARSED_BYTES,
          adapter_version: 'cop-dem-glo30-v1',
        },
        'raster:surface': {
          responseBytes: FIXTURE_SURFACE_SOURCE_BYTES,
          parsedOutputBytes: FIXTURE_SURFACE_PARSED_BYTES,
          adapter_version: 'esa-worldcover-2021-v1',
        },
      },
    }),
    true,
  );

  await assert.rejects(
    validateSourceRequestManifest(manifest, {
      bindingArtifacts,
      requestArtifacts: {
        'raster:dem': {
          responseBytes: FIXTURE_DEM_SOURCE_BYTES,
          parsedOutputBytes: Buffer.concat([
            FIXTURE_DEM_PARSED_BYTES,
            Buffer.from('\n'),
          ]),
          adapter_version: 'cop-dem-glo30-v1',
        },
      },
    }),
    /parsed output hash/i,
  );
});

test('cached response hash is recomputed from the original response bytes', async () => {
  const contract = await import('./phase0-contract.mjs');
  assert.equal(typeof contract.validateCachedResponseBytes, 'function');
  const responseBytes = Buffer.from('{"elements":[]}');
  const responseHash = createHash('sha256').update(responseBytes).digest('hex');
  const entry = {
    response_hash: responseHash,
    response_cas_path: `source-cache/sha256/${responseHash}`,
  };
  assert.equal(contract.validateCachedResponseBytes(entry, responseBytes), true);
  assert.throws(
    () => contract.validateCachedResponseBytes(entry, Buffer.from('{"elements":[1]}')),
    /response hash/i,
  );
});

test('gold SHA file matches the frozen bytes', async () => {
  const bytes = await readFile(join(ROOT, 'gold-set.jsonl'));
  const expected = `${createHash('sha256').update(bytes).digest('hex')}  gold-set.jsonl\n`;
  assert.equal(await readFile(join(ROOT, 'gold-set.sha256'), 'utf8'), expected);
});

test('legacy evidence snapshot and its read-only SQL are hash-bound by validation policy', async () => {
  const policy = await readJson('validation-policy.json');
  const evidence = policy.legacy_promotion_policy.evidence_definitions;
  for (const [fileField, shaField] of [
    ['query_file', 'query_sql_sha256'],
    ['observation_file', 'observation_sha256'],
  ]) {
    const bytes = await readFile(join(ROOT, evidence[fileField]));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence[shaField]);
  }
  assert.equal(evidence.fixture_exclusion_status, 'not proven; therefore the snapshot cannot promote a legacy row');

  const schemaSnapshot = evidence.schema_snapshot;
  const zeroWriteQuery = await readFile(join(ROOT, schemaSnapshot.query_file));
  assert.equal(
    createHash('sha256').update(zeroWriteQuery).digest('hex'),
    schemaSnapshot.query_sha256,
  );
  assert.equal(schemaSnapshot.fingerprint_algorithm, 'postgres_md5');
  assert.match(schemaSnapshot.fingerprint_input, /ordinal_position/);
});

test('schemas carry the mechanical interlocks and required audit fields', async () => {
  const sidecar = await readJson('t13-coordinate-sidecar.schema.json');
  const manifest = await readJson('source-request-manifest.schema.json');
  const proposal = await readJson('summit-target-proposal.schema.json');
  const review = await readJson('summit-target-review.schema.json');

  assert.equal(sidecar.allOf.length, 3);
  const reviewedTarget = sidecar.$defs.queryTarget.oneOf.find(
    (entry) => entry.properties?.kind?.const === 'reviewed_semantic_override',
  );
  assert.equal(reviewedTarget.required.includes('proposal_id'), true);
  assert.equal(reviewedTarget.required.includes('proposal_sha256'), true);
  assert.equal(proposal.properties.proposal_status.const, 'pending_review');
  assert.equal(proposal.properties.effective_sidecar_eligible.const, false);
  assert.deepEqual(review.properties.decision.enum, ['approved', 'rejected']);

  const requestRequired = manifest.properties.requests.items.required;
  for (const field of [
    'stratified_sample_sha256',
    'stratified_sample_manifest_sha256',
    'population_binding_sha256',
  ]) {
    assert.equal(manifest.required.includes(field), true, `manifest missing ${field}`);
    assert.equal(manifest.properties[field].pattern, '^[a-f0-9]{64}$');
  }
  for (const field of [
    'normalized_request_params',
    'adapter_version',
    'http_status',
    'response_cas_path',
    'parsed_output_hash',
    'parsed_output_cas_path',
    'fetched_at',
    'cache_hit',
    'source_license',
  ]) {
    assert.equal(requestRequired.includes(field), true, `manifest missing ${field}`);
  }
  assert.deepEqual(
    manifest.properties.network_collection_contract.properties.outcome_enum.const,
    ['complete', 'missing', 'blocked', 'rate_limited', 'transport_error', 'invalid_response'],
  );
});

test('validation policy makes DEM local-maximum and stratified manual audit the accuracy strategy', async () => {
  const policy = await readJson('validation-policy.json');
  assert.equal(policy.accuracy_strategy.catalog_authority_13.role, 'connectivity_smoke_only');
  assert.equal(policy.accuracy_strategy.summit_world_peak_7.role, 'connectivity_smoke_only');
  assert.equal(policy.accuracy_strategy.summit_world_peak_7.accuracy_denominator, false);
  assert.match(
    policy.accuracy_strategy.summit_world_peak_7.required_disclaimer,
    /不代表目录整体.*低海拔小山/,
  );
  assert.equal(policy.accuracy_strategy.dem_local_maximum.required_for_resolved, true);
  assert.equal(policy.accuracy_strategy.dem_local_maximum.radius_m > 0, true);
  assert.equal(policy.accuracy_strategy.dem_local_maximum.dataset.resolution_m <= 30, true);
  assert.equal(policy.accuracy_strategy.stratified_manual_audit.sample_size, 30);
  assert.equal(typeof policy.accuracy_strategy.stratified_manual_audit.seed, 'string');
  assert.deepEqual(
    policy.accuracy_strategy.stratified_manual_audit.strata,
    ['difficulty', 'altitude_band', 'province'],
  );
  assert.deepEqual(
    policy.accuracy_strategy.mechanical_sanity_gates.elevation_tolerance_bands,
    [
      { max_altitude_m: 999.9, tolerance_m: 100 },
      { max_altitude_m: 2999.9, tolerance_m: 150 },
      { max_altitude_m: 4999.9, tolerance_m: 250 },
      { max_altitude_m: null, tolerance_m: 400 },
    ],
  );
  assert.equal(
    policy.accuracy_strategy.mechanical_sanity_gates.seed_displacement.automatic_review_threshold_m,
    50000,
  );
});
