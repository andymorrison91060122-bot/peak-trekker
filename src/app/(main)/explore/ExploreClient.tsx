'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import ProvinceBannerStrip, { type ProvinceBannerData } from '@/components/explore/ProvinceBannerStrip'
import { ONBOARDING_EVENT, getProvinceDraft } from '@/lib/onboarding'
import { isFeatureEnabled } from '@/lib/feature-flags'
import ExploreMountainCard from '@/components/ui/ExploreMountainCard'
import Card from '@/components/ui/Card'
import Chip from '@/components/ui/Chip'
import SectionHeader from '@/components/ui/SectionHeader'
import { CameraIcon, FilterIcon, SearchIcon, ShareIcon } from '@/components/ui/Icons'
import { getDifficultyLevelLabel } from '@/lib/license-ui'
import { storePendingShareTemplate } from '@/lib/share-template-intent'
import type { Mountain } from '@/types'
import type { ShareRenderTemplate } from '@/lib/share-templates/types'

gsap.registerPlugin(useGSAP)

const provinceRankingEnabled = isFeatureEnabled('PROVINCE_RANKING')
const QUICK_TAGS = provinceRankingEnabled
  ? (['附近', '本省热门', '无执照可进', '高海拔', '长线'] as const)
  : (['附近', '无执照可进', '高海拔', '长线'] as const)

type ExploreReplayReason = 'geo' | 'tag' | 'province' | 'advancedFilter'
type ExploreReplayReasonLayer = 'queuedReasons' | 'firedReplayReasons'
type ExploreReplayReasonState = Record<ExploreReplayReasonLayer, ExploreReplayReason[]>
type ExplorePosition = { lat: number; lng: number }
type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

