import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EVIDENCE_ADAPTER_VERSION,
  EVIDENCE_STATUS,
  FROZEN_INPUTS,
  assertScopeGate,
  buildOverpassQuery,
  buildEvidenceReview,
  cacheKey,
  createEvidenceContext,
  deriveSemanticQueryNames,
  escapeOverpassRegex,
  exactSemanticTargetName,
  familyVoteSummary,
  fetchCaptured,
  isGenericHighpointName,
  isRouteContextName,
  loadResumeCache,
  preflightLive,
  validateEvidenceManifest,
  verifyFrozenInputs,
  writeFailureAttempt,
} from './collect-entity-semantics-evidence.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

function entity(overrides = {}) {
  return {
    effective_canonical_key: 'demo-peak',
    primary_name: '示例峰',
    aliases: [],
    provinces: ['四川省'],
    entity_type: 'peak',
    classic_routes: [],
    mountain_routes: [],
    ...overrides,
  };
}

function proposal(overrides = {}) {
  return {
    effective_canonical_key: 'demo-peak',
    primary_name: '示例峰',
    proposal_status: 'proposal',
    proposed_catalog_entity_kind: 'independent_peak',
    proposed_coordinate_target_role: 'independent_summit',
    proposed_target_name: '示例峰',
    review_group: 'auto_ready',
    source_fields: { aliases: [], classic_routes: [], mountain_routes: [] },
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    effective_canonical_key: 'demo-peak',
    observation_id: 'wikidata:Q1',
    source_family: 'wikimedia',
    dependency_cluster_id: 'wikimedia:Q1',
    semantic_kind: 'independent_peak',
    semantic_target_name: '示例峰',
    supports_representative_highpoint: false,
    evidence_quality: 'reference',
    excluded_reason: null,
    source_id: 'wikidata',
    ...overrides,
  };
}

test('filters route context and generic highpoints from semantic query and exact-target names', () => {
  const subject = entity({
    primary_name: '玉珠峰',
    aliases: ['玉珠峰北坡', '玉珠峰南坡', '玉珠峰'],
    classic_routes: ['玉珠峰北坡线'],
  });
  assert.deepEqual(deriveSemanticQueryNames(subject), ['玉珠峰']);
  assert.equal(exactSemanticTargetName(proposal({ proposed_target_name: '玉珠峰北坡' })), null);
  assert.equal(exactSemanticTargetName(proposal({ proposed_target_name: '主峰' })), null);
  assert.equal(isRouteContextName('北坡大本营'), true);
  assert.equal(isGenericHighpointName('最高峰'), true);
});

test('uses a source-bound slope label only as query fallback, never as an exact target', () => {
  const subject = entity({
    primary_name: '珠穆朗玛峰北坡',
    aliases: [],
    source_fields: { aliases: [], classic_routes: ['珠峰北坡传统攀登路线'] },
  });
  assert.deepEqual(deriveSemanticQueryNames(subject), ['珠穆朗玛峰北坡']);
  assert.equal(exactSemanticTargetName(proposal({ proposed_target_name: '珠穆朗玛峰北坡' })), null);
});

test('requires two independent source families before emitting a two-family semantic consensus', () => {
  const result = buildEvidenceReview(entity(), proposal(), [
    observation({ observation_id: 'wikidata:Q1', source_family: 'wikimedia', dependency_cluster_id: 'wikimedia:Q1' }),
    observation({ observation_id: 'osm:node:1', source_family: 'osm', dependency_cluster_id: 'osm:node:1' }),
  ], { wikimedia: 'complete', osm: 'complete', official: 'not_attempted' });
  assert.equal(result.status, EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS);
  assert.equal(result.proposed_catalog_entity_kind, 'independent_peak');
  assert.equal(result.proposed_target_name, '示例峰');
  assert.equal(result.requires_product_review, true);
});

test('builds POSIX-compatible anchored Overpass name regexes without non-capturing groups', () => {
  const single = buildOverpassQuery(['阿尔金山主峰'], entity({ provinces: ['新疆维吾尔自治区'] }));
  const multiple = buildOverpassQuery(['K2', '乔戈里峰'], entity({ provinces: ['新疆维吾尔自治区'] }));
  const escaped = escapeOverpassRegex('峰(东).+?|');
  assert.match(single, /\^阿尔金山主峰\$/u);
  assert.match(multiple, /\^\(K2\|乔戈里峰\)\$/u);
  assert.equal(escaped, '峰\\(东\\)\\.\\+\\?\\|');
  assert.equal(single.includes('(?:'), false);
  assert.equal(multiple.includes('(?:'), false);
});

