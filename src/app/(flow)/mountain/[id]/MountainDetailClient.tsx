'use client'

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { CommunityPostViewModel, Mountain, User } from '@/types'
import type { Waypoint, WaypointType } from '@/lib/waypoints'
import { getDifficultySuitabilityCopy } from '@/lib/license-ui'
import { BackIcon, CheckIcon, MoreIcon, PinIcon, ShareIcon, WarnIcon } from '@/components/ui/Icons'
import { HelpTrigger } from '@/components/help/HelpTrigger'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import EmptyState from '@/components/ui/EmptyState'
import WeatherSection from '@/components/mountain/WeatherSection'
import DifficultyAdvisory from '@/components/mountain/DifficultyAdvisory'
import DifficultyChip from '@/components/mountain/DifficultyChip'
import SanitizedMountainDescription, {
  stripTagsForFallback,
} from '@/components/mountain/SanitizedMountainDescription'
import LicenseProgressSheet from '@/components/profile/LicenseProgressSheet'
import type { LicenseProgressSummary } from '@/lib/license-progress'
import { formatMotionCountValue, formatMotionInteger as formatInteger, parseMotionTokenSeconds } from '@/lib/motion-count-format'
import { trackEvent } from '@/lib/analytics/client'
import { buildTrekUrl, consumePendingShareTemplate } from '@/lib/share-template-intent'
import { normalizeAuthReturnPath } from '@/lib/auth-redirect'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  buildMountainRiskCopy,
  getEstimatedAscentMeters,
  getEstimatedDurationRange,
  getMountainAccessDisplay,
  getMountainDisplayAltitude,
  getMountainDistanceKm,
} from '@/lib/mountain-route-display'
import {
  buildRouteTraceViewModel,
  type MountainRouteGeometry,
} from '@/lib/mountain-route-geometry'

gsap.registerPlugin(useGSAP)

type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

type MountainDetailClientProps = {
  mountain: Mountain
  userLicense: User['license_level']
  licenseProgress: LicenseProgressSummary
  requiresLogin: boolean
  waypoints: Waypoint[]
  routeGeometry: MountainRouteGeometry | null
  featuredPosts: CommunityPostViewModel[]
  heroImages: string[]
}

function getRouteFacts(mountain: Mountain) {
  return {
    length: getMountainDistanceKm(mountain),
    gain: getEstimatedAscentMeters(mountain),
    duration: getEstimatedDurationRange(mountain),
  }
}

function getSeasonDecision(mountain: Mountain) {
  const currentMonth = new Date().getMonth() + 1
  const highAltitude = (getMountainDisplayAltitude(mountain) ?? 0) >= 4000
  const inWindow = highAltitude
    ? currentMonth === 10 || currentMonth === 11
    : currentMonth >= 4 && currentMonth <= 10

  return {
    ok: inWindow,
    label: inWindow ? '季节窗口适合' : '当前不在推荐窗口',
    sub: highAltitude
      ? '高海拔路线通常 10–11 月更稳 · 出发前仍需复核天气'
      : '低中海拔路线通常 4–10 月更适合 · 雨季与大风天请谨慎',
  }
}

function getWaypointTone({
  waypoint,
  highestElevation,
}: {
  waypoint: Waypoint
  highestElevation: number | null
}) {
  const name = waypoint.name.toLowerCase()
  const summitName = name.includes('山顶') || name.includes('峰顶') || name.includes('summit')
  const highestPoint = typeof waypoint.elevation === 'number' && waypoint.elevation === highestElevation

  if (summitName || highestPoint) return 'success'
  if (waypoint.type === 'danger' || waypoint.type === 'turnaround') return 'warn'
  return 'ok'
}

function waypointTypeLabel(type: WaypointType) {
  switch (type) {
    case 'viewpoint':
      return '观景点'
    case 'supply':
      return '补给点'
    case 'turnaround':
      return '折返点'
    case 'campsite':
      return '营地'
    case 'danger':
      return '风险点'
    case 'transport':
      return '交通点'
    default:
      return '点位'
  }
}

function HeroIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="pt-pressable"
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
      style={{
        width: 44,
        height: 44,
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid color-mix(in srgb, var(--color-on-surface) 16%, transparent)',
        background: 'color-mix(in srgb, var(--color-surface) 72%, transparent)',
        color: 'var(--color-on-surface)',
        backdropFilter: 'blur(14px)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

function SectionHeader({
  title,
  right,
}: {
  title: string
  right?: ReactNode
}) {
  return (
    <div
      style={{
        padding: '18px 20px 10px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
      }}
    >
      <h2
        data-mountain-motion-child="section-title"
        style={{
          margin: 0,
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h2>
      {right ? (
        <span
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            whiteSpace: 'nowrap',
          }}
        >
          {right}
        </span>
      ) : null}
    </div>
  )
}

function StatTile({
  label,
  value,
  motionKind,
  countValue,
  countFormat,
  accent = false,
}: {
  label: string
  value: string
  motionKind: string
  countValue?: number
  countFormat?: 'integer' | 'decimal'
  accent?: boolean
}) {
  return (
    <div
      data-mountain-stat-tile={motionKind}
      style={{
        minWidth: 0,
        padding: 10,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
        background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
      }}
    >
      <div
        data-mountain-stat-value={motionKind}
        data-count-value={typeof countValue === 'number' ? String(countValue) : undefined}
        data-count-format={countFormat}
        data-final-text={value}
        style={{
          color: accent ? 'var(--color-success)' : 'var(--color-on-surface)',
          fontFamily: 'var(--font-mono)',
          fontSize: 16,
          lineHeight: '20px',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 3,
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function DecisionRow({
  tone,
  label,
  sub,
  last = false,
  helpAnchor,
}: {
  tone: 'ok' | 'warn' | 'neutral'
  label: string
  sub: string
  last?: boolean
  helpAnchor?: string
}) {
  const iconColor =
    tone === 'ok'
      ? 'var(--color-success)'
      : tone === 'warn'
        ? 'var(--color-warning)'
        : 'var(--color-on-surface-variant)'

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--color-outline)',
      }}
    >
      <span aria-hidden style={{ marginTop: 2, color: iconColor, flexShrink: 0 }}>
        {tone === 'warn' ? <WarnIcon size={18} /> : <CheckIcon size={18} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>{label}</span>
          {helpAnchor ? <HelpTrigger anchor={helpAnchor} size={14} style={{ width: 26, height: 26 }} /> : null}
        </div>
        <div
          style={{
            marginTop: 3,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            whiteSpace: 'pre-line',
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  )
}

function HeroSection({
  mountain,
  heroImages,
  onBack,
  onShare,
}: {
  mountain: Mountain
  heroImages: string[]
  onBack: () => void
  onShare: () => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const hasImages = heroImages.length > 0

  return (
    <section
      id="overview"
      data-testid="mountain-detail-hero"
      style={{
        position: 'relative',
        minHeight: 300,
        overflow: 'hidden',
        background: 'linear-gradient(145deg, var(--color-surface-elevated), var(--color-surface) 68%)',
      }}
    >
      {hasImages ? (
        <div
          data-testid="mountain-hero-carousel"
          data-active-index={activeIndex}
          onScroll={(event) => {
            const width = event.currentTarget.clientWidth || 1
            setActiveIndex(Math.round(event.currentTarget.scrollLeft / width))
          }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {heroImages.map((image, index) => (
            <div
              key={`${image}-${index}`}
              style={{
                flex: '0 0 100%',
                width: '100%',
                height: 300,
                scrollSnapAlign: 'center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-mountain-hero-visual
                src={image}
                alt={`${mountain.name} ${index + 1}`}
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden'
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div
        aria-hidden
        data-testid="mountain-hero-scrim"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 55%, transparent) 0%, transparent 40%, color-mix(in srgb, var(--color-surface) 88%, transparent) 100%)',
        }}
      />
      {!hasImages ? (
        <div
          data-mountain-hero-visual
          aria-hidden
          data-testid="mountain-hero-empty-decoration"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(circle at 72% 18%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 30%), linear-gradient(160deg, transparent 0%, color-mix(in srgb, var(--color-on-surface) 5%, transparent) 100%)',
          }}
        />
      ) : null}
      {heroImages.length > 1 ? (
        <div
          aria-hidden
          data-testid="mountain-hero-indicator"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 5,
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            pointerEvents: 'none',
          }}
        >
          {heroImages.map((image, index) => (
            <span
              key={`dot-${image}-${index}`}
              data-testid="mountain-hero-dot"
              style={{
                width: index === activeIndex ? 14 : 6,
                height: 6,
                borderRadius: 'var(--radius-pill)',
                background:
                  index === activeIndex
                    ? 'var(--color-on-surface)'
                    : 'color-mix(in srgb, var(--color-on-surface) 38%, transparent)',
                transition: 'width var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)',
              }}
            />
          ))}
        </div>
      ) : null}

      <div
        data-testid="mountain-hero-toolbar"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: 'max(env(safe-area-inset-top), var(--space-2)) 12px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <HeroIconButton label="返回" onClick={onBack}>
          <BackIcon size={20} />
        </HeroIconButton>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <HeroIconButton label="分享" onClick={onShare}>
            <ShareIcon size={20} />
          </HeroIconButton>
          <HeroIconButton label="更多操作">
            <MoreIcon size={20} />
          </HeroIconButton>
        </div>
      </div>

      <div
        data-mountain-motion="hero"
        style={{
          position: 'absolute',
          left: 'var(--space-4)',
          right: 'var(--space-4)',
          bottom: 'var(--space-4)',
          minWidth: 0,
        }}
      >
        <div data-mountain-hero-item="chip" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <DifficultyChip difficulty={mountain.difficulty} />
        </div>
        <h1
          data-mountain-hero-item="title"
          style={{
            margin: 0,
            color: 'var(--color-on-surface)',
            fontSize: 26,
            lineHeight: '30px',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            overflowWrap: 'anywhere',
          }}
        >
          {mountain.name}
        </h1>
        <div
          data-mountain-hero-item="location"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            color: 'color-mix(in srgb, var(--color-on-surface) 72%, transparent)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
          }}
        >
          <PinIcon size={14} />
          <span>{mountain.province}</span>
        </div>
      </div>
    </section>
  )
}

function DecisionSection({
  mountain,
  userLicense,
  requiresLogin,
  onShowLicenseSheet,
}: {
  mountain: Mountain
  userLicense: User['license_level']
  requiresLogin: boolean
  onShowLicenseSheet?: () => void
}) {
  const season = getSeasonDecision(mountain)
  const suitabilityCopy = getDifficultySuitabilityCopy(mountain.difficulty)
  const accessDisplay = getMountainAccessDisplay(mountain.access_status, mountain.entity_type)
  const isRoute = mountain.entity_type === 'route_corridor'
  const riskCopy = buildMountainRiskCopy(mountain.difficulty, mountain.risk_note)
  const accessCopy = mountain.access_note?.trim() || (
    accessDisplay.status === 'closed'
      ? `${isRoute ? '该路线' : '该山峰'}当前不开放，请勿擅自进入。开放范围以当地最新公告为准。`
      : accessDisplay.status === 'pilgrimage_only'
        ? '这里只开放转山环线，不提供登顶引导。请遵守当地管理要求。'
        : isRoute && accessDisplay.status === 'open'
          ? '该路线仅作行程参考，出发前仍需使用专业户外导航并复核当地最新路况。'
          : `${isRoute ? '路线' : '山峰'}开放状态尚未核实，请在出发前查询当地最新公告。`
  )

  return (
    <section data-testid="mountain-decision-section" data-mountain-motion="decision">
      <SectionHeader title={mountain.entity_type === 'route_corridor' ? '这条路线适不适合你' : '这座山适不适合你'} />
      <div style={{ padding: '0 var(--space-4)' }}>
        {accessDisplay.canStartTrek ? (
          <div data-mountain-motion-child="decision-advisory" style={{ marginBottom: 'var(--space-3)' }}>
            <DifficultyAdvisory
              difficulty={mountain.difficulty}
              userLicense={userLicense}
              mountainName={mountain.name}
              compact={requiresLogin}
              onShowLicenseSheet={requiresLogin ? undefined : onShowLicenseSheet}
            />
          </div>
        ) : null}
        <div
          data-mountain-motion-child="decision-card"
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {accessDisplay.canStartTrek ? (
            <DecisionRow
              tone="ok"
              label={requiresLogin ? '登录后可开始记录' : '始终可以继续记录'}
              sub={
                requiresLogin
                  ? '需要登录来保存 GPS 记录，但难度不会锁定入口'
                  : suitabilityCopy
              }
              helpAnchor="license.license-tiers"
            />
          ) : (
            <DecisionRow
              tone="warn"
              label={accessDisplay.suitabilityLabel ?? '开放状态待确认'}
              sub={accessCopy}
            />
          )}
          {accessDisplay.canStartTrek ? (
            <DecisionRow
              tone={season.ok ? 'ok' : 'warn'}
              label={season.label}
              sub={season.sub}
            />
          ) : null}
          <DecisionRow
            tone="warn"
            label="天气与路线仅供决策参考"
            sub={riskCopy ?? '不承诺实时路况 · 出发前请自行复核'}
            last
          />
        </div>
      </div>
    </section>
  )
}

function DescriptionSection({
  description,
  entityType,
}: {
  description: string | null | undefined
  entityType: Mountain['entity_type']
}) {
  const html = description ?? ''
  const fallbackText = stripTagsForFallback(html).trim()

  if (!fallbackText) return null

  return (
    <section data-testid="mountain-description-section" data-mountain-motion="description">
      <SectionHeader title={entityType === 'route_corridor' ? '路线简介' : '山峰简介'} />
      <div style={{ padding: '0 var(--space-4)' }}>
        <div
          data-mountain-motion-child="description-card"
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            padding: 14,
          }}
        >
          <SanitizedMountainDescription html={html} />
        </div>
      </div>
    </section>
  )
}

function WaypointSection({
  waypoints,
}: {
  waypoints: Waypoint[]
}) {
  const highestElevation = waypoints.reduce<number | null>((max, waypoint) => {
    if (typeof waypoint.elevation !== 'number') return max
    return max === null ? waypoint.elevation : Math.max(max, waypoint.elevation)
  }, null)

  return (
    <section id="waypoints" data-testid="mountain-waypoints-section" data-mountain-motion="waypoints">
      <SectionHeader title="关键点位与风险" />
      <div style={{ padding: '0 var(--space-4)' }}>
        <div
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            padding: '6px 0',
          }}
        >
          {waypoints.map((waypoint, index) => {
            const tone = getWaypointTone({ waypoint, highestElevation })
            const toneColor =
              tone === 'success'
                ? 'var(--color-success)'
                : tone === 'warn'
                  ? 'var(--color-warning)'
                  : 'var(--color-on-surface-variant)'
            const last = index === waypoints.length - 1

            return (
              <div
                data-mountain-motion-child="waypoint-row"
                key={waypoint.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '68px 16px minmax(0, 1fr)',
                  gap: 'var(--space-3)',
                  alignItems: 'flex-start',
                  padding: '10px 14px',
                }}
              >
                <div
                  style={{
                    paddingTop: 2,
                    color: tone === 'success' ? 'var(--color-success)' : 'var(--color-on-surface)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-label-m-size)',
                    lineHeight: 'var(--font-label-m-line)',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {waypoint.elevation === null ? '--' : `${formatInteger(waypoint.elevation)}m`}
                </div>
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'center',
                    paddingTop: 6,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 'var(--radius-pill)',
                      background: toneColor,
                      zIndex: 1,
                    }}
                  />
                  {!last ? (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: 14,
                        width: 1,
                        height: 32,
                        background: 'var(--color-outline)',
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: 'var(--color-on-surface)',
                      fontSize: 'var(--font-body-m-size)',
                      lineHeight: 'var(--font-body-m-line)',
                      fontWeight: 600,
                    }}
                  >
                    {waypoint.name}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      color: 'var(--color-on-surface-variant)',
                      fontSize: 'var(--font-label-m-size)',
                      lineHeight: 'var(--font-label-m-line)',
                    }}
                  >
                    {waypoint.description || waypointTypeLabel(waypoint.type)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function RouteUnavailable() {
  return (
    <section id="route" data-testid="mountain-route-section">
      <SectionHeader title="路线参考" right="未收录" />
      <div style={{ padding: '0 var(--space-4)' }}>
        <EmptyState
          data-mountain-route-card
          className="pt-empty-state--surface"
          size="sm"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6zM9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title="暂未收录参考轨迹"
          copy="可先查看路线说明与风险提示，具体行程请使用专业户外导航工具。"
        />
      </div>
    </section>
  )
}

function RouteTraceCard({ geometry }: { geometry: MountainRouteGeometry }) {
  const view = buildRouteTraceViewModel(geometry, {
    width: 320,
    height: 220,
    padding: 18,
  })

  return (
    <section id="route" data-testid="mountain-route-section">
      <SectionHeader title="路线参考" right="完整轨迹" />
      <div style={{ padding: '0 var(--space-4)' }}>
        <div
          data-mountain-route-card
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <svg
            data-testid="mountain-route-trace-shape"
            role="img"
            aria-label="完整参考轨迹形状"
            viewBox="0 0 320 220"
            style={{
              display: 'block',
              width: '100%',
              aspectRatio: '16 / 11',
              background: 'var(--color-surface)',
            }}
          >
            {view.paths.map((path, index) => (
              <path
                key={`${geometry.id}-${index}`}
                d={path}
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <circle cx={view.start.x} cy={view.start.y} r="5" fill="var(--color-surface)" stroke="var(--color-success)" strokeWidth="2" />
            <circle cx={view.end.x} cy={view.end.y} r="5" fill="var(--color-success)" stroke="var(--color-surface)" strokeWidth="2" />
          </svg>
          <div style={{ padding: '10px 14px 12px', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>
            轨迹形状示意，不是导航地图
          </div>
        </div>
      </div>
    </section>
  )
}

function RouteReferenceSection({ routeGeometry }: { routeGeometry: MountainRouteGeometry | null }) {
  if (!routeGeometry) return <RouteUnavailable />
  return <RouteTraceCard geometry={routeGeometry} />
}

function FeaturedSection({ posts }: { posts: CommunityPostViewModel[] }) {
  return (
    <section data-testid="mountain-featured-posts-section" data-mountain-motion="featured">
      <SectionHeader title="精选攻略" />
      <div style={{ padding: '0 var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
        {posts.slice(0, 3).map((post) => (
          <a
            data-mountain-motion-child="featured-card"
            key={post.id}
            href={`/community/${post.id}`}
            style={{
              display: 'grid',
              gridTemplateColumns: post.coverUrl ? '72px minmax(0, 1fr)' : 'minmax(0, 1fr)',
              gap: 'var(--space-3)',
              minWidth: 0,
              textDecoration: 'none',
              color: 'inherit',
              background: 'var(--color-surface-variant)',
              border: '1px solid var(--color-outline)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-3)',
            }}
          >
            {post.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.coverUrl}
                alt=""
                aria-hidden="true"
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-md)',
                  display: 'block',
                }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: 'var(--color-on-surface)',
                  fontSize: 'var(--font-body-m-size)',
                  lineHeight: 'var(--font-body-m-line)',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {post.title}
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 'var(--font-label-m-size)',
                  lineHeight: 'var(--font-label-m-line)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {post.body || post.note || '这位山友留下了一条可参考的山行经验。'}
              </div>
              <div
                style={{
                  marginTop: 8,
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 'var(--font-label-s-size)',
                  lineHeight: 'var(--font-label-s-line)',
                  display: 'flex',
                  gap: 'var(--space-2)',
                  flexWrap: 'wrap',
                }}
              >
                <span>{post.author.username}</span>
                <span>{post.publishedRelative}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

function BottomCTA({
  mountain,
  requiresLogin,
  hasWaypoints,
}: {
  mountain: Mountain
  requiresLogin: boolean
  hasWaypoints: boolean
}) {
  const accessDisplay = getMountainAccessDisplay(mountain.access_status, mountain.entity_type)
  const loginHref = `/auth/login?from=${encodeURIComponent(`/mountain/${mountain.id}`)}`
  const primaryHref = requiresLogin
    ? loginHref
    : buildTrekUrl({ mountainId: mountain.id })
  function handlePrimaryClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const pendingTemplate = consumePendingShareTemplate()

    if (!pendingTemplate) {
      window.location.href = primaryHref
      return
    }

    const trekUrl = buildTrekUrl({ mountainId: mountain.id, template: pendingTemplate })
    if (requiresLogin) {
      const authReturnPath = normalizeAuthReturnPath(trekUrl, '/trek')
      window.location.href = `/auth/login?from=${encodeURIComponent(authReturnPath)}`
      return
    }

    window.location.href = trekUrl
  }

  return (
    <div
      data-testid="mountain-bottom-cta"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        padding: '12px 16px calc(26px + env(safe-area-inset-bottom))',
        background:
          'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--color-surface) 96%, transparent) 30%)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: 10,
          minWidth: 0,
        }}
      >
        <SecondaryButton
          className="pt-pressable"
          as="a"
          href={hasWaypoints ? '#waypoints' : '#route'}
          onPointerDown={markPressFallback}
          onPointerUp={clearPressFallback}
          onPointerCancel={clearPressFallback}
          onPointerLeave={clearPressFallback}
          onBlur={clearPressFallback}
        >
          查看路线
        </SecondaryButton>
        {accessDisplay.canStartTrek ? (
          <PrimaryButton
            className="pt-pressable-hero"
            data-testid="mountain-primary-cta"
            as="a"
            href={primaryHref}
            onClick={handlePrimaryClick}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
          >
            {requiresLogin ? '登录后开始记录' : '开始记录'}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            data-testid="mountain-primary-cta"
            disabled
          >
            {accessDisplay.ctaLabel}
          </PrimaryButton>
        )}
      </div>
    </div>
  )
}

export default function MountainDetailClient({
  mountain,
  userLicense,
  licenseProgress,
  requiresLogin,
  waypoints,
  routeGeometry,
  featuredPosts,
  heroImages,
}: MountainDetailClientProps) {
  const router = useRouter()
  const motionScopeRef = useRef<HTMLDivElement | null>(null)
  const routeFacts = getRouteFacts(mountain)
  const displayAltitude = getMountainDisplayAltitude(mountain)
  const communityEnabled = isFeatureEnabled('COMMUNITY_ENABLED')
  const [licenseSheetOpen, setLicenseSheetOpen] = useState(false)

  useEffect(() => {
    trackEvent({
      event_type: 'business',
      event_name: 'business.mountain_view',
      properties: {
        mountain_id: mountain.id,
        mountain_name: mountain.name,
        province: mountain.province,
        difficulty: mountain.difficulty,
        entity_type: mountain.entity_type ?? 'mountain',
        altitude_m: mountain.entity_type === 'route_corridor' ? undefined : displayAltitude,
        route_highpoint_m: mountain.entity_type === 'route_corridor' ? displayAltitude : undefined,
      },
    })
  }, [displayAltitude, mountain.difficulty, mountain.entity_type, mountain.id, mountain.name, mountain.province])

  useGSAP((_context, contextSafe) => {
    const root = motionScopeRef.current
    if (!root) return

    const getScopedTargets = (selector: string, scope: ParentNode = root) =>
      gsap.utils.toArray<HTMLElement>(scope.querySelectorAll(selector)).filter((target) => root.contains(target))

    const getMotionTargets = () => getScopedTargets('[data-mountain-motion]')

    const getAllAnimatedTargets = () => [
      ...getMotionTargets(),
      ...getScopedTargets('[data-mountain-hero-visual]'),
      ...getScopedTargets('[data-mountain-hero-item]'),
      ...getScopedTargets('[data-mountain-stat-tile]'),
      ...getScopedTargets('[data-mountain-motion-child]'),
    ]

    const terminalizeStatValues = () => {
      for (const valueNode of getScopedTargets('[data-mountain-stat-value]')) {
        const finalText = valueNode.dataset.finalText
        if (finalText) valueNode.textContent = finalText
      }
    }

    const terminalizeMountainMotion = () => {
      if (!root.isConnected) return
      const targets = getMotionTargets()
      const allAnimatedTargets = getAllAnimatedTargets()
      if (targets.length === 0 && allAnimatedTargets.length === 0) return
      const shiftedTargets = targets.filter((target) => target.dataset.mountainMotionMode !== 'fade')
      const fadeOnlyTargets = targets.filter((target) => target.dataset.mountainMotionMode === 'fade')
      if (shiftedTargets.length > 0) {
        gsap.set(shiftedTargets, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          clearProps: 'willChange,transform',
        })
      }
      if (fadeOnlyTargets.length > 0) {
        gsap.set(fadeOnlyTargets, {
          autoAlpha: 1,
          clearProps: 'willChange,transform',
        })
      }
      const childTargets = allAnimatedTargets.filter((target) => !targets.includes(target))
      if (childTargets.length > 0) {
        gsap.set(childTargets, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          clearProps: 'willChange,transform',
        })
      }
      terminalizeStatValues()
    }

    const runMotion = () => {
      const mm = gsap.matchMedia()
      mm.add(
        {
          allowMotion: '(prefers-reduced-motion: no-preference)',
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (mediaContext) => {
          const targets = getMotionTargets()
          if (targets.length === 0) return () => undefined

          if (mediaContext.conditions?.reduceMotion) {
            terminalizeMountainMotion()
            return () => terminalizeMountainMotion()
          }

          const baseDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.22)
          const enterDuration = Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.24)
          const fastDuration = Math.min(parseMotionTokenSeconds(root, '--motion-fast', 180), 0.16)
          const schedule = {
            hero: 0,
            stats: 0.12,
            description: 0.32,
            decision: 0.48,
            weather: 0.64,
            route: 0.74,
            waypoints: 0.82,
            featured: 0.9,
          } as const
          const motionMap = new Map(targets.map((target) => [target.dataset.mountainMotion, target]))
          const shiftedTargets = targets.filter((target) => target.dataset.mountainMotionMode !== 'fade')
          const fadeOnlyTargets = targets.filter((target) => target.dataset.mountainMotionMode === 'fade')
          const allAnimatedTargets = getAllAnimatedTargets()

          if (shiftedTargets.length > 0) gsap.set(shiftedTargets, { willChange: 'transform, opacity' })
          if (fadeOnlyTargets.length > 0) gsap.set(fadeOnlyTargets, { willChange: 'opacity' })
          const animatedNonSectionTargets = allAnimatedTargets.filter((target) => !targets.includes(target))
          if (animatedNonSectionTargets.length > 0) gsap.set(animatedNonSectionTargets, { willChange: 'transform, opacity' })

          const timeline = gsap.timeline({
            defaults: { duration: baseDuration, ease: 'power3.out' },
            onComplete: terminalizeMountainMotion,
            onInterrupt: terminalizeMountainMotion,
          })

          const addSectionShell = (target: HTMLElement, label: string, position: number) => {
            timeline.addLabel(label, position)
            const fadeOnly = target.dataset.mountainMotionMode === 'fade'
            if (fadeOnly) {
              timeline.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration: baseDuration }, label)
              return
            }
            timeline.fromTo(target, { autoAlpha: 0, y: 22, scale: 0.96 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              ease: 'back.out(1.3)',
              duration: enterDuration,
            }, label)
          }

          const addChildCascade = (target: HTMLElement, position: number, selector = '[data-mountain-motion-child]') => {
            const children = getScopedTargets(selector, target)
            if (children.length === 0) return
            timeline.fromTo(children, { autoAlpha: 0, y: 14, scale: 0.98 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: fastDuration,
              ease: 'power3.out',
              stagger: { each: 0.035, from: 'start' },
            }, position)
          }

          const addGroup = (key: string, label: string, position: number, options?: { children?: boolean; routeCard?: boolean }) => {
            const target = motionMap.get(key)
            if (!target) return
            addSectionShell(target, label, position)
            if (options?.routeCard) addChildCascade(target, position + 0.08, '[data-mountain-motion-child="section-title"]')
            else if (options?.children) addChildCascade(target, position + 0.1)
          }

          const addHero = (position: number) => {
            const target = motionMap.get('hero')
            if (!target) return
            timeline.addLabel('hero', position)
            const heroVisuals = getScopedTargets('[data-mountain-hero-visual]')
            if (heroVisuals.length > 0) {
              timeline.fromTo(heroVisuals, { scale: 1.06 }, {
                scale: 1,
                duration: Math.min(0.32, enterDuration * 1.35),
                ease: 'power2.out',
              }, 'hero')
            }
            timeline.fromTo(target, { autoAlpha: 0, y: 24, scale: 0.98 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: Math.min(enterDuration, 0.22),
              ease: 'power3.out',
            }, position + 0.02)
            const heroItems = getScopedTargets('[data-mountain-hero-item]', target)
            if (heroItems.length > 0) {
              timeline.fromTo(heroItems, { autoAlpha: 0, y: 14, scale: 0.96 }, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: Math.min(fastDuration, 0.14),
                ease: 'back.out(1.3)',
                stagger: { each: 0.035, from: 'start' },
              }, position + 0.12)
            }
          }

          const addStats = (position: number) => {
            const target = motionMap.get('stats')
            if (!target) return
            timeline.addLabel('stats', position)
            timeline.fromTo(target, { autoAlpha: 0, y: 18, scale: 0.98 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: Math.min(enterDuration, 0.2),
              ease: 'back.out(1.3)',
            }, 'stats')
            const statTiles = getScopedTargets('[data-mountain-stat-tile]', target)
            if (statTiles.length > 0) {
              timeline.fromTo(statTiles, { autoAlpha: 0, y: 16, scale: 0.94 }, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: Math.min(fastDuration, 0.14),
                ease: 'back.out(1.3)',
                stagger: { each: 0.035, from: 'start' },
              }, position + 0.06)
            }
            for (const valueNode of getScopedTargets('[data-mountain-stat-value][data-count-value]', target)) {
              const rawTarget = Number(valueNode.dataset.countValue)
              const finalText = valueNode.dataset.finalText ?? valueNode.textContent ?? ''
              if (!Number.isFinite(rawTarget)) continue
              const countState = { value: 0 }
              timeline.to(countState, {
                value: rawTarget,
                duration: Math.min(0.46, enterDuration * 1.9),
                ease: 'power2.out',
                onUpdate: () => {
                  valueNode.textContent = formatMotionCountValue(countState.value, valueNode.dataset.countFormat, finalText)
                },
                onComplete: () => {
                  valueNode.textContent = finalText
                },
              }, position + 0.18)
            }
          }

          addHero(schedule.hero)
          addStats(schedule.stats)
          addGroup('description', 'description', schedule.description, { children: true })
          addGroup('decision', 'decision', schedule.decision, { children: true })
          addGroup('weather', 'weather', schedule.weather)
          addGroup('route', 'route', schedule.route, { routeCard: true })
          addGroup('waypoints', 'waypoints', schedule.waypoints, { children: true })
          addGroup('featured', 'featured', schedule.featured, { children: true })

          return () => {
            timeline.kill()
            terminalizeMountainMotion()
          }
        },
        root,
      )

      return () => {
        mm.revert()
        terminalizeMountainMotion()
      }
    }

    const safeRunMotion = (contextSafe ? contextSafe(runMotion) : runMotion) as () => unknown
    const cleanup = safeRunMotion()
    return () => {
      if (typeof cleanup === 'function') cleanup()
      terminalizeMountainMotion()
    }
  }, { scope: motionScopeRef, dependencies: [] })

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/explore')
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: mountain.name,
          text: [
            mountain.name,
            mountain.province,
            displayAltitude === null ? null : `${formatInteger(displayAltitude)}m`,
          ].filter(Boolean).join(' · '),
          url,
        })
        return
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
      }
    }

    await navigator.clipboard?.writeText(url)
  }

  return (
    <div
      ref={motionScopeRef}
      data-testid="mountain-detail-page"
      style={{
        minHeight: '100dvh',
        marginTop: 'calc(max(env(safe-area-inset-top), var(--space-2)) * -1)',
        background: 'var(--color-surface)',
        paddingBottom: 'calc(120px + env(safe-area-inset-bottom))',
        overflowX: 'hidden',
      }}
    >
      <HeroSection
        mountain={mountain}
        heroImages={heroImages}
        onBack={handleBack}
        onShare={handleShare}
      />

      <section
        data-mountain-motion="stats"
        aria-label={mountain.entity_type === 'route_corridor' ? '路线核心数据' : '山峰核心数据'}
        style={{
          padding: 'var(--space-4) var(--space-4) 0',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          <StatTile
            label={mountain.entity_type === 'route_corridor' ? '线路最高海拔 m' : '海拔 m'}
            value={displayAltitude === null ? '--' : formatInteger(displayAltitude)}
            motionKind="altitude"
            countValue={displayAltitude ?? undefined}
            countFormat="integer"
            accent
          />
          <StatTile
            label="距离 km"
            value={routeFacts.length === null ? '--' : String(routeFacts.length)}
            motionKind="distance"
            countValue={routeFacts.length ?? undefined}
            countFormat="decimal"
          />
          <StatTile
            label={routeFacts.gain === null ? '爬升 m' : '估算爬升 m'}
            value={routeFacts.gain === null ? '--' : formatInteger(routeFacts.gain)}
            motionKind="gain"
            countValue={routeFacts.gain ?? undefined}
            countFormat="integer"
          />
          <StatTile label="时长" value={routeFacts.duration ?? '--'} motionKind="duration" />
        </div>
      </section>

      <DescriptionSection description={mountain.description} entityType={mountain.entity_type} />

      <DecisionSection
        mountain={mountain}
        userLicense={userLicense}
        requiresLogin={requiresLogin}
        onShowLicenseSheet={() => setLicenseSheetOpen(true)}
      />

      <div data-mountain-motion="weather">
        <WeatherSection mountain={mountain} />
      </div>
      <div data-mountain-motion="route" data-mountain-motion-mode="fade">
        <RouteReferenceSection routeGeometry={routeGeometry} />
      </div>
      {waypoints.length > 0 ? <WaypointSection waypoints={waypoints} /> : null}
      {communityEnabled && featuredPosts.length > 0 ? <FeaturedSection posts={featuredPosts} /> : null}

      <BottomCTA
        mountain={mountain}
        requiresLogin={requiresLogin}
        hasWaypoints={waypoints.length > 0}
      />
      <LicenseProgressSheet
        open={licenseSheetOpen}
        progress={licenseProgress}
        onClose={() => setLicenseSheetOpen(false)}
      />
    </div>
  )
}
