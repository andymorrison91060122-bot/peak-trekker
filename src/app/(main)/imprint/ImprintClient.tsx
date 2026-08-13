'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { CameraIcon, MountainIcon } from '@/components/ui/Icons'
import {
  buildExploreShareTemplateUrl,
  buildImprintUrl,
  buildImprintImportUrl,
  buildImprintScreenshotUrl,
  storePendingShareTemplate,
} from '@/lib/share-template-intent'
import { getShareTemplateComponent, getShareTemplateRegistryEntry } from '@/lib/share-templates/registry'
import type { ShareRenderTemplate, ShareTemplateData } from '@/lib/share-templates/types'
import { buildShareTrackPreview } from '@/lib/share-track-preview'

gsap.registerPlugin(useGSAP)

type FacadeTemplateKey = 'vertical' | 'minimal' | 'route' | 'alt' | 'profile' | 'photo'
type ImprintScreen = 'facade' | 'method'
type MotionFormat = 'comma' | 'dec1' | 'plus' | 'duration'
type PressFallbackEvent = PointerEvent<HTMLElement> | FocusEvent<HTMLElement>

type FacadeTemplate = {
  key: FacadeTemplateKey
  template: ShareRenderTemplate
  photoDataUrl?: string | null
}

const PHOTO_ALPINE = '/fu85-share-facade/cover-alpine.png'
const PHOTO_RIDGE = '/fu85-share-facade/cover-ridge.png'
const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1920
const MIN_CARD_HEIGHT = 320
const MAX_CARD_HEIGHT = 426