test('folds same-signature OSM-derived Wikidata evidence into one family vote', () => {
  const votes = familyVoteSummary([
    observation({ observation_id: 'osm:node:1', source_family: 'osm', dependency_cluster_id: 'osm:node:1' }),
    observation({ observation_id: 'wikidata:Q1', source_family: 'osm', dependency_cluster_id: 'osm:node:1' }),
  ]);
  assert.equal(votes.source_family_count, 1);
  assert.equal(votes.same_source_family_duplicate_vote_count, 0);
  assert.equal(votes.intra_family_conflict_count, 0);
  const result = buildEvidenceReview(entity(), proposal(), [
    observation({ observation_id: 'osm:node:1', source_family: 'osm', dependency_cluster_id: 'osm:node:1' }),
    observation({ observation_id: 'wikidata:Q1', source_family: 'osm', dependency_cluster_id: 'osm:node:1' }),
  ], { wikimedia: 'complete', osm: 'complete', official: 'not_attempted' });
  assert.equal(result.status, EVIDENCE_STATUS.SINGLE_FAMILY_REFERENCE);
  assert.equal(Object.keys(result.source_family_votes).length, 1);
  assert.deepEqual(result.source_family_votes.osm.observation_ids, ['osm:node:1', 'wikidata:Q1']);
});

test('quarantines all votes from a source family with conflicting semantic signatures', () => {
  const rows = [
    observation({ observation_id: 'wikidata:Q1', semantic_kind: 'independent_peak', semantic_target_name: '示例峰' }),
    observation({ observation_id: 'wikidata:Q2', semantic_kind: 'mountain_area', semantic_target_name: null }),
  ];
  const votes = familyVoteSummary(rows);
  assert.equal(votes.source_family_count, 0);
  assert.equal(votes.intra_family_conflict_count, 1);
  assert.deepEqual(votes.intra_family_conflict_families, ['wikimedia']);
  assert.equal(votes.intra_family_signature_options.wikimedia.family_status, 'intra_family_conflict');
  const result = buildEvidenceReview(entity(), proposal(), rows, { wikimedia: 'complete', osm: 'complete', official: 'not_attempted' });
  assert.equal(result.status, EVIDENCE_STATUS.CONFLICT);
  assert.equal(result.proposed_target_name, null);
});

test('does not let another family override an intra-family semantic conflict', () => {
  const rows = [
    observation({ observation_id: 'wikidata:Q1', semantic_kind: 'independent_peak', semantic_target_name: '示例峰' }),
    observation({ observation_id: 'wikidata:Q2', semantic_kind: 'mountain_area', semantic_target_name: null }),
    observation({ observation_id: 'osm:node:1', source_family: 'osm', dependency_cluster_id: 'osm:node:1', semantic_kind: 'independent_peak', semantic_target_name: '示例峰' }),
  ];
  const result = buildEvidenceReview(entity(), proposal(), rows, { wikimedia: 'complete', osm: 'complete', official: 'not_attempted' });
  assert.equal(result.status, EVIDENCE_STATUS.CONFLICT);
  assert.equal(result.source_family_count, 1);
  assert.equal(result.same_source_family_duplicate_vote_count, 0);
});

test('family conflict decisions are invariant under observation IDs and input order', () => {
  const original = [
    observation({ observation_id: 'wikidata:Q1', semantic_kind: 'independent_peak', semantic_target_name: '示例峰' }),
    observation({ observation_id: 'wikidata:Q2', semantic_kind: 'mountain_area', semantic_target_name: null }),
    observation({ observation_id: 'osm:node:1', source_family: 'osm', dependency_cluster_id: 'osm:node:1', semantic_kind: 'independent_peak', semantic_target_name: '示例峰' }),
  ];
  const renamedAndReordered = [
    { ...original[2], observation_id: 'osm:node:99' },
    { ...original[1], observation_id: 'wikidata:Q9' },
    { ...original[0], observation_id: 'wikidata:Q8' },
  ];
  const outcomes = { wikimedia: 'complete', osm: 'complete', official: 'not_attempted' };
  const left = buildEvidenceReview(entity(), proposal(), original, outcomes);
  const right = buildEvidenceReview(entity(), proposal(), renamedAndReordered, outcomes);
  assert.equal(left.status, EVIDENCE_STATUS.CONFLICT);
  assert.equal(right.status, EVIDENCE_STATUS.CONFLICT);
  assert.deepEqual(left.intra_family_conflict_families, right.intra_family_conflict_families);
  assert.equal(left.same_source_family_duplicate_vote_count, right.same_source_family_duplicate_vote_count);
});

