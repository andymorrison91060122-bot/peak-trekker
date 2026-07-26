import { createHash } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = 'ledger/effective_canonicals.jsonl';
const OVERRIDES_PATH = 'entity-semantics-overrides.json';
const OUTPUT_PATH = 'ledger/entity-semantics.jsonl';
const REVIEW_PATH = 'ledger/entity-semantics-review.md';
const FROZEN_SHA256 = '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294';

const ENTITY_KINDS = new Set(['mountain_area', 'independent_peak', 'route_corridor']);
const TARGET_ROLES = new Set(['representative_highpoint', 'independent_summit', 'route_highpoint', 'none']);
const VERIFICATION_SCOPES = new Set(['area_or_route', 'summit_proximity', 'route_geometry']);
const ROUTE_CONTEXT_RE = /(南坡|北坡|东坡|西坡|入口|进山口|大门|景区|路线|线路|环线|穿越|古道|大本营|起点|终点)/u;
const AREA_NAME_RE = /(山|山脉|山系|岭|景区|地貌|高原|丘陵|峡谷|森林公园|国家公园)$/u;
const PEAK_NAME_RE = /(峰|顶|尖|海子山|K2)$/iu;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanNames(values) {
  return uniq(values.map((value) => String(value || '').trim()).filter(Boolean)).sort(asciiCompare);
}

function routeContextNames(entity) {
  return cleanNames([
    ...(entity.aliases || []),
    ...(entity.classic_routes || []),
    ...(entity.mountain_routes || []).flatMap((route) => [
      route.name,
      ...(route.route_raws || []),
    ]),
  ].filter((value) => ROUTE_CONTEXT_RE.test(String(value))));
}

function exactIndependentNames(entity, override) {
  const excluded = new Set(cleanNames(override.exact_target_name_exclusions || []));
  return cleanNames([
    entity.primary_name,
    ...(entity.aliases || []),
    ...(override.exact_target_name_additions || []),
  ].filter((name) => !ROUTE_CONTEXT_RE.test(String(name)) && !excluded.has(String(name))));
}

function queryNames(entity, override, exactNames) {
  return cleanNames([
    entity.primary_name,
    entity.primary_summit,
    ...(entity.aliases || []),
    ...(override.query_name_additions || []),
    ...exactNames,
    ...routeContextNames(entity),
  ]);
}

function autoSemantics(entity) {
  if (entity.entity_type === 'route_corridor') {
    return {
      semantic_status: 'confirmed',
      catalog_entity_kind: 'route_corridor',
      coordinate_target_role: 'route_highpoint',
      verification_scope: 'route_geometry',
      representative_highpoint_name: null,
      independent_summit_name: null,
      classification_basis: 'automatic:route_corridor',
      decision_reason: 'Phase 0 entity_type is route_corridor; route highpoint is deferred to route geometry.',
    };
  }
  if (entity.primary_summit) {
    return {
      semantic_status: 'confirmed',
      catalog_entity_kind: 'mountain_area',
      coordinate_target_role: 'representative_highpoint',
      verification_scope: 'area_or_route',
      representative_highpoint_name: entity.primary_summit,
      independent_summit_name: null,
      classification_basis: 'automatic:primary_summit',
      decision_reason: `${entity.primary_name} is the product entity; ${entity.primary_summit} is its representative highpoint.`,
    };
  }
  if (entity.entity_type === 'massif_member') {
    return {
      semantic_status: 'confirmed',
      catalog_entity_kind: 'independent_peak',
      coordinate_target_role: 'independent_summit',
      verification_scope: 'summit_proximity',
      representative_highpoint_name: null,
      independent_summit_name: entity.primary_name,
      classification_basis: 'automatic:massif_member',
      decision_reason: 'Massif membership groups related peaks without merging this independently selectable peak.',
    };
  }
  return {
    semantic_status: 'needs_review',
    catalog_entity_kind: null,
    coordinate_target_role: 'none',
    verification_scope: null,
    representative_highpoint_name: null,
    independent_summit_name: null,
    classification_basis: 'unresolved:peak_is_not_semantics',
    decision_reason: 'Phase 0 entity_type=peak does not distinguish a mountain area from an independent summit.',
  };
}

