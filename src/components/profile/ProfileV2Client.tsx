'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { UserContribution } from '@/lib/province-ranking'
import type { LicenseProgressSummary } from '@/lib/license-progress'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { formatMotionCountValue, parseMotionTokenSeconds, type MotionCountFormat } from '@/lib/motion-count-format'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { trackEventNow } from '@/lib/analytics/client'
import { useAppToast } from '@/components/ui/AppToastProvider'
import { MountainIcon } from '@/components/ui/Icons'
import type { CheckinSource } from '@/types'
import type { CheckinDisplayTitleSource } from '@/lib/checkin-display-title'
import ProfileAvatarUploader from '@/components/profile/ProfileAvatarUploader'
import LicenseProgressSheet from '@/components/profile/LicenseProgressSheet'
import ProvinceContributionSection from '@/components/profile/ProvinceContributionSection'

gsap.registerPlugin(useGSAP)

export type ProfileV2Identity = {
  userId: string
  username: string
  province: string | null
  avatarUrl: string | null
  licenseLevel: string
  joinedAt: string
}

export type ProfileV2Summary = {
  tripCount: number
  maxAltitudeM: number
  visitedProvinceCount: number
}

export type ProfileV2TripPreview = {
  checkinId: string
  mountainId: string | null
  completionStatus?: 'complete' | 'incomplete' | null
  sourceType: CheckinSource
  verifiedAt?: string | null
  difficulty?: string | null
  mountainName: string
  titleSource: CheckinDisplayTitleSource
  unmatchedTag: '未关联' | null
  province: string
  createdAt: string
  altitudeM: number
  photoUrl: string | null
}

export type ProfileV2SharePreview = {
  id: string
  checkinId: string
  mountainName: string
  province: string | null
  publishedAt: string
  likeCount: number
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)))
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '----·--·--'
  return `${date.getFullYear()}·${String(date.getMonth() + 1).padStart(2, '0')}·${String(date.getDate()).padStart(2, '0')}`
}

function SectionHeading({
  title,
  copy,
}: {
  title: string
  copy?: string
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
      <h2 className="pt-title-l" style={{ margin: 0, color: 'var(--color-on-surface)' }}>
        {title}
      </h2>
      {copy ? (
        <p className="pt-body-m" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
          {copy}
        </p>
      ) : null}
    </div>
  )
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShareGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M7.5 12.5l9-5M7.5 12.5l9 5M6.5 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm11-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SummaryTiles({ summary }: { summary: ProfileV2Summary }) {
  const items = [
    { label: '山行', value: formatNumber(summary.tripCount), countValue: summary.tripCount, countFormat: 'integer' as MotionCountFormat, accent: false },
    {
      label: '最高海拔',
      value: summary.maxAltitudeM > 0 ? formatNumber(summary.maxAltitudeM) : '--',
      countValue: summary.maxAltitudeM > 0 ? summary.maxAltitudeM : undefined,
      countFormat: 'integer' as MotionCountFormat,
      accent: true,
    },
    { label: '已访省份', value: formatNumber(summary.visitedProvinceCount), countValue: summary.visitedProvinceCount, countFormat: 'integer' as MotionCountFormat, accent: false },
  ]

  return (
    <section
      data-profile-motion="summary"
      aria-label="山行概览"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-6)',
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          data-profile-summary-tile={item.label}
          style={{
            minWidth: 0,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            padding: 'var(--space-3)',
          }}
        >
          <div
            data-profile-summary-value={item.label}
            data-count-value={typeof item.countValue === 'number' ? String(item.countValue) : undefined}
            data-count-format={item.countFormat}
            data-final-text={item.value}
            style={{
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              fontSize: 'var(--font-title-l-size)',
              lineHeight: 'var(--font-title-l-line)',
              fontWeight: 700,
              color: item.accent ? 'var(--color-success)' : 'var(--color-on-surface)',
              whiteSpace: 'nowrap',
            }}
          >
            {item.value}
          </div>
          <div
            className="pt-label-s"
            style={{
              marginTop: 'var(--space-1)',
              color: 'var(--color-on-surface-variant)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </section>
  )
}

function AltitudeBar({ altitudeM }: { altitudeM: number }) {
  const width = altitudeM > 0 ? Math.min(100, Math.max(14, Math.round((altitudeM / 8000) * 100))) : 0

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div
        aria-hidden="true"
        style={{
          height: 6,
          borderRadius: 'var(--radius-pill)',
          background: 'color-mix(in srgb, var(--color-on-surface) 7%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            borderRadius: 'inherit',
            background: 'var(--color-success)',
          }}
        />
      </div>
      <div
        className="pt-label-s"
        style={{
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-success)',
        }}
      >
        {altitudeM > 0 ? `${formatNumber(altitudeM)} m` : '-- m'}
      </div>
    </div>
  )
}

