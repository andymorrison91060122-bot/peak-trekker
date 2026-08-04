'use client'

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import TertiaryButton from '@/components/ui/TertiaryButton'
import EmptyState from '@/components/ui/EmptyState'
import { PinIcon } from '@/components/ui/Icons'
import { getLicenseShortLabel } from '@/lib/license-ui'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { formatMotionCountValue, parseMotionTokenSeconds } from '@/lib/motion-count-format'
import type { CheckinDisplayTitleSource } from '@/lib/checkin-display-title'

gsap.registerPlugin(useGSAP, Flip, ScrollTrigger)
const flipFrom = Flip.from

export type ArchiveUserViewModel = {
  displayName: string
  avatarUrl: string | null
  province: string
  city: string | null
  licenseLevel: string | null
}

export type ArchiveHighestPointViewModel = {
  tripId: string
  mountainName: string
  activityAt: string
  maxAltitudeM: number | null
}

export type ArchiveSummaryViewModel = {
  totalTrips: number
  summitCount: number
  maxAltitudeM: number | null
  recordedAscentM: number
  highestPoint: ArchiveHighestPointViewModel | null
}

export type ArchiveTripViewModel = {
  id: string
  activityAt: string
  note: string | null
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
    maxAltitudeM: number | null
    distanceKm: number
    ascentM: number
    durationSeconds: number
  }
  photoUrl: string | null
  isSummit: boolean
  hasProof: boolean
}

type FilterId = 'all' | 'summit' | 'proof' | 'unproof'
type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>
type CommitReason = 'mount' | 'filter' | 'expand'
type RimTargetHandler = (target: HTMLElement) => void

type YearGroup = {
  year: string
  trips: ArchiveTripViewModel[]
}

const RECENT_YEAR_COUNT = 2
const DEFAULT_VISIBLE_PER_RECENT_YEAR = 3
const SILENCE_THRESHOLD_DAYS = 61
const APP_HEADER_HEIGHT_PX = 69

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const FILTER_LABELS: Record<FilterId, string> = {
  all: '全部',
  summit: '登顶',
  proof: '已留证',
  unproof: '未留证',
}

function getExpandedYearKey(filterId: FilterId, year: string) {
  return `${filterId}:${year}`
}

function getYearSummaryCopy(filterLabel: string, count: number, visibleCount: number, isAll: boolean) {
  const prefix = isAll ? '' : `${filterLabel} `
  return `${prefix}${count} 次 · ${visibleCount > 0 ? `显示 ${visibleCount} 次` : '已折叠'}`
}

function getArchiveFooterCopy(filterLabel: string, count: number, oldestYear: string, isAll: boolean) {
  return `${isAll ? '' : `筛选 ${filterLabel} · `}已收录 ${count} 次 · 始于 ${oldestYear}`
}

function getYearFoldCopy(filterLabel: string, hiddenCount: number, isExpanded: boolean) {
  return isExpanded ? '收起这一年' : `${hiddenCount} 次折叠 · ${filterLabel} · 展开`
}

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value))
}

