'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import ProvinceBannerStrip, { type ProvinceBannerData } from '@/components/explore/ProvinceBannerStrip'
import { isFeatureEnabled } from '@/lib/feature-flags'
import ExploreMountainCard from '@/components/ui/ExploreMountainCard'
import { ExploreImportMethodCard } from '@/components/explore/ExploreImportMethodCard'
import { useAppToast } from '@/components/ui/AppToastProvider'
import Chip from '@/components/ui/Chip'
import EmptyState from '@/components/ui/EmptyState'
import SectionHeader from '@/components/ui/SectionHeader'
import { FilterIcon, SearchIcon } from '@/components/ui/Icons'
import { getDifficultyLevelLabel } from '@/lib/license-ui'
import { storePendingShareTemplate } from '@/lib/share-template-intent'
import {
  getMountainDisplayAltitude,
  getMountainDistanceKm,
  matchesMountainLengthBand,
} from '@/lib/mountain-route-display'
import type { Mountain } from '@/types'
import type { ShareRenderTemplate } from '@/lib/share-templates/types'

gsap.registerPlugin(useGSAP)

const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')
const QUICK_TAGS = ['附近', '入门线', '进阶线', '5000m+'] as const
const EXPLORE_BATCH_SIZE = 12
const EXPLORE_BATCH_PRELOAD_OFFSET = 2

type ExploreReplayReason = 'geo' | 'tag' | 'advancedFilter' | 'search'
type ExploreReplayReasonLayer = 'queuedReasons' | 'firedReplayReasons'
type ExploreReplayReasonState = Record<ExploreReplayReasonLayer, ExploreReplayReason[]>
type ExplorePosition = { lat: number; lng: number }
type ExploreResultKind = 'results' | 'rich-empty' | 'filter-empty'
type PressFallbackEvent =
  | PointerEvent<HTMLElement>
  | FocusEvent<HTMLElement>
  | KeyboardEvent<HTMLElement>
  | MouseEvent<HTMLElement>

let cachedExplorePosition: ExplorePosition | null = null

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function markKeyboardPressFallback(event: KeyboardEvent<HTMLElement>) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.currentTarget.dataset.ptPressActive = 'true'
  }
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

function getExploreReplayReasonState() {
  const win = window as Window & { __fu110ExploreReplayReasons?: ExploreReplayReasonState }
  win.__fu110ExploreReplayReasons ??= { queuedReasons: [], firedReplayReasons: [] }
  return win.__fu110ExploreReplayReasons
}

function recordExploreReplayReasons(layer: ExploreReplayReasonLayer, reasons: ExploreReplayReason[]) {
  if (reasons.length === 0) return
  const state = getExploreReplayReasonState()
  state[layer].push(...reasons)
  if (layer === 'firedReplayReasons') {
    window.dispatchEvent(new CustomEvent('fu110:explore-replay-fired', { detail: { reasons } }))
  }
}

function sameExplorePosition(left: ExplorePosition | null, right: ExplorePosition) {
  return left?.lat === right.lat && left.lng === right.lng
}

function normalizeExploreSearchText(value: string) {
  return value.trim().toLowerCase().replace(/[\s,，]/g, '')
}

