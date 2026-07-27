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
const MANAGED_LEDGER_FILES = [
  'candidates.jsonl',
  'effective_canonicals.jsonl',
  'reconciliation.md',
  'source_records.jsonl',
];
const ALLOWED_EXTERNAL_LEDGER_FILES = [
  'effective-canonical-enrichment.jsonl',
  'enrichment-review.md',
  'entity-semantics-review.md',
  'entity-semantics.jsonl',
];
const INPUT_SPECS = {
  'README.md': {
    role: 'provenance only，不参与 join',
    sha256: '5daffa3b22f9590af25279c8af088ea084b06c86fd22df96a136627cee11b4a6',
  },
  'seed-catalog.md': {
    role: '业务源',
    sha256: 'a9c733a12ab8ae51aa2d8f251f5bc93074124101a9a3cb5763eeeb60e42ccb03',
  },
  'seed-distance.md': {
    role: '业务源',
    sha256: '5228f072fadac773c0e75fe64f5e0177267889fce4471ef7faf057076923b04b',
  },
  'disposition-ledger.json': {
    role: '判定源',
    sha256: 'a20d357ea657a3397c82139eee40062b9c0adab8a46088a8028776559f134b37',
  },
};
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTITY_TYPES = new Set(['peak', 'massif_member', 'region_cluster', 'route_corridor']);
const DISPOSITIONS = new Set(['keep', 'keep_route', 'reject', 'merge']);
const ACCESS_STATUSES = new Set(['open', 'restricted', 'seasonal', 'closed', 'unknown']);
const PUBLICATION_STATUSES = new Set(['draft', 'published']);
const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected']);
const FIELD_ISSUE_STATUSES = new Set(['conflict', 'missing', 'unverified', 'withheld']);
const FIELD_ISSUE_NAMES = new Set(['altitude', 'gps', 'length', 'classic_route', 'description']);

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonl(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
}

