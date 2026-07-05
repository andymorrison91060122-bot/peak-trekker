'use client'

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import IconButton from '@/components/ui/IconButton'
import { BackIcon, PinIcon } from '@/components/ui/Icons'
import { getLicenseShortLabel } from '@/lib/license-ui'
import { formatMotionCountValue, parseMotionTokenSeconds, type MotionCountFormat } from '@/lib/motion-count-format'
import type { CheckinDisplayTitleSource } from '@/lib/checkin-display-title'

gsap.registerPlugin(useGSAP)

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
    id: string | null
    name: string
    titleSource: CheckinDisplayTitleSource
    unmatchedTag: '未关联' | null
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
  hasProof: boolean
}

type FilterId = 'all' | 'summit' | 'proof' | 'unproof'

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

function formatPositiveAltitude(value: number) {
  return value > 0 ? formatNumber(value) : '--'
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
  if (active === 'proof') return trips.filter((trip) => trip.hasProof)
  if (active === 'unproof') return trips.filter((trip) => !trip.hasProof)
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
      data-archive-motion="header"
      style={{
        display: 'grid',
        gridTemplateColumns: '44px minmax(0, 1fr) 44px',
        alignItems: 'center',
        gap: 'var(--space-2)',
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
          textAlign: 'center',
        }}
      >
        我的山行档案
      </div>
      <div aria-hidden="true" />
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
            fontSize: 'var(--font-title-l-size)',
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
  valueTestId,
  motionKind,
  countValue,
  countFormat,
}: {
  label: string
  value: string
  accent?: boolean
  valueTestId?: string
  motionKind?: string
  countValue?: number
  countFormat?: MotionCountFormat
}) {
  return (
    <div data-archive-stat-tile={motionKind} style={{ minWidth: 0, textAlign: 'center' }}>
      <div
        data-testid={valueTestId}
        data-archive-stat-value={motionKind}
        data-count-value={typeof countValue === 'number' ? String(countValue) : undefined}
        data-count-format={countFormat}
        data-final-text={value}
        style={{
          ...monoStyle,
          color: accent ? 'var(--color-success)' : 'var(--color-on-surface)',
          fontSize: 'var(--font-title-l-size)',
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
    <section data-archive-motion="identity" style={{ padding: '14px var(--space-4) 0' }}>
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
          <SummaryStat
            label="山行"
            value={formatNumber(summary.totalTrips)}
            motionKind="total-trips"
            countValue={summary.totalTrips}
            countFormat="integer"
          />
          <SummaryStat
            label="登顶"
            value={formatNumber(summary.summitCount)}
            motionKind="summit-count"
            countValue={summary.summitCount}
            countFormat="integer"
          />
          <SummaryStat
            label="最高 m"
            value={formatPositiveAltitude(summary.maxAltitudeM)}
            accent
            valueTestId="archive-summary-max-altitude-value"
            motionKind="max-altitude"
            countValue={summary.maxAltitudeM > 0 ? summary.maxAltitudeM : undefined}
            countFormat="integer"
          />
        </div>
      </div>
    </section>
  )
}

function IdentityCardEmpty({ user }: { user: ArchiveUserViewModel }) {
  return (
    <section data-archive-motion="identity" style={{ padding: '14px var(--space-4) 0' }}>
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

function getArchiveTabStyle(isActive: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    minHeight: 32,
    padding: '7px 12px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--archive-tab-border)',
    color: isActive ? 'var(--color-surface)' : 'var(--color-on-surface-variant)',
    background: 'var(--archive-tab-bg)',
    boxShadow: 'var(--archive-tab-shadow)',
    font: 'inherit',
    fontSize: 12,
    lineHeight: '16px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition:
      'background var(--motion-press) var(--ease-out), border-color var(--motion-press) var(--ease-out), box-shadow var(--motion-press) var(--ease-out)',
  }
}

function getArchiveTabCountStyle(isActive: boolean): CSSProperties {
  return {
    ...monoStyle,
    fontSize: 10,
    lineHeight: '14px',
    fontWeight: 700,
    opacity: isActive ? 0.72 : 0.62,
  }
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
    proof: trips.filter((trip) => trip.hasProof).length,
    unproof: trips.filter((trip) => !trip.hasProof).length,
  }
  const tabs: Array<{ id: FilterId; label: string; count: number }> = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'summit', label: '登顶', count: counts.summit },
    { id: 'proof', label: '已留证', count: counts.proof },
    { id: 'unproof', label: '未留证', count: counts.unproof },
  ]

  return (
    <section data-archive-motion="filters" style={{ padding: '18px var(--space-4) 0' }}>
      <style>
        {`
          .pt-archive-filter-tab {
            --archive-tab-bg: transparent;
            --archive-tab-border: var(--color-outline);
            --archive-tab-shadow: none;
          }

          .pt-archive-filter-tab[aria-pressed="true"] {
            --archive-tab-bg: var(--color-on-surface);
            --archive-tab-border: transparent;
            --archive-tab-shadow: none;
          }

          .pt-archive-filter-tab:active,
          .pt-archive-filter-tab[data-archive-press-active="true"] {
            --archive-tab-bg: color-mix(in srgb, var(--color-on-surface) 9%, transparent);
            --archive-tab-border: color-mix(in srgb, var(--color-on-surface) 30%, transparent);
            --archive-tab-shadow: inset 0 0 0 999px color-mix(in srgb, var(--color-on-surface) 7%, transparent);
          }

          .pt-archive-filter-tab[aria-pressed="true"]:active,
          .pt-archive-filter-tab[aria-pressed="true"][data-archive-press-active="true"] {
            --archive-tab-bg: color-mix(in srgb, var(--color-on-surface) 88%, var(--color-surface));
            --archive-tab-border: transparent;
            --archive-tab-shadow: inset 0 0 0 999px color-mix(in srgb, var(--color-surface) 9%, transparent);
          }
        `}
      </style>
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
              className="pt-archive-filter-tab"
              data-archive-filter-tab={tab.id}
              aria-pressed={isActive}
              onPointerDown={(event) => {
                event.currentTarget.dataset.archivePressActive = 'true'
              }}
              onPointerUp={(event) => {
                delete event.currentTarget.dataset.archivePressActive
              }}
              onPointerCancel={(event) => {
                delete event.currentTarget.dataset.archivePressActive
              }}
              onPointerLeave={(event) => {
                delete event.currentTarget.dataset.archivePressActive
              }}
              onMouseDown={(event) => {
                event.currentTarget.dataset.archivePressActive = 'true'
              }}
              onMouseUp={(event) => {
                delete event.currentTarget.dataset.archivePressActive
              }}
              onMouseLeave={(event) => {
                delete event.currentTarget.dataset.archivePressActive
              }}
              onBlur={(event) => {
                delete event.currentTarget.dataset.archivePressActive
              }}
              onClick={() => onChange(tab.id)}
              style={getArchiveTabStyle(isActive)}
            >
              {tab.label}
              <span style={getArchiveTabCountStyle(isActive)}>
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
      data-archive-motion="year-divider"
      data-archive-motion-mode="fade"
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

function ProofChip({ hasProof }: { hasProof: boolean }) {
  return hasProof ? <Chip tone="success">● 已留证</Chip> : <Chip>● 未留证</Chip>
}

function UnmatchedTag({ testId }: { testId?: string }) {
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 20,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--color-outline)',
        color: 'var(--color-on-surface-variant)',
        background: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)',
        fontSize: 10,
        lineHeight: '14px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      未关联
    </span>
  )
}