test('the archived failed Pilot exposes all five intra-family conflicts for the repaired report', async () => {
  const archived = join(ROOT, 'entity-semantics-evidence/attempts/round3b-overpass-posix-regex-failure/observations.jsonl');
  const rows = (await readFile(archived, 'utf8')).trim().split('\n').map(JSON.parse);
  const expectedKeys = [
    'baishi-shan',
    'bamian-shan',
    'fenghuang-shan-guangdong',
    'fenghuang-shan-heilongjiang',
    'fenghuang-shan-liaoning',
  ];
  for (const key of expectedKeys) {
    const votes = familyVoteSummary(rows.filter((row) => row.effective_canonical_key === key));
    assert.equal(votes.intra_family_conflict_count, 1, key);
    assert.deepEqual(votes.intra_family_conflict_families, ['wikimedia'], key);
  }
});

test('generic highpoints and seed-consistent proposals cannot become automatic exact semantic targets', () => {
  const generic = buildEvidenceReview(entity(), proposal({
    proposed_catalog_entity_kind: 'mountain_area',
    proposed_coordinate_target_role: 'representative_highpoint',
    proposed_target_name: '主峰',
  }), [
    observation({ semantic_kind: 'mountain_area', semantic_target_name: '主峰', supports_representative_highpoint: true }),
    observation({ observation_id: 'osm:way:1', source_family: 'osm', dependency_cluster_id: 'osm:way:1', semantic_kind: 'mountain_area', semantic_target_name: '主峰', supports_representative_highpoint: true }),
  ], { wikimedia: 'complete', osm: 'complete', official: 'not_attempted' });
  assert.equal(generic.proposed_target_name, null);
  assert.notEqual(generic.status, EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS);

  const seedOnly = buildEvidenceReview(entity(), proposal(), [], { wikimedia: 'complete', osm: 'complete', official: 'not_attempted' });
  assert.equal(seedOnly.status, EVIDENCE_STATUS.MISSING);
  assert.equal(seedOnly.seed_consistent_only, true);
});

test('source transport failures are blocked, not missing', () => {
  const result = buildEvidenceReview(entity(), proposal(), [], { wikimedia: 'infra_blocked', osm: 'complete', official: 'not_attempted' });
  assert.equal(result.status, EVIDENCE_STATUS.BLOCKED);
});

test('manifest rejects source-family drift and frozen input drift', () => {
  const manifest = {
    schema_version: 1,
    adapter_version: EVIDENCE_ADAPTER_VERSION,
    frozen_inputs: {
      effective_canonicals_sha256: '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
      entity_semantics_sha256: '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
      semantic_proposals_sha256: '21d741515ac942abfc6fdc2d6dfac0ccfaf95c50ed720b2298cbd1e2325b0370',
      round3a_summary_sha256: 'd4548f05df39876e5624b4cd51b019e9cdf3a06e6a98bf1024d7fdf2da79a5cb',
      coordinate_source_manifest_sha256: '2d2b1029a6b5807ad6592dc7ef3cbe9c098cadca89ff7832fcf8381aa0c66322',
    },
    adapters: {
      wikidata_action: { source_family: 'wikimedia' },
      wdqs: { source_family: 'wikimedia' },
      overpass: { source_family: 'osm' },
      nominatim: { source_family: 'osm' },
      official: { source_family: 'official' },
    },
    scope: 'pilot',
    candidate_keys: ['demo-peak'],
    requests: [],
  };
  assert.equal(validateEvidenceManifest(manifest), true);
  assert.throws(() => validateEvidenceManifest({ ...manifest, adapters: { ...manifest.adapters, overpass: { source_family: 'mirror-osm' } } }), /source family/);
  assert.throws(() => validateEvidenceManifest({ ...manifest, frozen_inputs: { ...manifest.frozen_inputs, semantic_proposals_sha256: 'wrong' } }), /frozen input/);
});