function UnmatchedTripTag() {
  return (
    <span
      data-testid="profile-trip-unmatched-tag"
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

function TripThumb({ trip }: { trip: ProfileV2TripPreview }) {
  if (trip.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={trip.photoUrl}
        alt={`${trip.mountainName} 缩略图`}
        style={{
          width: 72,
          height: 72,
          borderRadius: 'var(--radius-md)',
          objectFit: 'cover',
          border: '1px solid var(--color-outline)',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: 72,
        height: 72,
        borderRadius: 'var(--radius-md)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        border: '1px solid var(--color-outline)',
        color: 'var(--color-success)',
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--color-success) 20%, var(--color-surface-variant)), var(--color-surface-elevated))',
      }}
    >
      <MountainIcon size={26} />
    </div>
  )
}

function ArchivePreviewSection({ trips }: { trips: ProfileV2TripPreview[] }) {
  return (
    <section style={{ marginBottom: 'var(--space-6)' }} data-testid="profile-archive-preview" data-profile-motion="archive-preview">
      <SectionHeading title="我的山行档案" copy="你完成的真实山行,都在这里" />
      {trips.length === 0 ? (
        <div
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            padding: 'var(--space-4)',
          }}
        >
          <div className="pt-title-m" style={{ color: 'var(--color-on-surface)' }}>
            还没有一次山行
          </div>
          <Link
            href="/explore"
            className="pt-body-m"
            style={{
              display: 'inline-flex',
              marginTop: 'var(--space-2)',
              color: 'var(--color-success)',
              textDecoration: 'none',
            }}
          >
            从找一座山开始 →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {trips.map((trip) => (
            <article
              key={trip.checkinId}
              data-testid="profile-trip-card"
              data-profile-archive-card={trip.checkinId}
              style={{
                padding: 'var(--space-3)',
                minWidth: 0,
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-outline)',
                background: 'var(--color-surface-variant)',
                color: 'var(--color-on-surface)',
              }}
            >
              <Link
                href={`/activity/${trip.checkinId}`}
                data-testid="profile-trip-activity-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  minWidth: 0,
                  color: 'var(--color-on-surface)',
                  textDecoration: 'none',
                }}
              >
                <TripThumb trip={trip} />
                <div style={{ display: 'grid', gap: 'var(--space-2)', minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ display: 'grid', gap: 'var(--space-1)', minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        minWidth: 0,
                      }}
                    >
                      <span
                        data-testid="profile-trip-title"
                        className="pt-title-m"
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {trip.mountainName}
                      </span>
                      {trip.unmatchedTag ? <UnmatchedTripTag /> : null}
                    </div>
                    <div
                      data-testid="profile-trip-secondary"
                      className="pt-label-s"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      {formatDate(trip.createdAt)} · {trip.province}
                    </div>
                  </div>
                  <AltitudeBar altitudeM={trip.altitudeM} />
                </div>
              </Link>
              <Link
                href={`/share?checkinId=${encodeURIComponent(trip.checkinId)}`}
                data-testid="profile-trip-share-link"
                aria-label={`${trip.mountainName} 分享素材`}
                className="pt-label-m"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 36,
                  marginTop: 'var(--space-3)',
                  padding: '0 var(--space-3)',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--color-outline)',
                  color: 'var(--color-success)',
                  background: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
                  textDecoration: 'none',
                }}
              >
                <ShareGlyph />
                分享素材
              </Link>
            </article>
          ))}
          <Link
            href="/archive"
            className="pt-label-m"
            style={{ justifySelf: 'start', color: 'var(--color-success)', textDecoration: 'none' }}
          >
            查看完整档案 →
          </Link>
        </div>
      )}
    </section>
  )
}

