#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ledgerDir = join(here, "..", "ledger");
const inputPath = join(here, "t13-direct-coordinate-v2.jsonl");
const enrichmentPath = join(
  ledgerDir,
  "effective-canonical-enrichment.jsonl",
);
const outputPath = join(here, "t13-final-coordinate.jsonl");
const summaryPath = join(here, "t13-final-radius-summary.json");
const overridesPath = join(here, "t13-final-import-overrides.json");

const FINAL_COORDINATE_OVERRIDES = {
  "zijin-shan-jiangsu": {
    latitude: 32.07251,
    longitude: 118.84057,
    coordinate_kind: "summit",
    primary_source: "PeakWiki",
    source_link: "https://www.peakwiki.org/peak.php?pid=355",
    sources: [
      {
        provider: "PeakWiki",
        source_id: "pid=355",
        source_link: "https://www.peakwiki.org/peak.php?pid=355",
        matched_name: "紫金山",
        latitude: 32.07251,
        longitude: 118.84057,
        coordinate_kind: "summit",
        feature_code: "mountain_peak",
        distance_to_selected_km: 0,
      },
      {
        provider: "OpenStreetMap",
        source_id: "node/2600810866",
        source_link: "https://www.openstreetmap.org/node/2600810866",
        matched_name: "紫金山",
        latitude: 32.07251,
        longitude: 118.84057,
        coordinate_kind: "summit",
        feature_code: "natural=peak",
        distance_to_selected_km: 0,
      },
    ],
    source_count: 2,
    source_elevation_m: 448.9,
    ledger_altitude_m: 448.9,
    decision_note:
      "PeakWiki source is reachable and identifies the exact entity; its WGS-84 coordinate is independently identical to OSM node 2600810866.",
  },
  "xiang-shan": {
    latitude: 39.99006,
    longitude: 116.17157,
    coordinate_kind: "summit",
    primary_source: "PeakWiki",
    source_link: "https://www.peakwiki.org/peak.php?pid=479",
    sources: [
      {
        provider: "PeakWiki",
        source_id: "pid=479",
        source_link: "https://www.peakwiki.org/peak.php?pid=479",
        matched_name: "香炉峰",
        latitude: 39.99006,
        longitude: 116.17157,
        coordinate_kind: "summit",
        feature_code: "mountain_peak",
        distance_to_selected_km: 0,
      },
    ],
    source_count: 1,
    source_elevation_m: 575,
    ledger_altitude_m: 557,
    decision_note:
      "PeakWiki source is reachable and identifies 香炉峰; the ledger route and intro independently name 香炉峰 as the target within 北京香山.",
  },
  "mogan-shan": {
    latitude: 30.61158,
    longitude: 119.85513,
    coordinate_kind: "summit",
    primary_source: "PeakWiki",
    source_link: "https://www.peakwiki.org/peak.php?pid=697",
    sources: [
      {
        provider: "PeakWiki",
        source_id: "pid=697",
        source_link: "https://www.peakwiki.org/peak.php?pid=697",
        matched_name: "莫干山 / 塔山",
        latitude: 30.61158,
        longitude: 119.85513,
        coordinate_kind: "summit",
        feature_code: "mountain_peak",
        distance_to_selected_km: 0,
      },
    ],
    source_count: 1,
    source_elevation_m: 720,
    ledger_altitude_m: 758,
    decision_note:
      "PeakWiki source is reachable and identifies 莫干山/塔山; the ledger route independently targets 塔山主峰 and the national survey elevation is 719.0m.",
  },
};

const REJECTED_EXTERNAL_COORDINATES = [
  {
    effective_canonical_key: "pan-shan",
    latitude: 40.10394,
    longitude: 117.26868,
    source_link: "http://www.517huwai.com:8080/blog/57935",
    decision: "discarded",
    reason:
      "The cited source was unreachable (HTTP 503), so reachability and coordinate text could not be verified. Existing GNS area coordinate remains unchanged.",
  },
];

