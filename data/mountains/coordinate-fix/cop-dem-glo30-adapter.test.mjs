import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { writeArrayBuffer } from 'geotiff';

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

const PIXEL_DEGREES = 1 / 3600;

function rasterFixture({
  width = 25,
  height = 25,
  originLongitude = 110,
  originLatitude = 31,
  values,
  geographicType = 4326,
  verticalType = 3855,
  rasterType = 2,
  sampleFormat = 3,
  bitsPerSample = 32,
  pixelDegrees = PIXEL_DEGREES,
}) {
  const typed = values ?? new Float32Array(width * height).fill(100);
  return Buffer.from(writeArrayBuffer(typed, {
    width,
    height,
    ModelPixelScale: [pixelDegrees, pixelDegrees, 0],
    ModelTiepoint: [0, 0, 0, originLongitude, originLatitude, 0],
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: rasterType,
    GeographicTypeGeoKey: geographicType,
    ...(verticalType === null ? {} : { VerticalCSTypeGeoKey: verticalType }),
    SampleFormat: [sampleFormat],
    BitsPerSample: [bitsPerSample],
    SamplesPerPixel: 1,
    PhotometricInterpretation: 1,
    GDAL_NODATA: '-32767',
  }));
}

function candidateAtCenter(pixelDegrees = PIXEL_DEGREES) {
  return {
    latitude: 31 - ((12.5) * pixelDegrees),
    longitude: 110 + ((12.5) * pixelDegrees),
  };
}

test('Copernicus tile descriptor is deterministic and points at the public COG', () => {
  assert.equal(COP_DEM_ADAPTER_VERSION, 'cop-dem-glo30-v1');
  assert.deepEqual(
    copDemTileDescriptor({ latitude: 43.793232, longitude: 88.344441 }),
    {
      tile_id: 'Copernicus_DSM_COG_10_N43_00_E088_00_DEM',
      url: 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N43_00_E088_00_DEM/Copernicus_DSM_COG_10_N43_00_E088_00_DEM.tif',
    },
  );
  assert.deepEqual(
    worldCoverTileDescriptor({ latitude: 43.793232, longitude: 88.344441 }),
    {
      tile_id: 'ESA_WorldCover_10m_2021_v200_N42E087_Map',
      url: 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N42E087_Map.tif',
    },
  );
});

test('DEM adapter derives the geodesic sample window from original GeoTIFF bytes', async () => {
  const values = new Float32Array(25 * 25).fill(100);
  values[(12 * 25) + 12] = 125;
  const sourceBytes = rasterFixture({ values });
  const candidate = candidateAtCenter();
  const result = await deriveCopDemWindow(sourceBytes, {
    candidate,
    radius_m: 300,
  });

  assert.equal(result.adapter_version, COP_DEM_ADAPTER_VERSION);
  assert.equal(result.source_sha256, createHash('sha256').update(sourceBytes).digest('hex'));
  assert.equal(result.tile_metadata.horizontal_epsg, 4326);
  assert.equal(result.tile_metadata.vertical_epsg, 3855);
  assert.equal(result.tile_metadata.raster_type, 'pixel_is_point');
  assert.equal(result.samples.length > 100, true);
  assert.equal(Math.max(...result.samples.map((sample) => sample.elevation_m)), 125);
  assert.equal(
    result.samples.every((sample) => sample.candidate_distance_m <= 300),
    true,
  );

  const repeated = await deriveCopDemWindow(sourceBytes, {
    candidate,
    radius_m: 300,
  });
  assert.deepEqual(repeated, result);
});

test('DEM adapter rejects wrong CRS, vertical datum, and PixelIsArea data', async () => {
  const candidate = candidateAtCenter();
  await assert.rejects(
    deriveCopDemWindow(rasterFixture({ geographicType: 4490 }), {
      candidate,
      radius_m: 300,
    }),
    /EPSG:4326/,
  );
  await assert.rejects(
    deriveCopDemWindow(rasterFixture({ verticalType: 5773 }), {
      candidate,
      radius_m: 300,
    }),
    /EPSG:3855/,
  );
  await assert.rejects(
    deriveCopDemWindow(rasterFixture({ rasterType: 1 }), {
      candidate,
      radius_m: 300,
    }),
    /PixelIsPoint/,
  );
  const missingVerticalKey = rasterFixture({ verticalType: null });
  await assert.rejects(
    deriveCopDemWindow(missingVerticalKey, {
      candidate,
      radius_m: 300,
    }),
    /bound official tile URL/,
  );
  const boundProductSpec = await deriveCopDemWindow(missingVerticalKey, {
    candidate,
    radius_m: 300,
    source_url: copDemTileDescriptor(candidate).url,
  });
  assert.equal(boundProductSpec.tile_metadata.embedded_vertical_epsg, null);
  assert.equal(
    boundProductSpec.tile_metadata.vertical_datum_basis,
    'bound_cop_dem_product_spec',
  );
});

