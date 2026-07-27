import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const FROZEN_INPUT = 'ledger/effective_canonicals.jsonl';
const FROZEN_INPUT_SHA256 = '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294';
const ENTITY_SEMANTICS_INPUT = 'ledger/entity-semantics.jsonl';
const ENTITY_SEMANTICS_SHA256 = '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a';
const IDENTITY_GOLD_INPUT = 'coordinate-review/identity-adjudication-gold.json';
const SOURCE_MANIFEST_SHA256 = '2d2b1029a6b5807ad6592dc7ef3cbe9c098cadca89ff7832fcf8381aa0c66322';
const ROUND1_REVIEW_SHA256 = 'cba582501b22a3f7b7e31deae5d627c5d95ff7cd98dbc67bcb98302d02b0e25f';
const PACKAGE_RELATIVE_DIR = 'coordinate-review/pilot';
const ATTEMPT_RELATIVE_DIR = 'coordinate-review/round2-attempt';
const ENTITY_ATTEMPT_RELATIVE_DIR = 'coordinate-review/round2-entity-semantics-attempt';
const USER_AGENT = 'PeakTrekkerCoordinateReview/0.2 (+https://peak-trekker.vercel.app)';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const OVERPASS_INTERVAL_MS = 1_500;
const NOMINATIM_INTERVAL_MS = 1_100;
const MAX_TARGET_NAMES = 16;
const MAX_OVERPASS_CANDIDATES = 24;
const MAX_OVERPASS_PARTITIONS = 4;
const OVERPASS_AROUND_RADIUS_M = 120_000;
const DEFAULT_PARENT_ANCHOR_RADIUS_M = 25_000;
const MAX_PARENT_ANCHOR_CANDIDATES = 24;
const CLASSIFIER_VERSION = 'fu51-coordinate-review-round2e-overlap-safe-parent-anchor-consensus';
export const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const MAILRU_OVERPASS_ENDPOINT = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const ALLOWED_OVERPASS_ENDPOINTS = new Set([
  DEFAULT_OVERPASS_ENDPOINT,
  MAILRU_OVERPASS_ENDPOINT,
]);
const ADAPTER_VERSION = 'fu51-coordinate-review-pilot-v3-entity-semantics';

const MOUNTAIN_CLASS_IDS = new Set(['Q8502', 'Q207326']);
const RANGE_CLASS_IDS = new Set(['Q46831']);
const TRUSTED_PARENT_WIKIDATA_CLASS_IDS = new Set([...MOUNTAIN_CLASS_IDS, ...RANGE_CLASS_IDS]);
const TRUSTED_PARENT_OSM_NATURAL_VALUES = new Set(['peak', 'ridge', 'mountain_range']);
const CHINA_QID = 'Q148';
const CROSS_BORDER_COUNTRY_IDS_BY_KEY = Object.freeze({
  'qiaogeli-feng-k2': ['Q843'],
  'broad-peak': ['Q843'],
});
const CROSS_BORDER_ISO_BY_KEY = Object.freeze({
  'qiaogeli-feng-k2': ['CN', 'PK'],
  'broad-peak': ['CN', 'PK'],
});
const PROVINCE_ISO = Object.freeze({
  '安徽省': 'CN-AH',
  '广东省': 'CN-GD',
  '贵州省': 'CN-GZ',
  '河南省': 'CN-HA',
  '湖北省': 'CN-HB',
  '湖南省': 'CN-HN',
  '江苏省': 'CN-JS',
  '江西省': 'CN-JX',
  '辽宁省': 'CN-LN',
  '青海省': 'CN-QH',
  '山东省': 'CN-SD',
  '山西省': 'CN-SX',
  '陕西省': 'CN-SN',
  '四川省': 'CN-SC',
  '西藏自治区': 'CN-XZ',
  '新疆维吾尔自治区': 'CN-XJ',
  '云南省': 'CN-YN',
});

export const PILOT_KEYS = Object.freeze([
  'huashan',
  'hengshan-shanxi',
  'hengshan-hunan',
  'siguniang-dafeng',
  'siguniang-yaomei-feng',
  'qiaogeli-feng-k2',
  'gongga-jiazi-feng',
  'tianhua-shan',
  'taishan',
  'huangshan',
  'emeishan',
  'songshan',
  'wutaishan',
  'wudangshan',
  'baiyun-shan-guangdong',
  'baiyun-shan-luoyang',
  'ling-shan-jiangsu',
  'ling-shan-jiangxi',
  'yuntai-shan-guizhou',
  'yuntai-shan-henan',
  'siguniang-erfeng',
  'siguniang-sanfeng',
  'siguniang-luotuo-feng',
  'gongga-shan',
  'gongga-riwuqie-feng',
  'gongga-leduomanyin-feng',
  'yuzhu-feng',
  'yuzhu-yuxu-feng',
  'bogeda-feng',
  'broad-peak',
  'muztagata-feng',
  'kawagebo',
  'namchabarwa',
  'cang-shan',
  'dawagengza',
  'zhuoer-shan',
  'gangrenboqi-cluster',
  'weizhou-volcanic-landform-route',
]);

export const CREDIBLE_SOURCE_POLICY_V2 = Object.freeze({
  version: 2,
  p248: Object.freeze({
    Q88313479: Object.freeze({ family: 'osm', credible: true, label: 'OpenTopoMap' }),
  }),
  official_host_suffixes: Object.freeze(['gov.cn']),
  survey_gazetteer_hosts: Object.freeze([]),
  osm_host_suffixes: Object.freeze(['openstreetmap.org', 'opentopomap.org']),
  dependency_only_host_suffixes: Object.freeze(['wikipedia.org', 'wikimedia.org']),
  rejected_host_suffixes: Object.freeze([
    'blogspot.com', 'facebook.com', 'instagram.com', 'reddit.com', 'weibo.com', 'x.com', 'zhihu.com',
  ]),
  default: 'non_credible',
});

const BASE_ADAPTERS = Object.freeze({
  wikidata: Object.freeze({
    id: 'wikidata', version: ADAPTER_VERSION, policy_version: CREDIBLE_SOURCE_POLICY_V2.version,
    license: 'CC0 1.0', attribution: 'Wikidata contributors',
    license_url: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  }),
  open_meteo_glo90: Object.freeze({
    id: 'open_meteo_glo90', version: ADAPTER_VERSION,
    license: 'See source documentation', attribution: 'Open-Meteo / Copernicus DEM GLO-90',
    license_url: 'https://open-meteo.com/en/docs/elevation-api',
    dataset_version: 'Copernicus DEM GLO-90 through Open-Meteo elevation API on collection date',
    sampling_method: 'one point request per target_exact observation',
    nodata_handling: 'null response value is retained as terrain unavailable',
    vertical_datum: 'not supplied by adapter response; consult source documentation',
  }),
  opentopodata_srtm90: Object.freeze({
    id: 'opentopodata_srtm90', version: ADAPTER_VERSION,
    license: 'See source documentation', attribution: 'OpenTopoData / SRTM90m',
    license_url: 'https://www.opentopodata.org/#public-api',
    dataset_version: 'SRTM90m through OpenTopoData public API on collection date',
    sampling_method: 'one point request per target_exact observation',
    nodata_handling: 'null response value is retained as terrain unavailable',
    vertical_datum: 'not supplied by adapter response; consult source documentation',
  }),
});

export function resolveOverpassEndpoint(value = DEFAULT_OVERPASS_ENDPOINT) {
  let endpoint;
  try {
    endpoint = new URL(value).toString().replace(/\/$/u, '');
  } catch {
    throw new Error(`invalid Overpass endpoint: ${value}`);
  }
  assert(ALLOWED_OVERPASS_ENDPOINTS.has(endpoint), `unknown Overpass endpoint: ${endpoint}`);
  return endpoint;
}

export function adaptersForOverpassEndpoint(value = DEFAULT_OVERPASS_ENDPOINT) {
  const endpoint = resolveOverpassEndpoint(value);
  return Object.freeze({
    ...BASE_ADAPTERS,
    osm: Object.freeze({
      id: 'osm', version: ADAPTER_VERSION, endpoint,
      source_family: 'osm', transport_host: new URL(endpoint).hostname,
      license: 'ODbL 1.0', attribution: 'OpenStreetMap contributors',
      license_url: 'https://www.openstreetmap.org/copyright',
    }),
  });
}

export const ADAPTERS = adaptersForOverpassEndpoint();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => asciiCompare(left, right))
      .map(([key, child]) => [key, stableObject(child)]));
  }
  return value;
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

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseJsonl(text) {
  return text.trimEnd().split('\n').filter(Boolean).map(JSON.parse);
}

function uniq(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[（）()·\s_-]/g, '')
    .replace(/(山脉|山系)$/u, '')
    .toLowerCase();
}

function normalizeProvince(value) {
  return String(value || '')
    .replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/u, '')
    .replace(/^内蒙古/u, '内蒙古')
    .trim();
}

export function deriveCoordinateTarget(entity, semantics = entity.entity_semantics) {
  assert(entity, 'target entity is missing from frozen ledger');
  assert(semantics, `entity semantics missing for ${entity.effective_canonical_key}`);
  assert(semantics.effective_canonical_key === entity.effective_canonical_key, `entity semantics key mismatch for ${entity.effective_canonical_key}`);
  assert(semantics.semantic_status === 'confirmed', `pilot entity semantics unresolved for ${entity.effective_canonical_key}`);
  if (semantics.coordinate_target_role === 'route_highpoint') {
    return {
      catalog_entity_kind: semantics.catalog_entity_kind,
      coordinate_target_role: 'route_highpoint',
      verification_scope: semantics.verification_scope,
      target_definition_status: 'not_applicable',
      target_name: null,
    };
  }
  if (semantics.coordinate_target_role === 'none') {
    return {
      catalog_entity_kind: semantics.catalog_entity_kind,
      coordinate_target_role: 'none',
      verification_scope: semantics.verification_scope,
      target_definition_status: 'undefined',
      target_name: null,
    };
  }
  assert(['representative_highpoint', 'independent_summit'].includes(semantics.coordinate_target_role),
    `invalid coordinate target role for ${entity.effective_canonical_key}`);
  const targetName = semantics.coordinate_target_role === 'representative_highpoint'
    ? semantics.representative_highpoint_name
    : semantics.independent_summit_name;
  assert(targetName, `coordinate target name missing for ${entity.effective_canonical_key}`);
  return {
    catalog_entity_kind: semantics.catalog_entity_kind,
    coordinate_target_role: semantics.coordinate_target_role,
    verification_scope: semantics.verification_scope,
    target_definition_status: 'defined',
    target_name: targetName,
  };
}

export function targetNames(entity, semantics = entity.entity_semantics) {
  const target = deriveCoordinateTarget(entity, semantics);
  if (target.target_definition_status !== 'defined') return [];
  const stable = uniq((semantics.query_names || []).map((name) => String(name).trim()).filter(Boolean));
  assert(stable.length <= MAX_TARGET_NAMES, `${entity.effective_canonical_key} exceeds ${MAX_TARGET_NAMES} query names`);
  return stable;
}

export function exactTargetNames(entity, semantics = entity.entity_semantics) {
  const target = deriveCoordinateTarget(entity, semantics);
  if (target.target_definition_status !== 'defined') return [];
  const stable = uniq((semantics.exact_target_names || []).map((name) => String(name).trim()).filter(Boolean));
  assert(stable.length > 0, `${entity.effective_canonical_key} has no exact target names`);
  return stable;
}

function exactNameMatch(entity, target, semantics, matchedName) {
  if (target.target_definition_status !== 'defined') return false;
  return exactTargetNames(entity, semantics).map(normalizeName).includes(normalizeName(matchedName));
}

function provinceMatches(entity, regions) {
  if (!regions || regions.length === 0) return true;
  const expected = entity.provinces.map(normalizeProvince);
  const actual = regions.map(normalizeProvince);
  return expected.some((province) => actual.some((region) => region.includes(province) || province.includes(region)));
}

function isCrossBorderChina(entity, observation) {
  const countries = observation.country_ids || [];
  if (countries.includes(CHINA_QID) && countries.some((country) => country !== CHINA_QID)) return true;
  const accepted = CROSS_BORDER_COUNTRY_IDS_BY_KEY[entity.effective_canonical_key] || [];
  return countries.some((country) => accepted.includes(country));
}

function namesFromOsmTags(tags = {}) {
  return uniq(Object.entries(tags)
    .filter(([key]) => key === 'name' || key.startsWith('name:') || [
      'alt_name', 'official_name', 'loc_name', 'int_name', 'old_name', 'short_name',
    ].includes(key))
    .flatMap(([, value]) => String(value || '').split(';').map((name) => name.trim())));
}

export function classifyObservation(entity, observation, suppliedTarget = null, suppliedSemantics = null) {
  const semantics = suppliedSemantics || entity.entity_semantics;
  const target = suppliedTarget || deriveCoordinateTarget(entity, semantics);
  const classes = new Set([...(observation.p31_ids || []), ...(observation.p31_closure_ids || [])]);
  let coordinateRole = 'generalized';
  let excludedReason = null;

  if (target.target_definition_status === 'not_applicable') {
    coordinateRole = 'routehead';
    excludedReason = 'route corridor highpoint requires route geometry, not a summit point';
  } else if (target.target_definition_status === 'undefined') {
    coordinateRole = 'mountain_label';
    excludedReason = 'mountain area has no reliable representative highpoint definition';
  } else if (observation.match_kind === 'ambiguous') {
    excludedReason = 'same-name candidates could not be uniquely disambiguated';
  } else if (observation.match_kind === 'product-label') {
    coordinateRole = 'mountain_label';
    excludedReason = 'product entity label is query context, not the exact coordinate target';
  } else if ([...classes].some((value) => RANGE_CLASS_IDS.has(value))) {
    coordinateRole = 'massif_centroid';
    excludedReason = 'mountain-range coordinate is not the requested coordinate target';
  } else if (!exactNameMatch(entity, target, semantics, observation.matched_name)) {
    coordinateRole = normalizeName(observation.matched_name) === normalizeName(entity.primary_name)
      && target.coordinate_target_role === 'representative_highpoint' ? 'mountain_label' : 'generalized';
    excludedReason = 'label does not exactly identify the coordinate target';
  } else if (observation.adapter === 'osm-overpass-v2') {
    const osmNames = namesFromOsmTags(observation.osm_tags);
    if (!String(observation.osm_element || '').startsWith('node/')) {
      coordinateRole = 'wrong_entity';
      excludedReason = 'OSM summit candidate is not a node';
    } else if (observation.osm_tags?.natural !== 'peak') {
      coordinateRole = 'wrong_entity';
      excludedReason = 'OSM element is not natural=peak';
    } else if (osmNames.length === 0) {
      excludedReason = 'OSM peak has no usable name';
    } else {
      coordinateRole = 'target_exact';
    }
  } else if (observation.adapter?.startsWith('nominatim-')) {
    coordinateRole = 'mountain_label';
    excludedReason = 'Nominatim is administrative/label evidence only';
  } else if (observation.source_id === 'wikidata') {
    if (classes.size === 0) {
      excludedReason = 'Wikidata item has no P31 identity class';
    } else if (![...classes].some((value) => MOUNTAIN_CLASS_IDS.has(value))) {
      coordinateRole = 'wrong_entity';
      excludedReason = 'Wikidata class is not mountain/summit';
    } else {
      coordinateRole = 'target_exact';
    }
  }

  const adminConflict = Boolean(observation.admin_conflict)
    || (!isCrossBorderChina(entity, observation) && !provinceMatches(entity, observation.admin_hint || []));
  if (adminConflict && coordinateRole === 'target_exact') {
    coordinateRole = 'wrong_entity';
    excludedReason = 'administrative identity mismatch';
  }
  return {
    ...observation,
    admin_conflict: adminConflict,
    coordinate_role: coordinateRole,
    coordinate_target_role: target.coordinate_target_role,
    excluded_reason: coordinateRole === 'target_exact' ? null : excludedReason,
    target_locality_status: 'unknown',
    parent_anchor_ids: [],
    parent_anchor_distance_m: null,
    parent_anchor_status: 'unknown',
    trusted_parent_anchor_ids: [],
    selected_parent_anchor_ids: [],
    diagnostic_parent_anchor_ids: [],
    parent_anchor_reasons: [],
    anchor_candidate_classification: 'not_candidate',
    parent_anchor_reason: null,
    parent_anchor_outlier: false,
    parent_anchor_outlier_ids: [],
    parent_anchor_clusters: [],
    parent_anchor_maximal_clusters: [],
    parent_anchor_overlapping_cluster_relationships: [],
    parent_anchor_top_score: null,
    parent_anchor_top_score_tie: false,
    parent_anchor_top_score_cluster_ids: [],
    parent_anchor_pairwise_distances_m: [],
    parent_anchor_radius_m: null,
    diagnostic_seed_distance_m: null,
    identity_eligible: coordinateRole === 'target_exact',
  };
}

function hasCoordinate(row) {
  return Number.isFinite(row?.latitude) && Number.isFinite(row?.longitude);
}

function parentAnchorRadiusM(semantics) {
  const configured = semantics?.parent_anchor_radius_m;
  if (configured === undefined || configured === null) return DEFAULT_PARENT_ANCHOR_RADIUS_M;
  assert(Number.isFinite(configured) && configured > 0,
    `invalid parent anchor radius for ${semantics.effective_canonical_key}`);
  return configured;
}

function parentEntityNames(entity) {
  return new Set([entity.primary_name, ...(entity.aliases || [])]
    .filter(Boolean)
    .map((value) => normalizeName(value))
    .filter(Boolean));
}

function parentAnchorSourceType(row) {
  if (row.observation_id?.startsWith('seed:')) return 'seed';
  if (row.adapter?.startsWith('nominatim-')) return 'nominatim';
  if (row.source_id === 'wikidata') return 'wikidata';
  if (row.adapter === 'osm-overpass-v2' || row.source_id === 'osm') return 'osm';
  return row.source_id || 'unknown';
}

function classifyParentAnchor(entity, row) {
  if (!hasCoordinate(row)) {
    return { classification: 'rejected', reason: 'parent anchor has no coordinate' };
  }
  if (row.admin_conflict) {
    return { classification: 'rejected', reason: 'parent anchor administrative identity mismatch' };
  }
  if (row.coordinate_role === 'wrong_entity') {
    return { classification: 'rejected', reason: row.excluded_reason || 'parent anchor is a wrong entity' };
  }
  if (row.coordinate_role === 'target_exact') {
    return { classification: 'not_candidate', reason: 'target exact observations cannot anchor the parent mountain' };
  }
  const matchedName = normalizeName(row.matched_name || row.osm_tags?.name || '');
  if (!parentEntityNames(entity).has(matchedName)) {
    return { classification: 'rejected', reason: 'parent anchor name does not identify the product mountain entity' };
  }
  if (row.adapter?.startsWith('nominatim-')) {
    return { classification: 'diagnostic', reason: 'Nominatim labels are diagnostic only' };
  }
  if (row.source_id === 'wikidata') {
    const classes = new Set([...(row.p31_ids || []), ...(row.p31_closure_ids || [])]);
    if ([...classes].some((value) => TRUSTED_PARENT_WIKIDATA_CLASS_IDS.has(value))) {
      return { classification: 'candidate', reason: 'Wikidata product-mountain class is allowlisted' };
    }
    return {
      classification: 'diagnostic',
      reason: classes.size === 0
        ? 'Wikidata product label lacks an allowed natural-entity class'
        : 'Wikidata product label has a non-mountain or non-range class',
    };
  }
  if (row.adapter === 'osm-overpass-v2' || row.source_id === 'osm') {
    if (TRUSTED_PARENT_OSM_NATURAL_VALUES.has(row.osm_tags?.natural)) {
      return { classification: 'candidate', reason: 'OSM product-mountain tag is allowlisted' };
    }
    return { classification: 'diagnostic', reason: 'OSM product label lacks an allowed mountain-semantic tag' };
  }
  return { classification: 'diagnostic', reason: 'parent anchor source is not in the trusted-source contract' };
}

