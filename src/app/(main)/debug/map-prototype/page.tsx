import { redirect } from 'next/navigation'
import MapPrototypeClient from '@/components/map/MapPrototypeClient'
import { canAccessOnboardingDebugTools } from '@/lib/onboarding-debug'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type HuashanReviewAsset = {
  objectPath: string
  bytes: number
  minZoom: number
  maxZoom: number
  bboxKm: number
  bbox: [number, number, number, number]
}

const HUASHAN_CENTER = [110.0877, 34.4869] as const
const HUASHAN_ROUTE_CENTER = [110.051, 34.4625] as const
const HUASHAN_ROUTE_KM = 10.15

const HUASHAN_REVIEW_ASSET: HuashanReviewAsset = {
  objectPath: 'basemap/huashan-bbox30-z9-12.pmtiles',
  bytes: 649_374,
  minZoom: 9,
  maxZoom: 12,
  bboxKm: 30,
  bbox: [109.924223, 34.352153, 110.251177, 34.621647],
}

function getMapTilesPublicUrlForPath(objectPath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL for map tile public URL.')
  }

  return `${supabaseUrl}/storage/v1/object/public/map-tiles/${objectPath}`
}

function formatPreciseMapTilesSize(bytes: number) {
  const kib = bytes / 1024
  const mib = kib / 1024

  return mib >= 1 ? `${mib.toFixed(2)} MiB` : `${kib.toFixed(1)} KiB`
}

