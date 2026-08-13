import assert from 'node:assert/strict'
import crypto from 'node:crypto'

export const MAP_VIEWPORT_PX = 343
export const MAP_RUNTIME_VIEWPORT_ASPECT = 16 / 11
export const PRODUCT_MAX_ZOOM = 15
export const TILE_SIZE_PX = 512
export const COVERAGE_PADDING_RATIO = 0.095238
export const COVERAGE_PADDING_MAX_METERS = 3_000

const EARTH_RADIUS_METERS = 6_378_137
const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_RADIUS_METERS
const MAX_MERCATOR_LATITUDE = 85.0511287798066

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  )
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function clampLatitude(latitude) {
  return Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude))
}

export function lngLatToMercatorMeters(longitude, latitude) {
  assert(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180)
  assert(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90)
  const clampedLatitude = clampLatitude(latitude)
  return [
    EARTH_RADIUS_METERS * longitude * Math.PI / 180,
    EARTH_RADIUS_METERS
      * Math.log(Math.tan(Math.PI / 4 + clampedLatitude * Math.PI / 360)),
  ]
}

export function mercatorMetersToLngLat(x, y) {
  return [
    x / EARTH_RADIUS_METERS * 180 / Math.PI,
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2)
      * 180
      / Math.PI,
  ]
}

function collectRoutePoints(rows) {
  const points = []
  for (const row of rows) {
    assert.equal(row.review_status, 'approved', `pending geometry is forbidden: ${row.id}`)
    assert.equal(row.display_mode, 'map', `non-map geometry is forbidden: ${row.id}`)
    const geometry = row.simplified_geometry
    assert.equal(geometry?.type, 'MultiLineString', `invalid geometry type: ${row.id}`)
    assert(Array.isArray(geometry.coordinates), `missing coordinates: ${row.id}`)
    for (const segment of geometry.coordinates) {
      assert(Array.isArray(segment) && segment.length > 0, `empty segment: ${row.id}`)
      for (const point of segment) {
        assert(Array.isArray(point) && point.length >= 2, `invalid point: ${row.id}`)
        const longitude = Number(point[0])
        const latitude = Number(point[1])
        assert(Number.isFinite(longitude) && Number.isFinite(latitude), `non-finite point: ${row.id}`)
        points.push([longitude, latitude])
      }
    }
  }
  assert(points.length >= 2, 'route must contain at least two points')
  return points
}

function mercatorBbox(points) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [longitude, latitude] of points) {
    const [x, y] = lngLatToMercatorMeters(longitude, latitude)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

function lngLatBbox(points) {
  return [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1])),
  ]
}

function zoomForMercatorSpan(spanMeters, viewportPixels = MAP_VIEWPORT_PX) {
  const normalizedSpan = spanMeters / EARTH_CIRCUMFERENCE_METERS
  return Math.log2(viewportPixels / (TILE_SIZE_PX * normalizedSpan))
}

function lngLatBboxFromMercator([minX, minY, maxX, maxY]) {
  const [west, south] = mercatorMetersToLngLat(minX, minY)
  const [east, north] = mercatorMetersToLngLat(maxX, maxY)
  return [west, south, east, north]
}

