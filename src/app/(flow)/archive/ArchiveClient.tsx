'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import IconButton from '@/components/ui/IconButton'
import { BackIcon, MoreIcon, PinIcon } from '@/components/ui/Icons'
import { getLicenseShortLabel } from '@/lib/license-ui'

export type ArchiveUserViewModel = {
  displayName: string
  avatarUrl: string | null
  province: string
  city: string | null
  licenseLevel: string | null
}

export type ArchiveSummaryViewModel = {
  totalTrips: number
  summitCount: number
  maxAltitudeM: number
}

export type ArchiveTripViewModel = {
  id: string
  createdAt: string
  mountain: {
    id: string
    name: string
    province: string
    region: string | null
    altitude: number
    coverImage: string | null
  }
  metrics: {
    maxAltitudeM: number
    distanceKm: number
    ascentM: number
    durationSeconds: number
  }
  photoUrl: string | null
  isSummit: boolean
  proofStatus: 'confirmed' | 'partial' | 'manual'
}

type FilterId = 'all' | 'summit' | 'proof' | 'pending'

type YearGroup = {
  year: string
  trips: ArchiveTripViewModel[]
}

const monoStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value))
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  if (!safeSeconds) return '--'

  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${Math.max(1, minutes)}m`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '----·--·--'
  return `${date.getFullYear()}·${String(date.getMonth() + 1).padStart(2, '0')}·${String(date.getDate()).padStart(2, '0')}`
}

function getYear(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '----'
  return String(date.getFullYear())
}

function getInitial(name: string) {
  return name.trim().slice(0, 1) || '山'
}

function buildLocationLine(user: ArchiveUserViewModel) {
  return [user.province, user.city && user.city !== user.province ? user.city : null].filter(Boolean).join(' · ')
}

function buildTripLocation(trip: ArchiveTripViewModel) {
  return [trip.mountain.province, trip.mountain.region && trip.mountain.region !== trip.mountain.province ? trip.mountain.region : null]
    .filter(Boolean)
    .join(' · ')
}

function filterTrips(trips: ArchiveTripViewModel[], active: FilterId) {
  if (active === 'summit') return trips.filter((trip) => trip.isSummit)
  if (active === 'proof') return trips.filter((trip) => trip.proofStatus === 'confirmed')
  if (active === 'pending') return trips.filter((trip) => trip.proofStatus !== 'confirmed')
  return trips
}

function groupTripsByYear(trips: ArchiveTripViewModel[]): YearGroup[] {
  const groupMap = new Map<string, ArchiveTripViewModel[]>()
  for (const trip of trips) {
    const year = getYear(trip.createdAt)
    groupMap.set(year, [...(groupMap.get(year) ?? []), trip])
  }

  return [...groupMap.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, yearTrips]) => ({ year, trips: yearTrips }))
}

function ArchiveIconButton({
  icon,
  ariaLabel,
  onClick,
}: {
  icon: ReactNode
  ariaLabel: string
  onClick?: () => void
}) {
  return (
    <IconButton
      ariaLabel={ariaLabel}
      icon={icon}
      shape="circular"
      variant="filled"
      onClick={onClick}
      style={{
        width: 'var(--control-size)',
        height: 'var(--control-size)',
        color: 'var(--color-on-surface)',
        background: 'var(--color-surface-variant)',
        border: '1px solid var(--color-outline)',
      }}
    />
  )
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warn' | 'active'
}) {
  const color =
    tone === 'success'
      ? 'var(--color-success)'
      : tone === 'warn'
        ? 'var(--color-warning)'
        : tone === 'active'
          ? 'var(--color-success)'
          : 'var(--color-on-surface-variant)'
  const background =
    tone === 'success'
      ? 'color-mix(in srgb, var(--color-success) 14%, transparent)'
      : tone === 'warn'
        ? 'color-mix(in srgb, var(--color-warning) 14%, transparent)'
        : tone === 'active'
          ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
          : 'color-mix(in srgb, var(--color-on-surface) 5%, transparent)'
  const borderColor =
    tone === 'success'
      ? 'color-mix(in srgb, var(--color-success) 30%, transparent)'
      : tone === 'warn'
        ? 'color-mix(in srgb, var(--color-warning) 30%, transparent)'
        : tone === 'active'
          ? 'color-mix(in srgb, var(--color-success) 28%, transparent)'
          : 'var(--color-outline)'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 24,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid',
        borderColor,
        color,
        background,
        fontSize: 'var(--font-label-s-size)',
        lineHeight: 'var(--font-label-s-line)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function ArchiveHeader({ onBack }: { onBack: () => void }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-1) var(--space-3)',
      }}
    >
      <ArchiveIconButton ariaLabel="返回" icon={<BackIcon size={20} />} onClick={onBack} />
      <div
        style={{
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 600,
        }}
      >
        我的山行档案
      </div>
      <ArchiveIconButton ariaLabel="更多" icon={<MoreIcon size={20} />} />
    </header>
  )
}

function Avatar({ user }: { user: ArchiveUserViewModel }) {
  return (
    <div
      aria-label={`${user.displayName} 的头像`}
      role="img"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 46,
        height: 46,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--color-outline)',
        color: 'var(--color-on-surface)',
        background: user.avatarUrl
          ? `url("${user.avatarUrl}") center / cover no-repeat`
          : 'var(--color-surface-elevated)',
        fontSize: 16,
        lineHeight: 1,
        fontWeight: 700,
      }}
    >
      {user.avatarUrl ? null : getInitial(user.displayName)}
    </div>
  )
}

function UserIdentityRow({
  user,
  chip,
}: {
  user: ArchiveUserViewModel
  chip: ReactNode
}) {
  const locationLine = buildLocationLine(user)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <Avatar user={user} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            overflow: 'hidden',
            color: 'var(--color-on-surface)',
            fontSize: 16,
            lineHeight: '22px',
            fontWeight: 700,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.displayName}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            minWidth: 0,
            marginTop: 3,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              minWidth: 0,
            }}
          >
            <PinIcon size={14} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locationLine}</span>
          </span>
          <span style={{ color: 'color-mix(in srgb, var(--color-on-surface-variant) 38%, transparent)' }}>·</span>
          {chip}
        </div>
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div style={{ minWidth: 0, textAlign: 'center' }}>
      <div
        style={{
          ...monoStyle,
          color: accent ? 'var(--color-success)' : 'var(--color-on-surface)',
          fontSize: 20,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 5,
          color: 'var(--color-on-surface-variant)',
          fontSize: 10,
          lineHeight: '14px',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function IdentityCard({
  user,
  summary,
}: {
  user: ArchiveUserViewModel
  summary: ArchiveSummaryViewModel
}) {
  return (
    <section style={{ padding: '14px var(--space-4) 0' }}>
      <div
        style={{
          padding: 'var(--space-4)',
          borderRadius: 14,
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
        }}
      >
        <UserIdentityRow user={user} chip={<Chip tone="active">{getLicenseShortLabel(user.licenseLevel)}</Chip>} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 'var(--space-2)',
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--color-outline)',
          }}
        >
          <SummaryStat label="山行" value={formatNumber(summary.totalTrips)} />
          <SummaryStat label="登顶" value={formatNumber(summary.summitCount)} />
          <SummaryStat label="最高 m" value={formatNumber(summary.maxAltitudeM)} accent />
        </div>
      </div>
    </section>
  )
}

function IdentityCardEmpty({ user }: { user: ArchiveUserViewModel }) {
  return (
    <section style={{ padding: '14px var(--space-4) 0' }}>
      <div
        style={{
          padding: 'var(--space-4)',
          borderRadius: 14,
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
        }}
      >
        <UserIdentityRow user={user} chip={<Chip>新人</Chip>} />
      </div>
    </section>
  )
}

function FilterTabs({
  active,
  onChange,
  trips,
}: {
  active: FilterId
  onChange: (value: FilterId) => void
  trips: ArchiveTripViewModel[]
}) {
  const counts = {
    all: trips.length,
    summit: trips.filter((trip) => trip.isSummit).length,
    proof: trips.filter((trip) => trip.proofStatus === 'confirmed').length,
    pending: trips.filter((trip) => trip.proofStatus !== 'confirmed').length,
  }
  const tabs: Array<{ id: FilterId; label: string; count: number }> = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'summit', label: '登顶', count: counts.summit },
    { id: 'proof', label: '已留证', count: counts.proof },
    { id: 'pending', label: '未留证', count: counts.pending },
  ]

  return (
    <section style={{ padding: '18px var(--space-4) 0' }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 2,
          scrollbarWidth: 'none',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
                minHeight: 32,
                padding: '7px 12px',
                borderRadius: 'var(--radius-pill)',
                border: isActive ? '1px solid transparent' : '1px solid var(--color-outline)',
                color: isActive ? 'var(--color-surface)' : 'var(--color-on-surface-variant)',
                background: isActive ? 'var(--color-on-surface)' : 'transparent',
                font: 'inherit',
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              <span style={{ ...monoStyle, fontSize: 10, lineHeight: '14px', fontWeight: 700, opacity: 0.68 }}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function YearDivider({ year, count }: { year: string; count: number }) {
  return (
    <div
      style={{
        position: 'sticky',
        zIndex: 1,
        top: 0,
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: '22px var(--space-5) 10px',
        background:
          'linear-gradient(180deg, var(--color-surface) 0%, color-mix(in srgb, var(--color-surface) 88%, transparent) 100%)',
      }}
    >
      <div
        style={{
          ...monoStyle,
          color: 'var(--color-on-surface)',
          fontSize: 22,
          lineHeight: '28px',
          fontWeight: 800,
        }}
      >
        {year}
      </div>
      <div
        style={{
          ...monoStyle,
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          whiteSpace: 'nowrap',
        }}
      >
        {count} 次山行
      </div>
    </div>
  )
}

function ProofChip({ proofStatus }: { proofStatus: ArchiveTripViewModel['proofStatus'] }) {
  if (proofStatus === 'confirmed') return <Chip tone="success">● 留证</Chip>
  if (proofStatus === 'partial') return <Chip tone="warn">● 部分留证</Chip>
  return <Chip>● 补签</Chip>
}

function TripMedia({ trip }: { trip: ArchiveTripViewModel }) {
  const background = trip.photoUrl
    ? `url("${trip.photoUrl}") center 35% / cover no-repeat`
    : 'radial-gradient(circle at 30% 18%, color-mix(in srgb, var(--color-surface-elevated) 82%, var(--color-on-surface)) 0, transparent 36%), linear-gradient(145deg, var(--color-surface-elevated), var(--color-surface))'

  return (
    <div
      style={{
        position: 'relative',
        height: 140,
        overflow: 'hidden',
        background,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 36%, transparent) 0%, transparent 35%, color-mix(in srgb, var(--color-surface) 88%, transparent) 100%)',
        }}
      />
      <div style={{ position: 'absolute', top: 10, left: 10 }}>
        {trip.isSummit ? <Chip tone="success">● 已登顶</Chip> : <Chip tone="warn">● 未登顶</Chip>}
      </div>
      <div style={{ position: 'absolute', top: 10, right: 10 }}>
        <ProofChip proofStatus={trip.proofStatus} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 12,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              overflow: 'hidden',
              color: 'var(--color-on-surface)',
              fontSize: 17,
              lineHeight: '24px',
              fontWeight: 700,
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {trip.mountain.name}
          </div>
          <div
            style={{
              ...monoStyle,
              marginTop: 3,
              color: 'color-mix(in srgb, var(--color-on-surface) 72%, transparent)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              letterSpacing: '0.04em',
            }}
          >
            {formatDate(trip.createdAt)} · {buildTripLocation(trip)}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div
            style={{
              ...monoStyle,
              color: 'var(--color-success)',
              fontSize: 19,
              lineHeight: 1,
              fontWeight: 800,
            }}
          >
            {formatNumber(trip.metrics.maxAltitudeM)}
            <span
              style={{
                marginLeft: 2,
                color: 'color-mix(in srgb, var(--color-success) 70%, transparent)',
                fontSize: 'var(--font-label-s-size)',
                fontWeight: 700,
              }}
            >
              m
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          ...monoStyle,
          overflow: 'hidden',
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 700,
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 2,
          color: 'var(--color-on-surface-variant)',
          fontSize: 10,
          lineHeight: '14px',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function TripCard({ trip, onOpen }: { trip: ArchiveTripViewModel; onOpen: (trip: ArchiveTripViewModel) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(trip)}
      style={{
        display: 'block',
        width: '100%',
        overflow: 'hidden',
        padding: 0,
        borderRadius: 14,
        border: '1px solid var(--color-outline)',
        color: 'inherit',
        background: 'var(--color-surface-variant)',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <TripMedia trip={trip} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--space-2)',
          padding: '10px 14px',
          borderTop: '1px solid var(--color-outline)',
        }}
      >
        <MiniStat label="距离" value={trip.metrics.distanceKm > 0 ? `${trip.metrics.distanceKm.toFixed(1)}km` : '--'} />
        <MiniStat label="爬升" value={trip.metrics.ascentM > 0 ? `${formatNumber(trip.metrics.ascentM)}m` : '--'} />
        <MiniStat label="用时" value={formatDuration(trip.metrics.durationSeconds)} />
      </div>
    </button>
  )
}

function ArchiveEmptyState({
  onFindMountain,
  onBringBack,
}: {
  onFindMountain: () => void
  onBringBack: () => void
}) {
  return (
    <>
      <section style={{ padding: '28px var(--space-6) 0' }}>
        <div
          style={{
            padding: '26px var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              ...monoStyle,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 600,
              letterSpacing: '0.22em',
            }}
          >
            0 / 0
          </div>
          <div
            style={{
              marginTop: 'var(--space-3)',
              color: 'var(--color-on-surface)',
              fontSize: 18,
              lineHeight: '24px',
              fontWeight: 700,
            }}
          >
            档案还没有一次山行
          </div>
          <div
            style={{
              marginTop: 'var(--space-2)',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 1.6,
            }}
          >
            去一次真实的山，
            <br />
            回来把它放进这里。
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 'var(--space-5)' }}>
            <PrimaryButton onClick={onFindMountain} style={{ width: '100%' }}>
              去找一座山
            </PrimaryButton>
            <SecondaryButton onClick={onBringBack} style={{ width: '100%' }}>
              把以前的山行带回来
            </SecondaryButton>
          </div>
        </div>
      </section>
      <section
        style={{
          padding: 'var(--space-5) 28px 0',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 1.7,
          textAlign: 'center',
        }}
      >
        档案只保存 <span style={{ color: 'var(--color-on-surface)', fontWeight: 600 }}>自己</span> 的山行记录。
        <br />
        想发到山友圈时再发 · Peak Trekker 不会替你声张。
      </section>
    </>
  )
}

export default function ArchiveClient({
  user,
  summary,
  trips,
}: {
  user: ArchiveUserViewModel
  summary: ArchiveSummaryViewModel
  trips: ArchiveTripViewModel[]
}) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterId>('all')
  const filteredTrips = useMemo(() => filterTrips(trips, activeFilter), [trips, activeFilter])
  const yearGroups = useMemo(() => groupTripsByYear(filteredTrips), [filteredTrips])
  const hasTrips = trips.length > 0

  function handleBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/profile')
  }

  return (
    <main
      style={{
        minHeight: 'calc(100dvh - max(env(safe-area-inset-top), var(--space-2)))',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        paddingBottom: 'var(--space-6)',
        color: 'var(--color-on-surface)',
        background: 'var(--color-surface)',
        overflowX: 'hidden',
      }}
    >
      <ArchiveHeader onBack={handleBack} />
      {hasTrips ? (
        <>
          <IdentityCard user={user} summary={summary} />
          <FilterTabs active={activeFilter} onChange={setActiveFilter} trips={trips} />
          {yearGroups.map((group) => (
            <section key={group.year}>
              <YearDivider year={group.year} count={group.trips.length} />
              <div style={{ display: 'grid', gap: 'var(--space-3)', padding: '0 var(--space-4)' }}>
                {group.trips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} onOpen={() => router.push(`/activity/${trip.id}`)} />
                ))}
              </div>
            </section>
          ))}
          <div
            style={{
              ...monoStyle,
              padding: '28px 0',
              color: 'var(--color-on-surface-variant)',
              fontSize: 10,
              lineHeight: '14px',
              letterSpacing: '0.2em',
              textAlign: 'center',
            }}
          >
            · 档案结束 ·
          </div>
        </>
      ) : (
        <>
          <IdentityCardEmpty user={user} />
          <ArchiveEmptyState
            onFindMountain={() => router.push('/explore')}
            onBringBack={() => router.push('/explore')}
          />
        </>
      )}
    </main>
  )
}