function applyOverride(entity, automatic, override = {}) {
  const hasClassification = Boolean(
    override.catalog_entity_kind
    || override.coordinate_target_role
    || override.verification_scope,
  );
  const merged = {
    ...automatic,
    ...(override.catalog_entity_kind ? { catalog_entity_kind: override.catalog_entity_kind } : {}),
    ...(override.coordinate_target_role ? { coordinate_target_role: override.coordinate_target_role } : {}),
    ...(override.verification_scope ? { verification_scope: override.verification_scope } : {}),
    ...(Object.hasOwn(override, 'representative_highpoint_name')
      ? { representative_highpoint_name: override.representative_highpoint_name } : {}),
    ...(Object.hasOwn(override, 'independent_summit_name')
      ? { independent_summit_name: override.independent_summit_name } : {}),
    ...(override.reason ? { decision_reason: override.reason } : {}),
  };
  if (hasClassification) {
    merged.semantic_status = 'confirmed';
    merged.classification_basis = 'manual_override';
  }
  return merged;
}

function riskFlags(entity, semantics, override) {
  const flags = [];
  const routeNames = routeContextNames(entity);
  if (semantics.semantic_status === 'needs_review') {
    flags.push('peak_semantics_unresolved');
    if (AREA_NAME_RE.test(entity.primary_name) && !PEAK_NAME_RE.test(entity.primary_name)) {
      flags.push('possible_mountain_area_modeled_as_peak');
    }
  }
  if (routeNames.length) flags.push('route_context_present_in_source_names');
  const exactCandidates = [
    entity.primary_name,
    ...(entity.aliases || []),
    ...(override.exact_target_name_additions || []),
  ];
  if (exactCandidates.some((name) => ROUTE_CONTEXT_RE.test(String(name)))) {
    flags.push('route_context_may_be_misread_as_exact_target');
  }
  if (semantics.catalog_entity_kind === 'mountain_area'
    && semantics.coordinate_target_role === 'none') {
    flags.push('mountain_area_without_representative_highpoint');
  }
  return cleanNames(flags);
}

export function buildSemanticRecord(entity, override = {}) {
  const automatic = autoSemantics(entity);
  const semantics = applyOverride(entity, automatic, override);
  assert(['confirmed', 'needs_review'].includes(semantics.semantic_status), `invalid semantic status for ${entity.effective_canonical_key}`);
  if (semantics.semantic_status === 'confirmed') {
    assert(ENTITY_KINDS.has(semantics.catalog_entity_kind), `invalid catalog entity kind for ${entity.effective_canonical_key}`);
    assert(TARGET_ROLES.has(semantics.coordinate_target_role), `invalid coordinate target role for ${entity.effective_canonical_key}`);
    assert(VERIFICATION_SCOPES.has(semantics.verification_scope), `invalid verification scope for ${entity.effective_canonical_key}`);
  }
  if (semantics.catalog_entity_kind === 'mountain_area') {
    assert(semantics.verification_scope === 'area_or_route', `${entity.effective_canonical_key} mountain area scope mismatch`);
    assert(['representative_highpoint', 'none'].includes(semantics.coordinate_target_role), `${entity.effective_canonical_key} mountain area target mismatch`);
  }
  if (semantics.catalog_entity_kind === 'independent_peak') {
    assert(semantics.coordinate_target_role === 'independent_summit', `${entity.effective_canonical_key} independent peak target mismatch`);
    assert(semantics.verification_scope === 'summit_proximity', `${entity.effective_canonical_key} independent peak scope mismatch`);
  }
  if (semantics.catalog_entity_kind === 'route_corridor') {
    assert(semantics.coordinate_target_role === 'route_highpoint', `${entity.effective_canonical_key} route target mismatch`);
    assert(semantics.verification_scope === 'route_geometry', `${entity.effective_canonical_key} route scope mismatch`);
  }

  let exactTargetNames = [];
  if (semantics.coordinate_target_role === 'representative_highpoint') {
    const name = semantics.representative_highpoint_name;
    assert(name, `${entity.effective_canonical_key} representative highpoint missing`);
    exactTargetNames = cleanNames([
      name,
      `${entity.primary_name}${name}`,
      ...(override.exact_target_name_additions || []),
    ]);
  } else if (semantics.coordinate_target_role === 'independent_summit') {
    assert(semantics.independent_summit_name, `${entity.effective_canonical_key} independent summit name missing`);
    exactTargetNames = exactIndependentNames(entity, override);
  }

  const query = semantics.coordinate_target_role === 'route_highpoint'
    ? []
    : queryNames(entity, override, exactTargetNames);
  const flags = riskFlags(entity, semantics, override);
  return {
    effective_canonical_key: entity.effective_canonical_key,
    primary_name: entity.primary_name,
    source_entity_type: entity.entity_type,
    source_primary_summit: entity.primary_summit || null,
    source_massif_key: entity.massif_key || null,
    semantic_status: semantics.semantic_status,
    catalog_entity_kind: semantics.catalog_entity_kind,
    coordinate_target_role: semantics.coordinate_target_role,
    verification_scope: semantics.verification_scope,
    representative_highpoint_name: semantics.representative_highpoint_name,
    independent_summit_name: semantics.independent_summit_name,
    query_names: query,
    exact_target_names: exactTargetNames,
    route_context_names: routeContextNames(entity),
    classification_basis: semantics.classification_basis,
    decision_reason: semantics.decision_reason,
    risk_flags: flags,
    source_fields: {
      aliases: cleanNames(entity.aliases || []),
      provinces: cleanNames(entity.provinces || []),
      classic_routes: cleanNames(entity.classic_routes || []),
      mountain_route_names: cleanNames((entity.mountain_routes || []).map((route) => route.name)),
    },
  };
}