test('current Round 3A frozen inputs remain byte-stable before collection', async () => {
  const frozen = await verifyFrozenInputs(ROOT);
  assert.equal(frozen.needs_review_count, 273);
  assert.equal(frozen.proposal_count, 273);
  assert.equal(frozen.summary_status, 'candidate_only_not_applied');
  assert.equal((await readFile(join(ROOT, 'entity-semantics-review/semantic-proposals.jsonl'))).length > 0, true);
});

function mockResponse(payload, { status = 200 } = {}) {
  const bytes = Buffer.from(JSON.stringify(payload));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => bytes,
  };
}

async function withTemporaryDirectory(t, prefix, run) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return run(directory);
}

test('preflight cache policy bypasses a successful cache entry while ordinary requests reuse it', async (t) => withTemporaryDirectory(t, 'fu51-r3b-r2-cache-', async (root) => {
  const stage = join(root, 'stage');
  await mkdir(stage, { recursive: true });
  const params = { action: 'wbgetentities', format: 'json', ids: 'Q8502' };
  const key = cacheKey({ sourceId: 'wikidata', method: 'GET', url: 'https://example.test/w/api.php', params, body: null });
  const cachedBytes = Buffer.from('{"cached":true}');
  const cached = new Map([[key, {
    bytes: cachedBytes,
    origin: 'full/snapshots/sha256/cached',
    record: { cache_key: key, http_status: 200, response_body_sha256: 'cached' },
  }]]);
  let networkCalls = 0;
  const context = await createEvidenceContext(stage, cached, {
    fetchImpl: async () => {
      networkCalls += 1;
      return mockResponse({ live: true });
    },
  });
  const ordinary = await fetchCaptured({ sourceId: 'wikidata', requestId: 'wikidata:ordinary', url: 'https://example.test/w/api.php', params, context });
  assert.equal(ordinary.record.cache_hit, true);
  assert.equal(networkCalls, 0);
  const preflight = await fetchCaptured({
    sourceId: 'wikidata', requestId: 'preflight:wikidata-action', url: 'https://example.test/w/api.php', params, context,
    allowCache: false, cachePolicy: 'bypass',
  });
  assert.equal(preflight.record.cache_hit, false);
  assert.equal(preflight.record.retrieved_at.length > 0, true);
  assert.equal(networkCalls, 1);
  assert.equal(context.cacheStats.network_revisit_of_success_cache_key_count, 0);
}));

test('resume cache excludes preflight and failed responses while retaining ordinary successful responses', async (t) => withTemporaryDirectory(t, 'fu51-r3b-r2-resume-', async (root) => {
  const packageDir = join(root, 'entity-semantics-evidence/full');
  const snapshots = join(packageDir, 'snapshots/sha256');
  await mkdir(snapshots, { recursive: true });
  const successBytes = Buffer.from('{"ok":true}');
  const successHash = createHash('sha256').update(successBytes).digest('hex');
  await writeFile(join(snapshots, successHash), successBytes);
  const records = [
    { cache_key: 'ordinary-success', request_id: 'wikidata:ordinary', http_status: 200, response_body_sha256: successHash, response_cas_path: `snapshots/sha256/${successHash}` },
    { cache_key: 'preflight-success', request_id: 'preflight:wikidata-action', http_status: 200, response_body_sha256: successHash, response_cas_path: `snapshots/sha256/${successHash}` },
    { cache_key: 'failed-response', request_id: 'wikidata:failed', http_status: 504, response_body_sha256: successHash, response_cas_path: `snapshots/sha256/${successHash}` },
  ];
  await writeFile(join(packageDir, 'source-manifest.json'), JSON.stringify({ requests: records }));
  const cache = await loadResumeCache(root);
  assert.equal(cache.has('ordinary-success'), true);
  assert.equal(cache.has('preflight-success'), false);
  assert.equal(cache.has('failed-response'), false);
  assert.equal(cache.stats.successful_response_record_count, 2);
  assert.equal(cache.stats.preflight_success_excluded_count, 1);
  assert.equal(cache.stats.reusable_success_key_count, 1);
}));