function compositeKey(name, province) {
  return `${name.trim()}\u0000${province.trim()}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function splitRawLines(buffer) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) continue;
    let end = index;
    if (end > start && buffer[end - 1] === 0x0d) end -= 1;
    lines.push(buffer.subarray(start, end));
    start = index + 1;
  }
  if (start < buffer.length) {
    let end = buffer.length;
    if (end > start && buffer[end - 1] === 0x0d) end -= 1;
    lines.push(buffer.subarray(start, end));
  }
  return lines;
}

function parseCells(rawPayload) {
  assert(rawPayload.startsWith('|') && rawPayload.endsWith('|'), `malformed markdown row: ${rawPayload}`);
  return rawPayload.slice(1, -1).split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseGps(raw) {
  if (!raw) return { raw: null, latitude: null, longitude: null, present: false };
  const match = raw.match(
    /^(\d+(?:\.\d+)?)°?\s*([NS])\s*[,，]\s*(\d+(?:\.\d+)?)°?\s*([EW])$/i,
  );
  assert(match, `invalid GPS literal: ${raw}`);
  const latitude = Number(match[1]) * (match[2].toUpperCase() === 'S' ? -1 : 1);
  const longitude = Number(match[3]) * (match[4].toUpperCase() === 'W' ? -1 : 1);
  return { raw, latitude, longitude, present: true };
}

function extractLengthValues(raw) {
  const values = [];
  const rangeSpans = [];
  const rangePattern = /(\d+(?:\.\d+)?)\s*[-~～—–至]\s*(\d+(?:\.\d+)?)\s*(?:km|公里)/gi;
  for (const match of raw.matchAll(rangePattern)) {
    values.push(Number(match[1]), Number(match[2]));
    rangeSpans.push([match.index, match.index + match[0].length]);
  }

  const singlePattern = /(\d+(?:\.\d+)?)\s*(?:km|公里)/gi;
  for (const match of raw.matchAll(singlePattern)) {
    const inRange = rangeSpans.some(([start, end]) => match.index >= start && match.index < end);
    if (!inRange) values.push(Number(match[1]));
  }
  return values;
}

function parseAltitude(raw) {
  if (!raw) return { raw: null, value_m: null, parse_quality: 'missing' };
  const exact = raw.match(/^(\d+(?:\.\d+)?)m$/i);
  if (exact) return { raw, value_m: Number(exact[1]), parse_quality: 'exact_literal' };
  const numeric = raw.match(/(\d+(?:\.\d+)?)/);
  return {
    raw,
    value_m: numeric ? Number(numeric[1]) : null,
    parse_quality: numeric ? 'ambiguous_literal' : 'missing',
  };
}

function parseLength(raw, values) {
  if (!raw || values.length === 0) {
    return { raw: raw || null, value_km: null, candidate_values_km: [], parse_quality: 'missing' };
  }
  const hasRange = /\d+(?:\.\d+)?\s*[-~～—–至]\s*\d+(?:\.\d+)?\s*(?:km|公里)/i.test(raw);
  const hasApproximation = /(?:约|左右|以上|以下|起步|不低于|近)\s*\d/i.test(raw);
  const ambiguous = values.length !== 1 || hasRange || hasApproximation;
  return {
    raw,
    value_km: ambiguous ? null : values[0],
    candidate_values_km: values,
    parse_quality: ambiguous ? 'ambiguous_literal' : 'exact_literal',
  };
}

function parseMarkdownDocument(buffer, sourceDocumentId) {
  const rows = [];
  let province = null;
  const expectedHeader = '山峰名称';

  for (const lineBytes of splitRawLines(buffer)) {
    const rawPayload = lineBytes.toString('utf8');
    const heading = rawPayload.match(/^###\s+(.+?)(?:（\d+座）)?\s*$/);
    if (heading) {
      province = heading[1].trim();
      continue;
    }
    if (!rawPayload.startsWith('|')) continue;

    const cells = parseCells(rawPayload);
    if (cells[0] === expectedHeader || isSeparatorRow(cells)) continue;
    assert(province, `${sourceDocumentId} row appears before a province heading: ${rawPayload}`);

    const expectedCounts = sourceDocumentId === 'catalog' ? new Set([6, 7]) : new Set([3]);
    assert(
      expectedCounts.has(cells.length),
      `${sourceDocumentId} row has unexpected ${cells.length} columns: ${rawPayload}`,
    );

    let parsed;
    let gpsPresent = false;
    if (sourceDocumentId === 'catalog') {
      const [name, altitudeRaw, difficultyRaw, region, description] = cells;
      const gpsRaw = cells.length === 7 ? cells[5] : null;
      const classicRoute = cells.length === 7 ? cells[6] : cells[5];
      const gps = parseGps(gpsRaw);
      gpsPresent = gps.present;
      parsed = {
        name,
        province,
        altitude_raw: altitudeRaw,
        difficulty_raw: difficultyRaw,
        region,
        description,
        summit_gps_raw: gps.raw,
        summit_latitude: gps.latitude,
        summit_longitude: gps.longitude,
        classic_route: classicRoute,
      };
    } else {
      const [name, difficultyRaw, routeDistanceRaw] = cells;
      parsed = {
        name,
        province,
        difficulty_raw: difficultyRaw,
        route_distance_raw: routeDistanceRaw,
        length_values_km: extractLengthValues(routeDistanceRaw),
      };
    }

    rows.push({
      source_document_id: sourceDocumentId,
      source_row_id: `${sourceDocumentId}:${String(rows.length + 1).padStart(4, '0')}`,
      source_hash: sha256(lineBytes),
      raw_payload: rawPayload,
      column_count: cells.length,
      gps_present: gpsPresent,
      parsed,
    });
  }
  return rows;
}

function countBy(rows, keySelector) {
  const counts = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => asciiCompare(left, right)));
}

function frozenResolution(dispositionLedger) {
  assert(Array.isArray(dispositionLedger.ledger), 'disposition ledger must contain ledger[]');
  const entries = dispositionLedger.ledger;
  const mergedNameTargets = new Map();
  for (const entry of entries) {
    for (const mergedName of entry.merged_names || []) {
      const composite = compositeKey(mergedName, entry.province);
      assert(!mergedNameTargets.has(composite), `merged name has multiple targets: ${mergedName}`);
      mergedNameTargets.set(composite, entry.canonical_key);
    }
  }
  const resolvedByCandidate = new Map();
  for (const entry of entries) {
    const resolved = entry.disposition === 'merge'
      ? mergedNameTargets.get(compositeKey(entry.primary_name, entry.province))
      : entry.canonical_key;
    assert(resolved, `cannot resolve frozen merge target for ${entry.canonical_key}`);
    resolvedByCandidate.set(entry.canonical_key, resolved);
  }
  return resolvedByCandidate;
}

function decisionStats(entries, resolvedKey) {
  const rows = Object.entries(entries);
  const dispositionCounts = countBy(rows, ([, value]) => value.disposition);
  const entityTypeCounts = countBy(rows, ([, value]) => value.entity_type);
  return {
    candidates: rows.length,
    resolved: new Set(rows.map(([key, value]) => resolvedKey(key, value))).size,
    survivors: (dispositionCounts.keep || 0) + (dispositionCounts.keep_route || 0),
    excluded: (dispositionCounts.reject || 0) + (dispositionCounts.merge || 0),
    routeCorridors: entityTypeCounts.route_corridor || 0,
    dispositionCounts,
    entityTypeCounts,
  };
}

function assertStringArray(value, message) {
  assert(Array.isArray(value) && value.every((item) => typeof item === 'string'), message);
}

function assertFieldIssues(owner, fieldIssues) {
  assert(fieldIssues && typeof fieldIssues === 'object' && !Array.isArray(fieldIssues), `${owner} has invalid field_issues`);
  for (const [field, issues] of Object.entries(fieldIssues)) {
    assert(FIELD_ISSUE_NAMES.has(field), `${owner} has unknown field issue ${field}`);
    assert(Array.isArray(issues) && issues.length > 0, `${owner} field issue ${field} must be a non-empty array`);
    for (const issue of issues) {
      assert(FIELD_ISSUE_STATUSES.has(issue.status), `${owner} field issue ${field} has invalid status`);
      assert(typeof issue.reason === 'string' && issue.reason, `${owner} field issue ${field} has no reason`);
      assertStringArray(issue.source_candidate_keys, `${owner} field issue ${field} has invalid source keys`);
    }
  }
}

function assertRouteShape(owner, route) {
  assert(route && typeof route === 'object' && !Array.isArray(route), `${owner} route must be an object`);
  assert(SLUG_PATTERN.test(route.route_key), `${owner} route has invalid route_key`);
  assert(typeof route.name === 'string' && route.name, `${owner} route has no name`);
  assertStringArray(route.source_candidate_keys, `${owner} route has invalid source_candidate_keys`);
  assert(route.source_candidate_keys.length > 0, `${owner} route has no source candidates`);
  assertStringArray(route.provinces, `${owner} route has invalid provinces`);
  assert(route.entrance === null || typeof route.entrance === 'string', `${owner} route has invalid entrance`);
  assert(route.aspect === null || route.aspect === 'south' || route.aspect === 'north', `${owner} route has invalid aspect`);
  assert(ACCESS_STATUSES.has(route.access_status), `${owner} route has invalid access_status`);
  assert(route.permit_required === null || typeof route.permit_required === 'boolean', `${owner} route has invalid permit_required`);
  assert(PUBLICATION_STATUSES.has(route.publication_status), `${owner} route has invalid publication_status`);
  assert(REVIEW_STATUSES.has(route.review_status), `${owner} route has invalid review_status`);
  assertStringArray(route.route_raws, `${owner} route has invalid route_raws`);
  assertStringArray(route.length_raws, `${owner} route has invalid length_raws`);
  assertFieldIssues(`${owner} route ${route.route_key}`, route.field_issues);
}

function assertCommonEffectiveShape(key, value, sourceDispositionSha256) {
  assert(typeof value.primary_name === 'string' && value.primary_name, `${key} has no primary_name`);
  assert(value.primary_summit === null || typeof value.primary_summit === 'string', `${key} has invalid primary_summit`);
  assert(ENTITY_TYPES.has(value.entity_type), `${key} has invalid entity_type`);
  assert(DISPOSITIONS.has(value.disposition), `${key} has invalid disposition`);
  assert(typeof value.reason === 'string', `${key} has invalid reason`);
  assertStringArray(value.aliases, `${key} has invalid aliases`);
  assert(value.massif_key === null || SLUG_PATTERN.test(value.massif_key), `${key} has invalid massif_key`);
  assert(ACCESS_STATUSES.has(value.access_status), `${key} has invalid access_status`);
  assert(value.permit_required === null || typeof value.permit_required === 'boolean', `${key} has invalid permit_required`);
  assert(PUBLICATION_STATUSES.has(value.publication_status), `${key} has invalid publication_status`);
  assert(REVIEW_STATUSES.has(value.review_status), `${key} has invalid review_status`);
  assert(Array.isArray(value.mountain_routes), `${key} has invalid mountain_routes`);
  for (const route of value.mountain_routes) assertRouteShape(key, route);
  assertFieldIssues(key, value.field_issues);
  assert(value.source_disposition_sha256 === sourceDispositionSha256, `${key} source disposition SHA mismatch`);
}

function assertDecisionShape(key, value, sourceDispositionSha256) {
  assert(SLUG_PATTERN.test(key), `canonical key is not an ASCII slug: ${key}`);
  assert(value && typeof value === 'object' && !Array.isArray(value), `override ${key} must be an object`);
  assert(
    value.source_identity && typeof value.source_identity.name === 'string' && typeof value.source_identity.province === 'string',
    `override ${key} has invalid source_identity`,
  );
  assert(typeof value.province === 'string' && value.province, `override ${key} has no province`);
  assert(SLUG_PATTERN.test(value.effective_canonical_key), `override ${key} has invalid effective_canonical_key`);
  assertStringArray(value.merged_names, `override ${key} has invalid merged_names`);
  assertCommonEffectiveShape(`override ${key}`, value, sourceDispositionSha256);
  if (value.disposition === 'merge') {
    assert(value.merge_target_effective_canonical_key, `merge ${key} has no target`);
    assert(
      value.effective_canonical_key === value.merge_target_effective_canonical_key,
      `merge ${key} effective key must equal its target`,
    );
  } else {
    assert(value.merge_target_effective_canonical_key === null, `non-merge ${key} cannot have a merge target`);
  }
}

function assertSyntheticShape(key, value, sourceDispositionSha256) {
  assert(SLUG_PATTERN.test(key), `synthetic key is not an ASCII slug: ${key}`);
  assert(value && typeof value === 'object' && !Array.isArray(value), `synthetic ${key} must be an object`);
  assert(value.disposition === 'keep' || value.disposition === 'keep_route', `synthetic ${key} must survive`);
  assertStringArray(value.provinces, `synthetic ${key} has invalid provinces`);
  assertStringArray(value.source_candidate_keys, `synthetic ${key} has invalid source_candidate_keys`);
  assert(value.source_candidate_keys.length > 0, `synthetic ${key} has no source candidates`);
  assertCommonEffectiveShape(`synthetic ${key}`, value, sourceDispositionSha256);
}

export function validateOverrideGraph(overrides) {
  const byCanonicalKey = overrides.by_canonical_key;
  const synthetics = overrides.synthetic_canonicals;
  const effectiveOwners = new Map();

  for (const [key, value] of Object.entries(byCanonicalKey)) {
    assertDecisionShape(key, value, overrides.source_disposition_sha256);
  }
  for (const [key, value] of Object.entries(synthetics)) {
    assertSyntheticShape(key, value, overrides.source_disposition_sha256);
  }

  for (const [key, value] of Object.entries(byCanonicalKey)) {
    if (value.disposition === 'merge') {
      assert(value.merge_target_effective_canonical_key !== key, `merge ${key} cannot target itself`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (key) => {
    if (visiting.has(key)) throw new Error(`merge resolution cycle detected at ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    const target = byCanonicalKey[key]?.merge_target_effective_canonical_key;
    if (target && byCanonicalKey[target]?.disposition === 'merge') visit(target);
    visiting.delete(key);
    visited.add(key);
  };
  for (const [key, value] of Object.entries(byCanonicalKey)) {
    if (value.disposition === 'merge') visit(key);
  }

  for (const [key, value] of Object.entries(byCanonicalKey)) {
    if (value.disposition === 'merge') continue;
    const effectiveKey = value.effective_canonical_key;
    assert(!effectiveOwners.has(effectiveKey), `duplicate effective canonical key: ${effectiveKey}`);
    effectiveOwners.set(effectiveKey, { kind: 'candidate', key, value });
  }
  for (const [key, value] of Object.entries(synthetics)) {
    assert(!effectiveOwners.has(key), `duplicate effective canonical key: ${key}`);
    effectiveOwners.set(key, { kind: 'synthetic', key, value });
  }

  for (const [key, value] of Object.entries(byCanonicalKey)) {
    if (value.disposition !== 'merge') continue;
    const target = value.merge_target_effective_canonical_key;
    assert(effectiveOwners.has(target), `merge target ${target} for ${key} does not exist`);
    assert(effectiveOwners.get(target).value.disposition !== 'reject', `merge ${key} cannot target reject ${target}`);
  }

  for (const [key, value] of Object.entries(synthetics)) {
    const actual = Object.entries(byCanonicalKey)
      .filter(([, decision]) => decision.disposition === 'merge' && decision.effective_canonical_key === key)
      .map(([candidateKey]) => candidateKey)
      .sort(asciiCompare);
    const expected = [...value.source_candidate_keys].sort(asciiCompare);
    assert(JSON.stringify(actual) === JSON.stringify(expected), `synthetic ${key} source candidates do not match merge decisions`);
  }
}

