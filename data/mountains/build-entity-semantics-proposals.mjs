import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const EFFECTIVE_INPUT_PATH = 'ledger/effective_canonicals.jsonl';
const SEMANTICS_INPUT_PATH = 'ledger/entity-semantics.jsonl';
const OVERRIDES_INPUT_PATH = 'entity-semantics-overrides.json';
const SOURCE_MANIFEST_PATH = 'coordinate-review/pilot/source-manifest.json';
const REVIEW_DIR = 'entity-semantics-review';
const ROUND2E_BASELINE_DIR = 'coordinate-review/baselines/round2e-overlap-safe-classifier';
const ROUND2E_BASELINE_MANIFEST = 'baseline-sha256.json';
const FROZEN_EFFECTIVE_SHA256 = '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294';
const ENTITY_SEMANTICS_SHA256 = '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a';
const SOURCE_MANIFEST_SHA256 = '2d2b1029a6b5807ad6592dc7ef3cbe9c098cadca89ff7832fcf8381aa0c66322';
const ROUND2E_DETERMINISTIC_OUTPUTS = Object.freeze({
  'round1-baseline.jsonl': 'cba582501b22a3f7b7e31deae5d627c5d95ff7cd98dbc67bcb98302d02b0e25f',
  'observations.jsonl': 'c148fafd558c960fed385f351fb8c6a56e91fcaa85397626cc32cdfdf4ea2cc1',
  'coordinate-review.jsonl': '72830bfd3bc408262e4bd175a27d71a4224e98f028db550847c1abc372e83f31',
  'identity-gold-results.jsonl': '34721038db39fe136c9d0bdb184c1c42f318d239b1b2bd036843008ce79cce13',
  'parent-anchor-audit.jsonl': 'a1e4db009fd2b33fcb6ff9b08222613025317c11e8546d7bc143841ad21c3eaa',
  'status-traceability.jsonl': '6756096623dd86e3abcbe119606053f8992409dfd29d1d294ee07d8992d9c216',
  'conflicts-over-300m.jsonl': '3877beb572be5cf8a00dabc1be309d9a1ed2fbaf289edfc1a48992d41532773c',
  'exceptions.md': 'bab2edb62c69495db160b1cbee09b48911c59474f317c897d70e1fa4244de71e',
  'downstream-impact.md': 'd8ffb23efce8683c120b4a76606c2863f0d7eddf64eb9677edd70a55ba68cbbe',
  'pilot-summary.json': '793e9c12522a2e06ac9af1af6bfb42bafda1913732e45ec4654f06042d26b1c4',
});
const ROUND2E_CLASSIFIER_SOURCES = Object.freeze({
  'review-coordinates.mjs': '963c4c91d0c7185c44fb7d2103432856c5edf74db5fbcd0029bc7584318a572b',
  'review-coordinates.test.mjs': 'babebfedde65440250777d530894cda4d240d4a9a129e59d2e75b35f8f61c49e',
  'coordinate-review/identity-adjudication-gold.json': '4cc2fbd4ea751fa73f94135f9a37cd96ea720ec64470100b5d72a2d0060720cc',
});
const REVIEW_FILES = Object.freeze([
  'semantic-proposals.jsonl',
  'semantic-review.md',
  'semantic-review.csv',
  'adversarial-sample.md',
  'proposed-overrides.preview.json',
  'round3a-summary.json',
]);
const ROUTE_CONTEXT_RE = /(南坡|北坡|东坡|西坡|入口|进山口|大门|景区|路线|线路|环线|穿越|古道|大本营|起点|终点)/u;
const ROUTE_ENTITY_RE = /(路线|线路|环线|穿越|古道|廊道)$/u;
const GENERIC_SUMMIT_RE = /(主峰|最高峰|顶峰|至高点)$/u;
const PEAK_SIGNAL_RE = /(峰|顶|尖|海子山|K2)$/iu;
const AREA_SIGNAL_RE = /(山|山脉|山系|岭|景区|地貌|高原|丘陵|峡谷|森林公园|国家公园)$/u;

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clean(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort(asciiCompare);
}