function parentAnchorEvidence(entity, classified) {
  const evidence = classified.map((row) => {
    const anchor = classifyParentAnchor(entity, row);
    return {
      id: row.observation_id,
      latitude: row.latitude,
      longitude: row.longitude,
      source_type: parentAnchorSourceType(row),
      dependency_family: familyForObservation(row),
      classification: anchor.classification,
      reason: anchor.reason,
      administrative_identity_check: row.admin_conflict ? 'failed' : 'passed',
      category_check: anchor.classification === 'candidate' ? 'passed' : 'not_candidate',
    };
  }).filter((row) => row.classification !== 'not_candidate');
  if (entity.gps?.present && hasCoordinate(entity.gps)) {
    evidence.push({
      id: `seed:${entity.effective_canonical_key}`,
      latitude: entity.gps.latitude,
      longitude: entity.gps.longitude,
      source_type: 'seed',
      dependency_family: 'seed',
      classification: 'diagnostic',
      reason: 'frozen seed coordinate is diagnostic only',
      administrative_identity_check: 'not_applicable',
      category_check: 'not_candidate',
    });
  }
  return evidence.sort((left, right) => asciiCompare(left.id, right.id));
}

function roundedMeters(value) {
  return Math.round(value * 10) / 10;
}

function anchorPair(left, right) {
  return {
    left_anchor_id: left.id,
    right_anchor_id: right.id,
    distance_m: roundedMeters(haversineMeters(left.latitude, left.longitude, right.latitude, right.longitude)),
  };
}

function clusterAnchorRecord(candidates) {
  const sorted = [...candidates].sort((left, right) => asciiCompare(left.id, right.id));
  const pairwiseDistances = [];
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      pairwiseDistances.push(anchorPair(sorted[left], sorted[right]));
    }
  }
  const families = [...new Set(sorted.map((row) => row.dependency_family))].sort(asciiCompare);
  const familyVotes = families.map((family) => {
    const members = sorted.filter((row) => row.dependency_family === family);
    const selected = members[0];
    return {
      dependency_family: family,
      observation_id: selected.id,
      duplicate_observation_ids: members.slice(1).map((row) => row.id),
    };
  });
  return {
    cluster_id: `parent-cluster:${sha256(Buffer.from(sorted.map((row) => row.id).join('\u0000'))).slice(0, 16)}`,
    observation_ids: sorted.map((row) => row.id),
    dependency_families: families,
    administrative_identity_checks: sorted.map((row) => ({
      observation_id: row.id,
      result: row.administrative_identity_check || 'passed',
    })),
    category_checks: sorted.map((row) => ({
      observation_id: row.id,
      result: row.category_check || 'passed',
    })),
    family_votes: familyVotes,
    independent_source_family_count: families.length,
    max_pairwise_distance_m: Math.max(0, ...pairwiseDistances.map((row) => row.distance_m)),
    pairwise_distances_m: pairwiseDistances,
  };
}

function anchorCoordinateCompare(left, right) {
  return left.latitude - right.latitude
    || left.longitude - right.longitude
    || asciiCompare(left.dependency_family, right.dependency_family)
    || asciiCompare(left.id, right.id);
}

function maximalCompleteLinkClusters(candidates, radiusM) {
  assert(candidates.length <= MAX_PARENT_ANCHOR_CANDIDATES,
    `parent-anchor candidate count exceeds ${MAX_PARENT_ANCHOR_CANDIDATES}`);
  if (candidates.length === 0) return [];
  const vertices = [...candidates].sort(anchorCoordinateCompare);
  const byId = new Map(vertices.map((anchor) => [anchor.id, anchor]));
  const neighbors = new Map(vertices.map((anchor) => [anchor.id, new Set()]));
  for (let left = 0; left < vertices.length; left += 1) {
    for (let right = left + 1; right < vertices.length; right += 1) {
      if (haversineMeters(vertices[left].latitude, vertices[left].longitude,
        vertices[right].latitude, vertices[right].longitude) <= radiusM) {
        neighbors.get(vertices[left].id).add(vertices[right].id);
        neighbors.get(vertices[right].id).add(vertices[left].id);
      }
    }
  }
  const cliques = [];
  const visit = (selected, possible, excluded) => {
    if (possible.size === 0 && excluded.size === 0) {
      cliques.push([...selected].map((id) => byId.get(id)).sort(anchorCoordinateCompare));
      return;
    }
    const union = new Set([...possible, ...excluded]);
    const pivot = [...union].sort((left, right) => {
      const rightCount = [...possible].filter((id) => neighbors.get(right).has(id)).length;
      const leftCount = [...possible].filter((id) => neighbors.get(left).has(id)).length;
      return rightCount - leftCount || anchorCoordinateCompare(byId.get(left), byId.get(right));
    })[0] || null;
    const candidatesToVisit = [...possible].filter((id) => !pivot || !neighbors.get(pivot).has(id))
      .sort((left, right) => anchorCoordinateCompare(byId.get(left), byId.get(right)));
    for (const id of candidatesToVisit) {
      const linked = neighbors.get(id);
      visit(
        new Set([...selected, id]),
        new Set([...possible].filter((candidate) => linked.has(candidate))),
        new Set([...excluded].filter((candidate) => linked.has(candidate))),
      );
      possible.delete(id);
      excluded.add(id);
    }
  };
  visit(new Set(), new Set(vertices.map((anchor) => anchor.id)), new Set());
  return cliques.map(clusterAnchorRecord)
    .sort((left, right) => asciiCompare(left.cluster_id, right.cluster_id));
}

function overlappingClusterRelationships(clusters) {
  const relationships = [];
  for (let left = 0; left < clusters.length; left += 1) {
    for (let right = left + 1; right < clusters.length; right += 1) {
      const shared = clusters[left].observation_ids.filter((id) => clusters[right].observation_ids.includes(id)).sort(asciiCompare);
      if (shared.length > 0) {
        relationships.push({
          left_cluster_id: clusters[left].cluster_id,
          right_cluster_id: clusters[right].cluster_id,
          shared_observation_ids: shared,
        });
      }
    }
  }
  return relationships.sort((left, right) => asciiCompare(left.left_cluster_id, right.left_cluster_id)
    || asciiCompare(left.right_cluster_id, right.right_cluster_id));
}

function dependencyVoteAudit(clusters) {
  const audit = {
    checked_cluster_count: clusters.length,
    consistency_violation_count: 0,
    declared_family_vote_count: 0,
    duplicate_observation_count: 0,
    unique_family_count: 0,
  };
  for (const cluster of clusters) {
    const clusterIds = new Set(cluster.observation_ids || []);
    const declaredFamilies = new Set(cluster.dependency_families || []);
    const votes = cluster.family_votes || [];
    const voteFamilies = new Set(votes.map((vote) => vote.dependency_family));
    const voteObservationIds = new Set();
    const voteIds = [];
    for (const vote of votes) {
      const members = [vote.observation_id, ...(vote.duplicate_observation_ids || [])];
      for (const observationId of members) {
        voteIds.push(observationId);
        voteObservationIds.add(observationId);
      }
      audit.duplicate_observation_count += (vote.duplicate_observation_ids || []).length;
    }
    audit.declared_family_vote_count += votes.length;
    audit.unique_family_count += declaredFamilies.size;
    if (cluster.independent_source_family_count !== declaredFamilies.size) audit.consistency_violation_count += 1;
    if (votes.length !== declaredFamilies.size || voteFamilies.size !== declaredFamilies.size) audit.consistency_violation_count += 1;
    if ([...voteFamilies].some((family) => !declaredFamilies.has(family))) audit.consistency_violation_count += 1;
    if (voteObservationIds.size !== voteIds.length || voteObservationIds.size !== clusterIds.size) audit.consistency_violation_count += 1;
    if ([...voteObservationIds].some((observationId) => !clusterIds.has(observationId))) audit.consistency_violation_count += 1;
  }
  return audit;
}

export function buildParentAnchorConsensus(anchors, radiusM = DEFAULT_PARENT_ANCHOR_RADIUS_M) {
  assert(Number.isFinite(radiusM) && radiusM > 0, 'parent-anchor radius must be positive');
  const candidates = anchors.filter((row) => row.classification === 'candidate' && hasCoordinate(row))
    .sort(anchorCoordinateCompare);
  const candidateIds = new Set();
  for (const candidate of candidates) {
    assert(!candidateIds.has(candidate.id), `duplicate parent-anchor candidate observation id: ${candidate.id}`);
    candidateIds.add(candidate.id);
  }
  const allPairwiseDistances = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      allPairwiseDistances.push(anchorPair(candidates[left], candidates[right]));
    }
  }
  const clusters = maximalCompleteLinkClusters(candidates, radiusM);
  const overlapRelationships = overlappingClusterRelationships(clusters);
  const maxScore = Math.max(0, ...clusters.map((row) => row.independent_source_family_count));
  const highest = clusters.filter((row) => row.independent_source_family_count === maxScore);
  const selectedCluster = highest.length === 1 && maxScore >= 2 ? highest[0] : null;
  const status = clusters.length === 0
    ? 'unknown'
    : selectedCluster ? 'consensus'
      : clusters.length === 1 ? 'single_source'
        : 'conflict';
  const selectedIds = selectedCluster?.observation_ids || [];
  const outlierIds = selectedCluster
    ? candidates.map((row) => row.id).filter((id) => !selectedIds.includes(id)).sort(asciiCompare)
    : [];
  const rawDuplicateCount = clusters.reduce((sum, cluster) => sum
    + cluster.family_votes.reduce((inner, vote) => inner + vote.duplicate_observation_ids.length, 0), 0);
  const voteAudit = dependencyVoteAudit(clusters);
  return {
    status,
    radius_m: radiusM,
    candidates,
    clusters,
    maximal_clusters: clusters,
    overlapping_cluster_relationships: overlapRelationships,
    top_score: maxScore,
    top_score_tie: highest.length > 1,
    top_score_cluster_ids: highest.map((cluster) => cluster.cluster_id).sort(asciiCompare),
    selected_cluster: selectedCluster,
    selected_anchor_ids: selectedIds,
    outlier_ids: outlierIds,
    all_pairwise_distances_m: allPairwiseDistances,
    raw_same_family_observation_count: rawDuplicateCount,
    dependency_vote_audit: voteAudit,
    dependency_duplicate_vote_count: voteAudit.consistency_violation_count,
  };
}

export function classifyEntityObservations(entity, observations, suppliedTarget = null, suppliedSemantics = null) {
  const semantics = suppliedSemantics || entity.entity_semantics;
  const target = suppliedTarget || deriveCoordinateTarget(entity, semantics);
  const initial = observations.map((row) => classifyObservation(entity, row, target, semantics));
  if (target.coordinate_target_role !== 'representative_highpoint') {
    return initial.map((row) => ({
      ...row,
      target_locality_status: row.coordinate_role === 'target_exact' ? 'matched' : 'unknown',
      parent_anchor_ids: [],
      parent_anchor_distance_m: null,
      parent_anchor_status: 'not_applicable',
      trusted_parent_anchor_ids: [],
      selected_parent_anchor_ids: [],
      diagnostic_parent_anchor_ids: [],
      parent_anchor_reasons: [],
      anchor_candidate_classification: 'not_candidate',
      parent_anchor_reason: null,
      parent_anchor_outlier: false,
      parent_anchor_outlier_ids: [],
      parent_anchor_clusters: [],
      parent_anchor_maximal_clusters: [],
      parent_anchor_overlapping_cluster_relationships: [],
      parent_anchor_top_score: null,
      parent_anchor_top_score_tie: false,
      parent_anchor_top_score_cluster_ids: [],
      parent_anchor_pairwise_distances_m: [],
      parent_anchor_radius_m: null,
      diagnostic_seed_distance_m: null,
      identity_eligible: row.coordinate_role === 'target_exact',
    }));
  }
  const evidence = parentAnchorEvidence(entity, initial);
  const radiusM = parentAnchorRadiusM(semantics);
  const consensus = buildParentAnchorConsensus(evidence, radiusM);
  const byId = new Map(evidence.map((anchor) => [anchor.id, anchor]));
  const anchorIds = consensus.selected_anchor_ids;
  const diagnosticIds = evidence.filter((anchor) => anchor.classification === 'diagnostic').map((anchor) => anchor.id);
  const anchorReasons = evidence.map((anchor) => `${anchor.classification}:${anchor.id}:${anchor.reason}`);
  // A single parent anchor never localizes or publishes a representative
  // highpoint. It can only reject a remote same-name duplicate when two
  // independent target observations already support the local identity.
  const singleAnchor = consensus.status === 'single_source' ? consensus.candidates[0] : null;
  const localTargetFamilies = new Set(initial.filter((row) => row.coordinate_role === 'target_exact'
    && row.identity_eligible
    && singleAnchor
    && haversineMeters(row.latitude, row.longitude, singleAnchor.latitude, singleAnchor.longitude) <= radiusM)
    .map(familyForObservation));
  const duplicatePeakOutlierIds = singleAnchor && localTargetFamilies.size >= 2
    ? initial.filter((row) => row.coordinate_role === 'target_exact'
      && row.identity_eligible
      && haversineMeters(row.latitude, row.longitude, singleAnchor.latitude, singleAnchor.longitude) > radiusM)
      .map((row) => row.observation_id)
    : [];
  return initial.map((row) => {
    const ownEvidence = byId.get(row.observation_id);
    const seedDistanceM = entity.gps?.present && hasCoordinate(entity.gps) && hasCoordinate(row)
      ? Math.round(haversineMeters(row.latitude, row.longitude, entity.gps.latitude, entity.gps.longitude) * 10) / 10
      : null;
    const common = {
      parent_anchor_status: consensus.status,
      parent_anchor_ids: anchorIds,
      trusted_parent_anchor_ids: anchorIds,
      selected_parent_anchor_ids: anchorIds,
      diagnostic_parent_anchor_ids: diagnosticIds,
      parent_anchor_reasons: anchorReasons,
      anchor_candidate_classification: ownEvidence?.classification || 'not_candidate',
      parent_anchor_reason: ownEvidence?.reason || null,
      parent_anchor_outlier: consensus.outlier_ids.includes(row.observation_id),
      parent_anchor_outlier_ids: consensus.outlier_ids,
      parent_anchor_clusters: consensus.clusters,
      parent_anchor_maximal_clusters: consensus.maximal_clusters,
      parent_anchor_overlapping_cluster_relationships: consensus.overlapping_cluster_relationships,
      parent_anchor_top_score: consensus.top_score,
      parent_anchor_top_score_tie: consensus.top_score_tie,
      parent_anchor_top_score_cluster_ids: consensus.top_score_cluster_ids,
      parent_anchor_pairwise_distances_m: consensus.all_pairwise_distances_m,
      parent_anchor_radius_m: radiusM,
      diagnostic_seed_distance_m: seedDistanceM,
    };
    if (row.coordinate_role !== 'target_exact') {
      return { ...row, ...common, identity_eligible: false };
    }
    if (duplicatePeakOutlierIds.includes(row.observation_id)) {
      return {
        ...row,
        ...common,
        coordinate_role: 'wrong_entity',
        excluded_reason: 'remote same-name target conflicts with independently supported local identity context',
        target_locality_status: 'unknown',
        parent_anchor_ids: [],
        parent_anchor_distance_m: null,
        identity_eligible: false,
      };
    }
    if (consensus.status !== 'consensus') {
      return {
        ...row,
        ...common,
        target_locality_status: 'unknown',
        parent_anchor_ids: [],
        parent_anchor_distance_m: null,
        identity_eligible: true,
      };
    }
    const selectedAnchors = consensus.candidates.filter((anchor) => anchorIds.includes(anchor.id));
    const distanceM = Math.min(...selectedAnchors.map((anchor) => haversineMeters(
      row.latitude, row.longitude, anchor.latitude, anchor.longitude,
    )));
    if (distanceM > radiusM) {
      return {
        ...row,
        ...common,
        coordinate_role: 'wrong_entity',
        excluded_reason: 'outside parent area',
        target_locality_status: 'outside_parent_area',
        parent_anchor_ids: anchorIds,
        parent_anchor_distance_m: Math.round(distanceM * 10) / 10,
        identity_eligible: false,
      };
    }
    return {
      ...row,
      ...common,
      target_locality_status: 'matched',
      parent_anchor_ids: anchorIds,
      parent_anchor_distance_m: Math.round(distanceM * 10) / 10,
      identity_eligible: true,
    };
  });
}