function markPressFallback(event: PointerEvent<HTMLElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

const TEMPLATE_ITEMS: FacadeTemplate[] = [
  { key: 'vertical', template: 'base-vertical-classic', photoDataUrl: PHOTO_ALPINE },
  { key: 'minimal', template: 'base-classic' },
  { key: 'route', template: 'premium-photo-composite', photoDataUrl: PHOTO_ALPINE },
  { key: 'alt', template: 'premium-bold-number', photoDataUrl: PHOTO_ALPINE },
  { key: 'profile', template: 'premium-altitude-profile' },
  { key: 'photo', template: 'premium-photo-overlay', photoDataUrl: PHOTO_RIDGE },
]

const IMPRINT_SAMPLE_TRACK_POINTS = [
  { lat: 38.2794, lng: 75.1152, altitude: 4400 },
  { lat: 38.2812, lng: 75.1178, altitude: 4800 },
  { lat: 38.2831, lng: 75.1206, altitude: 5400 },
  { lat: 38.2853, lng: 75.1239, altitude: 5800 },
  { lat: 38.2878, lng: 75.1274, altitude: 6200 },
  { lat: 38.2904, lng: 75.1308, altitude: 6500 },
  { lat: 38.2932, lng: 75.1339, altitude: 6800 },
  { lat: 38.296, lng: 75.1365, altitude: 7200 },
  { lat: 38.2987, lng: 75.1388, altitude: 7546 },
]

function buildImprintSampleShareData(): ShareTemplateData {
  return {
    mountainName: '慕士塔格峰',
    location: '新疆',
    date: '2026.06.30',
    altitude: 7546,
    distance: 20.0,
    duration: '30:00',
    elevationGain: 3146,
    source: 'uploaded',
    trackPreview: buildShareTrackPreview(IMPRINT_SAMPLE_TRACK_POINTS),
    visibleFields: {
      duration: true,
      elevationGain: true,
      date: true,
      location: true,
      pace: true,
      mountainName: true,
    },
  }
}

function calculateCardHeight(availableHeight = MAX_CARD_HEIGHT + 260) {
  return Math.max(MIN_CARD_HEIGHT, Math.min(MAX_CARD_HEIGHT, availableHeight - 230))
}

function initialIndexForTemplate(template?: ShareRenderTemplate) {
  if (!template) return 0
  const index = TEMPLATE_ITEMS.findIndex((item) => item.template === template)
  return index >= 0 ? index : 0
}

function deckPosition(offset: number, cardWidth: number) {
  const direction = Math.sign(offset)
  const distance = Math.abs(offset)
  if (distance === 0) return { x: 0, scale: 1, autoAlpha: 1, zIndex: 5 }
  if (distance === 1) return { x: direction * cardWidth * 0.54, scale: 0.84, autoAlpha: 0.55, zIndex: 4 }
  return { x: direction * (cardWidth * 0.77 + Math.max(0, distance - 2) * 30), scale: 0.72, autoAlpha: 0, zIndex: 3 }
}

function formatMotionValue(value: number, format?: string) {
  if (!Number.isFinite(value)) return '--'
  if (format === 'dec1') return value.toFixed(1)
  if (format === 'duration') {
    const totalSeconds = Math.max(0, Math.round(value))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }
  const rounded = String(Math.round(value))
  return format === 'plus' ? `+${rounded}` : rounded
}

function isReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function motionOrder(target: HTMLElement | SVGElement, fallbackIndex: number) {
  const explicit = Number((target as HTMLElement).dataset.motionOrder)
  if (Number.isFinite(explicit)) return explicit
  const kind = (target as HTMLElement).dataset.motionKind
  if (kind === 'brand') return 10
  if (kind === 'title' || kind === 'mountain') return 18
  if (kind === 'date' || kind === 'location') return 22
  if (kind === 'altitude-label') return 26
  if (kind === 'altitude-unit') return 36
  if (kind === 'metric-label') return 44
  if (kind === 'metric-value') return 52
  if (kind === 'metric-unit') return 58
  if (kind === 'pill') return 68
  return 80 + fallbackIndex
}

function sortMotionTargets<T extends HTMLElement | SVGElement>(targets: T[]) {
  return targets
    .map((target, index) => ({ target, index, order: motionOrder(target, index) }))
    .sort((a, b) => (a.order === b.order ? a.index - b.index : a.order - b.order))
    .map((item) => item.target)
}

function FileTrackIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13 3v6h6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 14h6M9 17h4" stroke="var(--color-success)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TemplatePosterPreview({
  template,
  data,
  photoDataUrl,
  height,
}: {
  template: ShareRenderTemplate
  data: ShareTemplateData
  photoDataUrl?: string | null
  height: number
}) {
  const scale = height / POSTER_HEIGHT
  const width = POSTER_WIDTH * scale
  const templateElement = getShareTemplateComponent(template)({ data, photoDataUrl })

  return (
    <div
      aria-hidden="true"
      className="imprint-poster-preview"
      style={{
        width,
        height,
        overflow: 'hidden',
        borderRadius: Math.max(10, height * 0.043),
        background: '#111416',
        boxShadow: '0 18px 44px rgba(0,0,0,.38)',
        contain: 'layout paint size',
      }}
    >
      <div
        style={{
          width: POSTER_WIDTH,
          height: POSTER_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        {templateElement}
      </div>
    </div>
  )
}

function PremiumBadge({ paywallEnabled }: { paywallEnabled: boolean }) {
  return (
    <span
      className={paywallEnabled ? 'imprint-premium-badge imprint-premium-badge--locked' : 'imprint-premium-badge'}
      data-role="badge"
      data-motion-kind="premium-badge"
    >
      {paywallEnabled ? '高级' : '限免'}
    </span>
  )
}

function TemplateCard({
  item,
  data,
  paywallEnabled,
  index,
  cardHeight,
  onSelect,
}: {
  item: FacadeTemplate
  data: ShareTemplateData
  paywallEnabled: boolean
  index: number
  cardHeight: number
  onSelect: () => void
}) {
  const registryEntry = getShareTemplateRegistryEntry(item.template)

  return (
    <button
      type="button"
      className="imprint-card pt-pressable-card"
      data-imprint-card
      data-template={item.template}
      data-index={index}
      data-action="card"
      data-i={index}
      onClick={onSelect}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
      aria-label={`选择第 ${index + 1} 款样式`}
    >
      {registryEntry.tier === 'premium' ? <PremiumBadge paywallEnabled={paywallEnabled} /> : null}
      <TemplatePosterPreview
        template={item.template}
        data={data}
        photoDataUrl={item.photoDataUrl}
        height={cardHeight}
      />
    </button>
  )
}

function SourceOption({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="imprint-source-option pt-pressable-card"
      onClick={onClick}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
    >
      <span className="imprint-source-icon">{icon}</span>
      <span className="imprint-source-copy">
        <span className="imprint-source-title">{title}</span>
        <span className="imprint-source-subtitle">{subtitle}</span>
      </span>
      <span className="imprint-source-chevron">
        <ChevronIcon size={16} />
      </span>
    </button>
  )
}

function Dot({ active, onClick, index }: { active: boolean; onClick: () => void; index: number }) {
  return (
    <button
      type="button"
      className="imprint-dot pt-pressable"
      data-imprint-dot
      data-i={index}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onBlur={clearPressFallback}
      aria-label={active ? '当前样式' : `切换到第 ${index + 1} 款样式`}
    />
  )
}

export default function ImprintClient({
  paywallEnabled,
  isAuthenticated,
  initialTemplate,
  initialStep,
}: {
  paywallEnabled: boolean
  isAuthenticated: boolean
  initialTemplate?: ShareRenderTemplate
  initialStep?: 'source'
}) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const initialIndex = useMemo(() => initialIndexForTemplate(initialTemplate), [initialTemplate])
  const initialScreen: ImprintScreen = initialStep === 'source' ? 'method' : 'facade'
  const activeIndexRef = useRef(initialIndex)
  const selectedIndexRef = useRef(initialIndex)
  const screenRef = useRef<ImprintScreen>(initialScreen)
  const selectingRef = useRef(false)
  const pointerStartXRef = useRef<number | null>(null)
  const cardMotionTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const cardMotionTargetsRef = useRef<(HTMLElement | SVGElement)[]>([])
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [cardHeight, setCardHeight] = useState(MAX_CARD_HEIGHT)
  const shareData = useMemo(() => buildImprintSampleShareData(), [])
  const selectedItem = TEMPLATE_ITEMS[selectedIndex] ?? TEMPLATE_ITEMS[0]

  useEffect(() => {
    function syncHeight() {
      const availableHeight = rootRef.current?.clientHeight ?? window.innerHeight
      setCardHeight(calculateCardHeight(availableHeight))
    }
    syncHeight()
    window.addEventListener('resize', syncHeight)
    return () => window.removeEventListener('resize', syncHeight)
  }, [])

  function getCards() {
    return gsap.utils.toArray<HTMLElement>(rootRef.current?.querySelectorAll('[data-imprint-card]') ?? [])
  }

  function getCardWidth() {
    const card = rootRef.current?.querySelector<HTMLElement>('[data-imprint-card]')
    return card?.getBoundingClientRect().width ?? cardHeight * 9 / 16
  }

  function getActiveCard() {
    return rootRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndexRef.current}"]`) ?? null
  }

  function updateDots(index: number) {
    const dots = gsap.utils.toArray<HTMLElement>(rootRef.current?.querySelectorAll('[data-imprint-dot]') ?? [])
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index
      dot.dataset.active = active ? 'true' : 'false'
      if (isReducedMotion()) {
        gsap.set(dot, { scale: active ? 1.16 : 1 })
      } else {
        gsap.to(dot, { scale: active ? 1.16 : 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto' })
      }
    })
  }

  function clearCardMotionTimeline() {
    cardMotionTimelineRef.current?.kill()
    cardMotionTimelineRef.current = null
    if (cardMotionTargetsRef.current.length) {
      gsap.set(cardMotionTargetsRef.current, { clearProps: 'willChange' })
      cardMotionTargetsRef.current = []
    }
  }

  function settleCardDrawTargets(drawTargets: SVGGeometryElement[]) {
    drawTargets.forEach((draw) => {
      draw.style.strokeDasharray = ''
      draw.style.strokeDashoffset = '0'
    })
  }

  function layoutDeck(animated: boolean) {
    const cards = getCards()
    const width = getCardWidth()
    cards.forEach((card, index) => {
      const offset = index - activeIndexRef.current
      const position = deckPosition(offset, width)
      card.style.zIndex = String(position.zIndex)
      card.style.pointerEvents = Math.abs(offset) <= 1 ? 'auto' : 'none'
      if (animated && !isReducedMotion()) {
        gsap.to(card, {
          x: position.x,
          scale: position.scale,
          autoAlpha: position.autoAlpha,
          duration: 0.55,
          ease: 'power3.out',
          overwrite: 'auto',
        })
      } else {
        gsap.set(card, { x: position.x, scale: position.scale, autoAlpha: position.autoAlpha })
      }
    })
  }

  function playCard(scope: HTMLElement | null, animate = true) {
    if (!scope) return
    clearCardMotionTimeline()
    const stat = isReducedMotion() || !animate
    const textTargets = sortMotionTargets(gsap.utils.toArray<HTMLElement>(scope.querySelectorAll('[data-role="text"]')))
    const nums = gsap.utils.toArray<HTMLElement>(scope.querySelectorAll('[data-role="num"]'))
    const drawTargets = gsap.utils.toArray<SVGGeometryElement>(scope.querySelectorAll('[data-role="draw"]'))
    const popTargets = gsap.utils.toArray<HTMLElement | SVGElement>(scope.querySelectorAll('[data-role="pop"]'))
    const fillTargets = gsap.utils.toArray<HTMLElement | SVGElement>(scope.querySelectorAll('[data-role="fill"]'))
    const ruleTargets = gsap.utils.toArray<HTMLElement | SVGElement>(scope.querySelectorAll('[data-role="rule"]'))
    gsap.killTweensOf([...textTargets, ...nums, ...drawTargets, ...popTargets, ...fillTargets, ...ruleTargets])

    if (stat) {
      if (textTargets.length) gsap.set(textTargets, { autoAlpha: 1, y: 0, clearProps: 'willChange' })
      nums.forEach((num) => {
        const target = Number(num.dataset.val)
        const format = num.dataset.fmt as MotionFormat | undefined
        if (Number.isFinite(target)) num.textContent = formatMotionValue(target, format)
        gsap.set(num, { autoAlpha: 1, y: 0, clearProps: 'willChange' })
      })
      settleCardDrawTargets(drawTargets)
      if (popTargets.length) gsap.set(popTargets, { autoAlpha: 1, scale: 1, transformOrigin: 'center', clearProps: 'willChange' })
      fillTargets.forEach((fill) => {
        const targetOpacity = Number((fill as HTMLElement).dataset.op ?? 0.2)
        gsap.set(fill, { opacity: targetOpacity, clearProps: 'willChange' })
      })
      if (ruleTargets.length) gsap.set(ruleTargets, { scaleX: 1, transformOrigin: 'left center', clearProps: 'willChange' })
      return
    }

    if (textTargets.length) gsap.set(textTargets, { autoAlpha: 0, y: 0, willChange: 'opacity' })
    nums.forEach((num) => {
      const target = Number(num.dataset.val)
      const format = num.dataset.fmt as MotionFormat | undefined
      if (!Number.isFinite(target)) return
      num.textContent = formatMotionValue(0, format)
      gsap.set(num, { autoAlpha: 1, y: 0, clearProps: 'willChange' })
    })

    drawTargets.forEach((draw) => {
      let length = 220
      try {
        length = draw.getTotalLength()
      } catch {}
      gsap.set(draw, { strokeDasharray: length, strokeDashoffset: length })
    })
    if (popTargets.length) gsap.set(popTargets, { scale: 1, autoAlpha: 0, transformOrigin: 'center', willChange: 'opacity' })
    fillTargets.forEach((fill) => gsap.set(fill, { opacity: 0, willChange: 'opacity' }))
    if (ruleTargets.length) gsap.set(ruleTargets, { scaleX: 0, transformOrigin: 'left center', willChange: 'transform' })

    const motionTargets = [...textTargets, ...nums, ...drawTargets, ...popTargets, ...fillTargets, ...ruleTargets]
    cardMotionTargetsRef.current = motionTargets
    const tl = gsap.timeline({
      onComplete: () => {
        settleCardDrawTargets(drawTargets)
        if (cardMotionTimelineRef.current === tl) {
          if (cardMotionTargetsRef.current.length) gsap.set(cardMotionTargetsRef.current, { clearProps: 'willChange' })
          cardMotionTargetsRef.current = []
          cardMotionTimelineRef.current = null
        }
      },
    })
    cardMotionTimelineRef.current = tl
    if (textTargets.length) {
      tl.to(textTargets, {
        autoAlpha: 1,
        duration: 0.46,
        stagger: { each: 0.075, from: 'start' },
        ease: 'power2.out',
        overwrite: 'auto',
        clearProps: 'willChange',
      }, 0)
    }
    nums.forEach((num) => {
      const target = Number(num.dataset.val)
      const format = num.dataset.fmt as MotionFormat | undefined
      if (!Number.isFinite(target)) return
      const value = { current: 0 }
      tl.to(value, {
        current: target,
        duration: 1.5,
        ease: 'power2.out',
        overwrite: 'auto',
        onUpdate: () => {
          num.textContent = formatMotionValue(value.current, format)
        },
        onComplete: () => {
          num.textContent = formatMotionValue(target, format)
          gsap.set(num, { clearProps: 'willChange' })
        },
      }, 0.5)
    })

    if (drawTargets.length) {
      tl.to(drawTargets, {
        strokeDashoffset: 0,
        duration: 1.45,
        ease: 'power2.inOut',
        overwrite: 'auto',
      }, 0.68)
    }

    if (fillTargets.length) {
      tl.to(fillTargets, {
        opacity: (_index, target) => Number((target as HTMLElement).dataset.op ?? 0.2),
        duration: 1.15,
        ease: 'power2.out',
        overwrite: 'auto',
        clearProps: 'willChange',
      }, 0.58)
    }

    if (ruleTargets.length) {
      tl.to(ruleTargets, {
        scaleX: 1,
        duration: 0.85,
        ease: 'power3.out',
        overwrite: 'auto',
        clearProps: 'willChange',
      }, 0.62)
    }

    if (popTargets.length) {
      tl.to(popTargets, {
        autoAlpha: 1,
        duration: 0.55,
        ease: 'power3.out',
        stagger: 0.08,
        overwrite: 'auto',
        clearProps: 'willChange',
      }, 1.08)
    }
  }

  function resetRim() {
    const rim = rootRef.current?.querySelector<HTMLElement>('.imprint-rim')
    if (rim) gsap.set(rim, { autoAlpha: 0, scale: 1, transformOrigin: 'center' })
  }

  function playFocusFrame(card: HTMLElement | null, animate = true) {
    const rim = rootRef.current?.querySelector<HTMLElement>('.imprint-rim')
    const badge = card?.querySelector<HTMLElement>('.imprint-premium-badge') ?? null
    const targets = [rim, badge].filter(Boolean) as HTMLElement[]
    if (!targets.length) return
    gsap.killTweensOf(targets)

    if (isReducedMotion() || !animate) {
      if (rim) gsap.set(rim, { autoAlpha: 0.24, scale: 1, transformOrigin: 'center', clearProps: 'willChange' })
      if (badge) gsap.set(badge, { autoAlpha: 1, scale: 1, transformOrigin: 'center', clearProps: 'willChange' })
      return
    }

    if (rim) gsap.set(rim, { willChange: 'transform, opacity' })
    if (badge) gsap.set(badge, { willChange: 'transform, opacity' })
    const tl = gsap.timeline()
    if (rim) {
      tl.fromTo(rim, {
        autoAlpha: 0,
        scale: 1,
        transformOrigin: 'center',
      }, {
        autoAlpha: 0.38,
        scale: 1.015,
        duration: 0.38,
        ease: 'power2.out',
      }, 0)
      tl.to(rim, {
        autoAlpha: 0.24,
        scale: 1,
        duration: 0.46,
        ease: 'power2.inOut',
        clearProps: 'willChange',
      }, 0.38)
    }
    if (badge) {
      tl.fromTo(badge, {
        autoAlpha: 0,
        scale: 0.96,
        transformOrigin: 'center',
      }, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.42,
        ease: 'power2.out',
        clearProps: 'willChange',
      }, 0.08)
    }
  }

  const { contextSafe } = useGSAP(() => {
    const root = rootRef.current
    if (!root) return
    const rootEl = root

    function applyScreenState(name: ImprintScreen) {
      const facade = rootEl.querySelector<HTMLElement>('[data-imprint-screen="facade"]')
      const method = rootEl.querySelector<HTMLElement>('[data-imprint-screen="method"]')
      gsap.set(facade, { autoAlpha: name === 'facade' ? 1 : 0, x: 0, pointerEvents: name === 'facade' ? 'auto' : 'none' })
      gsap.set(method, { autoAlpha: name === 'method' ? 1 : 0, x: name === 'method' ? 0 : 24, pointerEvents: name === 'method' ? 'auto' : 'none' })
    }

    layoutDeck(false)
    resetRim()
    applyScreenState(screenRef.current)

    if (isReducedMotion()) {
      gsap.set(rootEl.querySelectorAll('[data-imprint-entrance]'), { autoAlpha: 1, y: 0 })
      playCard(getActiveCard(), false)
      playFocusFrame(getActiveCard(), false)
      return
    }

    const cards = getCards()
    const head = rootEl.querySelector('.imprint-fac-head')
    const dots = rootEl.querySelector('.imprint-dots')
    const hint = rootEl.querySelector('.imprint-hint')
    const cta = rootEl.querySelector('.imprint-cta')
    const entranceHints = [dots, hint].filter((target): target is Element => target !== null)

    gsap.set(cards, { autoAlpha: 0, y: 24 })
    const tl = gsap.timeline()
    tl.from(head, { y: -10, autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 0)
    tl.to(cards, {
      y: 0,
      autoAlpha: (index) => deckPosition(index - activeIndexRef.current, getCardWidth()).autoAlpha,
      duration: 0.7,
      stagger: { each: 0.08, from: 'center' },
      ease: 'power3.out',
    }, 0.05)
    tl.from(entranceHints, { y: 12, autoAlpha: 0, duration: 0.5, stagger: 0.07, ease: 'power2.out' }, 0.32)
    if (cta) {
      tl.fromTo(cta, { y: 12, autoAlpha: 0 }, {
        y: 0,
        autoAlpha: 1,
        duration: 0.5,
        ease: 'power2.out',
      }, 0.46)
      tl.set(cta, { autoAlpha: 1, y: 0 }, 1.02)
    }
    tl.add(() => {
      const activeCard = getActiveCard()
      playCard(activeCard, true)
      playFocusFrame(activeCard, true)
    }, '>-0.25')

    return () => {
      clearCardMotionTimeline()
    }
  }, { scope: rootRef })

  function goToTemplate(index: number) {
    contextSafe(() => {
      const bounded = Math.max(0, Math.min(TEMPLATE_ITEMS.length - 1, index))
      if (bounded === activeIndexRef.current || selectingRef.current) return
      activeIndexRef.current = bounded
      setActiveIndex(bounded)
      resetRim()
      layoutDeck(true)
      updateDots(bounded)
      const activeCard = getActiveCard()
      playCard(activeCard, true)
      playFocusFrame(activeCard, true)
      const hint = rootRef.current?.querySelector<HTMLElement>('.imprint-hint')
      if (hint && !isReducedMotion()) gsap.to(hint, { autoAlpha: 0, duration: 0.4, overwrite: 'auto' })
    })()
  }

  function ensureCanAdvance() {
    if (isAuthenticated) return true
    const template = TEMPLATE_ITEMS[activeIndexRef.current]?.template ?? TEMPLATE_ITEMS[0].template
    router.push(`/auth/login?from=${encodeURIComponent(buildImprintUrl(template))}`)
    return false
  }

  function goToScreen(name: ImprintScreen) {
    contextSafe(() => {
      if (name === 'method' && !ensureCanAdvance()) return
      if (name === screenRef.current) return
      const root = rootRef.current
      if (!root) return
      const from = root.querySelector<HTMLElement>(`[data-imprint-screen="${screenRef.current}"]`)
      const to = root.querySelector<HTMLElement>(`[data-imprint-screen="${name}"]`)
      if (!from || !to) return
      if (name === 'facade') resetRim()
      screenRef.current = name
      if (isReducedMotion()) {
        gsap.set(from, { autoAlpha: 0, x: 0, pointerEvents: 'none' })
        gsap.set(to, { autoAlpha: 1, x: 0, pointerEvents: 'auto' })
        return
      }
      const tl = gsap.timeline()
      tl.to(from, { autoAlpha: 0, x: name === 'method' ? -20 : 24, duration: 0.26, ease: 'power2.in' }, 0)
      tl.set(from, { pointerEvents: 'none' })
      tl.fromTo(to, { x: name === 'method' ? 24 : -20, autoAlpha: 0 }, {
        x: 0,
        autoAlpha: 1,
        pointerEvents: 'auto',
        duration: 0.42,
        ease: 'power3.out',
      }, 0.16)
      if (name === 'method') {
        const sourceOptions = to.querySelectorAll('.imprint-source-option')
        tl.fromTo(sourceOptions, {
          y: 16,
          autoAlpha: 0,
        }, {
          y: 0,
          autoAlpha: 1,
          duration: 0.45,
          stagger: 0.07,
          ease: 'power3.out',
          onComplete: () => gsap.set(sourceOptions, { autoAlpha: 1, y: 0, clearProps: 'transform' }),
          onInterrupt: () => gsap.set(sourceOptions, { autoAlpha: 1, y: 0 }),
        }, '>-0.18')
      }
    })()
  }

  function selectActiveTemplate() {
    contextSafe(() => {
      if (selectingRef.current) return
      if (!ensureCanAdvance()) return
      const nextIndex = activeIndexRef.current
      selectingRef.current = true
      selectedIndexRef.current = nextIndex
      setSelectedIndex(nextIndex)
      const root = rootRef.current
      const activeCard = getActiveCard()
      const rim = root?.querySelector<HTMLElement>('.imprint-rim')
      const badge = activeCard?.querySelector<HTMLElement>('.imprint-premium-badge') ?? null
      if (!root || !rim || !activeCard || isReducedMotion()) {
        selectingRef.current = false
        requestAnimationFrame(() => goToScreen('method'))
        return
      }
      gsap.killTweensOf([rim, activeCard, badge].filter(Boolean))
      const tl = gsap.timeline({
        onComplete: () => {
          selectingRef.current = false
          goToScreen('method')
        },
      })
      tl.fromTo(rim, {
        autoAlpha: 0,
        scale: 1,
        transformOrigin: 'center',
      }, {
        autoAlpha: 1,
        scale: 1.03,
        duration: 0.5,
        ease: 'power2.out',
      }, 0)
      tl.to(activeCard, { scale: 1.03, duration: 0.5, ease: 'power2.out' }, 0)
      tl.to(rim, { autoAlpha: 0.6, scale: 1, duration: 0.36, ease: 'power2.inOut' }, 0.5)
      tl.to(activeCard, { scale: 1, duration: 0.36, ease: 'power2.inOut' }, 0.5)
    })()
  }

  function onDeckPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStartXRef.current = event.clientX
  }

  function onDeckPointerUp(event: PointerEvent<HTMLDivElement>) {
    contextSafe(() => {
      const start = pointerStartXRef.current
      pointerStartXRef.current = null
      if (typeof start !== 'number') return
      const delta = event.clientX - start
      if (Math.abs(delta) < 36) return
      goToTemplate(activeIndexRef.current + (delta < 0 ? 1 : -1))
    })()
  }

  function goToImport() {
    router.push(buildImprintImportUrl(selectedItem.template))
  }

  function goToScreenshot() {
    router.push(buildImprintScreenshotUrl(selectedItem.template))
  }

  function goToRecord() {
    storePendingShareTemplate(selectedItem.template)
    router.push(buildExploreShareTemplateUrl(selectedItem.template))
  }

  return (
    <div
      ref={rootRef}
      className="imprint-root"
      data-testid="imprint-facade"
      style={{
        '--imprint-card-height': `${cardHeight}px`,
        '--imprint-card-width': `${cardHeight * 9 / 16}px`,
      } as CSSProperties}
    >
      <style>{`
        @font-face {
          font-family: 'Noto Sans SC';
          src: url('/fu85-share-facade/NotoSansSC-Imprint-Bold.woff2') format('woff2');
          font-weight: 700 800;
          font-style: normal;
          font-display: swap;
        }
        .imprint-root {
          min-height: calc(100dvh - 61px - 88px - env(safe-area-inset-bottom));
          position: relative;
          overflow: hidden;
          color: var(--color-on-surface);
          background: radial-gradient(120% 80% at 50% 0%, #0e1413 0%, #0a0c0e 55%, #08090b 100%);
          font-family: var(--font-sans);
        }
        .imprint-root * { box-sizing: border-box; }
        .imprint-root button {
          font-family: inherit;
          appearance: none;
          -webkit-tap-highlight-color: transparent;
        }
        .imprint-root button:focus-visible {
          outline: 2px solid var(--color-success);
          outline-offset: 3px;
        }
        .imprint-screen {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .imprint-fac-head {
          flex: none;
          padding: 16px 22px 4px;
        }
        .imprint-title {
          margin: 0;
          color: #f5f7f8;
          font-size: 17px;
          line-height: 1.25;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .imprint-subtitle {
          margin: 4px 0 0;
          color: #8d959b;
          font-size: 11px;
          line-height: 1.5;
        }
        .imprint-deck-band {
          flex: 1;
          position: relative;
          overflow: hidden;
          touch-action: pan-y;
        }
        .imprint-card,
        .imprint-rim {
          position: absolute;
          left: calc(50% - var(--imprint-card-width) / 2);
          top: calc(50% - var(--imprint-card-height) / 2);
          width: var(--imprint-card-width);
          height: var(--imprint-card-height);
          border-radius: 18px;
        }
        .imprint-card {
          display: block;
          padding: 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.1);
          background: #101417;
          box-shadow:
            0 34px 72px rgba(0,0,0,.62),
            0 14px 28px rgba(0,0,0,.44),
            0 0 0 1px rgba(255,255,255,.04),
            0 0 42px rgba(34,197,94,.14);
          cursor: pointer;
          opacity: 0;
          visibility: hidden;
          will-change: transform, opacity;
        }
        .imprint-card::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 2;
          border-radius: inherit;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 16%, rgba(255,255,255,0) 38%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.18),
            inset 0 -1px 0 rgba(255,255,255,.04),
            inset 0 0 0 1px rgba(255,255,255,.05);
        }
        .imprint-rim {
          z-index: 6;
          border: 1.5px solid #6ee7a1;
          box-shadow:
            0 0 26px 3px rgba(110,231,161,.5),
            0 0 8px 1px rgba(110,231,161,.72),
            inset 0 0 16px rgba(110,231,161,.3);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          will-change: transform, opacity;
        }
        .imprint-poster-preview {
          width: 100% !important;
          height: 100% !important;
          border-radius: 18px !important;
          box-shadow: none !important;
          text-align: left;
        }
        .imprint-premium-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 3;
          display: inline-flex;
          align-items: center;
          height: 24px;
          padding: 0 9px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(110,231,161,.16);
          color: var(--color-success);
          font-size: 11px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: 0;
          backdrop-filter: blur(10px);
        }
        .imprint-premium-badge--locked {
          background: rgba(245,247,248,.12);
          color: rgba(245,247,248,.78);
        }
        .imprint-dots {
          flex: none;
          display: flex;
          justify-content: center;
          gap: 7px;
          padding: 6px 0 2px;
        }
        .imprint-dot {
          width: 7px;
          height: 7px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: rgba(255,255,255,.32);
          opacity: .86;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
          cursor: pointer;
        }
        .imprint-dot[data-active="true"] {
          background: #6ee7a1;
          opacity: 1;
          transform: scale(1.16);
          box-shadow: 0 0 10px rgba(110,231,161,.42);
        }
        .imprint-hint {
          flex: none;
          padding: 3px 0 0;
          text-align: center;
          color: #8d959b;
          font-size: 10px;
          line-height: 1.3;
        }
        .imprint-cta-wrap {
          flex: none;
          padding: 11px 22px 16px;
        }
        .imprint-cta {
          width: 100%;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          border-radius: 12px;
          background: #22c55e;
          color: #08120d;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          box-shadow:
            0 14px 30px rgba(34,197,94,.26),
            inset 0 1px 0 rgba(255,255,255,.18);
        }
        .imprint-method {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translateX(24px);
        }
        .imprint-method-topbar {
          height: 50px;
          flex: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          border-bottom: 1px solid rgba(255,255,255,.05);
        }
        .imprint-back-btn {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          padding: 0;
          border: 1px solid #2f353b;
          background: rgba(18,20,22,.7);
          cursor: pointer;
        }
        .imprint-method-title {
          color: #f5f7f8;
          font-size: 15px;
          font-weight: 600;
        }
        .imprint-method-scroll {
          flex: 1;
          overflow: auto;
          padding: 16px 20px 20px;
          scrollbar-width: none;
        }
        .imprint-method-scroll::-webkit-scrollbar { display: none; }
        .imprint-chosen-card {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 11px;
          border: 1px solid #2f353b;
          border-radius: 14px;
          background: #23272c;
        }
        .imprint-chosen-mini {
          width: 64px;
          height: 114px;
          flex: none;
          overflow: hidden;
          border-radius: 11px;
          border: 1px solid #2f353b;
          background: #0f1316;
        }
        .imprint-chosen-kicker {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #6ee7a1;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: .02em;
        }
        .imprint-chosen-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #6ee7a1;
          flex: none;
        }
        .imprint-chosen-copy {
          margin-top: 6px;
          color: #f5f7f8;
          font-size: 13px;
          line-height: 1.5;
          font-weight: 600;
        }
        .imprint-change-style {
          margin-top: 7px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #8d959b;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .imprint-section-label {
          margin: 20px 2px 11px;
          color: #8d959b;
          font-size: 11px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .imprint-source-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .imprint-source-option {
          width: 100%;
          height: 72px;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 0 16px;
          border: 1px solid #2f353b;
          border-radius: 14px;
          background: #23272c;
          text-align: left;
          cursor: pointer;
        }
        .imprint-source-icon {
          width: 44px;
          height: 44px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: 12px;
          border: 1px solid #2f353b;
          background: rgba(255,255,255,.04);
          color: #f5f7f8;
        }
        .imprint-source-copy {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .imprint-source-title {
          color: #f5f7f8;
          font-size: 14px;
          line-height: 1.2;
          font-weight: 700;
        }
        .imprint-source-subtitle {
          color: #8d959b;
          font-size: 11px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .imprint-source-chevron {
          flex: none;
          color: #8d959b;
        }
        @media (max-height: 680px) {
          .imprint-fac-head { padding-top: 10px; }
          .imprint-title { font-size: 16px; }
          .imprint-subtitle { margin-top: 2px; line-height: 1.35; }
          .imprint-cta-wrap { padding-bottom: 12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .imprint-root *,
          .imprint-root *::before,
          .imprint-root *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <section className="imprint-screen imprint-facade" data-imprint-screen="facade">
        <div className="imprint-fac-head">
          <h1 className="imprint-title">先挑一个喜欢的样子</h1>
          <p className="imprint-subtitle">分享你的登山记录时，就用这张样式</p>
        </div>

        <div className="imprint-deck-band" onPointerDown={onDeckPointerDown} onPointerUp={onDeckPointerUp} onPointerCancel={() => { pointerStartXRef.current = null }}>
          <div className="imprint-rim" aria-hidden="true" />
          {TEMPLATE_ITEMS.map((item, index) => (
            <TemplateCard
              key={item.key}
              item={item}
              data={shareData}
              paywallEnabled={paywallEnabled}
              index={index}
              cardHeight={cardHeight}
              onSelect={() => goToTemplate(index)}
            />
          ))}
        </div>

        <div className="imprint-dots">
          {TEMPLATE_ITEMS.map((item, index) => (
            <Dot key={item.key} active={index === activeIndex} index={index} onClick={() => goToTemplate(index)} />
          ))}
        </div>
        <div className="imprint-hint">左右滑动 · 浏览样式</div>

        <div className="imprint-cta-wrap">
          <button
            className="imprint-cta pt-pressable-hero"
            type="button"
            onClick={selectActiveTemplate}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
          >
            就用这一款 <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section className="imprint-screen imprint-method" data-imprint-screen="method">
        <div className="imprint-method-topbar">
          <button
            className="imprint-back-btn pt-pressable"
            type="button"
            onClick={() => goToScreen('facade')}
            onPointerDown={markPressFallback}
            onPointerUp={clearPressFallback}
            onPointerCancel={clearPressFallback}
            onPointerLeave={clearPressFallback}
            onBlur={clearPressFallback}
            aria-label="返回样式选择"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="#F5F7F8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="imprint-method-title">选择数据来源</div>
          <div style={{ width: 38 }} />
        </div>

        <div className="imprint-method-scroll">
          <div className="imprint-chosen-card">
            <div className="imprint-chosen-mini">
              <TemplatePosterPreview
                template={selectedItem.template}
                data={shareData}
                photoDataUrl={selectedItem.photoDataUrl}
                height={114}
              />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="imprint-chosen-kicker">
                <span className="imprint-chosen-dot" />
                <span>已选样式</span>
              </div>
              <div className="imprint-chosen-copy">
                稍后生成分享卡时，<br />会自动为你预选这一款
              </div>
              <button
                className="imprint-change-style pt-pressable"
                type="button"
                onClick={() => goToScreen('facade')}
                onPointerDown={markPressFallback}
                onPointerUp={clearPressFallback}
                onPointerCancel={clearPressFallback}
                onPointerLeave={clearPressFallback}
                onBlur={clearPressFallback}
              >
                换一个样式 →
              </button>
            </div>
          </div>

          <div className="imprint-section-label">数据从哪来</div>
          <div className="imprint-source-list">
            <SourceOption
              icon={<FileTrackIcon />}
              title="导入轨迹文件"
              subtitle="GPX / KML / FIT · 手表或其他 App"
              onClick={goToImport}
            />
            <SourceOption
              icon={<CameraIcon size={22} />}
              title="识别截图"
              subtitle="其他 App 的记录截图"
              onClick={goToScreenshot}
            />
            <SourceOption
              icon={<MountainIcon size={22} />}
              title="选山实时记录"
              subtitle="挑一座山，边走边记录"
              onClick={goToRecord}
            />
          </div>
        </div>
      </section>

    </div>
  )
}