function sourceFields(entity) {
  return {
    aliases: clean(entity.aliases || []),
    altitude: entity.altitude || null,
    classic_routes: clean(entity.classic_routes || []),
    description: entity.description || null,
    entity_type: entity.entity_type || null,
    gps: entity.gps || null,
    length: entity.length || null,
    massif_key: entity.massif_key || null,
    mountain_routes: clean((entity.mountain_routes || []).map((route) => route.name)),
    primary_summit: entity.primary_summit || null,
  };
}

function routeText(entity) {
  return clean([
    ...(entity.classic_routes || []),
    ...(entity.mountain_routes || []).flatMap((route) => [route.name, ...(route.route_raws || [])]),
  ]);
}

function proposalBase(entity) {
  const provinces = clean(entity.provinces || []);
  return {
    effective_canonical_key: entity.effective_canonical_key,
    primary_name: entity.primary_name,
    province: provinces.length === 1 ? provinces[0] : null,
    provinces,
    proposal_status: 'proposal',
    source_fields: sourceFields(entity),
  };
}

function externalFactProposal(entity, base, ruleId, evidence, uncertaintyReasons) {
  return {
    ...base,
    evidence,
    proposal_confidence: 'low',
    proposed_catalog_entity_kind: null,
    proposed_coordinate_target_role: 'none',
    proposed_target_name: null,
    recommended_next_action: 'collect_authoritative_identity_or_representative_highpoint_evidence',
    requires_external_fact: true,
    review_group: 'external_fact_required',
    rule_id: ruleId,
    uncertainty_reasons: uncertaintyReasons,
  };
}

function candidateEvidence(entity, duplicateCount) {
  return [
    { code: 'frozen_primary_name', value: entity.primary_name },
    { code: 'frozen_source_entity_type', value: entity.entity_type || null },
    { code: 'frozen_aliases', value: clean(entity.aliases || []) },
    { code: 'frozen_classic_routes', value: routeText(entity) },
    { code: 'primary_name_occurrence_count', value: duplicateCount },
  ];
}

export function proposeSemanticRecord(entity, semantics, context = {}) {
  if (semantics?.semantic_status !== 'needs_review') {
    throw new Error(`proposal input must be needs_review: ${entity.effective_canonical_key}`);
  }
  const base = proposalBase(entity);
  const name = String(entity.primary_name || '').trim();
  const routes = routeText(entity);
  const duplicateCount = context.primary_name_counts?.get(name) || 1;
  const evidence = candidateEvidence(entity, duplicateCount);
  const routeContextInAliases = clean(entity.aliases || []).filter((value) => ROUTE_CONTEXT_RE.test(value));
  const routeRepeatsNamedPeak = routes.some((route) => route.includes(name)
    && /(主峰|登顶|攀登|峰顶)/u.test(route));

  if (ROUTE_ENTITY_RE.test(name)) {
    return {
      ...base,
      evidence,
      proposal_confidence: 'medium',
      proposed_catalog_entity_kind: 'route_corridor',
      proposed_coordinate_target_role: 'route_highpoint',
      proposed_target_name: null,
      recommended_next_action: 'batch_review_route_corridor_scope_without_creating_a_summit',
      requires_external_fact: false,
      review_group: 'batch_review',
      rule_id: 'route_entity_name_review',
      uncertainty_reasons: ['Frozen source still classifies this record as peak; route entity semantics require review.'],
    };
  }

  if (GENERIC_SUMMIT_RE.test(name)) {
    return externalFactProposal(entity, base, 'generic_primary_summit_requires_identity_fact', evidence, [
      'Generic primary-summit wording does not identify a stable product entity or exact target.',
      'Generic summit labels cannot become high-confidence exact targets.',
    ]);
  }

  if (duplicateCount > 1) {
    return externalFactProposal(entity, base, 'same_name_cross_entity_requires_disambiguation', evidence, [
      'The frozen catalog has multiple effective entities with this primary name.',
      'Province/source identity requires adjudication before selecting product semantics or a target.',
    ]);
  }

  if (PEAK_SIGNAL_RE.test(name) && !ROUTE_CONTEXT_RE.test(name)) {
    const confidence = routeRepeatsNamedPeak ? 'high' : 'medium';
    return {
      ...base,
      evidence,
      proposal_confidence: confidence,
      proposed_catalog_entity_kind: 'independent_peak',
      proposed_coordinate_target_role: 'independent_summit',
      proposed_target_name: name,
      recommended_next_action: confidence === 'high'
        ? 'review_auto_ready_named_peak_before_manual_application'
        : 'batch_review_named_peak_identity_and_target',
      requires_external_fact: false,
      review_group: confidence === 'high' ? 'auto_ready' : 'batch_review',
      rule_id: confidence === 'high'
        ? 'frozen_named_peak_route_target_relation'
        : 'named_peak_signal_requires_product_review',
      uncertainty_reasons: [
        ...(confidence === 'high' ? [] : ['Peak-style naming alone is a signal, not a confirmed product decision.']),
        ...(routeContextInAliases.length ? ['Route-direction aliases are diagnostic only and excluded from the proposed exact target.'] : []),
      ],
    };
  }

  if (AREA_SIGNAL_RE.test(name)) {
    return externalFactProposal(entity, base, 'mountain_area_without_reliable_representative_highpoint', evidence, [
      'The source name reads as an area or mountain body, but the frozen ledger has no reliable representative highpoint.',
      'Mountain-area records may remain without a point target rather than guessing a summit.',
    ]);
  }

  return {
    ...base,
    evidence,
    proposal_confidence: 'low',
    proposed_catalog_entity_kind: null,
    proposed_coordinate_target_role: 'none',
    proposed_target_name: null,
    recommended_next_action: 'batch_review_product_entity_before_any_coordinate_target',
    requires_external_fact: false,
    review_group: 'batch_review',
    rule_id: 'unresolved_product_entity_shape',
    uncertainty_reasons: ['Frozen source fields do not mechanically distinguish a mountain area from an independent peak.'],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => asciiCompare(left, right))
    .map(([key, child]) => [key, stableObject(child)]));
}