export function eligibleTargetExact(observations) {
  return observations.filter((row) => row.coordinate_role === 'target_exact'
    && row.admin_conflict === false
    && row.target_locality_status !== 'outside_parent_area'
    && row.identity_eligible === true);
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const radians = (value) => (value * Math.PI) / 180;
  const radius = 6_371_008.8;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function familyForObservation(observation) {
  if (observation.source_id === 'wikidata') {
    if (observation.dependency_family === 'osm') return 'osm';
    if (observation.dependency_family && !observation.dependency_family.startsWith('wikidata-unreferenced')) {
      return observation.dependency_family;
    }
    return 'wikidata';
  }
  if (observation.dependency_family) return observation.dependency_family;
  if (observation.source_id === 'osm') return 'osm';
  return observation.source_metadata?.qid ? `wikidata-unreferenced:${observation.source_metadata.qid}` : 'unknown';
}

export function assignDependencyClusters(observations) {
  const assigned = [];
  for (const observation of observations) {
    const family = familyForObservation(observation);
    const qid = observation.source_metadata?.qid || null;
    const sameFamily = family !== 'unknown' ? assigned.find((row) => familyForObservation(row) === family) : null;
    const sameQid = observation.source_id === 'wikidata' && qid
      ? assigned.find((row) => row.source_id === 'wikidata' && row.source_metadata?.qid === qid)
      : null;
    const nearUnknown = assigned.find((row) => {
      if (family !== 'unknown' && familyForObservation(row) !== 'unknown') return false;
      return haversineMeters(observation.latitude, observation.longitude, row.latitude, row.longitude) <= 5;
    });
    const existing = sameFamily || sameQid || nearUnknown;
    const seed = existing?.dependency_cluster_id
      || `cluster:${sha256(Buffer.from(family !== 'unknown' ? `family:${family}` : qid ? `qid:${qid}` : observation.observation_id)).slice(0, 16)}`;
    assigned.push({ ...observation, dependency_family: family, dependency_cluster_id: seed });
  }
  return assigned;
}

function pairs(observations) {
  const output = [];
  for (let left = 0; left < observations.length; left += 1) {
    for (let right = left + 1; right < observations.length; right += 1) {
      output.push({
        left_observation_id: observations[left].observation_id,
        right_observation_id: observations[right].observation_id,
        left_coordinate: { latitude: observations[left].latitude, longitude: observations[left].longitude },
        right_coordinate: { latitude: observations[right].latitude, longitude: observations[right].longitude },
        left_dependency_family: observations[left].dependency_family,
        right_dependency_family: observations[right].dependency_family,
        left_credibility: observations[left].credibility || 'non_credible',
        right_credibility: observations[right].credibility || 'non_credible',
        left_admin_conflict: Boolean(observations[left].admin_conflict),
        right_admin_conflict: Boolean(observations[right].admin_conflict),
        distance_m: Math.round(haversineMeters(
          observations[left].latitude, observations[left].longitude,
          observations[right].latitude, observations[right].longitude,
        ) * 10) / 10,
      });
    }
  }
  return output.sort((left, right) => asciiCompare(left.left_observation_id, right.left_observation_id)
    || asciiCompare(left.right_observation_id, right.right_observation_id));
}

function priority(observation) {
  const credible = observation.credibility === 'credible';
  if (credible && ['official', 'survey', 'gazetteer'].includes(observation.dependency_family)) return 0;
  if (credible && observation.source_id === 'osm' && observation.osm_source) return 1;
  if (credible && observation.source_id === 'osm') return 2;
  if (credible) return 3;
  if (observation.source_id === 'wikidata') return 4;
  if (observation.source_id === 'osm') return 5;
  return 6;
}

function selectObservation(observations) {
  return [...observations].filter((row) => !row.admin_conflict).sort((left, right) =>
    priority(left) - priority(right) || asciiCompare(left.observation_id, right.observation_id))[0] || null;
}

function buildObservationDemCheck(entity, observation) {
  const terrain = observation?.terrain || null;
  const altitudeGate = entity.altitude?.parse_quality === 'exact_literal'
    ? 'strict' : entity.altitude?.parse_quality === 'ambiguous_literal' ? 'weak' : 'skipped';
  if (!terrain || terrain.nodata || terrain.glo90_m === null || terrain.srtm90_m === null) {
    return {
      altitude_gate: altitudeGate,
      terrain_status: 'unavailable',
      glo90_m: terrain?.glo90_m ?? null,
      srtm90_m: terrain?.srtm90_m ?? null,
      glo90_request_id: terrain?.glo90_request_id ?? null,
      srtm90_request_id: terrain?.srtm90_request_id ?? null,
      osm_ele_m: observation?.osm_ele_m ?? null,
      dataset_difference_m: null,
      input_altitude_residual_m: null,
      osm_ele_residual_m: null,
      flagged: false,
      flag_reasons: ['terrain_unavailable'],
    };
  }
  const mean = (terrain.glo90_m + terrain.srtm90_m) / 2;
  const datasetDifference = Math.abs(terrain.glo90_m - terrain.srtm90_m);
  const datasetThreshold = Math.max(200, Math.abs(mean) * 0.03);
  const inputResidual = entity.altitude?.value_m === null ? null : Math.abs(entity.altitude.value_m - mean);
  const inputThreshold = entity.altitude?.value_m === null ? null : Math.max(150, entity.altitude.value_m * 0.03);
  const osmResidual = observation?.osm_ele_m === null || observation?.osm_ele_m === undefined
    ? null : Math.abs(observation.osm_ele_m - mean);
  const osmThreshold = observation?.osm_ele_m === null || observation?.osm_ele_m === undefined
    ? null : Math.max(150, Math.abs(observation.osm_ele_m) * 0.03);
  const reasons = [];
  if (datasetDifference > datasetThreshold) reasons.push('terrain_dataset_conflict');
  if (altitudeGate === 'strict' && inputResidual > inputThreshold) reasons.push('exact_altitude_dem_residual');
  if (osmResidual !== null && osmResidual > osmThreshold) reasons.push('osm_ele_dem_residual');
  return {
    altitude_gate: altitudeGate,
    terrain_status: reasons.includes('terrain_dataset_conflict') ? 'conflict' : reasons.length ? 'severe_residual' : 'healthy',
    glo90_m: terrain.glo90_m,
    srtm90_m: terrain.srtm90_m,
    glo90_request_id: terrain.glo90_request_id,
    srtm90_request_id: terrain.srtm90_request_id,
    osm_ele_m: observation?.osm_ele_m ?? null,
    dataset_difference_m: Math.round(datasetDifference * 10) / 10,
    input_altitude_residual_m: inputResidual === null ? null : Math.round(inputResidual * 10) / 10,
    osm_ele_residual_m: osmResidual === null ? null : Math.round(osmResidual * 10) / 10,
    flagged: reasons.length > 0,
    flag_reasons: reasons,
  };
}

function baseReview(entity, target) {
  return {
    effective_canonical_key: entity.effective_canonical_key,
    primary_name: entity.primary_name,
    primary_summit: entity.primary_summit || null,
    provinces: entity.provinces,
    entity_type: entity.entity_type,
    catalog_entity_kind: target.catalog_entity_kind,
    coordinate_target_role: target.coordinate_target_role,
    verification_scope: target.verification_scope,
    target_definition_status: target.target_definition_status,
    target_name: target.target_name,
    input_altitude: entity.altitude,
    seed_coordinate: entity.gps?.present ? { latitude: entity.gps.latitude, longitude: entity.gps.longitude } : null,
  };
}

export function buildReviewRecord(entity, observations, collection = {}, suppliedTarget = null, suppliedSemantics = null) {
  const semantics = suppliedSemantics || entity.entity_semantics;
  const target = suppliedTarget || deriveCoordinateTarget(entity, semantics);
  const base = baseReview(entity, target);
  if (target.target_definition_status === 'not_applicable') {
    return {
      ...base, reviewed_target_coordinate: null, collection_status: 'complete', coordinate_status: 'not_applicable',
      confidence: null, publishability: 'not_applicable', quarantine_reasons: [], selected_observation_id: null,
      selected_observation_dem: null, source_cluster_count: 0, credible_single_source_cluster_count: 0,
      credible_independent_cluster_count: 0, uncertainty_radius_m: null, seed_offset_m: null,
      parent_anchor_status: 'not_applicable', parent_anchor_ids: [], selected_parent_anchor_ids: [],
      trusted_parent_anchor_ids: [], diagnostic_parent_anchor_ids: [], parent_anchor_reasons: [],
      parent_anchor_outlier_ids: [], parent_anchor_clusters: [], parent_anchor_pairwise_distances_m: [],
      parent_anchor_maximal_clusters: [], parent_anchor_overlapping_cluster_relationships: [],
      parent_anchor_top_score: null, parent_anchor_top_score_tie: false, parent_anchor_top_score_cluster_ids: [],
      parent_anchor_radius_m: null, diagnostic_seed_distance_m: null,
      decision_rule: 'route corridors require a route highpoint derived from route geometry', source_outcomes: {},
      evidence_source_ids: [], target_exact_observation_ids: [], pairwise_target_exact_distances_m: [], observation_ids: [],
    };
  }
  if (target.target_definition_status === 'undefined') {
    return {
      ...base, reviewed_target_coordinate: null, collection_status: 'complete', coordinate_status: 'needs_target_definition',
      confidence: null, publishability: 'blocked', quarantine_reasons: ['representative_highpoint_undefined'], selected_observation_id: null,
      selected_observation_dem: null, source_cluster_count: 0, credible_single_source_cluster_count: 0,
      credible_independent_cluster_count: 0, uncertainty_radius_m: null, seed_offset_m: null,
      parent_anchor_status: 'not_applicable', parent_anchor_ids: [], selected_parent_anchor_ids: [],
      trusted_parent_anchor_ids: [], diagnostic_parent_anchor_ids: [], parent_anchor_reasons: [],
      parent_anchor_outlier_ids: [], parent_anchor_clusters: [], parent_anchor_pairwise_distances_m: [],
      parent_anchor_maximal_clusters: [], parent_anchor_overlapping_cluster_relationships: [],
      parent_anchor_top_score: null, parent_anchor_top_score_tie: false, parent_anchor_top_score_cluster_ids: [],
      parent_anchor_radius_m: null, diagnostic_seed_distance_m: null,
      decision_rule: 'mountain area has no reliable representative highpoint definition', source_outcomes: {},
      evidence_source_ids: [], target_exact_observation_ids: [], pairwise_target_exact_distances_m: [], observation_ids: [],
    };
  }

  const classified = assignDependencyClusters(classifyEntityObservations(entity, observations, target, semantics));
  const anchorContext = classified.find((row) => row.coordinate_role === 'target_exact')
    || classified.find((row) => row.parent_anchor_status)
    || {
      parent_anchor_status: 'unknown', parent_anchor_ids: [], selected_parent_anchor_ids: [],
      trusted_parent_anchor_ids: [], diagnostic_parent_anchor_ids: [], parent_anchor_reasons: [],
      parent_anchor_outlier_ids: [], parent_anchor_clusters: [], parent_anchor_pairwise_distances_m: [],
      parent_anchor_maximal_clusters: [], parent_anchor_overlapping_cluster_relationships: [],
      parent_anchor_top_score: null, parent_anchor_top_score_tie: false, parent_anchor_top_score_cluster_ids: [],
      parent_anchor_radius_m: null, diagnostic_seed_distance_m: null,
    };
  const exact = eligibleTargetExact(classified);
  const exactPairs = pairs(exact);
  const conflictPairs = exactPairs.filter((row) => row.distance_m > 300);
  const byCluster = new Map();
  for (const row of exact) {
    const current = byCluster.get(row.dependency_cluster_id);
    if (!current || priority(row) < priority(current)
      || (priority(row) === priority(current) && asciiCompare(row.observation_id, current.observation_id) < 0)) {
      byCluster.set(row.dependency_cluster_id, row);
    }
  }
  const independent = [...byCluster.values()];
  const credible = independent.filter((row) => row.credibility === 'credible');
  const credibleFamilies = new Set(credible.map((row) => row.dependency_family));
  const maxCredibleDistance = Math.max(0, ...pairs(credible).map((row) => row.distance_m));
  const localityUnknown = exact.some((row) => row.target_locality_status === 'unknown');
  const parentConsensusRequired = target.coordinate_target_role === 'representative_highpoint';
  const parentConsensusStatus = anchorContext.parent_anchor_status;
  const minimumComplete = Boolean(collection.minimum_sources_complete);
  const collectionStatus = minimumComplete ? 'complete' : collection.any_source_available ? 'partial' : 'unavailable';
  let coordinateStatus;
  let decisionRule;
  if (!minimumComplete) {
    coordinateStatus = 'blocked';
    decisionRule = 'minimum adapter set incomplete';
  } else if (conflictPairs.length > 0) {
    coordinateStatus = 'conflict';
    decisionRule = 'at least one target_exact pair differs by more than 300m';
  } else if (exact.length === 0) {
    coordinateStatus = 'missing';
    decisionRule = 'complete collection produced no target_exact observation';
  } else if (credibleFamilies.size >= 2 && maxCredibleDistance <= 100) {
    coordinateStatus = 'verified';
    decisionRule = 'two credible provenance-independent target_exact families agree within 100m';
  } else {
    coordinateStatus = 'reference';
    decisionRule = credibleFamilies.size >= 2
      ? 'credible provenance-independent target_exact families differ by 100-300m'
      : credibleFamilies.size === 1
        ? 'single credible target_exact source family'
        : 'target_exact exists but provenance is not credible';
  }

  const selectable = coordinateStatus === 'reference' || coordinateStatus === 'verified' ? exact : [];
  const selected = selectObservation(selectable);
  const demCheck = selected ? buildObservationDemCheck(entity, selected) : null;
  const missingEle = exact.some((row) => row.source_id === 'osm' && row.elevation_check === 'unavailable');
  if (coordinateStatus === 'verified' && (missingEle || !demCheck || demCheck.terrain_status !== 'healthy')) {
    coordinateStatus = 'reference';
    decisionRule = missingEle
      ? 'independent sources agree but selected OSM summit lacks elevation validation'
      : 'independent sources agree but selected observation terrain gate blocks verification';
  }
  if (coordinateStatus === 'verified' && localityUnknown) {
    coordinateStatus = 'reference';
    decisionRule = 'representative highpoint has no reliable parent anchor and requires review';
  }
  const quarantineReasons = [];
  if (conflictPairs.length) quarantineReasons.push('target_exact_pair_over_300m');
  if ((coordinateStatus === 'reference' || coordinateStatus === 'verified') && !selected) quarantineReasons.push('no_selectable_observation');
  if (parentConsensusRequired && parentConsensusStatus !== 'consensus') {
    quarantineReasons.push(parentConsensusStatus === 'conflict'
      ? 'parent_anchor_conflict'
      : parentConsensusStatus === 'single_source'
        ? 'parent_anchor_single_source'
        : 'parent_anchor_unknown');
  } else if (localityUnknown) {
    quarantineReasons.push('parent_anchor_unknown');
  }
  if (demCheck?.terrain_status === 'unavailable') quarantineReasons.push('terrain_unavailable');
  if (demCheck?.flagged) quarantineReasons.push(...demCheck.flag_reasons);
  const uniqueQuarantine = uniq(quarantineReasons).sort(asciiCompare);
  const reviewed = selected && uniqueQuarantine.length === 0
    ? { latitude: selected.latitude, longitude: selected.longitude } : null;
  const publishable = reviewed && credibleFamilies.size >= 1 && ['reference', 'verified'].includes(coordinateStatus)
    ? 'publishable' : uniqueQuarantine.length ? 'quarantined' : 'blocked';
  const maxDistance = Math.max(0, ...exactPairs.map((row) => row.distance_m));

  return {
    ...base,
    reviewed_target_coordinate: reviewed,
    collection_status: collectionStatus,
    coordinate_status: coordinateStatus,
    confidence: coordinateStatus === 'verified' ? 'verified' : coordinateStatus === 'reference' ? 'reference' : null,
    publishability: publishable,
    quarantine_reasons: uniqueQuarantine,
    selected_observation_id: selected?.observation_id || null,
    selected_observation_dem: demCheck,
    eligible_target_exact_count: exact.length,
    source_cluster_count: new Set(exact.map((row) => row.dependency_cluster_id)).size,
    credible_single_source_cluster_count: credibleFamilies.size >= 1 ? 1 : 0,
    credible_independent_cluster_count: credibleFamilies.size,
    uncertainty_radius_m: exact.length > 1 && maxDistance <= 300 ? maxDistance : null,
    seed_offset_m: base.seed_coordinate && reviewed
      ? Math.round(haversineMeters(base.seed_coordinate.latitude, base.seed_coordinate.longitude, reviewed.latitude, reviewed.longitude) * 10) / 10
      : null,
    decision_rule: decisionRule,
    source_outcomes: stableObject(collection.source_outcomes || {}),
    evidence_source_ids: uniq(classified.map((row) => row.source_id)).sort(asciiCompare),
    target_exact_observation_ids: exact.map((row) => row.observation_id).sort(asciiCompare),
    pairwise_target_exact_distances_m: exactPairs,
    observation_ids: classified.map((row) => row.observation_id).sort(asciiCompare),
    parent_anchor_status: anchorContext.parent_anchor_status,
    parent_anchor_ids: anchorContext.parent_anchor_ids,
    selected_parent_anchor_ids: anchorContext.selected_parent_anchor_ids,
    trusted_parent_anchor_ids: anchorContext.trusted_parent_anchor_ids,
    diagnostic_parent_anchor_ids: anchorContext.diagnostic_parent_anchor_ids,
    parent_anchor_reasons: anchorContext.parent_anchor_reasons,
    parent_anchor_outlier_ids: anchorContext.parent_anchor_outlier_ids,
    parent_anchor_clusters: anchorContext.parent_anchor_clusters,
    parent_anchor_maximal_clusters: anchorContext.parent_anchor_maximal_clusters,
    parent_anchor_overlapping_cluster_relationships: anchorContext.parent_anchor_overlapping_cluster_relationships,
    parent_anchor_top_score: anchorContext.parent_anchor_top_score,
    parent_anchor_top_score_tie: anchorContext.parent_anchor_top_score_tie,
    parent_anchor_top_score_cluster_ids: anchorContext.parent_anchor_top_score_cluster_ids,
    parent_anchor_pairwise_distances_m: anchorContext.parent_anchor_pairwise_distances_m,
    parent_anchor_radius_m: anchorContext.parent_anchor_radius_m,
    diagnostic_seed_distance_m: anchorContext.diagnostic_seed_distance_m,
  };
}

function countBy(rows, field) {
  return Object.fromEntries([...Map.groupBy(rows, (row) => row[field])]
    .sort(([left], [right]) => asciiCompare(String(left), String(right)))
    .map(([key, values]) => [key, values.length]));
}

function ratio(count, denominator) {
  return { count, denominator, rate: denominator ? count / denominator : null };
}

function decision(go) {
  return go ? 'GO' : 'NO-GO';
}

export function summarizeReviews(allEntities, observations, reviews, options = {}) {
  const mountains = reviews.filter((row) => row.target_definition_status !== 'not_applicable');
  const defined = reviews.filter((row) => row.target_definition_status === 'defined');
  const undefinedTargets = reviews.filter((row) => row.target_definition_status === 'undefined');
  const routes = reviews.filter((row) => row.target_definition_status === 'not_applicable');
  const representative = defined.filter((row) => row.coordinate_target_role === 'representative_highpoint');
  const independent = defined.filter((row) => row.coordinate_target_role === 'independent_summit');
  const exact = eligibleTargetExact(observations);
  const exactKeys = new Set(exact.map((row) => row.effective_canonical_key));
  const overpassInfra = defined.filter((row) => row.source_outcomes?.osm === 'infra_blocked').length;
  const sourceOutcomes = {};
  for (const review of defined) {
    for (const [source, outcome] of Object.entries(review.source_outcomes || {})) {
      sourceOutcomes[source] ||= {};
      sourceOutcomes[source][outcome] = (sourceOutcomes[source][outcome] || 0) + 1;
    }
  }
  const identityGold = {
    cases: 0,
    false_accept_count: 0,
    false_reject_count: 0,
    role_mismatch_count: 0,
    anchor_trust_mismatch_count: 0,
    cluster_mismatch_count: 0,
    id_permutation_mismatch_count: 0,
    input_order_mismatch_count: 0,
    sha256: null,
    ...(options.identity_gold || {}),
  };
  const parentAnchorAudit = {
    rows: [],
    representative_target_count: representative.length,
    with_trusted_anchor_count: 0,
    seed_only_count: 0,
    nominatim_only_count: 0,
    wrong_class_trusted_anchor_count: 0,
    seed_only_publishable_count: 0,
    nominatim_only_publishable_count: 0,
    consensus_count: 0,
    single_source_count: 0,
    conflict_count: 0,
    unknown_count: 0,
    anchor_outlier_count: 0,
    maximal_cluster_count: 0,
    top_score_tie_entity_count: 0,
    overlapping_top_cluster_entity_count: 0,
    id_permutation_mismatch_count: 0,
    input_order_mismatch_count: 0,
    top_score_tie_publishable_count: 0,
    non_consensus_publishable_count: 0,
    multi_cluster_publishable_count: 0,
    dependency_duplicate_vote_count: 0,
    source_family_duplicate_observation_count: 0,
    ...(options.parent_anchor_audit || {}),
  };
  const integrity = options.collection_integrity || {
    review_closure: false,
    request_cas_complete: false,
    manifest_valid: false,
    offline_render_byte_identical: false,
  };
  const semanticReadiness = options.semantic_readiness || { needs_review_count: null };
  const thresholds = {
    verified_minimum: options.auto_publish_thresholds?.verified_minimum ?? 3,
    double_cluster_rate_minimum: options.auto_publish_thresholds?.double_cluster_rate_minimum ?? 0.3,
    manual_gold_evaluable: options.auto_publish_thresholds?.manual_gold_evaluable ?? false,
  };
  const manualAccuracyGold = options.manual_accuracy_gold || {
    status: 'not_evaluable',
    false_verified_count: null,
  };
  const metrics = {
    pilot_entities: reviews.length,
    pilot_mountains: mountains.length,
    pilot_route_corridors: routes.length,
    target_definition_completeness: ratio(defined.length, mountains.length),
    coordinate_target_role_counts: countBy(reviews, 'coordinate_target_role'),
    representative_highpoint: {
      target_count: representative.length,
      exact_candidate_coverage: ratio(representative.filter((row) => exactKeys.has(row.effective_canonical_key)).length, representative.length),
      credible_single_source_coverage: ratio(representative.filter((row) => row.credible_single_source_cluster_count >= 1).length, representative.length),
      credible_independent_double_cluster_coverage: ratio(representative.filter((row) => row.credible_independent_cluster_count >= 2).length, representative.length),
      publishable_reference_coverage: ratio(representative.filter((row) => row.reviewed_target_coordinate && row.publishability === 'publishable').length, representative.length),
    },
    independent_summit: {
      target_count: independent.length,
      exact_candidate_coverage: ratio(independent.filter((row) => exactKeys.has(row.effective_canonical_key)).length, independent.length),
      credible_single_source_coverage: ratio(independent.filter((row) => row.credible_single_source_cluster_count >= 1).length, independent.length),
      credible_independent_double_cluster_coverage: ratio(independent.filter((row) => row.credible_independent_cluster_count >= 2).length, independent.length),
      publishable_reference_coverage: ratio(independent.filter((row) => row.reviewed_target_coordinate && row.publishability === 'publishable').length, independent.length),
    },
    route_highpoint: {
      target_count: routes.length,
      coordinate_status: 'not_applicable',
      note: 'Route highpoints require route geometry and are excluded from point-coordinate coverage.',
    },
    defined_target_exact_candidate_coverage: ratio(defined.filter((row) => exactKeys.has(row.effective_canonical_key)).length, defined.length),
    credible_single_source_coverage: ratio(defined.filter((row) => row.credible_single_source_cluster_count >= 1).length, defined.length),
    credible_independent_double_cluster_coverage: ratio(defined.filter((row) => row.credible_independent_cluster_count >= 2).length, defined.length),
    product_ready_target_coverage: ratio(mountains.filter((row) => row.reviewed_target_coordinate && row.publishability === 'publishable').length, mountains.length),
    needs_target_definition_count: undefinedTargets.length,
    route_corridor_not_applicable_count: routes.length,
    coordinate_status_counts: countBy(reviews, 'coordinate_status'),
    collection_status_counts: countBy(reviews, 'collection_status'),
    source_outcome_counts: stableObject(sourceOutcomes),
    overpass_infra_block_rate: defined.length ? overpassInfra / defined.length : null,
    overpass_infra_blocked_count: overpassInfra,
    publishable_reference_count: defined.filter((row) => row.coordinate_status === 'reference' && row.publishability === 'publishable').length,
    verified_count: defined.filter((row) => row.coordinate_status === 'verified').length,
    conflict_quarantine_count: defined.filter((row) => row.coordinate_status === 'conflict' && row.publishability === 'quarantined').length,
    false_verified_output_count: defined.filter((row) =>
      row.coordinate_status === 'verified' && row.publishability !== 'publishable').length,
    false_verified_manual_sample_status: manualAccuracyGold.status,
    false_verified_manual_sample_count: manualAccuracyGold.false_verified_count,
    admin_conflict_target_exact_count: observations.filter((row) => row.admin_conflict && row.coordinate_role === 'target_exact').length,
    identity_gold_cases: identityGold.cases,
    identity_gold_false_accept_count: identityGold.false_accept_count,
    identity_gold_false_reject_count: identityGold.false_reject_count,
    identity_gold_role_mismatch_count: identityGold.role_mismatch_count,
    identity_gold_anchor_trust_mismatch_count: identityGold.anchor_trust_mismatch_count,
    identity_gold_cluster_mismatch_count: identityGold.cluster_mismatch_count || 0,
    identity_gold_id_permutation_mismatch_count: identityGold.id_permutation_mismatch_count || 0,
    identity_gold_input_order_mismatch_count: identityGold.input_order_mismatch_count || 0,
    identity_gold_locality_mismatch_count: identityGold.locality_mismatch_count || 0,
    identity_gold_publishability_mismatch_count: identityGold.publishability_mismatch_count || 0,
    identity_gold_sha256: identityGold.sha256,
    eligible_target_exact_observation_count: exact.length,
    representative_target_count: parentAnchorAudit.representative_target_count,
    representative_with_trusted_anchor_count: parentAnchorAudit.with_trusted_anchor_count,
    representative_seed_only_count: parentAnchorAudit.seed_only_count,
    representative_nominatim_only_count: parentAnchorAudit.nominatim_only_count,
    seed_only_publishable_count: parentAnchorAudit.seed_only_publishable_count,
    nominatim_only_publishable_count: parentAnchorAudit.nominatim_only_publishable_count,
    wrong_class_trusted_anchor_count: parentAnchorAudit.wrong_class_trusted_anchor_count,
    parent_anchor_status_counts: {
      consensus: parentAnchorAudit.consensus_count,
      single_source: parentAnchorAudit.single_source_count,
      conflict: parentAnchorAudit.conflict_count,
      unknown: parentAnchorAudit.unknown_count,
    },
    anchor_outlier_count: parentAnchorAudit.anchor_outlier_count,
    maximal_cluster_count: parentAnchorAudit.maximal_cluster_count,
    top_score_tie_entity_count: parentAnchorAudit.top_score_tie_entity_count,
    overlapping_top_cluster_entity_count: parentAnchorAudit.overlapping_top_cluster_entity_count,
    id_permutation_mismatch_count: parentAnchorAudit.id_permutation_mismatch_count,
    input_order_mismatch_count: parentAnchorAudit.input_order_mismatch_count,
    top_score_tie_publishable_count: parentAnchorAudit.top_score_tie_publishable_count,
    non_consensus_publishable_count: parentAnchorAudit.non_consensus_publishable_count,
    multi_cluster_publishable_count: parentAnchorAudit.multi_cluster_publishable_count,
    dependency_duplicate_vote_count: parentAnchorAudit.dependency_duplicate_vote_count,
    source_family_duplicate_observation_count: parentAnchorAudit.source_family_duplicate_observation_count || 0,
    frozen_key_closure: { expected: 359, observed: allEntities.length },
  };
  const recallValidity = metrics.overpass_infra_block_rate > 0.15 ? 'tentative' : 'valid';
  const gates = {
    target_roles_12_17_7_2: representative.length === 12 && independent.length === 17
      && undefinedTargets.length === 7 && routes.length === 2,
    verified_at_least_three: metrics.verified_count >= 3,
    credible_single_source_coverage_at_least_70_percent: metrics.credible_single_source_coverage.rate >= 0.7,
    credible_double_cluster_coverage_at_least_30_percent: metrics.credible_independent_double_cluster_coverage.rate >= 0.3,
    overpass_infra_block_rate_at_most_15_percent: metrics.overpass_infra_block_rate <= 0.15,
    frozen_359_key_closure: allEntities.length === 359,
    false_verified_output_count_zero: metrics.false_verified_output_count === 0,
    parent_anchor_contract_clean: metrics.seed_only_publishable_count === 0
      && metrics.nominatim_only_publishable_count === 0
      && metrics.wrong_class_trusted_anchor_count === 0
      && metrics.non_consensus_publishable_count === 0
      && metrics.multi_cluster_publishable_count === 0
      && metrics.top_score_tie_publishable_count === 0
      && metrics.id_permutation_mismatch_count === 0
      && metrics.input_order_mismatch_count === 0
      && metrics.dependency_duplicate_vote_count === 0,
  };
  const collectionGo = integrity.review_closure
    && integrity.request_cas_complete
    && integrity.manifest_valid
    && metrics.overpass_infra_block_rate <= 0.15;
  const candidateReviewGo = identityGold.cases > 0
    && identityGold.false_accept_count === 0
    && identityGold.false_reject_count === 0
    && identityGold.role_mismatch_count === 0
    && identityGold.anchor_trust_mismatch_count === 0
    && (identityGold.cluster_mismatch_count || 0) === 0
    && (identityGold.id_permutation_mismatch_count || 0) === 0
    && (identityGold.input_order_mismatch_count || 0) === 0
    && (identityGold.locality_mismatch_count || 0) === 0
    && (identityGold.publishability_mismatch_count || 0) === 0
    && metrics.admin_conflict_target_exact_count === 0
    && metrics.seed_only_publishable_count === 0
    && metrics.nominatim_only_publishable_count === 0
    && metrics.wrong_class_trusted_anchor_count === 0
    && metrics.non_consensus_publishable_count === 0
    && metrics.multi_cluster_publishable_count === 0
    && metrics.top_score_tie_publishable_count === 0
    && metrics.id_permutation_mismatch_count === 0
    && metrics.input_order_mismatch_count === 0
    && metrics.dependency_duplicate_vote_count === 0
    && integrity.offline_render_byte_identical
    && metrics.false_verified_output_count === 0;
  const autoPublishGo = metrics.verified_count >= thresholds.verified_minimum
    && metrics.credible_independent_double_cluster_coverage.rate >= thresholds.double_cluster_rate_minimum
    && thresholds.manual_gold_evaluable
    && metrics.false_verified_manual_sample_status === 'evaluable'
    && metrics.false_verified_manual_sample_count === 0;
  const full359Go = semanticReadiness.needs_review_count === 0;
  return {
    classifier_version: CLASSIFIER_VERSION,
    collection_decision: decision(collectionGo),
    candidate_review_decision: decision(candidateReviewGo),
    auto_publish_decision: decision(autoPublishGo),
    full_359_target_run_decision: decision(full359Go),
    decision_reasons: {
      collection: collectionGo ? [] : [
        !integrity.review_closure && 'review_closure_incomplete',
        !integrity.request_cas_complete && 'request_or_cas_incomplete',
        !integrity.manifest_valid && 'manifest_invalid',
        metrics.overpass_infra_block_rate > 0.15 && 'overpass_infra_block_rate_exceeds_15_percent',
      ].filter(Boolean),
      candidate_review: candidateReviewGo ? [] : [
        identityGold.cases === 0 && 'identity_gold_missing',
        identityGold.false_accept_count > 0 && 'identity_gold_false_accept',
        identityGold.false_reject_count > 0 && 'identity_gold_false_reject',
        identityGold.role_mismatch_count > 0 && 'identity_gold_role_mismatch',
        identityGold.anchor_trust_mismatch_count > 0 && 'identity_gold_anchor_trust_mismatch',
        (identityGold.cluster_mismatch_count || 0) > 0 && 'identity_gold_cluster_mismatch',
        (identityGold.id_permutation_mismatch_count || 0) > 0 && 'identity_gold_id_permutation_mismatch',
        (identityGold.input_order_mismatch_count || 0) > 0 && 'identity_gold_input_order_mismatch',
        (identityGold.locality_mismatch_count || 0) > 0 && 'identity_gold_locality_mismatch',
        (identityGold.publishability_mismatch_count || 0) > 0 && 'identity_gold_publishability_mismatch',
        metrics.admin_conflict_target_exact_count > 0 && 'admin_conflict_target_exact',
        metrics.seed_only_publishable_count > 0 && 'seed_only_parent_anchor_publishable',
        metrics.nominatim_only_publishable_count > 0 && 'nominatim_only_parent_anchor_publishable',
        metrics.wrong_class_trusted_anchor_count > 0 && 'wrong_class_parent_anchor_trusted',
        metrics.non_consensus_publishable_count > 0 && 'non_consensus_parent_anchor_publishable',
        metrics.multi_cluster_publishable_count > 0 && 'multi_cluster_parent_anchor_publishable',
        metrics.top_score_tie_publishable_count > 0 && 'top_score_tie_parent_anchor_publishable',
        metrics.id_permutation_mismatch_count > 0 && 'parent_anchor_id_permutation_mismatch',
        metrics.input_order_mismatch_count > 0 && 'parent_anchor_input_order_mismatch',
        metrics.dependency_duplicate_vote_count > 0 && 'dependency_duplicate_parent_anchor_vote',
        !integrity.offline_render_byte_identical && 'offline_render_not_deterministic',
        metrics.false_verified_output_count > 0 && 'false_verified_output',
      ].filter(Boolean),
      auto_publish: autoPublishGo ? [] : [
        metrics.verified_count < thresholds.verified_minimum && 'verified_below_threshold',
        metrics.credible_independent_double_cluster_coverage.rate < thresholds.double_cluster_rate_minimum && 'independent_double_cluster_coverage_below_threshold',
        !thresholds.manual_gold_evaluable && 'geographic_accuracy_gold_not_evaluable',
        metrics.false_verified_manual_sample_count !== 0 && 'manual_false_verified_not_zero_or_unavailable',
      ].filter(Boolean),
      full_359_target_run: full359Go ? [] : [`entity_semantics_needs_review:${semanticReadiness.needs_review_count ?? 'unknown'}`],
    },
    recall_validity: recallValidity,
    metrics,
    gates,
    next_step: collectionGo && candidateReviewGo && !autoPublishGo
      ? 'A third independent coordinate source would only address auto-publish verification; it does not block reference-candidate review.'
      : !full359Go
        ? 'Complete remaining entity semantics before a full 359 target run; lack of a third coordinate source is not the blocking reason for this gate.'
        : 'No further classifier tuning is authorized by this package.',
  };
}

function exceptionsMarkdown(reviews) {
  const rows = reviews.filter((row) => !['verified', 'not_applicable'].includes(row.coordinate_status));
  const lines = ['# Coordinate Review Exceptions', '', '| Key | Name | Target | Collection | Coordinate | Publishability | Rule |', '|---|---|---|---|---|---|---|'];
  for (const row of rows.sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key))) {
    lines.push(`| ${row.effective_canonical_key} | ${row.primary_name} | ${row.target_definition_status} | ${row.collection_status} | ${row.coordinate_status} | ${row.publishability} | ${row.decision_rule} |`);
  }
  return `${lines.join('\n')}\n`;
}

