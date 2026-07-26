import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEMAS = [
  't13-coordinate-sidecar.schema.json',
  'summit-target-proposal.schema.json',
  'summit-target-review.schema.json',
  'source-request-manifest.schema.json',
  'mechanical-evidence.schema.json',
];

async function loadSchemas() {
  return Promise.all(SCHEMAS.map(async (name) => (
    JSON.parse(await readFile(join(ROOT, name), 'utf8'))
  )));
}

function resolvedFixture() {
  return {
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
      best_pair_distance_m: 14.702,
      province_bbox_sanity: { status: 'passed', details: {} },
      elevation_sanity: { status: 'passed', details: {} },
      seed_displacement_sanity: { status: 'passed', details: {} },
      dem_local_maximum_sanity: { status: 'passed', details: {} },
      mechanical_evidence_sha256: '1'.repeat(64),
      rejection_reasons: [],
    },
  };
}

test('all Phase 0 schemas strict-compile from repository dependencies', async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schemas = await loadSchemas();
  for (const schema of schemas) ajv.addSchema(schema);
  for (const schema of schemas) assert.equal(typeof ajv.getSchema(schema.$id), 'function');
});

test('sidecar schema rejects contradictory summit states', async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schemas = await loadSchemas();
  for (const schema of schemas) ajv.addSchema(schema);
  const validate = ajv.getSchema('peak-trekker.t13-coordinate-sidecar.schema.json');

  const valid = resolvedFixture();
  assert.equal(validate(valid), true, JSON.stringify(validate.errors));

  const contradictions = [
    ['resolved null coordinate', (record) => { record.summit_coordinate.latitude = null; }],
    ['resolved false support', (record) => { record.summit_coordinate.supports_summit_verification = false; }],
    ['resolved source count below two', (record) => { record.summit_coordinate.independent_source_count = 1; }],
    ['resolved none role', (record) => { record.summit_coordinate.target_role = 'none'; }],
    ['resolved pair distance over 150m', (record) => { record.summit_coordinate.best_pair_distance_m = 151; }],
    ['non-resolved true support', (record) => {
      record.summit_coordinate.status = 'needs_review';
      record.summit_coordinate.supports_summit_verification = true;
    }],
    ['route highpoint carries coordinates', (record) => {
      record.summit_coordinate.status = 'unresolved';
      record.summit_coordinate.supports_summit_verification = false;
      record.summit_coordinate.target_role = 'route_highpoint';
    }],
  ];
  for (const [label, contradict] of contradictions) {
    const record = structuredClone(valid);
    contradict(record);
    assert.equal(validate(record), false, `${label} unexpectedly passed`);
  }
});