function stableJson(value) {
  return `${JSON.stringify(stableObject(value), null, 2)}\n`;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function expectedRound2EBaselineManifest() {
  return {
    schema_version: 1,
    baseline: 'round2e-overlap-safe-classifier',
    frozen_inputs: {
      [EFFECTIVE_INPUT_PATH]: FROZEN_EFFECTIVE_SHA256,
      [SEMANTICS_INPUT_PATH]: ENTITY_SEMANTICS_SHA256,
      [SOURCE_MANIFEST_PATH]: SOURCE_MANIFEST_SHA256,
    },
    classifier_sources: ROUND2E_CLASSIFIER_SOURCES,
    deterministic_outputs: ROUND2E_DETERMINISTIC_OUTPUTS,
  };
}

async function assertSha(path, expected, label) {
  const actual = sha256(await readFile(path));
  assert(actual === expected, `${label} SHA mismatch: ${actual}`);
  return actual;
}

export async function freezeRound2EBaseline(rootDir = MODULE_ROOT) {
  const parent = join(rootDir, 'coordinate-review', 'baselines');
  const target = join(rootDir, ROUND2E_BASELINE_DIR);
  const expectedManifest = stableJson(expectedRound2EBaselineManifest());
  if (await pathExists(join(target, ROUND2E_BASELINE_MANIFEST))) {
    await verifyRound2EBaseline(rootDir);
    return { created: false, path: target };
  }
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, '.round2e-baseline-'));
  try {
    for (const [name, expectedSha] of Object.entries(ROUND2E_DETERMINISTIC_OUTPUTS)) {
      const bytes = await readFile(join(rootDir, 'coordinate-review/pilot', name));
      assert(sha256(bytes) === expectedSha, `Round 2E output SHA mismatch before baseline copy: ${name}`);
      await writeFile(join(stage, name), bytes);
    }
    for (const [relativePath, expectedSha] of Object.entries({
      [EFFECTIVE_INPUT_PATH]: FROZEN_EFFECTIVE_SHA256,
      [SEMANTICS_INPUT_PATH]: ENTITY_SEMANTICS_SHA256,
      [SOURCE_MANIFEST_PATH]: SOURCE_MANIFEST_SHA256,
    })) {
      await assertSha(join(rootDir, relativePath), expectedSha, relativePath);
    }
    await writeFile(join(stage, ROUND2E_BASELINE_MANIFEST), expectedManifest);
    await rename(stage, target);
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  return { created: true, path: target };
}