function countBy(records, selector) {
  const output = {};
  for (const record of records) {
    const key = selector(record);
    output[key] = (output[key] || 0) + 1;
  }
  return stableObject(output);
}

function reportSection(title, rows) {
  const lines = [`## ${title}`, ''];
  if (!rows.length) return [...lines, '- None', ''];
  lines.push('| canonical key | product name | current type | suggested/confirmed type | representative highpoint | reason | source fields |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.effective_canonical_key} | ${row.primary_name} | ${row.source_entity_type} | ${row.catalog_entity_kind || 'needs_review'} | ${row.representative_highpoint_name || '--'} | ${row.decision_reason.replaceAll('|', '\\|')} | ${row.risk_flags.join(', ') || '--'} |`);
  }
  lines.push('');
  return lines;
}

function lockedBeforeAfter(records) {
  const byKey = new Map(records.map((row) => [row.effective_canonical_key, row]));
  const rows = [
    {
      subject: '广东白云山',
      before: '产品名“白云山”曾被坐标 Pilot 当作 exact summit 名',
      after: `${byKey.get('baiyun-shan-guangdong').primary_name} remains product entity; representative highpoint=${byKey.get('baiyun-shan-guangdong').representative_highpoint_name}; exact names exclude bare 白云山`,
    },
    {
      subject: '泰山',
      before: '产品实体与玉皇顶坐标目标未在独立语义层表达',
      after: `catalog_entity_kind=${byKey.get('taishan').catalog_entity_kind}; representative_highpoint=${byKey.get('taishan').representative_highpoint_name}; verification_scope=${byKey.get('taishan').verification_scope}`,
    },
    {
      subject: '华山',
      before: '产品实体与南峰坐标目标未在独立语义层表达',
      after: `catalog_entity_kind=${byKey.get('huashan').catalog_entity_kind}; representative_highpoint=${byKey.get('huashan').representative_highpoint_name}; verification_scope=${byKey.get('huashan').verification_scope}`,
    },
    {
      subject: '四姑娘山峰群',
      before: '共享 massif 与重复 seed GPS 可能被误读为同一产品实体',
      after: '大峰/二峰/三峰/幺妹峰/骆驼峰 remain independent_peak with independent_summit targets',
    },
    {
      subject: '玉珠峰',
      before: '坐标 Pilot 标为 mountain body；北坡/南坡进入 target aliases',
      after: `catalog_entity_kind=${byKey.get('yuzhu-feng').catalog_entity_kind}; exact_target_names=${byKey.get('yuzhu-feng').exact_target_names.join(', ')}; route context remains query-only`,
    },
  ];
  return [
    '## Locked Before / After Cases',
    '',
    '| Subject | Before | After |',
    '|---|---|---|',
    ...rows.map((row) => `| ${row.subject} | ${row.before} | ${row.after} |`),
    '',
  ];
}

