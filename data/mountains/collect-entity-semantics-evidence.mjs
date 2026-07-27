import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const EFFECTIVE_PATH = 'ledger/effective_canonicals.jsonl';
const SEMANTICS_PATH = 'ledger/entity-semantics.jsonl';
const PROPOSALS_PATH = 'entity-semantics-review/semantic-proposals.jsonl';
const ROUND3A_SUMMARY_PATH = 'entity-semantics-review/round3a-summary.json';
const COORDINATE_MANIFEST_PATH = 'coordinate-review/pilot/source-manifest.json';
const COORDINATE_GOLD_PATH = 'coordinate-review/identity-adjudication-gold.json';
const COORDINATE_PILOT_DIR = 'coordinate-review/pilot';
const EVIDENCE_ROOT = 'entity-semantics-evidence';
const ROUND3B_R2_ARCHIVE_DIR = 'attempts/round3b-full-infra-blocked-51pct';
const ROUND2E_BASELINE_DIR = 'coordinate-review/baselines/round2e-hardening';
const ROUND3A_BASELINE_DIR = 'entity-semantics-evidence/baselines/round3a-proposal-package';

export const FROZEN_INPUTS = Object.freeze({
  effective_canonicals_sha256: '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  entity_semantics_sha256: '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
  semantic_proposals_sha256: '21d741515ac942abfc6fdc2d6dfac0ccfaf95c50ed720b2298cbd1e2325b0370',
  round3a_summary_sha256: 'd4548f05df39876e5624b4cd51b019e9cdf3a06e6a98bf1024d7fdf2da79a5cb',
  coordinate_source_manifest_sha256: '2d2b1029a6b5807ad6592dc7ef3cbe9c098cadca89ff7832fcf8381aa0c66322',
});

const ROUND2E_HARDENING_SOURCES = Object.freeze({
  'review-coordinates.mjs': '5211efa545565ccb335407dc39551eebff80faa39d50ba19f4de1eec726e7f15',
  'review-coordinates.test.mjs': 'df8f7d0b58c75d3425983682873616e5852ba10100082bd4d0e2964f778044d6',
  'coordinate-review/identity-adjudication-gold.json': '4cc2fbd4ea751fa73f94135f9a37cd96ea720ec64470100b5d72a2d0060720cc',
});