function traceability(reviews, baselineRows) {
  const baseline = new Map(baselineRows.map((row) => [row.effective_canonical_key, row]));
  return [...reviews].sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key)).map((review) => {
    const old = baseline.get(review.effective_canonical_key) || {};
    const reasons = [];
    if (old.coordinate_status !== review.coordinate_status) reasons.push('coordinate_status_changed');
    if (review.target_definition_status === 'undefined') reasons.push('representative_highpoint_requires_definition');
    if (review.coordinate_status === 'conflict') reasons.push('target_exact_pair_over_300m');
    if (review.coordinate_status === 'blocked') reasons.push('minimum_source_collection_incomplete');
    if (reasons.length === 0) reasons.push('status_unchanged_under_round2_rules');
    return {
      effective_canonical_key: review.effective_canonical_key,
      old_coordinate_status: old.coordinate_status || null,
      new_coordinate_status: review.coordinate_status,
      old_selected_observation_id: old.selected_observation_id || null,
      new_selected_observation_id: review.selected_observation_id,
      target_definition_status: review.target_definition_status,
      catalog_entity_kind: review.catalog_entity_kind,
      coordinate_target_role: review.coordinate_target_role,
      source_outcomes: review.source_outcomes,
      change_reasons: reasons,
    };
  });
}

function conflictRows(reviews) {
  return reviews.flatMap((review) => review.pairwise_target_exact_distances_m
    .filter((pair) => pair.distance_m > 300)
    .map((pair) => ({ effective_canonical_key: review.effective_canonical_key, primary_name: review.primary_name, ...pair })))
    .sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key)
      || asciiCompare(left.left_observation_id, right.left_observation_id)
      || asciiCompare(left.right_observation_id, right.right_observation_id));
}

function anchorRecord(row) {
  return {
    anchor_id: row.observation_id,
    source_type: parentAnchorSourceType(row),
    dependency_family: row.dependency_family,
    latitude: row.latitude,
    longitude: row.longitude,
    administrative_identity_check: row.admin_conflict ? 'failed' : 'passed',
    category_check: row.anchor_candidate_classification === 'candidate' ? 'passed' : 'not_candidate',
    anchor_candidate_classification: row.anchor_candidate_classification,
    parent_anchor_outlier: Boolean(row.parent_anchor_outlier),
    reason: row.parent_anchor_reason,
  };
}

function localitySummary(rows) {
  const statuses = uniq(rows.map((row) => row.target_locality_status).filter(Boolean)).sort(asciiCompare);
  if (statuses.length === 0) return 'unknown';
  return statuses.length === 1 ? statuses[0] : 'mixed';
}

function isSeedOnlyAuditRow(row) {
  return row.parent_anchor_status === 'unknown'
    && row.diagnostic_parent_anchor_ids.length > 0
    && row.diagnostic_parent_anchor_ids.every((id) => id.startsWith('seed:'));
}

function isNominatimOnlyAuditRow(row) {
  return row.parent_anchor_status === 'unknown'
    && row.diagnostic_parent_anchor_ids.length > 0
    && row.diagnostic_parent_anchor_ids.every((id) => id.startsWith('nominatim:'));
}

function physicalClusterSignature(result, anchors) {
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  return result.maximal_clusters.map((cluster) => cluster.observation_ids.map((id) => {
    const anchor = byId.get(id);
    return `${anchor.latitude.toFixed(8)},${anchor.longitude.toFixed(8)},${anchor.dependency_family}`;
  }).sort(asciiCompare).join('|')).sort(asciiCompare);
}

function parentAnchorInvariance(candidates, radiusM) {
  const original = buildParentAnchorConsensus(candidates, radiusM);
  const reordered = buildParentAnchorConsensus([...candidates].reverse(), radiusM);
  const renamed = candidates.map((anchor, index) => ({ ...anchor, id: `permuted:${index}` }));
  const renamedResult = buildParentAnchorConsensus(renamed, radiusM);
  const signature = (result, anchors) => stableJson({
    status: result.status,
    top_score: result.top_score,
    top_score_tie: result.top_score_tie,
    clusters: physicalClusterSignature(result, anchors),
  });
  const expected = signature(original, candidates);
  return {
    id_permutation_match: expected === signature(renamedResult, renamed),
    input_order_match: expected === signature(reordered, [...candidates].reverse()),
  };
}

