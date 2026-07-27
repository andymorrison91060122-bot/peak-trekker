import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalArtifactBytes,
  computeStratifiedSampleBinding,
  normalizedRequestHash,
  validateSourceRequestManifest,
} from './phase0-contract.mjs';
import {
  COP_DEM_ADAPTER_VERSION,
  WORLD_COVER_ADAPTER_VERSION,
  copDemTileDescriptor,
  deriveCopDemWindow,
  deriveWorldCoverSurfaceContext,
  evaluateDemLocalMaximum,
  summarizeDemPilotBySurfaceRegime,
  worldCoverTileDescriptor,
} from './cop-dem-glo30-adapter.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LEDGER_ROOT = join(ROOT, '..', 'ledger');
const CACHE_ROOT = join(ROOT, 'source-cache');
const CAS_ROOT = join(CACHE_ROOT, 'sha256');
const MANIFEST_PATH = join(ROOT, 'dem-pilot-source-request-manifest.json');
const RESULTS_PATH = join(ROOT, 'dem-adapter-pilot-results.jsonl');
const SUMMARY_PATH = join(ROOT, 'dem-adapter-pilot-summary.json');
const USER_AGENT = 'PeakTrekker-T13-coordinate-audit/1.0 (data engineering; contact via repository)';
const TIMEOUT_MS = 120000;
const RETRY_LIMIT = 2;
const RADIUS_M = 300;
const WORLD_PEAK_DISCLAIMER =
  '样本为 7 座世界级高峰，不代表目录整体，尤其不代表低海拔小山。';
const STRESS_KEYS = new Set([
  'jiaer-mengcuo',
  'huoyan-shan',
  'bijia-shan-liaoning',
  'zhumulangma-beipo',
  'xiqiao-shan',
  'ling-shan-jiangsu',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, stableObject(child)]),
  );
}

function canonicalJson(value) {
  return `${JSON.stringify(stableObject(value))}\n`;
}