const ROUND2E_OUTPUTS = Object.freeze({
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

const ROUND3A_OUTPUTS = Object.freeze({
  'semantic-proposals.jsonl': '21d741515ac942abfc6fdc2d6dfac0ccfaf95c50ed720b2298cbd1e2325b0370',
  'semantic-review.md': 'd32620ecb572b71d090e8d0006673a525bd0cc747836e6d3ec49ebdf1c3c4718',
  'semantic-review.csv': 'a81065794e5c35fb7607bc9b8cf7f1721c56e65906b54303101882942d9984d7',
  'adversarial-sample.md': 'bc27797d1de95617dcf0da2dfac26c53f8aa58463bc5d92c558539157cf86322',
  'proposed-overrides.preview.json': 'fdf3d74c1d2fdbcde4bde3e844a06da8da067b841914da5d657aa82b4134a965',
  'round3a-summary.json': 'd4548f05df39876e5624b4cd51b019e9cdf3a06e6a98bf1024d7fdf2da79a5cb',
});

export const EVIDENCE_ADAPTER_VERSION = 'round3b-semantic-evidence-v1';
export const EVIDENCE_STATUS = Object.freeze({
  BLOCKED: 'blocked',
  CONFLICT: 'conflict',
  MISSING: 'missing',
  SINGLE_FAMILY_REFERENCE: 'single_family_reference',
  TWO_FAMILY_CONSENSUS: 'two_family_consensus',
});

const ADAPTERS = Object.freeze({
  wikidata_action: {
    endpoint: 'https://www.wikidata.org/w/api.php',
    source_family: 'wikimedia',
    version: 'wikidata-action-v1',
    attribution: 'Wikidata, CC0',
  },
  wdqs: {
    endpoint: 'https://query.wikidata.org/sparql',
    source_family: 'wikimedia',
    version: 'wdqs-preflight-v1',
    attribution: 'Wikidata Query Service, CC0',
  },
  nominatim: {
    endpoint: 'https://nominatim.openstreetmap.org/search',
    source_family: 'osm',
    version: 'nominatim-v1',
    attribution: 'OpenStreetMap contributors, ODbL',
  },
  overpass: {
    endpoint: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    source_family: 'osm',
    version: 'overpass-mail-ru-semantic-v1',
    attribution: 'OpenStreetMap contributors, ODbL',
  },
  official: {
    source_family: 'official',
    version: 'official-reference-fetch-v1',
    attribution: 'Origin publisher retained in source manifest',
  },
});

const PACKAGE_FILES = Object.freeze([
  'source-manifest.json',
  'observations.jsonl',
  'semantic-evidence-review.jsonl',
  'exceptions.md',
  'semantic-evidence-summary.json',
  'provider-coverage.md',
]);
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const INTERVAL_MS = Object.freeze({ nominatim: 1_100, overpass: 1_250, wikidata: 125, official: 250 });
const USER_AGENT = 'PeakTrekker-FU51-Round3B-SemanticEvidence/1.0 (offline review; contact: local-only)';
const MAX_QUERY_NAMES = 8;
const MAX_SEARCH_RESULTS = 5;
const MAX_OVERPASS_ELEMENTS = 60;
const CACHE_POLICY = Object.freeze({
  ALLOW_SUCCESS: 'allow_success',
  BYPASS: 'bypass',
});
const FULL_R1_SUCCESS_RESPONSE_COUNT = 568;
const FULL_R1_PREFLIGHT_SUCCESS_COUNT = 4;
const FULL_R1_RESUMABLE_SUCCESS_KEY_COUNT = 564;
const FULL_R1_MANIFEST_SHA256 = '307d9230b1238fb76d7657571ba592001aec4d28019a09f2177e74e1f5586899';
const PEAK_CLASS_IDS = new Set(['Q207326', 'Q8502']);
const AREA_CLASS_IDS = new Set(['Q46831', 'Q8502', 'Q473972', 'Q23397', 'Q179049']);
const OSM_DERIVED_QIDS = new Set(['Q936', 'Q88313479']);
const ROUTE_CONTEXT_RE = /(南坡|北坡|东坡|西坡|入口|进山口|大门|景区|路线|线路|环线|穿越|古道|大本营|起点|终点)/u;
const GENERIC_HIGHPOINT_RE = /^(主峰|最高峰|顶峰|至高点)$/u;
const ROUTE_TARGET_RE = /(路线|线路|环线|穿越|古道|廊道)$/u;

const PROVINCE_ISO = Object.freeze({
  '安徽省': 'CN-AH', '北京市': 'CN-BJ', '重庆市': 'CN-CQ', '福建省': 'CN-FJ', '甘肃省': 'CN-GS',
  '广东省': 'CN-GD', '广西壮族自治区': 'CN-GX', '贵州省': 'CN-GZ', '海南省': 'CN-HI', '河北省': 'CN-HE',
  '黑龙江省': 'CN-HL', '河南省': 'CN-HA', '湖北省': 'CN-HB', '湖南省': 'CN-HN', '江苏省': 'CN-JS',
  '江西省': 'CN-JX', '吉林省': 'CN-JL', '辽宁省': 'CN-LN', '内蒙古自治区': 'CN-NM', '宁夏回族自治区': 'CN-NX',
  '青海省': 'CN-QH', '陕西省': 'CN-SN', '山东省': 'CN-SD', '上海市': 'CN-SH', '山西省': 'CN-SX',
  '四川省': 'CN-SC', '台湾省': 'CN-TW', '天津市': 'CN-TJ', '西藏自治区': 'CN-XZ', '新疆维吾尔自治区': 'CN-XJ',
  '云南省': 'CN-YN', '浙江省': 'CN-ZJ',
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort(asciiCompare).map((key) => [key, stableObject(value[key])]));
}

function stableJson(value) {
  return `${JSON.stringify(stableObject(value), null, 2)}\n`;
}

function jsonl(rows) {
  return `${rows.map((row) => JSON.stringify(stableObject(row))).join('\n')}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s·・.。()（）\-—_]/gu, '');
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort(asciiCompare);
}

function parseJsonl(text) {
  return text.trimEnd() ? text.trimEnd().split('\n').map(JSON.parse) : [];
}

async function exists(path) {
  try { await readFile(path); return true; } catch { return false; }
}

async function directoryExists(path) {
  try {
    await readdir(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertSha(path, expected, label) {
  const actual = sha256(await readFile(path));
  assert(actual === expected, `${label} SHA mismatch: ${actual}`);
}

export function isRouteContextName(value) {
  return ROUTE_CONTEXT_RE.test(String(value || '')) || ROUTE_TARGET_RE.test(String(value || ''));
}

export function isGenericHighpointName(value) {
  return GENERIC_HIGHPOINT_RE.test(String(value || '').trim());
}

export function deriveSemanticQueryNames(entity) {
  const primaryName = String(entity.primary_name || '').trim();
  const names = unique([
    primaryName,
    ...(entity.aliases || []),
    ...(entity.source_fields?.aliases || []),
  ].filter((name) => !isRouteContextName(name)));
  const queryNames = names.length > 0
    ? names
    // A source-bound product name can contain a slope or route token. It is
    // lookup context only; exactSemanticTargetName still rejects it.
    : unique([primaryName]);
  assert(queryNames.length > 0, `${entity.effective_canonical_key} has no semantic query name`);
  assert(queryNames.length <= MAX_QUERY_NAMES, `${entity.effective_canonical_key} exceeds ${MAX_QUERY_NAMES} semantic query names`);
  return queryNames;
}

export function exactSemanticTargetName(proposal) {
  const target = String(proposal?.proposed_target_name || '').trim();
  return target && !isRouteContextName(target) && !isGenericHighpointName(target) ? target : null;
}

function sourceIdentity(entity, proposal) {
  return {
    aliases: deriveSemanticQueryNames(entity),
    primary_name: proposal.primary_name || entity.primary_name,
    provinces: unique(entity.provinces || proposal.provinces || []),
  };
}

function proposalSignature(kind, target) {
  return `${kind || ''}\u0000${target || ''}`;
}

function safeTarget(value) {
  const target = String(value || '').trim();
  return target && !isRouteContextName(target) && !isGenericHighpointName(target) ? target : null;
}

export function familyVoteSummary(observations) {
  const eligible = observations.filter((row) => row.evidence_quality === 'reference'
    && row.semantic_kind
    && (!row.supports_representative_highpoint || Boolean(safeTarget(row.semantic_target_name))));
  const families = new Map();
  for (const row of eligible) {
    const family = row.source_family;
    const signature = proposalSignature(row.semantic_kind, safeTarget(row.semantic_target_name));
    const current = families.get(family) || new Map();
    const bucket = current.get(signature) || [];
    bucket.push(row);
    current.set(signature, bucket);
    families.set(family, current);
  }
  const familyVotes = {};
  const signatures = new Map();
  const intraFamilyConflictFamilies = [];
  const intraFamilySignatureOptions = {};
  for (const [family, options] of [...families.entries()].sort(([left], [right]) => asciiCompare(left, right))) {
    const ordered = [...options.entries()].sort(([left], [right]) => asciiCompare(left, right));
    const optionRows = ordered.map(([signature, rows]) => {
      const [semanticKind, semanticTargetName] = signature.split('\u0000');
      return {
        dependency_clusters: unique(rows.map((row) => row.dependency_cluster_id)),
        observation_ids: rows.map((row) => row.observation_id).sort(asciiCompare),
        semantic_kind: semanticKind || null,
        semantic_target_name: semanticTargetName || null,
      };
    });
    if (optionRows.length !== 1) {
      intraFamilyConflictFamilies.push(family);
      intraFamilySignatureOptions[family] = {
        family_status: 'intra_family_conflict',
        options: optionRows,
      };
      continue;
    }
    const [[signature, rows]] = ordered;
    const ids = rows.map((row) => row.observation_id).sort(asciiCompare);
    familyVotes[family] = {
      family_status: 'single_signature_vote',
      dependency_clusters: unique(rows.map((row) => row.dependency_cluster_id)),
      observation_ids: ids,
      semantic_kind: rows[0].semantic_kind,
      semantic_target_name: safeTarget(rows[0].semantic_target_name),
    };
    const entries = signatures.get(signature) || [];
    entries.push({ family, observation_ids: ids });
    signatures.set(signature, entries);
  }
  const countedVotesByFamily = new Map();
  for (const entries of signatures.values()) {
    for (const entry of entries) countedVotesByFamily.set(entry.family, (countedVotesByFamily.get(entry.family) || 0) + 1);
  }
  const sameSourceFamilyDuplicateVoteCount = [...countedVotesByFamily.values()]
    .reduce((total, count) => total + Math.max(0, count - 1), 0);
  return {
    intra_family_conflict_count: intraFamilyConflictFamilies.length,
    intra_family_conflict_families: intraFamilyConflictFamilies,
    intra_family_signature_options: stableObject(intraFamilySignatureOptions),
    same_source_family_duplicate_vote_count: sameSourceFamilyDuplicateVoteCount,
    source_family_count: Object.keys(familyVotes).length,
    source_family_votes: stableObject(familyVotes),
    signatures: new Map([...signatures.entries()].map(([signature, values]) => [signature, values.sort((left, right) => asciiCompare(left.family, right.family))])),
  };
}

function sourceOutcomesBlocked(outcomes) {
  return Object.values(outcomes || {}).some((value) => value === 'infra_blocked' || value === 'source_unavailable');
}

export function buildEvidenceReview(entity, proposal, observations, outcomes) {
  const voteSummary = familyVoteSummary(observations);
  const signatures = [...voteSummary.signatures.entries()].map(([signature, votes]) => {
    const [kind, target] = signature.split('\u0000');
    return { kind: kind || null, target: target || null, votes };
  }).sort((left, right) => asciiCompare(proposalSignature(left.kind, left.target), proposalSignature(right.kind, right.target)));
  const usable = signatures.filter((row) => row.votes.length > 0);
  const blocked = sourceOutcomesBlocked(outcomes);
  let status;
  let selected = null;
  const exclusionReasons = unique([
    ...observations.map((row) => row.excluded_reason).filter(Boolean),
    ...voteSummary.intra_family_conflict_families.map((family) => `${family} has conflicting semantic signatures and contributes no vote`),
  ]);
  if (voteSummary.intra_family_conflict_count > 0) {
    status = EVIDENCE_STATUS.CONFLICT;
  } else if (blocked) {
    status = EVIDENCE_STATUS.BLOCKED;
  } else if (usable.length === 0) {
    status = EVIDENCE_STATUS.MISSING;
  } else if (usable.length > 1) {
    status = EVIDENCE_STATUS.CONFLICT;
  } else {
    [selected] = usable;
    status = selected.votes.length >= 2
      ? EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS
      : EVIDENCE_STATUS.SINGLE_FAMILY_REFERENCE;
  }
  const selectedTarget = status === EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS || status === EVIDENCE_STATUS.SINGLE_FAMILY_REFERENCE
    ? safeTarget(selected?.target)
    : null;
  const selectedKind = status === EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS || status === EVIDENCE_STATUS.SINGLE_FAMILY_REFERENCE
    ? selected?.kind || null
    : null;
  const representativeEvidence = observations.filter((row) => row.supports_representative_highpoint && safeTarget(row.semantic_target_name));
  const seedConsistentOnly = proposal.review_group === 'auto_ready'
    && status !== EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS;
  return {
    effective_canonical_key: entity.effective_canonical_key,
    primary_name: entity.primary_name,
    status,
    proposed_catalog_entity_kind: selectedKind,
    proposed_coordinate_target_role: selectedKind === 'mountain_area' && selectedTarget
      ? 'representative_highpoint'
      : selectedKind === 'independent_peak' ? 'independent_summit' : 'none',
    proposed_target_name: selectedTarget,
    source_family_votes: voteSummary.source_family_votes,
    source_family_count: voteSummary.source_family_count,
    intra_family_conflict_count: voteSummary.intra_family_conflict_count,
    intra_family_conflict_families: voteSummary.intra_family_conflict_families,
    intra_family_signature_options: voteSummary.intra_family_signature_options,
    same_source_family_duplicate_vote_count: voteSummary.same_source_family_duplicate_vote_count,
    dependency_clusters: unique(observations.map((row) => row.dependency_cluster_id).filter(Boolean)),
    evidence_observation_ids: observations.map((row) => row.observation_id).sort(asciiCompare),
    exclusion_reasons: exclusionReasons,
    source_outcomes: stableObject(outcomes),
    representative_highpoint_explicit_relation_count: representativeEvidence.length,
    requires_product_review: true,
    seed_consistent_only: seedConsistentOnly,
    recommended_next_action: status === EVIDENCE_STATUS.BLOCKED
      ? 'retry_blocked_source_without_applying_semantics'
      : status === EVIDENCE_STATUS.CONFLICT
        ? 'manual_product_semantic_adjudication'
        : status === EVIDENCE_STATUS.MISSING
          ? 'collect_external_identity_or_representative_highpoint_fact'
          : 'human_review_before_any_formal_semantic_override',
    round3a_seed_proposal: {
      proposal_confidence: proposal.proposal_confidence,
      proposed_catalog_entity_kind: proposal.proposed_catalog_entity_kind,
      proposed_coordinate_target_role: proposal.proposed_coordinate_target_role,
      proposed_target_name: exactSemanticTargetName(proposal),
      review_group: proposal.review_group,
      rule_id: proposal.rule_id,
    },
  };
}

function requestUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function cacheKey({ sourceId, method, url, params, body }) {
  return sha256(Buffer.from(JSON.stringify(stableObject({
    adapter_version: EVIDENCE_ADAPTER_VERSION,
    body_sha256: body ? sha256(Buffer.from(body)) : null,
    method,
    params,
    source_id: sourceId,
    url,
  }))));
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function writeSnapshot(snapshotDir, bytes) {
  const hash = sha256(bytes);
  const path = join(snapshotDir, hash);
  if (!(await exists(path))) await writeFile(path, bytes);
  return { hash, relative_path: `snapshots/sha256/${hash}` };
}

async function writeFileSynced(path, contents) {
  await writeFile(path, contents);
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function createRunId(scope, stageDir) {
  return `${scope}-${sha256(Buffer.from(`${stageDir}\u0000${process.pid}`)).slice(0, 16)}`;
}

export async function createEvidenceContext(stageDir, resumeCache = new Map(), { fetchImpl = globalThis.fetch } = {}) {
  const snapshotDir = join(stageDir, 'snapshots/sha256');
  await mkdir(snapshotDir, { recursive: true });
  const resumeStats = resumeCache.stats || {
    full_preflight_success_excluded_count: 0,
    full_reusable_success_key_count: 0,
    full_successful_response_record_count: 0,
    preflight_success_excluded_count: 0,
    reusable_attempt_success_key_count: 0,
    reusable_success_key_count: resumeCache.size,
    successful_response_record_count: resumeCache.size,
  };
  return {
    cacheStats: {
      cache_hit_keys: new Set(),
      cache_hit_request_count: 0,
      network_revisit_of_success_cache_key_count: 0,
      network_request_count: 0,
      reused_attempt_success_keys: new Set(),
      reused_baseline_full_success_keys: new Set(),
      resume: resumeStats,
    },
    fetchImpl,
    lastRequestAt: new Map(),
    requests: [],
    resumeCache,
    resumeCacheKeys: new Set(resumeCache.keys()),
    snapshotDir,
  };
}

async function enforceInterval(context, sourceId) {
  const interval = INTERVAL_MS[sourceId] || 0;
  const previous = context.lastRequestAt.get(sourceId) || 0;
  const wait = interval - (Date.now() - previous);
  if (wait > 0) await sleep(wait);
  context.lastRequestAt.set(sourceId, Date.now());
}

function failureKind(record) {
  if (record.http_status === 404) return 'true_not_found';
  if (record.http_status === 429 || (record.http_status || 0) >= 500 || record.error) return 'infra_blocked';
  return 'source_unavailable';
}

function isPreflightRequest(requestId) {
  return String(requestId || '').startsWith('preflight:');
}

export async function fetchCaptured({
  sourceId,
  requestId,
  url,
  params = {},
  method = 'GET',
  body = null,
  context,
  allowCache = true,
  cachePolicy = allowCache ? CACHE_POLICY.ALLOW_SUCCESS : CACHE_POLICY.BYPASS,
}) {
  assert(Object.values(CACHE_POLICY).includes(cachePolicy), `unknown cache policy: ${cachePolicy}`);
  const canReadCache = allowCache && cachePolicy === CACHE_POLICY.ALLOW_SUCCESS;
  const key = cacheKey({ sourceId, method, url, params, body });
  const cached = canReadCache ? context.resumeCache.get(key) : null;
  if (cached) {
    const snapshot = await writeSnapshot(context.snapshotDir, cached.bytes);
    const record = {
      ...cached.record,
      cache_policy: cachePolicy,
      cache_hit: true,
      cache_origin: cached.origin,
      request_id: requestId,
      response_cas_path: snapshot.relative_path,
    };
    context.cacheStats.cache_hit_request_count += 1;
    context.cacheStats.cache_hit_keys.add(key);
    if (cached.origin_kind === 'attempt') context.cacheStats.reused_attempt_success_keys.add(key);
    if (cached.origin_kind === 'baseline_full') context.cacheStats.reused_baseline_full_success_keys.add(key);
    context.requests.push(record);
    return { bytes: cached.bytes, ok: cached.record.http_status >= 200 && cached.record.http_status < 300, record, status: cached.record.http_status };
  }
  if (context.resumeCacheKeys.has(key) && !isPreflightRequest(requestId)) {
    context.cacheStats.network_revisit_of_success_cache_key_count += 1;
  }
  const fullUrl = method === 'GET' ? requestUrl(url, params) : url;
  const bodyBytes = body === null ? null : Buffer.from(body);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await enforceInterval(context, sourceId);
    const retrievedAt = new Date().toISOString();
    try {
      context.cacheStats.network_request_count += 1;
      const response = await context.fetchImpl(fullUrl, {
        method,
        body: bodyBytes,
        headers: {
          Accept: 'application/json, text/html;q=0.8',
          'User-Agent': USER_AGENT,
          ...(bodyBytes ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const snapshot = await writeSnapshot(context.snapshotDir, bytes);
      const record = {
        adapter_version: EVIDENCE_ADAPTER_VERSION,
        attempt,
        cache_policy: cachePolicy,
        cache_hit: false,
        cache_key: key,
        error: null,
        http_status: response.status,
        method,
        params: stableObject(params),
        request_body_sha256: bodyBytes ? sha256(bodyBytes) : null,
        request_id: requestId,
        response_body_sha256: snapshot.hash,
        response_cas_path: snapshot.relative_path,
        response_headers: {
          content_type: response.headers.get('content-type'),
          retry_after: response.headers.get('retry-after'),
        },
        retrieved_at: retrievedAt,
        source_id: sourceId,
        url,
      };
      context.requests.push(record);
      if (response.ok) return { bytes, ok: true, record, status: response.status };
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_ATTEMPTS) {
        return { bytes, failure_kind: failureKind(record), ok: false, record, status: response.status };
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 2 ** attempt * 1_000);
    } catch (error) {
      const record = {
        adapter_version: EVIDENCE_ADAPTER_VERSION,
        attempt,
        cache_policy: cachePolicy,
        cache_hit: false,
        cache_key: key,
        error: String(error?.cause?.message || error?.message || error),
        http_status: null,
        method,
        params: stableObject(params),
        request_body_sha256: bodyBytes ? sha256(bodyBytes) : null,
        request_id: requestId,
        response_body_sha256: null,
        response_cas_path: null,
        response_headers: {},
        retrieved_at: retrievedAt,
        source_id: sourceId,
        url,
      };
      context.requests.push(record);
      if (attempt === MAX_ATTEMPTS) return { bytes: null, failure_kind: 'infra_blocked', ok: false, record, status: null };
      await sleep(2 ** attempt * 1_000);
    }
  }
  throw new Error(`unreachable fetch loop for ${requestId}`);
}

function actionNames(item) {
  return unique([
    ...Object.values(item.labels || {}).map((entry) => entry.value),
    ...Object.values(item.aliases || {}).flatMap((entries) => entries.map((entry) => entry.value)),
  ]);
}

function claimEntities(item, property) {
  return unique((item.claims?.[property] || []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean));
}

function claimString(item, property) {
  return unique((item.claims?.[property] || []).map((claim) => claim.mainsnak?.datavalue?.value).filter((value) => typeof value === 'string'));
}

function directReferenceFamily(claim) {
  const references = claim.references || [];
  const sourceIds = unique(references.flatMap((reference) => (reference.snaks?.P248 || [])
    .map((snak) => snak.datavalue?.value?.id).filter(Boolean)));
  const urls = unique(references.flatMap((reference) => (reference.snaks?.P854 || [])
    .map((snak) => snak.datavalue?.value).filter((value) => typeof value === 'string')));
  const imported = references.some((reference) => (reference.snaks?.P143 || []).length > 0);
  if (sourceIds.some((id) => OSM_DERIVED_QIDS.has(id)) || urls.some((value) => /openstreetmap|opentopomap/iu.test(value))) return 'osm';
  if (imported) return 'wikimedia';
  return 'wikimedia';
}

function officialUrls(claim) {
  return unique((claim.references || []).flatMap((reference) => (reference.snaks?.P854 || [])
    .map((snak) => snak.datavalue?.value)
    .filter((value) => {
      try {
        const host = new URL(value).hostname.toLowerCase();
        return host === 'gov.cn' || host.endsWith('.gov.cn');
      } catch { return false; }
    })));
}

function itemSemanticKind(item, relationTarget) {
  const classes = new Set([...claimEntities(item, 'P31'), ...claimEntities(item, 'P279')]);
  if (relationTarget) return 'mountain_area';
  if ([...classes].some((id) => PEAK_CLASS_IDS.has(id))) return 'independent_peak';
  if ([...classes].some((id) => AREA_CLASS_IDS.has(id))) return 'mountain_area';
  return null;
}

function safeItemMatch(item, names) {
  const accepted = new Set(names.map(normalize));
  return actionNames(item).find((name) => accepted.has(normalize(name))) || null;
}

function preferredLabel(item) {
  return item.labels?.zh?.value || item.labels?.['zh-hans']?.value || item.labels?.en?.value || null;
}

function parseSearchResults(bytes) {
  return JSON.parse(bytes.toString('utf8')).search || [];
}

async function collectWikimedia(subjects, context) {
  const outcomes = Object.fromEntries(subjects.map((subject) => [subject.entity.effective_canonical_key, 'complete']));
  const qidsByKey = new Map(subjects.map((subject) => [subject.entity.effective_canonical_key, new Set()]));
  const searchNames = unique(subjects.flatMap((subject) => deriveSemanticQueryNames(subject.entity)));
  for (const name of searchNames) {
    const response = await fetchCaptured({
      sourceId: 'wikidata', requestId: `wikidata:search:${sha256(Buffer.from(name)).slice(0, 16)}`,
      url: ADAPTERS.wikidata_action.endpoint,
      params: { action: 'wbsearchentities', format: 'json', language: 'zh', limit: MAX_SEARCH_RESULTS, origin: '*', search: name },
      context,
    });
    const matchingSubjects = subjects.filter((subject) => deriveSemanticQueryNames(subject.entity).includes(name));
    if (!response.ok) {
      for (const subject of matchingSubjects) outcomes[subject.entity.effective_canonical_key] = response.failure_kind || 'infra_blocked';
      continue;
    }
    const qids = parseSearchResults(response.bytes).map((result) => result.id).filter((id) => /^Q\d+$/u.test(id));
    for (const subject of matchingSubjects) for (const qid of qids) qidsByKey.get(subject.entity.effective_canonical_key).add(qid);
  }
  const qids = unique([...qidsByKey.values()].flatMap((values) => [...values]));
  const itemByQid = new Map();
  for (let index = 0; index < qids.length; index += 50) {
    const ids = qids.slice(index, index + 50);
    const response = await fetchCaptured({
      sourceId: 'wikidata', requestId: `wikidata:entities:${index / 50 + 1}`,
      url: ADAPTERS.wikidata_action.endpoint,
      params: { action: 'wbgetentities', format: 'json', ids: ids.join('|'), languages: 'zh|zh-hans|en', origin: '*', props: 'labels|aliases|claims|info' },
      context,
    });
    if (!response.ok) {
      for (const subject of subjects) if ([...qidsByKey.get(subject.entity.effective_canonical_key)].some((qid) => ids.includes(qid))) outcomes[subject.entity.effective_canonical_key] = response.failure_kind || 'infra_blocked';
      continue;
    }
    for (const [qid, item] of Object.entries(JSON.parse(response.bytes.toString('utf8')).entities || {})) itemByQid.set(qid, item);
  }
  const highpointQids = unique([...itemByQid.values()].flatMap((item) => claimEntities(item, 'P610')));
  const highpoints = new Map();
  for (let index = 0; index < highpointQids.length; index += 50) {
    const ids = highpointQids.slice(index, index + 50);
    const response = await fetchCaptured({
      sourceId: 'wikidata', requestId: `wikidata:highpoints:${index / 50 + 1}`,
      url: ADAPTERS.wikidata_action.endpoint,
      params: { action: 'wbgetentities', format: 'json', ids: ids.join('|'), languages: 'zh|zh-hans|en', origin: '*', props: 'labels|aliases|claims' },
      context,
    });
    if (!response.ok) continue;
    for (const [qid, item] of Object.entries(JSON.parse(response.bytes.toString('utf8')).entities || {})) highpoints.set(qid, item);
  }
  const observations = [];
  const officialCandidates = [];
  for (const subject of subjects) {
    const { entity, proposal } = subject;
    const names = deriveSemanticQueryNames(entity);
    for (const qid of [...qidsByKey.get(entity.effective_canonical_key)].sort(asciiCompare)) {
      const item = itemByQid.get(qid);
      if (!item) continue;
      const matched = safeItemMatch(item, names);
      if (!matched) continue;
      const p610 = item.claims?.P610 || [];
      const relation = p610.map((claim) => ({ claim, qid: claim.mainsnak?.datavalue?.value?.id || null }))
        .find((row) => row.qid && highpoints.has(row.qid));
      const target = relation ? safeTarget(preferredLabel(highpoints.get(relation.qid))) : null;
      const semanticKind = itemSemanticKind(item, target);
      if (!semanticKind) continue;
      const claim = relation?.claim || item.claims?.P31?.[0] || item.claims?.P279?.[0] || null;
      const family = claim ? directReferenceFamily(claim) : 'wikimedia';
      const observationId = `wikidata:${qid}:${relation?.claim?.id || 'identity'}`;
      const row = {
        effective_canonical_key: entity.effective_canonical_key,
        observation_id: observationId,
        source_id: 'wikidata',
        source_family: family,
        dependency_cluster_id: `${family}:${qid}`,
        request_ids: [],
        matched_name: matched,
        semantic_kind: semanticKind,
        semantic_target_name: target,
        supports_representative_highpoint: Boolean(target && relation),
        evidence_quality: 'reference',
        excluded_reason: target || semanticKind ? null : 'Wikidata item has no allowed semantic relation',
        p31_ids: claimEntities(item, 'P31'),
        p279_ids: claimEntities(item, 'P279'),
        p361_ids: claimEntities(item, 'P361'),
        p131_ids: claimEntities(item, 'P131'),
        p625_values: claimString(item, 'P625'),
        p610_target_qid: relation?.qid || null,
        p610_target_name: target,
        provenance: { qid, source_ids: claim ? claimEntities({ claims: { P248: claim.references?.flatMap((reference) => reference.snaks?.P248 || []) || [] } }, 'P248') : [] },
      };
      observations.push(row);
      for (const url of relation ? officialUrls(relation.claim) : []) officialCandidates.push({ entity, observation: row, proposal, url });
    }
  }
  return { observations, officialCandidates, outcomes };
}

export function escapeOverpassRegex(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

function isoCodes(entity) {
  const codes = unique((entity.provinces || []).map((province) => PROVINCE_ISO[province]).filter(Boolean));
  assert(codes.length > 0, `${entity.effective_canonical_key} has no supported province ISO code`);
  return codes;
}

export function buildOverpassQuery(names, entity) {
  const escapedNames = names.map(escapeOverpassRegex);
  assert(escapedNames.length > 0, `${entity.effective_canonical_key} has no Overpass query name`);
  const pattern = escapedNames.length === 1
    ? `^${escapedNames[0]}$`
    : `^(${escapedNames.join('|')})$`;
  const areas = isoCodes(entity).map((code, index) => `area["ISO3166-2"="${code}"]->.a${index};`).join('\n');
  const clauses = isoCodes(entity).map((_, index) => `nwr["name"~"${pattern}"](area.a${index});`).join('\n');
  return `[out:json][timeout:90];\n${areas}\n(\n${clauses}\n);\nout tags center meta;`;
}

function osmCoordinate(element) {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') return { latitude: element.lat, longitude: element.lon };
  if (typeof element.center?.lat === 'number' && typeof element.center?.lon === 'number') return { latitude: element.center.lat, longitude: element.center.lon };
  return null;
}

function osmNames(tags = {}) {
  return unique(Object.entries(tags).filter(([key]) => key === 'name' || key.startsWith('name:') || [
    'alt_name', 'official_name', 'loc_name', 'int_name', 'old_name', 'short_name',
  ].includes(key)).flatMap(([, value]) => String(value || '').split(';')));
}

function osmSemanticKind(element, proposal, matched) {
  const tags = element.tags || {};
  if (element.type === 'node' && tags.natural === 'peak' && normalize(matched) === normalize(proposal.primary_name)) return 'independent_peak';
  if (tags.natural === 'mountain' || tags.boundary === 'protected_area' || tags.leisure === 'nature_reserve' || tags.tourism === 'attraction') return 'mountain_area';
  return null;
}

async function collectOsm(subjects, context) {
  const outcomes = Object.fromEntries(subjects.map((subject) => [subject.entity.effective_canonical_key, 'complete']));
  const observations = [];
  for (const subject of subjects) {
    const { entity, proposal } = subject;
    const queryNames = deriveSemanticQueryNames(entity);
    const nominatim = await fetchCaptured({
      sourceId: 'nominatim', requestId: `nominatim:${entity.effective_canonical_key}`,
      url: ADAPTERS.nominatim.endpoint,
      params: { addressdetails: 1, format: 'jsonv2', limit: 5, namedetails: 1, q: `${entity.primary_name}, ${(entity.provinces || []).join(' ')}` },
      context,
    });
    if (!nominatim.ok) outcomes[entity.effective_canonical_key] = nominatim.failure_kind || 'infra_blocked';
    else {
      const rows = JSON.parse(nominatim.bytes.toString('utf8'));
      for (const row of rows) observations.push({
        effective_canonical_key: entity.effective_canonical_key,
        observation_id: `nominatim:${entity.effective_canonical_key}:${row.osm_type || 'unknown'}:${row.osm_id || sha256(Buffer.from(row.display_name || '')).slice(0, 10)}`,
        source_id: 'nominatim', source_family: 'osm', dependency_cluster_id: `osm:nominatim:${row.osm_type || 'unknown'}:${row.osm_id || 'none'}`,
        request_ids: [`nominatim:${entity.effective_canonical_key}`], matched_name: row.name || row.display_name || '',
        semantic_kind: null, semantic_target_name: null, supports_representative_highpoint: false,
        evidence_quality: 'diagnostic', excluded_reason: 'Nominatim is label/admin evidence only',
        osm_type: row.osm_type || null, osm_id: row.osm_id || null, osm_class: row.class || null, osm_category: row.type || null,
        admin_hint: row.address || {}, latitude: Number(row.lat) || null, longitude: Number(row.lon) || null,
      });
    }
    const body = new URLSearchParams({ data: buildOverpassQuery(queryNames, entity) }).toString();
    const overpass = await fetchCaptured({
      sourceId: 'overpass', requestId: `overpass:${entity.effective_canonical_key}`,
      url: ADAPTERS.overpass.endpoint, method: 'POST', body, context,
    });
    if (!overpass.ok) {
      outcomes[entity.effective_canonical_key] = overpass.failure_kind || 'infra_blocked';
      continue;
    }
    const elements = (JSON.parse(overpass.bytes.toString('utf8')).elements || []);
    if (elements.length > MAX_OVERPASS_ELEMENTS) {
      outcomes[entity.effective_canonical_key] = 'infra_blocked';
      continue;
    }
    const exact = elements.filter((element) => {
      const names = osmNames(element.tags);
      return names.some((name) => queryNames.map(normalize).includes(normalize(name)));
    }).sort((left, right) => `${left.type}/${left.id}`.localeCompare(`${right.type}/${right.id}`));
    for (const element of exact) {
      const names = osmNames(element.tags);
      const matched = names.find((name) => queryNames.map(normalize).includes(normalize(name))) || '';
      const kind = osmSemanticKind(element, proposal, matched);
      observations.push({
        effective_canonical_key: entity.effective_canonical_key,
        observation_id: `osm:${element.type}:${element.id}`,
        source_id: 'osm', source_family: 'osm', dependency_cluster_id: `osm:${element.type}:${element.id}`,
        request_ids: [`overpass:${entity.effective_canonical_key}`], matched_name: matched,
        semantic_kind: kind, semantic_target_name: kind === 'independent_peak' ? safeTarget(matched) : null,
        supports_representative_highpoint: false,
        evidence_quality: kind ? 'reference' : 'diagnostic',
        excluded_reason: kind ? null : 'OSM element type does not establish the product semantic',
        osm_type: element.type, osm_id: element.id, osm_version: element.version || null, osm_timestamp: element.timestamp || null,
        osm_tags: element.tags || {}, coordinate: osmCoordinate(element),
      });
    }
    if (outcomes[entity.effective_canonical_key] === 'complete' && exact.length === 0) outcomes[entity.effective_canonical_key] = 'true_not_found';
  }
  return { observations, outcomes };
}

async function collectOfficial(candidates, context) {
  const outcomes = {};
  const observations = [];
  for (const candidate of candidates.sort((left, right) => asciiCompare(left.entity.effective_canonical_key, right.entity.effective_canonical_key) || asciiCompare(left.url, right.url))) {
    const { entity, observation, url } = candidate;
    outcomes[entity.effective_canonical_key] ||= 'not_attempted';
    const response = await fetchCaptured({
      sourceId: 'official', requestId: `official:${entity.effective_canonical_key}:${sha256(Buffer.from(url)).slice(0, 12)}`,
      url, context,
    });
    if (!response.ok) continue;
    const text = response.bytes.toString('utf8');
    const target = safeTarget(observation.semantic_target_name);
    if (!text.includes(entity.primary_name) || (target && !text.includes(target))) continue;
    outcomes[entity.effective_canonical_key] = 'complete';
    observations.push({
      ...observation,
      observation_id: `official:${sha256(Buffer.from(url)).slice(0, 16)}`,
      source_id: 'official', source_family: 'official', dependency_cluster_id: `official:${sha256(response.bytes)}`,
      request_ids: [`official:${entity.effective_canonical_key}:${sha256(Buffer.from(url)).slice(0, 12)}`],
      evidence_quality: 'reference',
      provenance_url: url,
    });
  }
  return { observations, outcomes };
}

async function preflight(context, requestPrefix = 'preflight') {
  const checks = {};
  const requestId = (name) => `${requestPrefix}:${name}`;
  const overpassBody = new URLSearchParams({ data: '[out:json][timeout:90];node["natural"="peak"]["name"~"^华山$"];out meta;' }).toString();
  checks.wikidata_action = await fetchCaptured({
    sourceId: 'wikidata', requestId: requestId('wikidata-action'), url: ADAPTERS.wikidata_action.endpoint,
    params: { action: 'wbgetentities', format: 'json', ids: 'Q8502', origin: '*', props: 'info' },
    allowCache: false, cachePolicy: CACHE_POLICY.BYPASS, context,
  });
  checks.wdqs = await fetchCaptured({
    sourceId: 'wikidata', requestId: requestId('wdqs'), url: ADAPTERS.wdqs.endpoint,
    method: 'POST', body: new URLSearchParams({ query: 'SELECT (1 AS ?ok) WHERE {}', format: 'json' }).toString(),
    allowCache: false, cachePolicy: CACHE_POLICY.BYPASS, context,
  });
  checks.nominatim = await fetchCaptured({
    sourceId: 'nominatim', requestId: requestId('nominatim'), url: ADAPTERS.nominatim.endpoint,
    params: { format: 'jsonv2', limit: 1, q: '华山 陕西省' },
    allowCache: false, cachePolicy: CACHE_POLICY.BYPASS, context,
  });
  checks.overpass = await fetchCaptured({
    sourceId: 'overpass', requestId: requestId('overpass'), url: ADAPTERS.overpass.endpoint,
    method: 'POST', body: overpassBody, allowCache: false, cachePolicy: CACHE_POLICY.BYPASS, context,
  });
  assert(checks.wikidata_action.ok, `Wikidata Action API preflight failed: ${checks.wikidata_action.record.error || checks.wikidata_action.status}`);
  assert(checks.wdqs.ok, `WDQS preflight failed: ${checks.wdqs.record.error || checks.wdqs.status}`);
  assert(checks.nominatim.ok, `Nominatim preflight failed: ${checks.nominatim.record.error || checks.nominatim.status}`);
  assert(checks.overpass.ok, `Overpass preflight failed: ${checks.overpass.record.error || checks.overpass.status}`);
  const overpassPayload = JSON.parse(checks.overpass.bytes.toString('utf8'));
  assert(overpassPayload.generator && overpassPayload.osm3s?.timestamp_osm_base && /ODbL|openstreetmap/iu.test(overpassPayload.osm3s?.copyright || ''), 'Overpass preflight lacks metadata or attribution');
  return Object.fromEntries(Object.entries(checks).map(([name, result]) => [name, {
    cache_hit: result.record.cache_hit,
    endpoint: result.record.url,
    failure_kind: result.failure_kind || null,
    http_status: result.status,
    ok: result.ok,
    request_id: result.record.request_id,
    retrieved_at: result.record.retrieved_at,
    ...(name === 'overpass' ? {
      generator: overpassPayload.generator,
      odbl_attribution: overpassPayload.osm3s?.copyright || null,
      osm_base: overpassPayload.osm3s?.timestamp_osm_base || null,
    } : {}),
  }]));
}

async function assertRequestCasClosure(packageDir, requests) {
  for (const request of requests) {
    if (!request.response_body_sha256) continue;
    assert(request.response_cas_path, `request has a response hash but no CAS path: ${request.request_id}`);
    const bytes = await readFile(join(packageDir, request.response_cas_path));
    assert(sha256(bytes) === request.response_body_sha256, `CAS hash mismatch: ${request.request_id}`);
  }
}

function terminalRequestRecords(records) {
  const byRequestId = new Map();
  for (const record of records) byRequestId.set(record.request_id, record);
  return [...byRequestId.values()].sort((left, right) => asciiCompare(left.request_id, right.request_id));
}

async function archivePreflightLatest(rootDir, runId) {
  const latestDir = join(rootDir, EVIDENCE_ROOT, 'preflight-live', 'latest');
  if (!(await directoryExists(latestDir))) return null;
  const previousManifest = JSON.parse(await readFile(join(latestDir, 'source-manifest.json'), 'utf8'));
  const archiveDir = join(rootDir, EVIDENCE_ROOT, 'attempts', `preflight-live-superseded-${previousManifest.run_id || runId}`);
  assert(!(await directoryExists(archiveDir)), `preflight latest archive collision: ${archiveDir}`);
  const stageDir = await mkdtemp(join(dirname(archiveDir), '.preflight-archive-stage-'));
  try {
    await copyDirectory(latestDir, stageDir);
    await atomicReplaceDirectory(stageDir, archiveDir);
    return archiveDir;
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  }
}

export async function preflightLive(rootDir = MODULE_ROOT, { fetchImpl = globalThis.fetch, verifyBaselines = true } = {}) {
  if (verifyBaselines) await verifyRound3BBaselines(rootDir);
  const parentDir = join(rootDir, EVIDENCE_ROOT, 'preflight-live');
  await mkdir(parentDir, { recursive: true });
  const stageDir = await mkdtemp(join(parentDir, '.latest-stage-'));
  const runId = createRunId('preflight-live', stageDir);
  let context = null;
  const runs = [];
  let failedPhase = 'initializing';
  try {
    context = await createEvidenceContext(stageDir, await loadResumeCache(rootDir), { fetchImpl });
    for (let index = 1; index <= 3; index += 1) {
      failedPhase = `preflight_run_${index}`;
      const before = context.requests.length;
      const checks = await preflight(context, `preflight:run-${index}`);
      const networkRecords = context.requests.slice(before);
      const records = terminalRequestRecords(networkRecords);
      assert(records.length === 4, `preflight run ${index} logical request count mismatch: ${records.length}`);
      assert(networkRecords.every((record) => record.cache_hit === false), `preflight run ${index} read a cache entry`);
      assert(records.every((record) => record.http_status === 200), `preflight run ${index} has a non-200 terminal response`);
      assert(records.every((record) => Boolean(record.retrieved_at)), `preflight run ${index} has no terminal retrieved_at`);
      runs.push({ checks, networkRecords, records });
    }
    const requests = context.requests.sort((left, right) => asciiCompare(left.request_id, right.request_id) || left.attempt - right.attempt);
    const logicalRequests = terminalRequestRecords(requests);
    assert(logicalRequests.length === 12, `preflight-live logical request closure mismatch: ${logicalRequests.length}`);
    assert(logicalRequests.every((record) => record.http_status === 200 && record.cache_hit === false && record.retrieved_at), 'preflight-live terminal records must all be fresh HTTP 200');
    await assertRequestCasClosure(stageDir, requests);
    const manifest = {
      adapter_version: EVIDENCE_ADAPTER_VERSION,
      adapters: ADAPTERS,
      frozen_inputs: FROZEN_INPUTS,
      requests,
      run_id: runId,
      schema_version: 1,
      scope: 'preflight_live',
    };
    const summary = {
      cache_hit_count: 0,
      endpoint: ADAPTERS.overpass.endpoint,
      network_attempt_count: requests.length,
      request_count: logicalRequests.length,
      run_id: runId,
      runs: runs.map(({ checks, networkRecords, records }) => ({
        checks,
        network_attempt_count: networkRecords.length,
        request_ids: records.map((record) => record.request_id).sort(asciiCompare),
      })),
      schema_version: 1,
    };
    await writeFileSynced(join(stageDir, 'source-manifest.json'), stableJson(manifest));
    await writeFileSynced(join(stageDir, 'preflight-summary.json'), stableJson(summary));
    const archivedLatest = await archivePreflightLatest(rootDir, runId);
    await atomicReplaceDirectory(stageDir, join(parentDir, 'latest'));
    return { ...summary, archived_previous_latest: archivedLatest, latest_dir: join(parentDir, 'latest') };
  } catch (error) {
    const attemptDir = join(rootDir, EVIDENCE_ROOT, 'attempts', `preflight-live-failure-${runId}`);
    await mkdir(dirname(attemptDir), { recursive: true });
    const requests = context?.requests || [];
    await writeFileSynced(join(stageDir, 'attempt-manifest.json'), stableJson({
      adapter_version: EVIDENCE_ADAPTER_VERSION,
      candidate_keys: [],
      error_message: String(error?.message || error),
      error_name: error?.name || 'Error',
      failed_phase: failedPhase,
      frozen_inputs: FROZEN_INPUTS,
      preflight: runs.map((run) => run.checks),
      requests: requests.sort((left, right) => asciiCompare(left.request_id, right.request_id)),
      run_id: runId,
      schema_version: 1,
      scope: 'preflight_live',
    }));
    await writeFileSynced(join(stageDir, 'attempt-summary.json'), stableJson({ request_count: requests.length, run_id: runId, status: 'failed' }));
    try { await rename(stageDir, attemptDir); } catch { await rm(stageDir, { recursive: true, force: true }); }
    throw error;
  }
}

function parseAdversarialPilotKeys(markdown) {
  return markdown.split('\n')
    .filter((line) => /^\| [a-z0-9]/u.test(line))
    .map((line) => line.split('|')[1].trim())
    .filter(Boolean);
}

async function loadInputs(rootDir) {
  const paths = {
    effective: join(rootDir, EFFECTIVE_PATH),
    semantics: join(rootDir, SEMANTICS_PATH),
    proposals: join(rootDir, PROPOSALS_PATH),
    summary: join(rootDir, ROUND3A_SUMMARY_PATH),
    coordinateManifest: join(rootDir, COORDINATE_MANIFEST_PATH),
  };
  const bytes = await Promise.all(Object.values(paths).map((path) => readFile(path)));
  const [effectiveBytes, semanticsBytes, proposalsBytes, summaryBytes, coordinateManifestBytes] = bytes;
  assert(sha256(effectiveBytes) === FROZEN_INPUTS.effective_canonicals_sha256, 'effective ledger frozen SHA drift');
  assert(sha256(semanticsBytes) === FROZEN_INPUTS.entity_semantics_sha256, 'entity semantics frozen SHA drift');
  assert(sha256(proposalsBytes) === FROZEN_INPUTS.semantic_proposals_sha256, 'semantic proposals frozen SHA drift');
  assert(sha256(summaryBytes) === FROZEN_INPUTS.round3a_summary_sha256, 'Round 3A summary frozen SHA drift');
  assert(sha256(coordinateManifestBytes) === FROZEN_INPUTS.coordinate_source_manifest_sha256, 'coordinate source manifest frozen SHA drift');
  const effective = parseJsonl(effectiveBytes.toString('utf8'));
  const semantics = parseJsonl(semanticsBytes.toString('utf8'));
  const proposals = parseJsonl(proposalsBytes.toString('utf8'));
  const summary = JSON.parse(summaryBytes.toString('utf8'));
  assert(effective.length === 359 && new Set(effective.map((row) => row.effective_canonical_key)).size === 359, 'effective entity closure mismatch');
  assert(semantics.length === 359 && new Set(semantics.map((row) => row.effective_canonical_key)).size === 359, 'entity semantics closure mismatch');
  assert(proposals.length === 273 && new Set(proposals.map((row) => row.effective_canonical_key)).size === 273, 'Round 3A proposal closure mismatch');
  assert(summary.status === 'candidate_only_not_applied', 'Round 3A summary must remain candidate only');
  const effectiveByKey = new Map(effective.map((row) => [row.effective_canonical_key, row]));
  const semanticsByKey = new Map(semantics.map((row) => [row.effective_canonical_key, row]));
  const proposalByKey = new Map(proposals.map((row) => [row.effective_canonical_key, row]));
  const reviewKeys = semantics.filter((row) => row.semantic_status === 'needs_review').map((row) => row.effective_canonical_key).sort(asciiCompare);
  assert(JSON.stringify(reviewKeys) === JSON.stringify([...proposalByKey.keys()].sort(asciiCompare)), 'Round 3A key set differs from semantics needs_review');
  const pilotMarkdown = await readFile(join(rootDir, 'entity-semantics-review/adversarial-sample.md'), 'utf8');
  const pilotKeys = parseAdversarialPilotKeys(pilotMarkdown);
  assert(pilotKeys.length === 40 && new Set(pilotKeys).size === 40, 'Round 3A adversarial pilot must contain exactly 40 unique keys');
  assert(pilotKeys.every((key) => proposalByKey.has(key)), 'adversarial pilot key absent from proposal set');
  return { effectiveByKey, pilotKeys, proposalByKey, proposals, semanticsByKey };
}

export async function verifyFrozenInputs(rootDir = MODULE_ROOT) {
  const inputs = await loadInputs(rootDir);
  return {
    needs_review_count: inputs.proposals.length,
    proposal_count: inputs.proposals.length,
    summary_status: 'candidate_only_not_applied',
  };
}

async function atomicReplaceDirectory(stageDir, targetDir) {
  const backupDir = `${targetDir}.backup-${process.pid}`;
  let backedUp = false;
  try {
    try { await rename(targetDir, backupDir); backedUp = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(stageDir, targetDir);
    if (backedUp) await rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    try { await rm(stageDir, { recursive: true, force: true }); } catch {}
    if (backedUp) {
      try { await rename(backupDir, targetDir); } catch {}
    }
    throw error;
  }
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => asciiCompare(left.name, right.name))) {
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) await copyDirectory(source, target);
    else if (entry.isFile()) await copyFile(source, target);
    else throw new Error(`unsupported archive entry: ${source}`);
  }
}

async function digestDirectory(directory, baseDir = directory) {
  const digests = {};
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => asciiCompare(left.name, right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(digests, await digestDirectory(path, baseDir));
    else if (entry.isFile()) digests[relative(baseDir, path)] = sha256(await readFile(path));
    else throw new Error(`unsupported archive digest entry: ${path}`);
  }
  return stableObject(digests);
}

export async function archiveFullInfraBlockedPackage(rootDir = MODULE_ROOT) {
  const fullDir = join(rootDir, EVIDENCE_ROOT, 'full');
  const archiveDir = join(rootDir, EVIDENCE_ROOT, ROUND3B_R2_ARCHIVE_DIR);
  await assertSha(join(fullDir, 'source-manifest.json'), FULL_R1_MANIFEST_SHA256, 'Round 3B R1 full manifest');
  assert(!(await directoryExists(archiveDir)), `R2 full archive already exists: ${archiveDir}`);
  await mkdir(dirname(archiveDir), { recursive: true });
  const stageDir = await mkdtemp(join(dirname(archiveDir), '.round3b-r2-archive-stage-'));
  try {
    await copyDirectory(fullDir, stageDir);
    const files = await digestDirectory(stageDir);
    await writeFile(join(stageDir, 'baseline-sha256.json'), stableJson({
      archived_from: 'entity-semantics-evidence/full',
      archived_source_manifest_sha256: FULL_R1_MANIFEST_SHA256,
      files,
      schema_version: 1,
    }));
    await atomicReplaceDirectory(stageDir, archiveDir);
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  }
  const baseline = JSON.parse(await readFile(join(archiveDir, 'baseline-sha256.json'), 'utf8'));
  const actual = await digestDirectory(archiveDir);
  delete actual['baseline-sha256.json'];
  assert(JSON.stringify(actual) === JSON.stringify(baseline.files), 'R2 full archive baseline mismatch');
  await assertSha(join(archiveDir, 'source-manifest.json'), FULL_R1_MANIFEST_SHA256, 'R2 archived full manifest');
  return {
    archive_dir: archiveDir,
    archived_file_count: Object.keys(baseline.files).length,
    source_manifest_sha256: FULL_R1_MANIFEST_SHA256,
  };
}

async function writeBaseline(target, sourceDir, files, manifest) {
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  if (await exists(join(target, 'baseline-sha256.json'))) return;
  const stage = await mkdtemp(join(parent, '.baseline-stage-'));
  try {
    for (const name of files) await copyFile(join(sourceDir, name), join(stage, name));
    await writeFile(join(stage, 'baseline-sha256.json'), stableJson(manifest));
    await atomicReplaceDirectory(stage, target);
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

async function verifyBaselineDirectory(target, expectedFiles, expectedManifest) {
  const found = (await readdir(target)).sort(asciiCompare);
  const expectedNames = [...Object.keys(expectedFiles), 'baseline-sha256.json'].sort(asciiCompare);
  assert(JSON.stringify(found) === JSON.stringify(expectedNames), `baseline directory mismatch: ${target}`);
  const manifest = await readFile(join(target, 'baseline-sha256.json'), 'utf8');
  assert(manifest === stableJson(expectedManifest), `baseline manifest mismatch: ${target}`);
  for (const [name, hash] of Object.entries(expectedFiles)) await assertSha(join(target, name), hash, `baseline ${name}`);
}

export async function freezeRound3BBaselines(rootDir = MODULE_ROOT) {
  await verifyFrozenInputs(rootDir);
  for (const [path, hash] of Object.entries(ROUND2E_HARDENING_SOURCES)) await assertSha(join(rootDir, path), hash, path);
  for (const [name, hash] of Object.entries(ROUND2E_OUTPUTS)) await assertSha(join(rootDir, COORDINATE_PILOT_DIR, name), hash, `Round 2E pilot ${name}`);
  for (const [name, hash] of Object.entries(ROUND3A_OUTPUTS)) await assertSha(join(rootDir, 'entity-semantics-review', name), hash, `Round 3A ${name}`);
  const round2Manifest = {
    baseline: 'round2e-hardening', classifier_sources: ROUND2E_HARDENING_SOURCES,
    deterministic_outputs: ROUND2E_OUTPUTS, frozen_inputs: FROZEN_INPUTS, schema_version: 1,
  };
  const round3Manifest = {
    baseline: 'round3a-semantic-proposal-package', deterministic_outputs: ROUND3A_OUTPUTS,
    frozen_inputs: FROZEN_INPUTS, schema_version: 1,
  };
  await writeBaseline(join(rootDir, ROUND2E_BASELINE_DIR), join(rootDir, COORDINATE_PILOT_DIR), Object.keys(ROUND2E_OUTPUTS), round2Manifest);
  await writeBaseline(join(rootDir, ROUND3A_BASELINE_DIR), join(rootDir, 'entity-semantics-review'), Object.keys(ROUND3A_OUTPUTS), round3Manifest);
  await verifyBaselineDirectory(join(rootDir, ROUND2E_BASELINE_DIR), ROUND2E_OUTPUTS, round2Manifest);
  await verifyBaselineDirectory(join(rootDir, ROUND3A_BASELINE_DIR), ROUND3A_OUTPUTS, round3Manifest);
  return { round2e_output_count: 10, round3a_output_count: 6 };
}

async function verifyRound3BBaselines(rootDir) {
  await freezeRound3BBaselines(rootDir);
  for (const [path, hash] of Object.entries(ROUND2E_HARDENING_SOURCES)) await assertSha(join(rootDir, path), hash, path);
  for (const [name, hash] of Object.entries(ROUND2E_OUTPUTS)) await assertSha(join(rootDir, COORDINATE_PILOT_DIR, name), hash, `Round 2E pilot ${name}`);
  for (const [name, hash] of Object.entries(ROUND3A_OUTPUTS)) await assertSha(join(rootDir, 'entity-semantics-review', name), hash, `Round 3A ${name}`);
}

export async function loadResumeCache(rootDir) {
  const cache = new Map();
  const stats = {
    full_preflight_success_excluded_count: 0,
    full_reusable_success_key_count: 0,
    full_successful_response_record_count: 0,
    preflight_success_excluded_count: 0,
    reusable_attempt_success_key_count: 0,
    reusable_success_key_count: 0,
    successful_response_record_count: 0,
  };

  async function addSuccessfulResponse(packageDir, record, origin, originKind) {
    assert(record.cache_key, `successful response has no cache key: ${origin}/${record.request_id}`);
    assert(record.response_body_sha256, `successful response has no body hash: ${origin}/${record.request_id}`);
    assert(record.response_cas_path, `successful response has no CAS path: ${origin}/${record.request_id}`);
    const snapshotPath = join(packageDir, record.response_cas_path);
    assert(await exists(snapshotPath), `successful response CAS missing: ${origin}/${record.request_id}`);
    const bytes = await readFile(snapshotPath);
    assert(sha256(bytes) === record.response_body_sha256, `successful response CAS hash mismatch: ${origin}/${record.request_id}`);
    const existing = cache.get(record.cache_key);
    if (existing) {
      assert(existing.record.response_body_sha256 === record.response_body_sha256,
        `conflicting cached bodies for cache key ${record.cache_key}: ${existing.origin} vs ${origin}`);
      return false;
    }
    cache.set(record.cache_key, {
      bytes,
      origin: `${origin}/${record.response_cas_path}`,
      origin_kind: originKind,
      record,
    });
    return true;
  }

  async function loadPublishedPackage(scope) {
    const packageDir = join(rootDir, EVIDENCE_ROOT, scope);
    const manifestPath = join(packageDir, 'source-manifest.json');
    if (!(await exists(manifestPath))) return;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const record of manifest.requests || []) {
      if (!record.cache_key || !record.response_body_sha256 || !(record.http_status >= 200 && record.http_status < 300)) continue;
      stats.successful_response_record_count += 1;
      if (scope === 'full') stats.full_successful_response_record_count += 1;
      if (isPreflightRequest(record.request_id)) {
        stats.preflight_success_excluded_count += 1;
        if (scope === 'full') stats.full_preflight_success_excluded_count += 1;
        continue;
      }
      await addSuccessfulResponse(packageDir, record, scope, scope === 'full' ? 'baseline_full' : 'published');
    }
  }

  for (const scope of ['pilot', 'full']) await loadPublishedPackage(scope);

  const attemptsRoot = join(rootDir, EVIDENCE_ROOT, 'attempts');
  if (await directoryExists(attemptsRoot)) {
    const attemptNames = (await readdir(attemptsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(asciiCompare);
    for (const name of attemptNames) {
      const attemptDir = join(attemptsRoot, name);
      const manifestPath = join(attemptDir, 'attempt-manifest.json');
      if (!(await exists(manifestPath))) continue;
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.scope === 'preflight_live') continue;
      assert(manifest.schema_version === 1, `attempt manifest schema mismatch: ${name}`);
      assert(manifest.adapter_version === EVIDENCE_ADAPTER_VERSION, `attempt adapter version mismatch: ${name}`);
      assert(['pilot', 'full'].includes(manifest.scope), `attempt scope mismatch: ${name}`);
      for (const [field, expected] of Object.entries(FROZEN_INPUTS)) {
        assert(manifest.frozen_inputs?.[field] === expected, `attempt frozen input mismatch: ${name}/${field}`);
      }
      assert(Array.isArray(manifest.candidate_keys) && new Set(manifest.candidate_keys).size === manifest.candidate_keys.length,
        `attempt candidate key closure mismatch: ${name}`);
      for (const record of manifest.requests || []) {
        if (isPreflightRequest(record.request_id)) continue;
        if (!(record.http_status >= 200 && record.http_status < 300)) continue;
        const added = await addSuccessfulResponse(attemptDir, record, `attempts/${name}`, 'attempt');
        if (added) stats.reusable_attempt_success_key_count += 1;
      }
    }
  }

  stats.reusable_success_key_count = cache.size;
  const fullManifest = JSON.parse(await readFile(join(rootDir, EVIDENCE_ROOT, 'full/source-manifest.json'), 'utf8'));
  stats.full_reusable_success_key_count = new Set((fullManifest.requests || [])
    .filter((record) => record.cache_key
      && record.response_body_sha256
      && record.http_status >= 200
      && record.http_status < 300
      && !isPreflightRequest(record.request_id))
    .map((record) => record.cache_key)).size;
  cache.stats = stats;
  return cache;
}

function cacheRecoverySummary(context) {
  const reusedSuccessCacheKeyCount = context.cacheStats.cache_hit_keys.size;
  const reusableAttemptSuccessKeyCount = context.cacheStats.resume.reusable_attempt_success_key_count;
  const baselineFullSuccessKeyCount = context.cacheStats.resume.full_reusable_success_key_count;
  return stableObject({
    baseline_full_success_keys: baselineFullSuccessKeyCount,
    baseline_full_preflight_success_count: context.cacheStats.resume.full_preflight_success_excluded_count,
    baseline_full_success_response_count: context.cacheStats.resume.full_successful_response_record_count,
    cache_hit_request_count: context.cacheStats.cache_hit_request_count,
    eligible_resume_success_key_count: context.cacheStats.resume.reusable_success_key_count,
    network_revisit_of_success_cache_key_count: context.cacheStats.network_revisit_of_success_cache_key_count,
    network_request_count: context.cacheStats.network_request_count,
    preflight_success_excluded_count: context.cacheStats.resume.full_preflight_success_excluded_count,
    reusable_attempt_success_keys: reusableAttemptSuccessKeyCount,
    reused_attempt_success_keys: context.cacheStats.reused_attempt_success_keys.size,
    reused_baseline_full_success_keys: context.cacheStats.reused_baseline_full_success_keys.size,
    reused_success_keys: reusedSuccessCacheKeyCount,
    reused_success_cache_key_count: reusedSuccessCacheKeyCount,
    unused_success_keys: Math.max(0, context.cacheStats.resume.reusable_success_key_count - reusedSuccessCacheKeyCount),
    unused_success_cache_key_count: Math.max(0, context.cacheStats.resume.reusable_success_key_count - reusedSuccessCacheKeyCount),
  });
}

function assertFullCacheRecovery(summary) {
  assert(summary.baseline_full_success_response_count === FULL_R1_SUCCESS_RESPONSE_COUNT,
    `Full baseline success-response count drift: ${summary.baseline_full_success_response_count}`);
  assert(summary.baseline_full_preflight_success_count === FULL_R1_PREFLIGHT_SUCCESS_COUNT,
    `Full baseline preflight-success count drift: ${summary.baseline_full_preflight_success_count}`);
  assert(summary.baseline_full_success_keys === FULL_R1_RESUMABLE_SUCCESS_KEY_COUNT,
    `Full baseline resumable success-key count drift: ${summary.baseline_full_success_keys}`);
  assert(summary.network_revisit_of_success_cache_key_count === 0,
    `Full recovery reissued cached fact requests: ${summary.network_revisit_of_success_cache_key_count}`);
}

function requestIndex(requests) {
  return new Set(requests.map((request) => request.request_id));
}

function manifestOutcomes(subjects, outcomes) {
  return Object.fromEntries(subjects.map(({ entity }) => [entity.effective_canonical_key, stableObject({
    official: outcomes.official[entity.effective_canonical_key] || 'not_attempted',
    osm: outcomes.osm[entity.effective_canonical_key] || 'source_unavailable',
    wikimedia: outcomes.wikimedia[entity.effective_canonical_key] || 'source_unavailable',
  })]));
}

function successfulResponses(requests) {
  return requests
    .filter((record) => record.http_status >= 200 && record.http_status < 300 && record.response_body_sha256)
    .map((record) => ({
      cache_key: record.cache_key,
      http_status: record.http_status,
      request_id: record.request_id,
      response_body_sha256: record.response_body_sha256,
      response_cas_path: record.response_cas_path,
    }))
    .sort((left, right) => asciiCompare(left.request_id, right.request_id));
}

export async function writeFailureAttempt({
  candidateKeys,
  context,
  error,
  failedPhase,
  preflightChecks,
  runId,
  scope,
  stageDir,
}) {
  const requests = [...(context?.requests || [])].sort((left, right) => asciiCompare(left.request_id, right.request_id));
  const attemptManifest = {
    adapter_version: EVIDENCE_ADAPTER_VERSION,
    adapters: ADAPTERS,
    cache_recovery: context ? cacheRecoverySummary(context) : null,
    candidate_keys: [...candidateKeys].sort(asciiCompare),
    error_message: String(error?.message || error),
    error_name: error?.name || 'Error',
    failed_phase: failedPhase,
    frozen_inputs: FROZEN_INPUTS,
    preflight: preflightChecks || null,
    requests,
    run_id: runId,
    schema_version: 1,
    scope,
    successful_responses: successfulResponses(requests),
  };
  const attemptSummary = {
    cache_recovery: attemptManifest.cache_recovery,
    failed_phase: failedPhase,
    request_count: requests.length,
    run_id: runId,
    schema_version: 1,
    status: 'collection_failed_before_publication',
    successful_response_count: attemptManifest.successful_responses.length,
  };
  await writeFileSynced(join(stageDir, 'attempt-manifest.json'), stableJson(attemptManifest));
  await writeFileSynced(join(stageDir, 'attempt-summary.json'), stableJson(attemptSummary));
  await assertRequestCasClosure(stageDir, attemptManifest.successful_responses);
  return { attemptManifest, attemptSummary };
}

export async function collectScope(rootDir, scope) {
  const targetDir = join(rootDir, EVIDENCE_ROOT, scope);
  const stageParent = join(rootDir, EVIDENCE_ROOT);
  await mkdir(stageParent, { recursive: true });
  const stageDir = await mkdtemp(join(stageParent, `.${scope}-stage-`));
  const runId = createRunId(scope, stageDir);
  let context = null;
  let keys = [];
  let preflightChecks = null;
  let failedPhase = 'load_inputs';
  try {
    const inputs = await loadInputs(rootDir);
    failedPhase = 'verify_baselines';
    await verifyRound3BBaselines(rootDir);
    keys = scope === 'pilot' ? inputs.pilotKeys : inputs.proposals.map((proposal) => proposal.effective_canonical_key).sort(asciiCompare);
    assert(keys.length === (scope === 'pilot' ? 40 : 273), `${scope} key closure mismatch`);
    const subjects = keys.map((key) => {
      const entity = inputs.effectiveByKey.get(key);
      const proposal = inputs.proposalByKey.get(key);
      assert(entity && proposal, `${scope} subject missing ${key}`);
      return { entity, proposal, semantics: inputs.semanticsByKey.get(key) };
    });
    failedPhase = 'load_resume_cache';
    context = await createEvidenceContext(stageDir, await loadResumeCache(rootDir));
    failedPhase = 'preflight';
    preflightChecks = await preflight(context);
    failedPhase = 'collect_wikimedia';
    const wikimedia = await collectWikimedia(subjects, context);
    failedPhase = 'collect_osm';
    const osm = await collectOsm(subjects, context);
    failedPhase = 'collect_official';
    const official = await collectOfficial(wikimedia.officialCandidates, context);
    failedPhase = 'write_published_manifest';
    const observations = [...wikimedia.observations, ...osm.observations, ...official.observations]
      .map((row) => ({ ...row, request_ids: unique(row.request_ids || []) }))
      .sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key) || asciiCompare(left.observation_id, right.observation_id));
    const outcomes = { official: official.outcomes, osm: osm.outcomes, wikimedia: wikimedia.outcomes };
    const manifest = {
      schema_version: 1,
      adapter_version: EVIDENCE_ADAPTER_VERSION,
      adapters: ADAPTERS,
      candidate_keys: keys,
      cache_recovery: cacheRecoverySummary(context),
      frozen_inputs: FROZEN_INPUTS,
      entity_outcomes: manifestOutcomes(subjects, outcomes),
      preflight: preflightChecks,
      requests: context.requests.sort((left, right) => asciiCompare(left.request_id, right.request_id)),
      scope,
    };
    await writeFileSynced(join(stageDir, 'source-manifest.json'), stableJson(manifest));
    await writeFileSynced(join(stageDir, 'observations.jsonl'), jsonl(observations));
    await atomicReplaceDirectory(stageDir, targetDir);
    return { observation_count: observations.length, request_count: manifest.requests.length, scope, subject_count: subjects.length };
  } catch (error) {
    const attemptDir = join(rootDir, EVIDENCE_ROOT, 'attempts', `${scope}-failure-${runId}`);
    await mkdir(dirname(attemptDir), { recursive: true });
    assert(!(await directoryExists(attemptDir)), `attempt directory collision: ${attemptDir}`);
    try {
      await writeFailureAttempt({
        candidateKeys: keys,
        context,
        error,
        failedPhase,
        preflightChecks,
        runId,
        scope,
        stageDir,
      });
      await rename(stageDir, attemptDir);
    } catch (attemptError) {
      throw new Error(`failed to persist ${scope} attempt after ${failedPhase}: ${attemptError.message}; original error: ${error.message}`);
    }
    throw error;
  }
}

function fullRequestClosure(packageDir, manifest, observations) {
  const requests = requestIndex(manifest.requests || []);
  for (const observation of observations) {
    assert(observation.request_ids.every((id) => requests.has(id)), `observation request closure fails: ${observation.observation_id}`);
  }
  return Promise.all((manifest.requests || []).map(async (request) => {
    if (!request.response_body_sha256) return;
    const bytes = await readFile(join(packageDir, request.response_cas_path));
    assert(sha256(bytes) === request.response_body_sha256, `CAS hash mismatch: ${request.request_id}`);
  }));
}

export function validateEvidenceManifest(manifest) {
  assert(manifest.schema_version === 1, 'manifest schema version mismatch');
  assert(manifest.adapter_version === EVIDENCE_ADAPTER_VERSION, 'manifest adapter version mismatch');
  for (const [name, expected] of Object.entries(FROZEN_INPUTS)) {
    assert(manifest.frozen_inputs?.[name] === expected, `manifest frozen input mismatch: ${name}`);
  }
  assert(manifest.adapters?.wikidata_action?.source_family === 'wikimedia', 'Wikidata source family mismatch');
  assert(manifest.adapters?.wdqs?.source_family === 'wikimedia', 'WDQS source family mismatch');
  assert(manifest.adapters?.nominatim?.source_family === 'osm', 'Nominatim source family mismatch');
  assert(manifest.adapters?.overpass?.source_family === 'osm', 'Overpass source family mismatch');
  assert(manifest.adapters?.official?.source_family === 'official', 'official source family mismatch');
  assert(['pilot', 'full'].includes(manifest.scope), 'manifest scope mismatch');
  assert(new Set(manifest.candidate_keys || []).size === manifest.candidate_keys?.length, 'manifest candidate key duplication');
  return true;
}

function groupByKey(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.effective_canonical_key) || [];
    current.push(row);
    grouped.set(row.effective_canonical_key, current);
  }
  return grouped;
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] || 0) + 1;
  }
  return stableObject(result);
}

function renderExceptions(reviews) {
  const exceptional = reviews.filter((row) => [EVIDENCE_STATUS.BLOCKED, EVIDENCE_STATUS.CONFLICT, EVIDENCE_STATUS.MISSING].includes(row.status));
  return [
    '# Round 3B Semantic Evidence Exceptions',
    '',
    'Candidate-only evidence package. Nothing in this file applies a formal semantic override.',
    '',
    '| Key | Status | Next action | Exclusion reasons |',
    '|---|---|---|---|',
    ...exceptional.map((row) => `| ${row.effective_canonical_key} | ${row.status} | ${row.recommended_next_action} | ${row.exclusion_reasons.join('; ') || '--'} |`),
    '',
  ].join('\n');
}

function renderProviderCoverage(manifest, reviews, observations) {
  const outcomes = Object.values(manifest.entity_outcomes || {});
  const bySource = ['wikimedia', 'osm', 'official'].map((source) => ({
    source,
    complete: outcomes.filter((row) => row[source] === 'complete').length,
    true_not_found: outcomes.filter((row) => row[source] === 'true_not_found').length,
    blocked: outcomes.filter((row) => row[source] === 'infra_blocked' || row[source] === 'source_unavailable').length,
  }));
  const highpoints = reviews.filter((row) => row.representative_highpoint_explicit_relation_count > 0).length;
  const intraFamilyConflictCount = reviews.reduce((total, row) => total + row.intra_family_conflict_count, 0);
  return [
    '# Round 3B Provider Coverage',
    '',
    `- Candidate closure: ${reviews.length}/${manifest.candidate_keys.length}`,
    `- Observations: ${observations.length}`,
    `- Explicit representative-highpoint relations: ${highpoints}`,
    `- Intra-family semantic conflicts: ${intraFamilyConflictCount}`,
    `- Statuses: \`${JSON.stringify(countBy(reviews, (row) => row.status))}\``,
    '',
    '| Source family | Complete | True not found | Blocked |',
    '|---|---:|---:|---:|',
    ...bySource.map((row) => `| ${row.source} | ${row.complete} | ${row.true_not_found} | ${row.blocked} |`),
    '',
    'Wikimedia and Chinese Wikipedia are one family. Nominatim, Overpass, and OSM-derived Wikidata claims are one OSM family. Official observations exist only after a programmatically fetched, recognised official-domain page contains the entity and explicit target text.',
    '',
  ].join('\n');
}

function gateSummary(manifest, reviews, inputs) {
  const candidateCount = manifest.candidate_keys.length;
  const blocked = reviews.filter((row) => row.status === EVIDENCE_STATUS.BLOCKED).length;
  const routeLeak = reviews.filter((row) => row.proposed_target_name && isRouteContextName(row.proposed_target_name)).length;
  const genericConfirm = reviews.filter((row) => row.status === EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS && isGenericHighpointName(row.proposed_target_name)).length;
  const duplicateVotes = reviews.reduce((total, row) => total + row.same_source_family_duplicate_vote_count, 0);
  const intraFamilyConflicts = reviews.reduce((total, row) => total + row.intra_family_conflict_count, 0);
  const seedOnlyFormal = reviews.filter((row) => row.seed_consistent_only && row.status === EVIDENCE_STATUS.TWO_FAMILY_CONSENSUS).length;
  const fixedCases = ['baiyun-shan-guangdong', 'taishan', 'huashan', 'siguniang-dafeng', 'siguniang-erfeng', 'siguniang-sanfeng', 'siguniang-yaomei-feng', 'qiaogeli-feng-k2', 'muztagata-feng'];
  const fixedMismatch = fixedCases.filter((key) => inputs.semanticsByKey.get(key)?.semantic_status !== 'confirmed').length;
  const statusCounts = countBy(reviews, (row) => row.status);
  const groupCounts = countBy(reviews.filter((row) => row.proposed_catalog_entity_kind), (row) => row.proposed_catalog_entity_kind);
  const explicitHighpoint = reviews.filter((row) => row.representative_highpoint_explicit_relation_count > 0).length;
  const gates = {
    blocked_rate: candidateCount ? blocked / candidateCount : 0,
    fixed_product_case_mismatch_count: fixedMismatch,
    generic_primary_summit_auto_confirm_count: genericConfirm,
    request_cas_closure_complete: true,
    route_context_exact_target_leak_count: routeLeak,
    same_source_family_duplicate_vote_count: duplicateVotes,
    seed_only_formal_confirmation_count: seedOnlyFormal,
  };
  return {
    candidate_count: candidateCount,
    evidence_status_counts: statusCounts,
    explicit_representative_highpoint_count: explicitHighpoint,
    intra_family_conflict_count: intraFamilyConflicts,
    gates,
    mountain_area_candidate_count: groupCounts.mountain_area || 0,
    independent_peak_candidate_count: groupCounts.independent_peak || 0,
    pass: gates.blocked_rate <= 0.15
      && gates.fixed_product_case_mismatch_count === 0
      && gates.route_context_exact_target_leak_count === 0
      && gates.same_source_family_duplicate_vote_count === 0
      && gates.generic_primary_summit_auto_confirm_count === 0
      && gates.seed_only_formal_confirmation_count === 0,
  };
}

async function buildScope(rootDir, scope) {
  const inputs = await loadInputs(rootDir);
  await verifyRound3BBaselines(rootDir);
  const packageDir = join(rootDir, EVIDENCE_ROOT, scope);
  const manifest = JSON.parse(await readFile(join(packageDir, 'source-manifest.json'), 'utf8'));
  validateEvidenceManifest(manifest);
  const observations = parseJsonl(await readFile(join(packageDir, 'observations.jsonl'), 'utf8'));
  await fullRequestClosure(packageDir, manifest, observations);
  const expectedCount = scope === 'pilot' ? 40 : 273;
  assert(manifest.candidate_keys.length === expectedCount, `${scope} manifest candidate count mismatch`);
  const byObservation = groupByKey(observations);
  const reviews = manifest.candidate_keys.map((key) => {
    const entity = inputs.effectiveByKey.get(key);
    const proposal = inputs.proposalByKey.get(key);
    assert(entity && proposal, `missing review input ${key}`);
    return buildEvidenceReview(entity, proposal, byObservation.get(key) || [], manifest.entity_outcomes[key]);
  }).sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key));
  assert(reviews.length === expectedCount && new Set(reviews.map((row) => row.effective_canonical_key)).size === expectedCount, `${scope} review closure mismatch`);
  const summary = {
    schema_version: 1,
    status: 'candidate_only_not_applied',
    scope,
    frozen_inputs: FROZEN_INPUTS,
    collection: gateSummary(manifest, reviews, inputs),
    observation_count: observations.length,
    request_count: manifest.requests.length,
    source_manifest_sha256: sha256(await readFile(join(packageDir, 'source-manifest.json'))),
  };
  if (manifest.cache_recovery) summary.cache_recovery = manifest.cache_recovery;
  const contents = {
    'semantic-evidence-review.jsonl': jsonl(reviews),
    'exceptions.md': `${renderExceptions(reviews)}\n`,
    'semantic-evidence-summary.json': stableJson(summary),
    'provider-coverage.md': `${renderProviderCoverage(manifest, reviews, observations)}\n`,
  };
  return { contents, manifest, observations, reviews, summary };
}