export function buildCoveragePlan(
  rows,
  { runtimeViewportAspect = MAP_RUNTIME_VIEWPORT_ASPECT } = {},
) {
  assert(Number.isFinite(runtimeViewportAspect) && runtimeViewportAspect > 0)
  const points = collectRoutePoints(rows)
  const routeBbox = lngLatBbox(points)
  const [minX, minY, maxX, maxY] = mercatorBbox(points)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const aspectSpanMeters = Math.max(maxX - minX, maxY - minY)
  assert(aspectSpanMeters > 0, 'route bbox has zero spatial extent')
  const paddingPerSideMeters = Math.min(
    aspectSpanMeters * COVERAGE_PADDING_RATIO,
    COVERAGE_PADDING_MAX_METERS,
  )
  const initialCoverageSpanMeters = aspectSpanMeters + 2 * paddingPerSideMeters
  const rawBaseZoom = zoomForMercatorSpan(initialCoverageSpanMeters)
  const ceilingSpanMeters =
    EARTH_CIRCUMFERENCE_METERS
    * MAP_VIEWPORT_PX
    / (TILE_SIZE_PX * 2 ** PRODUCT_MAX_ZOOM)
  const finalCoverageSpanMeters =
    rawBaseZoom > PRODUCT_MAX_ZOOM
      ? ceilingSpanMeters
      : initialCoverageSpanMeters
  const halfSpan = finalCoverageSpanMeters / 2
  const finalCoverageBbox = lngLatBboxFromMercator([
    centerX - halfSpan,
    centerY - halfSpan,
    centerX + halfSpan,
    centerY + halfSpan,
  ])
  const effectiveBaseZoom = Math.min(
    PRODUCT_MAX_ZOOM,
    zoomForMercatorSpan(finalCoverageSpanMeters),
  )
  const userMaxZoom = Math.min(effectiveBaseZoom + 2, PRODUCT_MAX_ZOOM)
  const runtimeViewportPixels = MAP_VIEWPORT_PX / Math.max(1, runtimeViewportAspect)
  const runtimeFitZoom = zoomForMercatorSpan(
    finalCoverageSpanMeters,
    runtimeViewportPixels,
  )
  const packageMinZoom = Math.min(
    Math.floor(effectiveBaseZoom),
    Math.floor(runtimeFitZoom),
  )
  const packageMaxZoom = Math.min(Math.ceil(userMaxZoom), PRODUCT_MAX_ZOOM)

  for (const [longitude, latitude] of points) {
    assert(
      longitude >= finalCoverageBbox[0]
        && longitude <= finalCoverageBbox[2]
        && latitude >= finalCoverageBbox[1]
        && latitude <= finalCoverageBbox[3],
      'route point escaped final coverage bbox',
    )
  }

  return {
    routeBbox,
    finalCoverageBbox,
    rawBaseZoom,
    effectiveBaseZoom,
    userMinZoom: effectiveBaseZoom,
    userMaxZoom,
    runtimeFitZoom,
    packageMinZoom,
    packageMaxZoom,
    aspectSpanMeters,
    paddingPerSideMeters,
    zoomCeilingExpansionMeters:
      finalCoverageSpanMeters - initialCoverageSpanMeters,
  }
}

function hasValidRouteGeometry(row) {
  if (row.review_status !== 'approved') return false
  const coordinates = row.simplified_geometry?.coordinates
  if (row.simplified_geometry?.type !== 'MultiLineString' || !Array.isArray(coordinates)) {
    return false
  }
  const points = coordinates.flatMap((segment) => (Array.isArray(segment) ? segment : []))
  if (points.length < 2) return false
  const valid = points.every((point) => (
    Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(Number(point[0]))
    && Number.isFinite(Number(point[1]))
  ))
  if (!valid) return false
  const longitudes = points.map((point) => Number(point[0]))
  const latitudes = points.map((point) => Number(point[1]))
  return Math.min(...longitudes) < Math.max(...longitudes)
    || Math.min(...latitudes) < Math.max(...latitudes)
}

export function auditMapAssetCoverage({
  rows,
  assets,
  jobs = [],
  packageExists = () => false,
}) {
  const approvedMountainIds = new Set(
    rows.filter((row) => row.review_status === 'approved').map((row) => row.mountain_id),
  )
  const validRows = rows.filter(hasValidRouteGeometry)
  const validByMountain = new Map()
  for (const row of validRows) {
    const current = validByMountain.get(row.mountain_id) ?? []
    current.push(row)
    validByMountain.set(row.mountain_id, current)
  }
  const jobsByMountain = new Map(jobs.map((job) => [job.mountainId, job]))
  const missing = []
  for (const [mountainId, mountainRows] of validByMountain) {
    if (assets[mountainId]) continue
    let reason = 'registry_missing'
    if (mountainRows.every((row) => row.display_mode === 'trace_only')) {
      reason = 'trace_only'
    } else {
      const job = jobsByMountain.get(mountainId)
      if (job && !packageExists(job.localPath)) reason = 'package_missing'
      else if (job && job.status !== 'remote_validated') reason = 'upload_missing'
    }
    missing.push({ mountainId, reason })
  }
  missing.sort((left, right) => left.mountainId.localeCompare(right.mountainId))
  return {
    approvedValidRouteMountainCount: validByMountain.size,
    registryMapCount: Object.keys(assets).length,
    missingCount: missing.length,
    invalidGeometryCount: approvedMountainIds.size - validByMountain.size,
    missing,
  }
}