function mountainMatchesExploreSearch(mountain: Mountain, rawQuery: string) {
  const query = normalizeExploreSearchText(rawQuery)
  if (!query) return true

  const displayAltitude = getMountainDisplayAltitude(mountain)
  const altitudeTerms = displayAltitude === null
    ? []
    : [
        String(displayAltitude),
        `${displayAltitude}m`,
        `${displayAltitude}米`,
        `海拔${displayAltitude}m`,
        `海拔${displayAltitude}米`,
      ]
  return [
    mountain.name,
    mountain.province,
    ...altitudeTerms,
  ].some((value) => normalizeExploreSearchText(value).includes(query))
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

function parseMotionTokenSeconds(root: HTMLElement, tokenName: string, fallbackMs: number) {
  const raw = window.getComputedStyle(root).getPropertyValue(tokenName).trim()
  if (!raw) return fallbackMs / 1000
  if (raw.endsWith('ms')) {
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value / 1000 : fallbackMs / 1000
  }
  if (raw.endsWith('s')) {
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : fallbackMs / 1000
  }
  return fallbackMs / 1000
}

export default function ExploreClient({
  list,
  provinceBanner,
  shareTemplateIntent,
  checkedMountainIds = [],
}: {
  list: Mountain[]
  hometownProvince: string | null
  provinceBanner?: ProvinceBannerData | null
  shareTemplateIntent?: ShareRenderTemplate | null
  checkedMountainIds?: string[]
}) {
  const router = useRouter()
  const { showToast } = useAppToast()
  const checkedMountainIdSet = useMemo(() => new Set(checkedMountainIds), [checkedMountainIds])
  const motionScopeRef = useRef<HTMLDivElement | null>(null)
  const sceneVideoRef = useRef<HTMLVideoElement | null>(null)
  const replayExploreListRef = useRef<((reasons: ExploreReplayReason[]) => void) | null>(null)
  const terminalizeExploreListRef = useRef<(() => void) | null>(null)
  const pendingExploreReplayRef = useRef(false)
  const pendingExploreReplayReasonsRef = useRef<Set<ExploreReplayReason>>(new Set())
  const mountSettledRef = useRef(false)
  const positionRef = useRef<ExplorePosition | null>(cachedExplorePosition)
  const lastVisibleFirst4IdsRef = useRef<string[]>([])
  const mountTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const loadMoreSentinelRef = useRef<HTMLSpanElement | null>(null)
  const batchAdvancePendingRef = useRef(false)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<(typeof QUICK_TAGS)[number]>('附近')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [difficulty, setDifficulty] = useState<'all' | Mountain['difficulty']>('all')
  const [altitudeBand, setAltitudeBand] = useState<'all' | 'low' | 'mid' | 'high'>('all')
  const [lengthBand, setLengthBand] = useState<'all' | 'short' | 'mid' | 'long'>('all')
  const [position, setPosition] = useState<ExplorePosition | null>(() => cachedExplorePosition)

  useEffect(() => {
    if (!shareTemplateIntent) return
    storePendingShareTemplate(shareTemplateIntent)
    router.replace('/explore')
  }, [router, shareTemplateIntent])

  const readLiveFirst4Ids = useCallback(() => {
    const root = motionScopeRef.current
    if (!root) return []
    return gsap.utils.toArray<HTMLElement>(root.querySelectorAll('[data-testid="explore-mountain-card"]'))
      .slice(0, 4)
      .map((card) => (card.getAttribute('href') ?? '').split('/').filter(Boolean).at(-1) ?? '')
      .filter(Boolean)
  }, [])

  const queueExploreListReplay = useCallback((reason: ExploreReplayReason) => {
    if (reason === 'geo') {
      const first4Ids = readLiveFirst4Ids()
      if (first4Ids.length > 0) lastVisibleFirst4IdsRef.current = first4Ids
    }
    pendingExploreReplayReasonsRef.current.add(reason)
    recordExploreReplayReasons('queuedReasons', [reason])
    pendingExploreReplayRef.current = true
    if (mountSettledRef.current) terminalizeExploreListRef.current?.()
  }, [readLiveFirst4Ids])

  function flushPendingExploreListReplay(replay = replayExploreListRef.current) {
    if (!mountSettledRef.current || !pendingExploreReplayRef.current) return
    const reasons = [...pendingExploreReplayReasonsRef.current]
    pendingExploreReplayReasonsRef.current.clear()
    pendingExploreReplayRef.current = false
    if (reasons.length === 0) return
    replay?.(reasons)
  }

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (coords) => {
        const nextPosition = { lat: coords.coords.latitude, lng: coords.coords.longitude }
        const previousPosition = positionRef.current
        if (sameExplorePosition(previousPosition, nextPosition)) return
        cachedExplorePosition = nextPosition
        positionRef.current = nextPosition
        queueExploreListReplay('geo')
        setPosition(nextPosition)
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    )
  }, [queueExploreListReplay])

  const sorted = useMemo(() => {
    const withDistance = list.map((mountain) => ({
      mountain,
      distance: position ? haversine(position.lat, position.lng, mountain.latitude, mountain.longitude) : null,
      length: getMountainDistanceKm(mountain),
    }))

    return withDistance.sort((a, b) => {
      if (tag === '附近' && a.distance !== null && b.distance !== null) return a.distance - b.distance
      return b.mountain.checkin_count - a.mountain.checkin_count
    })
  }, [list, position, tag])

  const rawSearchMatches = useMemo(
    () => sorted.filter(({ mountain }) => mountainMatchesExploreSearch(mountain, search)),
    [search, sorted],
  )

  const filtered = useMemo(() => {
    return rawSearchMatches.filter(({ mountain, length }) => {
      const displayAltitude = getMountainDisplayAltitude(mountain)
      const matchesTag =
        tag === '附近'
          ? true
          : tag === '入门线'
            ? mountain.difficulty === 'beginner'
            : tag === '进阶线'
              ? mountain.difficulty !== 'beginner'
              : displayAltitude !== null && displayAltitude >= 5000

      const matchesDifficulty = difficulty === 'all' || mountain.difficulty === difficulty
      const matchesAltitude =
        altitudeBand === 'all' ||
        (altitudeBand === 'low' && displayAltitude !== null && displayAltitude < 2000) ||
        (altitudeBand === 'mid' && displayAltitude !== null && displayAltitude >= 2000 && displayAltitude < 4000) ||
        (altitudeBand === 'high' && displayAltitude !== null && displayAltitude >= 4000)

      const matchesLength = matchesMountainLengthBand(length, lengthBand)

      return matchesTag && matchesDifficulty && matchesAltitude && matchesLength
    })
  }, [rawSearchMatches, tag, difficulty, altitudeBand, lengthBand])

  const filteredMountainSignature = useMemo(
    () => filtered.map(({ mountain }) => mountain.id).join('|'),
    [filtered],
  )
  const [batchState, setBatchState] = useState({
    resultKey: filteredMountainSignature,
    count: Math.min(EXPLORE_BATCH_SIZE, filtered.length),
  })
  const visibleCount = batchState.resultKey === filteredMountainSignature
    ? Math.min(batchState.count, filtered.length)
    : Math.min(EXPLORE_BATCH_SIZE, filtered.length)
  const visibleResults = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  )
  const canLoadMore = visibleCount < filtered.length
  const loadMoreTriggerIndex = Math.max(
    0,
    visibleResults.length - EXPLORE_BATCH_PRELOAD_OFFSET - 1,
  )
  const activeFilterCount = [difficulty, altitudeBand, lengthBand].filter((value) => value !== 'all').length
  const hasSearchQuery = search.trim() !== ''
  const searchHasNoRawMatches = hasSearchQuery && rawSearchMatches.length === 0
  const exploreResultKind: ExploreResultKind = searchHasNoRawMatches
    ? 'rich-empty'
    : filtered.length === 0
      ? 'filter-empty'
      : 'results'
  const previousExploreResultKindRef = useRef<ExploreResultKind>(exploreResultKind)
  const previousSearchRef = useRef(search)
  const previousFilteredMountainSignatureRef = useRef(filteredMountainSignature)

  useEffect(() => {
    batchAdvancePendingRef.current = false
    setBatchState({
      resultKey: filteredMountainSignature,
      count: Math.min(EXPLORE_BATCH_SIZE, filtered.length),
    })
  }, [filtered.length, filteredMountainSignature])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !canLoadMore) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      if (batchAdvancePendingRef.current) return
      batchAdvancePendingRef.current = true
      observer.unobserve(sentinel)
      setBatchState((current) => {
        const currentCount = current.resultKey === filteredMountainSignature
          ? current.count
          : Math.min(EXPLORE_BATCH_SIZE, filtered.length)
        return {
          resultKey: filteredMountainSignature,
          count: Math.min(filtered.length, currentCount + EXPLORE_BATCH_SIZE),
        }
      })
    }, { rootMargin: '400px 0px', threshold: 0 })
    observer.observe(sentinel)
    return () => {
      observer.disconnect()
      batchAdvancePendingRef.current = false
    }
  }, [canLoadMore, filtered.length, filteredMountainSignature, visibleCount])

  useEffect(() => {
    const video = sceneVideoRef.current
    if (!video) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false
    let retryArmed = false
    let retryUsed = false

    const showPoster = () => {
      video.pause()
      try {
        video.currentTime = 0
      } catch {
        // Metadata may not be available yet; the poster still remains visible.
      }
      video.dataset.exploreVideoState = 'poster'
    }

    const pauseHiddenVideo = () => {
      video.pause()
      video.dataset.exploreVideoState = 'hidden'
    }

    const removeRetryListeners = () => {
      if (!retryArmed) return
      retryArmed = false
      window.removeEventListener('pointerdown', retryPlayback)
      window.removeEventListener('keydown', retryPlayback)
    }

    const retryPlayback = () => {
      removeRetryListeners()
      if (disposed || retryUsed || reducedMotion.matches) return
      retryUsed = true
      void attemptPlayback(false)
    }

    const armPlaybackRetry = () => {
      if (retryArmed || retryUsed || reducedMotion.matches) return
      retryArmed = true
      window.addEventListener('pointerdown', retryPlayback, { once: true })
      window.addEventListener('keydown', retryPlayback, { once: true })
    }

    const attemptPlayback = async (allowRetry: boolean) => {
      try {
        await video.play()
        if (disposed || reducedMotion.matches || exploreResultKind === 'rich-empty') {
          if (exploreResultKind === 'rich-empty' && !reducedMotion.matches) pauseHiddenVideo()
          else showPoster()
          return
        }
        video.dataset.exploreVideoState = 'playing'
        removeRetryListeners()
      } catch {
        if (disposed) return
        showPoster()
        if (allowRetry) armPlaybackRetry()
      }
    }

    const syncPlaybackPreference = () => {
      removeRetryListeners()
      if (reducedMotion.matches) {
        showPoster()
        return
      }
      if (exploreResultKind === 'rich-empty') {
        pauseHiddenVideo()
        return
      }
      void attemptPlayback(true)
    }

    syncPlaybackPreference()
    reducedMotion.addEventListener('change', syncPlaybackPreference)
    return () => {
      disposed = true
      removeRetryListeners()
      reducedMotion.removeEventListener('change', syncPlaybackPreference)
      video.pause()
    }
  }, [exploreResultKind])

  const goImport = () => router.push('/import')
  const goScreenshot = () => router.push('/screenshot')
  const mountainListDescription =
    tag === '附近' && position
      ? '已按你当前位置由近到远排序'
      : `当前找到 ${filtered.length} 座可选山峰`

  function handleTagChange(nextTag: (typeof QUICK_TAGS)[number]) {
    if (nextTag === tag) return
    queueExploreListReplay('tag')
    setTag(nextTag)
  }

  function handleDifficultyChange(nextDifficulty: typeof difficulty) {
    if (nextDifficulty === difficulty) return
    queueExploreListReplay('advancedFilter')
    setDifficulty(nextDifficulty)
  }

  function handleAltitudeBandChange(nextAltitudeBand: typeof altitudeBand) {
    if (nextAltitudeBand === altitudeBand) return
    queueExploreListReplay('advancedFilter')
    setAltitudeBand(nextAltitudeBand)
  }

  function handleLengthBandChange(nextLengthBand: typeof lengthBand) {
    if (nextLengthBand === lengthBand) return
    queueExploreListReplay('advancedFilter')
    setLengthBand(nextLengthBand)
  }

  function showExploreMountainRequestPlaceholder() {
    showToast({
      tone: 'success',
      message: '已收到您的山峰收录申请，后续我们审核过后会逐步对山峰进行开放',
    })
  }

  function showCheckedMountainFeedback() {
    showToast({ tone: 'success', message: '你已打卡这座山' })
  }

  useGSAP((_context, contextSafe) => {
    const root = motionScopeRef.current
    if (!root) return

    const setOutsideContext = (targets: gsap.TweenTarget, vars: gsap.TweenVars) => {
      _context.ignore(() => {
        gsap.set(targets, vars)
      })
    }

    const uniqueConnectedTargets = (targets: HTMLElement[]) => {
      const seen = new Set<HTMLElement>()
      return targets.filter((target) => {
        if (!target.isConnected || !root.contains(target) || seen.has(target)) return false
        seen.add(target)
        return true
      })
    }
    const getScopedTargets = (selector: string, scope: ParentNode = root) =>
      uniqueConnectedTargets(gsap.utils.toArray<HTMLElement>(scope.querySelectorAll(selector)))
    const getFirstScreenMountainCards = () => getScopedTargets('[data-testid="explore-mountain-card"]').slice(0, 4)
    const getFirstScreenMountainMotionTargets = (cards = getFirstScreenMountainCards()) => uniqueConnectedTargets(
      cards.map((card) => card.closest<HTMLElement>('[data-explore-motion-card]') ?? card),
    )
    const getPathwayIconPaths = () => getScopedTargets('[data-explore-pathway-icon-path]')
    const settleMountGates = (targets: HTMLElement[]) => {
      uniqueConnectedTargets(targets).forEach((target) => {
        if (target.dataset.exploreMountState) target.dataset.exploreMountState = 'settled'
      })
    }
    const getMountainCardId = (card: HTMLElement) =>
      (card.getAttribute('href') ?? '').split('/').filter(Boolean).at(-1) ?? ''
    const updateLastVisibleFirst4Ids = () => {
      lastVisibleFirst4IdsRef.current = getFirstScreenMountainCards().map(getMountainCardId).filter(Boolean)
    }
    const getLiveExploreListTargets = () => {
      const listSubheading = getScopedTargets('[data-explore-motion="list-subheading"]')
      const firstScreenCards = getFirstScreenMountainMotionTargets()
      const emptyState = getScopedTargets('[data-explore-list-empty]')
      return {
        listSubheading,
        firstScreenCards,
        emptyState,
        replayTargets: [...listSubheading, ...firstScreenCards, ...emptyState],
        terminalTargets: [...listSubheading, ...firstScreenCards, ...emptyState],
      }
    }

    const getExploreMotionTargets = () => uniqueConnectedTargets([
      root,
      ...getScopedTargets('[data-explore-motion]'),
      ...getScopedTargets('[data-explore-pathway-card]'),
      ...getScopedTargets('.explore-filter-chip'),
      ...getFirstScreenMountainMotionTargets(),
      ...getScopedTargets('[data-explore-list-empty]'),
    ])

    const applyTerminalDomStyles = (targets: HTMLElement[], updateLastVisible = true) => {
      uniqueConnectedTargets(targets).forEach((target) => {
        target.style.opacity = '1'
        target.style.visibility = 'visible'
        target.style.transform = ''
        target.style.willChange = ''
      })
      if (updateLastVisible) updateLastVisibleFirst4Ids()
    }

    const terminalizePathwayIcons = () => {
      const pathwayIconPaths = getPathwayIconPaths()
      if (pathwayIconPaths.length === 0) return
      setOutsideContext(pathwayIconPaths, {
        strokeDasharray: 24,
        strokeDashoffset: 0,
        clearProps: 'strokeDasharray,strokeDashoffset,willChange,transform',
      })
    }

    const terminalizePathwayIconsForCleanup = () => {
      getPathwayIconPaths().forEach((path) => {
        path.style.strokeDasharray = ''
        path.style.strokeDashoffset = ''
        path.style.willChange = ''
        path.style.transform = ''
      })
    }

    const terminalizeExploreMotion = (updateLastVisible = true) => {
      if (!root.isConnected) return
      const targets = getExploreMotionTargets()
      if (targets.length === 0) return
      setOutsideContext(targets, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        clearProps: 'willChange,transform',
      })
      terminalizePathwayIcons()
      settleMountGates(targets)
      if (updateLastVisible) updateLastVisibleFirst4Ids()
    }

    const terminalizeExploreMotionForCleanup = (updateLastVisible = true) => {
      if (!root.isConnected) return
      const targets = getExploreMotionTargets()
      applyTerminalDomStyles(targets, updateLastVisible)
      terminalizePathwayIconsForCleanup()
      settleMountGates(targets)
    }

    let exploreListReplayTimeline: gsap.core.Timeline | null = null

    const terminalizeExploreListMotion = (updateLastVisible = true) => {
      if (!root.isConnected) return
      const { terminalTargets } = getLiveExploreListTargets()
      if (terminalTargets.length === 0) return
      setOutsideContext(terminalTargets, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        clearProps: 'willChange,transform',
      })
      settleMountGates(terminalTargets)
      if (updateLastVisible) updateLastVisibleFirst4Ids()
    }

    const terminalizeExploreListMotionForCleanup = (updateLastVisible = true) => {
      if (!root.isConnected) return
      const { terminalTargets } = getLiveExploreListTargets()
      if (terminalTargets.length === 0) return
      applyTerminalDomStyles(terminalTargets, updateLastVisible)
      settleMountGates(terminalTargets)
    }

    const stopExploreListReplay = () => {
      exploreListReplayTimeline?.eventCallback('onInterrupt', null)
      exploreListReplayTimeline?.kill()
      exploreListReplayTimeline = null
      terminalizeExploreListMotion(false)
    }

    const stopExploreListReplayForCleanup = () => {
      exploreListReplayTimeline?.eventCallback('onComplete', null)
      exploreListReplayTimeline?.eventCallback('onInterrupt', null)
      exploreListReplayTimeline?.kill()
      exploreListReplayTimeline = null
      terminalizeExploreListMotionForCleanup(false)
    }

    const stopMountMotionAndTerminalize = (updateLastVisible = true) => {
      mountTimelineRef.current?.eventCallback('onInterrupt', null)
      mountTimelineRef.current?.kill()
      mountTimelineRef.current = null
      terminalizeExploreMotion(updateLastVisible)
    }

    const runExploreListReplay = (reasons: ExploreReplayReason[]) => {
      if (!root.isConnected) return
      const isGeoOnlyReplay = reasons.length > 0 && reasons.every((reason) => reason === 'geo')
      stopExploreListReplay()
      if (mountTimelineRef.current) stopMountMotionAndTerminalize(!isGeoOnlyReplay)

      const { replayTargets, terminalTargets } = getLiveExploreListTargets()
      if (terminalTargets.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        terminalizeExploreListMotion()
        return
      }

      if (isGeoOnlyReplay) {
        const previousFirst4Ids = lastVisibleFirst4IdsRef.current
        const previousFirst4Set = new Set(previousFirst4Ids)
        const currentCards = getFirstScreenMountainCards()
        const newFirstScreenCards = currentCards.filter((card) => {
          const id = getMountainCardId(card)
          return id !== '' && !previousFirst4Set.has(id)
        })
        const reorderedFirstScreenCards = currentCards.filter((card, index) => {
          const id = getMountainCardId(card)
          return id !== '' && previousFirst4Set.has(id) && previousFirst4Ids[index] !== id
        })
        const geoMotionTargets = getFirstScreenMountainMotionTargets([...newFirstScreenCards, ...reorderedFirstScreenCards])
        if (geoMotionTargets.length === 0) {
          recordExploreReplayReasons('firedReplayReasons', reasons)
          terminalizeExploreListMotion()
          return
        }

        setOutsideContext(geoMotionTargets, { autoAlpha: 1, y: 10, scale: 0.985, willChange: 'transform, opacity' })
        recordExploreReplayReasons('firedReplayReasons', reasons)

        const geoReplayDuration = Math.min(Math.max(parseMotionTokenSeconds(root, '--motion-base', 240), 0.28), 0.38)
        exploreListReplayTimeline = gsap.timeline({
          defaults: { duration: geoReplayDuration, ease: 'power3.out' },
          onComplete: () => terminalizeExploreListMotion(),
          onInterrupt: () => terminalizeExploreListMotion(),
        })
        exploreListReplayTimeline.addLabel('sourceReplay', 0)
        if (newFirstScreenCards.length > 0) {
          exploreListReplayTimeline.fromTo(newFirstScreenCards, { autoAlpha: 1, y: 12, scale: 0.985 }, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            stagger: { each: 0.025, from: 'start' },
          }, 'sourceReplay')
        }
        if (reorderedFirstScreenCards.length > 0) {
          exploreListReplayTimeline.fromTo(reorderedFirstScreenCards, { y: 8, scale: 0.99 }, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            stagger: { each: 0.02, from: 'start' },
          }, 'sourceReplay')
        }
        return
      }

      if (replayTargets.length > 0) {
        setOutsideContext(replayTargets, { autoAlpha: 0, y: 18, scale: 0.96, willChange: 'transform, opacity' })
      }
      recordExploreReplayReasons('firedReplayReasons', reasons)

      const replayDuration = Math.min(Math.max(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.42), 0.52)
      exploreListReplayTimeline = gsap.timeline({
        defaults: { ease: 'back.out(1.3)' },
        onComplete: terminalizeExploreListMotion,
        onInterrupt: terminalizeExploreListMotion,
      })
      exploreListReplayTimeline.addLabel('sourceReplay', 0)
      exploreListReplayTimeline.fromTo(replayTargets, { autoAlpha: 0, y: 18, scale: 0.96 }, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: replayDuration,
        ease: 'back.out(1.3)',
        stagger: { each: 0.03, from: 'start' },
      }, 'sourceReplay')
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
            mountSettledRef.current = true
            terminalizeExploreMotion()
            flushPendingExploreListReplay(runExploreListReplay)
            return () => terminalizeExploreMotion()
          }

          const baseDuration = Math.min(parseMotionTokenSeconds(root, '--motion-base', 240), 0.18)
          const enterDuration = Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.2)
          const fastDuration = Math.min(parseMotionTokenSeconds(root, '--motion-fast', 180), 0.14)
          const cardDuration = Math.min(parseMotionTokenSeconds(root, '--motion-enter', 320), 0.16)
          const schedule = {
            shell: 0,
            search: 0.12,
            pathways: 0.22,
            pathwayCards: 0.26,
            listHeading: 0.3,
            quickTags: 0.34,
            listSubheading: 0.4,
            firstCards: 0.45,
          } as const
          const motionMap = new Map(getScopedTargets('[data-explore-motion]').map((target) => [target.dataset.exploreMotion, target]))
          const pathwayCards = getScopedTargets('[data-explore-pathway-card]')
          const pathwayIconPaths = getPathwayIconPaths()
          const quickTagChips = getScopedTargets('.explore-filter-chip')
          const firstScreenCards = getFirstScreenMountainMotionTargets()
          const animatedTargets = getExploreMotionTargets()

          if (animatedTargets.length > 0) setOutsideContext(animatedTargets, { willChange: 'transform, opacity' })
          const scenePanel = motionMap.get('pathways')
          if (scenePanel) scenePanel.dataset.exploreMountState = 'running'
          firstScreenCards.forEach((card, index) => {
            card.dataset.exploreMotionParticipation = 'first-screen'
            card.dataset.exploreMotionIndex = String(index)
          })
          const timeline = gsap.timeline({
            defaults: { duration: baseDuration, ease: 'power3.out' },
            onComplete: () => {
              mountTimelineRef.current = null
              const preserveQueuedFirst4 = pendingExploreReplayReasonsRef.current.has('geo')
              terminalizeExploreMotion(!preserveQueuedFirst4)
              mountSettledRef.current = true
              flushPendingExploreListReplay(runExploreListReplay)
            },
            onInterrupt: terminalizeExploreMotion,
          })
          mountTimelineRef.current = timeline

          timeline
            .addLabel('shell', schedule.shell)
            .fromTo(root, { y: 12 }, { y: 0, duration: baseDuration, ease: 'power3.out' }, 'shell')

          const addMotion = (key: string, label: string, position: string | number, fromY = 16, scale = 0.98) => {
            const target = motionMap.get(key)
            if (!target) return
            timeline.addLabel(label, position)
            const fromVars = scale === 1 ? { autoAlpha: 0, y: fromY } : { autoAlpha: 0, y: fromY, scale }
            const toVars = scale === 1
              ? { autoAlpha: 1, y: 0, duration: enterDuration, ease: key === 'pathways' ? 'back.out(1.3)' : 'power3.out' }
              : { autoAlpha: 1, y: 0, scale: 1, duration: enterDuration, ease: key === 'pathways' ? 'back.out(1.3)' : 'power3.out' }
            timeline.fromTo(target, fromVars, toVars, label)
          }

          addMotion('search', 'search', schedule.search, 18, 0.96)
          addMotion('pathways', 'pathways', schedule.pathways, 18, 0.96)
          if (pathwayCards.length > 0) {
            timeline.fromTo(pathwayCards, { autoAlpha: 0, y: 14, scale: 0.94 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: fastDuration,
              ease: 'back.out(1.3)',
              stagger: { each: 0.035, from: 'start' },
            }, schedule.pathwayCards)
          }
          if (pathwayIconPaths.length > 0) {
            timeline.fromTo(pathwayIconPaths, { strokeDasharray: 24, strokeDashoffset: 24 }, {
              strokeDasharray: 24,
              strokeDashoffset: 0,
              duration: fastDuration,
              ease: 'power3.out',
              stagger: { each: 0.035, from: 'start' },
            }, schedule.pathwayCards + 0.04)
          }
          addMotion('list-heading', 'listHeading', schedule.listHeading, 14, 0.98)
          if (quickTagChips.length > 0) {
            timeline.addLabel('quickTags', schedule.quickTags)
            timeline.fromTo(quickTagChips, { autoAlpha: 0, y: 10 }, {
              autoAlpha: 1,
              y: 0,
              duration: fastDuration,
              ease: 'power3.out',
              stagger: { each: 0.03, from: 'start' },
            }, 'quickTags')
          }
          addMotion('list-subheading', 'listSubheading', schedule.listSubheading, 12, 1)
          if (firstScreenCards.length > 0) {
            timeline.addLabel('firstCards', schedule.firstCards)
            timeline.fromTo(firstScreenCards, { autoAlpha: 0, y: 18, scale: 0.96 }, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: cardDuration,
              ease: 'back.out(1.3)',
              stagger: { each: 0.03, from: 'start' },
            }, 'firstCards')
          }

          return () => {
            timeline.eventCallback('onComplete', null)
            timeline.eventCallback('onInterrupt', null)
            timeline.kill()
            if (mountTimelineRef.current === timeline) mountTimelineRef.current = null
            terminalizeExploreMotionForCleanup()
          }
        },
        root,
      )

      return () => {
        mm.revert()
        terminalizeExploreMotion()
      }
    }

    const safeRunExploreListReplay = (
      contextSafe ? contextSafe(runExploreListReplay) : runExploreListReplay
    ) as (reasons: ExploreReplayReason[]) => void
    const safeTerminalizeExploreList = (contextSafe ? contextSafe(stopExploreListReplay) : stopExploreListReplay) as () => void
    replayExploreListRef.current = safeRunExploreListReplay
    terminalizeExploreListRef.current = safeTerminalizeExploreList
    const cleanup = runMotion()
    return () => {
      replayExploreListRef.current = null
      terminalizeExploreListRef.current = null
      stopExploreListReplayForCleanup()
      if (typeof cleanup === 'function') cleanup()
      mountTimelineRef.current = null
      terminalizeExploreMotionForCleanup()
    }
  }, { scope: motionScopeRef, dependencies: [] })

  useLayoutEffect(() => {
    const previousResultKind = previousExploreResultKindRef.current
    const previousSignature = previousFilteredMountainSignatureRef.current
    const searchChanged = previousSearchRef.current !== search
    const signatureChanged = previousSignature !== filteredMountainSignature

    previousExploreResultKindRef.current = exploreResultKind
    previousFilteredMountainSignatureRef.current = filteredMountainSignature
    previousSearchRef.current = search

    if (searchChanged && previousResultKind !== 'results' && exploreResultKind === 'results') {
      queueExploreListReplay('search')
    } else if (searchChanged && previousResultKind === 'results' && exploreResultKind === 'results' && signatureChanged) {
      terminalizeExploreListRef.current?.()
    } else if (searchChanged && (signatureChanged || previousResultKind !== exploreResultKind)) {
      terminalizeExploreListRef.current?.()
    }
    flushPendingExploreListReplay()
  }, [tag, difficulty, altitudeBand, lengthBand, position, filteredMountainSignature, search, exploreResultKind, queueExploreListReplay])

  return (
    <>
      <style>
        {'.explore-filter-scroll::-webkit-scrollbar{display:none}.explore-search-input::placeholder{color:var(--color-on-surface-variant);opacity:1}'}
      </style>
      <div
        ref={motionScopeRef}
        className="explore-page-shell"
        data-explore-motion="shell"
        data-explore-position-state={position ? 'resolved' : 'null'}
        style={{
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
          minWidth: 0,
        }}
      >
        <section
          aria-label="探索搜索"
          data-explore-motion="search"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              minWidth: 0,
            }}
          >
            <label
              aria-label="搜索山名、地区、海拔"
              style={{
                flex: 1,
                minWidth: 0,
                height: 'var(--control-size)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '0 var(--space-3)',
                background: 'var(--color-surface-variant)',
                border: '1px solid var(--color-outline)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              <SearchIcon size={18} />
              <input
                className="explore-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜山名、地区、海拔"
                style={{
                  width: '100%',
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--color-on-surface)',
                  caretColor: 'var(--color-success)',
                  fontSize: 'var(--font-body-m-size)',
                  lineHeight: 'var(--font-body-m-line)',
                  fontWeight: 'var(--font-body-m-weight)',
                }}
              />
            </label>
            <button
              type="button"
              className="pt-pressable"
              onClick={() => setShowAdvanced((value) => !value)}
              onPointerDown={markPressFallback}
              onPointerUp={clearPressFallback}
              onPointerCancel={clearPressFallback}
              onPointerLeave={clearPressFallback}
              onBlur={clearPressFallback}
              aria-label={showAdvanced ? '收起高级筛选' : '展开高级筛选'}
              aria-pressed={showAdvanced}
              style={{
                appearance: 'none',
                width: 'var(--control-size)',
                height: 'var(--control-size)',
                flex: '0 0 var(--control-size)',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid var(--color-outline)',
                borderRadius: 'var(--radius-md)',
                background: showAdvanced
                  ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
                  : 'var(--color-surface-variant)',
                color: showAdvanced ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
                cursor: 'pointer',
              }}
            >
              <FilterIcon size={18} />
            </button>
          </div>

          {provinceRankingEnabled && provinceBanner !== undefined ? (
            <div>
              <ProvinceBannerStrip banner={provinceBanner} />
            </div>
          ) : null}
        </section>

        <section
          aria-label="山行入口"
          className="explore-scene-panel"
          data-explore-motion="pathways"
          data-explore-mount-state="pending"
          hidden={exploreResultKind === 'rich-empty'}
        >
          <video
            ref={sceneVideoRef}
            className="explore-scene-panel__video"
            src="/explore/explore-hero.mp4"
            poster="/explore/explore-hero-poster.jpg"
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            data-explore-video-state="poster"
          />
          <div className="explore-scene-panel__scrim" aria-hidden="true" />
          <div className="explore-scene-panel__copy">
            <p className="explore-scene-panel__eyebrow">已经走过？把结果带回来</p>
            <p className="explore-scene-panel__subtitle">走过的路，值得留下来</p>
          </div>
          <div className="explore-scene-panel__actions">
            <ScenePathwayButton
              kind="import"
              title="导入记录"
              prompt="选择记录文件 →"
              onClick={goImport}
            />
            <ScenePathwayButton
              kind="screenshot"
              title="识别截图"
              prompt="挑一张截图 →"
              onClick={goScreenshot}
            />
          </div>
        </section>

        {exploreResultKind === 'rich-empty' ? (
          <ExploreSearchEmptyState
            goImport={goImport}
            goScreenshot={goScreenshot}
            onSubmitMountainRequest={showExploreMountainRequestPlaceholder}
          />
        ) : (
          <section
            aria-labelledby="mountain-list-heading"
            style={{
              marginTop: 'var(--space-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              minWidth: 0,
            }}
          >
          <p
            id="mountain-list-heading"
            data-explore-motion="list-heading"
            style={{
              margin: 0,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              columnGap: 'var(--space-1)',
              rowGap: '2px',
            }}
          >
            <span
              style={{
                color: 'var(--color-on-surface)',
                fontSize: 'var(--font-title-m-size)',
                lineHeight: 'var(--font-title-m-line)',
                fontWeight: 600,
              }}
            >
              找山出发
            </span>
            <span
              style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-body-m-size)',
                lineHeight: 'var(--font-body-m-line)',
                fontWeight: 'var(--font-body-m-weight)',
              }}
            >
              · 挑一座适合你的山进行登顶打卡
            </span>
          </p>

          <div
            className="explore-filter-scroll"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: 'var(--space-2)',
              overflowX: 'auto',
              padding: '0 var(--space-2) var(--space-1)',
              marginInline: 'calc(var(--space-2) * -1)',
              whiteSpace: 'nowrap',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {QUICK_TAGS.map((item) => (
              <Chip
                key={item}
                onClick={() => handleTagChange(item)}
                active={tag === item}
                className="explore-filter-chip"
              >
                {item}
              </Chip>
            ))}
          </div>

          {showAdvanced && (
            <div
              style={{
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--color-outline)',
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
                onChange={(value) => handleDifficultyChange(value as typeof difficulty)}
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
                onChange={(value) => handleAltitudeBandChange(value as typeof altitudeBand)}
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
                onChange={(value) => handleLengthBandChange(value as typeof lengthBand)}
              />
            </div>
          )}

          <div
            data-explore-motion="list-subheading"
            style={{
              display: 'grid',
              gap: 'var(--space-1)',
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
                minWidth: 0,
              }}
            >
              <SectionHeader title="山峰列表" />
              {activeFilterCount > 0 ? <Chip active>已筛选 {activeFilterCount}</Chip> : null}
            </div>
            <p
              style={{
                margin: 0,
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-m-size)',
                lineHeight: 'var(--font-label-m-line)',
                fontWeight: 'var(--font-label-m-weight)',
              }}
            >
              {mountainListDescription}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              data-explore-list-empty
              data-explore-empty-kind="filter"
              className="pt-empty-state--surface"
              icon={<SearchIcon size={22} />}
              title="没有找到匹配的山峰"
              copy="试试切换标签或清空高级筛选条件。"
              style={{ padding: 'var(--space-4)' }}
            />
          ) : (
            <div
              data-testid="explore-mountain-list"
              data-explore-visible-count={visibleResults.length}
              style={{
                display: 'grid',
                gap: 'var(--space-3)',
                minWidth: 0,
              }}
            >
              {visibleResults.map(({ mountain, length }, index) => (
                <ExploreMountainCard
                  key={mountain.id}
                  mountain={mountain}
                  filterLengthKm={length}
                  mountPending={index < 4 && !mountSettledRef.current}
                  imagePriority={index < 2}
                  isCheckedIn={checkedMountainIdSet.has(mountain.id)}
                  onCheckedInPress={showCheckedMountainFeedback}
                  loadMoreSentinelRef={
                    canLoadMore && index === loadMoreTriggerIndex
                      ? loadMoreSentinelRef
                      : undefined
                  }
                />
              ))}
            </div>
          )}
          </section>
        )}
      </div>
    </>
  )
}