function formatPositiveAltitude(value: number | null) {
  return value !== null && value > 0 ? formatNumber(value) : '--'
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  if (!safeSeconds) return null
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes ? `${String(minutes).padStart(2, '0')}m` : ''}`.trim()
  return `${Math.max(1, minutes)}m`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '----·--·--'
  return `${date.getFullYear()}·${String(date.getMonth() + 1).padStart(2, '0')}·${String(date.getDate()).padStart(2, '0')}`
}

function formatYearMonth(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '时间暂未记录'
  return `${date.getFullYear()}·${String(date.getMonth() + 1).padStart(2, '0')}`
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
    const year = getYear(trip.activityAt)
    groupMap.set(year, [...(groupMap.get(year) ?? []), trip])
  }
  return [...groupMap.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, yearTrips]) => ({ year, trips: yearTrips }))
}

function getGapDays(laterTrip: ArchiveTripViewModel, earlierTrip: ArchiveTripViewModel) {
  const later = new Date(laterTrip.activityAt).getTime()
  const earlier = new Date(earlierTrip.activityAt).getTime()
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return 0
  return Math.abs(later - earlier) / 86_400_000
}

function getTimelineGapPx(days: number) {
  return Math.round(Math.min(110, Math.max(18, 18 + 42 * Math.log1p(Math.max(0, days - 14) / 30.4375))))
}

function getSilenceCopy(days: number) {
  if (days < SILENCE_THRESHOLD_DAYS) return null
  const months = Math.max(2, Math.round(days / 30.4375))
  return `· ${months} 个月 ·`
}

function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warn' | 'active' }) {
  return <span className={`archive-chip archive-chip--${tone}`}>{children}</span>
}

function Avatar({ user }: { user: ArchiveUserViewModel }) {
  return (
    <div
      aria-label={`${user.displayName} 的头像`}
      role="img"
      className="archive-hero__avatar"
      style={{ backgroundImage: user.avatarUrl ? `url("${user.avatarUrl}")` : undefined }}
    >
      {user.avatarUrl ? null : getInitial(user.displayName)}
    </div>
  )
}

function UserIdentityRow({ user, chip }: { user: ArchiveUserViewModel; chip: ReactNode }) {
  return (
    <div className="archive-hero__identity-row">
      <Avatar user={user} />
      <div className="archive-hero__identity-copy">
        <div className="archive-hero__name">{user.displayName}</div>
        <div className="archive-hero__location">
          <span><PinIcon size={14} />{buildLocationLine(user)}</span>
          {chip}
        </div>
      </div>
    </div>
  )
}

function MotionCount({
  kind,
  value,
  finalText,
  testId,
}: {
  kind: string
  value: number | null
  finalText: string
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      data-archive-stat-value={kind}
      data-count-value={value !== null ? String(value) : undefined}
      data-count-format="integer"
      data-final-text={finalText}
    >
      {finalText}
    </span>
  )
}

function ArchiveHero({ user, summary }: { user: ArchiveUserViewModel; summary: ArchiveSummaryViewModel }) {
  const highestPoint = summary.highestPoint
  const maxText = formatPositiveAltitude(summary.maxAltitudeM)
  return (
    <section data-archive-motion="identity" className="archive-hero">
      <UserIdentityRow user={user} chip={<Chip tone="active">{getLicenseShortLabel(user.licenseLevel)}</Chip>} />
      <div className="archive-hero__peak-block">
        <div className="archive-hero__eyebrow">走到过的最高处</div>
        <div className="archive-hero__peak-value" data-archive-stat-tile="max-altitude">
          <MotionCount
            kind="max-altitude"
            value={summary.maxAltitudeM}
            finalText={maxText}
            testId="archive-summary-max-altitude-value"
          />
          {summary.maxAltitudeM !== null ? <small>m</small> : null}
        </div>
        <div className="archive-hero__peak-source">
          {highestPoint ? `${highestPoint.mountainName} · ${formatYearMonth(highestPoint.activityAt)}` : '还没有可确认的最高处'}
        </div>
      </div>
      <div className="archive-hero__summary" data-archive-stat-tile="summary-line">
        <span><MotionCount kind="total-trips" value={summary.totalTrips} finalText={formatNumber(summary.totalTrips)} /> 次山行</span>
        <span>·</span>
        <span><MotionCount kind="summit-count" value={summary.summitCount} finalText={formatNumber(summary.summitCount)} /> 次登顶</span>
        <span>·</span>
        <span>已记录爬升 <MotionCount kind="recorded-ascent" value={summary.recordedAscentM} finalText={formatNumber(summary.recordedAscentM)} />m</span>
      </div>
      <p className="archive-hero__closing"><span>走过的山，</span><span>都在这里。</span></p>
    </section>
  )
}

function IdentityCardEmpty({ user }: { user: ArchiveUserViewModel }) {
  return (
    <section data-archive-motion="identity" className="archive-hero archive-hero--empty">
      <UserIdentityRow user={user} chip={<Chip>新人</Chip>} />
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
  const tabs: Array<{ id: FilterId; label: string; count: number }> = [
    { id: 'all', label: '全部', count: trips.length },
    { id: 'summit', label: '登顶', count: trips.filter((trip) => trip.isSummit).length },
    { id: 'proof', label: '已留证', count: trips.filter((trip) => trip.hasProof).length },
    { id: 'unproof', label: '未留证', count: trips.filter((trip) => !trip.hasProof).length },
  ]
  return (
    <section
      data-archive-motion="filters"
      className="archive-filter-tabs"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            className="archive-filter-tab pt-pressable"
            data-archive-filter-tab={tab.id}
            aria-pressed={isActive}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
            onClick={() => onChange(tab.id)}
            style={getArchiveTabStyle(isActive)}
          >
            <span>{tab.label}</span><small style={getArchiveTabCountStyle(isActive)}>{tab.count}</small>
          </button>
        )
      })}
    </section>
  )
}

function getArchiveTabStyle(isActive: boolean): CSSProperties {
  return { '--archive-tab-selected': isActive ? 1 : 0 } as CSSProperties
}

function getArchiveTabCountStyle(isActive: boolean): CSSProperties {
  return { opacity: isActive ? 0.72 : 0.62 }
}

function YearDivider({ year, count, visibleCount, activeFilter }: { year: string; count: number; visibleCount: number; activeFilter: FilterId }) {
  return (
    <div data-archive-motion="year-divider" data-archive-motion-mode="fade" className="archive-year-divider">
      <span className="archive-year-divider__node" aria-hidden="true" />
      <strong>{year}</strong>
      <small>{getYearSummaryCopy(FILTER_LABELS[activeFilter], count, visibleCount, activeFilter === 'all')}</small>
    </div>
  )
}

function UnmatchedTag({ testId }: { testId?: string }) {
  return <span data-testid={testId} className="archive-trip__unmatched">未关联</span>
}

function SummitTag({ isSummit }: { isSummit: boolean }) {
  return <span className={`archive-trip__summit archive-trip__summit--${isSummit ? 'yes' : 'no'}`}>{isSummit ? '登顶' : '未登顶'}</span>
}

function TripMedia({ trip, isHighestPoint }: { trip: ArchiveTripViewModel; isHighestPoint: boolean }) {
  return (
    <div data-testid="archive-trip-media" className="archive-trip__media">
      <div className="archive-trip__media-frame" style={{ backgroundImage: `url("${trip.photoUrl}")` }}>
        <span className="archive-trip__media-scrim" aria-hidden="true" />
        {isHighestPoint ? <span className="archive-trip__highest-chip">· 最高处</span> : null}
        <span className="archive-trip__media-altitude" data-testid="archive-trip-max-altitude-value">
          {formatPositiveAltitude(trip.metrics.maxAltitudeM)}
          {trip.metrics.maxAltitudeM !== null ? <small>m</small> : null}
        </span>
      </div>
      <span className="archive-rim archive-rim--media" data-archive-rim aria-hidden="true" />
    </div>
  )
}

function TripContentAltitude({ trip, isHighestPoint }: { trip: ArchiveTripViewModel; isHighestPoint: boolean }) {
  return (
    <div className="archive-trip__content-altitude-row">
      <span className="archive-trip__content-altitude" data-testid="archive-trip-max-altitude-value">
        {formatPositiveAltitude(trip.metrics.maxAltitudeM)}
        {trip.metrics.maxAltitudeM !== null ? <small>m</small> : null}
      </span>
      {isHighestPoint ? <span className="archive-trip__content-highest">· 最高处</span> : null}
    </div>
  )
}

function TripMetrics({ trip }: { trip: ArchiveTripViewModel }) {
  const metrics = [
    trip.metrics.maxAltitudeM !== null ? `${formatNumber(trip.metrics.maxAltitudeM)}m` : null,
    trip.metrics.distanceKm > 0 ? `${trip.metrics.distanceKm.toFixed(1)}km` : null,
    trip.metrics.ascentM > 0 ? `爬升 ${formatNumber(trip.metrics.ascentM)}m` : null,
    formatDuration(trip.metrics.durationSeconds),
  ].filter(Boolean)
  return metrics.length ? <div className="archive-trip__metrics">{metrics.join(' · ')}</div> : null
}

function TripCard({
  trip,
  isHighestPoint,
  onOpen,
  onRimStart,
  onRimEnd,
}: {
  trip: ArchiveTripViewModel
  isHighestPoint: boolean
  onOpen: () => void
  onRimStart: RimTargetHandler
  onRimEnd: RimTargetHandler
}) {
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    markPressFallback(event)
    onRimStart(event.currentTarget)
  }
  const handleRelease = (event: PointerEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
    clearPressFallback(event)
    onRimEnd(event.currentTarget)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
    event.currentTarget.dataset.ptPressActive = 'true'
    onRimStart(event.currentTarget)
  }
  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    delete event.currentTarget.dataset.ptPressActive
    onRimEnd(event.currentTarget)
  }
  return (
    <div data-archive-trip-card={trip.id} className="archive-trip-motion-shell">
      <button
        type="button"
        data-archive-trip-surface={trip.id}
        data-archive-rim-owner={trip.id}
        className={`archive-trip pt-pressable-card${trip.photoUrl ? ' archive-trip--photo' : ' archive-trip--text'}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onPointerLeave={handleRelease}
        onBlur={handleRelease}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={onOpen}
      >
        <div className="archive-trip__surface-content">
          <div className="archive-trip__meta" data-testid="archive-trip-secondary">
            <span>{formatDate(trip.activityAt)} · {buildTripLocation(trip)}{trip.hasProof ? <em> · 已留证</em> : null}</span>
            <span aria-hidden="true">›</span>
          </div>
          <div className="archive-trip__title-row">
            <span data-testid="archive-trip-title" className="archive-trip__title">{trip.mountain.name}</span>
            {trip.mountain.unmatchedTag ? <UnmatchedTag testId="archive-trip-unmatched-tag" /> : <SummitTag isSummit={trip.isSummit} />}
          </div>
          {trip.photoUrl ? <TripMedia trip={trip} isHighestPoint={isHighestPoint} /> : <TripContentAltitude trip={trip} isHighestPoint={isHighestPoint} />}
          {trip.note ? <p className="archive-trip__note">「{trip.note}」</p> : null}
          <TripMetrics trip={trip} />
        </div>
        {trip.photoUrl ? null : <span className="archive-rim archive-rim--content" data-archive-rim aria-hidden="true" />}
      </button>
    </div>
  )
}

