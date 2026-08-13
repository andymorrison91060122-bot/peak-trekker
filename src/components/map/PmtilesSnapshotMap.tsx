'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { LngLatBoundsLike, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import type { MapTileAsset, MapTileFlavor } from '@/lib/map/map-assets'

type PmtilesSnapshotMapProps = {
  asset: MapTileAsset
  ariaLabel: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
  fitBbox?: MapTileAsset['bbox']
  interactive?: boolean
  forceError?: boolean
  onReady?: () => void
  onMapReady?: (map: MapLibreMap, metrics: PmtilesSnapshotMapMetrics) => void
  onError?: (error: Error) => void
}

export type PmtilesSnapshotMapMetrics = {
  zoomLevel: number | null
  fitZoom: number | null
  maxBoundsLocked: boolean
  interactiveEnabled: boolean
  navigationControlPresent: boolean
}

export type PmtilesSnapshotMapHandle = {
  zoomIn: () => void
  zoomOut: () => void
  fitBounds: () => void
  getMapMetrics: () => PmtilesSnapshotMapMetrics
}

let pmtilesProtocolRegistered = false

type SymbolStyleLayer = Extract<StyleSpecification['layers'][number], { type: 'symbol' }>

const PEAK_ONLY_LABEL_LAYER_ID = 'pois_peak'

function buildPeakOnlyLabelLayer(layer: StyleSpecification['layers'][number]): SymbolStyleLayer | null {
  if (layer.id !== 'pois' || layer.type !== 'symbol') return null

  const layout = { ...layer.layout }
  delete layout['icon-image']
  delete layout['text-offset']
  delete layout['text-variable-anchor']

  return {
    ...layer,
    id: PEAK_ONLY_LABEL_LAYER_ID,
    filter: [
      'all',
      ['==', ['get', 'kind'], 'peak'],
      ['>=', ['zoom'], ['+', ['get', 'min_zoom'], 0]],
    ],
    layout,
  }
}