async function writeBuildFiles(packageDir, contents) {
  for (const [name, body] of Object.entries(contents)) await writeFile(join(packageDir, name), body);
}

async function checkScope(rootDir, scope) {
  const built = await buildScope(rootDir, scope);
  const packageDir = join(rootDir, EVIDENCE_ROOT, scope);
  for (const [name, body] of Object.entries(built.contents)) {
    assert(await readFile(join(packageDir, name), 'utf8') === body, `${scope} deterministic output differs: ${name}`);
  }
  return built.summary;
}

export function assertScopeGate(scope, summary) {
  if (scope === 'full' && summary?.cache_recovery) assertFullCacheRecovery(summary.cache_recovery);
  assert(summary?.collection?.pass === true,
    `Round 3B ${scope} gate failed: ${stableJson(summary?.collection?.gates || {})}`);
  return true;
}

async function gateScope(rootDir, scope) {
  const summary = await checkScope(rootDir, scope);
  assertScopeGate(scope, summary);
  return summary;
}

async function verifyScopeByteIdentical(rootDir, scope) {
  const left = await buildScope(rootDir, scope);
  const right = await buildScope(rootDir, scope);
  for (const name of Object.keys(left.contents)) assert(left.contents[name] === right.contents[name], `${scope} byte drift: ${name}`);
  return Object.keys(left.contents).sort(asciiCompare);
}