function TimelineGap({ days }: { days: number }) {
  const silenceCopy = getSilenceCopy(days)
  return (
    <div className="archive-timeline__gap" style={{ height: getTimelineGapPx(days) }} aria-hidden="true">
      {silenceCopy ? <span>{silenceCopy}</span> : null}
    </div>
  )
}

function TimelineTrip({
  trip,
  previousTrip,
  isHighestPoint,
  onOpen,
  onRimStart,
  onRimEnd,
}: {
  trip: ArchiveTripViewModel
  previousTrip: ArchiveTripViewModel | null
  isHighestPoint: boolean
  onOpen: () => void
  onRimStart: RimTargetHandler
  onRimEnd: RimTargetHandler
}) {
  const nodeTone = trip.mountain.unmatchedTag ? 'unmatched' : trip.isSummit ? 'summit' : 'turned'
  return (
    <div data-archive-flip-item={trip.id} className="archive-timeline__entry">
      {previousTrip ? <TimelineGap days={getGapDays(previousTrip, trip)} /> : null}
      <div className="archive-timeline__entry-grid">
        <div className="archive-timeline__node-column">
          <span data-archive-node={trip.id} className={`archive-timeline__node archive-timeline__node--${nodeTone}`} aria-hidden="true">
            {trip.isSummit ? <span className="archive-node-halo" data-archive-node-halo={trip.id} /> : null}
          </span>
        </div>
        <TripCard trip={trip} isHighestPoint={isHighestPoint} onOpen={onOpen} onRimStart={onRimStart} onRimEnd={onRimEnd} />
      </div>
    </div>
  )
}

function YearFoldButton({
  year,
  hiddenCount,
  isExpanded,
  contentId,
  onToggle,
  filterLabel,
}: {
  year: string
  hiddenCount: number
  isExpanded: boolean
  contentId: string
  onToggle: () => void
  filterLabel: string
}) {
  return (
    <button
      type="button"
      data-archive-year-toggle={year}
      data-archive-flip-item={`toggle-${year}`}
      className="archive-year-toggle pt-pressable"
      aria-expanded={isExpanded}
      aria-controls={contentId}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
      onClick={onToggle}
    >
      <span>{getYearFoldCopy(filterLabel, hiddenCount, isExpanded)}</span>
      <span aria-hidden="true">{isExpanded ? '⌃' : '⌄'}</span>
    </button>
  )
}

function ArchiveYearSection({
  group,
  groupIndex,
  isExpanded,
  highestPointId,
  onToggle,
  onOpen,
  activeFilter,
  onRimStart,
  onRimEnd,
}: {
  group: YearGroup
  groupIndex: number
  isExpanded: boolean
  highestPointId: string | null
  onToggle: () => void
  onOpen: (trip: ArchiveTripViewModel) => void
  activeFilter: FilterId
  onRimStart: RimTargetHandler
  onRimEnd: RimTargetHandler
}) {
  const defaultVisibleCount = groupIndex < RECENT_YEAR_COUNT ? Math.min(DEFAULT_VISIBLE_PER_RECENT_YEAR, group.trips.length) : 0
  const visibleTrips = isExpanded ? group.trips : group.trips.slice(0, defaultVisibleCount)
  const hiddenCount = Math.max(0, group.trips.length - visibleTrips.length)
  const contentId = `archive-year-${group.year}-records`
  return (
    <section data-archive-year={group.year} data-archive-flip-item={`year-${group.year}`} className="archive-year-section">
      <YearDivider year={group.year} count={group.trips.length} visibleCount={visibleTrips.length} activeFilter={activeFilter} />
      <div id={contentId} className="archive-year-records">
        {visibleTrips.map((trip, index) => (
          <TimelineTrip
            key={trip.id}
            trip={trip}
            previousTrip={index > 0 ? visibleTrips[index - 1] : null}
            isHighestPoint={trip.id === highestPointId}
            onOpen={() => onOpen(trip)}
            onRimStart={onRimStart}
            onRimEnd={onRimEnd}
          />
        ))}
      </div>
      {hiddenCount > 0 || isExpanded ? (
        <YearFoldButton
          year={group.year}
          hiddenCount={isExpanded ? group.trips.length : hiddenCount}
          isExpanded={isExpanded}
          contentId={contentId}
          onToggle={onToggle}
          filterLabel={FILTER_LABELS[activeFilter]}
        />
      ) : null}
    </section>
  )
}

function ArchiveTimeline({ children }: { children: ReactNode }) {
  return (
    <div data-archive-timeline className="archive-timeline">
      <svg data-archive-timeline-svg className="archive-timeline__rail" aria-hidden="true" preserveAspectRatio="none">
        <path data-archive-timeline-base d="M 36 0 L 36 1" />
        <path data-archive-timeline-progress d="M 36 0 L 36 1" />
      </svg>
      {children}
    </div>
  )
}

function FilterEmptyState({ onShowAll }: { onShowAll: () => void }) {
  return (
    <section data-archive-motion="filter-empty" data-archive-motion-mode="fade" className="archive-filter-empty">
      <p>当前筛选下没有山行</p>
      <TertiaryButton onClick={onShowAll}>查看全部</TertiaryButton>
    </section>
  )
}