function SharePreviewSection({
  shares,
  currentUserId,
}: {
  shares: ProfileV2SharePreview[]
  currentUserId: string
}) {
  return (
    <section style={{ marginBottom: 'var(--space-6)' }} data-testid="profile-share-preview-section" data-profile-motion="share-preview">
      <SectionHeading title="我的分享" copy="已发布到山友圈的山行" />
      {shares.length === 0 ? (
        <div
          className="pt-body-m"
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            padding: 'var(--space-4)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          还没有发布过山行
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {shares.map((share) => (
            <Link
              key={share.id}
              href={`/community/${share.id}`}
              data-profile-share-row={share.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                minHeight: 62,
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-outline)',
                background: 'var(--color-surface-variant)',
                color: 'var(--color-on-surface)',
                textDecoration: 'none',
              }}
            >
              <span style={{ minWidth: 0, display: 'grid', gap: 'var(--space-1)' }}>
                <span className="pt-title-m" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {share.mountainName}
                </span>
                <span
                  className="pt-label-s"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-on-surface-variant)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatDate(share.publishedAt)}
                  {share.province ? ` · ${share.province}` : ''}
                </span>
              </span>
              <span
                className="pt-label-s"
                style={{
                  flexShrink: 0,
                  color: 'var(--color-on-surface-variant)',
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatNumber(share.likeCount)} 赞
              </span>
            </Link>
          ))}
          <Link
            href={`/community/user/${currentUserId}`}
            className="pt-label-m"
            style={{ justifySelf: 'start', color: 'var(--color-success)', textDecoration: 'none' }}
          >
            查看全部 →
          </Link>
        </div>
      )}
    </section>
  )
}