export async function verifyRound2EBaseline(rootDir = MODULE_ROOT) {
  const target = join(rootDir, ROUND2E_BASELINE_DIR);
  const expectedManifest = stableJson(expectedRound2EBaselineManifest());
  const actualManifest = await readFile(join(target, ROUND2E_BASELINE_MANIFEST), 'utf8');
  assert(actualManifest === expectedManifest, 'Round 2E baseline manifest differs from frozen contract');
  const expectedNames = new Set([...Object.keys(ROUND2E_DETERMINISTIC_OUTPUTS), ROUND2E_BASELINE_MANIFEST]);
  const found = await readdir(target);
  assert(found.length === expectedNames.size && found.every((name) => expectedNames.has(name)), 'Round 2E baseline contains unexpected or missing files');
  for (const [name, expectedSha] of Object.entries(ROUND2E_DETERMINISTIC_OUTPUTS)) {
    await assertSha(join(target, name), expectedSha, `Round 2E baseline ${name}`);
    await assertSha(join(rootDir, 'coordinate-review/pilot', name), expectedSha, `Round 2E pilot ${name}`);
  }
  for (const [relativePath, expectedSha] of Object.entries(expectedRound2EBaselineManifest().frozen_inputs)) {
    await assertSha(join(rootDir, relativePath), expectedSha, relativePath);
  }
  return {
    baseline_path: target,
    deterministic_output_count: Object.keys(ROUND2E_DETERMINISTIC_OUTPUTS).length,
  };
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] || 0) + 1;
  }
  return stableObject(result);
}

function fixedSemanticMismatches(semanticsByKey) {
  const fixedCases = [
    ['baiyun-shan-guangdong', 'mountain_area', 'representative_highpoint', '摩星岭'],
    ['taishan', 'mountain_area', 'representative_highpoint', '玉皇顶'],
    ['huashan', 'mountain_area', 'representative_highpoint', '南峰'],
    ['siguniang-dafeng', 'independent_peak', 'independent_summit', '四姑娘山大峰'],
    ['siguniang-erfeng', 'independent_peak', 'independent_summit', '四姑娘山二峰'],
    ['siguniang-sanfeng', 'independent_peak', 'independent_summit', '四姑娘山三峰'],
    ['siguniang-yaomei-feng', 'independent_peak', 'independent_summit', '四姑娘山幺妹峰'],
    ['qiaogeli-feng-k2', 'independent_peak', 'independent_summit', '乔戈里峰（K2）'],
    ['muztagata-feng', 'independent_peak', 'independent_summit', '慕士塔格峰'],
  ];
  const mismatches = [];
  for (const [key, kind, role, target] of fixedCases) {
    const record = semanticsByKey.get(key);
    const actualTarget = record?.representative_highpoint_name || record?.independent_summit_name || null;
    if (!record || record.catalog_entity_kind !== kind || record.coordinate_target_role !== role || actualTarget !== target) {
      mismatches.push({ key, expected: { catalog_entity_kind: kind, coordinate_target_role: role, target }, actual: record || null });
    }
  }
  return mismatches;
}