test('WorldCover adapter derives bare and forest surface regimes from raster bytes', async () => {
  assert.equal(WORLD_COVER_ADAPTER_VERSION, 'esa-worldcover-2021-v1');
  const worldCoverPixelDegrees = 1 / 10800;
  const candidate = candidateAtCenter(worldCoverPixelDegrees);
  const bare = await deriveWorldCoverSurfaceContext(
    rasterFixture({
      values: new Uint8Array(25 * 25).fill(60),
      sampleFormat: 1,
      bitsPerSample: 8,
      verticalType: 3855,
      pixelDegrees: worldCoverPixelDegrees,
    }),
    { candidate, radius_m: 300, ledger_altitude_m: 5500 },
  );
  assert.equal(bare.surface_regime, 'high_elevation_bare_or_snow');
  assert.equal(bare.class_shares.bare_or_sparse + bare.class_shares.snow_or_ice, 1);

  const forest = await deriveWorldCoverSurfaceContext(
    rasterFixture({
      values: new Uint8Array(25 * 25).fill(10),
      sampleFormat: 1,
      bitsPerSample: 8,
      verticalType: 3855,
      pixelDegrees: worldCoverPixelDegrees,
    }),
    { candidate, radius_m: 300, ledger_altitude_m: 344.4 },
  );
  assert.equal(forest.surface_regime, 'low_elevation_tree_cover');
  assert.equal(forest.class_shares.tree_cover, 1);

  const missingAltitude = await deriveWorldCoverSurfaceContext(
    rasterFixture({
      values: new Uint8Array(25 * 25).fill(60),
      sampleFormat: 1,
      bitsPerSample: 8,
      verticalType: 3855,
      pixelDegrees: worldCoverPixelDegrees,
    }),
    { candidate, radius_m: 300, ledger_altitude_m: null },
  );
  assert.equal(missingAltitude.surface_regime, 'unknown_or_mixed');
});

test('DSM local maximum is conclusive only for the high bare/snow regime', async () => {
  const values = new Float32Array(25 * 25).fill(100);
  values[(12 * 25) + 12] = 125;
  const demWindow = await deriveCopDemWindow(rasterFixture({ values }), {
    candidate: candidateAtCenter(),
    radius_m: 300,
  });

  const highBare = evaluateDemLocalMaximum(demWindow, {
    surface_regime: 'high_elevation_bare_or_snow',
  });
  assert.equal(highBare.status, 'passed');
  assert.equal(highBare.details.thresholds.distance_m, 45);
  assert.equal(highBare.details.thresholds.elevation_gap_m, 8);

  const lowForest = evaluateDemLocalMaximum(demWindow, {
    surface_regime: 'low_elevation_tree_cover',
  });
  assert.equal(lowForest.status, 'inconclusive');
  assert.equal(lowForest.details.reason, 'dsm_canopy_or_structure_contamination');

  const lowVegetatedOrBuilt = evaluateDemLocalMaximum(demWindow, {
    surface_regime: 'low_elevation_vegetated_or_built',
  });
  assert.equal(lowVegetatedOrBuilt.status, 'inconclusive');

  const unknown = evaluateDemLocalMaximum(demWindow, {
    surface_regime: 'unknown_or_mixed',
  });
  assert.equal(unknown.status, 'inconclusive');
});

test('pilot summary keeps high-bare and low-forest denominators separate', () => {
  const summary = summarizeDemPilotBySurfaceRegime([
    {
      effective_canonical_key: 'high-pass',
      surface_regime: 'high_elevation_bare_or_snow',
      known_summit_truth: true,
      verdict: 'passed',
    },
    {
      effective_canonical_key: 'high-fail',
      surface_regime: 'high_elevation_bare_or_snow',
      known_summit_truth: true,
      verdict: 'failed',
    },
    {
      effective_canonical_key: 'low-forest',
      surface_regime: 'low_elevation_tree_cover',
      known_summit_truth: false,
      verdict: 'inconclusive',
    },
  ]);

  assert.deepEqual(summary.high_elevation_bare_or_snow, {
    known_truth_count: 2,
    false_rejection_count: 1,
    false_rejection_rate: 0.5,
    inconclusive_count: 0,
  });
  assert.deepEqual(summary.low_elevation_tree_cover, {
    known_truth_count: 0,
    false_rejection_count: 0,
    false_rejection_rate: null,
    inconclusive_count: 1,
  });
  assert.deepEqual(summary.low_elevation_forest_or_vegetated, {
    known_truth_count: 0,
    false_rejection_count: 0,
    false_rejection_rate: null,
    inconclusive_count: 1,
  });
  assert.equal('combined_false_rejection_rate' in summary, false);
});
