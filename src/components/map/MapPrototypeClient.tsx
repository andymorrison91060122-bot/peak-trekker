'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, MapLayerMouseEvent, Popup, StyleSpecification } from 'maplibre-gl'
import type { MountainFeatureCollection, MountainPointFeature } from '@/lib/map/mountain-geojson'

type MapPrototypeClientProps = {
  tileUrl: string
  tileObjectPath: string
  tileSizeLabel: string
  tileMaxZoom: number
  buildDate: string
}

type LoadStatus = 'loading' | 'ready' | 'error'

type MapMetrics = {
  markerCount: number
  loadMs: number | null
}

let pmtilesProtocolRegistered = false

type MapPrototypeWindow = Window & {
  __peakTrekkerMapPrototype?: {
    map: MapLibreMap
    geojson: MountainFeatureCollection
  }
}

function buildMinimalBasemapStyle(
  tileUrl: string,
  basemaps: typeof import('@protomaps/basemaps'),
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
    'places_country',
  ])
  const baseLayers = basemaps
    .layers('protomaps', basemaps.namedFlavor('light'), { lang: 'zh' })
    .filter((layer) => allowedLayerIds.has(layer.id))

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

function featureLabel(feature: MountainPointFeature) {
  const altitude = feature.properties.altitude === null
    ? '海拔未知'
    : `${Math.round(feature.properties.altitude)}m`
  const difficulty = feature.properties.difficulty ?? '难度待补'
  return `<strong>${feature.properties.name}</strong><span>${altitude} · ${difficulty}</span>`
}