async function loadReviewInputs(rootDir) {
  const [effectiveBytes, semanticsBytes, overridesBytes] = await Promise.all([
    readFile(join(rootDir, EFFECTIVE_INPUT_PATH)),
    readFile(join(rootDir, SEMANTICS_INPUT_PATH)),
    readFile(join(rootDir, OVERRIDES_INPUT_PATH)),
  ]);
  assert(sha256(effectiveBytes) === FROZEN_EFFECTIVE_SHA256, 'effective canonical input SHA mismatch');
  assert(sha256(semanticsBytes) === ENTITY_SEMANTICS_SHA256, 'entity semantics input SHA mismatch');
  const effective = effectiveBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  const semantics = semanticsBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  const overrides = JSON.parse(overridesBytes.toString('utf8'));
  assert(effective.length === 359, `expected 359 effective entities, found ${effective.length}`);
  assert(semantics.length === 359, `expected 359 entity semantics rows, found ${semantics.length}`);
  const effectiveByKey = new Map(effective.map((row) => [row.effective_canonical_key, row]));
  const semanticsByKey = new Map(semantics.map((row) => [row.effective_canonical_key, row]));
  assert(effectiveByKey.size === 359, 'effective canonical keys are not unique');
  assert(semanticsByKey.size === 359, 'entity semantics keys are not unique');
  assert([...effectiveByKey.keys()].every((key) => semanticsByKey.has(key)), 'entity semantics closure differs from effective canonicals');
  const needsReview = effective
    .filter((entity) => semanticsByKey.get(entity.effective_canonical_key).semantic_status === 'needs_review')
    .sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key));
  assert(needsReview.length === 273, `expected 273 needs_review entities, found ${needsReview.length}`);
  const primaryNameCounts = new Map();
  for (const entity of effective) {
    const name = String(entity.primary_name || '').trim();
    primaryNameCounts.set(name, (primaryNameCounts.get(name) || 0) + 1);
  }
  return {
    effective,
    effectiveByKey,
    needsReview,
    overridesBytes,
    semantics,
    semanticsByKey,
    primaryNameCounts,
  };
}

function assertProposalContract(proposals) {
  const groups = new Set(['auto_ready', 'batch_review', 'external_fact_required']);
  assert(proposals.length === 273, `proposal closure is ${proposals.length}, expected 273`);
  const keys = proposals.map((row) => row.effective_canonical_key);
  assert(new Set(keys).size === 273, 'proposal keys are not unique');
  assert(proposals.every((row) => groups.has(row.review_group)), 'proposal has unknown review group');
  assert(proposals.every((row) => row.proposal_status === 'proposal'), 'proposal package contains a non-proposal record');
  const routeContextExactTargetLeaks = proposals.filter((row) => row.proposed_target_name
    && ROUTE_CONTEXT_RE.test(row.proposed_target_name));
  const genericPrimarySummitAutoConfirm = proposals.filter((row) => row.review_group === 'auto_ready'
    && (GENERIC_SUMMIT_RE.test(row.primary_name) || GENERIC_SUMMIT_RE.test(row.proposed_target_name || '')));
  assert(routeContextExactTargetLeaks.length === 0, 'route-context exact target leak');
  assert(genericPrimarySummitAutoConfirm.length === 0, 'generic primary summit auto-confirm');
  return {
    generic_primary_summit_auto_confirm_count: genericPrimarySummitAutoConfirm.length,
    route_context_exact_target_leak_count: routeContextExactTargetLeaks.length,
    unaccounted: 273 - keys.length,
  };
}