function parseJsonl(bytes) {
  return Buffer.from(bytes).toString('utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function bindingArtifacts() {
  const [
    sampleBytes,
    sampleManifestBytes,
    canonicalsBytes,
    enrichmentBytes,
    policyBytes,
  ] = await Promise.all([
    readFile(join(ROOT, 'stratified-manual-audit-sample.jsonl')),
    readFile(join(ROOT, 'stratified-manual-audit-sample.manifest.json')),
    readFile(join(LEDGER_ROOT, 'effective_canonicals.jsonl')),
    readFile(join(LEDGER_ROOT, 'effective-canonical-enrichment.jsonl')),
    readFile(join(ROOT, 'validation-policy.json')),
  ]);
  return {
    sampleBytes,
    sampleManifestBytes,
    canonicalsBytes,
    enrichmentBytes,
    policyBytes,
  };
}

async function pilotCases(artifacts) {
  const goldRows = parseJsonl(await readFile(join(ROOT, 'gold-set.jsonl')));
  const sampleRows = parseJsonl(artifacts.sampleBytes);
  const canonicalRows = parseJsonl(artifacts.canonicalsBytes);
  const canonicalByKey = new Map(
    canonicalRows.map((row) => [row.effective_canonical_key, row]),
  );
  const highCases = goldRows
    .filter((row) => row.accuracy_memberships?.summit_accuracy)
    .map((row) => {
      const ledger = canonicalByKey.get(row.effective_canonical_key);
      assert(ledger, `missing ledger row for ${row.effective_canonical_key}`);
      return {
        group: 'world_peak_connectivity_smoke',
        effective_canonical_key: row.effective_canonical_key,
        primary_name: row.product_entity.name,
        candidate: {
          latitude: row.truth_coordinate.latitude,
          longitude: row.truth_coordinate.longitude,
        },
        ledger_altitude_m: ledger.altitude.value_m,
        known_summit_truth: true,
        coordinate_basis: row.gold_case_id,
      };
    });
  const stressCases = sampleRows
    .filter((row) => STRESS_KEYS.has(row.effective_canonical_key))
    .map((row) => {
      const ledger = canonicalByKey.get(row.effective_canonical_key);
      assert(ledger?.gps?.present, `stress case ${row.effective_canonical_key} lacks seed coordinates`);
      return {
        group: 'frozen_semantic_dsm_stress',
        effective_canonical_key: row.effective_canonical_key,
        primary_name: row.primary_name,
        candidate: {
          latitude: ledger.gps.latitude,
          longitude: ledger.gps.longitude,
        },
        ledger_altitude_m: ledger.altitude.value_m,
        known_summit_truth: false,
        coordinate_basis: 'frozen_ledger_seed_not_summit_truth',
      };
    });
  assert(highCases.length === 7, 'DEM pilot requires all seven frozen world-peak smoke cases');
  assert(stressCases.length === 6, 'DEM pilot requires all six frozen stress cases');
  return [...highCases, ...stressCases];
}

function emptyManifest(binding) {
  return {
    schema_version: 't13-source-request-manifest-v1',
    ...binding,
    network_collection_contract: {
      overpass_endpoint: 'https://overpass-api.de/api/interpreter',
      user_agent: USER_AGENT,
      timeout_ms: TIMEOUT_MS,
      retry_limit: RETRY_LIMIT,
      backoff: 'deterministic exponential: 1000ms, 2000ms',
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
      datum_policy: 'WGS-84 only; unknown/GCJ-02/BD-09 rejected',
    },
    requests: [],
  };
}

async function ensureCas(bytes) {
  const hash = sha256(bytes);
  const path = join(CAS_ROOT, hash);
  await mkdir(CAS_ROOT, { recursive: true });
  try {
    await access(path);
  } catch {
    await writeFile(path, bytes);
  }
  return {
    hash,
    path,
    relativePath: `source-cache/sha256/${hash}`,
  };
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: controller.signal,
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      clearTimeout(timeout);
      return { response, bytes, attempt };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < RETRY_LIMIT) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
      }
    }
  }
  throw lastError;
}

function requestParams(pilotCase, descriptor, adapterVersion) {
  return {
    endpoint: descriptor.url,
    method: 'GET',
    tile_id: descriptor.tile_id,
    candidate_latitude: pilotCase.candidate.latitude,
    candidate_longitude: pilotCase.candidate.longitude,
    radius_m: RADIUS_M,
    ...(adapterVersion === WORLD_COVER_ADAPTER_VERSION
      ? { ledger_altitude_m: pilotCase.ledger_altitude_m }
      : {}),
  };
}

function licenseFor(adapterVersion) {
  if (adapterVersion === COP_DEM_ADAPTER_VERSION) {
    return {
      license_id: 'COP-DEM-GLO-30-FULL-FREE-OPEN',
      license_url: 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
      attribution_required: true,
    };
  }
  return {
    license_id: 'CC-BY-4.0',
    license_url: 'https://esa-worldcover.org/en/data-access',
    attribution_required: true,
  };
}

function failureOutcome(status) {
  if (status === 403 || status === 401) return 'blocked';
  if (status === 429) return 'rate_limited';
  return 'invalid_response';
}