export function buildParentAnchorAudit(entities, observations, reviews, baselineRows = []) {
  const byEntity = new Map(entities.map((entity) => [entity.effective_canonical_key, entity]));
  const byBaseline = new Map(baselineRows.map((row) => [row.effective_canonical_key, row]));
  const representative = reviews.filter((row) => row.coordinate_target_role === 'representative_highpoint');
  const rows = representative.map((review) => {
    const entity = byEntity.get(review.effective_canonical_key);
    assert(entity, `missing entity for parent-anchor audit: ${review.effective_canonical_key}`);
    const classified = observations.filter((row) => row.effective_canonical_key === review.effective_canonical_key);
    const candidateRows = classified.filter((row) => row.anchor_candidate_classification !== 'not_candidate');
    const candidates = candidateRows.filter((row) => row.anchor_candidate_classification === 'candidate').map(anchorRecord);
    const diagnostic = candidateRows.filter((row) => row.anchor_candidate_classification === 'diagnostic').map(anchorRecord);
    const rejected = candidateRows.filter((row) => row.anchor_candidate_classification === 'rejected').map(anchorRecord);
    if (entity.gps?.present && hasCoordinate(entity.gps)) {
      diagnostic.push({
        anchor_id: `seed:${entity.effective_canonical_key}`,
        source_type: 'seed',
        latitude: entity.gps.latitude,
        longitude: entity.gps.longitude,
        classification: 'diagnostic',
        reason: 'frozen seed coordinate is diagnostic only',
      });
    }
    const baseline = byBaseline.get(review.effective_canonical_key) || {};
    const consensusCandidates = candidates.map((anchor) => ({
      id: anchor.anchor_id,
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      dependency_family: anchor.dependency_family,
      classification: 'candidate',
    }));
    const invariance = parentAnchorInvariance(consensusCandidates, review.parent_anchor_radius_m || DEFAULT_PARENT_ANCHOR_RADIUS_M);
    const maximalClusters = review.parent_anchor_maximal_clusters || review.parent_anchor_clusters;
    const topClusterIds = review.parent_anchor_top_score_cluster_ids || [];
    const overlappingTopClusters = (review.parent_anchor_overlapping_cluster_relationships || []).filter((relationship) =>
      topClusterIds.includes(relationship.left_cluster_id) && topClusterIds.includes(relationship.right_cluster_id));
    return {
      effective_canonical_key: review.effective_canonical_key,
      primary_name: review.primary_name,
      representative_highpoint_name: review.target_name,
      parent_anchor_status: review.parent_anchor_status,
      parent_anchor_ids: review.parent_anchor_ids,
      selected_parent_anchor_ids: review.selected_parent_anchor_ids,
      diagnostic_parent_anchor_ids: review.diagnostic_parent_anchor_ids,
      parent_anchor_reasons: review.parent_anchor_reasons,
      parent_anchor_radius_m: review.parent_anchor_radius_m,
      parent_anchor_pairwise_distances_m: review.parent_anchor_pairwise_distances_m,
      parent_anchor_clusters: maximalClusters,
      maximal_clusters: maximalClusters,
      overlapping_cluster_relationships: review.parent_anchor_overlapping_cluster_relationships || [],
      parent_anchor_top_score: review.parent_anchor_top_score,
      parent_anchor_top_score_tie: review.parent_anchor_top_score_tie,
      parent_anchor_top_score_cluster_ids: topClusterIds,
      overlapping_top_cluster_relationships: overlappingTopClusters,
      selected_consensus_cluster: review.parent_anchor_status === 'consensus'
        ? maximalClusters.find((cluster) => cluster.observation_ids.join('\u0000') === review.selected_parent_anchor_ids.join('\u0000')) || null
        : null,
      consensus_selection_reason: review.parent_anchor_status === 'consensus'
        ? 'unique_highest_independent_family_maximal_cluster'
        : review.parent_anchor_status === 'conflict' && review.parent_anchor_top_score_tie
          ? 'top_score_maximal_cluster_tie'
          : review.parent_anchor_status === 'single_source'
            ? 'only_single_source_family_maximal_cluster'
            : 'no_parent_anchor_candidate',
      parent_anchor_outlier_ids: review.parent_anchor_outlier_ids,
      target_locality_status: localitySummary(classified.filter((row) => row.coordinate_role === 'target_exact' || row.target_locality_status === 'outside_parent_area')),
      publishability: review.publishability,
      candidate_anchors: candidates.sort((left, right) => asciiCompare(left.anchor_id, right.anchor_id)),
      diagnostic_anchors: diagnostic.sort((left, right) => asciiCompare(left.anchor_id, right.anchor_id)),
      rejected_anchors: rejected.sort((left, right) => asciiCompare(left.anchor_id, right.anchor_id)),
      before_parent_anchor_status: baseline.parent_anchor_status || null,
      before_publishability: baseline.publishability || null,
      before_coordinate_status: baseline.coordinate_status || null,
      after_coordinate_status: review.coordinate_status,
      id_permutation_match: invariance.id_permutation_match,
      input_order_match: invariance.input_order_match,
      before_after_changed: baseline.publishability !== review.publishability
        || baseline.coordinate_status !== review.coordinate_status
        || baseline.parent_anchor_status !== review.parent_anchor_status,
    };
  }).sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key));
  const wrongClassTrusted = observations.filter((row) => row.anchor_candidate_classification === 'candidate'
    && row.source_id === 'wikidata'
    && ![...(row.p31_ids || []), ...(row.p31_closure_ids || [])].some((value) => TRUSTED_PARENT_WIKIDATA_CLASS_IDS.has(value))).length;
  const dependencyVoteSummary = dependencyVoteAudit(rows.flatMap((row) => row.parent_anchor_clusters));
  return {
    rows,
    representative_target_count: rows.length,
    with_trusted_anchor_count: rows.filter((row) => row.parent_anchor_status === 'consensus').length,
    consensus_count: rows.filter((row) => row.parent_anchor_status === 'consensus').length,
    single_source_count: rows.filter((row) => row.parent_anchor_status === 'single_source').length,
    conflict_count: rows.filter((row) => row.parent_anchor_status === 'conflict').length,
    unknown_count: rows.filter((row) => row.parent_anchor_status === 'unknown').length,
    anchor_outlier_count: rows.reduce((count, row) => count + row.parent_anchor_outlier_ids.length, 0),
    maximal_cluster_count: rows.reduce((count, row) => count + row.maximal_clusters.length, 0),
    top_score_tie_entity_count: rows.filter((row) => row.parent_anchor_top_score_tie).length,
    overlapping_top_cluster_entity_count: rows.filter((row) => row.overlapping_top_cluster_relationships.length > 0).length,
    id_permutation_mismatch_count: rows.filter((row) => !row.id_permutation_match).length,
    input_order_mismatch_count: rows.filter((row) => !row.input_order_match).length,
    top_score_tie_publishable_count: rows.filter((row) => row.parent_anchor_top_score_tie && row.publishability === 'publishable').length,
    non_consensus_publishable_count: rows.filter((row) => row.parent_anchor_status !== 'consensus' && row.publishability === 'publishable').length,
    multi_cluster_publishable_count: rows.filter((row) => row.parent_anchor_clusters.length > 1 && row.publishability === 'publishable').length,
    // Duplicate observations remain visible in each cluster, but a folded family
    // never creates an additional vote. Keep the raw count separate from the
    // voting gate so an OSM-derived Wikidata record cannot inflate consensus.
    source_family_duplicate_observation_count: rows.reduce((count, row) => count
      + row.parent_anchor_clusters.reduce((inner, cluster) => inner
        + cluster.family_votes.reduce((duplicates, vote) => duplicates + vote.duplicate_observation_ids.length, 0), 0), 0),
    dependency_duplicate_vote_count: dependencyVoteSummary.consistency_violation_count,
    seed_only_count: rows.filter(isSeedOnlyAuditRow).length,
    nominatim_only_count: rows.filter(isNominatimOnlyAuditRow).length,
    wrong_class_trusted_anchor_count: wrongClassTrusted,
    seed_only_publishable_count: rows.filter((row) => isSeedOnlyAuditRow(row) && row.publishability === 'publishable').length,
    nominatim_only_publishable_count: rows.filter((row) => isNominatimOnlyAuditRow(row) && row.publishability === 'publishable').length,
  };
}

function normalizeGoldCase(gold, goldCase) {
  const override = gold.round2d_expectation_overrides?.[goldCase.case_id] || {};
  const legacyCandidate = goldCase.expected_parent_anchor_classification === 'trusted'
    ? 'candidate'
    : goldCase.expected_parent_anchor_classification;
  const legacyStatus = goldCase.expected_parent_anchor_status === 'trusted'
    ? 'single_source'
    : goldCase.expected_parent_anchor_status;
  return {
    ...goldCase,
    ...override,
    expected_anchor_candidate_classification: override.expected_anchor_candidate_classification
      ?? goldCase.expected_anchor_candidate_classification
      ?? legacyCandidate,
    expected_parent_anchor_status: override.expected_parent_anchor_status ?? legacyStatus,
  };
}

function validateGoldCase(goldCase, caseIds) {
  assert(typeof goldCase.case_id === 'string' && goldCase.case_id, 'identity gold case id missing');
  assert(!caseIds.has(goldCase.case_id), `duplicate identity gold case: ${goldCase.case_id}`);
  caseIds.add(goldCase.case_id);
  assert(typeof goldCase.effective_canonical_key === 'string' && goldCase.effective_canonical_key,
    `identity gold key missing for ${goldCase.case_id}`);
  assert(typeof goldCase.expected_identity_eligible === 'boolean',
    `identity gold eligibility missing for ${goldCase.case_id}`);
  assert(typeof goldCase.expected_coordinate_role === 'string' && goldCase.expected_coordinate_role,
    `identity gold role missing for ${goldCase.case_id}`);
  assert(typeof goldCase.expected_parent_anchor_status === 'string' && goldCase.expected_parent_anchor_status,
    `identity gold parent-anchor status missing for ${goldCase.case_id}`);
  assert(typeof goldCase.expected_anchor_candidate_classification === 'string' && goldCase.expected_anchor_candidate_classification,
    `identity gold anchor-candidate classification missing for ${goldCase.case_id}`);
  assert(goldCase.expected_selected_parent_anchor_ids === undefined
    || goldCase.expected_selected_parent_anchor_ids === null
    || Array.isArray(goldCase.expected_selected_parent_anchor_ids),
    `identity gold selected-cluster expectation invalid for ${goldCase.case_id}`);
  assert(Object.hasOwn(goldCase, 'expected_target_locality_status'),
    `identity gold locality expectation missing for ${goldCase.case_id}`);
  assert(typeof goldCase.expected_publishability === 'string' && goldCase.expected_publishability,
    `identity gold publishability missing for ${goldCase.case_id}`);
}

function goldOutcome(goldCase, observation, review, caseKind) {
  const actualEligible = observation
    ? eligibleTargetExact([observation]).length === 1
    : review.target_exact_observation_ids.length > 0;
  const actualRole = observation
    ? observation.coordinate_role
    : review.target_definition_status === 'not_applicable'
      ? 'routehead'
      : review.target_definition_status === 'undefined' ? 'mountain_label' : 'target_exact';
  const actualParentAnchorStatus = observation?.parent_anchor_status ?? review.parent_anchor_status;
  const actualAnchorCandidateClassification = observation?.anchor_candidate_classification ?? 'not_applicable';
  const actualSelectedParentAnchorIds = [...(review.selected_parent_anchor_ids || [])].sort(asciiCompare);
  const actualTargetLocalityStatus = observation?.target_locality_status ?? null;
  const actualPublishability = review.publishability;
  const roleMatch = actualRole === goldCase.expected_coordinate_role;
  const anchorCandidateClassificationMatch = actualAnchorCandidateClassification === goldCase.expected_anchor_candidate_classification;
  const parentAnchorStatusMatch = actualParentAnchorStatus === goldCase.expected_parent_anchor_status;
  const anchorTrustMatch = parentAnchorStatusMatch && anchorCandidateClassificationMatch;
  const expectedSelectedParentAnchorIds = goldCase.expected_selected_parent_anchor_ids ?? null;
  const clusterMatch = expectedSelectedParentAnchorIds === null
    || JSON.stringify(actualSelectedParentAnchorIds) === JSON.stringify([...expectedSelectedParentAnchorIds].sort(asciiCompare));
  const localityMatch = actualTargetLocalityStatus === goldCase.expected_target_locality_status;
  const publishabilityMatch = actualPublishability === goldCase.expected_publishability;
  return {
    case_id: goldCase.case_id,
    case_kind: caseKind,
    effective_canonical_key: goldCase.effective_canonical_key,
    observation_id: goldCase.observation_id,
    expected_identity_eligible: goldCase.expected_identity_eligible,
    actual_identity_eligible: actualEligible,
    expected_coordinate_role: goldCase.expected_coordinate_role,
    actual_coordinate_role: actualRole,
    expected_parent_anchor_status: goldCase.expected_parent_anchor_status,
    actual_parent_anchor_status: actualParentAnchorStatus,
    expected_anchor_candidate_classification: goldCase.expected_anchor_candidate_classification,
    actual_anchor_candidate_classification: actualAnchorCandidateClassification,
    expected_selected_parent_anchor_ids: expectedSelectedParentAnchorIds,
    actual_selected_parent_anchor_ids: actualSelectedParentAnchorIds,
    expected_target_locality_status: goldCase.expected_target_locality_status,
    actual_target_locality_status: actualTargetLocalityStatus,
    expected_publishability: goldCase.expected_publishability,
    actual_publishability: actualPublishability,
    false_accept: !goldCase.expected_identity_eligible && actualEligible,
    false_reject: goldCase.expected_identity_eligible && !actualEligible,
    role_match: roleMatch,
    anchor_candidate_classification_match: anchorCandidateClassificationMatch,
    parent_anchor_status_match: parentAnchorStatusMatch,
    anchor_trust_match: anchorTrustMatch,
    cluster_match: clusterMatch,
    locality_match: localityMatch,
    publishability_match: publishabilityMatch,
    adjudication_reason: goldCase.adjudication_reason,
    evidence_fields: [...(goldCase.evidence_fields || [])].sort(asciiCompare),
  };
}

function coordinateClusterSignatures(result, anchors) {
  return physicalClusterSignature(result, anchors);
}

function evaluateRound2eParentAnchorContract(goldCase, caseIds) {
  assert(typeof goldCase.case_id === 'string' && goldCase.case_id, 'round2e parent-anchor gold case id missing');
  assert(!caseIds.has(goldCase.case_id), `duplicate identity gold case: ${goldCase.case_id}`);
  caseIds.add(goldCase.case_id);
  assert(Array.isArray(goldCase.anchors) && goldCase.anchors.length > 0,
    `round2e parent-anchor anchors missing for ${goldCase.case_id}`);
  assert(Number.isFinite(goldCase.radius_m) && goldCase.radius_m > 0,
    `round2e parent-anchor radius missing for ${goldCase.case_id}`);
  const anchors = goldCase.anchors.map((anchor) => ({ ...anchor, classification: 'candidate' }));
  const actual = buildParentAnchorConsensus(anchors, goldCase.radius_m);
  const expectedClusters = [...(goldCase.expected_cluster_signatures || [])].sort(asciiCompare);
  const actualClusters = coordinateClusterSignatures(actual, anchors);
  const actualSelected = actual.selected_cluster
    ? coordinateClusterSignatures({ maximal_clusters: [actual.selected_cluster] }, anchors)[0]
    : null;
  const idRenamed = anchors.map((anchor, index) => ({ ...anchor, id: `gold-id:${index}` }));
  const idRenamedResult = buildParentAnchorConsensus(idRenamed, goldCase.radius_m);
  const reordered = [...anchors].reverse();
  const reorderedResult = buildParentAnchorConsensus(reordered, goldCase.radius_m);
  const decisionSignature = (result, source) => stableJson({
    status: result.status,
    top_score: result.top_score,
    top_score_tie: result.top_score_tie,
    clusters: coordinateClusterSignatures(result, source),
    selected: result.selected_cluster
      ? coordinateClusterSignatures({ maximal_clusters: [result.selected_cluster] }, source)[0]
      : null,
  });
  const originalSignature = decisionSignature(actual, anchors);
  const idPermutationMatch = originalSignature === decisionSignature(idRenamedResult, idRenamed);
  const inputOrderMatch = originalSignature === decisionSignature(reorderedResult, reordered);
  const statusMatch = actual.status === goldCase.expected_status;
  const topScoreTieMatch = actual.top_score_tie === goldCase.expected_top_score_tie;
  const clusterMatch = JSON.stringify(actualClusters) === JSON.stringify(expectedClusters);
  const selectedMatch = actualSelected === (goldCase.expected_selected_cluster_signature ?? null);
  return {
    case_id: goldCase.case_id,
    case_kind: 'round2e_parent_anchor_contract',
    effective_canonical_key: null,
    observation_id: null,
    expected_identity_eligible: true,
    actual_identity_eligible: true,
    expected_coordinate_role: 'parent_anchor',
    actual_coordinate_role: 'parent_anchor',
    expected_parent_anchor_status: goldCase.expected_status,
    actual_parent_anchor_status: actual.status,
    expected_anchor_candidate_classification: 'candidate',
    actual_anchor_candidate_classification: 'candidate',
    expected_selected_parent_anchor_ids: null,
    actual_selected_parent_anchor_ids: actual.selected_anchor_ids,
    expected_target_locality_status: 'unknown',
    actual_target_locality_status: 'unknown',
    expected_publishability: actual.status === 'consensus' ? 'publishable' : 'quarantined',
    actual_publishability: actual.status === 'consensus' ? 'publishable' : 'quarantined',
    false_accept: false,
    false_reject: false,
    role_match: true,
    anchor_candidate_classification_match: true,
    parent_anchor_status_match: statusMatch,
    anchor_trust_match: statusMatch && topScoreTieMatch,
    cluster_match: clusterMatch && selectedMatch,
    locality_match: true,
    publishability_match: actual.status !== 'consensus' || actual.selected_cluster !== null,
    id_permutation_match: idPermutationMatch,
    input_order_match: inputOrderMatch,
    expected_cluster_signatures: expectedClusters,
    actual_cluster_signatures: actualClusters,
    expected_top_score_tie: goldCase.expected_top_score_tie,
    actual_top_score_tie: actual.top_score_tie,
    expected_selected_cluster_signature: goldCase.expected_selected_cluster_signature ?? null,
    actual_selected_cluster_signature: actualSelected,
    adjudication_reason: goldCase.adjudication_reason,
    evidence_fields: ['maximal_complete_link_clusters', 'dependency_family_score', 'input_order', 'observation_id'].sort(asciiCompare),
  };
}

export function evaluateIdentityGold(gold, observations, reviews) {
  assert(gold?.schema_version === 3, 'identity adjudication gold schema mismatch');
  assert(Array.isArray(gold.cases) && gold.cases.length > 0, 'identity adjudication gold cases missing');
  assert(Array.isArray(gold.round2e_parent_anchor_contract_cases) && gold.round2e_parent_anchor_contract_cases.length >= 4,
    'identity adjudication round2e parent-anchor contract cases missing');
  const byObservation = new Map(observations.map((row) => [row.observation_id, row]));
  const byReview = new Map(reviews.map((row) => [row.effective_canonical_key, row]));
  const caseIds = new Set();
  const results = [];
  for (const rawGoldCase of gold.cases) {
    const goldCase = normalizeGoldCase(gold, rawGoldCase);
    validateGoldCase(goldCase, caseIds);
    const review = byReview.get(goldCase.effective_canonical_key);
    assert(review, `identity gold review missing for ${goldCase.case_id}`);
    const observation = goldCase.observation_id === null ? null : byObservation.get(goldCase.observation_id);
    if (goldCase.observation_id !== null) {
      assert(typeof goldCase.observation_id === 'string' && goldCase.observation_id,
        `identity gold observation id invalid for ${goldCase.case_id}`);
      assert(observation, `identity gold observation missing for ${goldCase.case_id}`);
      assert(observation.effective_canonical_key === goldCase.effective_canonical_key,
        `identity gold observation key mismatch for ${goldCase.case_id}`);
    }
    results.push(goldOutcome(goldCase, observation, review, 'pilot_observation'));
  }
  for (const rawGoldCase of gold.synthetic_parent_anchor_cases || []) {
    const goldCase = normalizeGoldCase(gold, rawGoldCase);
    validateGoldCase(goldCase, caseIds);
    assert(goldCase.entity && Array.isArray(goldCase.observations),
      `synthetic parent-anchor fixture missing for ${goldCase.case_id}`);
    const classified = classifyEntityObservations(goldCase.entity, goldCase.observations);
    const review = buildReviewRecord(goldCase.entity, goldCase.observations, goldCase.collection || {
      minimum_sources_complete: true,
      any_source_available: true,
      source_outcomes: { osm: 'complete', wikidata: 'complete', terrain: 'complete' },
    });
    const observation = classified.find((row) => row.observation_id === goldCase.observation_id) || null;
    assert(observation, `synthetic parent-anchor observation missing for ${goldCase.case_id}`);
    results.push(goldOutcome(goldCase, observation, review, 'synthetic_parent_anchor_contract'));
  }
  for (const goldCase of gold.round2e_parent_anchor_contract_cases || []) {
    results.push(evaluateRound2eParentAnchorContract(goldCase, caseIds));
  }
  results.sort((left, right) => asciiCompare(left.case_id, right.case_id));
  return {
    sha256: sha256(Buffer.from(stableJson(gold))),
    cases: results.length,
    false_accept_count: results.filter((row) => row.false_accept).length,
    false_reject_count: results.filter((row) => row.false_reject).length,
    role_mismatch_count: results.filter((row) => !row.role_match).length,
    anchor_trust_mismatch_count: results.filter((row) => !row.anchor_trust_match).length,
    cluster_mismatch_count: results.filter((row) => !row.cluster_match).length,
    locality_mismatch_count: results.filter((row) => !row.locality_match).length,
    publishability_mismatch_count: results.filter((row) => !row.publishability_match).length,
    id_permutation_mismatch_count: results.filter((row) => row.id_permutation_match === false).length,
    input_order_mismatch_count: results.filter((row) => row.input_order_match === false).length,
    results,
  };
}

function downstreamImpactMarkdown() {
  return [
    '# Downstream Impact',
    '',
    '- Search, activity creation, and archive records must remain bound to the product entity (`effective_canonical_key` and `primary_name`).',
    '- A `mountain_area` representative highpoint is map and altitude reference data. It must not become a mandatory summit-radius completion rule.',
    '- Only `independent_peak` entities may use summit-proximity verification.',
    '- `route_corridor` entities require route geometry, route completion, and a route-derived highpoint; this pilot does not manufacture summit coordinates for routes.',
    '- This package records downstream impact only. It does not change application code, APIs, database schema, or stored activities.',
    '',
  ].join('\n');
}

