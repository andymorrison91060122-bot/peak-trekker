'use client'

import type { FocusEvent, PointerEvent } from 'react'
import { useMemo } from 'react'
import { BrandTile } from '@/components/brand/BrandTile'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { BackIcon, ShareIcon } from '@/components/ui/Icons'
import type { PersistedScreenshotRouteShape } from '@/lib/screenshot-route-shape'
import {
  buildShareTrackRender,
  buildShareTrackPreviewFromScreenshotRouteShape,
  SHARE_TRACK_CONTENT_FIT,
  SHARE_TRACK_RENDER_PROFILES,
} from '@/lib/share-track-preview'
import type { ShareTrackPreview } from '@/lib/share-track-preview'

type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

function ArchiveRouteMedallion({
  routeShape,
  trackPreview,
}: {
  routeShape?: PersistedScreenshotRouteShape | null
  trackPreview?: ShareTrackPreview | null
}) {
  const preview = useMemo(
    () => trackPreview ?? buildShareTrackPreviewFromScreenshotRouteShape(routeShape),
    [routeShape, trackPreview]
  )
  const route = useMemo(() => buildShareTrackRender(preview, {
    x: 35,
    y: 35,
    width: 118,
    height: 118,
    padding: 14,
    ...SHARE_TRACK_CONTENT_FIT,
  }, SHARE_TRACK_RENDER_PROFILES.archiveMedallion), [preview])

  if (!route) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 35,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--color-success)',
        }}
      >
        <BrandTile size={118} sourceSet="large" />
      </div>
    )
  }

  return (
    <svg
      width="188"
      height="188"
      viewBox="0 0 188 188"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0 }}
    >
      {route.d ? (
        <>
          <path
            d={route.d}
            stroke="var(--color-success)"
            strokeWidth={route.glowWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={route.glowOpacity}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={route.d}
            stroke="var(--color-success)"
            strokeWidth={route.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
      <circle cx={route.start.x} cy={route.start.y} r={route.startRadius} fill="var(--color-surface)" stroke="var(--color-success)" strokeWidth={route.startStrokeWidth} />
      {route.d ? <circle cx={route.end.x} cy={route.end.y} r={route.endRadius} fill="var(--color-success)" /> : null}
    </svg>
  )
}

export type ArchiveCreationSuccessProps = {
  title: string
  values: readonly [string, string, string]
  routeShape?: PersistedScreenshotRouteShape | null
  trackPreview?: ShareTrackPreview | null
  onShare: () => void
  onViewArchive: () => void
}

const STAT_LABELS = ['总距离', '时长', '爬升'] as const

export default function ArchiveCreationSuccess({
  title,
  values,
  routeShape = null,
  trackPreview = null,
  onShare,
  onViewArchive,
}: ArchiveCreationSuccessProps) {
  return (
    <div
      data-testid="archive-creation-success"
      style={{
        height: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        inset: 0,
        background:
          'radial-gradient(120% 80% at 50% 28%, color-mix(in srgb, var(--color-success) 12%, #11201a) 0%, #0b0d0f 58%, #08090a 100%)',
        color: 'var(--color-on-surface)',
        padding: '0 28px',
        overflow: 'hidden',
        position: 'fixed',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style>
        {`
          @keyframes screenshotArchiveRot { to { transform: rotate(360deg); } }
          @keyframes screenshotArchiveBadgeIn {
            from { opacity: 0; transform: translateY(18px) scale(.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes screenshotArchiveSeal {
            to { stroke-dashoffset: 0; }
          }
          @keyframes screenshotArchiveFadeUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-screenshot-archive-animated] { animation: none !important; }
          }
        `}
      </style>
      <button
        type="button"
        className="pt-pressable"
        data-archive-creation-return
        onClick={onViewArchive}
        aria-label="返回活动"
        onPointerDown={markPressFallback}
        onPointerUp={clearPressFallback}
        onPointerCancel={clearPressFallback}
        onPointerLeave={clearPressFallback}
        onBlur={clearPressFallback}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 50px)',
          left: 10,
          zIndex: 5,
          width: 44,
          height: 44,
          display: 'grid',
          placeItems: 'center',
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-on-surface)',
          cursor: 'pointer',
        }}
      >
        <BackIcon size={22} />
      </button>

      <svg
        width="320"
        height="320"
        viewBox="0 0 320 320"
        data-screenshot-archive-animated
        style={{
          position: 'absolute',
          top: '18%',
          opacity: 0.16,
          animation: 'screenshotArchiveRot 26s linear infinite',
        }}
      >
        <circle
          cx="160"
          cy="160"
          r="150"
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="1"
          strokeDasharray="2 10"
        />
      </svg>

      <main
        data-archive-creation-content
        data-screenshot-archive-animated
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          animation: 'screenshotArchiveBadgeIn .7s cubic-bezier(.2,.8,.2,1) both',
        }}
      >
        <div
          data-archive-creation-medallion
          data-archive-creation-route-source={trackPreview ? 'import' : routeShape ? 'screenshot' : 'fallback'}
          data-testid={routeShape ? 'screenshot-archive-route-medallion' : 'screenshot-archive-text-medallion'}
          style={{
            position: 'relative',
            width: 188,
            height: 188,
          }}
        >
          <svg width="188" height="188" viewBox="0 0 188 188" fill="none" aria-hidden="true">
            <circle cx="94" cy="94" r="88" fill="color-mix(in srgb, var(--color-success) 4%, transparent)" stroke="var(--color-outline)" strokeWidth="1" />
            <circle
              cx="94"
              cy="94"
              r="80"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="2.4"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset="1"
              strokeLinecap="round"
              transform="rotate(-90 94 94)"
              data-screenshot-archive-animated
              style={{ animation: 'screenshotArchiveSeal 1.1s .25s cubic-bezier(.4,0,.2,1) forwards' }}
            />
            {Array.from({ length: 24 }).map((_, index) => {
              const angle = (index / 24) * Math.PI * 2
              const outerRadius = 70
              const innerRadius = index % 6 === 0 ? 62 : 66
              return (
                <line
                  key={index}
                  x1={94 + Math.cos(angle) * outerRadius}
                  y1={94 + Math.sin(angle) * outerRadius}
                  x2={94 + Math.cos(angle) * innerRadius}
                  y2={94 + Math.sin(angle) * innerRadius}
                  stroke="var(--color-success)"
                  strokeWidth="1"
                  opacity="0.35"
                />
              )
            })}
          </svg>
          <ArchiveRouteMedallion routeShape={routeShape} trackPreview={trackPreview} />
        </div>

        <section
          data-screenshot-archive-animated
          style={{
            marginTop: 22,
            animation: 'screenshotArchiveFadeUp .5s .7s both',
          }}
        >
          <h1
            style={{
              margin: 0,
              color: 'var(--color-on-surface)',
              fontSize: 19,
              lineHeight: 1.22,
              fontWeight: 800,
              letterSpacing: 0,
            }}
          >
            {title}
          </h1>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 14 }}>
            {STAT_LABELS.map((label, index) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    color: 'var(--color-on-surface)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 18,
                    lineHeight: 1,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {values[index]}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: 'var(--color-on-surface-variant)',
                    fontSize: 9.5,
                    lineHeight: 1,
                    fontWeight: 600,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div
          data-screenshot-archive-animated
          style={{
            marginTop: 26,
            textAlign: 'center',
            animation: 'screenshotArchiveFadeUp .5s 1s both',
          }}
        >
          <div style={{ color: 'var(--color-success)', fontSize: 14.5, lineHeight: 1.35, fontWeight: 700 }}>
            已归档到你的山行档案
          </div>
        </div>
      </main>

      <div
        data-screenshot-archive-animated
        data-archive-creation-cta
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
          display: 'grid',
          gap: 'var(--space-3)',
          animation: 'screenshotArchiveFadeUp .5s 1.3s both',
        }}
      >
        <PrimaryButton
          className="pt-pressable-hero"
          data-archive-creation-action="share"
          onClick={onShare}
          style={{ width: '100%' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            去分享
            <ShareIcon size={17} />
          </span>
        </PrimaryButton>
        <SecondaryButton
          data-archive-creation-action="view"
          onClick={onViewArchive}
          style={{ width: '100%' }}
        >
          查看档案
        </SecondaryButton>
      </div>
    </div>
  )
}