function validateOverrides(overrides, sourceDispositionSha256) {
  assert(overrides?.schema_version === 2, 'overrides schema_version must be 2');
  assert(overrides.source_disposition_sha256 === sourceDispositionSha256, 'overrides source disposition SHA mismatch');
  assert(overrides.by_canonical_key && typeof overrides.by_canonical_key === 'object' && !Array.isArray(overrides.by_canonical_key), 'overrides by_canonical_key must be an object');
  assert(overrides.synthetic_canonicals && typeof overrides.synthetic_canonicals === 'object' && !Array.isArray(overrides.synthetic_canonicals), 'overrides synthetic_canonicals must be an object');

  const compositeToKey = new Map();
  for (const [key, value] of Object.entries(overrides.by_canonical_key)) {
    assertDecisionShape(key, value, sourceDispositionSha256);
    const composite = compositeKey(value.source_identity.name, value.source_identity.province);
    assert(!compositeToKey.has(composite), `duplicate source identity: ${value.source_identity.name} @ ${value.source_identity.province}`);
    compositeToKey.set(composite, key);
  }
  assert(Object.keys(overrides.by_canonical_key).length === 406, 'overrides must contain 406 source-bound candidates');
  for (const [key, value] of Object.entries(overrides.synthetic_canonicals)) {
    assertSyntheticShape(key, value, sourceDispositionSha256);
    for (const sourceKey of value.source_candidate_keys) {
      assert(overrides.by_canonical_key[sourceKey], `synthetic ${key} references missing source candidate ${sourceKey}`);
    }
  }
  validateOverrideGraph(overrides);
  return compositeToKey;
}

function bootstrapOverrides(dispositionLedger, sourceDispositionSha256) {
  const resolvedByCandidate = frozenResolution(dispositionLedger);
  const byCanonicalKey = {};
  for (const entry of [...dispositionLedger.ledger].sort((left, right) => asciiCompare(left.canonical_key, right.canonical_key))) {
    const mergeTarget = entry.disposition === 'merge' ? resolvedByCandidate.get(entry.canonical_key) : null;
    byCanonicalKey[entry.canonical_key] = {
      source_identity: { name: entry.primary_name, province: entry.province },
      primary_name: entry.primary_name,
      effective_canonical_key: mergeTarget || entry.canonical_key,
      primary_summit: null,
      province: entry.province,
      entity_type: entry.entity_type,
      disposition: entry.disposition,
      reason: entry.reason,
      aliases: entry.aliases || [],
      massif_key: entry.massif_key || null,
      merged_names: entry.merged_names || [],
      merge_target_effective_canonical_key: mergeTarget,
      access_status: 'unknown',
      permit_required: null,
      publication_status: 'draft',
      review_status: 'pending',
      mountain_routes: [],
      field_issues: {},
      source_disposition_sha256: sourceDispositionSha256,
    };
  }
  const overrides = {
    schema_version: 2,
    source_disposition_sha256: sourceDispositionSha256,
    by_canonical_key: byCanonicalKey,
    synthetic_canonicals: {},
  };
  validateOverrides(overrides, sourceDispositionSha256);
  return overrides;
}

