import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { proposeSemanticRecord } from './build-entity-semantics-proposals.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const proposalModule = await import('./build-entity-semantics-proposals.mjs');

test('Round 3A semantic proposal generator is present', () => {
  assert.equal(existsSync(join(ROOT, 'build-entity-semantics-proposals.mjs')), true);
});

test('routes an explicit named peak repeated in frozen route text to an auto-ready summit proposal', () => {
  const proposal = proposeSemanticRecord({
    effective_canonical_key: 'banji-feng',
    primary_name: '半脊峰',
    primary_summit: null,
    provinces: ['四川省'],
    entity_type: 'peak',
    aliases: [],
    classic_routes: ['毕棚沟-半脊峰大本营-主峰往返线'],
    mountain_routes: [],
    description: '独立山峰。',
    altitude: { raw: '5430m', value_m: 5430, parse_quality: 'exact_literal' },
    gps: { present: true, raw: '31.2N, 102.8E', latitude: 31.2, longitude: 102.8 },
    length: { raw: '18km', value_km: 18, parse_quality: 'exact_literal' },
  }, { semantic_status: 'needs_review' }, { primary_name_counts: new Map([['半脊峰', 1]]) });
  assert.equal(proposal.review_group, 'auto_ready');
  assert.equal(proposal.proposed_catalog_entity_kind, 'independent_peak');
  assert.equal(proposal.proposed_coordinate_target_role, 'independent_summit');
  assert.equal(proposal.proposed_target_name, '半脊峰');
  assert.equal(proposal.proposal_confidence, 'high');
  assert.equal(proposal.requires_external_fact, false);
});

test('routes generic primary summits to external fact review without auto-confirming an exact target', () => {
  const proposal = proposeSemanticRecord({
    effective_canonical_key: 'aerjin-shan',
    primary_name: '阿尔金山主峰',
    primary_summit: null,
    provinces: ['甘肃省'],
    entity_type: 'peak',
    aliases: [],
    classic_routes: ['阿克塞县-阿尔金山主峰大本营-往返线'],
    mountain_routes: [],
    description: '待核实。',
    altitude: { raw: '5828m', value_m: 5828, parse_quality: 'exact_literal' },
    gps: { present: true, raw: '39.35N, 94.1E', latitude: 39.35, longitude: 94.1 },
    length: { raw: '25km', value_km: 25, parse_quality: 'exact_literal' },
  }, { semantic_status: 'needs_review' }, { primary_name_counts: new Map([['阿尔金山主峰', 1]]) });
  assert.equal(proposal.review_group, 'external_fact_required');
  assert.equal(proposal.proposed_catalog_entity_kind, null);
  assert.equal(proposal.proposed_coordinate_target_role, 'none');
  assert.equal(proposal.proposed_target_name, null);
  assert.equal(proposal.proposal_confidence, 'low');
  assert.equal(proposal.requires_external_fact, true);
});

test('keeps route-direction aliases out of exact target proposals', () => {
  const proposal = proposeSemanticRecord({
    effective_canonical_key: 'yuzhu-feng',
    primary_name: '玉珠峰',
    primary_summit: null,
    provinces: ['青海省'],
    entity_type: 'peak',
    aliases: ['玉珠峰北坡', '玉珠峰南坡'],
    classic_routes: ['玉珠峰北坡线'],
    mountain_routes: [],
    description: '独立峰。',
    altitude: { raw: '6178m', value_m: 6178, parse_quality: 'exact_literal' },
    gps: { present: true, raw: '36.4N, 93.3E', latitude: 36.4, longitude: 93.3 },
    length: { raw: '20km', value_km: 20, parse_quality: 'exact_literal' },
  }, { semantic_status: 'needs_review' }, { primary_name_counts: new Map([['玉珠峰', 1]]) });
  assert.equal(proposal.proposed_target_name, '玉珠峰');
  assert.equal(proposal.evidence.some((row) => String(row.value).includes('北坡')), true);
  assert.equal(proposal.proposed_target_name.includes('北坡'), false);
  assert.equal(proposal.proposed_target_name.includes('南坡'), false);
});

test('exposes a deterministic Round 3A package builder and Round 2E baseline verifier', () => {
  assert.equal(typeof proposalModule.buildProposalPackage, 'function');
  assert.equal(typeof proposalModule.freezeRound2EBaseline, 'function');
  assert.equal(typeof proposalModule.verifyRound2EBaseline, 'function');
});

test('builds a closed candidate-only package without writing formal semantics or overrides', async () => {
  const beforeSemantics = await readFile(join(ROOT, 'ledger/entity-semantics.jsonl'));
  const beforeOverrides = await readFile(join(ROOT, 'entity-semantics-overrides.json'));
  const baseline = await proposalModule.verifyRound2EBaseline(ROOT);
  const result = await proposalModule.buildProposalPackage(ROOT);
  assert.equal(baseline.deterministic_output_count, 10);
  assert.equal(result.proposals.length, 273);
  assert.equal(new Set(result.proposals.map((row) => row.effective_canonical_key)).size, 273);
  assert.equal(result.fixedMismatches.length, 0);
  assert.equal(result.summary.gates.route_context_exact_target_leak_count, 0);
  assert.equal(result.summary.gates.generic_primary_summit_auto_confirm_count, 0);
  assert.equal(result.summary.gates.formal_entity_semantics_write_count, 0);
  assert.equal(result.summary.gates.formal_overrides_write_count, 0);
  assert.equal(result.proposals.filter((row) => row.proposed_target_name && /南坡|北坡|大门|大本营/u.test(row.proposed_target_name)).length, 0);
  for (const category of [
    'generic_primary_summit',
    'same_name_disambiguation',
    'independent_peak',
    'mountain_area_without_highpoint',
    'route_context_pollution',
  ]) {
    assert.ok(result.summary.adversarial_sample_category_counts[category] >= 5, `missing adversarial coverage for ${category}`);
  }
  assert.deepEqual(await readFile(join(ROOT, 'ledger/entity-semantics.jsonl')), beforeSemantics);
  assert.deepEqual(await readFile(join(ROOT, 'entity-semantics-overrides.json')), beforeOverrides);
});
