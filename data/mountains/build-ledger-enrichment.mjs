import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const EARTH_RADIUS_M = 6_371_008.8;
const GNS_MAX_CANDIDATE_SPREAD_M = 100_000;
const ENRICHMENT_SCHEMA_VERSION = 1;
const ENRICHMENT_OUTPUTS = Object.freeze([
  'ledger/effective-canonical-enrichment.jsonl',
  'ledger/enrichment-review.md',
]);
const FROZEN_INPUTS = Object.freeze({
  'ledger/effective_canonicals.jsonl': '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
  'ledger/entity-semantics.jsonl': '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
});

export const DIFFICULTY_MAP = Object.freeze({
  休闲观光级: 'beginner',
  轻装徒步入门级: 'intermediate',
  高海拔进阶级: 'advanced',
  专业技术攀登级: 'expert',
});

export const LICENSE_MAP = Object.freeze({
  beginner: 'none',
  intermediate: 'basic',
  advanced: 'intermediate',
  expert: 'advanced',
});

const DIFFICULTY_ORDER = ['beginner', 'intermediate', 'advanced', 'expert'];
const ROUTE_SEMANTIC_TOKENS = Object.freeze({
  round_trip: '往返',
  one_way: '单程',
  loop: '环线',
  traverse: '穿越',
});
const ROUTE_SEMANTIC_LABELS = Object.freeze({
  round_trip: '往返',
  one_way: '单程',
  loop: '环线',
  traverse: '穿越',
  unmarked: '路线语义待核',
});
const ROUTE_SEMANTIC_SELECTION_RANK = Object.freeze({
  loop: 0,
  round_trip: 0,
  traverse: 1,
  one_way: 2,
  unmarked: 3,
});
const ROUTE_TERRAIN_LABELS = Object.freeze({
  beginner: '石阶步道',
  intermediate: '山野土石',
  advanced: '高海拔徒步段',
  expert: '技术攀登段',
});
const RISK_NOTES = Object.freeze({
  beginner:
    '成熟景区步道，整体风险低。留意雨雪后台阶湿滑、旺季拥挤、山顶气温低于山下；按标识行进、量力而行。',
  intermediate:
    '成熟山野路线、新手友好但非铺装。留意碎石土路湿滑、岔路辨向、山区天气多变(防风保暖避雷雨)、预留下撤时间；建议结伴备水。',
  advanced:
    '高海拔路线含高反风险，需适应与体能储备。留意高原反应、剧烈天气、路线漫长易迷路；高海拔或技术型攀登通常需要专业向导、技术装备与相应审批，具体要求请向当地主管部门与专业机构确认。自然保护区核心区及未开发未开放区域禁止擅自进入。开放范围以当地最新公告为准。',
  expert:
    '技术型攀登含冰雪、岩壁与陡峭地形，风险极高，需成熟团队与完整技术能力。高海拔或技术型攀登通常需要专业向导、技术装备与相应审批，具体要求请向当地主管部门与专业机构确认。自然保护区核心区及未开发未开放区域禁止擅自进入。开放范围以当地最新公告为准。',
});
const LENGTH_PROVENANCE_NOTE =
  'seed distance library citing 8264/两步路; not per-mountain URL/track verified';
const ROUTE_DISCLAIMER =
  '本路线仅供参考，请结合现场情况、天气、专业地图、向导与自身能力综合判断。';
const AMBIGUOUS_MULTI_ROUTE_KEYS = new Set([
  'helan-shan',
  'huanggang-shan',
  'lue-shan',
  'wuling-shan',
  'yubeng-route',
  'yuzhu-feng',
]);
const HIGH_RISK_INTRO_BANNED_WORDS =
  /最友好|容易|轻松|入门|亲民|说走就走/u;
const INTRO_ACCESS_LANGUAGE = /许可|手续|申请制|备案|审批/u;
const ADDED_CLAIM_BASES = new Set(['source', 'safety_generic', 'needs_review']);
const ACCESS_STATUSES = new Set(['open', 'pilgrimage_only', 'closed', 'unknown']);
const CLOSED_BASES = new Set(['regulation', 'religious', 'both']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function asciiCompare(left, right) {
  return String(left).localeCompare(String(right), 'en');
}

function radians(value) {
  return value * Math.PI / 180;
}

export function distanceMeters(left, right) {
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const startLatitude = radians(left.latitude);
  const endLatitude = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function mapDifficulty(raw) {
  const literals = String(raw)
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
  assert(literals.length > 0, 'difficulty literal is empty');
  const mapped = literals.map((literal) => {
    const value = DIFFICULTY_MAP[literal];
    assert(value, `unknown difficulty literal: ${literal}`);
    return value;
  });
  return mapped.sort((left, right) =>
    DIFFICULTY_ORDER.indexOf(right) - DIFFICULTY_ORDER.indexOf(left))[0];
}

export function parseRouteSemantic(raw, hasExactLength) {
  if (!hasExactLength) return null;
  const matches = Object.entries(ROUTE_SEMANTIC_TOKENS)
    .filter(([, token]) => String(raw).includes(token))
    .map(([semantic]) => semantic);
  assert(matches.length <= 1, `multiple route semantics in raw literal: ${raw}`);
  return matches[0] || 'unmarked';
}

function routeLabelFromSegment(segment, semantic) {
  const withoutDistance = segment.replace(/\s*\d+(?:\.\d+)?\s*km\s*$/iu, '').trim();
  if (semantic === 'unmarked') return withoutDistance || '大本营→主峰';
  const token = ROUTE_SEMANTIC_TOKENS[semantic];
  const tokenIndex = withoutDistance.indexOf(token);
  assert(tokenIndex >= 0, `route semantic token missing from segment: ${segment}`);
  const before = withoutDistance.slice(0, tokenIndex).trim();
  const rawAfter = withoutDistance.slice(tokenIndex + token.length).trim();
  const after = rawAfter === '线' ? '' : rawAfter;
  let routeLabel = before && after ? `${before}→${after}` : `${before}${after}`;
  routeLabel = routeLabel
    .replace(/[：:]\s*$/u, '')
    .trim();
  return routeLabel || '大本营→主峰';
}

export function parseRouteCandidates(raw, sourceCandidateKey) {
  if (raw == null || String(raw).trim() === '') return [];
  return String(raw)
    .split(/[；;]/u)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((rawSegment) => {
      const distanceMatch = rawSegment.match(/(\d+(?:\.\d+)?)\s*km\s*$/iu);
      assert(distanceMatch, `route candidate has no terminal km literal: ${rawSegment}`);
      const semantic = parseRouteSemantic(rawSegment, true);
      return {
        route_label: routeLabelFromSegment(rawSegment, semantic),
        semantic,
        km: Number(distanceMatch[1]),
        raw_segment: rawSegment,
        source_candidate_keys: [sourceCandidateKey],
      };
    });
}

export function selectRepresentativeRoute(candidates) {
  if (candidates.length === 0) return null;
  const byIdentity = new Map();
  for (const candidate of candidates) {
    const identity = `${candidate.route_label}\u0000${candidate.semantic}\u0000${candidate.km}`;
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, {
        ...candidate,
        source_candidate_keys: [...candidate.source_candidate_keys].sort(asciiCompare),
      });
      continue;
    }
    existing.source_candidate_keys = [...new Set([
      ...existing.source_candidate_keys,
      ...candidate.source_candidate_keys,
    ])].sort(asciiCompare);
    if (asciiCompare(candidate.raw_segment, existing.raw_segment) < 0) {
      existing.raw_segment = candidate.raw_segment;
    }
  }
  return [...byIdentity.values()].sort((left, right) =>
    right.km - left.km
    || ROUTE_SEMANTIC_SELECTION_RANK[left.semantic]
      - ROUTE_SEMANTIC_SELECTION_RANK[right.semantic]
    || asciiCompare(left.route_label, right.route_label)
    || asciiCompare(left.source_candidate_keys.join('\u0000'), right.source_candidate_keys.join('\u0000')))[0];
}