function normalizedGeometry(row) {
  return {
    id: row.id,
    sourceFileSha256: row.source_file_sha256,
    displayMode: row.display_mode,
    coordinates: row.simplified_geometry.coordinates.map((segment) =>
      segment.map((point) => point.map((value) => Number(value))),
    ),
  }
}

export function computeRouteRevision(mountainId, rows) {
  const geometries = [...rows]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(normalizedGeometry)
  return sha256(stableJson({ mountainId, geometries }))
}

export function computeFingerprint({
  mountainId,
  routeRevision,
  generatorVersion,
  basemapSourceVersion,
}) {
  return sha256(stableJson({
    mountainId,
    routeRevision,
    generatorVersion,
    basemapSourceVersion,
  }))
}

export function normalizeApprovedSnapshot(rows) {
  const map = []
  const traceOnly = []
  for (const row of rows) {
    assert.equal(
      row.review_status,
      'approved',
      `pending geometry is forbidden: ${row.id}`,
    )
    if (row.display_mode === 'map') map.push(row)
    else if (row.display_mode === 'trace_only') traceOnly.push(row)
    else throw new Error(`unsupported display mode: ${row.display_mode}`)
  }
  return { map, traceOnly }
}

export function selectRunnableJobs(jobs, { resume = false } = {}) {
  if (!resume) return jobs.filter((job) => job.status === 'pending')
  return jobs.filter((job) => ['pending', 'failed'].includes(job.status))
}

export function buildRegistryProjection({ existingAssets, jobs }) {
  const assets = structuredClone(existingAssets)
  for (const job of jobs) {
    if (job.status !== 'remote_validated') continue
    assets[job.mountainId] = {
      id: `mountain-${job.fingerprint.slice(0, 16)}`,
      fingerprint: job.fingerprint,
      routeRevision: job.routeRevision,
      generatorVersion: job.generatorVersion,
      basemapSourceVersion: job.basemapSourceVersion,
      objectPath: job.objectPath,
      minZoom: job.packageMinZoom,
      maxZoom: job.packageMaxZoom,
      bbox: job.finalCoverageBbox,
      flavor: 'dark',
      sizeBytes: job.bytes,
    }
  }
  return Object.fromEntries(
    Object.entries(assets).sort(([left], [right]) => left.localeCompare(right)),
  )
}

export function summarizeRemoteUploadJobs(jobs) {
  const aggregate = {
    attempted: 0,
    uploaded: 0,
    skipped: 0,
    uploadFailed: 0,
    remoteVerified: 0,
    remoteVerifiedBytes: 0,
  }

  for (const job of jobs) {
    const remoteUpload = job.remoteUpload
    if (remoteUpload?.attempted) aggregate.attempted += 1
    if (remoteUpload?.disposition === 'uploaded') aggregate.uploaded += 1
    if (remoteUpload?.disposition === 'skipped') aggregate.skipped += 1
    if (job.status === 'failed' && job.failureStage === 'upload') aggregate.uploadFailed += 1
    if (remoteUpload?.remoteVerified) {
      aggregate.remoteVerified += 1
      if (Number.isFinite(remoteUpload.remoteVerifiedBytes)) {
        aggregate.remoteVerifiedBytes += remoteUpload.remoteVerifiedBytes
      }
    }
  }

  return aggregate
}

export function recordRemoteUploadWriteResult(remoteUpload, error) {
  if (error) return false
  remoteUpload.disposition = 'uploaded'
  return true
}

function assertValidRegistryBbox(mountainId, bbox) {
  assert(Array.isArray(bbox) && bbox.length === 4, `invalid bbox: ${mountainId}`)
  const [west, south, east, north] = bbox
  assert(
    [west, south, east, north].every(Number.isFinite)
      && west >= -180
      && east <= 180
      && south >= -90
      && north <= 90
      && west < east
      && south < north,
    `invalid bbox: ${mountainId}`,
  )
}