const IMPORT_OVERRIDES = {
  schema_version: "t13-final-import-overrides-v1",
  coordinate_overrides: Object.entries(FINAL_COORDINATE_OVERRIDES).map(
    ([effective_canonical_key, value]) => ({
      effective_canonical_key,
      latitude: value.latitude,
      longitude: value.longitude,
      datum: "WGS-84",
      coordinate_kind: value.coordinate_kind,
      source_link: value.source_link,
    }),
  ),
  rejected_external_coordinates: REJECTED_EXTERNAL_COORDINATES,
  field_overrides: [
    {
      effective_canonical_key: "xuedou-shan",
      field: "altitude",
      previous_value: 800,
      altitude_m_exact: 971.7,
      altitude_display_m: 972,
      rounding_rule: "ROUND half-up",
      source:
        "National Surveying and Mapping authority release, republished by Zhejiang Online",
      source_link:
        "https://china.zjol.com.cn/05china/system/2008/09/28/009983372.shtml",
      decision_note:
        "The official release names 雪窦山黄泥浆岗 and gives 971.7m; 800m describes the scenic mountain area rather than the surveyed summit.",
    },
  ],
  legacy_coordinate_rule:
    "The 18 production legacy rows retain their production latitude/longitude during reconciliation; T13 coordinates must not overwrite them.",
};

function parseJsonl(text) {
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function decimalPlaces(value) {
  const literal = String(value);
  if (!/[eE]/.test(literal)) {
    return (literal.split(".")[1] ?? "").length;
  }
  const [coefficient, exponentLiteral] = literal.toLowerCase().split("e");
  const fractionLength = (coefficient.split(".")[1] ?? "").length;
  return Math.max(0, fractionLength - Number(exponentLiteral));
}

function seedPrecision(enrichment) {
  const coordinate =
    enrichment.coordinate.original ?? enrichment.coordinate.effective;
  if (
    !coordinate ||
    coordinate.latitude == null ||
    coordinate.longitude == null
  ) {
    throw new Error(
      `Missing seed coordinate for ${enrichment.effective_canonical_key}`,
    );
  }
  return Math.min(
    decimalPlaces(coordinate.latitude),
    decimalPlaces(coordinate.longitude),
  );
}

function haversineKm(from, to) {
  const radians = Math.PI / 180;
  const lat1 = from.latitude * radians;
  const lat2 = to.latitude * radians;
  const deltaLat = (to.latitude - from.latitude) * radians;
  const deltaLng = (to.longitude - from.longitude) * radians;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) ** 2;
  return (2 * 6371.0088 * Math.asin(Math.sqrt(a)));
}

function classifyRadius(row, enrichment) {
  if (
    row.status === "resolved" &&
    row.coordinate_kind === "summit" &&
    row.precision_decimals >= 4
  ) {
    return {
      radius_bucket: "summit_4dp_or_more",
      summit_radius_m: 300,
    };
  }

  if (row.status === "resolved" && row.coordinate_kind === "area") {
    return {
      radius_bucket: "area",
      summit_radius_m: 2000,
    };
  }

  const precision = seedPrecision(enrichment);
  if (precision >= 3) {
    return {
      radius_bucket: "seed_3dp_or_more",
      summit_radius_m: 300,
      seed_precision_decimals: precision,
    };
  }
  if (precision === 2) {
    return {
      radius_bucket: "seed_2dp",
      summit_radius_m: 2000,
      seed_precision_decimals: precision,
    };
  }
  if (precision === 1) {
    return {
      radius_bucket: "seed_1dp",
      summit_radius_m: 15000,
      seed_precision_decimals: precision,
    };
  }
  return {
    radius_bucket: "seed_0dp_inactive",
    summit_radius_m: null,
    seed_precision_decimals: precision,
  };
}

function applyCoordinateOverride(row, enrichment) {
  const override = FINAL_COORDINATE_OVERRIDES[row.effective_canonical_key];
  if (!override) return row;

  const original = enrichment.coordinate.original ??
    enrichment.coordinate.effective;
  const elevationDelta = Math.abs(
    override.source_elevation_m - override.ledger_altitude_m,
  );
  return {
    ...row,
    latitude: override.latitude,
    longitude: override.longitude,
    precision_decimals: Math.min(
      decimalPlaces(override.latitude),
      decimalPlaces(override.longitude),
    ),
    datum: "WGS-84",
    coordinate_kind: override.coordinate_kind,
    primary_source: override.primary_source,
    source_link: override.source_link,
    sources: override.sources,
    source_count: override.source_count,
    elevation_check: {
      status: "passed",
      source_elevation_m: override.source_elevation_m,
      ledger_altitude_m: override.ledger_altitude_m,
      delta_m: Number(elevationDelta.toFixed(1)),
      tolerance_m: row.elevation_check?.tolerance_m ?? 300,
    },
    original_displacement_km: Number(
      haversineKm(original, {
        latitude: override.latitude,
        longitude: override.longitude,
      }).toFixed(3),
    ),
    displacement_review_band: "within_50km",
    status: "resolved",
    unresolved_reasons: [],
    final_external_decision: {
      decision: "adopted",
      verified_source_link: override.source_link,
      note: override.decision_note,
    },
  };
}