function ExploreSearchEmptyState({
  goImport,
  goScreenshot,
  onSubmitMountainRequest,
}: {
  goImport: () => void
  goScreenshot: () => void
  onSubmitMountainRequest: () => void
}) {
  const actionVideoRefs = useRef<Array<HTMLVideoElement | null>>([])

  useEffect(() => {
    const videos = actionVideoRefs.current.filter((video): video is HTMLVideoElement => video !== null)
    if (videos.length === 0) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const retryTargets = new Set<HTMLVideoElement>()
    let disposed = false
    let retryArmed = false
    let retryUsed = false

    const showPoster = (video: HTMLVideoElement) => {
      video.pause()
      try {
        video.currentTime = 0
      } catch {
        // The poster remains visible even when metadata is unavailable.
      }
      video.dataset.exploreEmptyVideoState = 'poster'
    }

    const removeRetryListeners = () => {
      if (!retryArmed) return
      retryArmed = false
      window.removeEventListener('pointerdown', retryPlayback)
      window.removeEventListener('keydown', retryPlayback)
    }

    const attemptPlayback = async (video: HTMLVideoElement, allowRetry: boolean) => {
      try {
        await video.play()
        if (disposed || reducedMotion.matches) {
          showPoster(video)
          return
        }
        retryTargets.delete(video)
        video.dataset.exploreEmptyVideoState = 'playing'
        if (retryTargets.size === 0) removeRetryListeners()
      } catch {
        if (disposed) return
        showPoster(video)
        if (allowRetry) {
          retryTargets.add(video)
          armPlaybackRetry()
        }
      }
    }

    const retryPlayback = () => {
      removeRetryListeners()
      if (disposed || retryUsed || reducedMotion.matches) return
      retryUsed = true
      const targets = [...retryTargets]
      retryTargets.clear()
      targets.forEach((video) => { void attemptPlayback(video, false) })
    }

    const armPlaybackRetry = () => {
      if (retryArmed || retryUsed || reducedMotion.matches) return
      retryArmed = true
      window.addEventListener('pointerdown', retryPlayback, { once: true })
      window.addEventListener('keydown', retryPlayback, { once: true })
    }

    const syncPlaybackPreference = () => {
      removeRetryListeners()
      retryTargets.clear()
      if (reducedMotion.matches) {
        videos.forEach(showPoster)
        return
      }
      videos.forEach((video) => { void attemptPlayback(video, true) })
    }

    syncPlaybackPreference()
    reducedMotion.addEventListener('change', syncPlaybackPreference)
    return () => {
      disposed = true
      removeRetryListeners()
      retryTargets.clear()
      reducedMotion.removeEventListener('change', syncPlaybackPreference)
      videos.forEach((video) => video.pause())
    }
  }, [])

  return (
    <section
      data-explore-list-empty
      data-explore-empty-kind="search"
      className="explore-search-empty"
      aria-labelledby="explore-search-empty-title"
    >
      <svg
        className="explore-search-empty__ridge"
        width="150"
        height="70"
        viewBox="0 0 150 70"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="explore-empty-ridge-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-outline)" stopOpacity="0" />
            <stop offset="42%" stopColor="var(--color-outline)" />
            <stop offset="58%" stopColor="var(--color-outline)" />
            <stop offset="100%" stopColor="var(--color-outline)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M4 58 28 32l16 12 22-28 20 22 18-12 42 26"
          stroke="url(#explore-empty-ridge-fade)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="66" cy="16" r="3" fill="var(--color-on-surface-variant)" />
        <path d="m62 12 8 8m0-8-8 8" stroke="var(--color-on-surface-variant)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>

      <div className="explore-search-empty__heading">
        <h2 id="explore-search-empty-title">没找到这座山</h2>
        <p>Peak Trekker 收录的山有限。如果你已经走过它，可以直接把结果带回来。</p>
      </div>

      <div className="explore-search-empty__actions">
        <ExploreImportMethodCard
          kind="import"
          title="导入轨迹记录"
          description="GPX / FIT · 自动匹配最近的山"
          onClick={goImport}
          videoRef={(video) => { actionVideoRefs.current[0] = video }}
          src="/explore/explore-empty-import.mp4"
          poster="/explore/explore-empty-import-poster.jpg"
          primary
        />
        <ExploreImportMethodCard
          kind="screenshot"
          title="识别成绩截图"
          description="把别家 App 的记录变成一次山行"
          onClick={goScreenshot}
          videoRef={(video) => { actionVideoRefs.current[1] = video }}
          src="/explore/explore-empty-shot.mp4"
          poster="/explore/explore-empty-shot-poster.jpg"
        />
      </div>

      <p className="explore-search-empty__footnote">
        山峰暂未收录？{' '}
        <button
          type="button"
          className="pt-pressable explore-search-empty__submit"
          onClick={onSubmitMountainRequest}
        >
          提交一座山的资料
        </button>
      </p>
    </section>
  )
}