async function readAndVerifyInputs(rootDir) {
  const buffers = {};
  const hashes = {};
  for (const [file, spec] of Object.entries(INPUT_SPECS)) {
    const bytes = await readFile(join(rootDir, file));
    const actual = sha256(bytes);
    assert(actual === spec.sha256, `${file} SHA mismatch: expected ${spec.sha256}, got ${actual}`);
    buffers[file] = bytes;
    hashes[file] = actual;
  }

  const disposition = JSON.parse(buffers['disposition-ledger.json'].toString('utf8'));
  assert(
    disposition._meta?.seed_catalog_sha256 === hashes['seed-catalog.md'],
    'disposition catalog SHA does not match the business source',
  );
  assert(
    disposition._meta?.seed_distance_sha256 === hashes['seed-distance.md'],
    'disposition distance SHA does not match the business source',
  );
  return { buffers, hashes, disposition };
}

function sourceMap(records, label) {
  const map = new Map();
  for (const record of records) {
    const key = compositeKey(record.parsed.name, record.parsed.province);
    assert(!map.has(key), `duplicate ${label} name/province: ${record.parsed.name} @ ${record.parsed.province}`);
    map.set(key, record);
  }
  return map;
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort(asciiCompare);
}

function emptyAltitude() {
  return { raw: null, value_m: null, parse_quality: 'missing' };
}

function emptyLength() {
  return { raw: null, value_km: null, candidate_values_km: [], parse_quality: 'missing' };
}

function emptyGps() {
  return { raw: null, latitude: null, longitude: null, present: false };
}

function issueSort(left, right) {
  return asciiCompare(`${left.status}\u0000${left.reason}\u0000${left.source_candidate_keys.join(',')}`, `${right.status}\u0000${right.reason}\u0000${right.source_candidate_keys.join(',')}`);
}

function uniqueIssues(issues) {
  const keyed = new Map();
  for (const issue of issues) {
    const normalized = {
      status: issue.status,
      reason: issue.reason,
      source_candidate_keys: [...new Set(issue.source_candidate_keys)].sort(asciiCompare),
    };
    keyed.set(JSON.stringify(normalized), normalized);
  }
  return [...keyed.values()].sort(issueSort);
}

function fieldValue(candidate, field) {
  if (field === 'altitude') return candidate.altitude.value_m === null ? null : candidate.altitude;
  if (field === 'gps') return candidate.gps.present ? candidate.gps : null;
  if (field === 'length') return candidate.length.parse_quality === 'exact_literal' ? candidate.length : null;
  if (field === 'classic_route') return candidate.classic_route || null;
  if (field === 'description') return candidate.description || null;
  throw new Error(`unsupported aggregate field: ${field}`);
}

function normalizedFieldValue(field, value) {
  if (field === 'altitude') return String(value.value_m);
  if (field === 'gps') return `${value.latitude},${value.longitude}`;
  if (field === 'length') return String(value.value_km);
  return value;
}

function aggregateField(field, candidates, definitionIssues = []) {
  const issues = [...definitionIssues];
  const definitionBlocks = definitionIssues.length > 0;
  const values = [];
  for (const candidate of candidates) {
    const candidateIssues = candidate.field_issues[field] || [];
    issues.push(...candidateIssues);
    if (candidateIssues.length > 0 || definitionBlocks) continue;
    const value = fieldValue(candidate, field);
    if (value !== null) values.push({ candidateKey: candidate.canonical_key, value });
  }
  const byValue = new Map();
  for (const entry of values) {
    const normalized = normalizedFieldValue(field, entry.value);
    if (!byValue.has(normalized)) byValue.set(normalized, []);
    byValue.get(normalized).push(entry);
  }
  if (byValue.size > 1) {
    issues.push({
      status: 'conflict',
      reason: `多个干净来源的 ${field} 值不一致，Phase 0 不提升`,
      source_candidate_keys: values.map((entry) => entry.candidateKey),
    });
    return { value: null, issues: uniqueIssues(issues) };
  }
  const first = byValue.values().next().value?.[0]?.value || null;
  return { value: first, issues: uniqueIssues(issues) };
}

function sortRoutes(routes) {
  return [...routes]
    .map((route) => ({
      ...route,
      source_candidate_keys: [...route.source_candidate_keys].sort(asciiCompare),
      provinces: [...route.provinces].sort(asciiCompare),
      route_raws: [...route.route_raws].sort(asciiCompare),
      length_raws: [...route.length_raws].sort(asciiCompare),
      field_issues: Object.fromEntries(
        Object.entries(route.field_issues).sort(([left], [right]) => asciiCompare(left, right)).map(([field, issues]) => [field, uniqueIssues(issues)]),
      ),
    }))
    .sort((left, right) => asciiCompare(left.route_key, right.route_key));
}