export function renderDeterministicPackage(allEntities, observations, reviews, baseline = [], options = {}) {
  const sortedObservations = [...observations].sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key)
    || asciiCompare(left.observation_id, right.observation_id));
  const sortedReviews = [...reviews].sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key));
  const baselineRows = typeof baseline === 'string' ? parseJsonl(baseline) : baseline;
  const baselineText = typeof baseline === 'string' ? baseline : jsonl(baselineRows);
  const identityGoldResults = options.identity_gold_results || [];
  const parentAnchorAudit = options.parent_anchor_audit || { rows: [] };
  const summaryOptions = {
    ...options,
    identity_gold: options.identity_gold || {
      cases: identityGoldResults.length,
      false_accept_count: identityGoldResults.filter((row) => row.false_accept).length,
      false_reject_count: identityGoldResults.filter((row) => row.false_reject).length,
      role_mismatch_count: identityGoldResults.filter((row) => !row.role_match).length,
      anchor_trust_mismatch_count: identityGoldResults.filter((row) => !row.anchor_trust_match).length,
      cluster_mismatch_count: identityGoldResults.filter((row) => !row.cluster_match).length,
      id_permutation_mismatch_count: identityGoldResults.filter((row) => row.id_permutation_match === false).length,
      input_order_mismatch_count: identityGoldResults.filter((row) => row.input_order_match === false).length,
      sha256: null,
    },
  };
  return {
    'round1-baseline.jsonl': baselineText,
    'observations.jsonl': jsonl(sortedObservations),
    'coordinate-review.jsonl': jsonl(sortedReviews),
    'identity-gold-results.jsonl': jsonl(identityGoldResults),
    'parent-anchor-audit.jsonl': jsonl(parentAnchorAudit.rows || []),
    'status-traceability.jsonl': jsonl(traceability(sortedReviews, baselineRows)),
    'conflicts-over-300m.jsonl': jsonl(conflictRows(sortedReviews)),
    'exceptions.md': exceptionsMarkdown(sortedReviews),
    'downstream-impact.md': downstreamImpactMarkdown(),
    'pilot-summary.json': stableJson(summarizeReviews(allEntities, sortedObservations, sortedReviews, summaryOptions)),
  };
}

function fullSnaks(reference) {
  return Object.fromEntries(Object.entries(reference.snaks || {}).sort(([left], [right]) => asciiCompare(left, right)).map(([property, snaks]) => [
    property,
    snaks.map((snak) => ({
      snaktype: snak.snaktype || null,
      property: snak.property || property,
      datatype: snak.datatype || null,
      datavalue: snak.datavalue || null,
    })),
  ]));
}

function idValues(reference, property) {
  return (reference.snaks?.[property] || []).map((snak) => snak.datavalue?.value?.id).filter(Boolean);
}

function stringValues(reference, property) {
  return (reference.snaks?.[property] || []).map((snak) => snak.datavalue?.value).filter((value) => typeof value === 'string');
}

function hostMatches(host, suffixes) {
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function parseReferenceEvidence(reference) {
  const signals = [];
  const unknown = [];
  for (const qid of idValues(reference, 'P143')) signals.push({ source: `P143:${qid}`, family: 'wikimedia', credible: false });
  for (const qid of idValues(reference, 'P248')) {
    const known = CREDIBLE_SOURCE_POLICY_V2.p248[qid];
    if (known) signals.push({ source: `P248:${qid}`, family: known.family, credible: known.credible });
    else {
      signals.push({ source: `P248:${qid}`, family: 'unknown', credible: false });
      unknown.push(`P248:${qid}`);
    }
  }
  for (const value of stringValues(reference, 'P854')) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
      const host = url.hostname.toLowerCase();
      if (hostMatches(host, CREDIBLE_SOURCE_POLICY_V2.official_host_suffixes)) signals.push({ source: `P854:${host}`, family: 'official', credible: true });
      else if (CREDIBLE_SOURCE_POLICY_V2.survey_gazetteer_hosts.includes(host)) signals.push({ source: `P854:${host}`, family: 'survey', credible: true });
      else if (hostMatches(host, CREDIBLE_SOURCE_POLICY_V2.osm_host_suffixes)) signals.push({ source: `P854:${host}`, family: 'osm', credible: true });
      else if (hostMatches(host, CREDIBLE_SOURCE_POLICY_V2.dependency_only_host_suffixes)) signals.push({ source: `P854:${host}`, family: 'wikimedia', credible: false });
      else if (hostMatches(host, CREDIBLE_SOURCE_POLICY_V2.rejected_host_suffixes)) signals.push({ source: `P854:${host}`, family: 'rejected_web', credible: false });
      else {
        signals.push({ source: `P854:${host}`, family: 'unknown', credible: false });
        unknown.push(`P854:${host}`);
      }
    } catch {
      signals.push({ source: `P854:${value}`, family: 'unknown', credible: false });
      unknown.push(`P854:${value}`);
    }
  }
  const credibleSignals = signals.filter((row) => row.credible).sort((left, right) => asciiCompare(left.family, right.family) || asciiCompare(left.source, right.source));
  const family = credibleSignals[0]?.family || signals.sort((left, right) => asciiCompare(left.family, right.family))[0]?.family || 'unknown';
  return {
    reference_hash: reference.hash || null,
    snaks: fullSnaks(reference),
    signals: signals.sort((left, right) => asciiCompare(left.source, right.source)),
    credible: credibleSignals.length > 0,
    dependency_family: family,
    unknown_sources: uniq(unknown).sort(asciiCompare),
  };
}

export function escapeOverpassLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function escapeOverpassRegex(value) {
  return escapeOverpassLiteral(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

const OSM_QUERY_NAME_KEYS = Object.freeze([
  'name', 'name:zh', 'name:zh-Hans', 'name:zh-hans', 'name:en', 'alt_name', 'official_name',
  'loc_name', 'int_name', 'old_name', 'short_name',
]);

export function buildOverpassQuery(names, isoCodes, seedCoordinate = null) {
  assert(names.length > 0, 'Overpass query needs at least one target name');
  const regex = `^(${names.map(escapeOverpassRegex).join('|')})$`;
  if (seedCoordinate) {
    assert(Number.isFinite(seedCoordinate.latitude) && Number.isFinite(seedCoordinate.longitude), 'invalid Overpass seed coordinate');
    const clauses = OSM_QUERY_NAME_KEYS.map((key) =>
      `node(around:${OVERPASS_AROUND_RADIUS_M},${seedCoordinate.latitude},${seedCoordinate.longitude})["natural"="peak"]["${key}"~"${regex}",i];`).join('\n  ');
    return `[out:json][timeout:90];\n(\n  ${clauses}\n);\nout body;`;
  }
  assert(isoCodes.length > 0, 'Overpass query needs an administrative area');
  const areas = isoCodes.map((code, index) => {
    const property = code.includes('-') ? 'ISO3166-2' : 'ISO3166-1';
    return `area["${property}"="${escapeOverpassLiteral(code)}"]->.a${index};`;
  }).join('\n');
  const clauses = isoCodes.flatMap((_, areaIndex) => OSM_QUERY_NAME_KEYS.map((key) =>
    `node["natural"="peak"]["${key}"~"${regex}",i](area.a${areaIndex});`)).join('\n  ');
  return `[out:json][timeout:90];\n${areas}\n(\n  ${clauses}\n);\nout body;`;
}

export function planOverpassPartitions(names, filteredCount) {
  if (filteredCount <= MAX_OVERPASS_CANDIDATES) return [];
  const chunkSize = Math.ceil(names.length / MAX_OVERPASS_PARTITIONS);
  const chunks = Array.from({ length: Math.ceil(names.length / chunkSize) }, (_, index) =>
    names.slice(index * chunkSize, (index + 1) * chunkSize));
  assert(chunks.length <= MAX_OVERPASS_PARTITIONS, 'Overpass deterministic partition limit exceeded');
  return chunks;
}

async function loadFrozenEntities(rootDir) {
  const bytes = await readFile(join(rootDir, FROZEN_INPUT));
  const actual = sha256(bytes);
  assert(actual === FROZEN_INPUT_SHA256, `frozen input SHA mismatch: ${actual}`);
  const entities = parseJsonl(bytes.toString('utf8'));
  assert(entities.length === 359, `expected 359 frozen entities, found ${entities.length}`);
  assert(new Set(entities.map((row) => row.effective_canonical_key)).size === 359, 'frozen input keys are not unique');
  return entities;
}

async function loadEntitySemantics(rootDir, allEntities) {
  const bytes = await readFile(join(rootDir, ENTITY_SEMANTICS_INPUT));
  assert(sha256(bytes) === ENTITY_SEMANTICS_SHA256, `entity semantics SHA mismatch: ${sha256(bytes)}`);
  const records = parseJsonl(bytes.toString('utf8'));
  assert(records.length === 359, `expected 359 entity semantics, found ${records.length}`);
  const byKey = new Map(records.map((row) => [row.effective_canonical_key, row]));
  assert(byKey.size === 359, 'entity semantics keys are not unique');
  const entityKeys = [...allEntities].map((row) => row.effective_canonical_key).sort(asciiCompare);
  assert(JSON.stringify([...byKey.keys()].sort(asciiCompare)) === JSON.stringify(entityKeys), 'entity semantics key closure mismatch');
  return { records, byKey, sha256: sha256(bytes) };
}

async function loadIdentityAdjudicationGold(rootDir) {
  const bytes = await readFile(join(rootDir, IDENTITY_GOLD_INPUT));
  const gold = JSON.parse(bytes.toString('utf8'));
  assert(gold?.schema_version === 3, 'identity adjudication gold schema mismatch');
  assert(Array.isArray(gold.cases) && gold.cases.length > 0, 'identity adjudication gold cases missing');
  assert(Array.isArray(gold.synthetic_parent_anchor_cases) && gold.synthetic_parent_anchor_cases.length > 0,
    'identity adjudication synthetic parent-anchor cases missing');
  assert(Array.isArray(gold.round2e_parent_anchor_contract_cases) && gold.round2e_parent_anchor_contract_cases.length >= 4,
    'identity adjudication round2e parent-anchor contract cases missing');
  return { gold, sha256: sha256(bytes) };
}

function pilotEntitiesFrom(allEntities, semanticsByKey) {
  const byKey = new Map(allEntities.map((row) => [row.effective_canonical_key, row]));
  const entities = PILOT_KEYS.map((key) => {
    const entity = byKey.get(key);
    assert(entity, `pilot key absent from frozen input: ${key}`);
    const semantics = semanticsByKey.get(key);
    assert(semantics, `pilot key absent from entity semantics: ${key}`);
    const subject = { ...entity, entity_semantics: semantics };
    deriveCoordinateTarget(subject);
    return subject;
  });
  const targets = entities.map((entity) => deriveCoordinateTarget(entity));
  assert(targets.filter((row) => row.coordinate_target_role === 'representative_highpoint').length === 12,
    'pilot target count is not 12 representative highpoints');
  assert(targets.filter((row) => row.coordinate_target_role === 'independent_summit').length === 17,
    'pilot target count is not 17 independent summits');
  assert(targets.filter((row) => row.coordinate_target_role === 'none').length === 7,
    'pilot target count is not 7 undefined mountain-area targets');
  assert(targets.filter((row) => row.coordinate_target_role === 'route_highpoint').length === 2,
    'pilot target count is not 2 route highpoints');
  return entities;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function requestUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params || {})) if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}

async function writeSnapshot(snapshotDir, bytes) {
  const hash = sha256(bytes);
  const path = join(snapshotDir, hash);
  if (!(await pathExists(path))) await writeFile(path, bytes);
  return { hash, relativePath: `snapshots/sha256/${hash}` };
}

function cacheKey({ sourceId, method, url, params, body }) {
  return sha256(Buffer.from(JSON.stringify(stableObject({ adapter_version: ADAPTER_VERSION, sourceId, method, url, params, body_sha256: body ? sha256(Buffer.from(body)) : null }))));
}

async function enforceInterval(context, sourceId) {
  const interval = sourceId === 'overpass' ? OVERPASS_INTERVAL_MS : sourceId === 'nominatim' ? NOMINATIM_INTERVAL_MS : 0;
  if (!interval) return;
  const previous = context.lastRequestAt.get(sourceId) || 0;
  const remaining = interval - (Date.now() - previous);
  if (remaining > 0) await sleep(remaining);
  context.lastRequestAt.set(sourceId, Date.now());
}

function failureKind(record) {
  if (record.http_status === 404) return 'true_not_found';
  if (record.http_status === 429 || (record.http_status && record.http_status >= 500) || record.error) return 'infra_blocked';
  return 'source_unavailable';
}

async function fetchCaptured({ sourceId, requestId, url, params = {}, method = 'GET', body = null, context, maxAttempts = MAX_ATTEMPTS }) {
  const key = cacheKey({ sourceId, method, url, params, body });
  const cached = context.resumeCache.get(key);
  if (cached) {
    const bytes = cached.bytes;
    const snapshot = await writeSnapshot(context.snapshotDir, bytes);
    context.requests.push({ ...cached.record, request_id: requestId, cache_key: key, cache_hit: true, response_cas_path: snapshot.relativePath });
    return { ok: true, status: cached.record.http_status, bytes, record: cached.record, cacheHit: true };
  }
  const fullUrl = method === 'GET' ? requestUrl(url, params) : url;
  const bodyBytes = body === null ? null : Buffer.from(body);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await enforceInterval(context, sourceId);
    const startedAt = new Date().toISOString();
    try {
      const response = await fetch(fullUrl, {
        method,
        body: bodyBytes,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(bodyBytes ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const snapshot = await writeSnapshot(context.snapshotDir, bytes);
      const record = {
        request_id: requestId, source_id: sourceId, adapter_version: ADAPTER_VERSION,
        cache_key: key, cache_hit: false, attempt, method, url, params,
        request_body_sha256: bodyBytes ? sha256(bodyBytes) : null,
        http_status: response.status, response_body_sha256: snapshot.hash, response_cas_path: snapshot.relativePath,
        response_headers: { content_type: response.headers.get('content-type'), retry_after: response.headers.get('retry-after') },
        retrieved_at: startedAt, error: null,
      };
      context.requests.push(record);
      if (response.ok) return { ok: true, status: response.status, bytes, record, cacheHit: false };
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) return { ok: false, status: response.status, bytes, record, failure_kind: failureKind(record) };
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : [2_000, 4_000, 8_000][attempt - 1]);
    } catch (error) {
      const record = {
        request_id: requestId, source_id: sourceId, adapter_version: ADAPTER_VERSION,
        cache_key: key, cache_hit: false, attempt, method, url, params,
        request_body_sha256: bodyBytes ? sha256(bodyBytes) : null,
        http_status: null, response_body_sha256: null, response_cas_path: null, response_headers: {},
        retrieved_at: startedAt, error: String(error?.cause?.message || error?.message || error),
      };
      context.requests.push(record);
      if (attempt === maxAttempts) return { ok: false, status: null, bytes: null, record, failure_kind: 'infra_blocked' };
      await sleep([2_000, 4_000, 8_000][attempt - 1]);
    }
  }
  throw new Error(`unreachable request loop for ${requestId}`);
}

async function createContext(stageDir, resumeCache = new Map()) {
  const snapshotDir = join(stageDir, 'snapshots/sha256');
  await mkdir(snapshotDir, { recursive: true });
  return { snapshotDir, requests: [], lastRequestAt: new Map(), resumeCache };
}

function parseOverpassMetadata(bytes) {
  const payload = JSON.parse(bytes.toString('utf8'));
  const generator = typeof payload.generator === 'string' ? payload.generator : null;
  const osmBase = typeof payload.osm3s?.timestamp_osm_base === 'string' ? payload.osm3s.timestamp_osm_base : null;
  const copyright = typeof payload.osm3s?.copyright === 'string' ? payload.osm3s.copyright : null;
  assert(generator, 'Overpass pre-flight response is missing generator');
  assert(osmBase, 'Overpass pre-flight response is missing osm_base');
  assert(/ODbL|openstreetmap\.org/iu.test(copyright || ''), 'Overpass pre-flight response is missing ODbL attribution');
  return { generator, osm_base: osmBase, copyright };
}

async function preflight(context, overpassEndpoint) {
  const checks = [];
  const overpassBody = new URLSearchParams({ data: buildOverpassQuery(['珠穆朗玛峰', 'Mount Everest'], ['CN-XZ']) }).toString();
  checks.push(['overpass', await fetchCaptured({ sourceId: 'overpass', requestId: 'preflight:overpass', url: overpassEndpoint, method: 'POST', body: overpassBody, context })]);
  const wdqsBody = new URLSearchParams({ query: 'SELECT (1 AS ?ok) WHERE {}', format: 'json' }).toString();
  checks.push(['wdqs', await fetchCaptured({ sourceId: 'wikidata', requestId: 'preflight:wdqs', url: 'https://query.wikidata.org/sparql', method: 'POST', body: wdqsBody, context })]);
  checks.push(['wikidata_action', await fetchCaptured({ sourceId: 'wikidata', requestId: 'preflight:wikidata-action', url: 'https://www.wikidata.org/w/api.php', params: { action: 'wbgetentities', ids: 'Q8502', props: 'info', format: 'json', origin: '*' }, context })]);
  checks.push(['nominatim_reverse', await fetchCaptured({ sourceId: 'nominatim', requestId: 'preflight:nominatim-reverse', url: 'https://nominatim.openstreetmap.org/reverse', params: { format: 'jsonv2', lat: 34.4777, lon: 110.078, zoom: 5, addressdetails: 1 }, context })]);
  checks.push(['glo90', await fetchCaptured({ sourceId: 'open_meteo_glo90', requestId: 'preflight:glo90', url: 'https://api.open-meteo.com/v1/elevation', params: { latitude: 34.4777, longitude: 110.078 }, context })]);
  checks.push(['srtm90', await fetchCaptured({ sourceId: 'opentopodata_srtm90', requestId: 'preflight:srtm90', url: 'https://api.opentopodata.org/v1/srtm90m', params: { locations: '34.4777,110.078' }, context })]);
  const result = Object.fromEntries(checks.map(([id, row]) => [id, { ok: row.ok, status: row.status, failure_kind: row.failure_kind || null, error: row.record?.error || null }]));
  assert(result.overpass.ok, `Overpass pre-flight failed: ${JSON.stringify(result.overpass)}`);
  assert(checks.every(([, row]) => row.ok), `coordinate pre-flight failed: ${JSON.stringify(result)}`);
  return { checks: result, overpass: parseOverpassMetadata(checks.find(([id]) => id === 'overpass')[1].bytes) };
}

function parsePointWkt(value) {
  const match = String(value || '').match(/^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/u);
  return match ? { longitude: Number(match[1]), latitude: Number(match[2]) } : null;
}

function qidFromUri(value) {
  return String(value || '').match(/(Q\d+)$/u)?.[1] || null;
}

function preferredText(entity, language) {
  return entity.labels?.[language]?.value || entity.labels?.zh?.value || entity.labels?.en?.value || '';
}

function actionEntityNames(entity) {
  return uniq([
    preferredText(entity, 'zh'), preferredText(entity, 'zh-hans'), preferredText(entity, 'en'),
    ...Object.values(entity.aliases || {}).flatMap((entry) => entry.map((item) => item.value)),
  ]);
}

function claimEntityIds(entity, property) {
  return uniq((entity.claims?.[property] || []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean));
}