function csvCell(value) {
  const raw = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function renderProposalCsv(proposals) {
  const fields = [
    'effective_canonical_key', 'primary_name', 'province', 'review_group', 'proposal_confidence',
    'proposed_catalog_entity_kind', 'proposed_coordinate_target_role', 'proposed_target_name',
    'rule_id', 'requires_external_fact', 'recommended_next_action', 'uncertainty_reasons', 'evidence', 'source_fields',
  ];
  return `${[fields.join(','), ...proposals.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\n')}\n`;
}

function renderProposalReview(proposals, fixedMismatches, contract) {
  const groupCounts = countBy(proposals, (row) => row.review_group);
  const confidenceCounts = countBy(proposals, (row) => row.proposal_confidence);
  const ruleCounts = countBy(proposals, (row) => row.rule_id);
  return [
    '# Round 3A Entity Semantics Proposal Review',
    '',
    '- Status: candidate-only. No proposal is a confirmed semantic decision.',
    `- Frozen effective canonicals SHA-256: \`${FROZEN_EFFECTIVE_SHA256}\``,
    `- Frozen entity semantics SHA-256: \`${ENTITY_SEMANTICS_SHA256}\``,
    '- Formal entity semantics and overrides are read-only inputs for this package.',
    `- Proposal closure: ${proposals.length}/273`,
    `- Review groups: \`${JSON.stringify(groupCounts)}\``,
    `- Confidence: \`${JSON.stringify(confidenceCounts)}\``,
    `- Rules: \`${JSON.stringify(ruleCounts)}\``,
    `- Fixed approved-case mismatches: ${fixedMismatches.length}`,
    `- Route-context exact-target leaks: ${contract.route_context_exact_target_leak_count}`,
    `- Generic primary-summit auto-confirms: ${contract.generic_primary_summit_auto_confirm_count}`,
    '',
    '## Review Groups',
    '',
    '- `auto_ready`: frozen source explicitly repeats a non-generic named peak in route evidence; still requires human approval before formal application.',
    '- `batch_review`: a bounded product-semantic recommendation exists, but no external fact is mechanically required to discuss it.',
    '- `external_fact_required`: frozen facts cannot safely resolve identity, same-name disambiguation, or a representative highpoint.',
    '',
    '## Rule Counts',
    '',
    '| Rule | Count |',
    '|---|---:|',
    ...Object.entries(ruleCounts).map(([rule, count]) => `| ${rule} | ${count} |`),
    '',
  ].join('\n');
}

function isRoutePolluted(proposal) {
  const fields = proposal.source_fields;
  return [...fields.aliases, ...fields.classic_routes, ...fields.mountain_routes]
    .some((value) => ROUTE_CONTEXT_RE.test(value));
}

function adversarialTags(proposal) {
  return [
    proposal.rule_id === 'generic_primary_summit_requires_identity_fact' && 'generic_primary_summit',
    proposal.rule_id === 'same_name_cross_entity_requires_disambiguation' && 'same_name_disambiguation',
    proposal.proposed_catalog_entity_kind === 'independent_peak' && 'independent_peak',
    proposal.rule_id === 'mountain_area_without_reliable_representative_highpoint' && 'mountain_area_without_highpoint',
    isRoutePolluted(proposal) && 'route_context_pollution',
  ].filter(Boolean);
}

function pickAdversarialSamples(proposals) {
  const requiredCategories = [
    'generic_primary_summit',
    'same_name_disambiguation',
    'independent_peak',
    'mountain_area_without_highpoint',
    'route_context_pollution',
  ];
  const selected = [];
  const seen = new Set();
  const categoryCounts = Object.fromEntries(requiredCategories.map((category) => [category, 0]));
  const add = (proposal) => {
    if (seen.has(proposal.effective_canonical_key)) return false;
    seen.add(proposal.effective_canonical_key);
    selected.push(proposal);
    for (const category of adversarialTags(proposal)) categoryCounts[category] += 1;
    return true;
  };
  for (const category of requiredCategories) {
    while (categoryCounts[category] < 5) {
      const candidate = proposals.find((proposal) => !seen.has(proposal.effective_canonical_key)
        && adversarialTags(proposal).includes(category));
      assert(candidate, `not enough adversarial candidates for ${category}`);
      add(candidate);
    }
  }
  for (const proposal of proposals) {
    if (selected.length >= 40) break;
    add(proposal);
  }
  assert(selected.length >= 40, `adversarial sample has ${selected.length}, expected at least 40`);
  const samples = selected.slice(0, 40);
  const sampleCategoryCounts = Object.fromEntries(requiredCategories.map((category) => [category,
    samples.filter((proposal) => adversarialTags(proposal).includes(category)).length]));
  assert(requiredCategories.every((category) => sampleCategoryCounts[category] >= 5), 'adversarial sample category coverage is incomplete');
  return { categoryCounts: sampleCategoryCounts, samples };
}

function renderAdversarialSample(sample) {
  const { samples } = sample;
  return [
    '# Round 3A Adversarial Sample',
    '',
    'The samples below are deterministic candidate-review fixtures, not confirmed entity decisions.',
    '',
    '| Key | Product name | Tags | Group | Proposed kind | Target role | Target name | Rule | Adversarial concern |',
    '|---|---|---|---|---|---|---|---|---|',
    ...samples.map((row) => `| ${row.effective_canonical_key} | ${row.primary_name} | ${adversarialTags(row).join(', ')} | ${row.review_group} | ${row.proposed_catalog_entity_kind || '--'} | ${row.proposed_coordinate_target_role} | ${row.proposed_target_name || '--'} | ${row.rule_id} | ${row.uncertainty_reasons.join(' ')} |`),
    '',
  ].join('\n');
}

function previewOverrides(proposals) {
  return {
    schema_version: 1,
    status: 'preview_only_do_not_apply',
    frozen_effective_canonicals_sha256: FROZEN_EFFECTIVE_SHA256,
    frozen_entity_semantics_sha256: ENTITY_SEMANTICS_SHA256,
    proposal_count: proposals.length,
    by_effective_canonical_key: Object.fromEntries(proposals.map((proposal) => [proposal.effective_canonical_key, {
      proposal_confidence: proposal.proposal_confidence,
      proposed_catalog_entity_kind: proposal.proposed_catalog_entity_kind,
      proposed_coordinate_target_role: proposal.proposed_coordinate_target_role,
      proposed_target_name: proposal.proposed_target_name,
      recommended_next_action: proposal.recommended_next_action,
      requires_external_fact: proposal.requires_external_fact,
      review_group: proposal.review_group,
      rule_id: proposal.rule_id,
      uncertainty_reasons: proposal.uncertainty_reasons,
    }])),
  };
}

function outputSha(contents) {
  return Object.fromEntries(Object.entries(contents)
    .sort(([left], [right]) => asciiCompare(left, right))
    .map(([name, body]) => [name, sha256(body)]));
}

export async function buildProposalPackage(rootDir = MODULE_ROOT) {
  const baseline = await verifyRound2EBaseline(rootDir);
  const inputs = await loadReviewInputs(rootDir);
  const beforeFormalHashes = {
    entity_semantics: sha256(await readFile(join(rootDir, SEMANTICS_INPUT_PATH))),
    entity_semantics_overrides: sha256(inputs.overridesBytes),
  };
  const proposals = inputs.needsReview.map((entity) => proposeSemanticRecord(
    entity,
    inputs.semanticsByKey.get(entity.effective_canonical_key),
    { primary_name_counts: inputs.primaryNameCounts },
  )).sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key));
  const contract = assertProposalContract(proposals);
  const fixedMismatches = fixedSemanticMismatches(inputs.semanticsByKey);
  const adversarialSample = pickAdversarialSamples(proposals);
  const contentsWithoutSummary = {
    'semantic-proposals.jsonl': `${proposals.map((row) => JSON.stringify(stableObject(row))).join('\n')}\n`,
    'semantic-review.md': `${renderProposalReview(proposals, fixedMismatches, contract)}\n`,
    'semantic-review.csv': renderProposalCsv(proposals),
    'adversarial-sample.md': `${renderAdversarialSample(adversarialSample)}\n`,
    'proposed-overrides.preview.json': stableJson(previewOverrides(proposals)),
  };
  const summary = {
    schema_version: 1,
    status: 'candidate_only_not_applied',
    frozen_inputs: {
      effective_canonicals_sha256: FROZEN_EFFECTIVE_SHA256,
      entity_semantics_sha256: ENTITY_SEMANTICS_SHA256,
      source_manifest_sha256: SOURCE_MANIFEST_SHA256,
    },
    round2e_baseline: baseline,
    counts: {
      needs_review_input: inputs.needsReview.length,
      proposals: proposals.length,
      review_groups: countBy(proposals, (row) => row.review_group),
      confidence: countBy(proposals, (row) => row.proposal_confidence),
      rules: countBy(proposals, (row) => row.rule_id),
    },
    adversarial_sample_category_counts: adversarialSample.categoryCounts,
    gates: {
      fixed_case_mismatch_count: fixedMismatches.length,
      proposal_closure_273: proposals.length === 273,
      proposal_unaccounted: contract.unaccounted,
      route_context_exact_target_leak_count: contract.route_context_exact_target_leak_count,
      generic_primary_summit_auto_confirm_count: contract.generic_primary_summit_auto_confirm_count,
      formal_entity_semantics_write_count: 0,
      formal_overrides_write_count: 0,
      round2e_deterministic_output_count: baseline.deterministic_output_count,
    },
    generated_artifact_sha256: outputSha(contentsWithoutSummary),
  };
  const contents = { ...contentsWithoutSummary, 'round3a-summary.json': stableJson(summary) };
  const afterFormalHashes = {
    entity_semantics: sha256(await readFile(join(rootDir, SEMANTICS_INPUT_PATH))),
    entity_semantics_overrides: sha256(await readFile(join(rootDir, OVERRIDES_INPUT_PATH))),
  };
  assert(stableJson(beforeFormalHashes) === stableJson(afterFormalHashes), 'formal semantics input changed while building proposals');
  assert(Object.keys(contents).length === REVIEW_FILES.length, 'unexpected Round 3A output count');
  assert(REVIEW_FILES.every((name) => Object.hasOwn(contents, name)), 'missing Round 3A output');
  return { baseline, contents, fixedMismatches, proposals, summary };
}

