import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePseudoPrecision } from './phase0-contract.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const GOLD_PATH = join(ROOT, 'gold-set.jsonl');
const GOLD_SHA_PATH = join(ROOT, 'gold-set.sha256');
const OBSERVATIONS_PATH = join(ROOT, 'legacy-regression-observations.jsonl');
const CHECK_MODE = process.argv.includes('--check');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJsonl(bytes) {
  return bytes.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function legacyPromotionReasons(row, observation, gridAnalysis) {
  const reasons = [];
  if (gridAnalysis.status !== 'no_grid_signal') {
    reasons.push(`whole_arcminute_or_arcsecond_grid_signal:${gridAnalysis.signal_strength}`);
  }
  if (observation.checkins.verified_with_distance === 0) reasons.push('no_checkin_level_distance_evidence');
  if (observation.checkins.verified_with_distance > 0
      && observation.checkins.zero_distance === observation.checkins.verified_with_distance) {
    reasons.push('all_recorded_verification_distances_are_zero_and_non_diagnostic');
  }
  if (observation.checkins.over_300 > 0) reasons.push('verification_distance_outliers_over_300m_present');
  if (observation.sessions.summit_verified_terminal_rate_pct === null) {
    reasons.push('verification_attempt_pass_rate_unavailable');
  } else {
    reasons.push('terminal_outcome_ratio_is_not_a_complete_verification_attempt_pass_rate');
  }
  if (observation.checkins.verified_sources.some((source) => source !== 'realtime_gps')) {
    reasons.push('verified_sources_mix_non_gps_evidence');
  }
  if ([
    'legacy_group_not_single_summit',
    'legacy_unmapped_known_bad_data',
    'legacy_lake_not_canonical_summit',
  ].includes(row.canonical_mapping_status)) {
    reasons.push('legacy_entity_is_not_semantically_compatible_with_a_single_canonical_summit');
  }
  if (row.gold_case_id === 'prod-legacy-wuyishan') {
    reasons.push('semantic_merge_displacement_is_excluded_from_coordinate_accuracy_evidence');
  }
  return reasons;
}

function refineLegacy(row, observation) {
  assert(observation, `missing legacy observation for ${row.product_entity.id}`);
  assert(observation.name === row.product_entity.name, `legacy observation name mismatch for ${row.product_entity.id}`);
  assert(observation.latitude === row.truth_coordinate.latitude, `legacy latitude drift for ${row.product_entity.name}`);
  assert(observation.longitude === row.truth_coordinate.longitude, `legacy longitude drift for ${row.product_entity.name}`);

  const pseudoPrecision = analyzePseudoPrecision(
    row.truth_coordinate.latitude,
    row.truth_coordinate.longitude,
    observation.reported_precision_decimals,
  );
  const promotionReasons = legacyPromotionReasons(row, observation, pseudoPrecision);
  const historicalStateSuffix = ' This production value is historical regression state, not assumed summit truth.';
  const baseSemanticNote = row.verification_target.semantic_note
    .replace(historicalStateSuffix, '')
    .replace(
      'Gold truth comes from existing production mountain coordinates, not from a source collector vote.',
      'The existing production coordinate is retained for historical compatibility comparison only.',
    )
    .replace('Keep as production gold only', 'Keep as legacy regression only')
    .replace('gold truth remains production coordinate', 'the production coordinate remains historical regression state');
  const semanticNote = `${baseSemanticNote}${historicalStateSuffix}`;

  return {
    ...row,
    gold_set_version: 't13-r2-phase0-v2',
    gold_group: 'legacy_regression_18',
    accuracy_memberships: {
      catalog_accuracy: false,
      summit_accuracy: false,
      legacy_regression: true,
    },
    verification_target: {
      ...row.verification_target,
      semantic_note: semanticNote,
    },
    truth_source: {
      ...row.truth_source,
      criteria: 'existing production mountains row frozen for compatibility and displacement review; excluded from accuracy by default',
    },
    validation: {
      legacy_regression_only: true,
      accuracy_eligible: false,
      comparison_outputs: [
        'proposed_displacement_m',
        'historical_binding_impact',
        'semantic_compatibility',
      ],
      pseudo_precision: pseudoPrecision,
      checkin_evidence: observation.checkins,
      session_evidence: observation.sessions,
      promotion_review: {
        status: 'not_promoted',
        requires_case_by_case_review: true,
        reasons: promotionReasons,
      },
      semantic_difference_note: observation.semantic_difference_note || null,
    },
  };
}

function refineAuthority(row) {
  const summitEligible = row.verification_target.coordinate_target_role === 'independent_summit';
  return {
    ...row,
    gold_set_version: 't13-r2-phase0-v2',
    gold_group: 'authority_catalog_accuracy_13',
    accuracy_memberships: {
      catalog_accuracy: true,
      summit_accuracy: summitEligible,
      legacy_regression: false,
    },
    validation: {
      ...row.validation,
      reporting_policy: summitEligible
        ? 'catalog metrics allowed; summit error must be listed per case while summit sample size is single digit'
        : 'catalog metrics only; target_role=none is excluded from summit accuracy',
    },
  };
}

async function main() {
  const [goldBytes, observationBytes] = await Promise.all([
    readFile(GOLD_PATH, 'utf8'),
    readFile(OBSERVATIONS_PATH, 'utf8'),
  ]);
  const rows = parseJsonl(goldBytes);
  const observations = parseJsonl(observationBytes);
  const observationById = new Map(observations.map((row) => [row.production_mountain_id, row]));

  assert(rows.length === 31, `expected 31 gold cases, found ${rows.length}`);
  assert(observations.length === 18, `expected 18 legacy observations, found ${observations.length}`);
  assert(new Set(rows.map((row) => row.gold_case_id)).size === rows.length, 'gold case ids must be unique');

  const refined = rows.map((row) => {
    if (row.gold_group === 'prod_legacy_18' || row.gold_group === 'legacy_regression_18') {
      return refineLegacy(row, observationById.get(row.product_entity.id));
    }
    if (row.gold_group === 'authority_leave_one_source_out_13'
        || row.gold_group === 'authority_catalog_accuracy_13') {
      return refineAuthority(row);
    }
    throw new Error(`unexpected gold group: ${row.gold_group}`);
  });

  const output = `${refined.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const shaLine = `${sha256(output)}  gold-set.jsonl\n`;

  if (CHECK_MODE) {
    assert(goldBytes === output, 'gold-set.jsonl is not byte-identical to the refined Phase 0 build');
    assert(await readFile(GOLD_SHA_PATH, 'utf8') === shaLine, 'gold-set.sha256 does not match the refined gold set');
    process.stdout.write(`phase0 gold check: ${refined.length} rows, ${shaLine}`);
    return;
  }

  await Promise.all([
    writeFile(GOLD_PATH, output),
    writeFile(GOLD_SHA_PATH, shaLine),
  ]);
  process.stdout.write(`phase0 gold refined: ${refined.length} rows, ${shaLine}`);
}

await main();
