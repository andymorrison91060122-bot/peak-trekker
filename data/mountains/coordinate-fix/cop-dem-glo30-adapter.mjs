import { createHash } from 'node:crypto';

import { fromArrayBuffer } from 'geotiff';

export const COP_DEM_ADAPTER_VERSION = 'cop-dem-glo30-v1';
export const WORLD_COVER_ADAPTER_VERSION = 'esa-worldcover-2021-v1';

const EARTH_RADIUS_M = 6371008.8;
const METERS_PER_LATITUDE_DEGREE = 111195.08;
const DEM_RADIUS_M = 300;
const DEM_MAXIMUM_DISTANCE_M = 45;
const DEM_MAXIMUM_ELEVATION_GAP_M = 8;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function degreesToRadians(value) {
  return value * (Math.PI / 180);
}

function haversineMeters(left, right) {
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

function round(value, decimals = 3) {
  return Number(value.toFixed(decimals));
}

function validateCandidate(candidate) {
  assert(
    Number.isFinite(candidate?.latitude)
      && candidate.latitude >= -90
      && candidate.latitude <= 90
      && Number.isFinite(candidate?.longitude)
      && candidate.longitude >= -180
      && candidate.longitude <= 180,
    'candidate requires valid WGS-84 coordinates',
  );
}

function coordinatePrefix(value, positive, negative) {
  const floored = Math.floor(value);
  const hemisphere = floored >= 0 ? positive : negative;
  return `${hemisphere}${String(Math.abs(floored)).padStart(2 + (positive === 'E'), '0')}`;
}

export function copDemTileDescriptor(candidate) {
  validateCandidate(candidate);
  const latitude = coordinatePrefix(candidate.latitude, 'N', 'S');
  const longitude = coordinatePrefix(candidate.longitude, 'E', 'W');
  const tileId = `Copernicus_DSM_COG_10_${latitude}_00_${longitude}_00_DEM`;
  return {
    tile_id: tileId,
    url: `https://copernicus-dem-30m.s3.amazonaws.com/${tileId}/${tileId}.tif`,
  };
}

function threeDegreeOrigin(value) {
  return Math.floor(value / 3) * 3;
}

export function worldCoverTileDescriptor(candidate) {
  validateCandidate(candidate);
  const latitude = coordinatePrefix(threeDegreeOrigin(candidate.latitude), 'N', 'S');
  const longitude = coordinatePrefix(
    threeDegreeOrigin(candidate.longitude),
    'E',
    'W',
  );
  const tileId = `${latitude}${longitude}`;
  return {
    tile_id: `ESA_WorldCover_10m_2021_v200_${tileId}_Map`,
    url: `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${tileId}_Map.tif`,
  };
}

function arrayBufferFromBytes(bytes) {
  assert(bytes instanceof Uint8Array, 'raster adapter requires original GeoTIFF bytes');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function pixelCenter(origin, resolution, index, rasterType) {
  const offset = rasterType === 1 ? 0.5 : 0;
  return origin + ((index + offset) * resolution);
}

function windowForRadius({
  candidate,
  origin,
  resolution,
  width,
  height,
  radiusM,
  rasterType,
}) {
  const rasterOffset = rasterType === 1 ? 0.5 : 0;
  const centerX = ((candidate.longitude - origin[0]) / resolution[0]) - rasterOffset;
  const centerY = ((candidate.latitude - origin[1]) / resolution[1]) - rasterOffset;
  const longitudeMetersPerDegree = METERS_PER_LATITUDE_DEGREE
    * Math.max(0.01, Math.cos(degreesToRadians(candidate.latitude)));
  const xRadius = Math.ceil(radiusM / (Math.abs(resolution[0]) * longitudeMetersPerDegree)) + 1;
  const yRadius = Math.ceil(radiusM / (Math.abs(resolution[1]) * METERS_PER_LATITUDE_DEGREE)) + 1;
  const minX = Math.max(0, Math.floor(centerX - xRadius));
  const minY = Math.max(0, Math.floor(centerY - yRadius));
  const maxX = Math.min(width, Math.ceil(centerX + xRadius + 1));
  const maxY = Math.min(height, Math.ceil(centerY + yRadius + 1));
  assert(minX < maxX && minY < maxY, 'candidate lies outside the raster extent');
  return [minX, minY, maxX, maxY];
}

async function readRasterWindow(sourceBytes, {
  candidate,
  radiusM,
  expectedHorizontalEpsg,
  expectedVerticalEpsg = null,
  allowMissingVerticalEpsg = false,
  expectedResolutionRangeM,
  acceptedRasterTypes,
}) {
  validateCandidate(candidate);
  const geotiff = await fromArrayBuffer(arrayBufferFromBytes(sourceBytes));
  const image = await geotiff.getImage();
  const geoKeys = image.getGeoKeys();
  assert(
    geoKeys.GeographicTypeGeoKey === expectedHorizontalEpsg,
    `raster horizontal CRS must be EPSG:${expectedHorizontalEpsg}`,
  );
  if (expectedVerticalEpsg !== null) {
    assert(
      geoKeys.VerticalCSTypeGeoKey === expectedVerticalEpsg
        || (allowMissingVerticalEpsg && geoKeys.VerticalCSTypeGeoKey === undefined),
      `raster vertical datum must be EPSG:${expectedVerticalEpsg}`,
    );
  }
  const rasterType = geoKeys.GTRasterTypeGeoKey;
  assert(
    acceptedRasterTypes.includes(rasterType),
    acceptedRasterTypes.length === 1 && acceptedRasterTypes[0] === 2
      ? 'Copernicus DEM must use RasterPixelIsPoint'
      : 'raster type is not supported by the pinned adapter',
  );

  const width = image.getWidth();
  const height = image.getHeight();
  const origin = image.getOrigin();
  const resolution = image.getResolution();
  const longitudeResolutionM = Math.abs(resolution[0])
    * METERS_PER_LATITUDE_DEGREE
    * Math.max(0.01, Math.cos(degreesToRadians(candidate.latitude)));
  const latitudeResolutionM = Math.abs(resolution[1]) * METERS_PER_LATITUDE_DEGREE;
  const nominalResolutionM = Math.max(longitudeResolutionM, latitudeResolutionM);
  assert(
    nominalResolutionM >= expectedResolutionRangeM[0]
      && nominalResolutionM <= expectedResolutionRangeM[1],
    `raster resolution ${round(nominalResolutionM)}m is outside the adapter contract`,
  );
  const window = windowForRadius({
    candidate,
    origin,
    resolution,
    width,
    height,
    radiusM,
    rasterType,
  });
  const rasters = await image.readRasters({ window });
  assert(rasters.length === 1, 'raster adapter requires one data band');
  const values = rasters[0];
  const noDataValue = image.getGDALNoData();
  const samples = [];
  for (let localY = 0; localY < rasters.height; localY += 1) {
    for (let localX = 0; localX < rasters.width; localX += 1) {
      const value = Number(values[(localY * rasters.width) + localX]);
      if (!Number.isFinite(value) || value === noDataValue) continue;
      const column = window[0] + localX;
      const row = window[1] + localY;
      const coordinate = {
        latitude: pixelCenter(origin[1], resolution[1], row, rasterType),
        longitude: pixelCenter(origin[0], resolution[0], column, rasterType),
      };
      const candidateDistanceM = haversineMeters(candidate, coordinate);
      if (candidateDistanceM > radiusM) continue;
      samples.push({
        row,
        column,
        latitude: round(coordinate.latitude, 8),
        longitude: round(coordinate.longitude, 8),
        value,
        candidate_distance_m: round(candidateDistanceM),
      });
    }
  }
  assert(samples.length > 0, 'raster has no valid samples in the requested geodesic radius');
  samples.sort((left, right) => left.row - right.row || left.column - right.column);
  return {
    source_sha256: sha256(sourceBytes),
    geo_keys: geoKeys,
    raster_type: rasterType,
    width,
    height,
    origin,
    resolution,
    nominal_resolution_m: round(nominalResolutionM),
    window,
    samples,
  };
}

export async function deriveCopDemWindow(sourceBytes, {
  candidate,
  radius_m: radiusM = DEM_RADIUS_M,
  source_url: sourceUrl = null,
}) {
  assert(radiusM === DEM_RADIUS_M, `Copernicus DEM adapter radius must remain ${DEM_RADIUS_M}m`);
  const raster = await readRasterWindow(sourceBytes, {
    candidate,
    radiusM,
    expectedHorizontalEpsg: 4326,
    expectedVerticalEpsg: 3855,
    allowMissingVerticalEpsg: true,
    expectedResolutionRangeM: [20, 35],
    acceptedRasterTypes: [2],
  });
  const embeddedVerticalEpsg = raster.geo_keys.VerticalCSTypeGeoKey;
  if (embeddedVerticalEpsg === undefined) {
    assert(
      sourceUrl === copDemTileDescriptor(candidate).url,
      'Copernicus DEM without a vertical GeoKey requires the exact bound official tile URL',
    );
  }
  return {
    adapter_version: COP_DEM_ADAPTER_VERSION,
    dataset_id: 'COP-DEM_GLO-30-DGED',
    source_sha256: raster.source_sha256,
    candidate: {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      datum: 'WGS-84',
    },
    radius_m: radiusM,
    tile_metadata: {
      horizontal_epsg: raster.geo_keys.GeographicTypeGeoKey,
      vertical_epsg: 3855,
      embedded_vertical_epsg: embeddedVerticalEpsg ?? null,
      vertical_datum_basis: embeddedVerticalEpsg === 3855
        ? 'embedded_geokey'
        : 'bound_cop_dem_product_spec',
      raster_type: 'pixel_is_point',
      nominal_resolution_m: raster.nominal_resolution_m,
      width: raster.width,
      height: raster.height,
    },
    source_window: raster.window,
    samples: raster.samples.map((sample) => ({
      row: sample.row,
      column: sample.column,
      latitude: sample.latitude,
      longitude: sample.longitude,
      elevation_m: sample.value,
      candidate_distance_m: sample.candidate_distance_m,
    })),
  };
}

function share(count, total) {
  return total === 0 ? 0 : round(count / total, 6);
}

export async function deriveWorldCoverSurfaceContext(sourceBytes, {
  candidate,
  radius_m: radiusM = DEM_RADIUS_M,
  ledger_altitude_m: ledgerAltitudeM,
}) {
  assert(radiusM === DEM_RADIUS_M, `WorldCover adapter radius must remain ${DEM_RADIUS_M}m`);
  assert(
    ledgerAltitudeM === null || Number.isFinite(ledgerAltitudeM),
    'WorldCover surface classification requires finite or honestly missing ledger altitude',
  );
  const raster = await readRasterWindow(sourceBytes, {
    candidate,
    radiusM,
    expectedHorizontalEpsg: 4326,
    expectedResolutionRangeM: [5, 15],
    acceptedRasterTypes: [1, 2],
  });
  const classes = new Map();
  for (const sample of raster.samples) {
    const classValue = Number(sample.value);
    classes.set(classValue, (classes.get(classValue) ?? 0) + 1);
  }
  const total = raster.samples.length;
  const treeCoverShare = share(classes.get(10) ?? 0, total);
  const bareShare = share(classes.get(60) ?? 0, total);
  const snowShare = share(classes.get(70) ?? 0, total);
  const vegetatedOrBuiltShare = share(
    [10, 20, 30, 40, 50, 90, 95, 100]
      .reduce((sum, classValue) => sum + (classes.get(classValue) ?? 0), 0),
    total,
  );
  let surfaceRegime = 'unknown_or_mixed';
  if (Number.isFinite(ledgerAltitudeM) && ledgerAltitudeM < 1000 && treeCoverShare >= 0.2) {
    surfaceRegime = 'low_elevation_tree_cover';
  } else if (
    Number.isFinite(ledgerAltitudeM)
      && ledgerAltitudeM < 1000
      && vegetatedOrBuiltShare >= 0.2
  ) {
    surfaceRegime = 'low_elevation_vegetated_or_built';
  } else if (
    Number.isFinite(ledgerAltitudeM)
      && ledgerAltitudeM >= 3000
      && (bareShare + snowShare) >= 0.8
  ) {
    surfaceRegime = 'high_elevation_bare_or_snow';
  }
  return {
    adapter_version: WORLD_COVER_ADAPTER_VERSION,
    dataset_id: 'ESA_WorldCover_10m_2021_v200',
    source_sha256: raster.source_sha256,
    candidate: {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      datum: 'WGS-84',
    },
    radius_m: radiusM,
    class_shares: {
      tree_cover: treeCoverShare,
      vegetated_or_built: vegetatedOrBuiltShare,
      bare_or_sparse: bareShare,
      snow_or_ice: snowShare,
    },
    class_counts: Object.fromEntries(
      [...classes.entries()].sort(([left], [right]) => left - right),
    ),
    sample_count: total,
    surface_regime: surfaceRegime,
  };
}

export function evaluateDemLocalMaximum(demWindow, surfaceContext) {
  assert(demWindow?.adapter_version === COP_DEM_ADAPTER_VERSION, 'DEM window requires the pinned adapter');
  assert(Array.isArray(demWindow.samples) && demWindow.samples.length > 0, 'DEM window requires samples');
  const candidateCell = demWindow.samples.reduce(
    (closest, sample) => sample.candidate_distance_m < closest.candidate_distance_m
      ? sample
      : closest,
  );
  const maximumElevation = Math.max(...demWindow.samples.map((sample) => sample.elevation_m));
  const maximumCells = demWindow.samples.filter(
    (sample) => sample.elevation_m === maximumElevation,
  );
  const candidateToMaximumDistance = Math.min(
    ...maximumCells.map((sample) => sample.candidate_distance_m),
  );
  const candidateToMaximumElevationGap = maximumElevation - candidateCell.elevation_m;
  const sharedDetails = {
    dataset_id: demWindow.dataset_id,
    source_sha256: demWindow.source_sha256,
    surface_regime: surfaceContext?.surface_regime ?? 'unknown_or_mixed',
    sample_count: demWindow.samples.length,
    candidate_cell_distance_m: round(candidateCell.candidate_distance_m),
    candidate_cell_elevation_m: candidateCell.elevation_m,
    local_maximum_elevation_m: maximumElevation,
    candidate_to_local_maximum_distance_m: round(candidateToMaximumDistance),
    candidate_to_local_maximum_elevation_gap_m: round(candidateToMaximumElevationGap),
    thresholds: {
      radius_m: DEM_RADIUS_M,
      distance_m: DEM_MAXIMUM_DISTANCE_M,
      elevation_gap_m: DEM_MAXIMUM_ELEVATION_GAP_M,
    },
  };

  if ([
    'low_elevation_tree_cover',
    'low_elevation_vegetated_or_built',
  ].includes(surfaceContext?.surface_regime)) {
    return {
      status: 'inconclusive',
      details: {
        ...sharedDetails,
        reason: 'dsm_canopy_or_structure_contamination',
      },
    };
  }
  if (surfaceContext?.surface_regime !== 'high_elevation_bare_or_snow') {
    return {
      status: 'inconclusive',
      details: {
        ...sharedDetails,
        reason: 'surface_regime_not_conclusive_for_dsm',
      },
    };
  }

  const passed = candidateToMaximumDistance <= DEM_MAXIMUM_DISTANCE_M
    && candidateToMaximumElevationGap <= DEM_MAXIMUM_ELEVATION_GAP_M;
  return {
    status: passed ? 'passed' : 'failed',
    details: {
      ...sharedDetails,
      reason: passed ? null : 'candidate_not_at_dsm_local_maximum',
    },
  };
}

function summarizeRegime(rows) {
  const knownTruth = rows.filter((row) => row.known_summit_truth);
  const falseRejections = knownTruth.filter((row) => row.verdict === 'failed');
  return {
    known_truth_count: knownTruth.length,
    false_rejection_count: falseRejections.length,
    false_rejection_rate: knownTruth.length === 0
      ? null
      : falseRejections.length / knownTruth.length,
    inconclusive_count: rows.filter((row) => row.verdict === 'inconclusive').length,
  };
}

export function summarizeDemPilotBySurfaceRegime(rows) {
  assert(Array.isArray(rows), 'DEM pilot rows must be an array');
  return {
    high_elevation_bare_or_snow: summarizeRegime(
      rows.filter((row) => row.surface_regime === 'high_elevation_bare_or_snow'),
    ),
    low_elevation_tree_cover: summarizeRegime(
      rows.filter((row) => row.surface_regime === 'low_elevation_tree_cover'),
    ),
    low_elevation_forest_or_vegetated: summarizeRegime(
      rows.filter((row) => [
        'low_elevation_tree_cover',
        'low_elevation_vegetated_or_built',
      ].includes(row.surface_regime)),
    ),
    unknown_or_mixed: summarizeRegime(
      rows.filter((row) => row.surface_regime === 'unknown_or_mixed'),
    ),
  };
}