test('both Pilot and Full gates reject collection.pass=false instead of allowing a zero-exit orchestration path', () => {
  const failed = { collection: { pass: false, gates: { blocked_rate: 0.5128205128205128 } } };
  assert.throws(() => assertScopeGate('pilot', failed), /pilot gate failed/);
  assert.throws(() => assertScopeGate('full', failed), /full gate failed/);
  assert.equal(assertScopeGate('full', { collection: { pass: true, gates: {} } }), true);
});

test('Full gate permits an unused historical cache key but rejects a network revisit of a successful fact response', () => {
  const recovery = {
    baseline_full_success_keys: 564,
    baseline_full_preflight_success_count: 4,
    baseline_full_success_response_count: 568,
    eligible_resume_success_key_count: 564,
    network_revisit_of_success_cache_key_count: 0,
    reused_success_cache_key_count: 549,
    unused_success_cache_key_count: 15,
  };
  assert.equal(assertScopeGate('full', { cache_recovery: recovery, collection: { pass: true, gates: {} } }), true);
  assert.throws(() => assertScopeGate('full', {
    cache_recovery: { ...recovery, network_revisit_of_success_cache_key_count: 1 },
    collection: { pass: true, gates: {} },
  }), /reissued cached fact requests/);
});

async function writeManifestPackage(root, scope, records) {
  const packageDir = join(root, 'entity-semantics-evidence', scope);
  await mkdir(join(packageDir, 'snapshots/sha256'), { recursive: true });
  await writeFile(join(packageDir, 'source-manifest.json'), JSON.stringify({ requests: records }));
  return packageDir;
}

async function writeAttemptPackage(root, name, records, overrides = {}) {
  const attemptDir = join(root, 'entity-semantics-evidence', 'attempts', name);
  await mkdir(join(attemptDir, 'snapshots/sha256'), { recursive: true });
  await writeFile(join(attemptDir, 'attempt-manifest.json'), JSON.stringify({
    adapter_version: EVIDENCE_ADAPTER_VERSION,
    candidate_keys: ['demo-peak'],
    frozen_inputs: FROZEN_INPUTS,
    requests: records,
    schema_version: 1,
    scope: 'full',
    ...overrides,
  }));
  return attemptDir;
}

async function writeCachedResponse(directory, name, bytes, recordOverrides = {}) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(directory, 'snapshots/sha256', hash), bytes);
  return {
    cache_key: name,
    http_status: 200,
    request_id: `wikidata:${name}`,
    response_body_sha256: hash,
    response_cas_path: `snapshots/sha256/${hash}`,
    ...recordOverrides,
  };
}

test('failure attempts persist an fsynced request manifest and successful-response CAS closure before publication', async (t) => withTemporaryDirectory(t, 'fu51-r3b-r21-attempt-', async (root) => {
  const stage = join(root, 'stage');
  const context = await createEvidenceContext(stage, new Map(), { fetchImpl: async () => mockResponse({ completed: true }) });
  await fetchCaptured({
    sourceId: 'wikidata', requestId: 'wikidata:demo', url: 'https://example.test/w/api.php',
    params: { action: 'wbgetentities', ids: 'Q1' }, context,
  });
  const saved = await writeFailureAttempt({
    candidateKeys: ['demo-peak'],
    context,
    error: new Error('forced before publication'),
    failedPhase: 'write_published_manifest',
    preflightChecks: { wikidata_action: { ok: true } },
    runId: 'full-test-run',
    scope: 'full',
    stageDir: stage,
  });
  const manifest = JSON.parse(await readFile(join(stage, 'attempt-manifest.json'), 'utf8'));
  const summary = JSON.parse(await readFile(join(stage, 'attempt-summary.json'), 'utf8'));
  assert.equal(manifest.failed_phase, 'write_published_manifest');
  assert.equal(manifest.requests.length, 1);
  assert.equal(manifest.successful_responses.length, 1);
  assert.equal(summary.successful_response_count, 1);
  const response = manifest.successful_responses[0];
  const bytes = await readFile(join(stage, response.response_cas_path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), response.response_body_sha256);
  assert.equal(saved.attemptManifest.run_id, 'full-test-run');
}));