function buildMinimalBasemapStyle(
  tileUrl: string,
  basemaps: typeof import('@protomaps/basemaps'),
  flavorName: MapTileFlavor = 'dark',
): StyleSpecification {
  const allowedLayerIds = new Set([
    'background',
    'earth',
    'landcover',
    'landuse_park',
    'landuse_urban_green',
    'landuse_beach',
    'water',
    'water_stream',
    'water_river',
    'roads_major_casing_late',
    'roads_highway_casing_late',
    'roads_major_casing_early',
    'roads_major',
    'roads_highway_casing_early',
    'roads_highway',
    'roads_rail',
    'boundaries_country',
    'boundaries',
    'water_waterway_label',
    'water_label_ocean',
    'earth_label_islands',
    'water_label_lakes',
    'places_region',
    'places_locality',
    'places_subplace',
    'places_country',
    'roads_labels_major',
    'roads_labels_minor',
  ])
  const baseLayers = basemaps
    .layers('protomaps', basemaps.namedFlavor(flavorName), { lang: 'zh' })
    .flatMap((layer) => {
      if (allowedLayerIds.has(layer.id)) return [layer]
      const peakLabelLayer = buildPeakOnlyLabelLayer(layer)
      return peakLabelLayer ? [peakLabelLayer] : []
    })

  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${tileUrl}`,
        attribution: '© OpenStreetMap contributors · Protomaps',
      },
    },
    layers: baseLayers,
  }
}

function bboxCenter(bbox: MapTileAsset['bbox']): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function toBoundsLike(bbox: MapTileAsset['bbox']): LngLatBoundsLike {
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]],
  ]
}

function enableProductInteractions(map: MapLibreMap) {
  map.scrollZoom.enable()
  map.touchZoomRotate.enable()
  map.doubleClickZoom.enable()
  map.keyboard.enable()
  map.boxZoom.enable()
}

function applyFitLockSequence(map: MapLibreMap, bbox: MapTileAsset['bbox'], maxZoom: number, fallbackZoom: number) {
  const bounds = toBoundsLike(bbox)
  const camera = map.cameraForBounds(bounds, { padding: 0 })
  const rawZoom = typeof camera?.zoom === 'number' ? camera.zoom : fallbackZoom
  const fitZoom = Math.min(rawZoom, maxZoom)

  map.setMaxBounds(null)
  map.fitBounds(bounds, { padding: 0, animate: false })
  map.setMinZoom(0)
  map.setMaxZoom(maxZoom)
  map.setMinZoom(fitZoom)
  map.setMaxBounds(map.getBounds())

  return fitZoom
}

const emptyMetrics: PmtilesSnapshotMapMetrics = {
  zoomLevel: null,
  fitZoom: null,
  maxBoundsLocked: false,
  interactiveEnabled: false,
  navigationControlPresent: false,
}

const PmtilesSnapshotMap = forwardRef<PmtilesSnapshotMapHandle, PmtilesSnapshotMapProps>(function PmtilesSnapshotMap({
  asset,
  ariaLabel,
  children,
  className,
  style,
  fitBbox,
  interactive = true,
  forceError = false,
  onReady,
  onMapReady,
  onError,
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const errorReportedRef = useRef(false)
  const fitZoomRef = useRef<number | null>(null)
  const onReadyRef = useRef(onReady)
  const onMapReadyRef = useRef(onMapReady)
  const onErrorRef = useRef(onError)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [metrics, setMetrics] = useState<PmtilesSnapshotMapMetrics>(emptyMetrics)
  const targetBbox = fitBbox ?? asset.bbox

  useEffect(() => {
    onReadyRef.current = onReady
    onMapReadyRef.current = onMapReady
    onErrorRef.current = onError
  }, [onError, onMapReady, onReady])

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      mapRef.current?.zoomIn()
    },
    zoomOut: () => {
      mapRef.current?.zoomOut()
    },
    fitBounds: () => {
      const map = mapRef.current
      if (!map) return
      const nextFitZoom = applyFitLockSequence(map, targetBbox, asset.maxZoom, asset.minZoom)
      fitZoomRef.current = nextFitZoom
      setMetrics({
        zoomLevel: map.getZoom(),
        fitZoom: nextFitZoom,
        maxBoundsLocked: true,
        interactiveEnabled: interactive,
        navigationControlPresent: true,
      })
    },
    getMapMetrics: () => ({
      ...metrics,
      zoomLevel: mapRef.current?.getZoom() ?? metrics.zoomLevel,
      fitZoom: fitZoomRef.current ?? metrics.fitZoom,
    }),
  }), [asset.maxZoom, asset.minZoom, interactive, metrics, targetBbox])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false
    let loadTimer: ReturnType<typeof setTimeout> | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    const reportError = (error: Error) => {
      if (cancelled || errorReportedRef.current) return
      errorReportedRef.current = true
      setStatus('error')
      setMetrics((current) => ({ ...current, maxBoundsLocked: false }))
      onErrorRef.current?.(error)
    }

    const publishMetrics = (map: MapLibreMap, fitZoom: number, navigationControlPresent: boolean) => {
      const nextMetrics = {
        zoomLevel: map.getZoom(),
        fitZoom,
        maxBoundsLocked: true,
        interactiveEnabled: interactive,
        navigationControlPresent,
      }
      setMetrics(nextMetrics)
      return nextMetrics
    }

    async function initializeMap() {
      try {
        if (forceError) {
          throw new Error('forced_pmtiles_snapshot_error')
        }

        const [{ default: maplibregl }, { Protocol }, basemaps] = await Promise.all([
          import('maplibre-gl'),
          import('pmtiles'),
          import('@protomaps/basemaps'),
        ])

        if (cancelled || !containerRef.current) return

        if (!pmtilesProtocolRegistered) {
          const protocol = new Protocol()
          try {
            maplibregl.addProtocol('pmtiles', protocol.tile)
          } catch (error) {
            if (!String(error).includes('already exists')) throw error
          }
          pmtilesProtocolRegistered = true
        }

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildMinimalBasemapStyle(asset.url, basemaps, asset.flavor),
          center: bboxCenter(asset.bbox),
          zoom: 0,
          minZoom: 0,
          maxZoom: asset.maxZoom,
          interactive,
          attributionControl: false,
        })
        mapRef.current = map
        if (interactive) enableProductInteractions(map)
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')

        loadTimer = setTimeout(() => {
          reportError(new Error('pmtiles_snapshot_load_timeout'))
        }, 12_000)

        map.on('load', () => {
          if (loadTimer) clearTimeout(loadTimer)
          if (cancelled) return
          const nextFitZoom = applyFitLockSequence(map, targetBbox, asset.maxZoom, asset.minZoom)
          fitZoomRef.current = nextFitZoom
          const nextMetrics = publishMetrics(map, nextFitZoom, true)
          setStatus('ready')
          onReadyRef.current?.()
          onMapReadyRef.current?.(map, nextMetrics)
        })

        map.on('moveend', () => {
          if (cancelled || errorReportedRef.current) return
          setMetrics((current) => ({ ...current, zoomLevel: map.getZoom() }))
        })

        const handleResize = () => {
          if (resizeTimer) clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => {
            if (cancelled || !mapRef.current) return
            const nextFitZoom = applyFitLockSequence(mapRef.current, targetBbox, asset.maxZoom, asset.minZoom)
            fitZoomRef.current = nextFitZoom
            publishMetrics(mapRef.current, nextFitZoom, true)
          }, 150)
        }

        window.addEventListener('resize', handleResize)
        map.once('remove', () => {
          window.removeEventListener('resize', handleResize)
        })

        map.on('error', (event) => {
          reportError(event.error ?? new Error('pmtiles_snapshot_map_error'))
        })
      } catch (error) {
        reportError(error instanceof Error ? error : new Error('pmtiles_snapshot_initialize_error'))
      }
    }

    void initializeMap()

    return () => {
      cancelled = true
      if (loadTimer) clearTimeout(loadTimer)
      if (resizeTimer) clearTimeout(resizeTimer)
      mapRef.current?.remove()
      mapRef.current = null
      errorReportedRef.current = false
    }
  }, [asset.bbox, asset.flavor, asset.maxZoom, asset.minZoom, asset.url, forceError, interactive, targetBbox])

  return (
    <div
      className={className}
      data-map-status={status}
      data-zoom-level={metrics.zoomLevel === null ? '' : metrics.zoomLevel.toFixed(2)}
      data-fit-zoom={metrics.fitZoom === null ? '' : metrics.fitZoom.toFixed(2)}
      data-max-bounds-locked={metrics.maxBoundsLocked ? 'true' : 'false'}
      data-interactive-enabled={metrics.interactiveEnabled ? 'true' : 'false'}
      data-navigation-control-present={metrics.navigationControlPresent ? 'true' : 'false'}
      role="img"
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 58% 38%, color-mix(in srgb, var(--color-surface-elevated) 78%, transparent), var(--color-surface) 76%)',
        ...style,
      }}
    >
      <div ref={containerRef} aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      {children}
    </div>
  )
})

export default PmtilesSnapshotMap
