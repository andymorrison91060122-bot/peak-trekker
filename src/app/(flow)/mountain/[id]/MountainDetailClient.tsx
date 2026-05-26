'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { CommunityPostViewModel, Mountain, User } from '@/types'
import type { Waypoint, WaypointType } from '@/lib/waypoints'
import { getRouteSegments, type RouteSegment } from '@/lib/mountain-route-segments'
import { getLicenseRequirementLabel, getLicenseShortLabel } from '@/lib/license-ui'
import { BackIcon, CheckIcon, MoreIcon, PinIcon, ShareIcon, WarnIcon } from '@/components/ui/Icons'
import { HelpTrigger } from '@/components/help/HelpTrigger'
import Chip from '@/components/ui/Chip'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import WeatherSection from '@/components/mountain/WeatherSection'

const LICENSE_RANK: Record<User['license_level'], number> = {
  none: 0,
  basic: 1,
  intermediate: 2,
  advanced: 3,
}

type MountainDetailClientProps = {
  mountain: Mountain
  userLicense: User['license_level']
  requiresLogin: boolean
  waypoints: Waypoint[]
  featuredPosts: CommunityPostViewModel[]
  heroImages: string[]
}

function formatInteger(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return String(Math.round(value))
}

function getRouteFacts(mountain: Mountain) {
  return {
    length: mountain.length_km ?? Number(Math.max(4.2, Math.min(26, mountain.altitude / 260)).toFixed(1)),
    gain: mountain.elevation_gain_m ?? Math.max(320, Math.round(mountain.altitude * 0.68)),
    duration: mountain.estimated_duration ?? `${Math.max(2, Math.min(12, Math.round(mountain.altitude / 650)))}h`,
  }
}

function getRouteTypeLabel(level: Mountain['difficulty']) {
  switch (level) {
    case 'beginner':
      return '入门线'
    case 'intermediate':
      return '进阶线'
    case 'advanced':
      return '长线挑战线'
    case 'expert':
      return '高海拔挑战线'
    default:
      return '经典线'
  }
}

function getSeasonDecision(mountain: Mountain) {
  const currentMonth = new Date().getMonth() + 1
  const highAltitude = mountain.altitude >= 4000
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

function cleanDescription(value: string | null | undefined) {
  return (value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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
      aria-label={label}
      title={label}
      onClick={onClick}
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
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: 10,
        borderRadius: 'var(--radius-sm)',
        border: '1px solid color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
        background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
      }}
    >
      <div
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
  routeTypeLabel,
  onBack,
  onShare,
}: {
  mountain: Mountain
  heroImages: string[]
  routeTypeLabel: string
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
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 55%, transparent) 0%, transparent 40%, color-mix(in srgb, var(--color-surface) 88%, transparent) 100%)',
        }}
      />
      {!hasImages ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 72% 18%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 30%), linear-gradient(160deg, transparent 0%, color-mix(in srgb, var(--color-on-surface) 5%, transparent) 100%)',
          }}
        />
      ) : null}
      {heroImages.length > 1 ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 116,
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            pointerEvents: 'none',
          }}
        >
          {heroImages.map((image, index) => (
            <span
              key={`dot-${image}-${index}`}
              style={{
                width: index === activeIndex ? 14 : 6,
                height: 6,
                borderRadius: 'var(--radius-pill)',
                background:
                  index === activeIndex
                    ? 'var(--color-on-surface)'
                    : 'color-mix(in srgb, var(--color-on-surface) 38%, transparent)',
                transition: 'width 160ms ease, background 160ms ease',
              }}
            />
          ))}
        </div>
      ) : null}

      <div
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
        style={{
          position: 'absolute',
          left: 'var(--space-4)',
          right: 'var(--space-4)',
          bottom: 'var(--space-4)',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <Chip active>{getLicenseRequirementLabel(mountain.min_license)}</Chip>
          <Chip>{routeTypeLabel}</Chip>
        </div>
        <h1
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
  isLocked,
}: {
  mountain: Mountain
  userLicense: User['license_level']
  requiresLogin: boolean
  isLocked: boolean
}) {
  const season = getSeasonDecision(mountain)
  const currentLabel = getLicenseShortLabel(userLicense)
  const requiredLabel = getLicenseShortLabel(mountain.min_license)

  return (
    <section data-testid="mountain-decision-section">
      <SectionHeader title="这座山适不适合你" />
      <div style={{ padding: '0 var(--space-4)' }}>
        <div
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <DecisionRow
            tone={requiresLogin ? 'neutral' : isLocked ? 'warn' : 'ok'}
            label={requiresLogin ? '登录后查看等级匹配' : isLocked ? '你的等级还不够' : '你的等级达到要求'}
            sub={
              requiresLogin
                ? `${getLicenseRequirementLabel(mountain.min_license)} · 登录后可判断是否适合出发`
                : `你当前 ${currentLabel} · 本山需要 ${requiredLabel} 及以上`
            }
            helpAnchor="license.license-tiers"
          />
          <DecisionRow
            tone={season.ok ? 'ok' : 'warn'}
            label={season.label}
            sub={season.sub}
          />
          <DecisionRow
            tone="warn"
            label="天气与路线仅供决策参考"
            sub="不承诺实时路况 · 出发前请自行复核"
            last
          />
        </div>
      </div>
    </section>
  )
}