function buildModel({ catalogBytes, distanceBytes, dispositionLedger, overrides }) {
  const overrideCompositeMap = validateOverrides(overrides, overrides.source_disposition_sha256);
  const frozenResolvedByCandidate = frozenResolution(dispositionLedger);
  const sourceDispositionByKey = Object.fromEntries(dispositionLedger.ledger.map((entry) => [entry.canonical_key, entry]));
  const catalogParsed = parseMarkdownDocument(catalogBytes, 'catalog');
  const distanceParsed = parseMarkdownDocument(distanceBytes, 'distance');
  const catalogMap = sourceMap(catalogParsed, 'catalog');
  const distanceMap = sourceMap(distanceParsed, 'distance');
  const overrideComposites = new Set(overrideCompositeMap.keys());
  const catalogComposites = new Set(catalogMap.keys());
  const distanceComposites = new Set(distanceMap.keys());
  const alignment = {
    catalogMinusDistance: setDifference(catalogComposites, distanceComposites),
    distanceMinusCatalog: setDifference(distanceComposites, catalogComposites),
    catalogMinusOverrides: setDifference(catalogComposites, overrideComposites),
    overridesMinusCatalog: setDifference(overrideComposites, catalogComposites),
    distanceMinusOverrides: setDifference(distanceComposites, overrideComposites),
    overridesMinusDistance: setDifference(overrideComposites, distanceComposites),
  };
  for (const [name, differences] of Object.entries(alignment)) {
    assert(differences.length === 0, `${name} contains ${differences.length} unmatched rows`);
  }

  const decorateSource = (record) => {
    const candidateKey = overrideCompositeMap.get(compositeKey(record.parsed.name, record.parsed.province));
    assert(candidateKey, `unmapped source row ${record.source_row_id}`);
    const decision = overrides.by_canonical_key[candidateKey];
    return {
      source_document_id: record.source_document_id,
      source_row_id: record.source_row_id,
      source_hash: record.source_hash,
      raw_payload: record.raw_payload,
      column_count: record.column_count,
      gps_present: record.gps_present,
      mapped_candidate_key: candidateKey,
      resolved_canonical_key: frozenResolvedByCandidate.get(candidateKey),
      effective_canonical_key: decision.effective_canonical_key,
      parsed: record.parsed,
    };
  };

  const catalog = catalogParsed.map(decorateSource);
  const distance = distanceParsed.map(decorateSource);
  const sourceRecords = [...catalog, ...distance];
  const sourceByCandidate = new Map();
  for (const record of sourceRecords) {
    if (!sourceByCandidate.has(record.mapped_candidate_key)) sourceByCandidate.set(record.mapped_candidate_key, {});
    const group = sourceByCandidate.get(record.mapped_candidate_key);
    assert(!group[record.source_document_id], `candidate ${record.mapped_candidate_key} has duplicate ${record.source_document_id} source`);
    group[record.source_document_id] = record;
  }

  const incomingMerges = new Map();
  for (const [key, decision] of Object.entries(overrides.by_canonical_key)) {
    if (decision.disposition !== 'merge') continue;
    if (!incomingMerges.has(decision.effective_canonical_key)) incomingMerges.set(decision.effective_canonical_key, []);
    incomingMerges.get(decision.effective_canonical_key).push(key);
  }

  const candidates = [];
  for (const [canonicalKey, decision] of Object.entries(overrides.by_canonical_key).sort(([left], [right]) => asciiCompare(left, right))) {
    const sources = sourceByCandidate.get(canonicalKey);
    assert(sources?.catalog && sources?.distance, `candidate ${canonicalKey} must have catalog and distance sources`);
    assert(sources.catalog.parsed.difficulty_raw === sources.distance.parsed.difficulty_raw, `candidate ${canonicalKey} has mismatched difficulty literals`);
    const catalogRow = sources.catalog.parsed;
    const distanceRow = sources.distance.parsed;
    const sourceDecision = sourceDispositionByKey[canonicalKey];
    candidates.push({
      canonical_key: canonicalKey,
      source_identity: decision.source_identity,
      resolved_canonical_key: frozenResolvedByCandidate.get(canonicalKey),
      effective_canonical_key: decision.effective_canonical_key,
      source_disposition: sourceDecision.disposition,
      source_entity_type: sourceDecision.entity_type,
      primary_name: decision.primary_name,
      primary_summit: decision.primary_summit,
      province: decision.province,
      entity_type: decision.entity_type,
      disposition: decision.disposition,
      reason: decision.reason,
      aliases: [...decision.aliases].sort(asciiCompare),
      massif_key: decision.massif_key,
      merged_names: [...decision.merged_names].sort(asciiCompare),
      merge_target_effective_canonical_key: decision.merge_target_effective_canonical_key,
      incoming_merge_candidate_keys: (incomingMerges.get(decision.effective_canonical_key) || [])
        .filter((key) => key !== canonicalKey)
        .sort(asciiCompare),
      access_status: decision.access_status,
      permit_required: decision.permit_required,
      publication_status: decision.publication_status,
      review_status: decision.review_status,
      mountain_routes: sortRoutes(decision.mountain_routes),
      field_issues: Object.fromEntries(
        Object.entries(decision.field_issues).sort(([left], [right]) => asciiCompare(left, right)).map(([field, issues]) => [field, uniqueIssues(issues)]),
      ),
      source_refs: {
        catalog: { source_row_id: sources.catalog.source_row_id, source_hash: sources.catalog.source_hash },
        distance: { source_row_id: sources.distance.source_row_id, source_hash: sources.distance.source_hash },
      },
      difficulty_raw: catalogRow.difficulty_raw,
      region: catalogRow.region,
      description: catalogRow.description,
      classic_route: catalogRow.classic_route,
      gps: {
        raw: catalogRow.summit_gps_raw,
        latitude: catalogRow.summit_latitude,
        longitude: catalogRow.summit_longitude,
        present: sources.catalog.gps_present,
      },
      altitude: parseAltitude(catalogRow.altitude_raw),
      length: parseLength(distanceRow.route_distance_raw, distanceRow.length_values_km),
      duration: { raw: null, value_minutes: null, parse_quality: 'missing' },
    });
  }

  const candidateByKey = new Map(candidates.map((candidate) => [candidate.canonical_key, candidate]));
  const groups = new Map();
  for (const candidate of candidates) {
    if (candidate.disposition === 'reject') continue;
    if (!groups.has(candidate.effective_canonical_key)) groups.set(candidate.effective_canonical_key, []);
    groups.get(candidate.effective_canonical_key).push(candidate);
  }

  const effectiveCanonicals = [];
  for (const [effectiveKey, group] of [...groups.entries()].sort(([left], [right]) => asciiCompare(left, right))) {
    const synthetic = overrides.synthetic_canonicals[effectiveKey] || null;
    const owner = synthetic || group.find((candidate) => candidate.disposition !== 'merge');
    assert(owner, `effective canonical ${effectiveKey} has no surviving owner`);
    const definitionIssues = synthetic?.field_issues || {};
    const altitude = aggregateField('altitude', group, definitionIssues.altitude || []);
    const gps = aggregateField('gps', group, definitionIssues.gps || []);
    const length = aggregateField('length', group, definitionIssues.length || []);
    const classicRoute = aggregateField('classic_route', group, definitionIssues.classic_route || []);
    const description = aggregateField('description', group, definitionIssues.description || []);
    const fieldIssues = {};
    for (const [field, aggregate] of Object.entries({ altitude, gps, length, classic_route: classicRoute, description })) {
      if (aggregate.issues.length > 0) fieldIssues[field] = aggregate.issues;
    }
    const sourceCandidateKeys = group.map((candidate) => candidate.canonical_key).sort(asciiCompare);
    const aliases = new Set(owner.aliases || []);
    for (const candidate of group) {
      for (const alias of candidate.aliases) aliases.add(alias);
      for (const mergedName of candidate.merged_names) aliases.add(mergedName);
    }
    aliases.delete(owner.primary_name);
    effectiveCanonicals.push({
      effective_canonical_key: effectiveKey,
      primary_name: owner.primary_name,
      primary_summit: owner.primary_summit,
      aliases: [...aliases].sort(asciiCompare),
      provinces: [...new Set(synthetic?.provinces || group.map((candidate) => candidate.province))].sort(asciiCompare),
      entity_type: owner.entity_type,
      disposition: owner.disposition,
      massif_key: owner.massif_key,
      access_status: owner.access_status,
      permit_required: owner.permit_required,
      publication_status: owner.publication_status,
      review_status: owner.review_status,
      source_candidate_keys: sourceCandidateKeys,
      source_refs: sourceCandidateKeys.map((key) => ({ canonical_key: key, ...candidateByKey.get(key).source_refs })),
      altitude: altitude.value || emptyAltitude(),
      gps: gps.value || emptyGps(),
      length: length.value || emptyLength(),
      duration: { raw: null, value_minutes: null, parse_quality: 'missing' },
      description: description.value,
      classic_routes: classicRoute.value ? [classicRoute.value] : [],
      mountain_routes: sortRoutes(owner.mountain_routes),
      field_issues: fieldIssues,
    });
  }

  assert(sourceRecords.length === 812, `expected 812 source records, got ${sourceRecords.length}`);
  assert(candidates.length === 406, `expected 406 candidates, got ${candidates.length}`);
  assert(new Set(candidates.map((row) => row.canonical_key)).size === 406, 'candidate keys are not unique');

  const sourceEntries = Object.fromEntries(dispositionLedger.ledger.map((entry) => [entry.canonical_key, entry]));
  const sourceDecisionStats = decisionStats(sourceEntries, (key) => frozenResolvedByCandidate.get(key));
  const effectiveDecisionStats = decisionStats(overrides.by_canonical_key, (_key, value) => value.effective_canonical_key);
  assert(sourceDecisionStats.candidates === 406, `source disposition expected 406 candidates, got ${sourceDecisionStats.candidates}`);
  assert(sourceDecisionStats.resolved === 403, `source disposition expected 403 resolved identities, got ${sourceDecisionStats.resolved}`);
  assert(sourceDecisionStats.survivors === 362, `source disposition expected 362 survivors, got ${sourceDecisionStats.survivors}`);
  assert(sourceDecisionStats.excluded === 44, `source disposition expected 44 excluded decisions, got ${sourceDecisionStats.excluded}`);
  assert(sourceDecisionStats.routeCorridors === 9, `source disposition expected 9 route corridors, got ${sourceDecisionStats.routeCorridors}`);

  const effectiveSourceKeys = new Set(effectiveCanonicals.flatMap((entity) => entity.source_candidate_keys));
  const expectedEffectiveSourceKeys = new Set(candidates.filter((candidate) => candidate.disposition !== 'reject').map((candidate) => candidate.canonical_key));
  const catalogNames = new Set(catalog.map((row) => row.parsed.name));
  const distanceNames = new Set(distance.map((row) => row.parsed.name));
  const qualityCounts = {
    altitude: countBy(candidates, (row) => row.altitude.parse_quality),
    length: countBy(candidates, (row) => row.length.parse_quality),
    duration: countBy(candidates, (row) => row.duration.parse_quality),
  };
  const unaccounted = {
    catalog_unmapped: alignment.catalogMinusOverrides.length,
    distance_unmapped: alignment.distanceMinusOverrides.length,
    override_without_catalog: alignment.overridesMinusCatalog.length,
    override_without_distance: alignment.overridesMinusDistance.length,
    candidate_missing_source_pair: candidates.filter((row) => !row.source_refs.catalog || !row.source_refs.distance).length,
    unresolved_merge_targets: candidates.filter((row) => row.disposition === 'merge' && !row.merge_target_effective_canonical_key).length,
    eligible_candidate_unmapped: setDifference(expectedEffectiveSourceKeys, effectiveSourceKeys).length,
    rejected_candidate_promoted: candidates.filter((candidate) => candidate.disposition === 'reject' && effectiveSourceKeys.has(candidate.canonical_key)).length,
    effective_without_sources: effectiveCanonicals.filter((entity) => entity.source_candidate_keys.length === 0).length,
  };
  unaccounted.total = Object.values(unaccounted).reduce((sum, value) => sum + value, 0);
  assert(unaccounted.total === 0, `unaccounted must be 0, got ${unaccounted.total}`);

  return {
    sourceRecords,
    candidates,
    effectiveCanonicals,
    stats: {
      sourceRecords: sourceRecords.length,
      catalogRows: catalog.length,
      distanceRows: distance.length,
      catalogDistinctNames: catalogNames.size,
      distanceDistinctNames: distanceNames.size,
      catalogMinusDistanceNames: setDifference(catalogNames, distanceNames),
      distanceMinusCatalogNames: setDifference(distanceNames, catalogNames),
      catalogColumnCounts: countBy(catalog, (row) => String(row.column_count)),
      distanceColumnCounts: countBy(distance, (row) => String(row.column_count)),
      sixColumnRows: catalog.filter((row) => row.column_count === 6),
      catalogWithoutGps: catalog.filter((row) => row.gps_present === false).length,
      qualityCounts,
      sourceDecisionStats,
      effectiveDecisionStats,
      syntheticCanonicals: Object.keys(overrides.synthetic_canonicals).length,
      effectiveCanonicals: effectiveCanonicals.length,
      effectiveDispositionCounts: countBy(effectiveCanonicals, (row) => row.disposition),
      effectiveEntityTypeCounts: countBy(effectiveCanonicals, (row) => row.entity_type),
      unaccounted,
    },
  };
}