export default function MapPrototypeClient({
  tileUrl,
  tileObjectPath,
  tileSizeLabel,
  tileMaxZoom,
  buildDate,
}: MapPrototypeClientProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [metrics, setMetrics] = useState<MapMetrics>({ markerCount: 0, loadMs: null })
  const [selectedMountain, setSelectedMountain] = useState<MountainPointFeature | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false
    const startedAt = performance.now()

    async function initializeMap() {
      try {
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
            if (!String(error).includes('already exists')) {
              throw error
            }
          }
          pmtilesProtocolRegistered = true
        }

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildMinimalBasemapStyle(tileUrl, basemaps),
          center: [104.2, 35.8],
          zoom: 3.2,
          minZoom: 2.4,
          maxZoom: tileMaxZoom,
          attributionControl: { compact: true },
        })
        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')

        map.on('load', async () => {
          try {
            const response = await fetch('/api/mountains/geojson')
            if (!response.ok) {
              throw new Error(`GeoJSON request failed with ${response.status}`)
            }
            const geojson = await response.json() as MountainFeatureCollection
            if (cancelled) return

            map.addSource('mountains', {
              type: 'geojson',
              data: geojson,
            })
            map.addLayer({
              id: 'mountain-points-glow',
              type: 'circle',
              source: 'mountains',
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 7, 14],
                'circle-color': '#ff7a45',
                'circle-opacity': 0.18,
                'circle-blur': 0.35,
              },
            })
            map.addLayer({
              id: 'mountain-points',
              type: 'circle',
              source: 'mountains',
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 7, 7],
                'circle-color': '#f85f36',
                'circle-stroke-color': '#fff7ed',
                'circle-stroke-width': 1.5,
              },
            })
            map.addLayer({
              id: 'mountain-labels',
              type: 'symbol',
              source: 'mountains',
              minzoom: 4.2,
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 12,
                'text-offset': [0, 1.15],
                'text-anchor': 'top',
              },
              paint: {
                'text-color': '#18212f',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.2,
              },
            })

            const popup = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              className: 'map-prototype-popup',
            })
            popupRef.current = popup

            map.on('mouseenter', 'mountain-points', (event: MapLayerMouseEvent) => {
              map.getCanvas().style.cursor = 'pointer'
              const feature = event.features?.[0] as MountainPointFeature | undefined
              if (!feature) return
              popup
                .setLngLat(feature.geometry.coordinates)
                .setHTML(featureLabel(feature))
                .addTo(map)
            })

            map.on('mouseleave', 'mountain-points', () => {
              map.getCanvas().style.cursor = ''
              popup.remove()
            })

            map.on('click', 'mountain-points', (event: MapLayerMouseEvent) => {
              const feature = event.features?.[0] as MountainPointFeature | undefined
              if (!feature) return
              setSelectedMountain(feature)
            })

            setMetrics({
              markerCount: geojson.features.length,
              loadMs: Math.round(performance.now() - startedAt),
            })
            ;(window as MapPrototypeWindow).__peakTrekkerMapPrototype = { map, geojson }
            setStatus('ready')
          } catch (error) {
            console.error('[map-prototype] failed to load mountain GeoJSON', error)
            setErrorMessage(error instanceof Error ? error.message : '山峰点位加载失败')
            setStatus('error')
          }
        })

        map.on('error', (event) => {
          console.error('[map-prototype] map error', event.error)
          setErrorMessage(event.error?.message ?? '地图加载失败')
          setStatus('error')
        })
      } catch (error) {
        console.error('[map-prototype] failed to initialize map', error)
        setErrorMessage(error instanceof Error ? error.message : '地图加载失败')
        setStatus('error')
      }
    }

    void initializeMap()

    return () => {
      cancelled = true
      popupRef.current?.remove()
      popupRef.current = null
      delete (window as MapPrototypeWindow).__peakTrekkerMapPrototype
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [tileMaxZoom, tileUrl])

  return (
    <main className="map-prototype" data-map-status={status}>
      <section className="map-prototype__hero" aria-labelledby="map-prototype-title">
        <div>
          <p className="map-prototype__eyebrow">MapLibre + PMTiles 基建验证</p>
          <h1 id="map-prototype-title">自托管山峰参考地图</h1>
          <p>
            地图仅作轻量参考，当前验证 Supabase Storage PMTiles 底图、20+ 座山峰 GeoJSON 点位和移动端布局。
          </p>
        </div>
        <dl className="map-prototype__stats" aria-label="地图资源状态">
          <div>
            <dt>PMTiles</dt>
            <dd>{tileSizeLabel}</dd>
          </div>
          <div>
            <dt>Max zoom</dt>
            <dd>z{tileMaxZoom}</dd>
          </div>
          <div>
            <dt>Markers</dt>
            <dd data-testid="map-prototype-marker-count">{metrics.markerCount}</dd>
          </div>
          <div>
            <dt>Load</dt>
            <dd>{metrics.loadMs === null ? '...' : `${metrics.loadMs}ms`}</dd>
          </div>
        </dl>
      </section>

      <section className="map-prototype__shell" aria-label="地图原型">
        <div className="map-prototype__toolbar">
          <div>
            <span className={`map-prototype__status map-prototype__status--${status}`}>
              {status === 'ready' ? 'ready' : status === 'loading' ? 'loading' : 'error'}
            </span>
            <span>Build {buildDate}</span>
          </div>
          <code>{tileObjectPath}</code>
        </div>
        <div ref={containerRef} className="map-prototype__canvas" data-testid="map-prototype-canvas" />
        {status === 'error' ? (
          <div className="map-prototype__error" role="alert">
            地图暂时无法加载：{errorMessage}
          </div>
        ) : null}
      </section>

      <section className="map-prototype__detail" aria-label="选中山峰">
        <div>
          <h2>点位交互</h2>
          <p>悬停查看山名，点击固定当前点位。后续子 sprint 会接入 Mountain Detail、Trek 和 Activity。</p>
        </div>
        <div className="map-prototype__selected" data-testid="map-prototype-selected">
          {selectedMountain ? (
            <>
              <strong>{selectedMountain.properties.name}</strong>
              <span>
                {selectedMountain.properties.altitude === null
                  ? '海拔未知'
                  : `${Math.round(selectedMountain.properties.altitude)}m`}
                {' · '}
                {selectedMountain.properties.difficulty ?? '难度待补'}
              </span>
            </>
          ) : (
            <>
              <strong>尚未选择山峰</strong>
              <span>点击地图上的橙色点位查看详情</span>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