function DescriptionSection({ description }: { description: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false)
  const text = cleanDescription(description)
  const collapsible = text.length > 96

  if (!text) return null

  return (
    <section data-testid="mountain-description-section">
      <SectionHeader title="山峰简介" />
      <div style={{ padding: '0 var(--space-4)' }}>
        <div
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            padding: 14,
          }}
        >
          <p
            style={{
              margin: 0,
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: '24px',
              display: collapsible && !expanded ? '-webkit-box' : 'block',
              WebkitLineClamp: collapsible && !expanded ? 4 : undefined,
              WebkitBoxOrient: collapsible && !expanded ? 'vertical' : undefined,
              overflow: collapsible && !expanded ? 'hidden' : undefined,
            }}
          >
            {text}
          </p>
          {collapsible ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              style={{
                marginTop: 'var(--space-3)',
                padding: 0,
                border: 0,
                background: 'transparent',
                color: 'var(--color-primary)',
                fontSize: 'var(--font-label-m-size)',
                lineHeight: 'var(--font-label-m-line)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {expanded ? '收起' : '展开全部'}
            </button>
          ) : null}
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
    <section id="waypoints" data-testid="mountain-waypoints-section">
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

function EmptyModuleCard({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-variant)',
        border: '1px solid var(--color-outline)',
        borderRadius: 'var(--radius-lg)',
        padding: '22px 16px',
        textAlign: 'center',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 40,
          height: 40,
          margin: '0 auto 10px',
          borderRadius: 'var(--radius-md)',
          background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
          border: '1px solid var(--color-outline)',
          color: 'var(--color-on-surface-variant)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </div>
      <div
        style={{
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-title-m-size)',
          lineHeight: 'var(--font-title-m-line)',
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div
        style={{
          maxWidth: 260,
          margin: '6px auto 0',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: '20px',
        }}
      >
        {description}
      </div>
      {action ? <div style={{ marginTop: 'var(--space-4)' }}>{action}</div> : null}
    </div>
  )
}

function RouteFootnote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginTop: 'var(--space-3)',
        padding: '8px 10px',
        borderTop: '1px solid var(--color-outline)',
        color: 'var(--color-on-surface-variant)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-label-s-size)',
        lineHeight: 'var(--font-label-s-line)',
        fontWeight: 500,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </div>
  )
}