async function collectRaster({
  pilotCase,
  descriptor,
  adapterVersion,
  sourceFamily,
  derive,
  manifest,
  artifactsByRequest,
  urlCache,
}) {
  const requestId = [
    'dem-pilot',
    pilotCase.effective_canonical_key,
    sourceFamily,
  ].join(':');
  const normalizedRequestParams = requestParams(
    pilotCase,
    descriptor,
    adapterVersion,
  );
  const fetchedAt = new Date().toISOString();
  let fetchResult;
  let cacheHit = false;
  if (urlCache.has(descriptor.url)) {
    fetchResult = urlCache.get(descriptor.url);
    cacheHit = true;
  } else {
    try {
      fetchResult = await fetchWithRetry(descriptor.url);
      urlCache.set(descriptor.url, fetchResult);
    } catch (error) {
      const entry = {
        request_id: requestId,
        effective_canonical_key: pilotCase.effective_canonical_key,
        source_family: sourceFamily,
        adapter_version: adapterVersion,
        normalized_request_params: normalizedRequestParams,
        request_hash: normalizedRequestHash(normalizedRequestParams),
        response_hash: null,
        response_cas_path: null,
        parsed_output_hash: null,
        parsed_output_cas_path: null,
        http_status: null,
        fetched_at: fetchedAt,
        cache_hit: false,
        source_license: licenseFor(adapterVersion),
        outcome: 'transport_error',
        outcome_reason: error instanceof Error ? error.name : 'unknown transport error',
        rate_limit_signal: false,
      };
      manifest.requests.push(entry);
      return { entry, parsed: null };
    }
  }

  const responseCas = await ensureCas(fetchResult.bytes);
  if (!fetchResult.response.ok) {
    const outcome = failureOutcome(fetchResult.response.status);
    const entry = {
      request_id: requestId,
      effective_canonical_key: pilotCase.effective_canonical_key,
      source_family: sourceFamily,
      adapter_version: adapterVersion,
      normalized_request_params: normalizedRequestParams,
      request_hash: normalizedRequestHash(normalizedRequestParams),
      response_hash: responseCas.hash,
      response_cas_path: responseCas.relativePath,
      parsed_output_hash: null,
      parsed_output_cas_path: null,
      http_status: fetchResult.response.status,
      fetched_at: fetchedAt,
      cache_hit: cacheHit,
      source_license: licenseFor(adapterVersion),
      outcome,
      outcome_reason: `HTTP ${fetchResult.response.status}`,
      rate_limit_signal: fetchResult.response.status === 429,
    };
    manifest.requests.push(entry);
    artifactsByRequest[requestId] = {
      responseBytes: fetchResult.bytes,
      adapter_version: adapterVersion,
    };
    return { entry, parsed: null };
  }

  let parsed;
  try {
    parsed = await derive(fetchResult.bytes);
  } catch (error) {
    const entry = {
      request_id: requestId,
      effective_canonical_key: pilotCase.effective_canonical_key,
      source_family: sourceFamily,
      adapter_version: adapterVersion,
      normalized_request_params: normalizedRequestParams,
      request_hash: normalizedRequestHash(normalizedRequestParams),
      response_hash: responseCas.hash,
      response_cas_path: responseCas.relativePath,
      parsed_output_hash: null,
      parsed_output_cas_path: null,
      http_status: fetchResult.response.status,
      fetched_at: fetchedAt,
      cache_hit: cacheHit,
      source_license: licenseFor(adapterVersion),
      outcome: 'invalid_response',
      outcome_reason: error instanceof Error ? error.message : 'raster parse failed',
      rate_limit_signal: false,
    };
    manifest.requests.push(entry);
    artifactsByRequest[requestId] = {
      responseBytes: fetchResult.bytes,
      adapter_version: adapterVersion,
    };
    return { entry, parsed: null };
  }

  const parsedBytes = canonicalArtifactBytes(parsed);
  const parsedCas = await ensureCas(parsedBytes);
  const entry = {
    request_id: requestId,
    effective_canonical_key: pilotCase.effective_canonical_key,
    source_family: sourceFamily,
    adapter_version: adapterVersion,
    normalized_request_params: normalizedRequestParams,
    request_hash: normalizedRequestHash(normalizedRequestParams),
    response_hash: responseCas.hash,
    response_cas_path: responseCas.relativePath,
    parsed_output_hash: parsedCas.hash,
    parsed_output_cas_path: parsedCas.relativePath,
    http_status: fetchResult.response.status,
    fetched_at: fetchedAt,
    cache_hit: cacheHit,
    source_license: licenseFor(adapterVersion),
    outcome: 'complete',
    outcome_reason: null,
    rate_limit_signal: false,
  };
  manifest.requests.push(entry);
  artifactsByRequest[requestId] = {
    responseBytes: fetchResult.bytes,
    parsedOutputBytes: parsedBytes,
    adapter_version: adapterVersion,
  };
  return { entry, parsed };
}