async function collectAndBuild(rootDir, scope) {
  const collected = await collectScope(rootDir, scope);
  const built = await buildScope(rootDir, scope);
  await writeBuildFiles(join(rootDir, EVIDENCE_ROOT, scope), built.contents);
  return { ...collected, summary: built.summary };
}

async function run(rootDir) {
  await freezeRound3BBaselines(rootDir);
  const pilot = await collectAndBuild(rootDir, 'pilot');
  await gateScope(rootDir, 'pilot');
  const full = await collectAndBuild(rootDir, 'full');
  await gateScope(rootDir, 'full');
  const byteIdentical = await verifyScopeByteIdentical(rootDir, 'full');
  return { byte_identical: byteIdentical, full: full.summary.collection, pilot: pilot.summary.collection };
}

async function main() {
  const command = process.argv[2] || 'run';
  if (command === 'archive-full-r2') console.log(JSON.stringify(await archiveFullInfraBlockedPackage(MODULE_ROOT), null, 2));
  else if (command === 'freeze-baselines') console.log(JSON.stringify(await freezeRound3BBaselines(MODULE_ROOT), null, 2));
  else if (command === 'preflight-live') console.log(JSON.stringify(await preflightLive(MODULE_ROOT), null, 2));
  else if (command === 'collect-pilot') console.log(JSON.stringify(await collectScope(MODULE_ROOT, 'pilot'), null, 2));
  else if (command === 'build-pilot') {
    const result = await buildScope(MODULE_ROOT, 'pilot');
    await writeBuildFiles(join(MODULE_ROOT, EVIDENCE_ROOT, 'pilot'), result.contents);
    console.log(JSON.stringify(result.summary, null, 2));
  } else if (command === 'check-pilot') console.log(JSON.stringify(await checkScope(MODULE_ROOT, 'pilot'), null, 2));
  else if (command === 'collect-full') console.log(JSON.stringify(await collectScope(MODULE_ROOT, 'full'), null, 2));
  else if (command === 'build-full') {
    const result = await buildScope(MODULE_ROOT, 'full');
    await writeBuildFiles(join(MODULE_ROOT, EVIDENCE_ROOT, 'full'), result.contents);
    console.log(JSON.stringify(result.summary, null, 2));
  } else if (command === 'check-full') console.log(JSON.stringify(await checkScope(MODULE_ROOT, 'full'), null, 2));
  else if (command === 'gate-full') console.log(JSON.stringify(await gateScope(MODULE_ROOT, 'full'), null, 2));
  else if (command === 'verify-byte-identical') console.log(JSON.stringify({ byte_identical: await verifyScopeByteIdentical(MODULE_ROOT, 'full') }, null, 2));
  else if (command === 'run') console.log(JSON.stringify(await run(MODULE_ROOT), null, 2));
  else throw new Error('usage: node collect-entity-semantics-evidence.mjs <archive-full-r2|freeze-baselines|preflight-live|collect-pilot|build-pilot|check-pilot|collect-full|build-full|check-full|gate-full|verify-byte-identical|run>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
