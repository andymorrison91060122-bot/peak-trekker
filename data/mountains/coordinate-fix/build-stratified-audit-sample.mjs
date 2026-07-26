import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LEDGER_ROOT = join(ROOT, '..', 'ledger');
const DEFAULT_OUTPUT_DIR = ROOT;
const SAMPLE_FILE = 'stratified-manual-audit-sample.jsonl';
const SAMPLE_SHA_FILE = 'stratified-manual-audit-sample.sha256';
const MANIFEST_FILE = 'stratified-manual-audit-sample.manifest.json';
const SCHEMA_VERSION = 't13-stratified-manual-audit-sample-v1';
const ALGORITHM_VERSION = 'proportional-marginal-deficit-v1';
const INPUT_FILES = Object.freeze([
  {
    key: 'effective_canonicals',
    path: 'data/mountains/ledger/effective_canonicals.jsonl',
  },
  {
    key: 'effective_canonical_enrichment',
    path: 'data/mountains/ledger/effective-canonical-enrichment.jsonl',
  },
  {
    key: 'validation_policy',
    path: 'data/mountains/coordinate-fix/validation-policy.json',
  },
]);

function asciiCompare(left, right) {
  if (String(left) < String(right)) return -1;
  if (String(left) > String(right)) return 1;
  return 0;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(asciiCompare)
      .map((key) => [key, stableObject(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(stableObject(value));
}

function parseJsonl(bytes, label) {
  const text = Buffer.from(bytes).toString('utf8').trim();
  assert(text.length > 0, `${label} is empty`);
  return text.split('\n').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${label} line ${index + 1} is invalid JSON: ${error.message}`);
    }
  });
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function sortedRecord(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => asciiCompare(left, right)));
}

function roundRatio(value) {
  return Number(value.toFixed(9));
}

function altitudeBand(altitudeMeters) {
  if (altitudeMeters == null) return 'null';
  assert(Number.isFinite(altitudeMeters), 'effective altitude must be finite or null');
  if (altitudeMeters < 500) return '<500';
  if (altitudeMeters < 1000) return '500-999.9';
  if (altitudeMeters < 3000) return '1000-2999.9';
  if (altitudeMeters < 5000) return '3000-4999.9';
  return '>=5000';
}

function proportionalIntegerTargets(counts, sampleSize, populationSize) {
  const rows = [...counts.entries()]
    .map(([category, count]) => {
      const rawTarget = sampleSize * count / populationSize;
      return {
        category,
        count,
        rawTarget,
        floorTarget: Math.floor(rawTarget),
        remainder: rawTarget - Math.floor(rawTarget),
      };
    });
  let remaining = sampleSize - rows.reduce((sum, row) => sum + row.floorTarget, 0);
  const allocationOrder = [...rows].sort(
    (left, right) => right.remainder - left.remainder
      || asciiCompare(left.category, right.category),
  );
  for (const row of allocationOrder) {
    row.target = row.floorTarget + (remaining > 0 ? 1 : 0);
    if (remaining > 0) remaining -= 1;
  }
  assert(remaining === 0, 'integer target allocation did not consume the sample size');
  return new Map(rows.map((row) => [
    row.category,
    allocationOrder.find((candidate) => candidate.category === row.category).target,
  ]));
}

function tieBreakSha(seed, canonicalKey) {
  return sha256(`${seed}:${canonicalKey}`);
}

function remainingSelectionIsFeasible(rows, difficultyNeeds, altitudeNeeds) {
  const totalDifficulty = [...difficultyNeeds.values()].reduce((sum, value) => sum + value, 0);
  const totalAltitude = [...altitudeNeeds.values()].reduce((sum, value) => sum + value, 0);
  if (totalDifficulty !== totalAltitude) return false;
  if (totalDifficulty === 0) return true;

  const difficulties = [...difficultyNeeds.keys()].sort(asciiCompare);
  const altitudeBands = [...altitudeNeeds.keys()].sort(asciiCompare);
  const source = 'source';
  const sink = 'sink';
  const capacity = new Map();
  const adjacency = new Map();

  function addNode(node) {
    if (!adjacency.has(node)) adjacency.set(node, []);
  }

  function addEdge(from, to, edgeCapacity) {
    addNode(from);
    addNode(to);
    adjacency.get(from).push(to);
    adjacency.get(to).push(from);
    capacity.set(`${from}\u0000${to}`, edgeCapacity);
    capacity.set(`${to}\u0000${from}`, 0);
  }

  for (const difficulty of difficulties) {
    addEdge(source, `difficulty:${difficulty}`, difficultyNeeds.get(difficulty));
  }
  const pairCounts = countBy(rows.map((row) => `${row.difficulty}\u0000${row.altitude_band}`));
  for (const [pair, count] of pairCounts) {
    const [difficulty, band] = pair.split('\u0000');
    addEdge(`difficulty:${difficulty}`, `altitude:${band}`, count);
  }
  for (const band of altitudeBands) {
    addEdge(`altitude:${band}`, sink, altitudeNeeds.get(band));
  }

  let flow = 0;
  while (true) {
    const parent = new Map([[source, null]]);
    const queue = [source];
    for (let index = 0; index < queue.length && !parent.has(sink); index += 1) {
      const from = queue[index];
      for (const to of adjacency.get(from) || []) {
        if (parent.has(to) || (capacity.get(`${from}\u0000${to}`) || 0) <= 0) continue;
        parent.set(to, from);
        queue.push(to);
      }
    }
    if (!parent.has(sink)) break;
    let increment = Number.POSITIVE_INFINITY;
    for (let node = sink; node !== source; node = parent.get(node)) {
      const from = parent.get(node);
      increment = Math.min(increment, capacity.get(`${from}\u0000${node}`));
    }
    for (let node = sink; node !== source; node = parent.get(node)) {
      const from = parent.get(node);
      capacity.set(`${from}\u0000${node}`, capacity.get(`${from}\u0000${node}`) - increment);
      capacity.set(`${node}\u0000${from}`, (capacity.get(`${node}\u0000${from}`) || 0) + increment);
    }
    flow += increment;
  }
  return flow === totalDifficulty;
}

function marginalGain(target, selectedCount) {
  return Math.min(1, Math.max(0, target - selectedCount));
}

function selectRows(population, sampleSize) {
  const difficultyPopulation = countBy(population.map((row) => row.difficulty));
  const altitudePopulation = countBy(population.map((row) => row.altitude_band));
  const provincePopulation = countBy(population.flatMap((row) => row.provinces));
  const difficultyTargets = proportionalIntegerTargets(
    difficultyPopulation,
    sampleSize,
    population.length,
  );
  const altitudeTargets = proportionalIntegerTargets(
    altitudePopulation,
    sampleSize,
    population.length,
  );
  const provinceTargets = new Map(
    [...provincePopulation].map(([province, count]) => [
      province,
      sampleSize * count / population.length,
    ]),
  );
  const selectedCounts = {
    difficulty: new Map([...difficultyPopulation.keys()].map((key) => [key, 0])),
    altitude_band: new Map([...altitudePopulation.keys()].map((key) => [key, 0])),
    province: new Map([...provincePopulation.keys()].map((key) => [key, 0])),
  };
  const difficultyNeeds = new Map(difficultyTargets);
  const altitudeNeeds = new Map(altitudeTargets);
  const remaining = [...population];
  const selected = [];

  while (selected.length < sampleSize) {
    const ranked = remaining
      .filter((row) => (
        difficultyNeeds.get(row.difficulty) > 0
        && altitudeNeeds.get(row.altitude_band) > 0
      ))
      .map((row) => {
        const provinceGain = row.provinces.reduce(
          (sum, province) => sum + marginalGain(
            provinceTargets.get(province),
            selectedCounts.province.get(province),
          ),
          0,
        );
        return {
          row,
          score: marginalGain(
            difficultyTargets.get(row.difficulty),
            selectedCounts.difficulty.get(row.difficulty),
          ) + marginalGain(
            altitudeTargets.get(row.altitude_band),
            selectedCounts.altitude_band.get(row.altitude_band),
          ) + provinceGain,
        };
      })
      .sort((left, right) => right.score - left.score
        || asciiCompare(left.row.tie_break_sha256, right.row.tie_break_sha256));

    let chosen = null;
    for (const candidate of ranked) {
      const nextDifficultyNeeds = new Map(difficultyNeeds);
      const nextAltitudeNeeds = new Map(altitudeNeeds);
      nextDifficultyNeeds.set(
        candidate.row.difficulty,
        nextDifficultyNeeds.get(candidate.row.difficulty) - 1,
      );
      nextAltitudeNeeds.set(
        candidate.row.altitude_band,
        nextAltitudeNeeds.get(candidate.row.altitude_band) - 1,
      );
      const futureRows = remaining.filter(
        (row) => row.effective_canonical_key !== candidate.row.effective_canonical_key,
      );
      if (remainingSelectionIsFeasible(futureRows, nextDifficultyNeeds, nextAltitudeNeeds)) {
        chosen = candidate;
        difficultyNeeds.clear();
        altitudeNeeds.clear();
        for (const [key, value] of nextDifficultyNeeds) difficultyNeeds.set(key, value);
        for (const [key, value] of nextAltitudeNeeds) altitudeNeeds.set(key, value);
        break;
      }
    }
    assert(chosen, `unable to satisfy frozen marginal targets at selection ${selected.length + 1}`);

    const row = {
      ...chosen.row,
      selection_score: Number(chosen.score.toFixed(9)),
    };
    selected.push(row);
    selectedCounts.difficulty.set(
      row.difficulty,
      selectedCounts.difficulty.get(row.difficulty) + 1,
    );
    selectedCounts.altitude_band.set(
      row.altitude_band,
      selectedCounts.altitude_band.get(row.altitude_band) + 1,
    );
    for (const province of row.provinces) {
      selectedCounts.province.set(province, selectedCounts.province.get(province) + 1);
    }
    remaining.splice(
      remaining.findIndex(
        (candidate) => candidate.effective_canonical_key === row.effective_canonical_key,
      ),
      1,
    );
  }

  return {
    selected,
    populationCounts: {
      difficulty: difficultyPopulation,
      altitude_band: altitudePopulation,
      province: provincePopulation,
    },
    integerTargets: {
      difficulty: difficultyTargets,
      altitude_band: altitudeTargets,
    },
    proportionalTargets: {
      province: provinceTargets,
    },
    selectedCounts,
  };
}

function inputManifest(canonicalsBytes, enrichmentBytes, policyBytes) {
  const bytesByKey = new Map([
    ['effective_canonicals', canonicalsBytes],
    ['effective_canonical_enrichment', enrichmentBytes],
    ['validation_policy', policyBytes],
  ]);
  const inputs = INPUT_FILES.map((input) => ({
    ...input,
    sha256: sha256(bytesByKey.get(input.key)),
  }));
  return {
    inputs,
    bindingSha256: sha256(`${inputs.map(
      (input) => `${input.path}\u0000${input.sha256}`,
    ).join('\n')}\n`),
  };
}

function buildPopulation(canonicalsBytes, enrichmentBytes, seed) {
  const canonicals = parseJsonl(canonicalsBytes, 'effective canonicals');
  const enrichment = parseJsonl(enrichmentBytes, 'effective canonical enrichment');
  assert(canonicals.length === 359, `expected 359 canonicals, found ${canonicals.length}`);
  assert(enrichment.length === 359, `expected 359 enrichment rows, found ${enrichment.length}`);
  assert(
    new Set(canonicals.map((row) => row.effective_canonical_key)).size === canonicals.length,
    'effective canonical keys must be unique',
  );
  const enrichmentByKey = new Map(
    enrichment.map((row) => [row.effective_canonical_key, row]),
  );
  assert(enrichmentByKey.size === enrichment.length, 'enrichment keys must be unique');

  const population = canonicals.map((canonical) => {
    const enriched = enrichmentByKey.get(canonical.effective_canonical_key);
    assert(enriched, `missing enrichment for ${canonical.effective_canonical_key}`);
    const altitudeMeters = enriched.altitude?.effective_m ?? null;
    const difficulty = enriched.difficulty?.product_enum;
    assert(
      ['beginner', 'intermediate', 'advanced', 'expert'].includes(difficulty),
      `invalid difficulty for ${canonical.effective_canonical_key}`,
    );
    const provinces = [...new Set(canonical.provinces || [])].sort(asciiCompare);
    assert(provinces.length > 0, `missing province for ${canonical.effective_canonical_key}`);
    return {
      effective_canonical_key: canonical.effective_canonical_key,
      primary_name: canonical.primary_name,
      provinces,
      difficulty,
      altitude_m: altitudeMeters,
      altitude_band: altitudeBand(altitudeMeters),
      low_altitude_small_mountain: altitudeMeters != null && altitudeMeters < 1000,
      tie_break_sha256: tieBreakSha(seed, canonical.effective_canonical_key),
    };
  });
  assert(
    population.every((row) => enrichmentByKey.has(row.effective_canonical_key)),
    'population/enrichment key binding failed',
  );
  return population;
}

function stratumManifest(populationCounts, targets, selectedCounts, populationSize) {
  const categories = [...populationCounts.keys()].sort(asciiCompare);
  const proportionalTargets = new Map(categories.map((category) => [
    category,
    30 * populationCounts.get(category) / populationSize,
  ]));
  const errors = categories.map((category) => Math.abs(
    selectedCounts.get(category) - proportionalTargets.get(category),
  ));
  const result = {
    population_counts: sortedRecord(populationCounts),
    proportional_targets: sortedRecord(categories.map((category) => [
      category,
      roundRatio(proportionalTargets.get(category)),
    ])),
    selected_counts: sortedRecord(selectedCounts),
    maximum_absolute_marginal_error: roundRatio(Math.max(...errors)),
  };
  if (targets) result.integer_targets = sortedRecord(targets);
  return result;
}

export function buildStratifiedAuditArtifacts({
  canonicalsBytes,
  enrichmentBytes,
  policyBytes,
}) {
  const policy = JSON.parse(Buffer.from(policyBytes).toString('utf8'));
  const auditPolicy = policy.accuracy_strategy?.stratified_manual_audit;
  assert(auditPolicy?.sample_size === 30, 'validation policy sample size must remain 30');
  assert(typeof auditPolicy.seed === 'string' && auditPolicy.seed.length > 0, 'sample seed is missing');
  assert.deepEqual(
    auditPolicy.strata,
    ['difficulty', 'altitude_band', 'province'],
    'validation policy strata changed',
  );
  const input = inputManifest(canonicalsBytes, enrichmentBytes, policyBytes);
  const population = buildPopulation(canonicalsBytes, enrichmentBytes, auditPolicy.seed);
  const selection = selectRows(population, auditPolicy.sample_size);
  const sampleRows = selection.selected.map((row, index) => ({
    schema_version: SCHEMA_VERSION,
    selection_rank: index + 1,
    population_binding_sha256: input.bindingSha256,
    seed: auditPolicy.seed,
    effective_canonical_key: row.effective_canonical_key,
    primary_name: row.primary_name,
    provinces: row.provinces,
    difficulty: row.difficulty,
    altitude_m: row.altitude_m,
    altitude_band: row.altitude_band,
    low_altitude_small_mountain: row.low_altitude_small_mountain,
    tie_break_sha256: row.tie_break_sha256,
    selection_score: row.selection_score,
  }));
  const sampleBytes = Buffer.from(`${sampleRows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const sampleSha256 = sha256(sampleBytes);
  const sampleShaBytes = Buffer.from(`${sampleSha256}  ${SAMPLE_FILE}\n`);
  const lowPopulationCount = population.filter((row) => row.low_altitude_small_mountain).length;
  const lowSampleCount = sampleRows.filter((row) => row.low_altitude_small_mountain).length;
  const manifest = {
    schema_version: SCHEMA_VERSION,
    algorithm_version: ALGORITHM_VERSION,
    seed: auditPolicy.seed,
    sample: {
      file: SAMPLE_FILE,
      sha256: sampleSha256,
      size: sampleRows.length,
    },
    population: {
      count: population.length,
      inputs: input.inputs,
      binding_sha256: input.bindingSha256,
    },
    low_altitude_small_mountains: {
      definition: 'altitude_m != null && altitude_m < 1000',
      population_count: lowPopulationCount,
      population_share: roundRatio(lowPopulationCount / population.length),
      sample_count: lowSampleCount,
      sample_share: roundRatio(lowSampleCount / sampleRows.length),
      requirement: 'sample_share >= population_share',
      passed: lowSampleCount / sampleRows.length >= lowPopulationCount / population.length,
    },
    strata: {
      difficulty: stratumManifest(
        selection.populationCounts.difficulty,
        selection.integerTargets.difficulty,
        selection.selectedCounts.difficulty,
        population.length,
      ),
      altitude_band: stratumManifest(
        selection.populationCounts.altitude_band,
        selection.integerTargets.altitude_band,
        selection.selectedCounts.altitude_band,
        population.length,
      ),
      province: stratumManifest(
        selection.populationCounts.province,
        null,
        selection.selectedCounts.province,
        population.length,
      ),
    },
    freeze_contract: {
      resampling_after_provider_results: 'forbidden_without_review_and_new_freeze',
      independent_build_requirement: 'two fresh offline builds must be byte-identical',
      request_manifest_binding: 'sample bytes + sample manifest bytes + population inputs; any change invalidates prior request manifests',
    },
  };
  const manifestBytes = Buffer.from(`${canonicalJson(manifest)}\n`);
  const artifacts = {
    sampleRows,
    sampleBytes,
    sampleSha256,
    sampleShaBytes,
    manifest,
    manifestBytes,
  };
  validateStratifiedAuditArtifacts(artifacts, {
    canonicalsBytes,
    enrichmentBytes,
    policyBytes,
  });
  return artifacts;
}

export function validateStratifiedAuditArtifacts(artifacts, {
  canonicalsBytes,
  enrichmentBytes,
  policyBytes,
}) {
  const policy = JSON.parse(Buffer.from(policyBytes).toString('utf8'));
  const auditPolicy = policy.accuracy_strategy.stratified_manual_audit;
  const input = inputManifest(canonicalsBytes, enrichmentBytes, policyBytes);
  const population = buildPopulation(canonicalsBytes, enrichmentBytes, auditPolicy.seed);
  const selectedKeys = artifacts.sampleRows.map((row) => row.effective_canonical_key);
  assert(artifacts.sampleRows.length === auditPolicy.sample_size, 'sample size drift');
  assert(new Set(selectedKeys).size === selectedKeys.length, 'sample contains duplicate keys');
  assert(artifacts.manifest.population.binding_sha256 === input.bindingSha256, 'input binding drift');
  assert.deepEqual(artifacts.manifest.population.inputs, input.inputs, 'input SHA drift');
  assert(sha256(artifacts.sampleBytes) === artifacts.sampleSha256, 'sample SHA drift');
  assert(
    artifacts.sampleShaBytes.equals(Buffer.from(`${artifacts.sampleSha256}  ${SAMPLE_FILE}\n`)),
    'sample SHA file drift',
  );
  assert(
    artifacts.sampleBytes.equals(
      Buffer.from(`${artifacts.sampleRows.map((row) => JSON.stringify(row)).join('\n')}\n`),
    ),
    'sample JSONL bytes drift',
  );
  assert(
    artifacts.manifestBytes.equals(Buffer.from(`${canonicalJson(artifacts.manifest)}\n`)),
    'manifest bytes are not canonical',
  );
  assert(
    artifacts.sampleRows.every(
      (row) => row.population_binding_sha256 === input.bindingSha256
        && row.seed === auditPolicy.seed,
    ),
    'sample row input binding drift',
  );
  assert(artifacts.manifest.population.count === population.length, 'population count drift');
  assert(artifacts.manifest.low_altitude_small_mountains.passed, 'low-altitude share gate failed');
  assert(
    canonicalJson(artifacts.manifest.strata.difficulty.selected_counts)
      === canonicalJson(artifacts.manifest.strata.difficulty.integer_targets),
    'difficulty marginal target drift',
  );
  assert(
    canonicalJson(artifacts.manifest.strata.altitude_band.selected_counts)
      === canonicalJson(artifacts.manifest.strata.altitude_band.integer_targets),
    'altitude marginal target drift',
  );
  return true;
}

async function writeAtomic(path, bytes) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function readDefaultInputs() {
  const [canonicalsBytes, enrichmentBytes, policyBytes] = await Promise.all([
    readFile(join(LEDGER_ROOT, 'effective_canonicals.jsonl')),
    readFile(join(LEDGER_ROOT, 'effective-canonical-enrichment.jsonl')),
    readFile(join(ROOT, 'validation-policy.json')),
  ]);
  return { canonicalsBytes, enrichmentBytes, policyBytes };
}

function parseCliArguments(argv) {
  const check = argv.includes('--check');
  const outputIndex = argv.indexOf('--output-dir');
  assert(outputIndex < 0 || argv[outputIndex + 1], '--output-dir requires a path');
  return {
    check,
    outputDir: outputIndex >= 0 ? resolve(argv[outputIndex + 1]) : DEFAULT_OUTPUT_DIR,
  };
}

async function runCli() {
  const { check, outputDir } = parseCliArguments(process.argv.slice(2));
  const artifacts = buildStratifiedAuditArtifacts(await readDefaultInputs());
  const outputs = [
    [SAMPLE_FILE, artifacts.sampleBytes],
    [SAMPLE_SHA_FILE, artifacts.sampleShaBytes],
    [MANIFEST_FILE, artifacts.manifestBytes],
  ];
  if (check) {
    for (const [name, bytes] of outputs) {
      assert((await readFile(join(outputDir, name))).equals(bytes), `${name} is not byte-identical`);
    }
    process.stdout.write(
      `T13 audit sample check: ${artifacts.sampleRows.length} rows, ${artifacts.sampleSha256}\n`,
    );
    return;
  }
  await mkdir(outputDir, { recursive: true });
  try {
    for (const [name, bytes] of outputs) await writeAtomic(join(outputDir, name), bytes);
  } catch (error) {
    await Promise.all(outputs.map(([name]) => rm(`${join(outputDir, name)}.tmp-${process.pid}`, {
      force: true,
    })));
    throw error;
  }
  process.stdout.write(
    `T13 audit sample frozen: ${artifacts.sampleRows.length} rows, ${artifacts.sampleSha256}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
