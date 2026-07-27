import { createHash } from 'node:crypto';

import {
  COP_DEM_ADAPTER_VERSION,
  WORLD_COVER_ADAPTER_VERSION,
  copDemTileDescriptor,
  deriveCopDemWindow,
  deriveWorldCoverSurfaceContext,
  evaluateDemLocalMaximum,
} from './cop-dem-glo30-adapter.mjs';

const RESOLVED_TARGET_ROLES = new Set(['independent_summit', 'representative_highpoint']);
const NON_SUMMIT_TARGET_ROLES = new Set(['none', 'route_highpoint']);
const NON_RESOLVED_STATUSES = new Set(['needs_review', 'unresolved', 'not_applicable']);
const SANITY_GATE_FIELDS = [
  'province_bbox_sanity',
  'elevation_sanity',
  'seed_displacement_sanity',
  'dem_local_maximum_sanity',
];
const EFFECTIVE_QUERY_TARGET_KINDS = new Set([
  'existing_semantic_target',
  'reviewed_semantic_override',
]);
const SOURCE_LINEAGE_BY_FAMILY = new Map([
  ['overpass', 'osm'],
  ['openstreetmap', 'osm'],
  ['nga-gns', 'gns'],
  ['gns', 'gns'],
  ['wikidata', 'wikimedia'],
  ['wikipedia', 'wikimedia'],
]);
const EARTH_RADIUS_M = 6371008.8;
const STRATIFIED_SAMPLE_INPUT_PATHS = Object.freeze([
  'data/mountains/ledger/effective_canonicals.jsonl',
  'data/mountains/ledger/effective-canonical-enrichment.jsonl',
  'data/mountains/coordinate-fix/validation-policy.json',
]);
export const MAX_INDEPENDENT_SOURCE_PAIR_DISTANCE_M = 150;
export const MECHANICAL_GATE_POLICY = Object.freeze({
  elevation_tolerance_bands: Object.freeze([
    Object.freeze({ max_altitude_m: 999.9, tolerance_m: 100 }),
    Object.freeze({ max_altitude_m: 2999.9, tolerance_m: 150 }),
    Object.freeze({ max_altitude_m: 4999.9, tolerance_m: 250 }),
    Object.freeze({ max_altitude_m: null, tolerance_m: 400 }),
  ]),
  seed_displacement_max_m: 50000,
  dem_dataset_id: 'COP-DEM_GLO-30-DGED',
  dem_resolution_m: 30,
  dem_radius_m: 300,
  dem_candidate_to_maximum_max_distance_m: 45,
  dem_candidate_to_maximum_max_elevation_gap_m: 8,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function roundMetric(value) {
  return Number(value.toFixed(3));
}

function canonicalJson(value) {
  return JSON.stringify(stableObject(value));
}

function assertCanonicalEqual(actual, expected, message) {
  assert(canonicalJson(actual) === canonicalJson(expected), message);
}

export function canonicalArtifactBytes(value) {
  return Buffer.from(canonicalJson(value));
}

function degreesToRadians(value) {
  return value * (Math.PI / 180);
}

function validateCoordinate(latitude, longitude, label) {
  assert(
    Number.isFinite(latitude)
      && latitude >= -90
      && latitude <= 90
      && Number.isFinite(longitude)
      && longitude >= -180
      && longitude <= 180,
    `${label} requires valid coordinates`,
  );
}

export function haversineMeters(left, right) {
  validateCoordinate(left?.latitude, left?.longitude, 'left coordinate');
  validateCoordinate(right?.latitude, right?.longitude, 'right coordinate');
  const latitudeDelta = degreesToRadians(right.latitude - left.latitude);
  const longitudeDelta = degreesToRadians(right.longitude - left.longitude);
  const leftLatitude = degreesToRadians(left.latitude);
  const rightLatitude = degreesToRadians(right.latitude);
  const a = (Math.sin(latitudeDelta / 2) ** 2)
    + Math.cos(leftLatitude)
    * Math.cos(rightLatitude)
    * (Math.sin(longitudeDelta / 2) ** 2);
  const clamped = Math.min(1, Math.max(0, a));
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

function decimalPlacesFromLiteral(value, label) {
  assert(typeof value === 'string', `${label} requires an original coordinate literal`);
  const match = value.match(/^-?(?:0|[1-9]\d*)\.(\d+)$/);
  assert(match, `${label} must be a plain decimal coordinate literal`);
  return match[1].length;
}

export function coordinatePrecisionFromLiterals(
  latitude,
  longitude,
  latitudeLiteral,
  longitudeLiteral,
) {
  validateCoordinate(latitude, longitude, 'coordinate');
  assert(Number(latitudeLiteral) === latitude, 'latitude literal must encode the numeric latitude exactly');
  assert(Number(longitudeLiteral) === longitude, 'longitude literal must encode the numeric longitude exactly');
  return Math.min(
    decimalPlacesFromLiteral(latitudeLiteral, 'latitude'),
    decimalPlacesFromLiteral(longitudeLiteral, 'longitude'),
  );
}

export function elevationToleranceMeters(altitudeMeters) {
  assert(Number.isFinite(altitudeMeters), 'ledger altitude must be finite');
  const band = MECHANICAL_GATE_POLICY.elevation_tolerance_bands.find(
    ({ max_altitude_m: maximum }) => maximum === null || altitudeMeters <= maximum,
  );
  assert(band, 'ledger altitude does not match an elevation tolerance band');
  return band.tolerance_m;
}

function parseJsonWithNumberLexemes(bytes) {
  assert(bytes instanceof Uint8Array, 'source adapter requires original response bytes');
  const text = Buffer.from(bytes).toString('utf8');
  const numberLexemes = new Map();
  let offset = 0;

  function skipWhitespace() {
    while (/\s/.test(text[offset] || '')) offset += 1;
  }

  function parseString() {
    const start = offset;
    assert(text[offset] === '"', 'invalid JSON string');
    offset += 1;
    while (offset < text.length) {
      if (text[offset] === '\\') {
        offset += 2;
        continue;
      }
      if (text[offset] === '"') {
        offset += 1;
        return JSON.parse(text.slice(start, offset));
      }
      offset += 1;
    }
    throw new Error('unterminated JSON string');
  }

  function parseValue(path) {
    skipWhitespace();
    const current = text[offset];
    if (current === '{') {
      offset += 1;
      const result = {};
      skipWhitespace();
      if (text[offset] === '}') {
        offset += 1;
        return result;
      }
      while (offset < text.length) {
        skipWhitespace();
        const key = parseString();
        skipWhitespace();
        assert(text[offset] === ':', 'invalid JSON object separator');
        offset += 1;
        result[key] = parseValue([...path, key]);
        skipWhitespace();
        if (text[offset] === '}') {
          offset += 1;
          return result;
        }
        assert(text[offset] === ',', 'invalid JSON object delimiter');
        offset += 1;
      }
    }
    if (current === '[') {
      offset += 1;
      const result = [];
      skipWhitespace();
      if (text[offset] === ']') {
        offset += 1;
        return result;
      }
      while (offset < text.length) {
        result.push(parseValue([...path, result.length]));
        skipWhitespace();
        if (text[offset] === ']') {
          offset += 1;
          return result;
        }
        assert(text[offset] === ',', 'invalid JSON array delimiter');
        offset += 1;
      }
    }
    if (current === '"') return parseString();
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return value;
      }
    }
    const match = text.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    assert(match, 'invalid JSON value');
    offset += match[0].length;
    numberLexemes.set(`/${path.join('/')}`, match[0]);
    return Number(match[0]);
  }

  const value = parseValue([]);
  skipWhitespace();
  assert(offset === text.length, 'unexpected bytes after JSON response');
  return { value, numberLexemes };
}

function sourceNamesFromFields(entries) {
  const seen = new Set();
  return entries
    .filter((entry) => typeof entry.value === 'string' && entry.value.trim().length > 0)
    .filter((entry) => {
      const key = `${entry.field}\u0000${entry.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function deriveOverpassV1(responseBytes) {
  const { value, numberLexemes } = parseJsonWithNumberLexemes(responseBytes);
  assert(Array.isArray(value?.elements), 'overpass-v1 response requires elements');
  return {
    adapter_version: 'overpass-v1',
    features: value.elements
      .flatMap((element, index) => (
        element?.type === 'node'
          && element?.tags?.natural === 'peak'
          && Number.isFinite(element?.lat)
          && Number.isFinite(element?.lon)
          ? [{
        source_family: 'overpass',
        source_id: `node:${element.id}`,
        latitude: element.lat,
        longitude: element.lon,
        latitude_literal: numberLexemes.get(`/elements/${index}/lat`),
        longitude_literal: numberLexemes.get(`/elements/${index}/lon`),
        datum: 'WGS-84',
        elevation_m: Number.isFinite(Number(element.tags.ele))
          ? Number(element.tags.ele)
          : null,
        source_names: sourceNamesFromFields([
          { field: 'name:zh', value: element.tags['name:zh'] },
          { field: 'name', value: element.tags.name },
          { field: 'alt_name', value: element.tags.alt_name },
          { field: 'name:en', value: element.tags['name:en'] },
        ]),
          }]
          : []
      )),
  };
}

function deriveNgaGnsV1(responseBytes) {
  const { value, numberLexemes } = parseJsonWithNumberLexemes(responseBytes);
  assert(Array.isArray(value?.features), 'nga-gns-v1 response requires features');
  return {
    adapter_version: 'nga-gns-v1',
    features: value.features
      .flatMap((feature, index) => (
        feature?.attributes?.desig_cd === 'PK'
          && Number.isFinite(feature?.attributes?.lat_dd)
          && Number.isFinite(feature?.attributes?.long_dd)
          ? (() => {
        const attributes = feature.attributes;
        const alternateNames = typeof attributes.all_names === 'string'
          ? attributes.all_names.split(';').map((name) => name.trim()).filter(Boolean)
          : [];
        return [{
          source_family: 'nga-gns',
          source_id: `ufi:${attributes.ufi}`,
          latitude: attributes.lat_dd,
          longitude: attributes.long_dd,
          latitude_literal: numberLexemes.get(`/features/${index}/attributes/lat_dd`),
          longitude_literal: numberLexemes.get(`/features/${index}/attributes/long_dd`),
          datum: 'WGS-84',
          elevation_m: Number.isFinite(attributes.elevation_m)
            ? attributes.elevation_m
            : null,
          source_names: sourceNamesFromFields([
            { field: 'full_name', value: attributes.full_name },
            ...alternateNames.map((value) => ({ field: 'all_names', value })),
          ]),
        }];
          })()
          : []
      )),
  };
}

const SOURCE_ADAPTERS = new Map([
  ['overpass-v1', deriveOverpassV1],
  ['nga-gns-v1', deriveNgaGnsV1],
]);

export function deriveSourceAdapterOutput(adapterVersion, responseBytes) {
  const adapter = SOURCE_ADAPTERS.get(adapterVersion);
  assert(adapter, `source adapter ${adapterVersion} is not implemented in the repository`);
  return adapter(responseBytes);
}

function validateSourceVote(vote) {
  assert(vote && typeof vote === 'object', 'source vote must be an object');
  const expectedLineage = SOURCE_LINEAGE_BY_FAMILY.get(vote.source_family);
  assert(expectedLineage, `source family ${vote.source_family} requires a registered source lineage`);
  assert(
    vote.source_lineage === expectedLineage,
    `source lineage for ${vote.source_family} must be ${expectedLineage}`,
  );
  assert(vote.datum === 'WGS-84', 'source vote must use WGS-84');
  validateCoordinate(vote.latitude, vote.longitude, 'source vote');
  assert(
    coordinatePrecisionFromLiterals(
      vote.latitude,
      vote.longitude,
      vote.latitude_literal,
      vote.longitude_literal,
    ) >= 4,
    'source vote requires at least four decimal places in the original coordinate literals',
  );
}

export function bestIndependentSourcePairDistanceMeters(sourceVotes) {
  assert(Array.isArray(sourceVotes), 'source votes must be an array');
  sourceVotes.forEach(validateSourceVote);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let leftIndex = 0; leftIndex < sourceVotes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sourceVotes.length; rightIndex += 1) {
      const left = sourceVotes[leftIndex];
      const right = sourceVotes[rightIndex];
      if (left.source_lineage === right.source_lineage) continue;
      bestDistance = Math.min(bestDistance, haversineMeters(left, right));
    }
  }
  return Number.isFinite(bestDistance) ? roundMetric(bestDistance) : null;
}

function matchingSourceFeature(vote, evidence) {
  return evidence.source_features?.find(
    (feature) => feature.source_family === vote.source_family
      && feature.source_id === vote.source_id,
  );
}

function parseJsonBytes(bytes, label) {
  assert(bytes instanceof Uint8Array, `${label} requires original bytes`);
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function validateBoundSourceFeatures(evidence, context) {
  assert(context?.sourceArtifacts && typeof context.sourceArtifacts === 'object', 'mechanical evidence requires bound source artifacts');
  for (const feature of evidence.source_features) {
    const artifactKey = `${feature.source_family}:${feature.source_id}`;
    const artifact = context.sourceArtifacts[artifactKey];
    assert(artifact, `mechanical source feature ${artifactKey} requires its cache artifact`);
    validateSourceRequestEntry(artifact.manifestEntry, artifact);
    assert(
      artifact.manifestEntry.effective_canonical_key === evidence.effective_canonical_key,
      `source artifact ${artifactKey} canonical key must match mechanical evidence`,
    );
    assert(
      artifact.manifestEntry.source_family === feature.source_family,
      `source artifact ${artifactKey} family must match mechanical evidence`,
    );
    const parsed = parseJsonBytes(
      artifact.parsedOutputBytes,
      `source artifact ${artifactKey} parsed output`,
    );
    assert(
      parsed.adapter_version === artifact.manifestEntry.adapter_version,
      `source artifact ${artifactKey} parsed adapter version must match manifest`,
    );
    assert(Array.isArray(parsed.features), `source artifact ${artifactKey} parsed output requires features`);
    assert(
      parsed.features.some((candidate) => canonicalJson(candidate) === canonicalJson(feature)),
      `source artifact ${artifactKey} parsed output must contain the mechanical feature`,
    );
  }
}

async function validateBoundDemEvidence(evidence, context, candidate) {
  const demArtifact = context?.demArtifact;
  assert(demArtifact, 'mechanical DEM evidence requires its cache artifact');
  assert(demArtifact.sourceBytes instanceof Uint8Array, 'DEM cache artifact requires source bytes');
  const sourceHash = createHash('sha256').update(demArtifact.sourceBytes).digest('hex');
  assert(
    sourceHash === evidence.dem.source_cas_sha256,
    'DEM source CAS SHA must match the original tile bytes',
  );
  assert(
    demArtifact.adapter_version === evidence.dem.adapter_version,
    'DEM adapter version must match mechanical evidence',
  );
  assert(
    demArtifact.adapter_version === COP_DEM_ADAPTER_VERSION,
    'DEM artifact must use the pinned Copernicus adapter',
  );
  const samplesHash = createHash('sha256').update(demArtifact.parsedSamplesBytes).digest('hex');
  assert(
    samplesHash === evidence.dem.samples_sha256,
    'DEM samples SHA must match the original parsed-sample bytes',
  );
  const parsed = parseJsonBytes(demArtifact.parsedSamplesBytes, 'DEM parsed samples');
  assert(parsed.adapter_version === evidence.dem.adapter_version, 'DEM parsed adapter version must match mechanical evidence');
  const derived = await deriveCopDemWindow(demArtifact.sourceBytes, {
    candidate,
    radius_m: MECHANICAL_GATE_POLICY.dem_radius_m,
    source_url: demArtifact.manifestEntry?.normalized_request_params?.endpoint,
  });
  assertCanonicalEqual(
    parsed,
    derived,
    'DEM parsed samples must equal the pinned adapter output rederived from original GeoTIFF bytes',
  );
  if (derived.tile_metadata.vertical_datum_basis === 'bound_cop_dem_product_spec') {
    assert(
      demArtifact.manifestEntry,
      'DEM without an embedded vertical GeoKey requires its bound request manifest entry',
    );
    validateSourceRequestEntry(
      demArtifact.manifestEntry,
      {
        responseBytes: demArtifact.sourceBytes,
        parsedOutputBytes: demArtifact.parsedSamplesBytes,
        adapter_version: demArtifact.adapter_version,
      },
      { replayAdapter: false },
    );
    assert(
      demArtifact.manifestEntry.normalized_request_params.endpoint
        === copDemTileDescriptor(candidate).url,
      'DEM product-spec datum requires a bound official endpoint',
    );
  }
  assertCanonicalEqual(parsed.samples, evidence.dem.samples, 'DEM parsed samples must equal mechanical evidence samples');

  const surfaceArtifact = context?.surfaceArtifact;
  assert(surfaceArtifact, 'mechanical DEM evidence requires its surface-context cache artifact');
  assert(
    surfaceArtifact.sourceBytes instanceof Uint8Array,
    'surface-context cache artifact requires source bytes',
  );
  assert(
    surfaceArtifact.adapter_version === WORLD_COVER_ADAPTER_VERSION,
    'surface artifact must use the pinned WorldCover adapter',
  );
  const surfaceSourceHash = createHash('sha256')
    .update(surfaceArtifact.sourceBytes)
    .digest('hex');
  assert(
    surfaceSourceHash === evidence.dem.surface_context.source_cas_sha256,
    'surface source CAS SHA must match the original WorldCover tile bytes',
  );
  const surfaceParsedHash = createHash('sha256')
    .update(surfaceArtifact.parsedSurfaceBytes)
    .digest('hex');
  assert(
    surfaceParsedHash === evidence.dem.surface_context.parsed_sha256,
    'surface parsed SHA must match the original parsed-context bytes',
  );
  const parsedSurface = parseJsonBytes(
    surfaceArtifact.parsedSurfaceBytes,
    'WorldCover parsed surface context',
  );
  const derivedSurface = await deriveWorldCoverSurfaceContext(
    surfaceArtifact.sourceBytes,
    {
      candidate,
      radius_m: MECHANICAL_GATE_POLICY.dem_radius_m,
      ledger_altitude_m: evidence.ledger.altitude_m,
    },
  );
  assertCanonicalEqual(
    parsedSurface,
    derivedSurface,
    'surface context must equal the pinned adapter output rederived from original WorldCover bytes',
  );
  assertCanonicalEqual(
    parsedSurface,
    evidence.dem.surface_context.derived,
    'mechanical surface context must equal the parsed WorldCover evidence',
  );
}

function validateMechanicalEvidence(candidate, evidence) {
  assert(
    evidence?.schema_version === 't13-mechanical-evidence-v1',
    'resolved output requires versioned mechanical evidence',
  );
  assert(
    typeof evidence?.effective_canonical_key === 'string'
      && evidence.effective_canonical_key.length > 0,
    'mechanical evidence requires canonical key',
  );
  assert(evidence?.ledger && typeof evidence.ledger === 'object', 'mechanical evidence requires ledger facts');
  assert(Array.isArray(evidence?.source_features), 'mechanical evidence requires source features');
  validateCoordinate(candidate.latitude, candidate.longitude, 'mechanical candidate');
  assert(candidate.datum === 'WGS-84', 'mechanical candidate must use WGS-84');

  const bbox = evidence.ledger.province_bbox;
  assert(
    typeof bbox?.source_id === 'string'
      && Number.isFinite(bbox?.min_latitude)
      && Number.isFinite(bbox?.max_latitude)
      && Number.isFinite(bbox?.min_longitude)
      && Number.isFinite(bbox?.max_longitude),
    'mechanical evidence requires sourced province bbox bounds',
  );
  assert(bbox.min_latitude <= bbox.max_latitude, 'province bbox latitude bounds are inverted');
  assert(bbox.min_longitude <= bbox.max_longitude, 'province bbox longitude bounds are inverted');
  assert(Number.isFinite(evidence.ledger.altitude_m), 'mechanical evidence requires ledger altitude');

  const seed = evidence.ledger.seed_coordinate;
  assert(seed?.datum === 'WGS-84', 'mechanical evidence seed coordinate must use WGS-84');
  validateCoordinate(seed?.latitude, seed?.longitude, 'mechanical seed coordinate');

  const dem = evidence.dem;
  assert(dem?.dataset_id === MECHANICAL_GATE_POLICY.dem_dataset_id, 'mechanical evidence requires the frozen DEM product');
  assert(dem?.horizontal_datum === 'WGS-84', 'DEM horizontal datum must be WGS-84');
  assert(dem?.vertical_datum === 'EGM2008', 'DEM vertical datum must be EGM2008');
  assert(dem?.resolution_m === MECHANICAL_GATE_POLICY.dem_resolution_m, 'DEM resolution must match policy');
  assert(/^[a-f0-9]{64}$/.test(dem?.source_cas_sha256), 'DEM evidence requires a CAS SHA-256');
  assert(typeof dem?.adapter_version === 'string' && dem.adapter_version.length > 0, 'DEM evidence requires adapter version');
  assert(dem.adapter_version === COP_DEM_ADAPTER_VERSION, 'DEM evidence requires the pinned Copernicus adapter');
  assert(/^[a-f0-9]{64}$/.test(dem?.samples_sha256), 'DEM evidence requires parsed samples SHA-256');
  assert(Array.isArray(dem?.samples) && dem.samples.length > 0, 'DEM evidence requires raw samples');
  for (const sample of dem.samples) {
    validateCoordinate(sample?.latitude, sample?.longitude, 'DEM sample');
    assert(Number.isFinite(sample?.elevation_m), 'DEM sample requires elevation');
  }
  assert(
    dem?.surface_context?.adapter_version === WORLD_COVER_ADAPTER_VERSION,
    'DEM evidence requires the pinned WorldCover surface adapter',
  );
  assert(
    /^[a-f0-9]{64}$/.test(dem?.surface_context?.source_cas_sha256),
    'surface context requires a source CAS SHA-256',
  );
  assert(
    /^[a-f0-9]{64}$/.test(dem?.surface_context?.parsed_sha256),
    'surface context requires a parsed SHA-256',
  );
  assert(
    dem?.surface_context?.derived
      && typeof dem.surface_context.derived === 'object',
    'surface context requires adapter-derived evidence',
  );
}

async function validateMechanicalEvidenceArtifactDerivation(evidence, context, candidate) {
  validateBoundSourceFeatures(evidence, context);
  await validateBoundDemEvidence(evidence, context, candidate);
}

export function computeMechanicalSanityGates(candidate, evidence) {
  validateMechanicalEvidence(candidate, evidence);

  const bbox = evidence.ledger.province_bbox;
  const provincePassed = candidate.latitude >= bbox.min_latitude
    && candidate.latitude <= bbox.max_latitude
    && candidate.longitude >= bbox.min_longitude
    && candidate.longitude <= bbox.max_longitude;

  const adoptedFeatures = evidence.source_features.filter(
    (feature) => feature.latitude === candidate.latitude
      && feature.longitude === candidate.longitude
      && feature.datum === 'WGS-84',
  );
  assert(adoptedFeatures.length > 0, 'mechanical evidence requires the adopted source feature');
  const sourceElevationChecks = adoptedFeatures
    .map((feature) => {
      assert(Number.isFinite(feature.elevation_m), 'adopted source feature requires elevation');
      return {
        source_family: feature.source_family,
        source_id: feature.source_id,
        source_altitude_m: feature.elevation_m,
        delta_m: roundMetric(
          Math.abs(evidence.ledger.altitude_m - feature.elevation_m),
        ),
      };
    })
    .sort((left, right) => (
      `${left.source_family}:${left.source_id}`
        .localeCompare(`${right.source_family}:${right.source_id}`, 'en')
    ));
  const elevationDelta = Math.max(
    ...sourceElevationChecks.map((entry) => entry.delta_m),
  );
  const elevationTolerance = elevationToleranceMeters(evidence.ledger.altitude_m);

  const seedDisplacement = roundMetric(
    haversineMeters(candidate, evidence.ledger.seed_coordinate),
  );

  const demGate = evaluateDemLocalMaximum(
    {
      adapter_version: evidence.dem.adapter_version,
      dataset_id: evidence.dem.dataset_id,
      source_sha256: evidence.dem.source_cas_sha256,
      samples: evidence.dem.samples.map((sample) => ({
        ...sample,
        candidate_distance_m: roundMetric(haversineMeters(candidate, sample)),
      })),
    },
    evidence.dem.surface_context.derived,
  );

  return {
    province_bbox_sanity: {
      status: provincePassed ? 'passed' : 'failed',
      details: {
        bbox_source_id: bbox.source_id,
        candidate_inside_bbox: provincePassed,
      },
    },
    elevation_sanity: {
      status: elevationDelta <= elevationTolerance ? 'passed' : 'failed',
      details: {
        ledger_altitude_m: evidence.ledger.altitude_m,
        source_elevations: sourceElevationChecks,
        maximum_delta_m: elevationDelta,
        tolerance_m: elevationTolerance,
      },
    },
    seed_displacement_sanity: {
      status: seedDisplacement <= MECHANICAL_GATE_POLICY.seed_displacement_max_m
        ? 'passed'
        : 'failed',
      details: {
        displacement_m: seedDisplacement,
        automatic_review_threshold_m: MECHANICAL_GATE_POLICY.seed_displacement_max_m,
      },
    },
    dem_local_maximum_sanity: demGate,
  };
}

export function mechanicalEvidenceSha256(evidence) {
  return createHash('sha256').update(canonicalJson(evidence)).digest('hex');
}

function validateMechanicalSanityGates(candidate, evidence, context) {
  const computed = computeMechanicalSanityGates(candidate, evidence, context);
  for (const field of SANITY_GATE_FIELDS) {
    assert(computed[field].status === 'passed', `mechanically computed ${field} did not pass`);
    assertCanonicalEqual(
      candidate[field],
      computed[field],
      `${field} must equal the mechanically computed gate`,
    );
  }
  return computed;
}

export function classifyAngularGrid(value, precisionDecimals) {
  assert(Number.isFinite(value), 'coordinate must be finite');
  assert(Number.isInteger(precisionDecimals) && precisionDecimals >= 0, 'precision decimals must be a non-negative integer');

  const storageToleranceDegrees = (0.5 * (10 ** -precisionDecimals)) + Number.EPSILON;
  const nearestArcMinute = Math.round(value * 60) / 60;
  const nearestArcSecond = Math.round(value * 3600) / 3600;
  const arcMinuteDeltaDegrees = Math.abs(value - nearestArcMinute);
  const arcSecondDeltaDegrees = Math.abs(value - nearestArcSecond);

  if (arcMinuteDeltaDegrees <= storageToleranceDegrees) {
    return {
      grid: 'whole_arcminute',
      delta_arcseconds: arcMinuteDeltaDegrees * 3600,
    };
  }
  if (arcSecondDeltaDegrees <= storageToleranceDegrees) {
    return {
      grid: 'whole_arcsecond',
      delta_arcseconds: arcSecondDeltaDegrees * 3600,
    };
  }
  return {
    grid: 'off_grid',
    delta_arcseconds: arcSecondDeltaDegrees * 3600,
  };
}

export function analyzePseudoPrecision(latitude, longitude, precisionDecimals) {
  const latitudeGrid = classifyAngularGrid(latitude, precisionDecimals);
  const longitudeGrid = classifyAngularGrid(longitude, precisionDecimals);
  const gridAxisCount = [latitudeGrid, longitudeGrid].filter((entry) => entry.grid !== 'off_grid').length;
  const bothArcMinute = latitudeGrid.grid === 'whole_arcminute'
    && longitudeGrid.grid === 'whole_arcminute';
  const signalStrength = bothArcMinute
    ? 'strong_two_axis_arcminute'
    : gridAxisCount === 2
      ? 'medium_two_axis_arcsecond_or_mixed'
      : gridAxisCount === 1
        ? 'weak_single_axis'
        : 'none';
  return {
    latitude: latitudeGrid,
    longitude: longitudeGrid,
    grid_axis_count: gridAxisCount,
    signal_strength: signalStrength,
    status: gridAxisCount === 2
      ? 'two_axis_grid_signal'
      : gridAxisCount === 1
        ? 'single_axis_grid_signal'
        : 'no_grid_signal',
  };
}

function normalizedLedgerNames(ledgerRecord) {
  assert(ledgerRecord && typeof ledgerRecord === 'object', 'effective validation requires the frozen ledger record');
  return [
    ledgerRecord.primary_name,
    ledgerRecord.primary_summit,
    ...(Array.isArray(ledgerRecord.aliases) ? ledgerRecord.aliases : []),
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

function normalizeName(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function parseFrozenLedgerGpsRaw(raw) {
  assert(typeof raw === 'string', 'frozen-ledger catalog binding requires gps.raw');
  const match = raw.match(
    /^([0-9]+(?:\.[0-9]+)?)°([NS]),\s*([0-9]+(?:\.[0-9]+)?)°([EW])$/,
  );
  assert(match, 'frozen-ledger gps.raw must preserve explicit latitude/longitude literals');
  const [, latitudeToken, latitudeHemisphere, longitudeToken, longitudeHemisphere] = match;
  const latitudeLiteral = `${latitudeHemisphere === 'S' ? '-' : ''}${latitudeToken}`;
  const longitudeLiteral = `${longitudeHemisphere === 'W' ? '-' : ''}${longitudeToken}`;
  return {
    latitude: Number(latitudeLiteral),
    longitude: Number(longitudeLiteral),
    latitude_literal: latitudeLiteral,
    longitude_literal: longitudeLiteral,
    datum: 'WGS-84',
  };
}

function validateCatalogCoordinateBinding(record, context) {
  const catalog = record.catalog_coordinate;
  const hasCoordinates = Number.isFinite(catalog.latitude)
    || Number.isFinite(catalog.longitude);
  if (!hasCoordinates) {
    assert(
      catalog.latitude === null
      && catalog.longitude === null
      && catalog.latitude_literal === null
      && catalog.longitude_literal === null
      && catalog.datum === null
      && catalog.precision_decimals === null
      && catalog.source_binding === null,
      'catalog coordinates and source binding must all be null when unavailable',
    );
    return;
  }

  validateCoordinate(catalog.latitude, catalog.longitude, 'catalog coordinate');
  assert(catalog.datum === 'WGS-84', 'catalog coordinate must use WGS-84');
  const binding = catalog.source_binding;
  assert(binding && typeof binding === 'object', 'catalog coordinate requires a source binding');

  if (binding.kind === 'provider_feature') {
    const feature = context?.catalogSourceFeature;
    assert(feature, 'provider catalog binding requires its source feature');
    assert(
      feature.source_family === binding.source_family
      && feature.source_id === binding.source_id,
      'catalog source binding must identify the bound provider feature',
    );
    validateBoundSourceFeatures(
      {
        effective_canonical_key: record.effective_canonical_key,
        source_features: [feature],
      },
      context,
    );
    assertCanonicalEqual(
      {
        latitude: catalog.latitude,
        longitude: catalog.longitude,
        latitude_literal: catalog.latitude_literal,
        longitude_literal: catalog.longitude_literal,
        datum: catalog.datum,
      },
      {
        latitude: feature.latitude,
        longitude: feature.longitude,
        latitude_literal: feature.latitude_literal,
        longitude_literal: feature.longitude_literal,
        datum: feature.datum,
      },
      'catalog coordinate must equal its adapter-derived provider feature',
    );
    return;
  }

  assert(binding.kind === 'frozen_ledger_gps_raw', 'catalog source binding kind is unsupported');
  const ledgerRecord = context?.ledgerRecord;
  assert(ledgerRecord && typeof ledgerRecord === 'object', 'frozen-ledger catalog binding requires its ledger record');
  assert(
    ledgerRecord.effective_canonical_key === record.effective_canonical_key,
    'frozen-ledger catalog binding canonical key must match the sidecar record',
  );
  const ledgerRecordSha256 = createHash('sha256')
    .update(canonicalArtifactBytes(ledgerRecord))
    .digest('hex');
  assert(
    binding.ledger_record_sha256 === ledgerRecordSha256,
    'frozen-ledger catalog binding SHA must match the canonical ledger record',
  );
  assertCanonicalEqual(
    {
      latitude: catalog.latitude,
      longitude: catalog.longitude,
      latitude_literal: catalog.latitude_literal,
      longitude_literal: catalog.longitude_literal,
      datum: catalog.datum,
    },
    parseFrozenLedgerGpsRaw(ledgerRecord.gps?.raw),
    'catalog coordinate must equal the frozen ledger gps.raw value',
  );
}

export function validateEffectiveQueryTarget(queryTarget, context, record, summit) {
  assert(queryTarget && typeof queryTarget === 'object', 'resolved summit requires a query target');
  assert(EFFECTIVE_QUERY_TARGET_KINDS.has(queryTarget.kind), 'unreviewed earned peak proposals cannot enter the effective sidecar');
  assert(Array.isArray(queryTarget.names) && queryTarget.names.length > 0, 'effective query target requires names');
  assert(typeof queryTarget.semantic_source_id === 'string' && queryTarget.semantic_source_id.length > 0, 'effective query target requires semantic source id');
  const ledgerNames = normalizedLedgerNames(context?.ledgerRecord);

  if (queryTarget.kind === 'reviewed_semantic_override') {
    assert(queryTarget.review_status === 'approved', 'semantic override must be approved');
    assert(typeof queryTarget.review_artifact_id === 'string' && queryTarget.review_artifact_id.length > 0, 'approved semantic override requires review artifact id');
    assert(typeof queryTarget.proposal_id === 'string' && queryTarget.proposal_id.length > 0, 'approved semantic override requires proposal id');
    assert(/^[a-f0-9]{64}$/.test(queryTarget.proposal_sha256), 'approved semantic override requires proposal SHA-256');
    const binding = context?.reviewBinding;
    assert(binding?.proposal && binding?.review, 'approved semantic override requires its bound proposal and review');
    validateSummitTargetReviewBinding(binding.proposal, binding.review, context);
    assert(binding.proposal.effective_canonical_key === record.effective_canonical_key, 'proposal canonical key must match effective record');
    assert(binding.proposal.proposed_target_role === summit.target_role, 'proposal target role must match effective summit');
    assert(queryTarget.proposal_id === binding.proposal.proposal_id, 'query target proposal id must match bound proposal');
    assert(queryTarget.proposal_sha256 === proposalSha256(binding.proposal), 'query target proposal SHA must match bound proposal');
    assert(queryTarget.review_artifact_id === binding.review.review_artifact_id, 'query target review artifact must match bound review');
    assert(
      queryTarget.names.some(
        (name) => normalizeName(name) === normalizeName(binding.review.approved_override.target_name),
      ),
      'query target names must contain the approved target name',
    );
  } else {
    assert(
      queryTarget.names.every(
        (name) => ledgerNames.some(
          (ledgerName) => normalizeName(name) === normalizeName(ledgerName),
        ),
      ),
      'existing semantic target names must come from the frozen ledger',
    );
  }
  return true;
}

export async function validateT13CoordinateRecord(record, context) {
  assert(record && typeof record === 'object', 'record must be an object');
  const summit = record.summit_coordinate;
  assert(summit && typeof summit === 'object', 'summit_coordinate is required');
  const catalog = record.catalog_coordinate;
  assert(catalog && typeof catalog === 'object', 'catalog_coordinate is required');
  validateCatalogCoordinateBinding(record, context);
  if (Number.isFinite(catalog.latitude) || Number.isFinite(catalog.longitude)) {
    const computedCatalogPrecision = coordinatePrecisionFromLiterals(
      catalog.latitude,
      catalog.longitude,
      catalog.latitude_literal,
      catalog.longitude_literal,
    );
    assert(
      catalog.precision_decimals === computedCatalogPrecision,
      'catalog precision_decimals must equal the precision derived from coordinate literals',
    );
  }

  if (summit.status === 'resolved') {
    assert(summit.supports_summit_verification === true, 'resolved summit must support summit verification');
    assert(RESOLVED_TARGET_ROLES.has(summit.target_role), 'resolved summit requires an explicit summit role');
    assert(Number.isFinite(summit.latitude) && Number.isFinite(summit.longitude), 'resolved summit requires coordinates');
    assert(summit.datum === 'WGS-84', 'resolved summit requires WGS-84');
    const computedSummitPrecision = coordinatePrecisionFromLiterals(
      summit.latitude,
      summit.longitude,
      summit.latitude_literal,
      summit.longitude_literal,
    );
    assert(computedSummitPrecision >= 4, 'resolved summit requires at least four decimal places');
    assert(
      summit.precision_decimals === computedSummitPrecision,
      'summit precision_decimals must equal the precision derived from coordinate literals',
    );
    assert(Number.isInteger(summit.independent_source_count) && summit.independent_source_count >= 2, 'resolved summit requires at least two independent sources');
    assert(Array.isArray(summit.source_votes) && summit.source_votes.length >= 2, 'resolved summit requires source votes');
    const independentLineages = new Set(
      summit.source_votes.map((vote) => vote.source_lineage).filter(Boolean),
    );
    assert(independentLineages.size >= 2, 'resolved summit requires at least two distinct source lineages');
    assert(
      summit.independent_source_count === independentLineages.size,
      'independent source count must equal the distinct source lineage count',
    );
    const computedBestPairDistance = bestIndependentSourcePairDistanceMeters(summit.source_votes);
    assert(computedBestPairDistance !== null, 'resolved summit requires a computed independent source pair distance');
    assert(
      computedBestPairDistance <= MAX_INDEPENDENT_SOURCE_PAIR_DISTANCE_M,
      `resolved summit requires an independent source pair within ${MAX_INDEPENDENT_SOURCE_PAIR_DISTANCE_M}m; computed ${computedBestPairDistance}m`,
    );
    assert(
      summit.best_pair_distance_m === computedBestPairDistance,
      `best_pair_distance_m must equal the computed best pair distance ${computedBestPairDistance}m`,
    );
    const adoptedVote = summit.source_votes.find(
      (vote) => vote.latitude === summit.latitude && vote.longitude === summit.longitude,
    );
    assert(
      adoptedVote,
      'resolved summit coordinate must equal one source vote',
    );
    assert(
      summit.source_votes.some(
        (vote) => vote !== adoptedVote
          && vote.source_lineage !== adoptedVote.source_lineage
          && haversineMeters(adoptedVote, vote) <= MAX_INDEPENDENT_SOURCE_PAIR_DISTANCE_M,
      ),
      `adopted summit coordinate requires an independent source vote within ${MAX_INDEPENDENT_SOURCE_PAIR_DISTANCE_M}m`,
    );
    const evidence = context?.mechanicalEvidence;
    assert(evidence, 'resolved summit requires mechanical evidence');
    assert(
      evidence.effective_canonical_key === record.effective_canonical_key,
      'mechanical evidence canonical key must match effective record',
    );
    assert(
      summit.mechanical_evidence_sha256 === mechanicalEvidenceSha256(evidence),
      'mechanical evidence SHA must match the canonical evidence bundle',
    );
    for (const vote of summit.source_votes) {
      const feature = matchingSourceFeature(vote, evidence);
      assert(feature, `source vote ${vote.source_id} requires bound source evidence`);
      assertCanonicalEqual(
        {
          source_family: vote.source_family,
          source_id: vote.source_id,
          datum: vote.datum,
          latitude: vote.latitude,
          longitude: vote.longitude,
          latitude_literal: vote.latitude_literal,
          longitude_literal: vote.longitude_literal,
        },
        {
          source_family: feature.source_family,
          source_id: feature.source_id,
          datum: feature.datum,
          latitude: feature.latitude,
          longitude: feature.longitude,
          latitude_literal: feature.latitude_literal,
          longitude_literal: feature.longitude_literal,
        },
        `source vote ${vote.source_id} must equal its bound source evidence`,
      );
    }
    for (const field of SANITY_GATE_FIELDS) {
      assert(summit[field]?.status === 'passed', `resolved summit requires ${field} to pass`);
    }
    validateEffectiveQueryTarget(summit.query_target, context, record, summit);
    await validateMechanicalEvidenceArtifactDerivation(evidence, context, summit);
    validateMechanicalSanityGates(summit, evidence, context);
  }

  if (NON_RESOLVED_STATUSES.has(summit.status)) {
    assert(summit.supports_summit_verification === false, `${summit.status} summit cannot support summit verification`);
  }

  if (NON_SUMMIT_TARGET_ROLES.has(summit.target_role)) {
    assert(summit.supports_summit_verification === false, `${summit.target_role} cannot support summit verification`);
    assert(
      summit.latitude === null
      && summit.longitude === null
      && summit.latitude_literal === null
      && summit.longitude_literal === null
      && summit.datum === null
      && summit.precision_decimals === null,
      `${summit.target_role} cannot carry summit coordinates`,
    );
  }

  return true;
}

export function validateSummitTargetProposal(proposal, context) {
  assert(proposal?.schema_version === 't13-summit-target-proposal-v1', 'proposal requires schema version');
  assert(typeof proposal?.proposal_id === 'string' && proposal.proposal_id.length > 0, 'proposal requires proposal id');
  assert(
    typeof proposal?.effective_canonical_key === 'string'
      && proposal.effective_canonical_key.length > 0,
    'proposal requires effective canonical key',
  );
  assert(proposal?.proposal_status === 'pending_review', 'collector output must remain pending review');
  assert(proposal?.effective_sidecar_eligible === false, 'pending proposal cannot be effective');
  assert(
    RESOLVED_TARGET_ROLES.has(proposal?.proposed_target_role),
    'proposal requires a supported summit target role',
  );
  assert(
    typeof proposal?.proposed_target_name === 'string'
      && proposal.proposed_target_name.length > 0,
    'proposal requires proposed target name',
  );
  assert(proposal?.evidence?.peak_feature?.natural === 'peak', 'proposal requires peak feature evidence');
  assert(proposal?.evidence?.peak_feature?.datum === 'WGS-84', 'proposal peak evidence must be WGS-84');
  assert(
    typeof proposal?.evidence?.peak_feature?.source_family === 'string'
      && proposal.evidence.peak_feature.source_family.length > 0,
    'proposal requires peak source family',
  );
  assert(
    typeof proposal?.evidence?.peak_feature?.source_feature_id === 'string'
      && proposal.evidence.peak_feature.source_feature_id.length > 0,
    'proposal requires peak source feature id',
  );
  assert(
    Number.isFinite(proposal?.evidence?.peak_feature?.latitude)
      && proposal.evidence.peak_feature.latitude >= -90
      && proposal.evidence.peak_feature.latitude <= 90
      && Number.isFinite(proposal?.evidence?.peak_feature?.longitude)
      && proposal.evidence.peak_feature.longitude >= -180
      && proposal.evidence.peak_feature.longitude <= 180,
    'proposal requires peak coordinates',
  );
  const nameMatch = proposal?.evidence?.name_match;
  assert(nameMatch?.passed === true, 'proposal requires an auditable name match');
  assert(
    ['exact_normalized', 'alias_normalized'].includes(nameMatch?.match_type),
    'proposal requires a supported name match type',
  );
  assert(
    typeof nameMatch?.candidate_name === 'string' && nameMatch.candidate_name.length > 0,
    'proposal requires the source candidate name',
  );
  assert(
    typeof nameMatch?.matched_ledger_name === 'string' && nameMatch.matched_ledger_name.length > 0,
    'proposal requires the matched ledger name',
  );
  assert(
    Array.isArray(nameMatch?.source_name_fields)
      && nameMatch.source_name_fields.length > 0
      && nameMatch.source_name_fields.every(
        (field) => typeof field === 'string' && field.length > 0,
      ),
    'proposal requires the source name fields used by the match',
  );

  const elevationMatch = proposal?.evidence?.elevation_match;
  assert(elevationMatch?.passed === true, 'proposal requires an elevation match');
  assert(
    Number.isFinite(elevationMatch?.ledger_altitude_m)
      && Number.isFinite(elevationMatch?.source_altitude_m)
      && Number.isFinite(elevationMatch?.delta_m)
      && elevationMatch.delta_m >= 0
      && Number.isFinite(elevationMatch?.tolerance_m)
      && elevationMatch.tolerance_m > 0,
    'proposal requires complete elevation match evidence',
  );
  const computedElevationDelta = roundMetric(
    Math.abs(elevationMatch.ledger_altitude_m - elevationMatch.source_altitude_m),
  );
  assert(
    elevationMatch.delta_m === computedElevationDelta,
    `proposal delta_m must equal the computed elevation delta ${computedElevationDelta}m`,
  );
  const ledgerRecord = context?.ledgerRecord;
  assert(ledgerRecord, 'proposal validation requires its frozen ledger record');
  assert(
    proposal.effective_canonical_key === context?.mechanicalEvidence?.effective_canonical_key,
    'proposal canonical key must match mechanical evidence',
  );
  assert(
    elevationMatch.ledger_altitude_m === ledgerRecord.altitude_m,
    'proposal ledger altitude must match the frozen ledger',
  );
  const computedElevationTolerance = elevationToleranceMeters(ledgerRecord.altitude_m);
  assert(
    elevationMatch.tolerance_m === computedElevationTolerance,
    `proposal tolerance_m must equal the policy tolerance ${computedElevationTolerance}m`,
  );
  assert(
    computedElevationDelta <= computedElevationTolerance,
    'proposal elevation match cannot pass outside the policy tolerance',
  );
  validateBoundSourceFeatures(context.mechanicalEvidence, context);
  const sourceFeature = context.mechanicalEvidence.source_features.find(
    (feature) => feature.source_family === proposal.evidence.peak_feature.source_family
      && feature.source_id === proposal.evidence.peak_feature.source_feature_id,
  );
  assert(sourceFeature, 'proposal peak feature requires bound source evidence');
  assertCanonicalEqual(
    {
      source_family: proposal.evidence.peak_feature.source_family,
      source_id: proposal.evidence.peak_feature.source_feature_id,
      datum: proposal.evidence.peak_feature.datum,
      latitude: proposal.evidence.peak_feature.latitude,
      longitude: proposal.evidence.peak_feature.longitude,
      elevation_m: elevationMatch.source_altitude_m,
    },
    {
      source_family: sourceFeature.source_family,
      source_id: sourceFeature.source_id,
      datum: sourceFeature.datum,
      latitude: sourceFeature.latitude,
      longitude: sourceFeature.longitude,
      elevation_m: sourceFeature.elevation_m,
    },
    'proposal peak and elevation evidence must equal the bound source feature',
  );
  assert(
    normalizeName(nameMatch.candidate_name) === normalizeName(nameMatch.matched_ledger_name),
    'proposal computed name match must agree with the source and ledger names',
  );
  assert(
    normalizeName(proposal.proposed_target_name) === normalizeName(nameMatch.candidate_name),
    'proposal target name must equal the mechanically matched source name',
  );
  const matchingSourceNames = sourceFeature.source_names.filter(
    (entry) => normalizeName(entry.value) === normalizeName(nameMatch.candidate_name),
  );
  assert(matchingSourceNames.length > 0, 'proposal candidate name must exist in the pinned source adapter output');
  assert(
    matchingSourceNames.some((entry) => nameMatch.source_name_fields.includes(entry.field)),
    'proposal source name fields must identify the pinned source name field',
  );
  const ledgerNames = normalizedLedgerNames(ledgerRecord);
  const matchedLedgerIndex = ledgerNames.findIndex(
    (name) => normalizeName(name) === normalizeName(nameMatch.matched_ledger_name),
  );
  assert(matchedLedgerIndex >= 0, 'proposal matched ledger name must exist in the frozen ledger');
  const primaryNames = [ledgerRecord.primary_name, ledgerRecord.primary_summit]
    .filter(Boolean)
    .map(normalizeName);
  const expectedMatchType = primaryNames.includes(normalizeName(nameMatch.matched_ledger_name))
    ? 'exact_normalized'
    : 'alias_normalized';
  assert(
    nameMatch.match_type === expectedMatchType,
    `proposal match_type must be ${expectedMatchType} for the matched frozen-ledger name`,
  );
  assert(
    Array.isArray(proposal?.evidence?.provenance_ids)
      && proposal.evidence.provenance_ids.length > 0,
    'proposal requires provenance ids',
  );
  for (const field of SANITY_GATE_FIELDS) {
    const gate = proposal?.evidence?.sanity_gates?.[field];
    assert(gate?.status === 'passed', `proposal requires ${field} to pass`);
    assert(
      gate?.details !== null
        && typeof gate?.details === 'object'
        && !Array.isArray(gate.details),
      `proposal requires ${field} details`,
    );
  }
  const candidate = {
    latitude: proposal.evidence.peak_feature.latitude,
    longitude: proposal.evidence.peak_feature.longitude,
    datum: proposal.evidence.peak_feature.datum,
  };
  const computedSanityGates = computeMechanicalSanityGates(
    candidate,
    context.mechanicalEvidence,
    context,
  );
  for (const field of SANITY_GATE_FIELDS) {
    assert(computedSanityGates[field].status === 'passed', `proposal mechanically computed ${field} did not pass`);
    assertCanonicalEqual(
      proposal.evidence.sanity_gates[field],
      computedSanityGates[field],
      `proposal ${field} must equal the mechanically computed gate`,
    );
  }
  assert(proposal?.review?.status === 'pending', 'proposal review must remain pending');
  assert(
    proposal?.review?.review_artifact_id === null
      && proposal?.review?.reviewed_at === null,
    'pending proposal cannot claim review evidence',
  );
  return true;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => [key, stableObject(child)]));
}

export function proposalSha256(proposal) {
  return createHash('sha256')
    .update(JSON.stringify(stableObject(proposal)))
    .digest('hex');
}

export function validateSummitTargetReviewBinding(proposal, review, context) {
  validateSummitTargetProposal(proposal, context);
  assert(review?.schema_version === 't13-summit-target-review-v1', 'review requires schema version');
  assert(review?.proposal_id === proposal.proposal_id, 'review proposal id must match proposal');
  assert(
    review?.effective_canonical_key === proposal.effective_canonical_key,
    'review canonical key must match proposal',
  );
  assert(
    review?.proposal_sha256 === proposalSha256(proposal),
    'review proposal SHA must match the canonical proposal bytes',
  );
  assert(review?.decision === 'approved', 'only an approved review can enter the effective sidecar');
  assert(
    review?.approved_override?.coordinate_target_role === proposal.proposed_target_role,
    'approved target role must match proposal',
  );
  assert(
    review?.approved_override?.target_name === proposal.proposed_target_name,
    'approved target name must match proposal',
  );
  assert(
    typeof review?.review_artifact_id === 'string' && review.review_artifact_id.length > 0,
    'approved review requires review artifact id',
  );
  assert(
    typeof review?.reviewed_at === 'string' && !Number.isNaN(Date.parse(review.reviewed_at)),
    'approved review requires reviewed_at',
  );
  return true;
}

export function normalizedRequestHash(normalizedRequestParams) {
  const bytes = JSON.stringify(stableObject(normalizedRequestParams));
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256(bytes) {
  assert(bytes instanceof Uint8Array, 'SHA-256 input requires original bytes');
  return createHash('sha256').update(bytes).digest('hex');
}

export function computeStratifiedSampleBinding({
  sampleBytes,
  sampleManifestBytes,
  canonicalsBytes,
  enrichmentBytes,
  policyBytes,
}) {
  const inputBytes = [canonicalsBytes, enrichmentBytes, policyBytes];
  inputBytes.forEach((bytes, index) => {
    assert(
      bytes instanceof Uint8Array,
      `population input ${STRATIFIED_SAMPLE_INPUT_PATHS[index]} requires original bytes`,
    );
  });
  assert(sampleBytes instanceof Uint8Array, 'stratified sample requires original bytes');
  assert(
    sampleManifestBytes instanceof Uint8Array,
    'stratified sample manifest requires original bytes',
  );

  const inputs = STRATIFIED_SAMPLE_INPUT_PATHS.map((path, index) => ({
    path,
    sha256: sha256(inputBytes[index]),
  }));
  const populationBindingSha256 = createHash('sha256')
    .update(`${inputs.map((input) => `${input.path}\u0000${input.sha256}`).join('\n')}\n`)
    .digest('hex');
  const sampleSha256 = sha256(sampleBytes);
  const sampleManifestSha256 = sha256(sampleManifestBytes);
  const sampleManifest = parseJsonBytes(
    sampleManifestBytes,
    'stratified sample manifest',
  );

  assert(
    sampleManifest?.sample?.sha256 === sampleSha256,
    'stratified sample manifest sample SHA must match the original sample bytes',
  );
  assert(
    sampleManifest?.population?.binding_sha256 === populationBindingSha256,
    'stratified sample manifest population binding must match the original population inputs',
  );
  assert(
    Array.isArray(sampleManifest?.population?.inputs)
      && sampleManifest.population.inputs.length === inputs.length,
    'stratified sample manifest requires all population inputs',
  );
  for (const input of inputs) {
    const manifestInput = sampleManifest.population.inputs.find(
      (candidate) => candidate.path === input.path,
    );
    assert(
      manifestInput?.sha256 === input.sha256,
      `stratified sample manifest input SHA must match ${input.path}`,
    );
  }

  return {
    stratified_sample_sha256: sampleSha256,
    stratified_sample_manifest_sha256: sampleManifestSha256,
    population_binding_sha256: populationBindingSha256,
  };
}

export async function validateSourceRequestManifest(manifest, {
  bindingArtifacts,
  requestArtifacts = {},
} = {}) {
  assert(
    manifest?.schema_version === 't13-source-request-manifest-v1',
    'source request manifest requires schema version',
  );
  const computedBinding = computeStratifiedSampleBinding(bindingArtifacts || {});
  for (const field of [
    'stratified_sample_sha256',
    'stratified_sample_manifest_sha256',
    'population_binding_sha256',
  ]) {
    assert(
      manifest[field] === computedBinding[field],
      `${field} must equal the recomputed frozen artifact value`,
    );
  }
  assert(
    Array.isArray(manifest.requests),
    'source request manifest requires requests',
  );
  for (const entry of manifest.requests) {
    await validateSourceRequestEntryWithArtifacts(
      entry,
      requestArtifacts[entry.request_id],
    );
  }
  return true;
}

export function validateCachedResponseBytes(entry, responseBytes) {
  assert(
    responseBytes instanceof Uint8Array,
    'cached response validation requires the original response bytes',
  );
  const computedHash = createHash('sha256').update(responseBytes).digest('hex');
  assert(entry?.response_hash === computedHash, 'response hash must match the original response bytes');
  assert(
    entry?.response_cas_path?.endsWith(`/sha256/${computedHash}`),
    'response CAS path must match the computed response hash',
  );
  return true;
}

function validateCachedParsedOutputBytes(entry, parsedOutputBytes) {
  assert(
    parsedOutputBytes instanceof Uint8Array,
    'source request validation requires the original parsed-output bytes',
  );
  const computedHash = createHash('sha256').update(parsedOutputBytes).digest('hex');
  assert(entry?.parsed_output_hash === computedHash, 'parsed output hash must match the original parsed-output bytes');
  assert(
    entry?.parsed_output_cas_path?.endsWith(`/sha256/${computedHash}`),
    'parsed output CAS path must match the computed parsed-output hash',
  );
}

export function validateSourceRequestEntry(
  entry,
  evidence,
  { replayAdapter = true } = {},
) {
  assert(typeof entry.request_id === 'string' && entry.request_id.length > 0, 'source request requires request id');
  assert(typeof entry.effective_canonical_key === 'string' && entry.effective_canonical_key.length > 0, 'source request requires canonical key');
  assert(typeof entry.source_family === 'string' && entry.source_family.length > 0, 'source request requires source family');
  assert(typeof entry.adapter_version === 'string' && entry.adapter_version.length > 0, 'source request requires adapter version');
  assert(entry.normalized_request_params && typeof entry.normalized_request_params === 'object', 'source request requires normalized params');
  assert(entry.request_hash === normalizedRequestHash(entry.normalized_request_params), 'request hash must match normalized params');
  assert(typeof entry.fetched_at === 'string' && !Number.isNaN(Date.parse(entry.fetched_at)), 'source request requires fetched_at');
  assert(typeof entry.cache_hit === 'boolean', 'source request requires cache_hit');
  assert(entry.source_license && typeof entry.source_license.license_id === 'string', 'source request requires source license');

  const hasResponse = typeof entry.response_hash === 'string';
  assert(hasResponse === (typeof entry.response_cas_path === 'string'), 'response hash and CAS path must appear together');
  if (hasResponse) {
    validateCachedResponseBytes(entry, evidence?.responseBytes);
  }

  const hasParsedOutput = typeof entry.parsed_output_hash === 'string';
  assert(
    hasParsedOutput === (typeof entry.parsed_output_cas_path === 'string'),
    'parsed output hash and CAS path must appear together',
  );
  if (entry.outcome === 'complete' || entry.outcome === 'missing') {
    assert(Number.isInteger(entry.http_status) && entry.http_status >= 200 && entry.http_status <= 299, `${entry.outcome} requires a successful HTTP response`);
    assert(hasResponse, `${entry.outcome} requires a cached response`);
    assert(typeof entry.parsed_output_hash === 'string', `${entry.outcome} requires a parsed output hash`);
    assert(typeof entry.parsed_output_cas_path === 'string', `${entry.outcome} requires a parsed output CAS path`);
    validateCachedParsedOutputBytes(entry, evidence?.parsedOutputBytes);
    assert(
      evidence?.adapter_version === entry.adapter_version,
      'parsed output evidence must use the manifest adapter version',
    );
    if (replayAdapter) {
      const derivedOutput = deriveSourceAdapterOutput(
        entry.adapter_version,
        evidence.responseBytes,
      );
      const expectedParsedBytes = canonicalArtifactBytes(derivedOutput);
      assert(
        Buffer.compare(
          Buffer.from(evidence.parsedOutputBytes),
          expectedParsedBytes,
        ) === 0,
        'parsed output bytes must equal the pinned adapter output derived from response bytes',
      );
      assert(
        entry.outcome === (derivedOutput.features.length > 0 ? 'complete' : 'missing'),
        'manifest outcome must match the pinned adapter output',
      );
    }
  } else {
    assert(!hasParsedOutput, `${entry.outcome} cannot claim parsed output`);
  }
  if (entry.outcome === 'rate_limited') {
    assert(entry.http_status === 429 || entry.rate_limit_signal === true, 'rate_limited requires HTTP 429 or an explicit provider signal');
  }
  if (entry.outcome === 'blocked') {
    assert(typeof entry.outcome_reason === 'string' && entry.outcome_reason.length > 0, 'blocked requires a reason');
  }
  if (entry.outcome === 'transport_error') {
    assert(entry.http_status === null, 'transport error cannot claim an HTTP status');
  }
  return true;
}

async function validateSourceRequestEntryWithArtifacts(entry, evidence) {
  const rasterAdapter = [
    COP_DEM_ADAPTER_VERSION,
    WORLD_COVER_ADAPTER_VERSION,
  ].includes(entry.adapter_version);
  if (!rasterAdapter) return validateSourceRequestEntry(entry, evidence);

  validateSourceRequestEntry(entry, evidence, { replayAdapter: false });
  if (entry.outcome !== 'complete' && entry.outcome !== 'missing') return true;
  assert(entry.outcome === 'complete', 'raster adapter requests must complete before parsing');
  const params = entry.normalized_request_params;
  const candidate = {
    latitude: params?.candidate_latitude,
    longitude: params?.candidate_longitude,
  };
  let derived;
  if (entry.adapter_version === COP_DEM_ADAPTER_VERSION) {
    derived = await deriveCopDemWindow(evidence.responseBytes, {
      candidate,
      radius_m: params.radius_m,
      source_url: params.endpoint,
    });
  } else {
    derived = await deriveWorldCoverSurfaceContext(evidence.responseBytes, {
      candidate,
      radius_m: params.radius_m,
      ledger_altitude_m: params.ledger_altitude_m,
    });
  }
  assert(
    Buffer.compare(
      Buffer.from(evidence.parsedOutputBytes),
      canonicalArtifactBytes(derived),
    ) === 0,
    'raster parsed output bytes must equal the pinned adapter output derived from response bytes',
  );
  return true;
}
