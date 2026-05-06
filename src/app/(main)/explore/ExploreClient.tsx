'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import ProvinceBannerStrip, { type ProvinceBannerData } from '@/components/explore/ProvinceBannerStrip'
import { ONBOARDING_EVENT, getProvinceDraft } from '@/lib/onboarding'
import ExploreMountainCard from '@/components/ui/ExploreMountainCard'
import { SectionHeader } from '@/components/ui/MountainUI'
import { getDifficultyLevelLabel } from '@/lib/license-ui'
import type { Mountain } from '@/types'

const QUICK_TAGS = ['附近', '本省热门', '无执照可进', '高海拔', '长线'] as const

function estimateLength(mountain: Mountain) {
  return mountain.length_km ?? Number(Math.max(4.2, Math.min(26, mountain.altitude / 260)).toFixed(1))
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function ExploreClient({
  list,
  hometownProvince,
  provinceBanner,
}: {
  list: Mountain[]
  hometownProvince: string | null
  provinceBanner?: ProvinceBannerData | null
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<(typeof QUICK_TAGS)[number]>('附近')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [difficulty, setDifficulty] = useState<'all' | Mountain['difficulty']>('all')
  const [altitudeBand, setAltitudeBand] = useState<'all' | 'low' | 'mid' | 'high'>('all')
  const [lengthBand, setLengthBand] = useState<'all' | 'short' | 'mid' | 'long'>('all')
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [draftProvince, setDraftProvince] = useState<string | null>(hometownProvince)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (coords) => {
        setPosition({ lat: coords.coords.latitude, lng: coords.coords.longitude })
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    )
  }, [])

  useEffect(() => {
    const syncDraftProvince = () => setDraftProvince(getProvinceDraft())
    syncDraftProvince()
    window.addEventListener(ONBOARDING_EVENT, syncDraftProvince)
    window.addEventListener('storage', syncDraftProvince)
    return () => {
      window.removeEventListener(ONBOARDING_EVENT, syncDraftProvince)
      window.removeEventListener('storage', syncDraftProvince)
    }
  }, [])

  const effectiveProvince = hometownProvince ?? draftProvince
  const sorted = useMemo(() => {
    const withDistance = list.map((mountain) => ({
      mountain,
      distance: position ? haversine(position.lat, position.lng, mountain.latitude, mountain.longitude) : null,
      length: estimateLength(mountain),
    }))

    return withDistance.sort((a, b) => {
      if (tag === '附近' && a.distance !== null && b.distance !== null) return a.distance - b.distance
      if (tag === '本省热门') {
        const aMatch = effectiveProvince ? a.mountain.province === effectiveProvince : false
        const bMatch = effectiveProvince ? b.mountain.province === effectiveProvince : false
        if (aMatch !== bMatch) return aMatch ? -1 : 1
      }
      return b.mountain.checkin_count - a.mountain.checkin_count
    })
  }, [effectiveProvince, list, position, tag])

  const filtered = useMemo(() => {
    return sorted.filter(({ mountain, length }) => {
      const query = search.trim().toLowerCase()
      const matchesSearch =
        !query ||
        mountain.name.toLowerCase().includes(query) ||
        mountain.province.toLowerCase().includes(query)

      const matchesTag =
        tag === '附近'
          ? true
          : tag === '本省热门'
            ? effectiveProvince ? mountain.province === effectiveProvince : true
            : tag === '无执照可进'
              ? mountain.difficulty === 'beginner'
              : tag === '高海拔'
                ? mountain.altitude >= 3500
                : length >= 12

      const matchesDifficulty = difficulty === 'all' || mountain.difficulty === difficulty
      const matchesAltitude =
        altitudeBand === 'all' ||
        (altitudeBand === 'low' && mountain.altitude < 2000) ||
        (altitudeBand === 'mid' && mountain.altitude >= 2000 && mountain.altitude < 4000) ||
        (altitudeBand === 'high' && mountain.altitude >= 4000)

      const matchesLength =
        lengthBand === 'all' ||
        (lengthBand === 'short' && length < 8) ||
        (lengthBand === 'mid' && length >= 8 && length < 16) ||
        (lengthBand === 'long' && length >= 16)

      return matchesSearch && matchesTag && matchesDifficulty && matchesAltitude && matchesLength
    })
  }, [sorted, search, tag, difficulty, altitudeBand, lengthBand, effectiveProvince])

  const activeFilterCount = [difficulty, altitudeBand, lengthBand].filter((value) => value !== 'all').length
  const goImport = () => router.push('/import')
  const goScreenshot = () => router.push('/screenshot')

  return (
    <>
      <style>{'.explore-filter-scroll::-webkit-scrollbar{display:none}'}</style>
      <div style={{ padding: 'var(--space-4)' }}>
        <header style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
          <h1
            style={{
              margin: 0,
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-headline-m-size)',
              lineHeight: 'var(--font-headline-m-line)',
              fontWeight: 'var(--font-headline-m-weight)',
            }}
          >
            探索
          </h1>
        </header>

        <section aria-label="探索搜索" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜山名、地区、海拔"
                style={{
                  width: '100%',
                  padding: '15px 16px 15px 44px',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 14,
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: 16, top: 15, color: 'var(--text-muted)' }}>⌕</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="secondary-btn"
              style={{ minHeight: 48, padding: '0 16px' }}
            >
              筛选
            </button>
          </div>

          {provinceBanner !== undefined ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <ProvinceBannerStrip banner={provinceBanner} />
            </div>
          ) : null}
        </section>

        <section
          aria-label="山行入口"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 'var(--space-2)',
          }}
        >
          <PathwayCard
            icon={<ImportPathwayIcon />}
            title="导入记录"
            description="导入轨迹文件，分享你的登顶记录"
            onClick={goImport}
          />
          <PathwayCard
            icon={<ScreenshotPathwayIcon />}
            title="识别截图"
            description="上传其他 APP 轨迹截图，分享你的登顶记录"
            onClick={goScreenshot}
          />
        </section>

        <section aria-labelledby="mountain-list-heading" style={{ marginTop: 'var(--space-6)' }}>
          <p
            id="mountain-list-heading"
            style={{
              margin: '0 0 var(--space-3)',
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 'var(--font-body-m-line)',
              fontWeight: 500,
            }}
          >
            找山出发{' '}
            <span style={{ color: 'var(--color-on-surface-variant)', margin: '0 var(--space-1)' }}>·</span>{' '}
            <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 400 }}>
              挑一座适合你的山进行登顶打卡
            </span>
          </p>

          <div
            className="explore-filter-scroll"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: 8,
              overflowX: 'auto',
              padding: '0 var(--space-2) 2px',
              marginInline: 'calc(var(--space-2) * -1)',
              marginBottom: 'var(--space-4)',
              whiteSpace: 'nowrap',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {QUICK_TAGS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTag(item)}
                className={`muted-chip ${tag === item ? 'active' : ''}`}
                style={{ border: 'none', cursor: 'pointer', flex: '0 0 auto' }}
              >
                {item}
              </button>
            ))}
          </div>

          {showAdvanced && (
            <div
              style={{
                marginBottom: 'var(--space-4)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--border-color)',
                display: 'grid',
                gap: 'var(--space-3)',
              }}
            >
              <FilterGroup
                label="难度"
                value={difficulty}
                options={[
                  { label: '全部', value: 'all' },
                  { label: getDifficultyLevelLabel('beginner'), value: 'beginner' },
                  { label: getDifficultyLevelLabel('intermediate'), value: 'intermediate' },
                  { label: getDifficultyLevelLabel('advanced'), value: 'advanced' },
                  { label: getDifficultyLevelLabel('expert'), value: 'expert' },
                ]}
                onChange={(value) => setDifficulty(value as typeof difficulty)}
              />
              <FilterGroup
                label="海拔"
                value={altitudeBand}
                options={[
                  { label: '全部', value: 'all' },
                  { label: '<2000m', value: 'low' },
                  { label: '2000-4000m', value: 'mid' },
                  { label: '>4000m', value: 'high' },
                ]}
                onChange={(value) => setAltitudeBand(value as typeof altitudeBand)}
              />
              <FilterGroup
                label="路线长度"
                value={lengthBand}
                options={[
                  { label: '全部', value: 'all' },
                  { label: '短线', value: 'short' },
                  { label: '中线', value: 'mid' },
                  { label: '长线', value: 'long' },
                ]}
                onChange={(value) => setLengthBand(value as typeof lengthBand)}
              />
            </div>
          )}

          <SectionHeader
            title="山峰列表"
            description={
              tag === '附近' && position
                ? '已按你当前位置由近到远排序'
                : tag === '本省热门' && effectiveProvince
                  ? `已优先展示 ${effectiveProvince} 的热门路线`
                  : `当前找到 ${filtered.length} 座可选山峰`
            }
            action={activeFilterCount > 0 ? <div className="muted-chip active">已筛选 {activeFilterCount}</div> : undefined}
          />

          {filtered.length === 0 ? (
            <div className="surface-card" style={{ padding: 28, textAlign: 'center' }}>
              <div className="font-pixel" style={{ fontSize: 18, marginBottom: 6 }}>没有找到匹配的山峰</div>
              <div className="section-subtitle">试试切换标签或清空高级筛选条件。</div>
            </div>
          ) : (
            <div className="explore-card-list">
              {filtered.map(({ mountain }) => (
                <ExploreMountainCard key={mountain.id} mountain={mountain} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function PathwayCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: 'none',
        width: '100%',
        minWidth: 0,
        minHeight: 116,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        background: 'var(--color-surface-variant)',
        color: 'var(--color-on-surface)',
        border: '1px solid var(--color-outline)',
        borderRadius: 'var(--radius-lg)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-success)',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ display: 'grid', gap: 'var(--space-1)', minWidth: 0 }}>
        <span
          style={{
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 700,
          }}
        >
          {title}
        </span>
        <span
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            overflowWrap: 'anywhere',
          }}
        >
          {description}
        </span>
      </span>
    </button>
  )
}

function ImportPathwayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 16V4M12 4l-4 4M12 4l4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ScreenshotPathwayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7V5a1 1 0 0 1 1-1h2M20 7V5a1 1 0 0 0-1-1h-2M4 17v2a1 1 0 0 0 1 1h2M20 17v2a1 1 0 0 1-1 1h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="8" y="9" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ label: string; value: string }>
  onChange: (value: string) => void
}) {
  return (
    <div>
      <div className="section-subtitle" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`muted-chip ${value === option.value ? 'active' : ''}`}
            style={{ border: 'none', cursor: 'pointer' }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