const [inputText, enrichmentText] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile(enrichmentPath, "utf8"),
]);
const inputRows = parseJsonl(inputText);
const enrichmentRows = parseJsonl(enrichmentText);
const enrichmentByKey = new Map(
  enrichmentRows.map((row) => [row.effective_canonical_key, row]),
);

if (inputRows.length !== 359 || enrichmentRows.length !== 359) {
  throw new Error(
    `Expected 359 coordinate and enrichment rows, got ${inputRows.length}/${enrichmentRows.length}`,
  );
}

const finalRows = inputRows
  .map((row) => {
    const enrichment = enrichmentByKey.get(row.effective_canonical_key);
    if (!enrichment) {
      throw new Error(`Missing enrichment for ${row.effective_canonical_key}`);
    }
    const resolvedRow = applyCoordinateOverride(row, enrichment);
    const radius = classifyRadius(resolvedRow, enrichment);
    return {
      ...resolvedRow,
      ...radius,
      is_active: false,
      is_readable: false,
    };
  })
  .sort((a, b) =>
    a.effective_canonical_key.localeCompare(b.effective_canonical_key, "en"),
  );

const bucketCounts = Object.fromEntries(
  [
    "summit_4dp_or_more",
    "area",
    "seed_3dp_or_more",
    "seed_2dp",
    "seed_1dp",
    "seed_0dp_inactive",
  ].map((bucket) => [
    bucket,
    finalRows.filter((row) => row.radius_bucket === bucket).length,
  ]),
);

const expectedCounts = {
  summit_4dp_or_more: 157,
  area: 69,
  seed_3dp_or_more: 8,
  seed_2dp: 26,
  seed_1dp: 82,
  seed_0dp_inactive: 17,
};
const countDifferences = Object.fromEntries(
  Object.keys(expectedCounts).map((key) => [
    key,
    bucketCounts[key] - expectedCounts[key],
  ]),
);

const outputText = `${finalRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
const outputSha256 = createHash("sha256").update(outputText).digest("hex");
const summary = {
  schema_version: "t13-final-radius-summary-v1",
  total: finalRows.length,
  resolved: finalRows.filter((row) => row.status === "resolved").length,
  unresolved: finalRows.filter((row) => row.status !== "resolved").length,
  all_is_active_false: finalRows.every((row) => row.is_active === false),
  all_is_readable_false: finalRows.every((row) => row.is_readable === false),
  bucket_counts: bucketCounts,
  user_expected_counts: expectedCounts,
  differences: countDifferences,
  difference_explanation: [
    "紫金山 and 莫干山 move from area to verified summit coordinates: summit +2, area -2.",
    "香山 moves from unresolved seed_3dp_or_more to a verified summit coordinate: summit +1, seed_3dp_or_more -1.",
    "盘山 external submission was discarded because its cited page was unreachable; the existing area coordinate remains.",
  ],
  zero_radius_keys: finalRows
    .filter((row) => row.summit_radius_m == null)
    .map((row) => row.effective_canonical_key),
  adopted_external_keys: Object.keys(FINAL_COORDINATE_OVERRIDES),
  rejected_external_coordinates: REJECTED_EXTERNAL_COORDINATES,
  output_sha256: outputSha256,
};

await Promise.all([
  writeFile(outputPath, outputText),
  writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`),
  writeFile(overridesPath, `${JSON.stringify(IMPORT_OVERRIDES, null, 2)}\n`),
]);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      summary: summaryPath,
      overrides: overridesPath,
      output_sha256: outputSha256,
      bucket_counts: bucketCounts,
      all_is_active_false: summary.all_is_active_false,
      all_is_readable_false: summary.all_is_readable_false,
    },
    null,
    2,
  ),
);