async function writeManifest(manifest) {
  await writeFile(MANIFEST_PATH, canonicalJson(manifest));
}

function treatmentForStressCase(pilotCase, surfaceContext, verdict) {
  const fixed = {
    'jiaer-mengcuo': '名称语义指向湖泊（措）；保留冻结样本，峰顶角色必须 needs_review/not_applicable，不可因难查移除。',
    'huoyan-shan': '山体/地貌带而非单峰；保留冻结样本，不能把目录中心自动解释成峰顶。',
    'bijia-shan-liaoning': '潮汐岛上的小丘；保留冻结样本，必须人工裁定峰顶对象。',
    'zhumulangma-beipo': '“北坡”在主峰与大本营之间语义歧义；保留冻结样本，不以珠峰坐标自动替代。',
    'xiqiao-shan': '低海拔南方山体，DSM 树冠/建筑污染风险高；若 WorldCover 非高海拔裸岩则 DEM 不下结论。',
    'ling-shan-jiangsu': '低海拔南方山体，DSM 树冠/建筑污染风险高；若 WorldCover 非高海拔裸岩则 DEM 不下结论。',
  };
  return {
    predetermined_note: fixed[pilotCase.effective_canonical_key],
    observed_surface_regime: surfaceContext?.surface_regime ?? null,
    dem_verdict: verdict,
    sample_membership: 'retained_regardless_of_result',
  };
}