function renderReconciliation({ hashes, model }) {
  const { stats, candidates, effectiveCanonicals } = model;
  const mergeRows = candidates.filter((row) => row.disposition === 'merge');
  const sourceCounts = stats.sourceDecisionStats.dispositionCounts;
  const effectiveCounts = stats.effectiveDecisionStats.dispositionCounts;
  const sourceEntityCounts = stats.sourceDecisionStats.entityTypeCounts;
  const effectiveEntityCounts = stats.effectiveEntityTypeCounts;
  const parentized = candidates.filter(
    (row) => row.canonical_key !== 'yulong-xueshan-xuebao-ding'
      && row.primary_summit
      && row.primary_name !== row.source_identity.name,
  );
  const yulongPrimarySummitCorrections = candidates.filter(
    (row) => row.canonical_key === 'yulong-xueshan-xuebao-ding'
      && row.primary_summit
      && row.primary_name !== row.source_identity.name,
  );
  const lines = [
    '# FU-51/FU-77 Phase 0 · Entity Resolution Reconciliation',
    '',
    '## Input integrity',
    '',
    '| Path | Role | SHA-256 |',
    '| --- | --- | --- |',
  ];
  for (const file of ['seed-catalog.md', 'seed-distance.md', 'disposition-ledger.json', 'README.md']) {
    lines.push(`| \`data/mountains/${file}\` | ${INPUT_SPECS[file].role} | \`${hashes[file]}\` |`);
  }
  lines.push(
    '',
    '## Record layers',
    '',
    '| Layer | Count |',
    '| --- | ---: |',
    `| Source records | ${stats.sourceRecords} |`,
    `| Source-bound candidates | ${stats.sourceDecisionStats.candidates} |`,
    `| Frozen source-resolved identities | ${stats.sourceDecisionStats.resolved} |`,
    `| Effective-mapped identities | ${stats.effectiveDecisionStats.resolved} |`,
    `| Source-bound eligible decisions | ${stats.effectiveDecisionStats.survivors} |`,
    `| Source-bound excluded decisions | ${stats.effectiveDecisionStats.excluded} |`,
    `| Synthetic canonicals | ${stats.syntheticCanonicals} |`,
    `| Final effective canonicals | ${stats.effectiveCanonicals} |`,
    '',
    `- Frozen source: 406 -> ${stats.sourceDecisionStats.resolved} -> survivors ${stats.sourceDecisionStats.survivors} / excluded ${stats.sourceDecisionStats.excluded}.`,
    `- Effective equation: 406 = ${stats.effectiveDecisionStats.survivors} eligible + ${effectiveCounts.reject || 0} reject + ${effectiveCounts.merge || 0} merge.`,
    `- Identity equation: ${stats.effectiveDecisionStats.resolved} = ${stats.effectiveCanonicals} effective eligible + ${effectiveCounts.reject || 0} rejected.`,
    '',
    '## Source alignment',
    '',
    `- catalog rows: ${stats.catalogRows}`,
    `- distance rows: ${stats.distanceRows}`,
    `- catalog distinct names: ${stats.catalogDistinctNames}`,
    `- distance distinct names: ${stats.distanceDistinctNames}`,
    `- catalog ∖ distance names: ${stats.catalogMinusDistanceNames.length}`,
    `- distance ∖ catalog names: ${stats.distanceMinusCatalogNames.length}`,
    `- catalog columns: 7=${stats.catalogColumnCounts['7'] || 0}, 6=${stats.catalogColumnCounts['6'] || 0}`,
    `- distance columns: 3=${stats.distanceColumnCounts['3'] || 0}`,
    '',
    '## Decision counts',
    '',
    '| Decision | Frozen source | Source-bound overrides | Final effective |',
    '| --- | ---: | ---: | ---: |',
  );
  for (const decision of ['keep', 'keep_route', 'reject', 'merge']) {
    lines.push(`| ${decision} | ${sourceCounts[decision] || 0} | ${effectiveCounts[decision] || 0} | ${stats.effectiveDispositionCounts[decision] || 0} |`);
  }
  lines.push(
    '',
    '## Entity type counts',
    '',
    '| Entity type | Frozen source | Final effective |',
    '| --- | ---: | ---: |',
  );
  for (const entityType of ['peak', 'massif_member', 'region_cluster', 'route_corridor']) {
    lines.push(`| ${entityType} | ${sourceEntityCounts[entityType] || 0} | ${effectiveEntityCounts[entityType] || 0} |`);
  }
  lines.push(
    '',
    '## Parse quality',
    '',
    '| Field | exact_literal | ambiguous_literal | missing |',
    '| --- | ---: | ---: | ---: |',
    `| altitude | ${stats.qualityCounts.altitude.exact_literal || 0} | ${stats.qualityCounts.altitude.ambiguous_literal || 0} | ${stats.qualityCounts.altitude.missing || 0} |`,
    `| length | ${stats.qualityCounts.length.exact_literal || 0} | ${stats.qualityCounts.length.ambiguous_literal || 0} | ${stats.qualityCounts.length.missing || 0} |`,
    `| duration | ${stats.qualityCounts.duration.exact_literal || 0} | ${stats.qualityCounts.duration.ambiguous_literal || 0} | ${stats.qualityCounts.duration.missing || 0} |`,
    '',
    `- catalog rows without GPS: ${stats.catalogWithoutGps}`,
    '',
    '## Six-column catalog rows',
    '',
    '| Name | Province |',
    '| --- | --- |',
  );
  for (const row of stats.sixColumnRows) {
    lines.push(`| ${row.parsed.name} | ${row.parsed.province} |`);
  }
  lines.push(
    '',
    '## Entity correction summary',
    '',
    `- A-group parentized mountain bodies: ${parentized.length}`,
    `- D-group Yulong primary summit corrections: ${yulongPrimarySummitCorrections.length}`,
    `- Synthetic merged mountain bodies: ${stats.syntheticCanonicals}`,
    `- Final route corridors: ${stats.effectiveEntityTypeCounts.route_corridor || 0}`,
    '',
    '### Synthetic route topology',
    '',
    '| Effective key | Routes | Source candidates |',
    '| --- | ---: | --- |',
  );
  for (const key of ['yuzhu-feng', 'huanggang-shan', 'wuling-shan', 'tiantang-zhai']) {
    const entity = effectiveCanonicals.find((row) => row.effective_canonical_key === key);
    if (entity) lines.push(`| \`${key}\` | ${entity.mountain_routes.length} | ${entity.source_candidate_keys.map((item) => `\`${item}\``).join(', ')} |`);
  }
  lines.push('', '## Merge resolution', '', '| Candidate | Source-resolved | Effective target |', '| --- | --- | --- |');
  for (const row of mergeRows) {
    lines.push(`| \`${row.canonical_key}\` | \`${row.resolved_canonical_key}\` | \`${row.effective_canonical_key}\` |`);
  }
  lines.push(
    '',
    '## Entity-resolution trace',
    '',
    '| Source key | Source name | Frozen resolved | Effective key | Decision / entity | Parent summit | Routes | Access |',
    '| --- | --- | --- | --- | --- | --- | ---: | --- |',
  );
  for (const row of candidates) {
    lines.push(
      `| \`${row.canonical_key}\` | ${row.source_identity.name} | \`${row.resolved_canonical_key}\` | \`${row.effective_canonical_key}\` | ${row.disposition} / ${row.entity_type} | ${row.primary_summit || '-'} | ${row.mountain_routes.length} | ${row.access_status} |`,
    );
  }
  lines.push(
    '',
    '## Unaccounted',
    '',
    '| Check | Count |',
    '| --- | ---: |',
  );
  for (const [name, count] of Object.entries(stats.unaccounted)) {
    lines.push(`| ${name} | ${count} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function validateRenderedArtifacts(artifacts, model) {
  const sourceLines = artifacts['source_records.jsonl'].toString('utf8').trimEnd().split('\n');
  const candidateLines = artifacts['candidates.jsonl'].toString('utf8').trimEnd().split('\n');
  const effectiveLines = artifacts['effective_canonicals.jsonl'].toString('utf8').trimEnd().split('\n');
  assert(sourceLines.length === 812, `rendered source_records has ${sourceLines.length} lines`);
  assert(candidateLines.length === 406, `rendered candidates has ${candidateLines.length} lines`);
  assert(effectiveLines.length === model.effectiveCanonicals.length, `rendered effective_canonicals has ${effectiveLines.length} lines`);
  for (const line of sourceLines) JSON.parse(line);
  for (const line of candidateLines) JSON.parse(line);
  for (const line of effectiveLines) JSON.parse(line);
  assert(artifacts['reconciliation.md'].length > 0, 'rendered reconciliation is empty');
}

async function buildExpected(rootDir, { requireOverrides = false, forceBootstrap = false } = {}) {
  const inputs = await readAndVerifyInputs(rootDir);
  const sourceDispositionSha256 = inputs.hashes['disposition-ledger.json'];
  const bootstrapped = bootstrapOverrides(inputs.disposition, sourceDispositionSha256);
  const overridePath = join(rootDir, 'overrides.json');
  const existingOverride = await pathExists(overridePath);
  if (requireOverrides && !existingOverride) throw new Error('missing managed artifact: overrides.json');

  let overrides;
  let overrideBytesToWrite = null;
  if (forceBootstrap || !existingOverride) {
    overrides = bootstrapped;
    overrideBytesToWrite = Buffer.from(stableJson(overrides));
  } else {
    overrides = JSON.parse(await readFile(overridePath, 'utf8'));
    validateOverrides(overrides, sourceDispositionSha256);
  }

  const model = buildModel({
    catalogBytes: inputs.buffers['seed-catalog.md'],
    distanceBytes: inputs.buffers['seed-distance.md'],
    dispositionLedger: inputs.disposition,
    overrides,
  });
  const artifacts = {
    'source_records.jsonl': Buffer.from(jsonl(model.sourceRecords)),
    'candidates.jsonl': Buffer.from(jsonl(model.candidates)),
    'effective_canonicals.jsonl': Buffer.from(jsonl(model.effectiveCanonicals)),
    'reconciliation.md': Buffer.from(renderReconciliation({ hashes: inputs.hashes, model })),
  };
  validateRenderedArtifacts(artifacts, model);
  return { artifacts, overrideBytesToWrite, overrides, model, hashes: inputs.hashes };
}

async function verifyStagedArtifacts(stageDir, artifacts, preservedExternalFiles = []) {
  const entries = (await readdir(stageDir)).sort(asciiCompare);
  const expectedEntries = [...MANAGED_LEDGER_FILES, ...preservedExternalFiles].sort(asciiCompare);
  assert(
    JSON.stringify(entries) === JSON.stringify(expectedEntries),
    `staged ledger files mismatch: ${entries.join(', ')}`,
  );
  for (const [file, expected] of Object.entries(artifacts)) {
    const actual = await readFile(join(stageDir, file));
    assert(actual.equals(expected), `staged ${file} content mismatch`);
  }
}

async function installAtomically(rootDir, artifacts, overrideBytesToWrite) {
  const stageLedger = await mkdtemp(join(rootDir, '.ledger-staging-'));
  const backupLedger = `${stageLedger}-backup`;
  const stageOverride = `${stageLedger}-overrides.json`;
  const backupOverride = `${stageLedger}-overrides-backup.json`;
  const ledgerPath = join(rootDir, 'ledger');
  const overridePath = join(rootDir, 'overrides.json');
  const hadLedger = await pathExists(ledgerPath);
  const hadOverride = await pathExists(overridePath);
  let oldLedgerMoved = false;
  let newLedgerInstalled = false;
  let oldOverrideMoved = false;
  let newOverrideInstalled = false;

  const cleanupTransactionFiles = async () => {
    const results = await Promise.allSettled([
      rm(stageLedger, { recursive: true, force: true }),
      rm(backupLedger, { recursive: true, force: true }),
      rm(stageOverride, { force: true }),
      rm(backupOverride, { force: true }),
    ]);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        'failed to clean ledger transaction files',
      );
    }
  };

  try {
    await Promise.all(
      Object.entries(artifacts).map(([file, bytes]) => writeFile(join(stageLedger, file), bytes)),
    );
    const preservedExternalFiles = [];
    if (hadLedger) {
      for (const file of ALLOWED_EXTERNAL_LEDGER_FILES) {
        const source = join(ledgerPath, file);
        if (!await pathExists(source)) continue;
        await writeFile(join(stageLedger, file), await readFile(source));
        preservedExternalFiles.push(file);
      }
    }
    await verifyStagedArtifacts(stageLedger, artifacts, preservedExternalFiles);
    if (overrideBytesToWrite) {
      await writeFile(stageOverride, overrideBytesToWrite);
      const parsed = JSON.parse((await readFile(stageOverride)).toString('utf8'));
      assert(parsed.schema_version === 2, 'staged overrides are invalid');
    }

    if (overrideBytesToWrite && hadOverride) {
      await rename(overridePath, backupOverride);
      oldOverrideMoved = true;
    }
    if (overrideBytesToWrite) {
      await rename(stageOverride, overridePath);
      newOverrideInstalled = true;
    }
    if (hadLedger) {
      await rename(ledgerPath, backupLedger);
      oldLedgerMoved = true;
    }
    await rename(stageLedger, ledgerPath);
    newLedgerInstalled = true;
  } catch (error) {
    if (newLedgerInstalled && await pathExists(ledgerPath)) {
      await rm(ledgerPath, { recursive: true, force: true });
    }
    if (oldLedgerMoved && await pathExists(backupLedger)) {
      await rename(backupLedger, ledgerPath);
    }
    if (newOverrideInstalled && await pathExists(overridePath)) {
      await rm(overridePath, { force: true });
    }
    if (oldOverrideMoved && await pathExists(backupOverride)) {
      await rename(backupOverride, overridePath);
    }
    await cleanupTransactionFiles().catch(() => {});
    throw error;
  }

  // Once both new artifacts are installed, cleanup failure must not roll back
  // a complete ledger to a backup that may already have been removed.
  await cleanupTransactionFiles();
}

function transactionResidue(name) {
  return /^(?:\.ledger-(?:staging|backup)-|\.overrides-.*(?:tmp|backup))/.test(name);
}

export async function generateLedger({ rootDir = MODULE_ROOT, forceBootstrap = false } = {}) {
  const expected = await buildExpected(rootDir, { forceBootstrap });
  await installAtomically(rootDir, expected.artifacts, expected.overrideBytesToWrite);
  return expected.model.stats;
}

export async function checkLedger({ rootDir = MODULE_ROOT } = {}) {
  const expected = await buildExpected(rootDir, { requireOverrides: true });
  const ledgerPath = join(rootDir, 'ledger');
  if (!await pathExists(ledgerPath)) throw new Error('missing managed artifact: ledger/');
  const entries = (await readdir(ledgerPath)).sort(asciiCompare);
  const missing = MANAGED_LEDGER_FILES.filter((file) => !entries.includes(file));
  if (missing.length) throw new Error(`missing managed artifact: ledger/${missing[0]}`);
  const unexpected = entries.filter((file) =>
    !MANAGED_LEDGER_FILES.includes(file) && !ALLOWED_EXTERNAL_LEDGER_FILES.includes(file));
  if (unexpected.length) throw new Error(`unexpected managed artifact: ledger/${unexpected[0]}`);

  for (const [file, expectedBytes] of Object.entries(expected.artifacts)) {
    const actualBytes = await readFile(join(ledgerPath, file));
    if (!actualBytes.equals(expectedBytes)) throw new Error(`content mismatch: ledger/${file}`);
  }
  const rootEntries = await readdir(rootDir);
  const residue = rootEntries.find(transactionResidue);
  if (residue) throw new Error(`unexpected managed artifact: ${residue}`);
  return expected.model.stats;
}

async function runCli() {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(['--check', '--force-bootstrap']);
  for (const arg of args) assert(allowed.has(arg), `unknown argument: ${arg}`);
  assert(!(args.has('--check') && args.has('--force-bootstrap')), '--check cannot be combined with --force-bootstrap');
  const stats = args.has('--check')
    ? await checkLedger({ rootDir: MODULE_ROOT })
    : await generateLedger({ rootDir: MODULE_ROOT, forceBootstrap: args.has('--force-bootstrap') });
  const mode = args.has('--check') ? 'checked' : 'generated';
  process.stdout.write(
    `${mode}: source=${stats.sourceRecords}, candidates=${stats.effectiveDecisionStats.candidates}, source_resolved=${stats.sourceDecisionStats.resolved}, effective_mapped=${stats.effectiveDecisionStats.resolved}, source_bound_survivors=${stats.effectiveDecisionStats.survivors}, synthetic=${stats.syntheticCanonicals}, effective=${stats.effectiveCanonicals}, unaccounted=${stats.unaccounted.total}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