function wbCoordinateClaims(entity) {
  return (entity.claims?.P625 || []).map((claim) => {
    const value = claim.mainsnak?.datavalue?.value;
    if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') return null;
    const references = (claim.references || []).map(parseReferenceEvidence);
    const credible = references.filter((row) => row.credible).sort((left, right) => asciiCompare(left.dependency_family, right.dependency_family));
    return {
      claim_id: claim.id || `${entity.id}:P625`, latitude: value.latitude, longitude: value.longitude,
      precision: value.precision ?? null, references,
      credibility: credible.length ? 'credible' : 'non_credible',
      dependency_family: credible[0]?.dependency_family || `wikidata-unreferenced:${entity.id}`,
      unknown_reference_sources: uniq(references.flatMap((row) => row.unknown_sources)).sort(asciiCompare),
    };
  }).filter(Boolean);
}

function buildWdqsQuery(names) {
  const values = names.flatMap((name) => {
    const encoded = JSON.stringify(name);
    return /[\u3400-\u9fff]/u.test(name) ? [`${encoded}@zh`, `${encoded}@zh-hans`] : [`${encoded}@en`];
  }).join(' ');
  return `SELECT DISTINCT ?item ?matchedLabel WHERE { VALUES ?matchedLabel { ${values} } { ?item rdfs:label ?matchedLabel } UNION { ?item skos:altLabel ?matchedLabel } }`;
}

async function collectClassClosure(initialClassIds, context) {
  const parents = new Map();
  let frontier = uniq(initialClassIds).sort(asciiCompare);
  const fetched = new Set();
  let batch = 0;
  while (frontier.length && batch < 6) {
    const ids = frontier.filter((id) => !fetched.has(id)).slice(0, 50);
    if (!ids.length) break;
    batch += 1;
    const response = await fetchCaptured({ sourceId: 'wikidata', requestId: `wikidata:class-closure:${batch}`, url: 'https://www.wikidata.org/w/api.php', params: { action: 'wbgetentities', ids: ids.join('|'), props: 'claims', format: 'json', origin: '*' }, context });
    if (!response.ok) return { ok: false, closureByClass: new Map() };
    const entities = JSON.parse(response.bytes.toString('utf8')).entities || {};
    const next = [];
    for (const id of ids) {
      fetched.add(id);
      const values = claimEntityIds(entities[id] || {}, 'P279');
      parents.set(id, values);
      next.push(...values.filter((value) => !fetched.has(value)));
    }
    frontier = uniq([...frontier.filter((id) => !fetched.has(id)), ...next]).sort(asciiCompare);
  }
  const closureByClass = new Map();
  const visit = (id, seen = new Set()) => {
    if (seen.has(id)) return [];
    seen.add(id);
    return uniq([id, ...(parents.get(id) || []).flatMap((parent) => visit(parent, seen))]);
  };
  for (const id of initialClassIds) closureByClass.set(id, visit(id));
  return { ok: true, closureByClass };
}

function adminHint(payload) {
  return uniq([payload.address?.state, payload.address?.province, payload.address?.region, payload.address?.country]);
}

async function reverseCoordinate(entity, observationId, latitude, longitude, context) {
  const response = await fetchCaptured({ sourceId: 'nominatim', requestId: `nominatim:reverse:${observationId.replace(/[^A-Za-z0-9:_-]/gu, '-')}`, url: 'https://nominatim.openstreetmap.org/reverse', params: { format: 'jsonv2', lat: latitude, lon: longitude, zoom: 5, addressdetails: 1 }, context });
  if (!response.ok) return { ok: false, hints: [], conflict: false, failure_kind: response.failure_kind || 'infra_blocked' };
  const hints = adminHint(JSON.parse(response.bytes.toString('utf8')));
  return { ok: true, hints, conflict: !provinceMatches(entity, hints) && !CROSS_BORDER_ISO_BY_KEY[entity.effective_canonical_key] };
}

async function collectWikidata(entities, context) {
  const observationsByKey = new Map(entities.map((entity) => [entity.effective_canonical_key, []]));
  const outcomes = new Map(entities.map((entity) => [entity.effective_canonical_key, 'complete']));
  const names = uniq(entities.flatMap((entity) => targetNames(entity))).sort(asciiCompare);
  const body = new URLSearchParams({ query: buildWdqsQuery(names), format: 'json' }).toString();
  const wdqs = await fetchCaptured({ sourceId: 'wikidata', requestId: 'wikidata:wdqs:pilot-labels', url: 'https://query.wikidata.org/sparql', method: 'POST', body, context });
  if (!wdqs.ok) {
    for (const entity of entities) outcomes.set(entity.effective_canonical_key, 'infra_blocked');
    return { observationsByKey, outcomes };
  }
  const bindings = JSON.parse(wdqs.bytes.toString('utf8')).results?.bindings || [];
  const qids = uniq(bindings.map((row) => qidFromUri(row.item?.value)).filter(Boolean)).sort(asciiCompare);
  const actionEntities = {};
  let actionOk = true;
  for (let offset = 0; offset < qids.length; offset += 50) {
    const ids = qids.slice(offset, offset + 50);
    const response = await fetchCaptured({ sourceId: 'wikidata', requestId: `wikidata:action:${offset / 50 + 1}`, url: 'https://www.wikidata.org/w/api.php', params: { action: 'wbgetentities', ids: ids.join('|'), props: 'labels|aliases|claims|info', languages: 'zh|zh-hans|en', format: 'json', origin: '*' }, context });
    if (!response.ok) { actionOk = false; break; }
    Object.assign(actionEntities, JSON.parse(response.bytes.toString('utf8')).entities || {});
  }
  if (!actionOk) {
    for (const entity of entities) outcomes.set(entity.effective_canonical_key, 'infra_blocked');
    return { observationsByKey, outcomes };
  }
  const closure = await collectClassClosure(uniq(Object.values(actionEntities).flatMap((entity) => claimEntityIds(entity, 'P31'))), context);
  if (!closure.ok) {
    for (const entity of entities) outcomes.set(entity.effective_canonical_key, 'infra_blocked');
    return { observationsByKey, outcomes };
  }
  const byQid = Map.groupBy(bindings, (row) => qidFromUri(row.item?.value));
  for (const entity of entities) {
    const namesForTarget = targetNames(entity);
    const target = deriveCoordinateTarget(entity);
    for (const [qid, item] of Object.entries(actionEntities)) {
      const itemNames = uniq([...actionEntityNames(item), ...(byQid.get(qid) || []).map((row) => row.matchedLabel?.value).filter(Boolean)]);
      const matched = itemNames.filter((name) => namesForTarget.some((target) => normalizeName(target) === normalizeName(name))).sort(asciiCompare)[0];
      if (!matched) continue;
      const p31 = claimEntityIds(item, 'P31');
      const p31Closure = uniq(p31.flatMap((id) => closure.closureByClass.get(id) || [id]));
      for (const coordinate of wbCoordinateClaims(item)) {
        const observationId = `wikidata:${qid}:${coordinate.claim_id}`;
        const reverse = await reverseCoordinate(entity, observationId, coordinate.latitude, coordinate.longitude, context);
        if (!reverse.ok) outcomes.set(entity.effective_canonical_key, 'infra_blocked');
        observationsByKey.get(entity.effective_canonical_key).push({
          effective_canonical_key: entity.effective_canonical_key, observation_id: observationId,
          source_id: 'wikidata', adapter: 'wikidata-action-v2', latitude: coordinate.latitude, longitude: coordinate.longitude,
          coordinate_precision: coordinate.precision, matched_name: matched,
          match_kind: exactNameMatch(entity, target, entity.entity_semantics, matched) ? 'exact' : 'product-label',
          p31_ids: p31, p31_closure_ids: p31Closure, country_ids: claimEntityIds(item, 'P17'),
          admin_hint: reverse.hints, admin_conflict: reverse.conflict,
          provenance_origin: coordinate.references.map((row) => row.reference_hash).filter(Boolean).sort(asciiCompare).join('+') || null,
          provenance_claim_id: coordinate.claim_id, provenance_references: coordinate.references,
          dependency_family: coordinate.dependency_family, credibility: coordinate.credibility,
          unknown_reference_sources: coordinate.unknown_reference_sources,
          osm_element: null, osm_version: null, osm_source: null, osm_tags: null,
          osm_ele_m: null, elevation_check: 'available', terrain: null,
          source_metadata: { qid, labels: itemNames.sort(asciiCompare) },
        });
      }
    }
    if (outcomes.get(entity.effective_canonical_key) === 'complete' && observationsByKey.get(entity.effective_canonical_key).length === 0) outcomes.set(entity.effective_canonical_key, 'true_not_found');
  }
  return { observationsByKey, outcomes };
}

function allowedIso(entity) {
  if (CROSS_BORDER_ISO_BY_KEY[entity.effective_canonical_key]) return CROSS_BORDER_ISO_BY_KEY[entity.effective_canonical_key];
  const values = entity.provinces.map((province) => PROVINCE_ISO[province]);
  assert(values.every(Boolean), `missing province ISO mapping for ${entity.effective_canonical_key}`);
  return uniq(values).sort(asciiCompare);
}

function parseOverpassElements(bytes) {
  const payload = JSON.parse(bytes.toString('utf8'));
  return (payload.elements || []).filter((row) => row.type === 'node' && typeof row.lat === 'number' && typeof row.lon === 'number');
}

function matchedOsmName(entity, names) {
  const allowed = new Set(targetNames(entity).map(normalizeName));
  return names.filter((name) => allowed.has(normalizeName(name))).sort(asciiCompare)[0] || null;
}

async function overpassRequest(entity, names, suffix, context, overpassEndpoint, seedCoordinate = null) {
  const query = buildOverpassQuery(names, allowedIso(entity), seedCoordinate);
  const body = new URLSearchParams({ data: query }).toString();
  return fetchCaptured({ sourceId: 'overpass', requestId: `overpass:${entity.effective_canonical_key}:${suffix}`, url: overpassEndpoint, method: 'POST', body, context });
}

async function collectOsm(entities, context, overpassEndpoint) {
  const observationsByKey = new Map(entities.map((entity) => [entity.effective_canonical_key, []]));
  const outcomes = new Map();
  const rawCounts = new Map();
  for (const entity of entities) {
    const names = targetNames(entity);
    const seedCoordinate = entity.gps?.present
      ? { latitude: entity.gps.latitude, longitude: entity.gps.longitude }
      : null;
    const initial = await overpassRequest(
      entity,
      names,
      seedCoordinate ? 'seed-bounded' : 'admin-fallback',
      context,
      overpassEndpoint,
      seedCoordinate,
    );
    if (!initial.ok) {
      outcomes.set(entity.effective_canonical_key, initial.failure_kind || 'source_unavailable');
      rawCounts.set(entity.effective_canonical_key, null);
      continue;
    }
    let elements = parseOverpassElements(initial.bytes);
    const counts = { seed_bounded: seedCoordinate ? elements.length : null, admin_fallback: seedCoordinate ? null : elements.length };
    if (seedCoordinate && elements.length === 0) {
      const fallback = await overpassRequest(entity, names, 'admin-fallback', context, overpassEndpoint);
      if (!fallback.ok) {
        outcomes.set(entity.effective_canonical_key, fallback.failure_kind || 'source_unavailable');
        rawCounts.set(entity.effective_canonical_key, counts);
        continue;
      }
      elements = parseOverpassElements(fallback.bytes);
      counts.admin_fallback = elements.length;
    }
    rawCounts.set(entity.effective_canonical_key, counts);
    const partitionSeed = counts.admin_fallback === null ? seedCoordinate : null;
    if (elements.length > MAX_OVERPASS_CANDIDATES) {
      const chunks = planOverpassPartitions(names, elements.length);
      const partitioned = [];
      let partitionFailed = false;
      for (let index = 0; index < chunks.length; index += 1) {
        const response = await overpassRequest(
          entity,
          chunks[index],
          `partition-${index + 1}`,
          context,
          overpassEndpoint,
          partitionSeed,
        );
        if (!response.ok) { partitionFailed = true; break; }
        const rows = parseOverpassElements(response.bytes);
        if (rows.length > MAX_OVERPASS_CANDIDATES) { partitionFailed = true; break; }
        partitioned.push(...rows);
      }
      if (partitionFailed) {
        outcomes.set(entity.effective_canonical_key, 'infra_blocked');
        continue;
      }
      elements = [...new Map(partitioned.map((row) => [row.id, row])).values()];
    }
    const filtered = elements.filter((element) => matchedOsmName(entity, namesFromOsmTags(element.tags)));
    for (const element of filtered.sort((left, right) => left.id - right.id)) {
      const osmNames = namesFromOsmTags(element.tags);
      const matched = matchedOsmName(entity, osmNames);
      const observationId = `osm:node:${element.id}`;
      const reverse = await reverseCoordinate(entity, observationId, element.lat, element.lon, context);
      if (!reverse.ok) outcomes.set(entity.effective_canonical_key, 'infra_blocked');
      const ele = Number.parseFloat(String(element.tags?.ele || '').replace(/[^0-9.+-]/g, ''));
      observationsByKey.get(entity.effective_canonical_key).push({
        effective_canonical_key: entity.effective_canonical_key, observation_id: observationId,
        source_id: 'osm', adapter: 'osm-overpass-v2', latitude: element.lat, longitude: element.lon,
        coordinate_precision: null, matched_name: matched || '', match_kind: matched ? 'exact' : 'generalized',
        p31_ids: [], p31_closure_ids: [], country_ids: [], admin_hint: reverse.hints, admin_conflict: reverse.conflict,
        provenance_origin: element.tags?.source || element.tags?.['source:position'] || null,
        provenance_claim_id: null, provenance_references: [], dependency_family: 'osm', credibility: 'credible',
        unknown_reference_sources: [], osm_element: `node/${element.id}`, osm_version: element.version ?? null,
        osm_source: element.tags?.source || element.tags?.['source:position'] || null, osm_tags: element.tags || {},
        osm_ele_m: Number.isFinite(ele) ? ele : null, elevation_check: Number.isFinite(ele) ? 'available' : 'unavailable',
        terrain: null, source_metadata: { osm_type: 'node', osm_id: element.id, timestamp: element.timestamp || null },
      });
    }
    if (!outcomes.has(entity.effective_canonical_key)) outcomes.set(entity.effective_canonical_key, filtered.length ? 'complete' : 'true_not_found');
  }
  return { observationsByKey, outcomes, rawCounts };
}

async function collectDem(entity, observation, context) {
  const id = observation.observation_id.replace(/[^A-Za-z0-9:_-]/gu, '-');
  const gloId = `open-meteo:glo90:${entity.effective_canonical_key}:${id}`;
  const srtmId = `opentopodata:srtm90:${entity.effective_canonical_key}:${id}`;
  const glo = await fetchCaptured({ sourceId: 'open_meteo_glo90', requestId: gloId, url: 'https://api.open-meteo.com/v1/elevation', params: { latitude: observation.latitude, longitude: observation.longitude }, context });
  const srtm = await fetchCaptured({ sourceId: 'opentopodata_srtm90', requestId: srtmId, url: 'https://api.opentopodata.org/v1/srtm90m', params: { locations: `${observation.latitude},${observation.longitude}` }, context });
  const gloValue = glo.ok ? JSON.parse(glo.bytes.toString('utf8')).elevation?.[0] ?? null : null;
  const srtmValue = srtm.ok ? JSON.parse(srtm.bytes.toString('utf8')).results?.[0]?.elevation ?? null : null;
  return {
    ok: glo.ok && srtm.ok,
    terrain: { glo90_m: gloValue, srtm90_m: srtmValue, glo90_request_id: gloId, srtm90_request_id: srtmId, nodata: gloValue === null || srtmValue === null },
  };
}

async function loadRound1Baseline(rootDir) {
  const baselinePath = join(rootDir, PACKAGE_RELATIVE_DIR, 'round1-baseline.jsonl');
  const path = await pathExists(baselinePath) ? baselinePath : join(rootDir, PACKAGE_RELATIVE_DIR, 'coordinate-review.jsonl');
  const bytes = await readFile(path);
  assert(sha256(bytes) === ROUND1_REVIEW_SHA256, `Round 1 baseline SHA mismatch: ${sha256(bytes)}`);
  assert(parseJsonl(bytes.toString('utf8')).length === 38, 'Round 1 baseline must contain 38 rows');
  return bytes.toString('utf8');
}

async function loadResumeCache(rootDir) {
  const candidates = [
    join(rootDir, ATTEMPT_RELATIVE_DIR, 'source-manifest.json'),
    join(rootDir, PACKAGE_RELATIVE_DIR, 'source-manifest.json'),
  ];
  let selectedPath = null;
  for (const path of candidates) {
    if (await pathExists(path)) {
      const candidate = JSON.parse(await readFile(path, 'utf8'));
      if (candidate.adapter_version === ADAPTER_VERSION) {
        selectedPath = path;
        break;
      }
    }
  }
  if (!selectedPath) return new Map();
  const manifest = JSON.parse(await readFile(selectedPath, 'utf8'));
  const packageDir = dirname(selectedPath);
  const cache = new Map();
  for (const record of manifest.requests || []) {
    if (!record.cache_key || !record.response_body_sha256 || !(record.http_status >= 200 && record.http_status < 300)) continue;
    const path = join(packageDir, record.response_cas_path);
    if (!(await pathExists(path))) continue;
    const bytes = await readFile(path);
    if (sha256(bytes) === record.response_body_sha256) cache.set(record.cache_key, { record, bytes });
  }
  return cache;
}

async function atomicReplaceDirectory(stageDir, targetDir) {
  const backupDir = `${targetDir}.backup-${process.pid}`;
  const existed = await pathExists(targetDir);
  try {
    if (existed) await rename(targetDir, backupDir);
    await rename(stageDir, targetDir);
    if (existed) await rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (await pathExists(targetDir)) await rm(targetDir, { recursive: true, force: true });
    if (existed && await pathExists(backupDir)) await rename(backupDir, targetDir);
    throw error;
  }
}

export function validateManifest(manifest, expectedAdapters = ADAPTERS, expectedSemantics = null) {
  assert(manifest.schema_version === 3, 'manifest schema version mismatch');
  assert(manifest.adapter_version === ADAPTER_VERSION, 'manifest adapter version mismatch');
  assert(manifest.credible_source_policy_version === CREDIBLE_SOURCE_POLICY_V2.version, 'manifest credible source policy mismatch');
  assert(manifest.frozen_input?.sha256 === FROZEN_INPUT_SHA256, 'manifest frozen input SHA mismatch');
  assert(manifest.entity_semantics_input?.path === ENTITY_SEMANTICS_INPUT, 'manifest entity semantics path mismatch');
  assert(manifest.entity_semantics_input?.entity_count === 359, 'manifest entity semantics closure mismatch');
  if (expectedSemantics) {
    assert(manifest.entity_semantics_input?.sha256 === expectedSemantics.sha256, 'manifest entity semantics SHA drift');
  }
  assert(JSON.stringify(manifest.pilot_keys) === JSON.stringify(PILOT_KEYS), 'manifest pilot keys mismatch');
  const endpoint = resolveOverpassEndpoint(manifest.overpass_transport?.endpoint || manifest.adapters?.osm?.endpoint);
  const endpointAdapters = adaptersForOverpassEndpoint(endpoint);
  const expected = expectedAdapters === ADAPTERS ? endpointAdapters : expectedAdapters;
  assert(JSON.stringify(stableObject(manifest.adapters)) === JSON.stringify(stableObject(expected)), 'manifest adapters mismatch');
  assert(manifest.overpass_transport?.source_family === 'osm', 'manifest Overpass source family must remain osm');
  assert(manifest.overpass_transport?.endpoint === endpoint, 'manifest Overpass endpoint drift');
  assert(manifest.preflight?.overpass?.generator, 'manifest Overpass pre-flight generator missing');
  assert(manifest.preflight?.overpass?.osm_base, 'manifest Overpass pre-flight osm_base missing');
  assert(/ODbL|openstreetmap\.org/iu.test(manifest.preflight?.overpass?.copyright || ''), 'manifest Overpass attribution missing');
  const overpassRequests = (manifest.requests || []).filter((request) => request.source_id === 'overpass');
  assert(overpassRequests.some((request) => request.request_id === 'preflight:overpass'), 'manifest Overpass pre-flight request missing');
  assert(overpassRequests.every((request) => request.url === endpoint), 'manifest mixes Overpass endpoints');
  return true;
}