function ArchiveFooter({ trips, activeFilter }: { trips: ArchiveTripViewModel[]; activeFilter: FilterId }) {
  const oldestYear = trips.length ? getYear(trips[trips.length - 1].activityAt) : '----'
  return (
    <footer data-archive-motion="footer" data-archive-motion-mode="fade" className="archive-footer">
      <strong>档案至此</strong>
      <span>{getArchiveFooterCopy(FILTER_LABELS[activeFilter], trips.length, oldestYear, activeFilter === 'all')}</span>
    </footer>
  )
}

function ArchiveEmptyAction({
  id,
  children,
  onRimStart,
  onRimEnd,
}: {
  id: 'find-mountain' | 'bring-back'
  children: ReactNode
  onRimStart: RimTargetHandler
  onRimEnd: RimTargetHandler
}) {
  const getActionButton = (target: EventTarget) => target instanceof HTMLElement ? target.closest<HTMLElement>('button') : null
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const button = getActionButton(event.target)
    if (button) button.dataset.ptPressActive = 'true'
    onRimStart(event.currentTarget)
  }
  const handleRelease = (event: PointerEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) => {
    const button = getActionButton(event.target)
    if (button) delete button.dataset.ptPressActive
    onRimEnd(event.currentTarget)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
    const button = getActionButton(event.target)
    if (button) button.dataset.ptPressActive = 'true'
    onRimStart(event.currentTarget)
  }
  const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const button = getActionButton(event.target)
    if (button) delete button.dataset.ptPressActive
    onRimEnd(event.currentTarget)
  }
  return (
    <div
      className="archive-empty-action"
      data-archive-empty-cta={id}
      data-archive-rim-owner={id}
      onPointerDown={handlePointerDown}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
      onPointerLeave={handleRelease}
      onBlur={handleRelease}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {children}
      <span className="archive-rim archive-rim--action" data-archive-rim aria-hidden="true" />
    </div>
  )
}