export function buildReview(records, inputSha) {
  const confirmedAreas = records.filter((row) => row.catalog_entity_kind === 'mountain_area');
  const confirmedPeaks = records.filter((row) => row.catalog_entity_kind === 'independent_peak');
  const routes = records.filter((row) => row.catalog_entity_kind === 'route_corridor');
  const needsReview = records.filter((row) => row.semantic_status === 'needs_review');
  const areaRisk = records.filter((row) => row.risk_flags.includes('possible_mountain_area_modeled_as_peak'));
  const routeRisk = records.filter((row) => row.risk_flags.includes('route_context_may_be_misread_as_exact_target'));
  const lines = [
    '# Entity Semantics Review',
    '',
    `- Frozen effective canonicals SHA-256: \`${inputSha}\``,
    `- Entity closure: ${records.length}/359`,
    `- Confirmed mountain_area: ${confirmedAreas.length}`,
    `- Confirmed independent_peak: ${confirmedPeaks.length}`,
    `- Route corridors: ${routes.length}`,
    `- Needs review: ${needsReview.length}`,
    `- Coordinate target roles: \`${JSON.stringify(countBy(records, (row) => row.coordinate_target_role))}\``,
    '',
    'Risk heuristics below only queue manual review. They never change semantic classification.',
    '',
    ...lockedBeforeAfter(records),
    ...reportSection('Confirmed Mountain Areas', confirmedAreas),
    ...reportSection('Confirmed Independent Peaks', confirmedPeaks),
    ...reportSection('Route Corridors', routes),
    ...reportSection('Needs Review', needsReview),
    ...reportSection('High Risk: Mountain Area Possibly Modeled As Peak', areaRisk),
    ...reportSection('High Risk: Route Context Could Be Misread As Target Alias', routeRisk),
  ];
  return `${lines.join('\n')}\n`;
}

async function load(rootDir = MODULE_ROOT) {
  const inputBuffer = await readFile(join(rootDir, INPUT_PATH));
  assert(sha256(inputBuffer) === FROZEN_SHA256, 'frozen effective canonicals SHA mismatch');
  const entities = inputBuffer.toString('utf8').trim().split('\n').map(JSON.parse);
  assert(entities.length === 359, `expected 359 effective canonicals, got ${entities.length}`);
  const keys = entities.map((row) => row.effective_canonical_key);
  assert(new Set(keys).size === 359, 'effective canonical keys are not unique');
  const overrides = JSON.parse(await readFile(join(rootDir, OVERRIDES_PATH), 'utf8'));
  assert(overrides.schema_version === 1, 'entity semantics override schema mismatch');
  assert(overrides.frozen_effective_canonicals_sha256 === FROZEN_SHA256, 'entity semantics override input SHA mismatch');
  const unknown = Object.keys(overrides.by_effective_canonical_key || {}).filter((key) => !keys.includes(key));
  assert(unknown.length === 0, `unknown entity semantics override keys: ${unknown.join(', ')}`);
  return { entities, overrides };
}

export async function buildEntitySemantics(rootDir = MODULE_ROOT) {
  const { entities, overrides } = await load(rootDir);
  const records = entities
    .map((entity) => buildSemanticRecord(entity, overrides.by_effective_canonical_key?.[entity.effective_canonical_key] || {}))
    .sort((left, right) => asciiCompare(left.effective_canonical_key, right.effective_canonical_key));
  assert(records.length === 359, 'entity semantics closure mismatch');
  const contents = {
    [OUTPUT_PATH]: records.map((row) => JSON.stringify(stableObject(row))).join('\n').concat('\n'),
    [REVIEW_PATH]: buildReview(records, FROZEN_SHA256),
  };
  return { records, contents };
}

async function atomicWrite(path, contents) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, contents);
  await rename(temporary, path);
}

export async function generateEntitySemantics(rootDir = MODULE_ROOT) {
  const { records, contents } = await buildEntitySemantics(rootDir);
  try {
    for (const [relativePath, body] of Object.entries(contents)) {
      await atomicWrite(join(rootDir, relativePath), body);
    }
  } finally {
    await Promise.all(Object.keys(contents).map((relativePath) =>
      rm(`${join(rootDir, relativePath)}.tmp-${process.pid}`, { force: true })));
  }
  return {
    records: records.length,
    counts: countBy(records, (row) => row.semantic_status === 'needs_review' ? 'needs_review' : row.catalog_entity_kind),
  };
}

export async function checkEntitySemantics(rootDir = MODULE_ROOT) {
  const { records, contents } = await buildEntitySemantics(rootDir);
  for (const [relativePath, expected] of Object.entries(contents)) {
    const actual = await readFile(join(rootDir, relativePath), 'utf8');
    assert(actual === expected, `${relativePath} differs from deterministic rebuild`);
  }
  return {
    records: records.length,
    counts: countBy(records, (row) => row.semantic_status === 'needs_review' ? 'needs_review' : row.catalog_entity_kind),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] || 'generate';
  if (command === '--check' || command === 'check') {
    console.log(JSON.stringify(await checkEntitySemantics(), null, 2));
  } else {
    assert(command === 'generate', `unknown command: ${command}`);
    console.log(JSON.stringify(await generateEntitySemantics(), null, 2));
  }
}