function aspectForRoute(entity, candidate) {
  const sourceKeys = new Set(candidate.source_candidate_keys);
  const matchingRoute = entity.mountain_routes.find((route) =>
    route.source_candidate_keys.some((key) => sourceKeys.has(key)));
  return matchingRoute?.aspect ?? null;
}

function displayLabelForRoute(entity, candidate) {
  const sourceKeys = new Set(candidate.source_candidate_keys);
  const matchingRoute = entity.mountain_routes.find((route) =>
    route.source_candidate_keys.some((key) => sourceKeys.has(key)));
  return matchingRoute?.name
    || matchingClassicRoute(candidate, entity.classic_routes)
    || candidate.route_label;
}

function perRouteRecords(entity, candidates) {
  if (entity.effective_canonical_key === 'yubeng-route') {
    return [
      {
        route_label: '神瀑线',
        semantic: 'round_trip',
        km: null,
        aspect: null,
        source_candidate_keys: ['yubeng-route'],
        source_raws: ['西当村-雨崩村-神瀑-冰湖环线24km'],
        correction: '原组合环线语义撤回；冰湖线因未开发区域禁入通告不进入 effective 内容，仅保留神瀑往返线，距离待核',
      },
    ];
  }

  return candidates.map((candidate) => ({
    route_label: displayLabelForRoute(entity, candidate),
    semantic: candidate.semantic,
    km: candidate.km,
    aspect: aspectForRoute(entity, candidate),
    source_candidate_keys: [...candidate.source_candidate_keys],
    source_raws: [candidate.raw_segment],
  }));
}

function formatDuration(minutes) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export function estimateDuration({ lengthKm, difficulty, routeSemantic }) {
  if (lengthKm == null) {
    return {
      estimated_duration_min: null,
      estimated_duration: null,
      duration_status: 'not_estimated_length_missing',
    };
  }
  if (!['beginner', 'intermediate'].includes(difficulty)) {
    return {
      estimated_duration_min: null,
      estimated_duration: null,
      duration_status: 'not_estimated_difficulty',
    };
  }
  if (!['round_trip', 'loop'].includes(routeSemantic)) {
    return {
      estimated_duration_min: null,
      estimated_duration: null,
      duration_status: 'not_estimated_route_semantic',
    };
  }
  if (lengthKm > 16) {
    return {
      estimated_duration_min: null,
      estimated_duration: null,
      duration_status: 'not_estimated_length_cap',
    };
  }
  const speedKmh = 2;
  const estimatedDurationMin = Math.ceil((lengthKm / speedKmh * 60) / 30) * 30;
  return {
    estimated_duration_min: estimatedDurationMin,
    estimated_duration: formatDuration(estimatedDurationMin),
    duration_status: 'estimated',
  };
}

export function buildRiskNote(difficulty) {
  const note = RISK_NOTES[difficulty];
  assert(note, `unknown risk-note difficulty: ${difficulty}`);
  return note;
}

export function buildRouteNote({
  routeLabel,
  routeSemantic,
  lengthKm,
  difficulty,
}) {
  if (!routeLabel) return null;
  const terrain = ROUTE_TERRAIN_LABELS[difficulty];
  assert(terrain, `unknown route-note difficulty: ${difficulty}`);
  const routeMeasure = lengthKm == null
    ? '距离待核'
    : `${ROUTE_SEMANTIC_LABELS[routeSemantic] || '路线语义待核'}${lengthKm}km`;
  return `经典线路：${routeLabel} · ${routeMeasure} · ${terrain}。${ROUTE_DISCLAIMER}`;
}

function buildMultiRouteNote(entityKey, routes, difficulty) {
  const terrain = ROUTE_TERRAIN_LABELS[difficulty];
  assert(terrain, `unknown multi-route difficulty: ${difficulty}`);
  if (entityKey === 'yubeng-route') {
    return `参考线路：雨崩神瀑往返线 · ${terrain}。${ROUTE_DISCLAIMER}`;
  }
  return `参考线路：${routes.map((route) => route.route_label).join('、')} · ${terrain}。${ROUTE_DISCLAIMER}`;
}

function candidateCoordinate(candidate) {
  return { latitude: candidate.latitude, longitude: candidate.longitude };
}

function inBbox(candidate, bbox) {
  return candidate.latitude >= bbox.minLat
    && candidate.latitude <= bbox.maxLat
    && candidate.longitude >= bbox.minLon
    && candidate.longitude <= bbox.maxLon;
}

function candidateNameRank(candidate, targetName, acceptedNames) {
  if (candidate.full_name === targetName) return 0;
  if (acceptedNames.includes(candidate.full_name)) return 1;
  return 2;
}

function designationRank(candidate) {
  if (candidate.desig_cd === 'PK') return 0;
  if (candidate.desig_cd === 'MT') return 1;
  return 2;
}

function maxCandidateSpread(candidates) {
  let maximum = 0;
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      maximum = Math.max(
        maximum,
        distanceMeters(candidateCoordinate(candidates[left]), candidateCoordinate(candidates[right])),
      );
    }
  }
  return maximum;
}