function ArchiveMediaChipShell({
  children,
  side,
  testId,
}: {
  children: ReactNode
  side: 'left' | 'right'
  testId: string
}) {
  const sidePosition: CSSProperties = side === 'left' ? { left: 10 } : { right: 10 }

  return (
    <div
      data-testid={testId}
      style={{
        position: 'absolute',
        top: 10,
        ...sidePosition,
        display: 'inline-flex',
        padding: 2,
        borderRadius: 'var(--radius-pill)',
        border: '1px solid color-mix(in srgb, var(--color-on-surface) 18%, transparent)',
        background: 'color-mix(in srgb, var(--color-surface) 74%, transparent)',
        boxShadow: '0 8px 20px color-mix(in srgb, var(--color-surface) 60%, transparent)',
        textShadow: '0 1px 2px color-mix(in srgb, var(--color-surface) 88%, transparent)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.08)',
        backdropFilter: 'blur(10px) saturate(1.08)',
      }}
    >
      {children}
    </div>
  )
}

function TripMedia({ trip }: { trip: ArchiveTripViewModel }) {
  const background = trip.photoUrl
    ? `url("${trip.photoUrl}") center 35% / cover no-repeat`
    : 'radial-gradient(circle at 30% 18%, color-mix(in srgb, var(--color-surface-elevated) 82%, var(--color-on-surface)) 0, transparent 36%), linear-gradient(145deg, var(--color-surface-elevated), var(--color-surface))'

  return (
    <div
      data-testid="archive-trip-media"
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
            'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 78%, transparent) 0%, color-mix(in srgb, var(--color-surface) 58%, transparent) 22%, color-mix(in srgb, var(--color-surface) 18%, transparent) 48%, transparent 62%), linear-gradient(180deg, transparent 42%, color-mix(in srgb, var(--color-surface) 88%, transparent) 100%)',
        }}
      />
      <ArchiveMediaChipShell side="left" testId="archive-trip-chip-summit">
        {trip.isSummit ? <Chip tone="success">● 已登顶</Chip> : <Chip tone="warn">● 未登顶</Chip>}
      </ArchiveMediaChipShell>
      <ArchiveMediaChipShell side="right" testId="archive-trip-chip-proof">
        <ProofChip hasProof={trip.hasProof} />
      </ArchiveMediaChipShell>
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
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              minWidth: 0,
            }}
          >
            <span
              data-testid="archive-trip-title"
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
            </span>
            {trip.mountain.unmatchedTag ? <UnmatchedTag testId="archive-trip-unmatched-tag" /> : null}
          </div>
          <div
            data-testid="archive-trip-secondary"
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
            data-testid="archive-trip-max-altitude-value"
            style={{
              ...monoStyle,
              color: 'var(--color-success)',
              fontSize: 'var(--font-title-l-size)',
              lineHeight: 1,
              fontWeight: 800,
            }}
          >
            {trip.metrics.maxAltitudeM > 0 ? (
              <>
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
              </>
            ) : (
              '--'
            )}
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
      data-archive-trip-card={trip.id}
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
      <section data-archive-motion="empty-state" style={{ padding: '28px var(--space-6) 0' }}>
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
              fontSize: 'var(--font-title-l-size)',
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
        data-archive-motion="empty-copy"
        data-archive-motion-mode="fade"
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
  const motionScopeRef = useRef<HTMLDivElement | null>(null)
  const replayArchiveListRef = useRef<(() => void) | null>(null)
  const terminalizeArchiveListRef = useRef<(() => void) | null>(null)
  const pendingFilterReplayRef = useRef(false)
  const [activeFilter, setActiveFilter] = useState<FilterId>('all')
  const filteredTrips = useMemo(() => filterTrips(trips, activeFilter), [trips, activeFilter])
  const filteredTripSignature = useMemo(() => filteredTrips.map((trip) => trip.id).join('|'), [filteredTrips])
  const yearGroups = useMemo(() => groupTripsByYear(filteredTrips), [filteredTrips])
  const hasTrips = trips.length > 0

  function handleBack() {
    router.replace('/explore')
  }

  function handleFilterChange(nextFilter: FilterId) {
    if (nextFilter === activeFilter) return
    terminalizeArchiveListRef.current?.()
    pendingFilterReplayRef.current = true
    setActiveFilter(nextFilter)
  }

  useGSAP((_context, contextSafe) => {
    const root = motionScopeRef.current
    if (!root) return

    const getScopedTargets = (selector: string, scope: ParentNode = root) =>
      gsap.utils.toArray<HTMLElement>(scope.querySelectorAll(selector)).filter((target) => root.contains(target))

    const getMotionTargets = () => getScopedTargets('[data-archive-motion]')
    const getFirstScreenTripCards = () => getScopedTargets('[data-archive-trip-card]').slice(0, 4)
    const getLiveArchiveListTargets = () => {
      const yearDividers = getScopedTargets('[data-archive-motion="year-divider"]')
      const tripCards = getScopedTargets('[data-archive-trip-card]')
      const footer = getScopedTargets('[data-archive-motion="footer"]')
      return {
        yearDividers,
        tripCards,
        firstScreenTripCards: tripCards.slice(0, 4),
        terminalTargets: [...yearDividers, ...tripCards, ...footer],
      }
    }
    const getAnimatedTargets = () => [
      ...getMotionTargets(),
      ...getFirstScreenTripCards(),
      ...getScopedTargets('[data-archive-stat-tile]'),
    ]

    const terminalizeArchiveCountValues = () => {
      for (const valueNode of getScopedTargets('[data-archive-stat-value]')) {
        const finalText = valueNode.dataset.finalText
        if (finalText) valueNode.textContent = finalText
      }
    }

    const terminalizeArchiveMotion = () => {
      if (!root.isConnected) return
      const targets = getAnimatedTargets()
      if (targets.length > 0) {
        gsap.set(targets, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          clearProps: 'willChange,transform',
        })
      }
      terminalizeArchiveCountValues()
    }

    let archiveListReplayTimeline: gsap.core.Timeline | null = null

    const terminalizeArchiveListMotion = () => {
      if (!root.isConnected) return
      const { terminalTargets } = getLiveArchiveListTargets()
      if (terminalTargets.length > 0) {
        gsap.set(terminalTargets, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          clearProps: 'willChange,transform',
        })
      }
    }

    const stopArchiveListReplay = () => {
      archiveListReplayTimeline?.kill()
      archiveListReplayTimeline = null
      terminalizeArchiveListMotion()
    }

    const runArchiveListReplay = () => {
      if (!root.isConnected) return
      stopArchiveListReplay()

      const { yearDividers, firstScreenTripCards, terminalTargets } = getLiveArchiveListTargets()
      if (terminalTargets.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        terminalizeArchiveListMotion()
        return
      }

      if (yearDividers.length > 0) gsap.set(yearDividers, { willChange: 'opacity' })
      if (firstScreenTripCards.length > 0) {
        gsap.set(firstScreenTripCards, {
          willChange: 'transform, opacity',
        })
      }

      const fadeDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.2)
      const replayDuration = Math.min(Math.max(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.42), 0.52)

      archiveListReplayTimeline = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: terminalizeArchiveListMotion,
        onInterrupt: terminalizeArchiveListMotion,
      })
      archiveListReplayTimeline.addLabel('listReplay', 0)

      if (yearDividers.length > 0) {
        archiveListReplayTimeline.fromTo(yearDividers, { autoAlpha: 0 }, {
          autoAlpha: 1,
          duration: fadeDuration,
          ease: 'power3.out',
        }, 'listReplay')
      }

      if (firstScreenTripCards.length > 0) {
        archiveListReplayTimeline.fromTo(firstScreenTripCards, { autoAlpha: 0, y: 16, scale: 0.96 }, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: replayDuration,
          ease: 'back.out(1.3)',
          stagger: { each: 0.03, from: 'start' },
        }, 'listReplay')
      }
    }

    const runMotion = () => {
      const mm = gsap.matchMedia()
      mm.add(
        {
          allowMotion: '(prefers-reduced-motion: no-preference)',
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (mediaContext) => {
          if (mediaContext.conditions?.reduceMotion) {
            terminalizeArchiveMotion()
            return () => terminalizeArchiveMotion()
          }

          const baseDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.2)
          const enterDuration = Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.24)
          const fastDuration = Math.min(parseMotionTokenSeconds(root, '--motion-fast', 180), 0.16)
          const schedule = {
            header: 0,
            identity: 0.08,
            stats: 0.18,
            filters: 0.3,
            trips: 0.38,
            emptyState: 0.18,
            emptyCopy: 0.46,
            footer: 0.68,
          } as const
          const motionMap = new Map(getMotionTargets().map((target) => [target.dataset.archiveMotion, target]))
          const shiftedTargets = getAnimatedTargets().filter((target) => target.dataset.archiveMotionMode !== 'fade')
          const fadeOnlyTargets = getAnimatedTargets().filter((target) => target.dataset.archiveMotionMode === 'fade')

          if (shiftedTargets.length > 0) gsap.set(shiftedTargets, { willChange: 'transform, opacity' })
          if (fadeOnlyTargets.length > 0) gsap.set(fadeOnlyTargets, { willChange: 'opacity' })

          const timeline = gsap.timeline({
            defaults: { duration: baseDuration, ease: 'power3.out' },
            onComplete: terminalizeArchiveMotion,
            onInterrupt: terminalizeArchiveMotion,
          })

          const addShell = (key: string, label: string, position: number, fromY = 16, scale = 0.98, ease = 'power3.out') => {
            const target = motionMap.get(key)
            if (!target) return
            timeline.addLabel(label, position)
            if (target.dataset.archiveMotionMode === 'fade') {
              timeline.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration: baseDuration, ease: 'power3.out' }, label)
              return
            }
            timeline.fromTo(target, { autoAlpha: 0, y: fromY, scale }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: enterDuration,
              ease,
            }, label)
          }

          addShell('header', 'header', schedule.header, 14, 0.98)
          addShell('identity', 'identity', schedule.identity, 18, 0.96, 'back.out(1.3)')

          const statTiles = getScopedTargets('[data-archive-stat-tile]')
          if (statTiles.length > 0) {
            timeline.addLabel('stats', schedule.stats)
            timeline.fromTo(statTiles, { autoAlpha: 0, y: 12, scale: 0.96 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: fastDuration,
              ease: 'back.out(1.3)',
              stagger: { each: 0.035, from: 'start' },
            }, 'stats')
            for (const valueNode of getScopedTargets('[data-archive-stat-value][data-count-value]')) {
              const rawTarget = Number(valueNode.dataset.countValue)
              const finalText = valueNode.dataset.finalText ?? valueNode.textContent ?? ''
              if (!Number.isFinite(rawTarget)) continue
              const countState = { value: 0 }
              timeline.to(countState, {
                value: rawTarget,
                duration: Math.min(0.46, enterDuration * 1.9),
                ease: 'power2.out',
                onStart: () => {
                  valueNode.textContent = formatMotionCountValue(0, valueNode.dataset.countFormat, finalText)
                },
                onUpdate: () => {
                  valueNode.textContent = formatMotionCountValue(countState.value, valueNode.dataset.countFormat, finalText)
                },
                onComplete: () => {
                  valueNode.textContent = finalText
                },
              }, 'stats')
            }
          }

          addShell('filters', 'filters', schedule.filters, 10, 1)

          const firstScreenTripCards = getFirstScreenTripCards()
          if (firstScreenTripCards.length > 0) {
            timeline.addLabel('trips', schedule.trips)
            firstScreenTripCards.forEach((card, index) => {
              card.dataset.archiveMotionParticipation = 'first-screen'
              card.dataset.archiveMotionIndex = String(index)
            })
            timeline.fromTo(firstScreenTripCards, { autoAlpha: 0, y: 18, scale: 0.96 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: enterDuration,
              ease: 'back.out(1.3)',
              stagger: { each: 0.03, from: 'start' },
            }, 'trips')
          }

          addShell('empty-state', 'emptyState', schedule.emptyState, 18, 0.96, 'back.out(1.3)')
          addShell('empty-copy', 'emptyCopy', schedule.emptyCopy, 0, 1)
          addShell('footer', 'footer', schedule.footer, 0, 1)

          return () => {
            timeline.kill()
            terminalizeArchiveMotion()
          }
        },
        root,
      )

      return () => {
        mm.revert()
        terminalizeArchiveMotion()
      }
    }

    const safeRunMotion = (contextSafe ? contextSafe(runMotion) : runMotion) as () => unknown
    const safeRunArchiveListReplay = (contextSafe ? contextSafe(runArchiveListReplay) : runArchiveListReplay) as () => void
    const safeTerminalizeArchiveList = (contextSafe ? contextSafe(stopArchiveListReplay) : stopArchiveListReplay) as () => void
    replayArchiveListRef.current = safeRunArchiveListReplay
    terminalizeArchiveListRef.current = safeTerminalizeArchiveList
    const cleanup = safeRunMotion()
    return () => {
      replayArchiveListRef.current = null
      terminalizeArchiveListRef.current = null
      stopArchiveListReplay()
      if (typeof cleanup === 'function') cleanup()
      terminalizeArchiveMotion()
    }
  }, { scope: motionScopeRef, dependencies: [] })

  useLayoutEffect(() => {
    if (!pendingFilterReplayRef.current) return
    pendingFilterReplayRef.current = false
    replayArchiveListRef.current?.()
  }, [activeFilter, filteredTripSignature])

  return (
    <main
      ref={motionScopeRef}
      data-archive-motion-root
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
          <FilterTabs active={activeFilter} onChange={handleFilterChange} trips={trips} />
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
            data-archive-motion="footer"
            data-archive-motion-mode="fade"
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