test('resume cache consumes only valid manifested attempts and never bare CAS snapshots', async (t) => withTemporaryDirectory(t, 'fu51-r3b-r21-resume-', async (root) => {
  await writeManifestPackage(root, 'full', []);
  const attemptDir = await writeAttemptPackage(root, 'full-valid', []);
  const record = await writeCachedResponse(attemptDir, 'attempt-success', Buffer.from('{"attempt":true}'));
  await writeAttemptPackage(root, 'full-valid', [record]);
  const nakedDir = join(root, 'entity-semantics-evidence', 'attempts', 'full-bare-cas', 'snapshots/sha256');
  await mkdir(nakedDir, { recursive: true });
  await writeFile(join(nakedDir, 'orphan'), Buffer.from('{"orphan":true}'));
  const preflightAttempt = join(root, 'entity-semantics-evidence', 'attempts', 'preflight-live-failure', 'attempt-manifest.json');
  await mkdir(dirname(preflightAttempt), { recursive: true });
  await writeFile(preflightAttempt, JSON.stringify({ scope: 'preflight_live', requests: [] }));
  const cache = await loadResumeCache(root);
  assert.equal(cache.has('attempt-success'), true);
  assert.equal(cache.stats.reusable_attempt_success_key_count, 1);
  assert.equal(cache.stats.reusable_success_key_count, 1);
}));

test('resume attempts hard-fail on adapter, frozen-input, CAS, or duplicate-body drift', async (t) => withTemporaryDirectory(t, 'fu51-r3b-r21-invalid-attempt-', async (root) => {
  await writeManifestPackage(root, 'full', []);
  const invalid = await writeAttemptPackage(root, 'full-invalid', [], { adapter_version: 'stale-adapter' });
  const invalidRecord = await writeCachedResponse(invalid, 'invalid', Buffer.from('{"invalid":true}'));
  await writeAttemptPackage(root, 'full-invalid', [invalidRecord], { adapter_version: 'stale-adapter' });
  await assert.rejects(() => loadResumeCache(root), /adapter version mismatch/);

  await rm(join(root, 'entity-semantics-evidence', 'attempts', 'full-invalid'), { recursive: true, force: true });
  const fullDir = join(root, 'entity-semantics-evidence', 'full');
  const baseline = await writeCachedResponse(fullDir, 'same-key', Buffer.from('{"baseline":true}'));
  await writeManifestPackage(root, 'full', [baseline]);
  const conflicting = await writeAttemptPackage(root, 'full-conflicting', []);
  const changed = await writeCachedResponse(conflicting, 'same-key', Buffer.from('{"attempt":true}'));
  await writeAttemptPackage(root, 'full-conflicting', [changed]);
  await assert.rejects(() => loadResumeCache(root), /conflicting cached bodies/);
}));

test('preflight-live persists three uncached four-provider rounds with complete CAS closure', async (t) => withTemporaryDirectory(t, 'fu51-r3b-r21-preflight-', async (root) => {
  await writeManifestPackage(root, 'full', []);
  let calls = 0;
  const result = await preflightLive(root, {
    verifyBaselines: false,
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes('overpass')) {
        return mockResponse({ generator: 'Overpass API test', osm3s: { copyright: 'OpenStreetMap data is available under the ODbL.', timestamp_osm_base: '2026-07-24T00:00:00Z' } });
      }
      return mockResponse({ ok: true });
    },
  });
  assert.equal(calls, 12);
  assert.equal(result.request_count, 12);
  const latestDir = join(root, 'entity-semantics-evidence', 'preflight-live', 'latest');
  const manifest = JSON.parse(await readFile(join(latestDir, 'source-manifest.json'), 'utf8'));
  const summary = JSON.parse(await readFile(join(latestDir, 'preflight-summary.json'), 'utf8'));
  assert.equal(new Set(manifest.requests.map((record) => record.request_id)).size, 12);
  assert.equal(manifest.requests.every((record) => record.http_status === 200 && record.cache_hit === false && record.retrieved_at), true);
  assert.equal(summary.runs.length, 3);
  for (const record of manifest.requests) {
    const bytes = await readFile(join(latestDir, record.response_cas_path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.response_body_sha256);
  }
}));