export function chooseGnsCandidate({
  targetName,
  acceptedNames,
  allowedAdm1,
  bbox,
  knownLocation,
  candidates,
}) {
  const namedPeaks = candidates.filter((candidate) =>
    acceptedNames.includes(candidate.full_name) && ['PK', 'MT'].includes(candidate.desig_cd));
  assert(namedPeaks.length > 0, `GNS has no peak candidate for ${targetName}`);

  const bboxCandidates = namedPeaks.filter((candidate) => inBbox(candidate, bbox));
  assert(bboxCandidates.length > 0, `GNS candidates for ${targetName} are outside province bbox`);

  const eligible = bboxCandidates.filter((candidate) => allowedAdm1.includes(candidate.adm1));
  if (eligible.length !== bboxCandidates.length) {
    const provinces = [...new Set(bboxCandidates.map((candidate) => candidate.adm1))]
      .sort(asciiCompare);
    throw new Error(`GNS cross-province candidates for ${targetName}: ${provinces.join(', ')}`);
  }

  const candidateSpreadM = maxCandidateSpread(eligible);
  assert(
    candidateSpreadM <= GNS_MAX_CANDIDATE_SPREAD_M,
    `GNS candidate spread exceeds 100km for ${targetName}: ${Math.round(candidateSpreadM)}m`,
  );

  const ranked = eligible.map((candidate) => ({
    candidate,
    rank: [
      candidateNameRank(candidate, targetName, acceptedNames),
      designationRank(candidate),
      candidate.ufi > 0 ? 0 : 1,
      -Number(candidate.coordinate_precision || 0),
      knownLocation ? distanceMeters(candidateCoordinate(candidate), knownLocation) : null,
    ],
  })).sort((left, right) => {
    for (let index = 0; index < left.rank.length; index += 1) {
      const leftValue = left.rank[index];
      const rightValue = right.rank[index];
      if (leftValue == null || rightValue == null || leftValue === rightValue) continue;
      return leftValue - rightValue;
    }
    return 0;
  });

  if (ranked.length > 1 && ranked[0].rank.every((value, index) => value === ranked[1].rank[index])) {
    throw new Error(`GNS deterministic ranking remains tied for ${targetName}`);
  }

  const chosen = ranked[0].candidate;
  const reasons = [];
  if (eligible.length === 1) {
    reasons.push('only eligible in-province peak candidate');
  } else {
    const runnerUp = ranked[1];
    if (ranked[0].rank[0] < runnerUp.rank[0]) reasons.push('more exact target-name match');
    else if (ranked[0].rank[1] < runnerUp.rank[1]) reasons.push('peak designation preferred');
    else if (ranked[0].rank[2] < runnerUp.rank[2]) reasons.push('positive UFI preferred');
    else if (ranked[0].rank[3] < runnerUp.rank[3]) reasons.push('higher coordinate precision preferred');
    else reasons.push('closest to known mountain location');
  }

  return {
    chosen,
    candidates: [...eligible].sort((left, right) =>
      Number(left.ufi) - Number(right.ufi) || asciiCompare(left.full_name, right.full_name)),
    multi_candidate: eligible.length > 1,
    candidate_spread_m: Math.round(candidateSpreadM),
    selection_reason: reasons.join('; '),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readJsonl(path) {
  const body = await readFile(path, 'utf8');
  return body.trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function assertFrozenInputs(rootDir) {
  for (const [relativePath, expectedSha] of Object.entries(FROZEN_INPUTS)) {
    const actualSha = sha256(await readFile(join(rootDir, relativePath)));
    assert.equal(actualSha, expectedSha, `frozen input drift: ${relativePath}`);
  }
}

function countBy(rows, selector) {
  return Object.fromEntries(
    [...Map.groupBy(rows, selector)]
      .map(([key, values]) => [String(key), values.length])
      .sort(([left], [right]) => asciiCompare(left, right)),
  );
}

function sourceRefs(entity, sourceType) {
  return entity.source_refs.map((entry) => ({
    provenance_id: `${sourceType}:${entry[sourceType].source_row_id}`,
    kind: 'source_row',
    source_document_id: sourceType,
    source_candidate_key: entry.canonical_key,
    source_row_id: entry[sourceType].source_row_id,
    source_hash: entry[sourceType].source_hash,
  }));
}

function rejectedContributions(entity, field) {
  return (entity.field_issues?.[field] || []).map((issue, index) => ({
    provenance_id: `rejected:${entity.effective_canonical_key}:${field}:${String(index + 1).padStart(2, '0')}`,
    kind: 'rejected_source_contribution',
    status: issue.status,
    reason: issue.reason,
    source_candidate_keys: [...issue.source_candidate_keys].sort(asciiCompare),
  }));
}

function externalProvenance(source, extractionPath, extra = {}) {
  return {
    provenance_id: source.source_id,
    kind: 'external_source',
    source_class: source.source_class,
    provider: source.provider,
    url: source.url ?? null,
    response_body_sha256: source.response_body_sha256,
    cas_path: source.cas_path,
    extraction_path: extractionPath,
    ...extra,
  };
}

function lengthStatus(entity) {
  if (entity.length.value_km != null) return 'exact';
  const statuses = new Set((entity.field_issues?.length || []).map((issue) => issue.status));
  if (statuses.has('conflict')) return 'conflict';
  if (statuses.has('withheld')) return 'withheld';
  if (entity.length.parse_quality === 'ambiguous_literal') return 'ambiguous';
  return 'missing';
}

function sourceRawValues(entity, candidatesByKey, field) {
  return [...new Set(entity.source_candidate_keys
    .map((key) => candidatesByKey.get(key)?.[field]?.raw)
    .filter((value) => value != null && value !== ''))]
    .sort(asciiCompare);
}

function blockedLengthCandidateKeys(entity, candidatesByKey) {
  const blocked = new Set();
  const blockIssue = (issue) => {
    if (!['conflict', 'unverified'].includes(issue.status)) return;
    if (issue.reason.startsWith('多个干净来源的 length 值不一致')) return;
    for (const key of issue.source_candidate_keys || []) blocked.add(key);
  };
  for (const issue of entity.field_issues?.length || []) blockIssue(issue);
  for (const key of entity.source_candidate_keys) {
    for (const issue of candidatesByKey.get(key)?.field_issues?.length || []) blockIssue(issue);
  }
  return blocked;
}

function routeCandidatesForEntity(entity, candidatesByKey) {
  const blockedKeys = blockedLengthCandidateKeys(entity, candidatesByKey);
  return entity.source_candidate_keys
    .filter((key) => !blockedKeys.has(key))
    .flatMap((key) => parseRouteCandidates(candidatesByKey.get(key)?.length?.raw, key));
}

function routeAnchorTokens(routeLabel) {
  return routeLabel
    .replace(/^(?:景区线|徒步线|登山线)[：:]/u, '')
    .split(/[-→—]/u)
    .map((token) => token.trim().replace(/线$/u, ''))
    .filter((token) => token.length >= 2 && !['路线', '主线'].includes(token));
}

function matchingClassicRoute(routeCandidate, classicRoutes) {
  const anchors = routeAnchorTokens(routeCandidate.route_label);
  if (anchors.length < 2) return null;
  const matches = classicRoutes
    .flatMap((route) => String(route).split(/[；;]/u))
    .map((route) => route.trim())
    .filter(Boolean)
    .filter((route) => anchors.every((anchor) => route.includes(anchor)))
    .sort((left, right) => right.length - left.length || asciiCompare(left, right));
  return matches[0]
    ?.replace(/(?:往返|单程|环线|穿越线|穿越)线?$/u, '')
    .replace(/[-→—\s]+$/u, '') || null;
}

function buildCoordinate(entity, semantics, override, sourceById) {
  const original = entity.gps.latitude == null ? null : {
    latitude: entity.gps.latitude,
    longitude: entity.gps.longitude,
  };
  const enriched = override ? {
    latitude: override.latitude,
    longitude: override.longitude,
  } : null;
  const effective = enriched || original;
  const external = override ? sourceById.get(override.source_id) : null;
  if (override) {
    assert(external, `missing coordinate source ${override.source_id}`);
    assert(
      ['authority_reference', 'curated_canonical'].includes(external.source_class),
      `invalid coordinate source class for ${entity.effective_canonical_key}`,
    );
    assert.equal(override.province_bbox_sanity.passed, true, `${entity.effective_canonical_key} bbox failed`);
  }
  const selectedProvenance = override
    ? [externalProvenance(external, override.extraction_path, {
      chosen_ufi: override.chosen_ufi,
      multi_candidate: override.multi_candidate,
      candidate_spread_m: override.candidate_spread_m,
      selection_reason: override.selection_reason,
      candidates: override.candidates,
      curated: override.curated || false,
    })]
    : original ? sourceRefs(entity, 'catalog') : [];
  const noCandidateSource = override?.gns_no_candidate_source_id
    ? sourceById.get(override.gns_no_candidate_source_id)
    : null;
  if (override?.gns_no_candidate_source_id) {
    assert(noCandidateSource, `missing GNS no-candidate source for ${entity.effective_canonical_key}`);
  }
  const rejected = [
    ...rejectedContributions(entity, 'gps'),
    ...(noCandidateSource ? [{
      ...externalProvenance(noCandidateSource, 'ArcGIS query returned no eligible PK/MT feature'),
      kind: 'gns_no_candidate',
      result: 'no_peak_candidate',
    }] : []),
  ];
  return {
    value: {
      original,
      enriched,
      effective,
      status: enriched ? 'enriched' : original ? 'existing' : 'missing',
      source_class: enriched ? external.source_class : original ? 'seed_literal' : null,
      target_role: semantics.coordinate_target_role,
      province_bbox_sanity: override?.province_bbox_sanity || {
        passed: null,
        matched_provinces: [],
        bbox_source_id: null,
      },
      provenance_ids: selectedProvenance.map((item) => item.provenance_id),
      multi_candidate: override?.multi_candidate || false,
      candidate_spread_m: override?.candidate_spread_m ?? 0,
      curated: override?.curated || false,
    },
    provenance: [...selectedProvenance, ...rejected],
  };
}

function buildAltitude(entity, override, conflictOverride, sourceById) {
  const originalM = entity.altitude.value_m;
  if (entity.effective_canonical_key === 'weizhou-volcanic-landform-route') {
    return {
      value: {
        original_m: null,
        enriched_m: null,
        effective_m: null,
        status: 'route_highpoint_missing',
        source_class: null,
        provenance_ids: [],
      },
      provenance: rejectedContributions(entity, 'altitude'),
    };
  }
  if (conflictOverride) {
    const existingValue = conflictOverride.existing_reference_value_m
      ?? conflictOverride.seed_value_m
      ?? originalM;
    if (conflictOverride.seed_value_m != null) {
      assert.equal(originalM, conflictOverride.seed_value_m);
    }
    const conflictValues = conflictOverride.conflict_values_m
      || [existingValue, conflictOverride.reference_value_m]
        .sort((left, right) => left - right);
    const existingSource = conflictOverride.existing_source_id
      ? sourceById.get(conflictOverride.existing_source_id)
      : null;
    if (conflictOverride.existing_source_id) {
      assert(existingSource, `missing prior altitude source ${conflictOverride.existing_source_id}`);
    }
    return {
      value: {
        original_m: originalM,
        enriched_m: null,
        effective_m: null,
        status: 'conflict',
        source_class: null,
        conflict_values_m: conflictValues,
        provenance_ids: [
          ...sourceRefs(entity, 'catalog').map((item) => item.provenance_id),
          ...(existingSource ? [existingSource.source_id] : []),
          conflictOverride.provenance_id,
        ],
      },
      provenance: [
        ...sourceRefs(entity, 'catalog'),
        ...(existingSource ? [externalProvenance(
          existingSource,
          `previously selected reference value ${existingValue}m`,
          { evidence_status: 'superseded_by_conflict' },
        )] : []),
        {
          provenance_id: conflictOverride.provenance_id,
          kind: 'manual_conflict_reference',
          evidence_status: 'needs_review',
          source_name: conflictOverride.source_name,
          reference_value_m: conflictOverride.new_reference_value_m
            ?? conflictOverride.reference_value_m,
          reason: conflictOverride.reason,
        },
        ...rejectedContributions(entity, 'altitude'),
      ],
    };
  }
  const enrichedM = override?.value_m ?? null;
  const external = override ? sourceById.get(override.source_id) : null;
  if (override) {
    assert(external, `missing altitude source ${override.source_id}`);
    assert.equal(external.source_class, 'authority_reference');
  }
  const selectedProvenance = override
    ? [externalProvenance(external, override.extraction_path)]
    : originalM != null ? sourceRefs(entity, 'catalog') : [];
  return {
    value: {
      original_m: originalM,
      enriched_m: enrichedM,
      effective_m: enrichedM ?? originalM,
      status: enrichedM != null ? 'enriched' : originalM != null ? 'existing' : 'missing',
      source_class: enrichedM != null ? 'authority_reference' : originalM != null ? 'seed_literal' : null,
      provenance_ids: selectedProvenance.map((item) => item.provenance_id),
    },
    provenance: [...selectedProvenance, ...rejectedContributions(entity, 'altitude')],
  };
}

function assertManifestClosure(rootDir, manifest) {
  assert.equal(manifest.schema_version, ENRICHMENT_SCHEMA_VERSION, 'unexpected source manifest schema');
  assert(Array.isArray(manifest.sources), 'source manifest sources must be an array');
  const ids = new Set();
  return Promise.all(manifest.sources.map(async (source) => {
    assert(!ids.has(source.source_id), `duplicate source id: ${source.source_id}`);
    ids.add(source.source_id);
    assert(
      ['authority_reference', 'curated_canonical'].includes(source.source_class),
      `invalid source class: ${source.source_id}`,
    );
    if (source.source_class === 'authority_reference') {
      assert(source.http_status >= 200 && source.http_status < 300, `source ${source.source_id} is not HTTP 2xx`);
    } else {
      assert.equal(source.transport, 'controlled');
      assert.equal(source.http_status, null);
    }
    const bytes = await readFile(join(rootDir, source.cas_path));
    assert.equal(sha256(bytes), source.response_body_sha256, `CAS hash mismatch: ${source.source_id}`);
  }));
}

function validateOverrideShape(overrides) {
  assert.equal(overrides.schema_version, ENRICHMENT_SCHEMA_VERSION);
  assert.equal(Object.keys(overrides.coordinates).length, 19, 'coordinate overrides must contain 19 entries');
  assert.equal(Object.keys(overrides.altitudes).length, 5, 'altitude overrides must contain 5 entries');
  assert.deepEqual(
    Object.keys(overrides.altitude_conflicts || {}).sort(asciiCompare),
    [
      'aerjin-shan',
      'yading-xiannairi',
      'yading-xianuoduoji',
      'yading-yangmaiyong',
    ],
    'S1.4 must keep Altyn-Tagh and Yading altitude conflicts',
  );
  assert.deepEqual(overrides.lengths, {}, 'S1.2 revokes all manual length picks');
  assert.deepEqual(
    Object.keys(overrides.route_binding_overrides || {}).sort(asciiCompare),
    ['kawagebo', 'yading-xiannairi', 'yading-xianuoduoji', 'yading-yangmaiyong'],
  );
  assert.deepEqual(Object.keys(overrides.review_flags || {}), ['gongga-baihaizi-shan']);
  assert.equal(
    Object.values(overrides.coordinates).filter((row) => row.multi_candidate).length >= 1,
    true,
    'expected at least one audited multi-candidate coordinate',
  );
}

function validateIntroOverrides(introOverrides, entityKeys) {
  assert.equal(introOverrides.schema_version, 1, 'unexpected intro override schema');
  const entries = Object.entries(introOverrides.by_effective_canonical_key || {});
  assert.equal(entries.length, 359, 'intro overrides must close all 359 entities');
  let permitCleanupCount = 0;
  for (const [key, entry] of entries) {
    assert(entityKeys.has(key), `unknown intro override key: ${key}`);
    const length = [...entry.intro].length;
    assert(length >= 25 && length <= 45, `${key} intro must be 25-45 characters`);
    assert(
      !/^[^，。]{1,20}海拔\d/u.test(entry.intro),
      `${key} intro must not open with mountain-name plus altitude`,
    );
    assert(
      !/(?:记忆点|路线信息|分别保留)/u.test(entry.intro),
      `${key} intro contains editorial meta-language`,
    );
    assert(!INTRO_ACCESS_LANGUAGE.test(entry.intro), `${key} intro contains access language`);
    assert(Array.isArray(entry.fact_fields) && entry.fact_fields.length > 0, `${key} fact fields missing`);
    assert(Array.isArray(entry.added_claims), `${key} added claims missing`);
    for (const claim of entry.added_claims) {
      assert.equal(typeof claim, 'object', `${key} added claim must be structured`);
      assert.equal(typeof claim.claim, 'string', `${key} added claim text missing`);
      assert(ADDED_CLAIM_BASES.has(claim.basis), `${key} invalid claim basis: ${claim.basis}`);
    }
    if (entry.added_claims.some((claim) => claim.basis === 'needs_review')) {
      assert.notEqual(
        entry.generation_note,
        'ai_one_time_source_grounded',
        `${key} needs-review claim cannot be source-grounded`,
      );
    }
    if (entry.s1_4_previous_intro != null) {
      assert(INTRO_ACCESS_LANGUAGE.test(entry.s1_4_previous_intro), `${key} cleanup before has no access language`);
      assert.notEqual(entry.s1_4_previous_intro, entry.intro, `${key} cleanup did not change intro`);
      permitCleanupCount += 1;
    }
  }
  assert.equal(permitCleanupCount, 70, 'S1.4 permit cleanup must contain 70 before/after records');
}

function validateAccessOverrides(accessOverrides, entityKeys) {
  assert.equal(accessOverrides.schema_version, 1);
  assert.equal(typeof accessOverrides.source_input_sha256, 'string');
  const entries = Object.entries(accessOverrides.by_effective_canonical_key || {});
  assert.equal(entries.length, 359, 'access overrides must close all 359 entities');
  for (const [key, entry] of entries) {
    assert(entityKeys.has(key), `unknown access override key: ${key}`);
    assert(ACCESS_STATUSES.has(entry.status), `${key} invalid access status`);
    if (['closed', 'pilgrimage_only'].includes(entry.status)) {
      assert(CLOSED_BASES.has(entry.closed_basis), `${key} invalid closed basis`);
    } else {
      assert.equal(entry.closed_basis, null, `${key} must not set closed basis`);
    }
    if (entry.status !== 'open') {
      assert.equal(typeof entry.access_source, 'string', `${key} non-open access source missing`);
      assert(entry.access_source.length > 0, `${key} non-open access source empty`);
      assert.equal(typeof entry.access_note, 'string', `${key} non-open access note missing`);
      assert(entry.access_note.length > 0, `${key} non-open access note empty`);
      assert(!/法律明令禁止攀登/u.test(entry.access_note), `${key} overstates legal status`);
    }
  }
}

function validateContentPolicy(contentPolicy) {
  assert.equal(contentPolicy.schema_version, 1);
  assert.equal(
    contentPolicy.global_access_disclaimer,
    '山峰存在周期性封山与临时管控（如防火期、生态修复期），开放线路可能逐段调整；出行前请以当地景区/主管部门最新公告为准。',
  );
}

function renderReview(model) {
  const lines = [
    '# Ledger Enrichment Review',
    '',
    '## Scope',
    '',
    `- Entity closure: ${model.records.length}/359`,
    '- Coordinates are used only as authority references for coarse location behavior; no value is labeled verified.',
    '- 距离=单一路线字面量的山体级距离；多线路实体只保留 per-route 距离，不提升为山体单值（平台声称·未逐山核验）。',
    '- Source distance library: seed distance library citing 8264/两步路; not per-mountain URL/track verified.',
    '- 时长=山地粗估2km/h、非真轨迹耗时；仅 beginner/intermediate 且单一路线为往返/环线、距离不超过16km时生成。',
    '- Part2 接两步路/六只脚真距离+真耗时+轨迹。',
    '- Existing non-empty coordinates remain seed_literal unless explicitly enriched by an authority reference or curated canonical.',
    '- 产品执照不等于政府登山许可，也不限制用户登山；它只是产品内部的等级元数据。',
    `- ${model.content_policy.global_access_disclaimer}`,
    '',
    '## Source Class Distribution',
    '',
    '| Field | Source class | Count |',
    '|---|---|---:|',
  ];
  for (const [field, counts] of Object.entries(model.stats.source_classes)) {
    for (const [sourceClass, count] of Object.entries(counts)) {
      lines.push(`| ${field} | ${sourceClass} | ${count} |`);
    }
  }
  lines.push(
    '',
    '## Access Status',
    '',
    '| Status | Count |',
    '|---|---:|',
  );
  for (const [status, count] of Object.entries(model.stats.access_statuses)) {
    lines.push(`| ${status} | ${count} |`);
  }
  lines.push('', '### Non-open / unknown records', '');
  for (const row of model.records.filter((record) => record.access_status !== 'open')) {
    lines.push(
      `- \`${row.effective_canonical_key}\` ${row.primary_name}: `
      + `${row.access_status} / ${row.closed_basis ?? 'n/a'} / ${row.access_note} `
      + `| source=${row.access_source}`,
    );
  }
  lines.push(
    '',
    '## Added Claim Basis',
    '',
    '| Basis | Count |',
    '|---|---:|',
  );
  for (const [basis, count] of Object.entries(model.stats.added_claim_bases)) {
    lines.push(`| ${basis} | ${count} |`);
  }
  lines.push(
    '',
    '## S1.4 Intro Permit Cleanup',
    '',
    '| Key | Before | After |',
    '|---|---|---|',
  );
  for (const [key, entry] of Object.entries(model.intro_overrides)
    .filter(([, entry]) => entry.s1_4_previous_intro != null)
    .sort(([left], [right]) => asciiCompare(left, right))) {
    lines.push(`| \`${key}\` | ${entry.s1_4_previous_intro} | ${entry.intro} |`);
  }
  lines.push(
    '',
    '## Route Semantics',
    '',
    '| Semantic | Count |',
    '|---|---:|',
  );
  for (const [semantic, count] of Object.entries(model.stats.route_semantics)) {
    lines.push(`| ${semantic} | ${count} |`);
  }
  lines.push(
    '',
    '## Duration',
    '',
    '| Result | Count |',
    '|---|---:|',
  );
  for (const [status, count] of Object.entries(model.stats.duration_statuses)) {
    lines.push(`| ${status} | ${count} |`);
  }
  lines.push(
    '',
    '## Length Resolution',
    '',
    `- 单线绑定代表线：${model.records.filter((row) =>
      row.length.resolution === 'longest_bound_route_candidate').length}`,
    `- 多线路仅保留 per-route：${model.records.filter((row) =>
      row.length.resolution === 'per_route_only').length}`,
    `- 待处理：${model.records.filter((row) => row.length.length_km == null).length}`,
    '',
    '## 坐标精度补录 backlog',
    '',
  );
  for (const row of model.records.filter((record) => record.coordinate.curated)) {
    lines.push(`- \`${row.effective_canonical_key}\` ${row.primary_name}: curated_canonical，待补更高精度来源`);
  }
  lines.push(
    '',
    '## Enrichment Sources',
    '',
    '| Key | Entity | Coordinate | Altitude | Coordinate source | Altitude source | Bbox | Multi candidate / spread |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const row of model.records.filter((record) =>
    record.coordinate.status === 'enriched' || record.altitude.status === 'enriched')) {
    const coordinate = row.coordinate.effective
      ? `${row.coordinate.effective.latitude}, ${row.coordinate.effective.longitude}`
      : '-';
    const altitude = row.altitude.effective_m == null ? '-' : `${row.altitude.effective_m}m`;
    lines.push(
      `| \`${row.effective_canonical_key}\` | ${row.primary_name} | ${coordinate} | ${altitude} | `
      + `${row.coordinate.provenance_ids.join(', ') || '-'} | ${row.altitude.provenance_ids.join(', ') || '-'} | `
      + `${row.coordinate.province_bbox_sanity.passed ?? '-'} | `
      + `${row.coordinate.multi_candidate} / ${row.coordinate.candidate_spread_m}m |`,
    );
  }
  lines.push('', '## Residual Length Gaps', '');
  for (const row of model.records.filter((record) => record.length.length_km == null)) {
    lines.push(`- \`${row.effective_canonical_key}\` ${row.primary_name}: ${row.length.status}`);
  }
  lines.push('', '## Route Note Backlog', '');
  for (const row of model.records.filter((record) => record.route_note == null)) {
    lines.push(`- \`${row.effective_canonical_key}\` ${row.primary_name}: bound route candidate missing`);
  }
  lines.push('', '## Intro Review (359)', '');
  for (const row of model.records.filter((record) => record.intro != null)) {
    lines.push(
      `- \`${row.effective_canonical_key}\` ${row.primary_name}: ${row.intro}`
      + ` | added_claims=${JSON.stringify(row.intro_added_claims)}`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

export async function buildLedgerEnrichment(rootDir = MODULE_ROOT) {
  await assertFrozenInputs(rootDir);
  const [
    entities,
    semantics,
    candidates,
    overrides,
    manifest,
    introOverrides,
    accessOverrides,
    contentPolicy,
  ] = await Promise.all([
    readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl')),
    readJsonl(join(rootDir, 'ledger/entity-semantics.jsonl')),
    readJsonl(join(rootDir, 'ledger/candidates.jsonl')),
    readJson(join(rootDir, 'enrichment/field-overrides.json')),
    readJson(join(rootDir, 'enrichment/source-manifest.json')),
    readJson(join(rootDir, 'enrichment/intro-overrides.json')),
    readJson(join(rootDir, 'enrichment/access-status-overrides.json')),
    readJson(join(rootDir, 'enrichment/content-policy.json')),
  ]);
  assert.equal(entities.length, 359);
  assert.equal(semantics.length, 359);
  const entityKeys = new Set(entities.map((entity) => entity.effective_canonical_key));
  validateOverrideShape(overrides);
  validateIntroOverrides(introOverrides, entityKeys);
  validateAccessOverrides(accessOverrides, entityKeys);
  validateContentPolicy(contentPolicy);
  await assertManifestClosure(rootDir, manifest);

  const semanticsByKey = new Map(semantics.map((row) => [row.effective_canonical_key, row]));
  const candidatesByKey = new Map(candidates.map((row) => [row.canonical_key, row]));
  const sourceById = new Map(manifest.sources.map((source) => [source.source_id, source]));
  const records = entities.map((entity) => {
    const key = entity.effective_canonical_key;
    const semantic = semanticsByKey.get(key);
    assert(semantic, `missing semantics for ${key}`);
    const difficultyLiterals = [...new Set(entity.source_candidate_keys
      .map((sourceKey) => candidatesByKey.get(sourceKey)?.difficulty_raw)
      .filter(Boolean))]
      .sort(asciiCompare);
    assert(difficultyLiterals.length > 0, `missing difficulty for ${key}`);
    const difficulty = difficultyLiterals
      .map(mapDifficulty)
      .sort((left, right) => DIFFICULTY_ORDER.indexOf(right) - DIFFICULTY_ORDER.indexOf(left))[0];
    const coordinate = buildCoordinate(
      entity,
      semantic,
      overrides.coordinates[key],
      sourceById,
    );
    const altitude = buildAltitude(
      entity,
      overrides.altitudes[key],
      overrides.altitude_conflicts?.[key],
      sourceById,
    );
    const routeCandidates = routeCandidatesForEntity(entity, candidatesByKey)
      .sort((left, right) =>
        right.km - left.km
        || ROUTE_SEMANTIC_SELECTION_RANK[left.semantic]
          - ROUTE_SEMANTIC_SELECTION_RANK[right.semantic]
        || asciiCompare(left.route_label, right.route_label)
        || asciiCompare(left.source_candidate_keys.join('\u0000'), right.source_candidate_keys.join('\u0000')));
    const routeBindingOverrides = overrides.route_binding_overrides?.[key] || [];
    const routes = routeBindingOverrides.length > 0
      ? routeBindingOverrides.map((route) => ({
        route_label: route.route_label,
        semantic: route.semantic,
        km: route.km,
        aspect: route.aspect,
        binding_status: route.binding_status,
        binding_target: route.binding_target,
        source_candidate_keys: [...entity.source_candidate_keys].sort(asciiCompare),
        source_raws: [route.source_raw],
      }))
      : perRouteRecords(entity, routeCandidates);
    const hasAmbiguousRoutes = AMBIGUOUS_MULTI_ROUTE_KEYS.has(key);
    const hasNonPromotedRouteBindings = routeBindingOverrides.length > 0;
    const selectedRoute = hasAmbiguousRoutes || hasNonPromotedRouteBindings
      ? null
      : selectRepresentativeRoute(routeCandidates);
    const lengthKm = selectedRoute?.km ?? null;
    const routeSemantic = hasAmbiguousRoutes ? 'conflict' : selectedRoute?.semantic ?? null;
    const routeLabel = selectedRoute
      ? matchingClassicRoute(selectedRoute, entity.classic_routes) || selectedRoute.route_label
      : null;
    const duration = estimateDuration({
      lengthKm,
      difficulty,
      routeSemantic,
    });
    const distanceProvenance = sourceRefs(entity, 'distance');
    const difficultyProvenance = sourceRefs(entity, 'catalog');
    const lengthResolutionProvenance = hasAmbiguousRoutes ? {
      provenance_id: `route-selection:${key}`,
      kind: 'deterministic_resolution',
      resolution: 'per_route_only',
      selected_route: null,
      routes,
      reason: '多条路线保持独立，不提升为山体级距离或时长',
    } : hasNonPromotedRouteBindings ? {
      provenance_id: `route-selection:${key}`,
      kind: 'deterministic_resolution',
      resolution: 'unbound_route_only',
      selected_route: null,
      routes,
      reason: '源距离描述卫峰或无法绑定的路线，不提升为当前主峰实体的距离或时长',
    } : selectedRoute ? {
      provenance_id: `route-selection:${key}`,
      kind: 'deterministic_resolution',
      resolution: 'longest_bound_route_candidate',
      selected_route: selectedRoute,
      display_route_label: routeLabel,
    } : null;
    const introOverride = introOverrides.by_effective_canonical_key[key] || null;
    const accessOverride = accessOverrides.by_effective_canonical_key[key];
    assert(accessOverride, `missing access override for ${key}`);
    const introFacts = {
      primary_name: entity.primary_name,
      provinces: entity.provinces,
      description: entity.description ?? null,
      altitude_m: altitude.value.effective_m,
      difficulty,
      classic_route: routeLabel,
      length_km: lengthKm,
      mountain_routes: entity.mountain_routes,
    };
    const introFactValues = {
      primary_name: introFacts.primary_name,
      provinces: introFacts.provinces,
      description: introFacts.description,
      altitude: introFacts.altitude_m,
      difficulty: introFacts.difficulty,
      classic_route: introFacts.classic_route,
      length: introFacts.length_km,
      mountain_routes: introFacts.mountain_routes,
    };
    for (const field of introOverride?.fact_fields || []) {
      assert(Object.hasOwn(introFactValues, field), `${key} unknown intro fact field: ${field}`);
      const value = introFactValues[field];
      assert(
        Array.isArray(value) ? value.length > 0 : value != null && value !== '',
        `${key} intro fact field is unavailable: ${field}`,
      );
    }
    return {
      effective_canonical_key: key,
      primary_name: entity.primary_name,
      coordinate: coordinate.value,
      altitude: altitude.value,
      difficulty: {
        source_literals: difficultyLiterals,
        product_enum: difficulty,
        provenance_ids: difficultyProvenance.map((item) => item.provenance_id),
      },
      min_license: {
        value: LICENSE_MAP[difficulty],
        mapping_version: 'difficulty-license-v1',
      },
      access_status: accessOverride.status,
      closed_basis: accessOverride.closed_basis,
      access_source: accessOverride.access_source,
      access_note: accessOverride.access_note,
      length: {
        length_km: lengthKm,
        status: hasAmbiguousRoutes || hasNonPromotedRouteBindings
          ? 'conflict'
          : selectedRoute ? 'exact' : lengthStatus(entity),
        source_class: 'seed_claimed_platform_source',
        route_semantic: routeSemantic,
        route_label: routeLabel,
        resolution: hasAmbiguousRoutes
          ? 'per_route_only'
          : hasNonPromotedRouteBindings
            ? 'unbound_route_only'
            : selectedRoute ? 'longest_bound_route_candidate' : 'unresolved',
        routes,
        route_candidates: routeCandidates,
        selected_route: selectedRoute,
        provenance_note: LENGTH_PROVENANCE_NOTE,
        source_raws: sourceRawValues(entity, candidatesByKey, 'length'),
        provenance_ids: [
          ...distanceProvenance.map((item) => item.provenance_id),
          ...(lengthResolutionProvenance ? [lengthResolutionProvenance.provenance_id] : []),
        ],
      },
      ...duration,
      duration_formula_version: 'day-hike-distance-2kmh-v3',
      intro: introOverride?.intro ?? null,
      intro_added_claims: introOverride?.added_claims ?? [],
      risk_note: buildRiskNote(difficulty),
      route_note: hasAmbiguousRoutes
        ? buildMultiRouteNote(key, routes, difficulty)
        : hasNonPromotedRouteBindings
          ? null
        : buildRouteNote({
          routeLabel,
          routeSemantic,
          lengthKm,
          difficulty,
        }),
      provenance: {
        coordinate: coordinate.provenance,
        altitude: altitude.provenance,
        difficulty: difficultyProvenance,
        length: [
          ...distanceProvenance,
          ...(lengthResolutionProvenance ? [lengthResolutionProvenance] : []),
          ...rejectedContributions(entity, 'length'),
        ],
        content: {
          intro: introOverride ? {
            kind: 'static_intro_override',
            generation_note: introOverride.generation_note,
            fact_fields: introOverride.fact_fields,
            added_claims: introOverride.added_claims,
            source_facts: introFacts,
          } : null,
          risk_note: {
            kind: 'deterministic_rule',
            rule_id: 'difficulty-risk-note-v2',
          },
          route_note: {
            kind: 'deterministic_rule',
            rule_id: 'bound-route-note-v3',
          },
        },
      },
      review_flags: [...(overrides.review_flags?.[key] || [])],
    };
  }).sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key));

  assert.equal(new Set(records.map((row) => row.effective_canonical_key)).size, 359);
  assert(!JSON.stringify(records).includes('"verified"'), 'verified is prohibited in Sprint 1');
  for (const row of records.filter((record) =>
    ['advanced', 'expert'].includes(record.difficulty.product_enum))) {
    assert(
      !HIGH_RISK_INTRO_BANNED_WORDS.test(row.intro),
      `${row.effective_canonical_key} intro downplays ${row.difficulty.product_enum} risk`,
    );
    assert(
      !INTRO_ACCESS_LANGUAGE.test(row.intro),
      `${row.effective_canonical_key} intro contains access language`,
    );
  }
  const stats = {
    source_classes: {
      coordinate: countBy(records, (row) => row.coordinate.source_class ?? 'null'),
      altitude: countBy(records, (row) => row.altitude.source_class ?? 'null'),
      length: countBy(records, (row) => row.length.source_class),
    },
    route_semantics: countBy(records, (row) => row.length.route_semantic ?? 'null'),
    duration_statuses: countBy(records, (row) => row.duration_status),
    intro_statuses: countBy(records, (row) => row.intro == null ? 'missing' : 'static_override'),
    route_note_statuses: countBy(records, (row) => row.route_note == null ? 'missing' : 'generated'),
    access_statuses: countBy(records, (row) => row.access_status),
    added_claim_bases: countBy(
      records.flatMap((row) => row.intro_added_claims),
      (claim) => claim.basis,
    ),
    intro_permit_cleanup_count: Object.values(
      introOverrides.by_effective_canonical_key,
    ).filter((entry) => entry.s1_4_previous_intro != null).length,
  };
  const model = {
    records,
    stats,
    content_policy: contentPolicy,
    intro_overrides: introOverrides.by_effective_canonical_key,
  };
  return {
    ...model,
    artifacts: {
      'ledger/effective-canonical-enrichment.jsonl':
        `${records.map((row) => JSON.stringify(row)).join('\n')}\n`,
      'ledger/enrichment-review.md': renderReview(model),
    },
  };
}

async function atomicWrite(path, body) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(tempPath, body);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function generateLedgerEnrichment(rootDir = MODULE_ROOT) {
  const model = await buildLedgerEnrichment(rootDir);
  let byteIdenticalToExisting = true;
  for (const [relativePath, expected] of Object.entries(model.artifacts)) {
    let actual = null;
    try {
      actual = await readFile(join(rootDir, relativePath), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (actual !== expected) {
      byteIdenticalToExisting = false;
      await atomicWrite(join(rootDir, relativePath), expected);
    }
  }
  return {
    ...model.stats,
    records: model.records.length,
    byte_identical_to_existing: byteIdenticalToExisting,
  };
}

export async function checkLedgerEnrichment(rootDir = MODULE_ROOT) {
  const model = await buildLedgerEnrichment(rootDir);
  for (const relativePath of ENRICHMENT_OUTPUTS) {
    const actual = await readFile(join(rootDir, relativePath), 'utf8');
    assert.equal(actual, model.artifacts[relativePath], `content mismatch: ${relativePath}`);
  }
  return { ...model.stats, records: model.records.length };
}

async function verifyByteIdentical(rootDir) {
  await generateLedgerEnrichment(rootDir);
  const before = await Promise.all(ENRICHMENT_OUTPUTS.map((path) => readFile(join(rootDir, path))));
  const result = await generateLedgerEnrichment(rootDir);
  const after = await Promise.all(ENRICHMENT_OUTPUTS.map((path) => readFile(join(rootDir, path))));
  assert.equal(result.byte_identical_to_existing, true);
  assert.deepEqual(after, before);
  return result;
}

async function runCli() {
  const args = process.argv.slice(2);
  assert(args.length <= 1, `unexpected arguments: ${args.join(' ')}`);
  if (args[0] === '--check') {
    const result = await checkLedgerEnrichment(MODULE_ROOT);
    process.stdout.write(`checked: enrichment=${result.records}\n`);
    return;
  }
  if (args[0] === 'verify-byte-identical') {
    const result = await verifyByteIdentical(MODULE_ROOT);
    process.stdout.write(`byte-identical: enrichment=${result.records}\n`);
    return;
  }
  assert(args.length === 0, `unknown argument: ${args[0]}`);
  const result = await generateLedgerEnrichment(MODULE_ROOT);
  process.stdout.write(
    `generated: enrichment=${result.records}, byte_identical=${result.byte_identical_to_existing}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