function SupportSection() {
  const { showToast } = useAppToast()
  const rows: ReadonlyArray<
    | { label: string; href: string; ring?: boolean }
    | { label: string; toast: string; ring?: boolean }
  > = [
    { label: '帮助 · FAQ', href: '/faq', ring: true },
    { label: '问题反馈', href: '/faq?anchor=account.feedback', ring: true },
  ]

  return (
    <section style={{ marginBottom: 'var(--space-6)' }} data-testid="profile-support-section" data-profile-motion="support">
      <SectionHeading title="支持" />
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {rows.map((row) => {
          const content = (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                <span className="pt-body-m" style={{ color: 'var(--color-on-surface)' }}>
                  {row.label}
                </span>
                {'ring' in row && row.ring ? (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 'var(--radius-pill)',
                      border: '1.5px solid var(--color-success)',
                      flexShrink: 0,
                    }}
                  />
                ) : null}
              </span>
              <Chevron />
            </>
          )
          const sharedStyle = {
            minHeight: 54,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: '0 var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            color: 'var(--color-on-surface-variant)',
            textDecoration: 'none',
          }

          if ('href' in row) {
            return (
              <Link key={row.label} href={row.href} style={sharedStyle}>
                {content}
              </Link>
            )
          }

          return (
            <button
              key={row.label}
              type="button"
              onClick={() => showToast({ tone: 'info', message: row.toast })}
              style={{ ...sharedStyle, width: '100%', cursor: 'pointer' }}
            >
              {content}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function LogoutLink() {
  const router = useRouter()
  const { showToast } = useAppToast()
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    setPending(true)
    try {
      await trackEventNow({ event_type: 'auth', event_name: 'auth.logout' })
      await createSupabaseBrowserClient().auth.signOut()
      router.push('/explore')
      router.refresh()
    } catch {
      showToast({ tone: 'error', message: '退出登录失败，请稍后重试。' })
      setPending(false)
    }
  }

  return (
    <div data-profile-motion="logout" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2) 0 var(--space-8)' }}>
      <button
        type="button"
        className="pt-label-s"
        onClick={handleLogout}
        disabled={pending}
        style={{
          border: 0,
          background: 'transparent',
          color: 'var(--color-on-surface-variant)',
          cursor: pending ? 'default' : 'pointer',
          padding: 'var(--space-2) var(--space-3)',
        }}
      >
        {pending ? '正在退出' : '退出登录'}
      </button>
    </div>
  )
}

export default function ProfileV2Client({
  identity,
  summary,
  trips,
  shares,
  provinceContribution,
  monthLabel,
  licenseProgress,
}: {
  identity: ProfileV2Identity
  summary: ProfileV2Summary
  trips: ProfileV2TripPreview[]
  shares: ProfileV2SharePreview[]
  provinceContribution: UserContribution | null
  monthLabel: string
  licenseProgress: LicenseProgressSummary
}) {
  const router = useRouter()
  const motionScopeRef = useRef<HTMLDivElement | null>(null)
  const searchParams = useSearchParams()
  const visibleTrips = useMemo(() => trips.slice(0, 3), [trips])
  const visibleShares = useMemo(() => shares.slice(0, 3), [shares])
  const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')
  const [licenseSheetOpen, setLicenseSheetOpen] = useState(false)
  const queryRequestsLicenseSheet = searchParams.get('licenseSheet') === '1'

  function closeLicenseSheet() {
    setLicenseSheetOpen(false)
    if (searchParams.get('licenseSheet') === '1') {
      router.replace('/profile', { scroll: false })
    }
  }

  useGSAP((_context, contextSafe) => {
    const root = motionScopeRef.current
    if (!root) return

    const getScopedTargets = (selector: string, scope: ParentNode = root) =>
      gsap.utils.toArray<HTMLElement>(scope.querySelectorAll(selector)).filter((target) => root.contains(target))

    const getMotionTargets = () => getScopedTargets('[data-profile-motion]')
    const getAnimatedTargets = () => [
      ...getMotionTargets(),
      ...getScopedTargets('[data-profile-summary-tile]'),
      ...getScopedTargets('[data-profile-archive-card]').slice(0, 3),
      ...getScopedTargets('[data-profile-share-row]').slice(0, 3),
    ]

    const terminalizeProfileCountValues = () => {
      for (const valueNode of getScopedTargets('[data-profile-summary-value]')) {
        const finalText = valueNode.dataset.finalText
        if (finalText) valueNode.textContent = finalText
      }
    }

    const terminalizeProfileMotion = () => {
      if (!root.isConnected) return
      const targets = getAnimatedTargets()
      const fadeOnlyTargets = targets.filter((target) => target.dataset.profileMotionMode === 'fade')
      const shiftedTargets = targets.filter((target) => target.dataset.profileMotionMode !== 'fade')
      if (fadeOnlyTargets.length > 0) {
        gsap.set(fadeOnlyTargets, {
          autoAlpha: 1,
          clearProps: 'willChange,transform',
        })
      }
      if (shiftedTargets.length > 0) {
        gsap.set(shiftedTargets, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          clearProps: 'willChange,transform',
        })
      }
      terminalizeProfileCountValues()
    }

    const runMotion = () => {
      const mm = gsap.matchMedia()
      mm.add(
        {
          allowMotion: '(prefers-reduced-motion: no-preference)',
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (mediaContext) => {
          if (queryRequestsLicenseSheet || mediaContext.conditions?.reduceMotion) {
            terminalizeProfileMotion()
            return () => terminalizeProfileMotion()
          }

          const baseDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.2)
          const enterDuration = Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.24)
          const fastDuration = Math.min(parseMotionTokenSeconds(root, '--motion-fast', 180), 0.16)
          const schedule = {
            identity: 0,
            summary: 0.1,
            archive: 0.26,
            share: 0.42,
            province: 0.58,
            support: 0.66,
            logout: 0.72,
          } as const
          const motionMap = new Map(getMotionTargets().map((target) => [target.dataset.profileMotion, target]))
          const animatedTargets = getAnimatedTargets()
          const fadeOnlyTargets = animatedTargets.filter((target) => target.dataset.profileMotionMode === 'fade')
          const shiftedTargets = animatedTargets.filter((target) => target.dataset.profileMotionMode !== 'fade')
          if (fadeOnlyTargets.length > 0) gsap.set(fadeOnlyTargets, { willChange: 'opacity' })
          if (shiftedTargets.length > 0) gsap.set(shiftedTargets, { willChange: 'transform, opacity' })

          const timeline = gsap.timeline({
            defaults: { duration: baseDuration, ease: 'power3.out' },
            onComplete: terminalizeProfileMotion,
            onInterrupt: terminalizeProfileMotion,
          })

          const addShell = (key: string, label: string, position: number, fromY = 16, scale = 0.96, ease = 'back.out(1.3)') => {
            const target = motionMap.get(key)
            if (!target) return
            timeline.addLabel(label, position)
            if (target.dataset.profileMotionMode === 'fade') {
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

          addShell('identity', 'identity', schedule.identity, 0, 1)
          addShell('summary', 'summary', schedule.summary, 14, 0.94)
          const summaryTiles = getScopedTargets('[data-profile-summary-tile]')
          if (summaryTiles.length > 0) {
            timeline.fromTo(summaryTiles, { autoAlpha: 0, y: 14, scale: 0.94 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: fastDuration,
              ease: 'back.out(1.3)',
              stagger: { each: 0.035, from: 'start' },
            }, 'summary')
            for (const valueNode of getScopedTargets('[data-profile-summary-value][data-count-value]')) {
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
              }, 'summary')
            }
          }

          addShell('archive-preview', 'archivePreview', schedule.archive, 18, 0.96)
          const archiveCards = getScopedTargets('[data-profile-archive-card]').slice(0, 3)
          if (archiveCards.length > 0) {
            timeline.fromTo(archiveCards, { autoAlpha: 0, y: 18, scale: 0.96 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: fastDuration,
              ease: 'back.out(1.3)',
              stagger: { each: 0.035, from: 'start' },
            }, 'archivePreview')
          }

          addShell('share-preview', 'sharePreview', schedule.share, 16, 0.97)
          const shareRows = getScopedTargets('[data-profile-share-row]').slice(0, 3)
          if (shareRows.length > 0) {
            timeline.fromTo(shareRows, { autoAlpha: 0, y: 14, scale: 0.97 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: fastDuration,
              ease: 'power3.out',
              stagger: { each: 0.035, from: 'start' },
            }, 'sharePreview')
          }

          addShell('province', 'province', schedule.province, 14, 0.98)
          addShell('support', 'support', schedule.support, 14, 0.98)
          addShell('logout', 'logout', schedule.logout, 0, 1)

          return () => {
            timeline.kill()
            terminalizeProfileMotion()
          }
        },
        root,
      )

      return () => {
        mm.revert()
        terminalizeProfileMotion()
      }
    }

    const safeRunMotion = (contextSafe ? contextSafe(runMotion) : runMotion) as () => unknown
    const cleanup = safeRunMotion()
    return () => {
      if (typeof cleanup === 'function') cleanup()
      terminalizeProfileMotion()
    }
  }, { scope: motionScopeRef, dependencies: [] })

  return (
    <div
      ref={motionScopeRef}
      data-profile-motion-root
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        padding: 'var(--space-4) var(--page-padding) calc(112px + env(safe-area-inset-bottom))',
      }}
    >
      <div data-profile-motion="identity" data-profile-motion-mode="fade">
        <ProfileAvatarUploader
          userId={identity.userId}
          username={identity.username}
          province={identity.province}
          joinedAt={identity.joinedAt}
          initialAvatarUrl={identity.avatarUrl}
          licenseLevel={identity.licenseLevel}
          onLicenseClick={() => setLicenseSheetOpen(true)}
        />
      </div>
      <LicenseProgressSheet
        open={licenseSheetOpen || queryRequestsLicenseSheet}
        progress={licenseProgress}
        onClose={closeLicenseSheet}
      />
      <SummaryTiles summary={summary} />
      <ArchivePreviewSection trips={visibleTrips} />
      <SharePreviewSection shares={visibleShares} currentUserId={identity.userId} />
      {provinceRankingEnabled ? (
        <div data-profile-motion="province">
          <ProvinceContributionSection contribution={provinceContribution} monthLabel={monthLabel} />
        </div>
      ) : null}
      <SupportSection />
      <LogoutLink />
    </div>
  )
}