async function collect() {
  const artifacts = await bindingArtifacts();
  const binding = computeStratifiedSampleBinding(artifacts);
  const urlCache = new Map();
  try {
    const previous = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    for (const entry of previous.requests ?? []) {
      if (!entry.response_cas_path) continue;
      const bytes = await readFile(join(ROOT, entry.response_cas_path));
      urlCache.set(entry.normalized_request_params.endpoint, {
        response: {
          ok: entry.http_status >= 200 && entry.http_status <= 299,
          status: entry.http_status,
        },
        bytes,
        attempt: 0,
      });
    }
  } catch {
    // First run has no checkpoint to resume.
  }
  const manifest = emptyManifest(binding);
  await mkdir(CACHE_ROOT, { recursive: true });
  await writeManifest(manifest);

  // This is a binding proof, not a claim about wall-clock ordering. Changing any
  // frozen sample/population bytes invalidates this manifest and all later requests.
  assert(
    await validateSourceRequestManifest(manifest, {
      bindingArtifacts: artifacts,
    }),
    'empty request manifest must bind before collection',
  );

  const cases = await pilotCases(artifacts);
  const requestArtifacts = {};
  const results = [];
  for (const pilotCase of cases) {
    const demDescriptor = copDemTileDescriptor(pilotCase.candidate);
    const dem = await collectRaster({
      pilotCase,
      descriptor: demDescriptor,
      adapterVersion: COP_DEM_ADAPTER_VERSION,
      sourceFamily: 'cop-dem-glo30',
      derive: (bytes) => deriveCopDemWindow(bytes, {
        candidate: pilotCase.candidate,
        radius_m: RADIUS_M,
        source_url: demDescriptor.url,
      }),
      manifest,
      artifactsByRequest: requestArtifacts,
      urlCache,
    });
    await writeManifest(manifest);

    const surfaceDescriptor = worldCoverTileDescriptor(pilotCase.candidate);
    const surface = await collectRaster({
      pilotCase,
      descriptor: surfaceDescriptor,
      adapterVersion: WORLD_COVER_ADAPTER_VERSION,
      sourceFamily: 'esa-worldcover',
      derive: (bytes) => deriveWorldCoverSurfaceContext(bytes, {
        candidate: pilotCase.candidate,
        radius_m: RADIUS_M,
        ledger_altitude_m: pilotCase.ledger_altitude_m,
      }),
      manifest,
      artifactsByRequest: requestArtifacts,
      urlCache,
    });
    await writeManifest(manifest);

    const gate = dem.parsed && surface.parsed
      ? evaluateDemLocalMaximum(dem.parsed, surface.parsed)
      : {
        status: 'inconclusive',
        details: { reason: 'source_collection_or_parse_incomplete' },
      };
    results.push({
      schema_version: 't13-dem-adapter-pilot-v1',
      ...pilotCase,
      dem_request_id: dem.entry.request_id,
      surface_request_id: surface.entry.request_id,
      surface_regime: surface.parsed?.surface_regime ?? 'unknown_or_mixed',
      verdict: gate.status,
      gate,
      stress_case_treatment: STRESS_KEYS.has(pilotCase.effective_canonical_key)
        ? treatmentForStressCase(pilotCase, surface.parsed, gate.status)
        : null,
      reporting_disclaimer: pilotCase.group === 'world_peak_connectivity_smoke'
        ? WORLD_PEAK_DISCLAIMER
        : null,
    });
  }

  await validateSourceRequestManifest(manifest, {
    bindingArtifacts: artifacts,
    requestArtifacts,
  });
  const summary = {
    schema_version: 't13-dem-adapter-pilot-summary-v1',
    sample_binding: binding,
    request_manifest_sha256: sha256(await readFile(MANIFEST_PATH)),
    case_count: results.length,
    world_peak_smoke_count: results.filter(
      (row) => row.group === 'world_peak_connectivity_smoke',
    ).length,
    stress_case_count: results.filter(
      (row) => row.group === 'frozen_semantic_dsm_stress',
    ).length,
    split_surface_summary: summarizeDemPilotBySurfaceRegime(results),
    world_peak_disclaimer: WORLD_PEAK_DISCLAIMER,
    low_forest_false_rejection_note:
      'No low-forest case has independent summit truth in this pilot, so its false-rejection rate denominator is zero; report inconclusive count, never infer an accuracy rate.',
    dsm_policy:
      '45m/8m is evaluated only for mechanically classified high-elevation bare/snow. Low-elevation tree/vegetated/built surfaces and unknown/mixed are inconclusive and fail closed to manual review.',
  };
  await writeFile(
    RESULTS_PATH,
    results.map((row) => JSON.stringify(stableObject(row))).join('\n') + '\n',
  );
  await writeFile(SUMMARY_PATH, canonicalJson(summary));
  return { manifest, results, summary };
}

async function check() {
  const artifacts = await bindingArtifacts();
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const requestArtifacts = {};
  for (const entry of manifest.requests) {
    const responseBytes = entry.response_cas_path
      ? await readFile(join(ROOT, entry.response_cas_path))
      : undefined;
    const parsedOutputBytes = entry.parsed_output_cas_path
      ? await readFile(join(ROOT, entry.parsed_output_cas_path))
      : undefined;
    requestArtifacts[entry.request_id] = {
      responseBytes,
      parsedOutputBytes,
      adapter_version: entry.adapter_version,
    };
  }
  await validateSourceRequestManifest(manifest, {
    bindingArtifacts: artifacts,
    requestArtifacts,
  });
  const results = parseJsonl(await readFile(RESULTS_PATH));
  const stress = results.filter((row) => row.group === 'frozen_semantic_dsm_stress');
  assert(stress.length === 6, 'check requires all six frozen stress cases');
  assert(
    stress.every(
      (row) => row.stress_case_treatment?.sample_membership
        === 'retained_regardless_of_result',
    ),
    'stress cases cannot be trimmed after collection',
  );
  return { manifest, results };
}

const result = process.argv.includes('--check') ? await check() : await collect();
console.log(
  `T13 DEM pilot ${process.argv.includes('--check') ? 'checked' : 'collected'}: `
  + `${result.results.length} cases, ${result.manifest.requests.length} requests`,
);