async function atomicReplaceDirectory(target, contents) {
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, '.entity-semantics-review-stage-'));
  const backup = `${target}.backup-${process.pid}`;
  let backedUp = false;
  let replaced = false;
  try {
    for (const name of REVIEW_FILES) await writeFile(join(stage, name), contents[name]);
    if (await pathExists(target)) {
      await rename(target, backup);
      backedUp = true;
    }
    await rename(stage, target);
    replaced = true;
    if (backedUp) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (!replaced) await rm(stage, { recursive: true, force: true });
    if (backedUp && !(await pathExists(target))) await rename(backup, target);
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
    if (backedUp && replaced) await rm(backup, { recursive: true, force: true });
  }
}

export async function generateProposalPackage(rootDir = MODULE_ROOT) {
  const result = await buildProposalPackage(rootDir);
  await atomicReplaceDirectory(join(rootDir, REVIEW_DIR), result.contents);
  return result.summary;
}

export async function checkProposalPackage(rootDir = MODULE_ROOT) {
  const result = await buildProposalPackage(rootDir);
  const directory = join(rootDir, REVIEW_DIR);
  const found = await readdir(directory);
  assert(found.length === REVIEW_FILES.length && found.every((name) => REVIEW_FILES.includes(name)), 'Round 3A proposal package has unexpected or missing files');
  for (const name of REVIEW_FILES) {
    const actual = await readFile(join(directory, name), 'utf8');
    assert(actual === result.contents[name], `Round 3A proposal output differs from deterministic rebuild: ${name}`);
  }
  const parentEntries = await readdir(dirname(directory));
  assert(!parentEntries.some((name) => name.startsWith('.entity-semantics-review-stage-') || name.startsWith('entity-semantics-review.backup-')),
    'Round 3A transaction residue exists');
  return result.summary;
}

export async function verifyProposalByteIdentical(rootDir = MODULE_ROOT) {
  const first = await buildProposalPackage(rootDir);
  const second = await buildProposalPackage(rootDir);
  for (const name of REVIEW_FILES) assert(first.contents[name] === second.contents[name], `Round 3A output differs across in-memory rebuilds: ${name}`);
  return REVIEW_FILES;
}

async function main() {
  const command = process.argv[2] || 'generate';
  if (command === 'freeze-round2e') console.log(JSON.stringify(await freezeRound2EBaseline(MODULE_ROOT), null, 2));
  else if (command === 'generate') console.log(JSON.stringify(await generateProposalPackage(MODULE_ROOT), null, 2));
  else if (command === '--check' || command === 'check') console.log(JSON.stringify(await checkProposalPackage(MODULE_ROOT), null, 2));
  else if (command === 'verify-byte-identical') console.log(JSON.stringify({ byte_identical: await verifyProposalByteIdentical(MODULE_ROOT) }, null, 2));
  else throw new Error('usage: node build-entity-semantics-proposals.mjs <freeze-round2e|generate|check|verify-byte-identical>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
