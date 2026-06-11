import { buildShareTrackRender, SHARE_TRACK_CONTENT_FIT, SHARE_TRACK_RENDER_PROFILES, type ShareTrackPreview } from '../share-track-preview'
import type { ShareTemplateProps } from './types'
import {
  BrandFooter,
  C,
  MountainGlyph,
  PhotoLayer,
  PosterShell,
  buildMountainLine,
  formatDistance,
  formatPlainNumber,
  formatShareAltitude,
  hasShareTrackPoint,
  hasShareAltitude,
} from './shared'

export function PremiumVerticalStoryTemplate({ data, photoDataUrl }: ShareTemplateProps) {
  const mountainLine = buildMountainLine(data)
  const showAltitude = hasShareAltitude(data)

  return (
    <PosterShell background="#0a0c0e">
      <PhotoLayer photoDataUrl={photoDataUrl} grayscale />
      {!photoDataUrl && hasShareTrackPoint(data.trackPreview) ? <VerticalStoryTrailSvg trackPreview={data.trackPreview} /> : null}
      {!photoDataUrl && !hasShareTrackPoint(data.trackPreview) ? <VerticalStoryRidgeSvg /> : null}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 520,
          background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.42) 46%, rgba(10,12,14,0.82) 100%)',
        }}
      />

      <div style={{ display: 'flex', position: 'absolute', left: 58, right: 58, top: 66, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <MountainGlyph size={34} />
          <span style={{ color: C.fg, fontSize: 26, lineHeight: 1, fontWeight: 800 }}>Peak Trekker</span>
        </div>
        {data.visibleFields.date && data.date ? <span style={{ color: C.fg2, fontSize: 24, lineHeight: 1, fontWeight: 800 }}>{data.date}</span> : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 58, right: 58, bottom: 310 }}>
        {mountainLine ? <span style={{ color: C.fg, fontSize: 42, lineHeight: 1.2, fontWeight: 800 }}>{mountainLine}</span> : null}
        {showAltitude ? <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 24 }}>
          <span style={{ color: C.success, fontSize: 120, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
          <span style={{ color: C.success, fontSize: 46, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>m</span>
        </div> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 80, right: 80, bottom: 198, height: 58, alignItems: 'center', justifyContent: 'center' }}>
        {showAltitude ? <StoryStat icon="pin" value={formatShareAltitude(data)} unit="m" /> : null}
        <StoryStat icon="mountain" value={formatDistance(data.distance)} unit="km" separator={showAltitude} />
        {data.visibleFields.duration ? <StoryStat icon="clock" value={data.duration || '--'} separator /> : null}
        {data.visibleFields.elevationGain ? <StoryStat icon="arrow" value={formatPlainNumber(data.elevationGain)} unit="m" separator /> : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 64 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}

function StoryStat({
  icon,
  value,
  unit,
  separator = false,
}: {
  icon: 'pin' | 'mountain' | 'clock' | 'arrow'
  value: string
  unit?: string
  separator?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '25%',
        height: 44,
        borderLeft: separator ? '2px solid rgba(245,247,248,.24)' : '0px solid transparent',
      }}
    >
      <StoryIcon kind={icon} />
      <span style={{ color: C.fg, fontSize: 26, lineHeight: 1, fontWeight: 800, marginLeft: 10 }}>{value}</span>
      {unit ? <span style={{ color: C.fg2, fontSize: 17, lineHeight: 1, fontWeight: 800, marginLeft: 4 }}>{unit}</span> : null}
    </div>
  )
}

function StoryIcon({ kind }: { kind: 'pin' | 'mountain' | 'clock' | 'arrow' }) {
  if (kind === 'mountain') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
        <path d="M3 19l5-9 4 6 3-4 6 7" stroke={C.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  if (kind === 'clock') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
        <circle cx="12" cy="12" r="8" stroke={C.fg} strokeWidth="2" fill="none" />
        <path d="M12 7v5l3 2" stroke={C.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  if (kind === 'arrow') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
        <path d="M6 18L18 6M10 6h8v8" stroke={C.fg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M12 21s7-5.2 7-12a7 7 0 0 0-14 0c0 6.8 7 12 7 12z" stroke={C.fg} strokeWidth="2" fill="none" />
      <circle cx="12" cy="9" r="2.5" fill={C.fg} />
    </svg>
  )
}

function VerticalStoryTrailSvg({ trackPreview }: { trackPreview?: ShareTrackPreview | null }) {
  const route = buildShareTrackRender(trackPreview, {
    x: 230,
    y: 390,
    width: 620,
    height: 620,
    padding: 74,
    ...SHARE_TRACK_CONTENT_FIT,
  }, SHARE_TRACK_RENDER_PROFILES.verticalStory)

  if (!route) return null

  return (
    <svg
      width="1080"
      height="1920"
      viewBox="0 0 1080 1920"
      data-testid="premium-vertical-story-trail"
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      {route.d ? (
        <>
          <path
            data-real-track="true"
            d={route.d}
            stroke={C.success}
            strokeWidth={route.glowWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={route.glowOpacity}
            vectorEffect="non-scaling-stroke"
          />
          <path
            data-real-track="true"
            d={route.d}
            stroke={C.success}
            strokeWidth={route.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity=".86"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
      <circle data-real-track="true" cx={route.start.x} cy={route.start.y} r={route.startRadius} fill={C.bgDeep} stroke={C.success} strokeWidth={route.startStrokeWidth} />
      {route.d ? <circle data-real-track="true" cx={route.end.x} cy={route.end.y} r={route.endRadius} fill={C.success} /> : null}
    </svg>
  )
}

function VerticalStoryRidgeSvg() {
  return (
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', left: 0, top: 0, opacity: 0.42 }}>
      <path d="M-80 1280 L120 1070 L260 1140 L455 895 L640 1170 L805 980 L1160 1288" stroke={C.fg} strokeWidth="5" fill="none" opacity=".36" />
      <path d="M-80 1395 L152 1168 L314 1250 L508 1016 L710 1344 L892 1150 L1160 1468" stroke={C.fg} strokeWidth="3" fill="none" opacity=".24" />
      <path d="M-100 1530 L130 1320 L346 1458 L570 1238 L765 1574 L936 1390 L1160 1648" stroke={C.fg} strokeWidth="2" fill="none" opacity=".16" />
      {Array.from({ length: 10 }).map((_, index) => (
        <path
          key={index}
          d={`M${-60 + index * 120} 1620 C ${60 + index * 110} 1340 ${165 + index * 88} 1080 ${292 + index * 62} 820`}
          stroke={C.fg}
          strokeWidth="1.4"
          fill="none"
          opacity=".08"
        />
      ))}
    </svg>
  )
}