function classifyAll(entities, rawObservations) {
  return entities.flatMap((entity) => {
    const target = deriveCoordinateTarget(entity);
    return rawObservations.filter((row) => row.effective_canonical_key === entity.effective_canonical_key)
      .length === 0
      ? []
      : classifyEntityObservations(
        entity,
        rawObservations.filter((row) => row.effective_canonical_key === entity.effective_canonical_key),
        target,
        entity.entity_semantics,
      );
  });
}

async function writeDeterministicFiles(targetDir, files) {
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(targetDir, name), content)));
}

async function verifyManifestSnapshots(packageDir, manifest) {
  const referenced = new Set();
  for (const request of manifest.requests) {
    if (!request.response_body_sha256) continue;
    referenced.add(request.response_body_sha256);
    const bytes = await readFile(join(packageDir, request.response_cas_path));
    assert(sha256(bytes) === request.response_body_sha256, `snapshot hash mismatch for ${request.request_id}`);
  }
  const found = (await readdir(join(packageDir, 'snapshots/sha256'))).sort(asciiCompare);
  assert(JSON.stringify(found) === JSON.stringify([...referenced].sort(asciiCompare)), 'snapshot CAS closure mismatch');
}

async function preserveFailedAttempt(rootDir, stageDir, overpassEndpoint) {
  const suffix = new URL(overpassEndpoint).hostname.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '');
  const attemptDir = join(rootDir, `${ENTITY_ATTEMPT_RELATIVE_DIR}-${suffix}`);
  await rm(attemptDir, { recursive: true, force: true });
  if (await pathExists(stageDir)) await rename(stageDir, attemptDir);
  return attemptDir;
}

export async function preflightPilot({ rootDir = MODULE_ROOT, overpassEndpoint = DEFAULT_OVERPASS_ENDPOINT } = {}) {
  const endpoint = resolveOverpassEndpoint(overpassEndpoint);
  const parent = join(rootDir, 'coordinate-review');
  await mkdir(parent, { recursive: true });
  const temp = await mkdtemp(join(parent, '.preflight-'));
  try {
    const context = await createContext(temp);
    const results = await preflight(context, endpoint);
    return { endpoint, results, request_count: context.requests.length };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function collectPilot({ rootDir = MODULE_ROOT, overpassEndpoint = DEFAULT_OVERPASS_ENDPOINT } = {}) {
  const endpoint = resolveOverpassEndpoint(overpassEndpoint);
  const adapters = adaptersForOverpassEndpoint(endpoint);
  const allEntities = await loadFrozenEntities(rootDir);
  const semantics = await loadEntitySemantics(rootDir, allEntities);
  const pilotEntities = pilotEntitiesFrom(allEntities, semantics.byKey);
  const defined = pilotEntities.filter((entity) => deriveCoordinateTarget(entity).target_definition_status === 'defined');
  const baseline = await loadRound1Baseline(rootDir);
  const parent = join(rootDir, 'coordinate-review');
  await mkdir(parent, { recursive: true });
  const stageDir = await mkdtemp(join(parent, '.round2-staging-'));
  const context = await createContext(stageDir, await loadResumeCache(rootDir));
  try {
    const preflightResults = await preflight(context, endpoint);
    const wikidata = await collectWikidata(defined, context);
    const osm = await collectOsm(defined, context, endpoint);
    const rawObservations = [];
    for (const entity of defined) {
      rawObservations.push(...(wikidata.observationsByKey.get(entity.effective_canonical_key) || []));
      rawObservations.push(...(osm.observationsByKey.get(entity.effective_canonical_key) || []));
    }
    const byKey = new Map(pilotEntities.map((row) => [row.effective_canonical_key, row]));
    const preliminary = classifyAll(defined, rawObservations);
    const demCompleteByKey = new Map(defined.map((entity) => [entity.effective_canonical_key, true]));
    for (const observation of preliminary.filter((row) => row.coordinate_role === 'target_exact')) {
      const dem = await collectDem(byKey.get(observation.effective_canonical_key), observation, context);
      const raw = rawObservations.find((row) => row.observation_id === observation.observation_id && row.effective_canonical_key === observation.effective_canonical_key);
      raw.terrain = dem.terrain;
      if (!dem.ok) demCompleteByKey.set(observation.effective_canonical_key, false);
    }
    const classified = classifyAll(pilotEntities, rawObservations);
    const collectionByKey = {};
    for (const entity of pilotEntities) {
      const target = deriveCoordinateTarget(entity);
      if (target.target_definition_status !== 'defined') {
        collectionByKey[entity.effective_canonical_key] = { minimum_sources_complete: true, any_source_available: true, source_outcomes: {} };
        continue;
      }
      const wd = wikidata.outcomes.get(entity.effective_canonical_key);
      const os = osm.outcomes.get(entity.effective_canonical_key);
      const entityExact = classified.filter((row) => row.effective_canonical_key === entity.effective_canonical_key && row.coordinate_role === 'target_exact');
      const demTransportComplete = entityExact.every((row) => row.terrain)
        && demCompleteByKey.get(entity.effective_canonical_key) !== false;
      collectionByKey[entity.effective_canonical_key] = {
        minimum_sources_complete: !['infra_blocked', 'source_unavailable'].includes(wd)
          && !['infra_blocked', 'source_unavailable'].includes(os)
          && (entityExact.length === 0 || demTransportComplete),
        any_source_available: wd !== 'infra_blocked' || os !== 'infra_blocked',
        source_outcomes: {
          wikidata: wd,
          osm: os,
          terrain: entityExact.length === 0 ? 'not_required' : demTransportComplete ? 'complete' : 'infra_blocked',
        },
        overpass_raw_count: osm.rawCounts.get(entity.effective_canonical_key),
      };
    }
    const manifest = {
      schema_version: 3,
      adapter_version: ADAPTER_VERSION,
      credible_source_policy_version: CREDIBLE_SOURCE_POLICY_V2.version,
      retrieved_at: new Date().toISOString(),
      frozen_input: { path: FROZEN_INPUT, sha256: FROZEN_INPUT_SHA256, entity_count: allEntities.length },
      entity_semantics_input: { path: ENTITY_SEMANTICS_INPUT, sha256: semantics.sha256, entity_count: semantics.records.length },
      round1_baseline_sha256: ROUND1_REVIEW_SHA256,
      pilot_keys: [...PILOT_KEYS], adapters, preflight: preflightResults,
      overpass_transport: {
        endpoint,
        source_family: 'osm',
        adapter_version: ADAPTER_VERSION,
        generator: preflightResults.overpass.generator,
        osm_base: preflightResults.overpass.osm_base,
      },
      requests: context.requests,
      collection: {
        observations: rawObservations.sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key) || asciiCompare(left.observation_id, right.observation_id)),
        by_effective_canonical_key: stableObject(collectionByKey),
      },
    };
    validateManifest(manifest, adapters, semantics);
    await writeFile(join(stageDir, 'source-manifest.json'), stableJson(manifest));
    const reviews = pilotEntities.map((entity) => buildReviewRecord(
      entity,
      rawObservations.filter((row) => row.effective_canonical_key === entity.effective_canonical_key),
      collectionByKey[entity.effective_canonical_key],
      deriveCoordinateTarget(entity),
      entity.entity_semantics,
    ));
    const classifiedForRender = classifyAll(pilotEntities, rawObservations);
    const parentAnchorAudit = buildParentAnchorAudit(pilotEntities, classifiedForRender, reviews, baseline);
    const files = renderDeterministicPackage(allEntities, classifiedForRender, reviews, baseline, { parent_anchor_audit: parentAnchorAudit });
    await writeDeterministicFiles(stageDir, files);
    const summary = JSON.parse(files['pilot-summary.json']);
    if (summary.metrics.overpass_infra_block_rate > 0.15) throw new Error(`Overpass infra block rate ${summary.metrics.overpass_infra_block_rate} exceeds 15%; recall is tentative`);
    await verifyManifestSnapshots(stageDir, manifest);
    await atomicReplaceDirectory(stageDir, join(rootDir, PACKAGE_RELATIVE_DIR));
    return { requests: context.requests.length, observations: rawObservations.length, reviews: reviews.length, summary };
  } catch (error) {
    const attemptDir = await preserveFailedAttempt(rootDir, stageDir, endpoint);
    error.message = `${error.message}; preserved attempt at ${attemptDir}`;
    throw error;
  }
}

async function readPilotManifest(rootDir) {
  const bytes = await readFile(join(rootDir, PACKAGE_RELATIVE_DIR, 'source-manifest.json'));
  assert(sha256(bytes) === SOURCE_MANIFEST_SHA256, `source manifest SHA mismatch: ${sha256(bytes)}`);
  return JSON.parse(bytes.toString('utf8'));
}

export async function buildPilot({ rootDir = MODULE_ROOT, outputDir = null } = {}) {
  const allEntities = await loadFrozenEntities(rootDir);
  const semantics = await loadEntitySemantics(rootDir, allEntities);
  const pilotEntities = pilotEntitiesFrom(allEntities, semantics.byKey);
  const manifest = await readPilotManifest(rootDir);
  validateManifest(manifest, ADAPTERS, semantics);
  await verifyManifestSnapshots(join(rootDir, PACKAGE_RELATIVE_DIR), manifest);
  const identityGold = await loadIdentityAdjudicationGold(rootDir);
  const rawObservations = manifest.collection?.observations || [];
  const classified = classifyAll(pilotEntities, rawObservations);
  const reviews = pilotEntities.map((entity) => buildReviewRecord(
    entity,
    rawObservations.filter((row) => row.effective_canonical_key === entity.effective_canonical_key),
    manifest.collection.by_effective_canonical_key[entity.effective_canonical_key],
    deriveCoordinateTarget(entity),
    entity.entity_semantics,
  ));
  const baseline = await readFile(join(rootDir, PACKAGE_RELATIVE_DIR, 'round1-baseline.jsonl'), 'utf8');
  assert(sha256(Buffer.from(baseline)) === ROUND1_REVIEW_SHA256, 'Round 1 baseline artifact SHA mismatch');
  const goldEvaluation = evaluateIdentityGold(identityGold.gold, classified, reviews);
  const parentAnchorAudit = buildParentAnchorAudit(pilotEntities, classified, reviews, parseJsonl(baseline));
  const collectionIntegrity = {
    review_closure: reviews.length === 38 && new Set(reviews.map((row) => row.effective_canonical_key)).size === 38,
    request_cas_complete: true,
    manifest_valid: true,
    offline_render_byte_identical: true,
  };
  const semanticReadiness = {
    needs_review_count: semantics.records.filter((row) => row.semantic_status === 'needs_review').length,
  };
  const renderOptions = {
    identity_gold: goldEvaluation,
    identity_gold_results: goldEvaluation.results,
    parent_anchor_audit: parentAnchorAudit,
    collection_integrity: collectionIntegrity,
    semantic_readiness: semanticReadiness,
    manual_accuracy_gold: { status: 'not_evaluable', false_verified_count: null },
  };
  const files = renderDeterministicPackage(allEntities, classified, reviews, baseline, renderOptions);
  const secondFiles = renderDeterministicPackage(allEntities, classified, reviews, baseline, renderOptions);
  collectionIntegrity.offline_render_byte_identical = Object.keys(files).every((name) => files[name] === secondFiles[name]);
  const finalFiles = collectionIntegrity.offline_render_byte_identical
    ? renderDeterministicPackage(allEntities, classified, reviews, baseline, renderOptions)
    : files;
  const targetDir = outputDir || join(rootDir, PACKAGE_RELATIVE_DIR);
  await mkdir(targetDir, { recursive: true });
  await writeDeterministicFiles(targetDir, finalFiles);
  return { observations: classified, reviews, files: finalFiles, goldEvaluation };
}

export async function checkPilot({ rootDir = MODULE_ROOT } = {}) {
  const packageDir = join(rootDir, PACKAGE_RELATIVE_DIR);
  const expected = new Set([
    'source-manifest.json', 'snapshots', 'round1-baseline.jsonl', 'observations.jsonl', 'coordinate-review.jsonl',
    'identity-gold-results.jsonl', 'parent-anchor-audit.jsonl', 'status-traceability.jsonl', 'conflicts-over-300m.jsonl', 'exceptions.md', 'downstream-impact.md', 'pilot-summary.json',
  ]);
  const found = await readdir(packageDir);
  for (const name of found) assert(expected.has(name), `unexpected pilot artifact: ${name}`);
  for (const name of expected) assert(found.includes(name), `missing pilot artifact: ${name}`);
  const allEntities = await loadFrozenEntities(rootDir);
  const semantics = await loadEntitySemantics(rootDir, allEntities);
  const manifest = await readPilotManifest(rootDir);
  validateManifest(manifest, ADAPTERS, semantics);
  assert(new Set(manifest.pilot_keys).size === 38, 'manifest pilot closure is not 38 unique keys');
  assert(Object.keys(manifest.collection.by_effective_canonical_key).length === 38, 'manifest collection closure is not 38 keys');
  await verifyManifestSnapshots(packageDir, manifest);
  const temporary = await mkdtemp(join(resolve(packageDir, '..'), '.pilot-check-'));
  try {
    const rebuilt = await buildPilot({ rootDir, outputDir: temporary });
    assert(rebuilt.reviews.length === 38, `expected 38 reviews, found ${rebuilt.reviews.length}`);
    for (const name of [...expected].filter((name) => !['source-manifest.json', 'snapshots'].includes(name))) {
      const actual = await readFile(join(packageDir, name));
      const generated = await readFile(join(temporary, name));
      assert(actual.equals(generated), `${name} is not byte-identical to offline rebuild`);
      assert(!actual.toString('utf8').includes('retrieved_at'), `${name} contains retrieved_at`);
    }
    const summary = JSON.parse(await readFile(join(packageDir, 'pilot-summary.json'), 'utf8'));
    assert(summary.metrics.coordinate_target_role_counts.representative_highpoint === 12, 'representative highpoint count is not 12');
    assert(summary.metrics.coordinate_target_role_counts.independent_summit === 17, 'independent summit count is not 17');
    assert(summary.metrics.needs_target_definition_count === 7, 'undefined target count is not 7');
    assert(summary.metrics.route_corridor_not_applicable_count === 2, 'route target count is not 2');
    assert(summary.metrics.admin_conflict_target_exact_count === 0, 'admin-conflict target_exact observations remain');
    assert(summary.metrics.identity_gold_false_accept_count === 0, 'identity gold false accept count is non-zero');
    assert(summary.metrics.identity_gold_false_reject_count === 0, 'identity gold false reject count is non-zero');
    assert(summary.metrics.identity_gold_anchor_trust_mismatch_count === 0, 'identity gold anchor trust mismatch count is non-zero');
    assert(summary.metrics.identity_gold_cluster_mismatch_count === 0, 'identity gold cluster mismatch count is non-zero');
    assert(summary.metrics.identity_gold_id_permutation_mismatch_count === 0, 'identity gold ID permutation mismatch count is non-zero');
    assert(summary.metrics.identity_gold_input_order_mismatch_count === 0, 'identity gold input-order mismatch count is non-zero');
    assert(summary.metrics.identity_gold_locality_mismatch_count === 0, 'identity gold locality mismatch count is non-zero');
    assert(summary.metrics.identity_gold_publishability_mismatch_count === 0, 'identity gold publishability mismatch count is non-zero');
    assert(summary.metrics.seed_only_publishable_count === 0, 'seed-only parent anchors remain publishable');
    assert(summary.metrics.nominatim_only_publishable_count === 0, 'Nominatim-only parent anchors remain publishable');
    assert(summary.metrics.wrong_class_trusted_anchor_count === 0, 'wrong-class parent anchor remains trusted');
    assert(summary.metrics.non_consensus_publishable_count === 0, 'non-consensus parent anchor remains publishable');
    assert(summary.metrics.multi_cluster_publishable_count === 0, 'multi-cluster parent anchor remains publishable');
    assert(summary.metrics.top_score_tie_publishable_count === 0, 'top-score-tie parent anchor remains publishable');
    assert(summary.metrics.id_permutation_mismatch_count === 0, 'parent-anchor ID permutation mismatch remains');
    assert(summary.metrics.input_order_mismatch_count === 0, 'parent-anchor input-order mismatch remains');
    assert(summary.metrics.dependency_duplicate_vote_count === 0, 'dependency duplicate vote remains');
    assert(summary.collection_decision === 'GO', 'collection decision is not GO');
    assert(summary.candidate_review_decision === 'GO', 'candidate review decision is not GO');
    assert(summary.auto_publish_decision === 'NO-GO', 'auto publish decision unexpectedly changed');
    assert(summary.full_359_target_run_decision === 'NO-GO', 'full 359 decision unexpectedly changed');
    return {
      request_count: manifest.requests.length,
      snapshot_count: new Set(manifest.requests.map((row) => row.response_body_sha256).filter(Boolean)).size,
      observation_count: rebuilt.observations.length,
      review_count: rebuilt.reviews.length,
      collection_decision: summary.collection_decision,
      candidate_review_decision: summary.candidate_review_decision,
      auto_publish_decision: summary.auto_publish_decision,
      full_359_target_run_decision: summary.full_359_target_run_decision,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function verifyByteIdentical(rootDir) {
  const parent = join(rootDir, 'coordinate-review');
  const first = await mkdtemp(join(parent, '.pilot-byte-first-'));
  const second = await mkdtemp(join(parent, '.pilot-byte-second-'));
  const names = ['round1-baseline.jsonl', 'observations.jsonl', 'coordinate-review.jsonl', 'identity-gold-results.jsonl', 'parent-anchor-audit.jsonl', 'status-traceability.jsonl', 'conflicts-over-300m.jsonl', 'exceptions.md', 'downstream-impact.md', 'pilot-summary.json'];
  try {
    await buildPilot({ rootDir, outputDir: first });
    await buildPilot({ rootDir, outputDir: second });
    for (const name of names) assert((await readFile(join(first, name))).equals(await readFile(join(second, name))), `${name} differs across offline rebuilds`);
    return names;
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  let overpassEndpoint = DEFAULT_OVERPASS_ENDPOINT;
  while (args.length) {
    const option = args.shift();
    if (option === '--overpass-endpoint') {
      assert(args.length > 0, '--overpass-endpoint requires a URL');
      overpassEndpoint = resolveOverpassEndpoint(args.shift());
    } else {
      throw new Error(`unknown option: ${option}`);
    }
  }
  if (!['preflight-pilot', 'collect-pilot'].includes(command)) {
    assert(overpassEndpoint === DEFAULT_OVERPASS_ENDPOINT, '--overpass-endpoint is only valid for online preflight/collect commands');
  }
  if (command === 'preflight-pilot') console.log(JSON.stringify(await preflightPilot({ rootDir: MODULE_ROOT, overpassEndpoint }), null, 2));
  else if (command === 'collect-pilot') console.log(JSON.stringify(await collectPilot({ rootDir: MODULE_ROOT, overpassEndpoint }), null, 2));
  else if (command === 'build-pilot') {
    const result = await buildPilot({ rootDir: MODULE_ROOT });
    console.log(JSON.stringify({ observations: result.observations.length, reviews: result.reviews.length }, null, 2));
  } else if (command === 'check-pilot') console.log(JSON.stringify(await checkPilot({ rootDir: MODULE_ROOT }), null, 2));
  else if (command === 'verify-byte-identical') console.log(JSON.stringify({ byte_identical: await verifyByteIdentical(MODULE_ROOT) }, null, 2));
  else throw new Error('usage: node review-coordinates.mjs <preflight-pilot|collect-pilot> [--overpass-endpoint URL] | <build-pilot|check-pilot|verify-byte-identical>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