function ScenePathwayButton({
  kind,
  title,
  prompt,
  onClick,
}: {
  kind: 'import' | 'screenshot'
  title: string
  prompt: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-explore-pathway-card={title}
      data-explore-pathway-button={title}
      className="pt-pathway-press explore-scene-panel__action"
      aria-label={title}
      onClick={(event) => {
        clearPressFallback(event)
        onClick()
      }}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onKeyDown={markKeyboardPressFallback}
      onKeyUp={clearPressFallback}
      onBlur={clearPressFallback}
    >
      <ScenePathwayIcon kind={kind} />
      <span className="explore-scene-panel__action-copy">
        <span className="explore-scene-panel__title">{title}</span>
        <span className="explore-scene-panel__prompt" aria-hidden="true">{prompt}</span>
      </span>
    </button>
  )
}

function ScenePathwayIcon({ kind }: { kind: 'import' | 'screenshot' }) {
  return (
    <svg
      className={`explore-scene-panel__icon explore-scene-panel__icon--${kind}`}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'import' ? (
        <path
          data-explore-pathway-icon-path
          d="M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10M5 15.5v3h14v-3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          data-explore-pathway-icon-path
          d="M8 4.5H4.5V8M16 4.5h3.5V8M8 19.5H4.5V16M16 19.5h3.5V16m-10-4 2 2 4-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
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
      <div
        style={{
          marginBottom: 'var(--space-2)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 'var(--font-label-s-weight)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
        }}
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            onClick={() => onChange(option.value)}
            active={value === option.value}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}