let cachedExplorePosition: ExplorePosition | null = null

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
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
  hometownProvince,
  provinceBanner,
  shareTemplateIntent,
}: {
  list: Mountain[]
  hometownProvince: string | null
  provinceBanner?: ProvinceBannerData | null
  shareTemplateIntent?: ShareRenderTemplate | null
}) {
  const router = useRouter()
  const motionScopeRef = useRef<HTMLDivElement | null>(null)
  const replayExploreListRef = useRef<((reasons: ExploreReplayReason[]) => void) | null>(null)
  const terminalizeExploreListRef = useRef<(() => void) | null>(null)
  const pendingExploreReplayRef = useRef(false)
  const pendingExploreReplayReasonsRef = useRef<Set<ExploreReplayReason>>(new Set())
  const mountSettledRef = useRef(false)
  const draftProvinceInitialSyncDoneRef = useRef(false)
  const draftProvinceRef = useRef<string | null>(hometownProvince)
  const positionRef = useRef<ExplorePosition | null>(cachedExplorePosition)
  const lastVisibleFirst4IdsRef = useRef<string[]>([])
  const mountTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<(typeof QUICK_TAGS)[number]>('附近')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [difficulty, setDifficulty] = useState<'all' | Mountain['difficulty']>('all')
  const [altitudeBand, setAltitudeBand] = useState<'all' | 'low' | 'mid' | 'high'>('all')
  const [lengthBand, setLengthBand] = useState<'all' | 'short' | 'mid' | 'long'>('all')
  const [position, setPosition] = useState<ExplorePosition | null>(() => cachedExplorePosition)
  const [draftProvince, setDraftProvince] = useState<string | null>(hometownProvince)

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

  useEffect(() => {
    const syncDraftProvince = () => {
      const nextProvince = getProvinceDraft()
      const previousProvince = draftProvinceRef.current
      const isInitialSync = !draftProvinceInitialSyncDoneRef.current
      draftProvinceInitialSyncDoneRef.current = true
      if (previousProvince === nextProvince) return
      draftProvinceRef.current = nextProvince
      if (!isInitialSync && hometownProvince === null) queueExploreListReplay('province')
      setDraftProvince(nextProvince)
    }
    syncDraftProvince()
    window.addEventListener(ONBOARDING_EVENT, syncDraftProvince)
    window.addEventListener('storage', syncDraftProvince)
    return () => {
      window.removeEventListener(ONBOARDING_EVENT, syncDraftProvince)
      window.removeEventListener('storage', syncDraftProvince)
    }
  }, [hometownProvince, queueExploreListReplay])

  const effectiveProvince = hometownProvince ?? draftProvince
  const sorted = useMemo(() => {
    const withDistance = list.map((mountain) => ({
      mountain,
      distance: position ? haversine(position.lat, position.lng, mountain.latitude, mountain.longitude) : null,
      length: estimateLength(mountain),
    }))

    return withDistance.sort((a, b) => {
      if (tag === '附近' && a.distance !== null && b.distance !== null) return a.distance - b.distance
      if (provinceRankingEnabled && tag === '本省热门') {
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
          : provinceRankingEnabled && tag === '本省热门'
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

  const filteredMountainSignature = useMemo(
    () => filtered.map(({ mountain }) => mountain.id).join('|'),
    [filtered],
  )
  const activeFilterCount = [difficulty, altitudeBand, lengthBand].filter((value) => value !== 'all').length
  const goImport = () => router.push('/import')
  const goScreenshot = () => router.push('/screenshot')
  const mountainListDescription =
    tag === '附近' && position
      ? '已按你当前位置由近到远排序'
      : provinceRankingEnabled && tag === '本省热门' && effectiveProvince
        ? `已优先展示 ${effectiveProvince} 的热门路线`
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
    const getMountainCardId = (card: HTMLElement) =>
      (card.getAttribute('href') ?? '').split('/').filter(Boolean).at(-1) ?? ''
    const updateLastVisibleFirst4Ids = () => {
      lastVisibleFirst4IdsRef.current = getFirstScreenMountainCards().map(getMountainCardId).filter(Boolean)
    }
    const getLiveExploreListTargets = () => {
      const listSubheading = getScopedTargets('[data-explore-motion="list-subheading"]')
      const firstScreenCards = getFirstScreenMountainCards()
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
      ...getFirstScreenMountainCards(),
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
      if (updateLastVisible) updateLastVisibleFirst4Ids()
    }

    const terminalizeExploreMotionForCleanup = (updateLastVisible = true) => {
      if (!root.isConnected) return
      applyTerminalDomStyles(getExploreMotionTargets(), updateLastVisible)
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
      if (updateLastVisible) updateLastVisibleFirst4Ids()
    }

    const terminalizeExploreListMotionForCleanup = (updateLastVisible = true) => {
      if (!root.isConnected) return
      const { terminalTargets } = getLiveExploreListTargets()
      if (terminalTargets.length === 0) return
      applyTerminalDomStyles(terminalTargets, updateLastVisible)
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
        const geoMotionTargets = [...newFirstScreenCards, ...reorderedFirstScreenCards]
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
            header: 0.04,
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
          const quickTagChips = getScopedTargets('.explore-filter-chip')
          const firstScreenCards = getFirstScreenMountainCards()
          const animatedTargets = getExploreMotionTargets()

          if (animatedTargets.length > 0) setOutsideContext(animatedTargets, { willChange: 'transform, opacity' })
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

          addMotion('header', 'header', schedule.header, 14, 0.98)
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
    flushPendingExploreListReplay()
  }, [tag, effectiveProvince, difficulty, altitudeBand, lengthBand, position, filteredMountainSignature])

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
        <header data-explore-motion="header" style={{ textAlign: 'center' }}>
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
          data-explore-motion="pathways"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 'var(--space-3)',
            minWidth: 0,
          }}
        >
          <PathwayCard
            icon={<ShareIcon size={24} />}
            title="导入记录"
            description="导入轨迹文件，分享你的登顶记录"
            onClick={goImport}
          />
          <PathwayCard
            icon={<CameraIcon size={24} />}
            title="识别截图"
            description="上传其他 APP 轨迹截图，分享你的登顶记录"
            onClick={goScreenshot}
          />
        </section>

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
            <div data-explore-list-empty>
              <Card>
                <div style={{ display: 'grid', gap: 'var(--space-2)', textAlign: 'center' }}>
                  <div
                    style={{
                      color: 'var(--color-on-surface)',
                      fontSize: 'var(--font-title-m-size)',
                      lineHeight: 'var(--font-title-m-line)',
                      fontWeight: 600,
                    }}
                  >
                    没有找到匹配的山峰
                  </div>
                  <div
                    style={{
                      color: 'var(--color-on-surface-variant)',
                      fontSize: 'var(--font-body-m-size)',
                      lineHeight: 'var(--font-body-m-line)',
                      fontWeight: 'var(--font-body-m-weight)',
                    }}
                  >
                    试试切换标签或清空高级筛选条件。
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 'var(--space-3)',
                minWidth: 0,
              }}
            >
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
    <div data-explore-pathway-card={title} style={{ minWidth: 0 }}>
      <button
        type="button"
        data-explore-pathway-button={title}
        className="pt-pathway-press"
        onClick={onClick}
        onPointerDown={markPressFallback}
        onPointerUp={clearPressFallback}
        onPointerCancel={clearPressFallback}
        onPointerLeave={clearPressFallback}
        onBlur={clearPressFallback}
        style={{
          appearance: 'none',
          width: 'calc(100% - (var(--space-4) * 2) - 2px)',
          boxSizing: 'content-box',
          minWidth: 0,
          minHeight: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          background: 'var(--color-surface-variant)',
          color: 'var(--color-on-surface)',
          border: '1px solid var(--color-outline)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
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
    </div>
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