function RouteTextFallback({ segments }: { segments: RouteSegment[] }) {
  return (
    <section id="route" data-testid="mountain-route-section">
      <SectionHeader
        title="路线参考"
        right={
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            仅文字版本
          </span>
        }
      />
      <div style={{ padding: '0 var(--space-4)' }}>
        <div
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 14px 6px',
          }}
        >
          {segments.map((segment, index) => (
            <div
              key={`${segment.altitude}-${segment.title}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '64px minmax(0, 1fr)',
                gap: 'var(--space-3)',
                padding: '8px 0',
                borderBottom: index === segments.length - 1 ? 'none' : '1px solid var(--color-outline)',
              }}
            >
              <div
                style={{
                  color: 'var(--color-warning)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-label-m-size)',
                  lineHeight: 'var(--font-label-m-line)',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatInteger(segment.altitude)}m
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: 'var(--color-on-surface)',
                    fontSize: 'var(--font-title-m-size)',
                    lineHeight: 'var(--font-title-m-line)',
                    fontWeight: 'var(--font-title-m-weight)',
                  }}
                >
                  {segment.title}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    color: 'var(--color-on-surface-variant)',
                    fontSize: 'var(--font-body-m-size)',
                    lineHeight: 'var(--font-body-m-line)',
                    fontWeight: 'var(--font-body-m-weight)',
                  }}
                >
                  {segment.description}
                </div>
              </div>
            </div>
          ))}
          <RouteFootnote>没有缓存到底图 · 仅展示路线分段说明</RouteFootnote>
        </div>
      </div>
    </section>
  )
}

function RouteReferenceSection({ mountain, waypoints }: { mountain: Mountain; waypoints: Waypoint[] }) {
  if (waypoints.length < 2) {
    const segments = getRouteSegments(mountain.name)

    if (segments) return <RouteTextFallback segments={segments} />

    return (
      <section id="route" data-testid="mountain-route-section">
        <SectionHeader title="路线参考" right="暂无 · 不可用" />
        <div style={{ padding: '0 var(--space-4)' }}>
          <EmptyModuleCard
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6zM9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="路线参考图暂时不可用"
            description="地图服务没有响应，你仍可以查看关键点位与海拔信息。"
          />
        </div>
      </section>
    )
  }

  const elevations = waypoints
    .map((waypoint) => waypoint.elevation)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const minElevation = elevations.length ? Math.min(...elevations) : 0
  const maxElevation = elevations.length ? Math.max(...elevations) : 1
  const range = Math.max(1, maxElevation - minElevation)
  const points = waypoints.map((waypoint, index) => {
    const x = 28 + (index / Math.max(1, waypoints.length - 1)) * 264
    const rawElevation = typeof waypoint.elevation === 'number' ? waypoint.elevation : minElevation
    const y = 156 - ((rawElevation - minElevation) / range) * 112
    const tone = getWaypointTone({ waypoint, highestElevation: maxElevation })
    return { waypoint, x, y, tone }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const summit = points.find((point) => point.tone === 'success') ?? points[points.length - 1]

  return (
    <section id="route" data-testid="mountain-route-section">
      <SectionHeader
        title="路线参考"
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: 'var(--radius-pill)', background: 'var(--color-on-surface-variant)' }} />
            静态参考图
          </span>
        }
      />
      <div style={{ padding: '0 var(--space-4)' }}>
        <div
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', padding: '14px 14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 9px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
                    border: '1px solid var(--color-outline)',
                    color: 'var(--color-on-surface-variant)',
                    fontSize: 'var(--font-label-s-size)',
                    lineHeight: 'var(--font-label-s-line)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  仅参考路线
                </span>
                <HelpTrigger anchor="map.map-no-nav" size={14} style={{ width: 26, height: 26 }} />
              </span>
              <button
                type="button"
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-outline)',
                  background: 'color-mix(in srgb, var(--color-surface) 68%, transparent)',
                  color: 'var(--color-on-surface)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 'var(--font-label-s-size)',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                放大
              </button>
            </div>
            <div
              style={{
                height: 240,
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-outline)',
                background: 'color-mix(in srgb, var(--color-surface) 78%, var(--color-surface-variant))',
                overflow: 'hidden',
              }}
            >
              <svg viewBox="0 0 320 180" width="100%" height="100%" role="img" aria-label="静态路线参考图">
                <defs>
                  <pattern id="route-contour" width="54" height="36" patternUnits="userSpaceOnUse">
                    <path d="M-8 24 C12 10 30 10 62 24" fill="none" stroke="var(--color-outline)" strokeOpacity="0.42" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="320" height="180" fill="url(#route-contour)" opacity="0.9" />
                <path d={path} fill="none" stroke="var(--color-trail)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 8" />
                {points.map((point, index) => {
                  const color =
                    point.tone === 'success'
                      ? 'var(--color-success)'
                      : point.tone === 'warn'
                        ? 'var(--color-warning)'
                        : 'var(--color-on-surface-variant)'
                  return (
                    <g key={point.waypoint.id}>
                      {index === 0 ? <circle cx={point.x} cy={point.y} r="7" fill="var(--color-surface)" stroke="var(--color-on-surface-variant)" strokeWidth="2" /> : null}
                      <circle cx={point.x} cy={point.y} r={point.tone === 'success' ? 6 : 4.5} fill={color} />
                    </g>
                  )
                })}
                {summit ? (
                  <g>
                    <path d={`M ${summit.x - 11} ${summit.y - 13} L ${summit.x} ${summit.y - 31} L ${summit.x + 11} ${summit.y - 13} Z`} fill="var(--color-success)" opacity="0.92" />
                    <text x={Math.min(236, Math.max(12, summit.x - 20))} y={Math.max(16, summit.y - 38)} fill="var(--color-success)" fontSize="10" fontWeight="700" fontFamily="var(--font-mono)">
                      顶峰 {formatInteger(summit.waypoint.elevation)}m
                    </text>
                  </g>
                ) : null}
              </svg>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '12px 14px 8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {points.map((point) => (
              <div
                key={`strip-${point.waypoint.id}`}
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-outline)',
                  background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
                  maxWidth: 180,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 'var(--radius-pill)',
                    flexShrink: 0,
                    background:
                      point.tone === 'success'
                        ? 'var(--color-success)'
                        : point.tone === 'warn'
                          ? 'var(--color-warning)'
                          : 'var(--color-on-surface-variant)',
                  }}
                />
                <span style={{ color: 'var(--color-on-surface)', fontSize: 'var(--font-label-s-size)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {point.waypoint.name}
                </span>
                <span style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>
                  {point.waypoint.elevation === null ? '--' : `${formatInteger(point.waypoint.elevation)}m`}
                </span>
              </div>
            ))}
          </div>
          <div style={{ padding: '0 14px 12px', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-label-s-size)', lineHeight: 'var(--font-label-s-line)' }}>
            仅作路线示意 · 不是导航地图，山区请以现场判断为准
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturedSection({ posts }: { posts: CommunityPostViewModel[] }) {
  return (
    <section data-testid="mountain-featured-posts-section">
      <SectionHeader title="精选攻略" />
      <div style={{ padding: '0 var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
        {posts.slice(0, 3).map((post) => (
          <a
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
  isLocked,
  hasWaypoints,
}: {
  mountain: Mountain
  requiresLogin: boolean
  isLocked: boolean
  hasWaypoints: boolean
}) {
  const loginHref = `/auth/login?from=${encodeURIComponent(`/mountain/${mountain.id}`)}`
  const primaryHref = requiresLogin ? loginHref : `/trek?mountainId=${encodeURIComponent(mountain.id)}`

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
          as="a"
          href={isLocked ? '/profile' : hasWaypoints ? '#waypoints' : '#route'}
        >
          {isLocked ? '去看升级路径' : '查看路线'}
        </SecondaryButton>
        {isLocked && !requiresLogin ? (
          <PrimaryButton disabled style={{ opacity: 0.45 }}>
            开始记录
          </PrimaryButton>
        ) : (
          <PrimaryButton as="a" href={primaryHref}>
            {requiresLogin ? '登录后开始记录' : '开始记录'}
          </PrimaryButton>
        )}
      </div>
    </div>
  )
}

export default function MountainDetailClient({
  mountain,
  userLicense,
  requiresLogin,
  waypoints,
  featuredPosts,
  heroImages,
}: MountainDetailClientProps) {
  const router = useRouter()
  const routeFacts = getRouteFacts(mountain)
  const routeTypeLabel = getRouteTypeLabel(mountain.difficulty)
  const isLocked = !requiresLogin && LICENSE_RANK[userLicense] < LICENSE_RANK[mountain.min_license]

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
          text: `${mountain.name} · ${mountain.province} · ${formatInteger(mountain.altitude)}m`,
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
        routeTypeLabel={routeTypeLabel}
        onBack={handleBack}
        onShare={handleShare}
      />

      <section
        aria-label="山峰核心数据"
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
          <StatTile label="海拔 m" value={formatInteger(mountain.altitude)} accent />
          <StatTile label="距离 km" value={String(routeFacts.length)} />
          <StatTile label="爬升 m" value={formatInteger(routeFacts.gain)} />
          <StatTile label="时长" value={routeFacts.duration} />
        </div>
      </section>

      <DescriptionSection description={mountain.description} />

      <DecisionSection
        mountain={mountain}
        userLicense={userLicense}
        requiresLogin={requiresLogin}
        isLocked={isLocked}
      />

      <WeatherSection mountain={mountain} />
      <RouteReferenceSection mountain={mountain} waypoints={waypoints} />
      {waypoints.length > 0 ? <WaypointSection waypoints={waypoints} /> : null}
      {featuredPosts.length > 0 ? <FeaturedSection posts={featuredPosts} /> : null}

      <BottomCTA
        mountain={mountain}
        requiresLogin={requiresLogin}
        isLocked={isLocked}
        hasWaypoints={waypoints.length > 0}
      />
    </div>
  )
}