export function assertRegisterReady({
  jobs,
  existingAssets,
  assets,
  productMaxZoom,
  sourceMapCount,
  manifestSchemaVersion = 'mountain-map-batch-manifest-v1',
  registrySchemaVersion = 'mountain-map-assets-v1',
}) {
  assert.equal(manifestSchemaVersion, 'mountain-map-batch-manifest-v1', 'invalid batch manifest schema')
  assert.equal(registrySchemaVersion, 'mountain-map-assets-v1', 'invalid asset registry schema')
  assert.equal(
    new Set(jobs.map((job) => job.mountainId)).size,
    jobs.length,
    'mountainId must be unique',
  )
  assert(
    jobs.every((job) => job.status === 'remote_validated'),
    'all selected jobs must be remote_validated',
  )
  assert.equal(jobs.filter((job) => job.status === 'failed').length, 0, 'failed must equal 0')

  const assetEntries = Object.entries(assets)
  const isFullBatch = jobs.length === sourceMapCount
  const selectedIds = new Set(jobs.map((job) => job.mountainId))
  if (isFullBatch) {
    assert.deepEqual(
      assetEntries.map(([mountainId]) => mountainId).sort(),
      [...selectedIds].sort(),
      'registry mountainIds must exactly match the full batch',
    )
  } else {
    assert(jobs.length < sourceMapCount, 'selected jobs exceed source map count')
    const expectedIds = new Set([...Object.keys(existingAssets), ...selectedIds])
    assert.deepEqual(
      assetEntries.map(([mountainId]) => mountainId).sort(),
      [...expectedIds].sort(),
      'incremental registry entry count or IDs mismatch',
    )
    for (const [mountainId, existingAsset] of Object.entries(existingAssets)) {
      if (selectedIds.has(mountainId)) continue
      assert.deepEqual(
        assets[mountainId],
        existingAsset,
        `unselected registry asset changed: ${mountainId}`,
      )
    }
  }

  const objectPaths = new Set()
  for (const job of jobs) {
    const asset = assets[job.mountainId]
    assert(asset && !asset.legacy, `missing selected registry asset: ${job.mountainId}`)
    assert.equal(asset.objectPath, job.objectPath, `object path mismatch: ${job.mountainId}`)
    assert(asset.objectPath && !objectPaths.has(asset.objectPath), `duplicate object path: ${asset.objectPath}`)
    objectPaths.add(asset.objectPath)
    assertValidRegistryBbox(job.mountainId, asset.bbox)
    assert.equal(asset.minZoom, job.packageMinZoom, `min zoom mismatch: ${job.mountainId}`)
    assert.equal(asset.maxZoom, job.packageMaxZoom, `max zoom mismatch: ${job.mountainId}`)
    assert(
      Number.isInteger(asset.minZoom)
        && Number.isInteger(asset.maxZoom)
        && asset.minZoom >= 0
        && asset.minZoom <= asset.maxZoom
        && asset.maxZoom <= productMaxZoom,
      `invalid zoom range: ${job.mountainId}`,
    )
    assert.equal(asset.routeRevision, job.routeRevision, `route revision mismatch: ${job.mountainId}`)
    assert.equal(asset.generatorVersion, job.generatorVersion, `generator version mismatch: ${job.mountainId}`)
    assert.equal(asset.basemapSourceVersion, job.basemapSourceVersion, `basemap version mismatch: ${job.mountainId}`)
    assert.equal(
      asset.fingerprint,
      computeFingerprint({
        mountainId: job.mountainId,
        routeRevision: asset.routeRevision,
        generatorVersion: asset.generatorVersion,
        basemapSourceVersion: asset.basemapSourceVersion,
      }),
      `registry fingerprint mismatch: ${job.mountainId}`,
    )
    assert.equal(asset.fingerprint, job.fingerprint, `job fingerprint mismatch: ${job.mountainId}`)
  }
}

export function assertFullBatchRegisterReady(options) {
  return assertRegisterReady({
    ...options,
    existingAssets: {},
    sourceMapCount: options.jobs.length,
  })
}
