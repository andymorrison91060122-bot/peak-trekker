import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildStratifiedAuditArtifacts,
  validateStratifiedAuditArtifacts,
} from './build-stratified-audit-sample.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LEDGER_ROOT = join(ROOT, '..', 'ledger');
const INPUT_PATHS = {
  canonicals: join(LEDGER_ROOT, 'effective_canonicals.jsonl'),
  enrichment: join(LEDGER_ROOT, 'effective-canonical-enrichment.jsonl'),
  policy: join(ROOT, 'validation-policy.json'),
};

async function readInputs() {
  const [canonicalsBytes, enrichmentBytes, policyBytes] = await Promise.all([
    readFile(INPUT_PATHS.canonicals),
    readFile(INPUT_PATHS.enrichment),
    readFile(INPUT_PATHS.policy),
  ]);
  return { canonicalsBytes, enrichmentBytes, policyBytes };
}

function parseJsonl(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('offline stratified audit sample freezes 30 unique rows with bound inputs', async () => {
  const inputs = await readInputs();
  const artifacts = buildStratifiedAuditArtifacts(inputs);

  assert.equal(artifacts.sampleRows.length, 30);
  assert.equal(
    new Set(artifacts.sampleRows.map((row) => row.effective_canonical_key)).size,
    30,
  );
  assert.deepEqual(
    artifacts.manifest.strata.difficulty.selected_counts,
    artifacts.manifest.strata.difficulty.integer_targets,
  );
  assert.deepEqual(
    artifacts.manifest.strata.altitude_band.selected_counts,
    artifacts.manifest.strata.altitude_band.integer_targets,
  );
  assert.equal(
    artifacts.manifest.strata.province.maximum_absolute_marginal_error <= 1,
    true,
  );

  const lowAltitude = artifacts.manifest.low_altitude_small_mountains;
  assert.equal(lowAltitude.definition, 'altitude_m != null && altitude_m < 1000');
  assert.equal(lowAltitude.population_count, 70);
  assert.equal(lowAltitude.sample_count >= 6, true);
  assert.equal(lowAltitude.sample_share >= lowAltitude.population_share, true);

  assert.equal(artifacts.manifest.population.count, 359);
  for (const input of artifacts.manifest.population.inputs) {
    assert.match(input.sha256, /^[a-f0-9]{64}$/);
  }
  assert.match(artifacts.manifest.population.binding_sha256, /^[a-f0-9]{64}$/);
  assert.equal(artifacts.manifest.sample.sha256, artifacts.sampleSha256);
  assert.equal(
    Object.hasOwn(
      artifacts.manifest.freeze_contract,
      'generated_before_external_coordinate_requests',
    ),
    false,
  );
  assert.equal(
    artifacts.manifest.freeze_contract.request_manifest_binding,
    'sample bytes + sample manifest bytes + population inputs; any change invalidates prior request manifests',
  );
  assert.equal(validateStratifiedAuditArtifacts(artifacts, inputs), true);
});

test('two independent offline builds are byte-identical', async () => {
  const inputs = await readInputs();
  const first = buildStratifiedAuditArtifacts(inputs);
  const second = buildStratifiedAuditArtifacts({
    canonicalsBytes: Buffer.from(inputs.canonicalsBytes),
    enrichmentBytes: Buffer.from(inputs.enrichmentBytes),
    policyBytes: Buffer.from(inputs.policyBytes),
  });

  assert.deepEqual(first.sampleBytes, second.sampleBytes);
  assert.deepEqual(first.sampleShaBytes, second.sampleShaBytes);
  assert.deepEqual(first.manifestBytes, second.manifestBytes);
});

test('the sample builder has no network request capability', async () => {
  const source = await readFile(join(ROOT, 'build-stratified-audit-sample.mjs'), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /node:https?|from ['"]https?['"]/u);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b|\bWebSocket\b/u);
});

test('frozen sample files are byte-identical to a fresh offline build', async () => {
  const inputs = await readInputs();
  const artifacts = buildStratifiedAuditArtifacts(inputs);
  const [sampleBytes, sampleShaBytes, manifestBytes] = await Promise.all([
    readFile(join(ROOT, 'stratified-manual-audit-sample.jsonl')),
    readFile(join(ROOT, 'stratified-manual-audit-sample.sha256')),
    readFile(join(ROOT, 'stratified-manual-audit-sample.manifest.json')),
  ]);

  assert.deepEqual(sampleBytes, artifacts.sampleBytes);
  assert.deepEqual(sampleShaBytes, artifacts.sampleShaBytes);
  assert.deepEqual(manifestBytes, artifacts.manifestBytes);
});

test('the frozen sample retains all predeclared semantic and DSM stress cases', async () => {
  const rows = parseJsonl(
    await readFile(join(ROOT, 'stratified-manual-audit-sample.jsonl'), 'utf8'),
  );
  const keys = new Set(rows.map((row) => row.effective_canonical_key));
  for (const requiredKey of [
    'jiaer-mengcuo',
    'huoyan-shan',
    'bijia-shan-liaoning',
    'zhumulangma-beipo',
    'xiqiao-shan',
    'ling-shan-jiangsu',
  ]) {
    assert.equal(keys.has(requiredKey), true, `frozen sample lost ${requiredKey}`);
  }
  const manifest = JSON.parse(
    await readFile(
      join(ROOT, 'stratified-manual-audit-sample.manifest.json'),
      'utf8',
    ),
  );
  assert.equal(
    manifest.freeze_contract.resampling_after_provider_results,
    'forbidden_without_review_and_new_freeze',
  );
});