function buildMapPrototypeReviewScript() {
  const cumulativeBytes = HUASHAN_REVIEW_ASSET.bytes * 300
  const config = {
    tileUrl: getMapTilesPublicUrlForPath(HUASHAN_REVIEW_ASSET.objectPath),
    tileSizeLabel: formatPreciseMapTilesSize(HUASHAN_REVIEW_ASSET.bytes),
    cumulativeLabel: formatPreciseMapTilesSize(cumulativeBytes),
    asset: HUASHAN_REVIEW_ASSET,
    center: HUASHAN_CENTER,
    routeCenter: HUASHAN_ROUTE_CENTER,
    routeKm: HUASHAN_ROUTE_KM,
    routeViewportRatio: `${((HUASHAN_ROUTE_KM / HUASHAN_REVIEW_ASSET.bboxKm) * 100).toFixed(1)}%`,
    bboxLabel: `${HUASHAN_REVIEW_ASSET.bbox[0].toFixed(4)}, ${HUASHAN_REVIEW_ASSET.bbox[1].toFixed(4)} → ${HUASHAN_REVIEW_ASSET.bbox[2].toFixed(4)}, ${HUASHAN_REVIEW_ASSET.bbox[3].toFixed(4)}`,
  }

  return `
(() => {
  const config = ${JSON.stringify(config)};
  const routeCoordinates = [
    [110.0120, 34.4380],
    [110.0250, 34.4490],
    [110.0360, 34.4450],
    [110.0460, 34.4600],
    [110.0560, 34.4580],
    [110.0650, 34.4740],
    [110.0780, 34.4810],
    [110.0877, 34.4869]
  ];
  const routeSource = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routeCoordinates },
        properties: { name: '华山 10km 示例轨迹' }
      }
    ]
  };
  const endpointSource = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: routeCoordinates[0] },
        properties: { label: '起', name: '示例起点' }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: routeCoordinates[routeCoordinates.length - 1] },
        properties: { label: '终', name: '示例终点' }
      }
    ]
  };
  let initialized = false;
  let reviewPanel;
  let dataPanel;
  let zoomValue;
  let fitZoomValue;
  let viewportValue;
  let containerValue;
  let aspectValue;
  let resetButton;
  let resizeTimer;
  let lastFitZoom = null;

  function getPrototype() {
    return window.__peakTrekkerMapPrototype;
  }

  function createReviewPanel() {
    if (reviewPanel) return;
    const toolbar = document.querySelector('.map-prototype__toolbar');
    if (!toolbar) return;

    reviewPanel = document.createElement('div');
    reviewPanel.setAttribute('data-map-dynamic-zoom-review', 'true');
    reviewPanel.style.display = 'grid';
    reviewPanel.style.gap = '10px';
    reviewPanel.style.width = '100%';
    reviewPanel.style.marginTop = '10px';

    const routeBadge = document.createElement('div');
    routeBadge.textContent = '华山 10km 示例轨迹 · 30km bbox · z=9-12 四层 · 1:1 容器';
    routeBadge.style.border = '1px solid rgba(0, 200, 83, 0.42)';
    routeBadge.style.background = 'rgba(0, 200, 83, 0.12)';
    routeBadge.style.color = '#7dffb0';
    routeBadge.style.borderRadius = '999px';
    routeBadge.style.padding = '7px 11px';
    routeBadge.style.fontSize = '12px';
    routeBadge.style.fontWeight = '800';
    routeBadge.style.width = 'fit-content';

    resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset to full bbox';
    resetButton.setAttribute('data-map-reset-bounds', 'true');
    resetButton.style.border = '1px solid rgba(255,255,255,0.18)';
    resetButton.style.borderRadius = '999px';
    resetButton.style.minHeight = '36px';
    resetButton.style.padding = '0 14px';
    resetButton.style.background = 'rgba(255,255,255,0.08)';
    resetButton.style.color = 'rgba(245,247,248,0.9)';
    resetButton.style.fontWeight = '800';
    resetButton.style.cursor = 'pointer';
    resetButton.style.width = 'fit-content';

    dataPanel = document.createElement('div');
    dataPanel.setAttribute('data-map-dynamic-zoom-panel', 'true');
    dataPanel.style.display = 'grid';
    dataPanel.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
    dataPanel.style.gap = '8px';
    dataPanel.style.width = '100%';
    dataPanel.style.border = '1px solid rgba(255,255,255,0.12)';
    dataPanel.style.borderRadius = '16px';
    dataPanel.style.background = 'rgba(8, 16, 20, 0.74)';
    dataPanel.style.padding = '10px';

    resetButton.addEventListener('click', () => {
      const prototype = getPrototype();
      if (prototype?.map) {
        fitToReviewBounds(prototype.map);
      }
    });

    reviewPanel.append(routeBadge, resetButton, dataPanel);
    toolbar.appendChild(reviewPanel);
  }

  function addRouteLayers(map) {
    if (!map.getSource('review-route-line')) {
      map.addSource('review-route-line', { type: 'geojson', data: routeSource });
    }
    if (!map.getLayer('review-route-line-halo')) {
      map.addLayer({
        id: 'review-route-line-halo',
        type: 'line',
        source: 'review-route-line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 7,
          'line-opacity': 0.74
        }
      });
    }
    if (!map.getLayer('review-route-line')) {
      map.addLayer({
        id: 'review-route-line',
        type: 'line',
        source: 'review-route-line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#00C853',
          'line-width': 4,
          'line-opacity': 0.98
        }
      });
    }
    if (!map.getSource('review-route-endpoints')) {
      map.addSource('review-route-endpoints', { type: 'geojson', data: endpointSource });
    }
    if (!map.getLayer('review-route-endpoint-circles')) {
      map.addLayer({
        id: 'review-route-endpoint-circles',
        type: 'circle',
        source: 'review-route-endpoints',
        paint: {
          'circle-radius': 10,
          'circle-color': '#00C853',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    }
    if (!map.getLayer('review-route-endpoint-labels')) {
      map.addLayer({
        id: 'review-route-endpoint-labels',
        type: 'symbol',
        source: 'review-route-endpoints',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Noto Sans Bold'],
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#102014',
          'text-halo-color': '#ffffff',
          'text-halo-width': 0.6
        }
      });
    }
  }

  function getReviewBounds() {
    const bbox = config.asset.bbox;
    return [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
  }

  function calculateFitZoom(map) {
    const camera = map.cameraForBounds(getReviewBounds(), { padding: 0 });
    const rawZoom = typeof camera?.zoom === 'number' ? camera.zoom : config.asset.minZoom;
    return Math.min(rawZoom, config.asset.maxZoom);
  }

  function getMapContainerMetrics(map) {
    const container = map.getContainer();
    const rect = container.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const ratio = height > 0 ? width / height : 0;

    return {
      label: width + ' × ' + height + ' px',
      aspect: ratio > 0 ? ratio.toFixed(2) + ':1' : '...',
    };
  }

  function updateZoomPanel(map) {
    const container = getMapContainerMetrics(map);

    dataPanel.innerHTML = [
      ['当前 zoom', '<span data-map-current-zoom>' + map.getZoom().toFixed(2) + '</span>'],
      ['fitZoom', '<span data-map-fit-zoom>' + (lastFitZoom === null ? '...' : lastFitZoom.toFixed(2)) + '</span>'],
      ['视口尺寸', '<span data-map-viewport-size>' + window.innerWidth + ' × ' + window.innerHeight + ' px</span>'],
      ['地图容器', '<span data-map-container-size>' + container.label + '</span>'],
      ['容器比例', '<span data-map-container-aspect>' + container.aspect + '</span>'],
      ['bbox 范围', config.bboxLabel],
      ['bbox 物理范围', config.asset.bboxKm + 'km × ' + config.asset.bboxKm + 'km'],
      ['单包大小', config.tileSizeLabel],
      ['300 山峰估算', config.cumulativeLabel + ' · per-mountain bbox30 z9-12'],
      ['轨迹占比', config.routeKm + 'km / ' + config.asset.bboxKm + 'km = ' + config.routeViewportRatio],
      ['zoom 边界', 'min=fitZoom · max=z' + config.asset.maxZoom],
      ['对象路径', config.asset.objectPath],
    ].map(([label, value]) => (
      '<div style="display:grid;gap:3px;min-width:0;">' +
        '<span style="font-size:11px;color:rgba(245,247,248,0.54);font-weight:800;text-transform:uppercase;letter-spacing:0;">' + label + '</span>' +
        '<strong style="font-size:12px;color:rgba(245,247,248,0.92);line-height:1.35;word-break:break-word;">' + value + '</strong>' +
      '</div>'
    )).join('');
    zoomValue = dataPanel.querySelector('[data-map-current-zoom]');
    fitZoomValue = dataPanel.querySelector('[data-map-fit-zoom]');
    viewportValue = dataPanel.querySelector('[data-map-viewport-size]');
    containerValue = dataPanel.querySelector('[data-map-container-size]');
    aspectValue = dataPanel.querySelector('[data-map-container-aspect]');
    document.documentElement.setAttribute('data-map-review-mode', 'huashan-bbox30-z9-12');
    document.documentElement.setAttribute('data-map-review-min-zoom', lastFitZoom === null ? '' : lastFitZoom.toFixed(2));
    document.documentElement.setAttribute('data-map-review-max-zoom', String(config.asset.maxZoom));
  }

  function syncLiveReadouts(map) {
    const container = getMapContainerMetrics(map);

    if (zoomValue) zoomValue.textContent = map.getZoom().toFixed(2);
    if (fitZoomValue) fitZoomValue.textContent = lastFitZoom === null ? '...' : lastFitZoom.toFixed(2);
    if (viewportValue) viewportValue.textContent = window.innerWidth + ' × ' + window.innerHeight + ' px';
    if (containerValue) containerValue.textContent = container.label;
    if (aspectValue) aspectValue.textContent = container.aspect;
  }

  function fitToReviewBounds(map) {
    map.setMaxBounds(null);
    map.fitBounds(getReviewBounds(), { padding: 0, animate: false });
    syncLiveReadouts(map);
  }

  function applyDynamicZoomBounds(map, shouldFit) {
    lastFitZoom = calculateFitZoom(map);
    updateZoomPanel(map);
    map.setMaxBounds(null);
    map.setMinZoom(0);
    map.setMaxZoom(config.asset.maxZoom);
    map.setMinZoom(lastFitZoom);
    if (shouldFit) {
      fitToReviewBounds(map);
      map.setMaxBounds(map.getBounds());
    } else if (map.getZoom() < lastFitZoom) {
      map.jumpTo({ zoom: lastFitZoom });
      map.setMaxBounds(map.getBounds());
    } else {
      map.setMaxBounds(map.getBounds());
    }
    syncLiveReadouts(map);
  }

  function initializeReview() {
    const prototype = getPrototype();
    const map = prototype?.map;
    if (!map || initialized) return false;
    initialized = true;
    createReviewPanel();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();
    map.doubleClickZoom.enable();
    map.keyboard.enable();
    map.boxZoom.enable();
    document.querySelectorAll('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out').forEach((control) => {
      control.removeAttribute('aria-disabled');
      control.removeAttribute('disabled');
      control.style.pointerEvents = '';
      control.style.opacity = '';
    });
    addRouteLayers(map);
    applyDynamicZoomBounds(map, true);
    map.on('zoom', () => syncLiveReadouts(map));
    map.on('moveend', () => syncLiveReadouts(map));
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        map.resize();
        applyDynamicZoomBounds(map, true);
      }, 150);
    });
    window.__peakTrekkerMapPrototypeReview = {
      fitToBounds: () => fitToReviewBounds(map),
      setZoom: (zoom) => {
        map.jumpTo({ center: config.routeCenter, zoom: Math.max(lastFitZoom || config.asset.minZoom, Math.min(config.asset.maxZoom, Number(zoom))) });
        syncLiveReadouts(map);
      },
      getReviewState: () => ({
        zoom: map.getZoom(),
        fitZoom: lastFitZoom,
        maxZoom: config.asset.maxZoom,
        bounds: config.asset.bbox,
        tileUrl: config.tileUrl,
        objectPath: config.asset.objectPath,
        bytes: config.asset.bytes
      }),
      routeCoordinates,
      routeKm: config.routeKm
    };
    return true;
  }

  const timer = window.setInterval(() => {
    if (initializeReview()) {
      window.clearInterval(timer);
    }
  }, 250);
  window.setTimeout(() => window.clearInterval(timer), 30000);
})();
`
}

export default async function MapPrototypePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?from=/debug/map-prototype')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const canAccess = canAccessOnboardingDebugTools({
    email: user.email,
    isAdmin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
  })

  if (!canAccess) {
    redirect('/profile')
  }

  return (
    <>
      <MapPrototypeClient
        tileUrl={getMapTilesPublicUrlForPath(HUASHAN_REVIEW_ASSET.objectPath)}
        tileObjectPath={HUASHAN_REVIEW_ASSET.objectPath}
        tileSizeLabel={formatPreciseMapTilesSize(HUASHAN_REVIEW_ASSET.bytes)}
        tileMaxZoom={HUASHAN_REVIEW_ASSET.maxZoom}
        buildLabel="per-mountain bbox30 z9-12"
      />
      <script dangerouslySetInnerHTML={{ __html: buildMapPrototypeReviewScript() }} />
    </>
  )
}