function ArchiveEmptyState({ onFindMountain, onBringBack, onRimStart, onRimEnd }: { onFindMountain: () => void; onBringBack: () => void; onRimStart: RimTargetHandler; onRimEnd: RimTargetHandler }) {
  const privacyCopy = isFeatureEnabled('COMMUNITY_ENABLED')
    ? '想发到山友圈时再发 · Peak Trekker 不会替你声张。'
    : '想分享时再分享 · Peak Trekker 不会替你声张。'
  return (
    <>
      <EmptyState
        data-archive-motion="empty-state"
        className="pt-empty-state--surface pt-empty-state--archive-hero"
        eyebrow="0 / 0"
        title="档案还没有一次山行"
        copy={<><span>去一次真实的山，</span><br /><span>回来把它放进这里。</span></>}
        actions={[
          <ArchiveEmptyAction key="find-mountain" id="find-mountain" onRimStart={onRimStart} onRimEnd={onRimEnd}>
            <PrimaryButton onClick={onFindMountain} style={{ width: '100%' }}>去找一座山</PrimaryButton>
          </ArchiveEmptyAction>,
          <ArchiveEmptyAction key="bring-back" id="bring-back" onRimStart={onRimStart} onRimEnd={onRimEnd}>
            <SecondaryButton onClick={onBringBack} style={{ width: '100%' }}>把以前的山行带回来</SecondaryButton>
          </ArchiveEmptyAction>,
        ]}
        style={{ margin: '28px var(--space-6) 0', padding: '26px var(--space-5)' }}
      />
      <section data-archive-motion="empty-copy" data-archive-motion-mode="fade" className="archive-empty-copy">
        档案只保存 <span>自己</span> 的山行记录。<br />{privacyCopy}
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
  const rebuildArchiveScrollMotionRef = useRef<(() => void) | null>(null)
  const captureArchiveFlipRef = useRef<(() => void) | null>(null)
  const runArchiveFlipRef = useRef<(() => void) | null>(null)
  const pendingArchiveCommitRef = useRef<CommitReason>('mount')
  const pendingFilterReplayRef = useRef(false)
  const archiveBatchTriggersRef = useRef<ScrollTrigger[]>([])
  const archiveProgressTriggerRef = useRef<ScrollTrigger | null>(null)
  const archiveProgressTweenRef = useRef<gsap.core.Tween | null>(null)
  const archiveFlipTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const archiveNodePositionMapRef = useRef<Map<string, number>>(new Map())
  const mountHaloPlayedRef = useRef<Set<string>>(new Set())
  const scrollHaloPlayedRef = useRef<Set<string>>(new Set())
  const pendingFlipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null)
  const playArchiveRimRef = useRef<RimTargetHandler | null>(null)
  const releaseArchiveRimRef = useRef<RimTargetHandler | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterId>('all')
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({})

  const filteredTrips = useMemo(() => filterTrips(trips, activeFilter), [trips, activeFilter])
  const filteredTripSignature = useMemo(() => filteredTrips.map((trip) => trip.id).join('|'), [filteredTrips])
  const yearGroups = useMemo(() => groupTripsByYear(filteredTrips), [filteredTrips])
  const expandedSignature = useMemo(
    () => Object.entries(expandedYears).filter(([, expanded]) => expanded).map(([year]) => year).sort().join('|'),
    [expandedYears],
  )
  const hasTrips = trips.length > 0

  function handleFilterChange(nextFilter: FilterId) {
    if (nextFilter === activeFilter) return
    terminalizeArchiveListRef.current?.()
    pendingFilterReplayRef.current = true
    pendingArchiveCommitRef.current = 'filter'
    setActiveFilter(nextFilter)
  }

  function handleYearToggle(year: string) {
    captureArchiveFlipRef.current?.()
    pendingArchiveCommitRef.current = 'expand'
    const expandedKey = getExpandedYearKey(activeFilter, year)
    setExpandedYears((current) => ({ ...current, [expandedKey]: !current[expandedKey] }))
  }

  const handleRimStart: RimTargetHandler = (target) => playArchiveRimRef.current?.(target)
  const handleRimEnd: RimTargetHandler = (target) => releaseArchiveRimRef.current?.(target)

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
      const nodes = getScopedTargets('[data-archive-node]')
      const controls = getScopedTargets('[data-archive-year-toggle]')
      const filterEmpty = getScopedTargets('[data-archive-motion="filter-empty"]')
      const footer = getScopedTargets('[data-archive-motion="footer"]')
      const rims = getScopedTargets('[data-archive-rim]')
      const nodeHalos = getScopedTargets('[data-archive-node-halo]')
      const tripSurfaces = getScopedTargets('[data-archive-trip-surface]')
      return {
        yearDividers,
        tripCards,
        nodes,
        controls,
        filterEmpty,
        rims,
        nodeHalos,
        tripSurfaces,
        firstScreenTripCards: tripCards.slice(0, 4),
        terminalTargets: [...yearDividers, ...tripCards, ...nodes, ...controls, ...filterEmpty, ...footer],
      }
    }
    const getAnimatedTargets = () => [
      ...getMotionTargets(),
      ...getFirstScreenTripCards(),
      ...getScopedTargets('[data-archive-stat-tile]'),
      ...getScopedTargets('[data-archive-node]'),
      ...getScopedTargets('[data-archive-empty-cta]'),
    ]

    const terminalizeArchiveCountValues = () => {
      for (const valueNode of getScopedTargets('[data-archive-stat-value]')) {
        const finalText = valueNode.dataset.finalText
        if (finalText !== undefined) valueNode.textContent = finalText
      }
    }

    const hideArchiveDecorations = () => {
      const decorations = getScopedTargets('[data-archive-rim], [data-archive-node-halo]')
      if (decorations.length) gsap.set(decorations, { autoAlpha: 0, scale: 1, clearProps: 'willChange,transform' })
    }

    const setAllArchiveNodesLit = () => {
      for (const node of getScopedTargets('[data-archive-node]')) node.classList.add('archive-timeline__node--lit')
    }

    const terminalizeArchiveTrack = () => {
      const basePath = root.querySelector<SVGPathElement>('[data-archive-timeline-base]')
      const progressPath = root.querySelector<SVGPathElement>('[data-archive-timeline-progress]')
      if (basePath) gsap.set(basePath, { strokeDashoffset: 0, clearProps: 'willChange' })
      if (!progressPath) return
      const progressTrigger = archiveProgressTriggerRef.current
      if (!progressTrigger) {
        gsap.set(progressPath, { strokeDashoffset: 0, clearProps: 'willChange' })
        setAllArchiveNodesLit()
        return
      }
      const length = progressPath.getTotalLength()
      const litLength = length * progressTrigger.progress
      gsap.set(progressPath, { strokeDasharray: length, strokeDashoffset: Math.max(0, length - litLength), clearProps: 'willChange' })
    }

    const terminalizeArchiveMotion = () => {
      if (!root.isConnected) return
      const targets = getAnimatedTargets()
      if (targets.length) {
        gsap.set(targets, { autoAlpha: 1, x: 0, y: 0, scale: 1, clearProps: 'willChange,transform' })
      }
      hideArchiveDecorations()
      terminalizeArchiveTrack()
      terminalizeArchiveCountValues()
    }

    const getRimForTarget = (target: HTMLElement) => {
      const owner = target.matches('[data-archive-rim-owner]')
        ? target
        : target.closest<HTMLElement>('[data-archive-rim-owner]')
      return owner?.querySelector<HTMLElement>('[data-archive-rim]') ?? null
    }

    const playArchiveRim = (target: HTMLElement) => {
      const rim = getRimForTarget(target)
      if (!rim || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (rim) gsap.set(rim, { autoAlpha: 0, scale: 1, clearProps: 'transform' })
        return
      }
      gsap.killTweensOf(rim)
      gsap.fromTo(rim, { autoAlpha: 0, scale: 1 }, {
        autoAlpha: 1,
        scale: 1.03,
        duration: Math.min(0.35, Math.max(0.32, parseMotionTokenSeconds(root, '--motion-enter', 320))),
        ease: 'power2.out',
        overwrite: true,
      })
    }

    const releaseArchiveRim = (target: HTMLElement) => {
      const rim = getRimForTarget(target)
      if (!rim) return
      gsap.killTweensOf(rim)
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(rim, { autoAlpha: 0, scale: 1, clearProps: 'transform' })
        return
      }
      gsap.to(rim, {
        autoAlpha: 0,
        scale: 1,
        duration: Math.min(0.42, Math.max(0.28, parseMotionTokenSeconds(root, '--motion-base', 240))),
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => gsap.set(rim, { autoAlpha: 0, scale: 1, clearProps: 'transform' }),
        onInterrupt: () => gsap.set(rim, { autoAlpha: 0, scale: 1, clearProps: 'transform' }),
      })
    }

    const playArchiveNodeHalo = (node: HTMLElement, domain: 'mount' | 'scroll') => {
      const id = node.dataset.archiveNode
      const halo = node.querySelector<HTMLElement>('[data-archive-node-halo]')
      if (!id || !halo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const played = domain === 'mount' ? mountHaloPlayedRef.current : scrollHaloPlayedRef.current
      if (played.has(id)) return
      played.add(id)
      gsap.killTweensOf(halo)
      gsap.fromTo(halo, { autoAlpha: 1, scale: 0.6 }, {
        autoAlpha: 0,
        scale: 1.4,
        duration: Math.min(0.45, Math.max(0.42, parseMotionTokenSeconds(root, '--motion-status', 420))),
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => gsap.set(halo, { autoAlpha: 0, scale: 1, clearProps: 'transform' }),
        onInterrupt: () => gsap.set(halo, { autoAlpha: 0, scale: 1, clearProps: 'transform' }),
      })
    }

    const updateArchiveNodeLighting = (litLength: number, allowHalo: boolean) => {
      const liveNodes = new Map(getScopedTargets('[data-archive-node]').map((node) => [node.dataset.archiveNode ?? '', node]))
      for (const [id, nodeY] of archiveNodePositionMapRef.current.entries()) {
        const node = liveNodes.get(id)
        if (!node) continue
        const wasLit = node.classList.contains('archive-timeline__node--lit')
        const isLit = nodeY <= litLength
        node.classList.toggle('archive-timeline__node--lit', isLit)
        if (allowHalo && isLit && !wasLit && node.classList.contains('archive-timeline__node--summit')) {
          playArchiveNodeHalo(node, 'scroll')
        }
      }
    }

    const killArchiveScrollMotion = () => {
      for (const trigger of archiveBatchTriggersRef.current) trigger.kill()
      archiveBatchTriggersRef.current = []
      archiveProgressTriggerRef.current?.kill()
      archiveProgressTriggerRef.current = null
      archiveProgressTweenRef.current?.kill()
      archiveProgressTweenRef.current = null
      gsap.killTweensOf(getScopedTargets('[data-archive-node-halo]'))
      hideArchiveDecorations()
      archiveNodePositionMapRef.current.clear()
    }

    const syncTimelineGeometry = () => {
      const timeline = root.querySelector<HTMLElement>('[data-archive-timeline]')
      const svg = root.querySelector<SVGSVGElement>('[data-archive-timeline-svg]')
      const basePath = root.querySelector<SVGPathElement>('[data-archive-timeline-base]')
      const progressPath = root.querySelector<SVGPathElement>('[data-archive-timeline-progress]')
      if (!timeline || !svg || !basePath || !progressPath) return null
      const height = Math.max(1, timeline.scrollHeight)
      const pathData = `M 36 0 L 36 ${height}`
      svg.setAttribute('viewBox', `0 0 72 ${height}`)
      basePath.setAttribute('d', pathData)
      progressPath.setAttribute('d', pathData)
      const timelineTop = timeline.getBoundingClientRect().top
      archiveNodePositionMapRef.current = new Map(
        getScopedTargets('[data-archive-node]', timeline).map((node) => [
          node.dataset.archiveNode ?? '',
          node.getBoundingClientRect().top - timelineTop + node.offsetHeight / 2,
        ]),
      )
      return { timeline, basePath, progressPath, height }
    }

    const rebuildArchiveScrollMotion = () => {
      killArchiveScrollMotion()
      const geometry = syncTimelineGeometry()
      if (!geometry) {
        terminalizeArchiveMotion()
        ScrollTrigger.refresh()
        return
      }
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reducedMotion) {
        const length = geometry.progressPath.getTotalLength()
        gsap.set([geometry.basePath, geometry.progressPath], { strokeDasharray: length, strokeDashoffset: 0 })
        setAllArchiveNodesLit()
        hideArchiveDecorations()
        ScrollTrigger.refresh()
        return
      }
      const belowFoldCards = getScopedTargets('[data-archive-trip-card]').slice(4)
      if (belowFoldCards.length) {
        archiveBatchTriggersRef.current = ScrollTrigger.batch(belowFoldCards, {
          start: 'top 92%',
          once: true,
          onEnter: (batch) => {
            gsap.fromTo(batch, { autoAlpha: 0, x: -14 }, {
              autoAlpha: 1,
              x: 0,
              duration: Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.32),
              ease: 'power3.out',
              stagger: { each: 0.04, from: 'start' },
              onComplete: terminalizeArchiveMotion,
              onInterrupt: terminalizeArchiveMotion,
            })
          },
        })
      }
      const length = geometry.progressPath.getTotalLength()
      updateArchiveNodeLighting(0, false)
      archiveProgressTweenRef.current = gsap.fromTo(
        geometry.progressPath,
        { strokeDasharray: length, strokeDashoffset: length },
        {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: geometry.timeline,
            start: 'top 78%',
            end: 'bottom 72%',
            scrub: 0.6,
            onUpdate: (self) => updateArchiveNodeLighting(geometry.height * self.progress, true),
          },
        },
      )
      archiveProgressTriggerRef.current = archiveProgressTweenRef.current.scrollTrigger ?? null
      ScrollTrigger.refresh()
    }

    let archiveListReplayTimeline: gsap.core.Timeline | null = null
    const terminalizeArchiveListMotion = () => {
      if (!root.isConnected) return
      const { terminalTargets } = getLiveArchiveListTargets()
      if (terminalTargets.length) {
        gsap.set(terminalTargets, { autoAlpha: 1, x: 0, y: 0, scale: 1, clearProps: 'willChange,transform' })
      }
      hideArchiveDecorations()
      terminalizeArchiveTrack()
    }
    const stopArchiveListReplay = () => {
      archiveListReplayTimeline?.kill()
      archiveListReplayTimeline = null
      archiveFlipTimelineRef.current?.kill()
      archiveFlipTimelineRef.current = null
      gsap.killTweensOf(getScopedTargets('[data-archive-rim], [data-archive-node-halo]'))
      terminalizeArchiveListMotion()
    }
    const runArchiveListReplay = () => {
      if (!root.isConnected) return
      stopArchiveListReplay()
      killArchiveScrollMotion()
      const geometry = syncTimelineGeometry()
      const { yearDividers, nodes, firstScreenTripCards, filterEmpty, terminalTargets } = getLiveArchiveListTargets()
      const firstScreenNodes = nodes.slice(0, 4)
      if (!terminalTargets.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        terminalizeArchiveListMotion()
        rebuildArchiveScrollMotion()
        return
      }
      const fadeDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.2)
      const replayDuration = Math.min(Math.max(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.32), 0.42)
      const finishReplay = () => {
        terminalizeArchiveListMotion()
        rebuildArchiveScrollMotion()
      }
      archiveListReplayTimeline = gsap.timeline({ onComplete: finishReplay, onInterrupt: terminalizeArchiveListMotion })
      archiveListReplayTimeline.addLabel('listReplay', 0)
      if (geometry) {
        const length = geometry.basePath.getTotalLength()
        archiveListReplayTimeline.fromTo(geometry.basePath, { strokeDasharray: length, strokeDashoffset: length }, {
          strokeDashoffset: 0,
          duration: Math.min(0.5, Math.max(0.42, replayDuration)),
          ease: 'power3.out',
        }, 'listReplay')
        archiveListReplayTimeline.fromTo(geometry.progressPath, { strokeDasharray: length, strokeDashoffset: length }, {
          strokeDashoffset: 0,
          duration: Math.min(0.5, Math.max(0.42, replayDuration)),
          ease: 'power3.out',
        }, 'listReplay')
      }
      if (yearDividers.length) {
        archiveListReplayTimeline.fromTo(yearDividers, { autoAlpha: 0 }, { autoAlpha: 1, duration: fadeDuration, ease: 'power3.out' }, 'listReplay')
      }
      if (firstScreenTripCards.length) {
        archiveListReplayTimeline.fromTo(firstScreenTripCards, { autoAlpha: 0, x: -14 }, {
          autoAlpha: 1,
          x: 0,
          duration: replayDuration,
          ease: 'power3.out',
          stagger: { each: 0.03, from: 'start' },
        }, 'listReplay')
      }
      if (firstScreenNodes.length) {
        archiveListReplayTimeline.fromTo(firstScreenNodes, { autoAlpha: 0, scale: 0.5 }, {
          autoAlpha: 1,
          scale: 1,
          duration: replayDuration,
          ease: 'back.out(1.3)',
          stagger: { each: 0.03, from: 'start' },
        }, 'listReplay')
      }
      if (filterEmpty.length) {
        archiveListReplayTimeline.fromTo(filterEmpty, { autoAlpha: 0, y: 10 }, {
          autoAlpha: 1,
          y: 0,
          duration: replayDuration,
          ease: 'power3.out',
        }, 'listReplay')
      }
    }

    const captureArchiveFlip = () => {
      stopArchiveListReplay()
      killArchiveScrollMotion()
      const flipTargets = getScopedTargets('[data-archive-flip-item]')
      pendingFlipStateRef.current = flipTargets.length ? Flip.getState(flipTargets) : null
    }
    const runArchiveFlip = () => {
      archiveFlipTimelineRef.current?.kill()
      archiveFlipTimelineRef.current = null
      const state = pendingFlipStateRef.current
      pendingFlipStateRef.current = null
      if (!state || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        terminalizeArchiveListMotion()
        return
      }
      archiveFlipTimelineRef.current = flipFrom(state, {
        duration: Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.28),
        ease: 'power3.out',
        simple: true,
        prune: true,
        onComplete: terminalizeArchiveListMotion,
        onInterrupt: terminalizeArchiveListMotion,
      })
    }

    const runMotion = () => {
      const mm = gsap.matchMedia()
      mm.add(
        { allowMotion: '(prefers-reduced-motion: no-preference)', reduceMotion: '(prefers-reduced-motion: reduce)' },
        (mediaContext) => {
          if (mediaContext.conditions?.reduceMotion) {
            root.removeAttribute('data-archive-empty-motion-pending')
            terminalizeArchiveMotion()
            return () => terminalizeArchiveMotion()
          }
          const motionMap = new Map(getMotionTargets().map((target) => [target.dataset.archiveMotion, target]))
          const isTrueEmpty = Boolean(motionMap.get('empty-state'))
          if (isTrueEmpty) {
            rebuildArchiveScrollMotionRef.current = () => {}
            const identity = motionMap.get('identity')
            const emptyState = motionMap.get('empty-state')
            const emptyActions = emptyState ? getScopedTargets('[data-archive-empty-cta]', emptyState) : []
            const emptyCopy = motionMap.get('empty-copy')
            const footer = motionMap.get('footer')
            const emptyMotionTargets = [identity, emptyState, ...emptyActions, emptyCopy, footer].filter(
              (target): target is HTMLElement => Boolean(target),
            )
            gsap.set(emptyMotionTargets, { autoAlpha: 0 })
            root.removeAttribute('data-archive-empty-motion-pending')

            const emptyBaseDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.2)
            const emptyEnterDuration = Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.24)
            const emptyTimeline = gsap.timeline({
              defaults: { duration: emptyBaseDuration, ease: 'power3.out' },
              onComplete: terminalizeArchiveMotion,
              onInterrupt: terminalizeArchiveMotion,
            })

            if (identity) {
              emptyTimeline.fromTo(identity, { autoAlpha: 0 }, { autoAlpha: 1, duration: emptyBaseDuration, ease: 'power3.out' }, 0)
            }
            if (emptyState) {
              emptyTimeline.fromTo(emptyState, { autoAlpha: 0, y: 16, scale: 0.96 }, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: emptyEnterDuration,
                ease: 'back.out(1.3)',
              }, 0.06)
            }
            if (emptyActions.length) {
              emptyTimeline.fromTo(emptyActions, { autoAlpha: 0, y: 8 }, {
                autoAlpha: 1,
                y: 0,
                duration: emptyBaseDuration,
                ease: 'power3.out',
                stagger: { each: 0.035, from: 'start' },
              }, 0.2)
            }
            if (emptyCopy) {
              emptyTimeline.fromTo(emptyCopy, { autoAlpha: 0 }, { autoAlpha: 1, duration: emptyBaseDuration, ease: 'power3.out' }, 0.3)
            }
            if (footer) {
              emptyTimeline.fromTo(footer, { autoAlpha: 0 }, { autoAlpha: 1, duration: emptyBaseDuration, ease: 'power3.out' }, 0.38)
            }

            return () => { emptyTimeline.kill(); terminalizeArchiveMotion() }
          }
          const baseDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.22)
          const enterDuration = Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.32)
          const schedule = { identity: 0, filters: 0.22, timeline: 0.28, trips: 0.32, footer: 0.62 } as const
          const geometry = syncTimelineGeometry()
          const timeline = gsap.timeline({ defaults: { duration: baseDuration, ease: 'power3.out' }, onComplete: terminalizeArchiveMotion, onInterrupt: terminalizeArchiveMotion })
          const addShell = (key: string, label: string, position: number, fromY = 14, scale = 0.98) => {
            const target = motionMap.get(key)
            if (!target) return
            timeline.addLabel(label, position)
            if (target.dataset.archiveMotionMode === 'fade') {
              timeline.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration: baseDuration, ease: 'power3.out' }, label)
            } else {
              timeline.fromTo(target, { autoAlpha: 0, y: fromY, scale }, { autoAlpha: 1, y: 0, scale: 1, duration: enterDuration, ease: 'power3.out' }, label)
            }
          }
          addShell('identity', 'identity', schedule.identity, 14, 0.98)
          addShell('filters', 'filters', schedule.filters, 8, 1)
          if (geometry) {
            const length = geometry.basePath.getTotalLength()
            timeline.addLabel('timeline', schedule.timeline)
            timeline.fromTo(geometry.basePath, { strokeDasharray: length, strokeDashoffset: length }, {
              strokeDashoffset: 0,
              duration: enterDuration,
              ease: 'power3.out',
            }, 'timeline')
          }
          const nodes = getScopedTargets('[data-archive-node]').slice(0, 4)
          if (nodes.length) {
            nodes.forEach((node) => {
              const nodeId = node.dataset.archiveNode ?? ''
              const nodeY = archiveNodePositionMapRef.current.get(nodeId) ?? 0
              const nodePosition = schedule.timeline + (geometry ? Math.min(1, nodeY / geometry.height) * enterDuration : 0)
              timeline.fromTo(node, { autoAlpha: 0, scale: 0.35 }, {
                autoAlpha: 1,
                scale: 1,
                duration: enterDuration,
                ease: 'back.out(1.3)',
              }, nodePosition)
              const halo = node.querySelector<HTMLElement>('[data-archive-node-halo]')
              if (nodeId && halo && !mountHaloPlayedRef.current.has(nodeId)) {
                mountHaloPlayedRef.current.add(nodeId)
                timeline.fromTo(halo, { autoAlpha: 1, scale: 0.6 }, {
                  autoAlpha: 0,
                  scale: 1.4,
                  duration: Math.min(0.45, Math.max(0.42, parseMotionTokenSeconds(root, '--motion-status', 420))),
                  ease: 'power2.out',
                  onComplete: () => gsap.set(halo, { autoAlpha: 0, scale: 1, clearProps: 'transform' }),
                  onInterrupt: () => gsap.set(halo, { autoAlpha: 0, scale: 1, clearProps: 'transform' }),
                }, nodePosition)
              }
            })
          }
          const firstScreenTripCards = getFirstScreenTripCards()
          if (firstScreenTripCards.length) {
            timeline.addLabel('trips', schedule.trips)
            firstScreenTripCards.forEach((card, index) => {
              card.dataset.archiveMotionParticipation = 'first-screen'
              card.dataset.archiveMotionIndex = String(index)
            })
            timeline.fromTo(firstScreenTripCards, { autoAlpha: 0, x: -14 }, {
              autoAlpha: 1,
              x: 0,
              duration: enterDuration,
              ease: 'power3.out',
              stagger: { each: 0.03, from: 'start' },
            }, 'trips')
          }
          for (const valueNode of getScopedTargets('[data-archive-stat-value][data-count-value]')) {
            const rawTarget = Number(valueNode.dataset.countValue)
            const finalText = valueNode.dataset.finalText ?? valueNode.textContent ?? ''
            if (!Number.isFinite(rawTarget)) continue
            const countState = { value: 0 }
            timeline.to(countState, {
              value: rawTarget,
              duration: Math.min(0.46, enterDuration * 1.4),
              ease: 'power2.out',
              onStart: () => { valueNode.textContent = formatMotionCountValue(0, valueNode.dataset.countFormat, finalText) },
              onUpdate: () => { valueNode.textContent = formatMotionCountValue(countState.value, valueNode.dataset.countFormat, finalText) },
              onComplete: () => { valueNode.textContent = finalText },
              onInterrupt: () => { valueNode.textContent = finalText },
            }, 'identity')
          }
          addShell('footer', 'footer', schedule.footer, 0, 1)
          return () => { timeline.kill(); terminalizeArchiveMotion() }
        },
        root,
      )
      return () => { mm.revert(); terminalizeArchiveMotion() }
    }

    const safeRunMotion = (contextSafe ? contextSafe(runMotion) : runMotion) as () => unknown
    const safeReplay = (contextSafe ? contextSafe(runArchiveListReplay) : runArchiveListReplay) as () => void
    const safeTerminalize = (contextSafe ? contextSafe(stopArchiveListReplay) : stopArchiveListReplay) as () => void
    const safeRebuild = (contextSafe ? contextSafe(rebuildArchiveScrollMotion) : rebuildArchiveScrollMotion) as () => void
    const safeCaptureFlip = (contextSafe ? contextSafe(captureArchiveFlip) : captureArchiveFlip) as () => void
    const safeRunFlip = (contextSafe ? contextSafe(runArchiveFlip) : runArchiveFlip) as () => void
    const safePlayRim = (contextSafe ? contextSafe(playArchiveRim) : playArchiveRim) as RimTargetHandler
    const safeReleaseRim = (contextSafe ? contextSafe(releaseArchiveRim) : releaseArchiveRim) as RimTargetHandler
    replayArchiveListRef.current = safeReplay
    terminalizeArchiveListRef.current = safeTerminalize
    rebuildArchiveScrollMotionRef.current = safeRebuild
    captureArchiveFlipRef.current = safeCaptureFlip
    runArchiveFlipRef.current = safeRunFlip
    playArchiveRimRef.current = safePlayRim
    releaseArchiveRimRef.current = safeReleaseRim
    const cleanup = safeRunMotion()
    return () => {
      replayArchiveListRef.current = null
      terminalizeArchiveListRef.current = null
      rebuildArchiveScrollMotionRef.current = null
      captureArchiveFlipRef.current = null
      runArchiveFlipRef.current = null
      playArchiveRimRef.current = null
      releaseArchiveRimRef.current = null
      stopArchiveListReplay()
      killArchiveScrollMotion()
      if (typeof cleanup === 'function') cleanup()
      terminalizeArchiveMotion()
    }
  }, { scope: motionScopeRef, dependencies: [] })

  useLayoutEffect(() => {
    const reason = pendingArchiveCommitRef.current
    pendingArchiveCommitRef.current = 'mount'
    if (reason === 'filter' && pendingFilterReplayRef.current) {
      pendingFilterReplayRef.current = false
      replayArchiveListRef.current?.()
      return
    }
    if (reason === 'expand') runArchiveFlipRef.current?.()
    rebuildArchiveScrollMotionRef.current?.()
  }, [activeFilter, filteredTripSignature, expandedSignature])

  return (
    <div
      ref={motionScopeRef}
      data-archive-motion-root
      data-archive-empty-motion-pending={hasTrips ? undefined : ''}
      className="archive-reinvention"
      style={{ '--archive-app-header-height': `${APP_HEADER_HEIGHT_PX}px` } as CSSProperties}
    >
      <h1 className="sr-only">山行档案</h1>
      {hasTrips ? null : (
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            [data-archive-empty-motion-pending] [data-archive-motion="identity"],
            [data-archive-empty-motion-pending] [data-archive-motion="empty-state"],
            [data-archive-empty-motion-pending] [data-archive-empty-cta],
            [data-archive-empty-motion-pending] [data-archive-motion="empty-copy"],
            [data-archive-empty-motion-pending] [data-archive-motion="footer"] {
              opacity: 0;
              visibility: hidden;
            }
          }
        `}</style>
      )}
      {hasTrips ? (
        <>
          <ArchiveHero user={user} summary={summary} />
          <FilterTabs active={activeFilter} onChange={handleFilterChange} trips={trips} />
          {filteredTrips.length ? (
            <ArchiveTimeline>
              {yearGroups.map((group, groupIndex) => (
                <ArchiveYearSection
                  key={group.year}
                  group={group}
                  groupIndex={groupIndex}
                  isExpanded={Boolean(expandedYears[getExpandedYearKey(activeFilter, group.year)])}
                  highestPointId={summary.highestPoint?.tripId ?? null}
                  activeFilter={activeFilter}
                  onToggle={() => handleYearToggle(group.year)}
                  onOpen={(trip) => router.push(`/activity/${trip.id}`)}
                  onRimStart={handleRimStart}
                  onRimEnd={handleRimEnd}
                />
              ))}
            </ArchiveTimeline>
          ) : (
            <FilterEmptyState onShowAll={() => handleFilterChange('all')} />
          )}
          {filteredTrips.length ? <ArchiveFooter trips={filteredTrips} activeFilter={activeFilter} /> : null}
        </>
      ) : (
        <>
          <IdentityCardEmpty user={user} />
          <ArchiveEmptyState
            onFindMountain={() => router.push('/explore')}
            onBringBack={() => router.push('/explore')}
            onRimStart={handleRimStart}
            onRimEnd={handleRimEnd}
          />
        </>
      )}
    </div>
  )
}
