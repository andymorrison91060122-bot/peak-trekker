'use client'

/* eslint-disable @next/next/no-img-element */

import type { ChangeEvent, CSSProperties, ReactNode, RefObject } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import {
  BackIcon,
  CameraIcon,
  MountainIcon,
  ShareIcon,
} from '@/components/ui/Icons'
import { trackEvent } from '@/lib/analytics/client'
import { POSTER_HEIGHT, POSTER_WIDTH, formatShareAltitude, hasShareAltitude } from '@/lib/share-templates/shared'
import { getShareTemplateComponent } from '@/lib/share-templates/registry'
import type { ShareRenderTemplate, ShareTemplateData } from '@/lib/share-templates/types'
import { buildShareTrackPreview, buildShareTrackRender, SHARE_TRACK_CONTENT_FIT, SHARE_TRACK_RENDER_PROFILES, type ShareTrackPreview } from '@/lib/share-track-preview'
import { buildImprintSourceUrl } from '@/lib/share-template-intent'

type ShareViewMode = 'editor' | 'watermarkPreview'
type ExportAction = 'save' | 'share' | 'transparent' | null
type ActiveExportAction = Exclude<ExportAction, null>
type ExportSuccessAction = 'save' | 'share-fallback' | 'transparent-save' | null
type TemplateId = ShareRenderTemplate
type BasicTemplateId = Extract<TemplateId, 'base-classic' | 'base-data'>
type AdvancedTemplateId = Exclude<TemplateId, BasicTemplateId>
type ShareFieldKey =
  | 'altitude'
  | 'distance'
  | 'duration'
  | 'elevationGain'
  | 'date'
  | 'location'
  | 'pace'
  | 'mountainName'

type ShareActivitySource = 'gps' | 'uploaded'

type ExportSnapshot = {
  action: ActiveExportAction
  template: TemplateId
  fieldToggles: Record<ShareFieldKey, boolean>
  photoDataUrl: string | null
  transparent: boolean
}

gsap.registerPlugin(useGSAP)

export interface ShareActivityData {
  mountainName?: string
  altitude?: number
  distance?: number
  duration?: number
  elevationGain?: number
  date?: string
  location?: string
  pace?: string
  source?: ShareActivitySource
  trackPreview?: ShareTrackPreview | null
}

type FieldConfig = {
  key: ShareFieldKey
  label: string
  locked: boolean
  defaultOn: boolean
}

type BasicTemplate = {
  id: BasicTemplateId
  label: string
  variant: 'classic' | 'data'
}

type AdvancedTemplate = {
  id: AdvancedTemplateId
  label: string
  kind:
    | 'photo-composite'
    | 'photo-overlay'
    | 'bold-number'
    | 'data-scatter'
    | 'mono-film'
    | 'altitude-profile'
    | 'summit-certificate'
    | 'vertical-story'
}

const MOCK_TRACK_POINTS = [
  { lat: 30.1075, lng: 118.1662, altitude: 720 },
  { lat: 30.1111, lng: 118.1691, altitude: 842 },
  { lat: 30.1164, lng: 118.1718, altitude: 1015 },
  { lat: 30.1217, lng: 118.174, altitude: 1184 },
  { lat: 30.1244, lng: 118.1788, altitude: 1298 },
  { lat: 30.1281, lng: 118.1835, altitude: 1432 },
  { lat: 30.1315, lng: 118.1878, altitude: 1540 },
  { lat: 30.1362, lng: 118.1902, altitude: 1618 },
  { lat: 30.1398, lng: 118.1945, altitude: 1684 },
]

const MOCK_DATA: ShareActivityData = {
  mountainName: '玉山主峰',
  altitude: 3952,
  distance: 12.8,
  duration: 24120,
  elevationGain: 1350,
  date: '2026.04.28',
  location: '台湾',
  source: 'gps',
  trackPreview: buildShareTrackPreview(MOCK_TRACK_POINTS),
}

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'altitude', label: '海拔', locked: true, defaultOn: true },
  { key: 'distance', label: '总距离', locked: true, defaultOn: true },
  { key: 'duration', label: '时长', locked: false, defaultOn: true },
  { key: 'elevationGain', label: '爬升', locked: false, defaultOn: true },
  { key: 'date', label: '日期', locked: false, defaultOn: true },
  { key: 'location', label: '地点', locked: false, defaultOn: true },
  { key: 'pace', label: '配速', locked: false, defaultOn: false },
  { key: 'mountainName', label: '山峰名', locked: false, defaultOn: true },
]

const BASIC_TEMPLATES: BasicTemplate[] = [
  { id: 'base-classic', label: 'Classic', variant: 'classic' },
  { id: 'base-data', label: 'Data', variant: 'data' },
]

const ADVANCED_TEMPLATES: AdvancedTemplate[] = [
  { id: 'premium-photo-composite', label: 'Photo', kind: 'photo-composite' },
  { id: 'premium-photo-overlay', label: 'Overlay', kind: 'photo-overlay' },
  { id: 'premium-bold-number', label: 'Number', kind: 'bold-number' },
  { id: 'premium-data-scatter', label: 'HUD', kind: 'data-scatter' },
  { id: 'premium-mono-film', label: 'Film', kind: 'mono-film' },
  { id: 'premium-altitude-profile', label: 'Profile', kind: 'altitude-profile' },
  { id: 'premium-summit-certificate', label: 'Cert', kind: 'summit-certificate' },
  { id: 'premium-vertical-story', label: 'Story', kind: 'vertical-story' },
]

type ShareTemplateOption =
  | { tier: 'basic'; template: BasicTemplate }
  | { tier: 'advanced'; template: AdvancedTemplate }

const SHARE_TEMPLATE_OPTIONS: ShareTemplateOption[] = [
  ...BASIC_TEMPLATES.map((template) => ({ tier: 'basic' as const, template })),
  ...ADVANCED_TEMPLATES.map((template) => ({ tier: 'advanced' as const, template })),
]

const initialFieldToggles = FIELD_CONFIGS.reduce<Record<ShareFieldKey, boolean>>((next, field) => {
  next[field.key] = field.defaultOn
  return next
}, {} as Record<ShareFieldKey, boolean>)

const SHARE_POSTER_BASE_WIDTH = 246
const SHARE_POSTER_FALLBACK_RADIUS = 12
const DEFAULT_SHARE_POSTER_SCALE = 232 / SHARE_POSTER_BASE_WIDTH

type SharePosterShellStyle = CSSProperties & {
  '--share-poster-scale': string
  '--share-poster-radius': string
}

const heroPreviewFrameStyle: CSSProperties = {
  width: SHARE_POSTER_BASE_WIDTH,
  aspectRatio: '9 / 16',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
  border: '1px solid var(--color-outline)',
  background: 'var(--color-surface)',
  position: 'relative',
  flexShrink: 0,
  boxShadow: '0 24px 56px color-mix(in srgb, var(--color-surface) 76%, transparent)',
}

const heroPreviewShellStyle: SharePosterShellStyle = {
  '--share-poster-scale': String(DEFAULT_SHARE_POSTER_SCALE),
  '--share-poster-radius': `${SHARE_POSTER_FALLBACK_RADIUS * DEFAULT_SHARE_POSTER_SCALE}px`,
  width: 'min(61.866vw, 232px)',
  aspectRatio: '9 / 16',
  position: 'relative',
  overflow: 'hidden',
  borderRadius: 'var(--share-poster-radius)',
}

const heroPreviewScaleStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: SHARE_POSTER_BASE_WIDTH,
  aspectRatio: '9 / 16',
  transform: 'scale(var(--share-poster-scale, 0.9430894309))',
  transformOrigin: 'top left',
  pointerEvents: 'none',
}

const heroPreviewInnerCardStyle: CSSProperties = {
  width: SHARE_POSTER_BASE_WIDTH,
  aspectRatio: '9 / 16',
  position: 'relative',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
}

const SHARE_STAGE_ORDER = ['header', 'poster', 'templateStrip', 'toolsRow', 'fieldPanel', 'bottomActionBar'] as const

function parseMotionTokenSeconds(root: HTMLElement, tokenName: string, fallbackMs: number) {
  const value = getComputedStyle(root).getPropertyValue(tokenName).trim()
  if (!value) return fallbackMs / 1000
  if (value.endsWith('ms')) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed / 1000 : fallbackMs / 1000
  }
  if (value.endsWith('s')) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallbackMs / 1000
  }
  return fallbackMs / 1000
}

function clearShareMotionPending(root: HTMLElement) {
  root.removeAttribute('data-motion-pending')
}

function isReducedMotionPreferred() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function syncSharePosterScale(shell: HTMLElement) {
  const width = shell.getBoundingClientRect().width
  if (!Number.isFinite(width) || width <= 0) return
  const scale = width / SHARE_POSTER_BASE_WIDTH
  const innerCard = shell.querySelector<HTMLElement>('[data-testid="share-poster-inner-card"]')
  const innerRadius = innerCard
    ? Number.parseFloat(getComputedStyle(innerCard).borderTopLeftRadius)
    : SHARE_POSTER_FALLBACK_RADIUS
  const baseRadius = Number.isFinite(innerRadius) && innerRadius > 0 ? innerRadius : SHARE_POSTER_FALLBACK_RADIUS
  shell.style.setProperty('--share-poster-scale', String(scale))
  shell.style.setProperty('--share-poster-radius', `${baseRadius * scale}px`)
}

function formatMotionValue(value: number, format: string | undefined) {
  if (!Number.isFinite(value)) return '--'
  if (format === 'decimal-1') return value.toFixed(1)
  return String(Math.round(value))
}

function getMotionNumberValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function formatNumber(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return String(Math.round(value))
}

function formatDistance(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return value.toFixed(1)
}

function formatDistanceWithUnit(value: number | undefined) {
  const formatted = formatDistance(value)
  return formatted === '--' ? formatted : `${formatted} km`
}

function formatDuration(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const safeSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatFieldValue(field: ShareFieldKey, data: ShareActivityData) {
  if (field === 'altitude') {
    return hasShareAltitude(data) ? `${formatShareAltitude(data)} m` : '--'
  }
  if (field === 'distance') return formatDistanceWithUnit(data.distance)
  if (field === 'duration') return formatDuration(data.duration)
  if (field === 'elevationGain') {
    const value = formatNumber(data.elevationGain)
    return value === '--' ? value : `${value} m`
  }
  if (field === 'date') return data.date ?? '--'
  if (field === 'location') return data.location ?? '--'
  if (field === 'pace') return data.pace ?? '--'
  return data.mountainName ?? '--'
}

function formatDisplayValue(field: ShareFieldKey, data: ShareActivityData) {
  const value = formatFieldValue(field, data)
  return value === '--' ? '未记录' : value
}

function isFieldMissing(field: ShareFieldKey, data: ShareActivityData) {
  return formatFieldValue(field, data) === '--'
}

function toShareTemplateData(data: ShareActivityData, toggles: Record<ShareFieldKey, boolean>): ShareTemplateData {
  return {
    mountainName: data.mountainName ?? '',
    location: data.location ?? '',
    date: data.date ?? '',
    altitude: typeof data.altitude === 'number' && Number.isFinite(data.altitude) ? data.altitude : null,
    distance: typeof data.distance === 'number' && Number.isFinite(data.distance) ? data.distance : 0,
    duration: formatDuration(data.duration),
    elevationGain: typeof data.elevationGain === 'number' && Number.isFinite(data.elevationGain) ? data.elevationGain : 0,
    source: data.source === 'gps' ? 'gps' : 'uploaded',
    trackPreview: data.trackPreview ?? null,
    visibleFields: {
      duration: Boolean(toggles.duration),
      elevationGain: Boolean(toggles.elevationGain),
      date: Boolean(toggles.date),
      location: Boolean(toggles.location),
      pace: Boolean(toggles.pace),
      mountainName: Boolean(toggles.mountainName),
    },
  }
}

function isAdvancedTemplateId(template: TemplateId): template is AdvancedTemplateId {
  return template.startsWith('premium-')
}

function isVisible(field: ShareFieldKey, toggles: Record<ShareFieldKey, boolean>) {
  const config = FIELD_CONFIGS.find((item) => item.key === field)
  return Boolean(config?.locked || toggles[field])
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function buildShareAttributionUrl({
  checkinId,
  template,
  currentUserId,
}: {
  checkinId?: string
  template: TemplateId
  currentUserId?: string | null
}) {
  if (typeof window === 'undefined') return { shareLinkId: crypto.randomUUID(), url: '' }
  const shareLinkId = crypto.randomUUID()
  const target = new URL(checkinId ? `/activity/${checkinId}` : '/explore', window.location.origin)
  target.searchParams.set('ref', shareLinkId)
  target.searchParams.set('template', template)
  if (currentUserId) target.searchParams.set('source', currentUserId)
  return { shareLinkId, url: target.toString() }
}

function noop() {}

function stripDataUrlPrefix(dataUrl: string | null) {
  return dataUrl?.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '') ?? undefined
}

function getPosterMotionTargets(root: HTMLElement) {
  const poster = root.querySelector<HTMLElement>('[data-stage="poster"]')
  if (!poster) {
    return { poster: null, textTargets: [], numberTargets: [], drawTargets: [] }
  }
  return {
    poster,
    textTargets: Array.from(poster.querySelectorAll<HTMLElement>('[data-lit="text"]')),
    numberTargets: Array.from(poster.querySelectorAll<HTMLElement>('[data-role="num"]')),
    drawTargets: Array.from(poster.querySelectorAll<SVGPathElement>('path[data-role="draw"]')),
  }
}

function setPosterMotionTerminal(root: HTMLElement) {
  const { textTargets, numberTargets, drawTargets } = getPosterMotionTargets(root)
  gsap.killTweensOf([...textTargets, ...numberTargets, ...drawTargets])
  gsap.set(textTargets, { autoAlpha: 1, y: 0, clearProps: 'willChange' })
  numberTargets.forEach((target) => {
    const value = Number.parseFloat(target.dataset.val ?? '')
    target.textContent = formatMotionValue(value, target.dataset.fmt)
  })
  drawTargets.forEach((target) => {
    gsap.set(target, { strokeDashoffset: 0, clearProps: 'willChange' })
  })
}

function preparePosterMotionInitialState(root: HTMLElement, options: { retry?: boolean } = {}) {
  const retry = options.retry ?? true
  const { textTargets, drawTargets } = getPosterMotionTargets(root)
  const targets = [...textTargets, ...drawTargets]
  gsap.killTweensOf(targets)
  gsap.set(textTargets, { autoAlpha: 0, y: 0, willChange: 'opacity' })

  let prepared = 0
  let failed = 0
  let retried = 0

  const prepareDrawTarget = (target: SVGPathElement, shouldRetry: boolean) => {
    try {
      const length = target.getTotalLength()
      if (Number.isFinite(length) && length > 0) {
        gsap.set(target, {
          strokeDasharray: length,
          strokeDashoffset: length,
          willChange: 'stroke-dashoffset',
        })
        target.dataset.motionPrepared = 'true'
        target.dataset.motionLength = String(length)
        target.dataset.motionPrepareStatus = 'prepared'
        return true
      }
      throw new Error(`invalid path length: ${length}`)
    } catch (error) {
      target.dataset.motionPrepared = 'false'
      target.dataset.motionPrepareStatus = shouldRetry ? 'retry-scheduled' : 'failed'
      if (shouldRetry && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          if (target.isConnected) prepareDrawTarget(target, false)
        })
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[share-motion] failed to prepare draw path initial state', error)
      }
      return false
    }
  }

  drawTargets.forEach((target) => {
    const ok = prepareDrawTarget(target, retry)
    if (ok) prepared += 1
    else {
      failed += 1
      if (retry) retried += 1
    }
  })

  return { prepared, failed, retried, total: drawTargets.length }
}

function buildPosterRelightTimeline(root: HTMLElement) {
  const { textTargets, numberTargets, drawTargets } = getPosterMotionTargets(root)
  const targets = [...textTargets, ...numberTargets, ...drawTargets]
  gsap.killTweensOf(targets)
  drawTargets.forEach((target) => {
    if (target.dataset.motionPrepareStatus !== 'prepared' && process.env.NODE_ENV !== 'production') {
      console.warn('[share-motion] draw path relight started before initial state was prepared')
    }
  })

  const timeline = gsap.timeline()
  if (textTargets.length > 0) {
    timeline.to(textTargets, {
      autoAlpha: 1,
      duration: 0.42,
      ease: 'power2.out',
      stagger: 0.06,
      clearProps: 'willChange',
    }, 0)
  }

  numberTargets.forEach((target, index) => {
    const endValue = Number.parseFloat(target.dataset.val ?? '')
    if (!Number.isFinite(endValue)) return
    const format = target.dataset.fmt
    const state = { value: 0 }
    target.textContent = formatMotionValue(0, format)
    timeline.to(state, {
      value: endValue,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: () => {
        target.textContent = formatMotionValue(state.value, format)
      },
      onComplete: () => {
        target.textContent = formatMotionValue(endValue, format)
      },
    }, 0.18 + index * 0.05)
  })

  if (drawTargets.length > 0) {
    timeline.to(drawTargets, {
      strokeDashoffset: 0,
      duration: 1.45,
      ease: 'power2.out',
      stagger: 0.08,
      clearProps: 'willChange',
    }, 0.24)
  }

  return timeline
}

function getExportMotionTargets(root: HTMLElement) {
  return {
    poster: root.querySelector<HTMLElement>('[data-testid="share-main-poster-preview"]'),
    innerCard: root.querySelector<HTMLElement>('[data-testid="share-poster-inner-card"]'),
    sweep: root.querySelector<HTMLElement>('[data-testid="share-export-sweep"]'),
    rim: root.querySelector<HTMLElement>('[data-testid="share-export-rim"]'),
    ghost: root.querySelector<HTMLElement>('[data-testid="share-export-ghost"]'),
    toast: root.querySelector<HTMLElement>('[data-testid="share-save-toast"]'),
    dimTargets: Array.from(root.querySelectorAll<HTMLElement>('[data-export-dim="true"]')),
    litTargets: Array.from(root.querySelectorAll<HTMLElement>('[data-lit="text"]')),
    numberTargets: Array.from(root.querySelectorAll<HTMLElement>('[data-role="num"]')),
  }
}

function resetExportMotion(root: HTMLElement) {
  const targets = getExportMotionTargets(root)
  gsap.killTweensOf([
    targets.poster,
    targets.sweep,
    targets.rim,
    targets.ghost,
    targets.toast,
    ...targets.dimTargets,
    ...targets.litTargets,
    ...targets.numberTargets,
  ].filter(Boolean) as HTMLElement[])
  if (targets.poster) gsap.set(targets.poster, { scale: 1, clearProps: 'willChange' })
  if (targets.sweep) gsap.set(targets.sweep, { autoAlpha: 0, xPercent: 0, yPercent: -150, clearProps: 'willChange' })
  if (targets.rim) gsap.set(targets.rim, { autoAlpha: 0, scale: 1, clearProps: 'willChange' })
  if (targets.ghost) gsap.set(targets.ghost, { autoAlpha: 0, x: 0, y: 0, scale: 1, clearProps: 'all' })
  if (targets.toast) gsap.set(targets.toast, { autoAlpha: 0, y: 16, clearProps: 'willChange' })
  gsap.set(targets.dimTargets, { autoAlpha: 1, clearProps: 'willChange' })
  targets.numberTargets.forEach((target) => {
    const value = Number.parseFloat(target.dataset.val ?? '')
    if (Number.isFinite(value)) target.textContent = formatMotionValue(value, target.dataset.fmt)
  })
}

function buildGeneratingTimeline(root: HTMLElement) {
  const targets = getExportMotionTargets(root)
  const timeline = gsap.timeline()
  const animatedTargets = [
    targets.poster,
    targets.sweep,
    ...targets.dimTargets,
    ...targets.litTargets,
    ...targets.numberTargets,
  ].filter(Boolean) as HTMLElement[]

  gsap.set(animatedTargets, { willChange: 'transform, opacity' })
  gsap.set(targets.dimTargets, { autoAlpha: 0.55 })

  if (targets.sweep) {
    timeline.fromTo(targets.sweep, {
      autoAlpha: 0,
      xPercent: 0,
      yPercent: -150,
    }, {
      autoAlpha: 0.9,
      yPercent: 300,
      duration: 1.6,
      ease: 'sine.inOut',
      repeat: -1,
    }, 0)
  }

  if (targets.litTargets.length > 0) {
    timeline.to(targets.litTargets, {
      autoAlpha: 0.58,
      duration: 0.22,
      ease: 'sine.inOut',
      stagger: 0.24,
      repeat: -1,
      yoyo: true,
    }, 0)
  }

  targets.numberTargets.forEach((target, index) => {
    const endValue = Number.parseFloat(target.dataset.val ?? '')
    if (!Number.isFinite(endValue)) return
    const format = target.dataset.fmt
    const state = { value: 0 }
    target.textContent = formatMotionValue(0, format)
    timeline.to(state, {
      value: endValue,
      duration: 0.72,
      ease: 'power2.out',
      onUpdate: () => {
        target.textContent = formatMotionValue(state.value, format)
      },
      onComplete: () => {
        target.textContent = formatMotionValue(endValue, format)
      },
    }, 0.1 + index * 0.04)
  })

  return timeline
}

function buildSuccessTimeline(root: HTMLElement, targetButton: HTMLElement | null) {
  const targets = getExportMotionTargets(root)
  const timeline = gsap.timeline()

  if (targets.poster) {
    gsap.set(targets.poster, { willChange: 'transform' })
    timeline.fromTo(targets.poster, { scale: 1.012 }, {
      scale: 1,
      duration: 0.5,
      ease: 'power3.out',
      clearProps: 'willChange',
    }, 0)
  }

  if (targets.rim) {
    gsap.set(targets.rim, { scale: 1, willChange: 'opacity' })
    timeline.fromTo(targets.rim, { autoAlpha: 0 }, {
      autoAlpha: 1,
      duration: 0.45,
      ease: 'power2.out',
    }, 0)
    timeline.to(targets.rim, {
      autoAlpha: 0.82,
      duration: 0.32,
      ease: 'power2.out',
      clearProps: 'willChange',
    }, 0.45)
  }

  const ghostSource = targets.innerCard ?? targets.poster
  if (ghostSource && targets.ghost && targetButton) {
    const posterRect = ghostSource.getBoundingClientRect()
    const buttonRect = targetButton.getBoundingClientRect()
    const endX = buttonRect.left + buttonRect.width / 2 - (posterRect.left + posterRect.width / 2)
    const endY = buttonRect.top + buttonRect.height / 2 - (posterRect.top + posterRect.height / 2)
    gsap.set(targets.ghost, {
      position: 'fixed',
      left: posterRect.left,
      top: posterRect.top,
      width: posterRect.width,
      height: posterRect.height,
      autoAlpha: 0.42,
      x: 0,
      y: 0,
      scale: 1,
      transformOrigin: '50% 50%',
      willChange: 'transform, opacity',
    })
    timeline.to(targets.ghost, {
      x: endX,
      y: endY,
      scale: 0.16,
      autoAlpha: 0,
      duration: 0.65,
      ease: 'power2.in',
      clearProps: 'all',
    }, 0.06)
  }

  if (targets.toast) {
    gsap.set(targets.toast, { willChange: 'transform, opacity' })
    timeline.fromTo(targets.toast, { autoAlpha: 0, y: 16 }, {
      autoAlpha: 1,
      y: 0,
      duration: 0.4,
      ease: 'power3.out',
    }, 0.28)
    timeline.to(targets.toast, {
      autoAlpha: 0,
      y: -8,
      duration: 0.24,
      ease: 'power2.in',
      clearProps: 'willChange',
    }, 1.55)
  }

  timeline.to(targets.dimTargets, {
    autoAlpha: 1,
    duration: 0.24,
    ease: 'power2.out',
    clearProps: 'willChange',
  }, 0)

  return timeline
}

function buildNativeShareSettleTimeline(root: HTMLElement) {
  const targets = getExportMotionTargets(root)
  const timeline = gsap.timeline()
  if (targets.poster) {
    gsap.set(targets.poster, { willChange: 'transform' })
    timeline.fromTo(targets.poster, { scale: 1.006 }, {
      scale: 1,
      duration: 0.28,
      ease: 'power2.out',
      clearProps: 'willChange',
    }, 0)
  }
  timeline.to(targets.dimTargets, {
    autoAlpha: 1,
    duration: 0.18,
    ease: 'power2.out',
    clearProps: 'willChange',
  }, 0)
  return timeline
}

async function resizePhotoFile(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('照片读取失败，请换一张再试'))
      nextImage.src = url
    })
    const maxWidth = 1080
    const scale = image.width > maxWidth ? maxWidth / image.width : 1
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('照片处理失败，请换一张再试')
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function IconButton({
  label,
  children,
  onClick = noop,
  style,
  disabled = false,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  style?: CSSProperties
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="share-editor-pressable"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        border: '1px solid #2f353b',
        background: '#23272c',
        color: 'var(--color-on-surface)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.46 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function NavBar({ onBack }: { onBack: () => void }) {
  return (
    <div
      data-stage="header"
      data-testid="share-nav"
      style={{
        height: 48,
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        background: 'rgba(18,20,22,.7)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}
    >
      <button
        type="button"
        aria-label="返回"
        onClick={onBack}
        style={{
          width: 44,
          height: 44,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-on-surface)',
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          cursor: 'pointer',
          zIndex: 1,
        }}
      >
        <BackIcon size={22} />
      </button>
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          pointerEvents: 'none',
          textAlign: 'center',
          color: 'var(--color-on-surface)',
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        分享编辑器
      </div>
      <div style={{ flex: 1 }} />
    </div>
  )
}

function TopoBackground() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 62% 18%, color-mix(in srgb, var(--color-primary) 15%, transparent), transparent 32%), linear-gradient(180deg, color-mix(in srgb, var(--color-surface-variant) 72%, var(--color-surface)), var(--color-surface))',
        }}
      />
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 280 498"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, opacity: 0.42 }}
        aria-hidden="true"
      >
        {[132, 112, 92, 74, 56, 38, 24].map((rx, index) => (
          <ellipse
            key={rx}
            cx={150 + index * 2}
            cy={170 + index * 5}
            rx={rx}
            ry={Math.max(18, rx * 0.7)}
            stroke="var(--color-on-surface)"
            strokeWidth="0.7"
            fill="none"
            opacity={0.08 + index * 0.018}
          />
        ))}
        <path d="M-10 292 Q 48 276 98 286 T 286 252" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity="0.1" />
        <path d="M-10 334 Q 62 318 128 326 T 290 300" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity="0.08" />
        <path d="M-10 96 Q 52 118 112 96 T 286 88" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity="0.07" />
      </svg>
    </>
  )
}

function TrailPath({ trackPreview }: { trackPreview?: ShareTrackPreview | null }) {
  const route = useMemo(() => buildShareTrackRender(trackPreview, {
    x: 32,
    y: 44,
    width: 216,
    height: 290,
    padding: 24,
    ...SHARE_TRACK_CONTENT_FIT,
  }, SHARE_TRACK_RENDER_PROFILES.shareEditorHero), [trackPreview])

  if (!route) return null

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 280 498"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      {route?.d ? (
        <>
          <path
            data-real-track="true"
            data-role="draw"
            d={route.d}
            stroke="var(--color-success)"
            strokeWidth={route.glowWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={route.glowOpacity}
            vectorEffect="non-scaling-stroke"
          />
          <path
            data-real-track="true"
            data-role="draw"
            d={route.d}
            stroke="var(--color-success)"
            strokeWidth={route.lineWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
      {route ? (
        <circle
          data-real-track={route.d ? undefined : 'single-point'}
          cx={route.start.x}
          cy={route.start.y}
          r={route.startRadius}
          fill="var(--color-surface)"
          stroke="var(--color-success)"
          strokeWidth={route.startStrokeWidth}
        />
      ) : null}
      {route?.d ? <circle cx={route.end.x} cy={route.end.y} r={route.endRadius} fill="var(--color-success)" /> : null}
    </svg>
  )
}

function MountainTexturePreview() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 280 498"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, opacity: 0.34 }}
      aria-hidden="true"
    >
      <path d="M-20 210 L42 152 L80 178 L130 112 L184 190 L228 130 L300 214" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity=".42" />
      <path d="M-30 246 L54 180 L98 210 L146 150 L196 226 L245 168 L310 260" stroke="var(--color-on-surface)" strokeWidth="0.65" fill="none" opacity=".28" />
      <path d="M-20 284 L62 220 L112 248 L160 196 L212 276 L258 228 L312 312" stroke="var(--color-on-surface)" strokeWidth="0.55" fill="none" opacity=".18" />
      <path d="M-28 336 L52 270 L106 306 L164 254 L222 342 L276 288 L318 366" stroke="var(--color-on-surface)" strokeWidth="0.45" fill="none" opacity=".12" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
        <path
          key={index}
          d={`M${14 + index * 30} 330 C ${36 + index * 28} 262 ${56 + index * 25} 184 ${82 + index * 22} 118`}
          stroke="var(--color-on-surface)"
          strokeWidth="0.45"
          fill="none"
          opacity=".14"
        />
      ))}
    </svg>
  )
}

function PreviewSourcePill({ source }: { source: ShareActivityData['source'] }) {
  const gps = source === 'gps'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: gps ? 22 : 21,
        padding: gps ? '0 7px' : '0 8px',
        borderRadius: 'var(--radius-xs)',
        border: gps ? '1px solid var(--color-success)' : '1px solid var(--color-outline)',
        background: gps
          ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)'
          : 'color-mix(in srgb, var(--color-surface-variant) 72%, transparent)',
        color: gps ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
        whiteSpace: 'nowrap',
        boxShadow: gps ? '0 0 14px color-mix(in srgb, var(--color-primary) 22%, transparent)' : 'none',
      }}
    >
      {gps ? (
        <>
          <MountainIcon size={12} color="currentColor" />
          <span
            aria-hidden="true"
            style={{
              width: 1,
              height: 12,
              background: 'color-mix(in srgb, var(--color-success) 58%, transparent)',
              marginLeft: 5,
              marginRight: 5,
              flex: '0 0 auto',
            }}
          />
          <svg width="11" height="11" viewBox="0 0 24 24" style={{ display: 'block', flex: '0 0 auto' }} aria-hidden="true">
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span data-lit="text" style={{ marginLeft: 5, fontSize: 8.5, lineHeight: 1, fontWeight: 800, letterSpacing: '0.04em' }}>
            GPS VERIFIED
          </span>
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" style={{ display: 'block', flex: '0 0 auto', marginRight: 5 }} aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M14 3v5h5M8.5 14l2 2 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span data-lit="text" style={{ fontSize: 8.5, lineHeight: 1, fontWeight: 800, letterSpacing: '0.06em' }}>
            UPLOADED
          </span>
        </>
      )}
    </span>
  )
}

function BrandFooter({ data }: { data: ShareActivityData }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        transform: 'scale(0.84)',
        transformOrigin: 'center',
      }}
    >
      <MountainIcon size={22} color="var(--color-success)" />
      <span
        data-lit="text"
        style={{
          color: 'var(--color-on-surface)',
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        Peak Trekker
      </span>
      <PreviewSourcePill source={data.source} />
    </div>
  )
}

function PreviewWatermarkOverlay() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: -48,
        right: -48,
        top: '20%',
        height: '60%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
        transform: 'rotate(-30deg) scale(1.25)',
        transformOrigin: 'center',
        pointerEvents: 'none',
        zIndex: 8,
      }}
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          style={{
            color: 'rgba(255,255,255,0.2)',
            fontSize: 17,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          Peak Trekker 预览版 · Peak Trekker 预览版
        </div>
      ))}
    </div>
  )
}

function LockBadge() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 7,
        right: 7,
        width: 22,
        height: 22,
        borderRadius: 'var(--radius-xs)',
        background: 'color-mix(in srgb, var(--color-surface) 78%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-on-surface) 14%, transparent)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 3,
      }}
    >
      <LockIcon />
    </span>
  )
}

function UnlockHintBar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="share-unlock-hint"
      style={{
        margin: 'var(--space-3) var(--space-5) 0',
        minHeight: 46,
        borderRadius: 'var(--radius-md)',
        border: '1px solid color-mix(in srgb, var(--color-success) 24%, transparent)',
        background: 'color-mix(in srgb, var(--color-success) 7%, transparent)',
        color: 'var(--color-success)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: '0 var(--space-3)',
        cursor: 'pointer',
        width: 'calc(100% - var(--space-10))',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <LockIcon />
        <span
          style={{
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          解锁高级模板，导出无水印版本
        </span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function BaseHeroPreview({
  data,
  toggles,
  template,
  photoDataUrl,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  template: BasicTemplateId
  photoDataUrl: string | null
}) {
  const isData = template === 'base-data'
  const showAltitude = hasShareAltitude(data)
  const statItems = [
    isVisible('distance', toggles)
      ? { key: 'distance', label: 'DISTANCE', value: formatDistance(data.distance), unit: 'km' }
      : null,
    isVisible('duration', toggles)
      ? { key: 'duration', label: 'TIME', value: formatDuration(data.duration), unit: '' }
      : null,
    isVisible('elevationGain', toggles)
      ? { key: 'elevationGain', label: 'GAIN', value: formatNumber(data.elevationGain), unit: 'm' }
      : null,
    isVisible('pace', toggles) && data.pace ? { key: 'pace', label: '配速', value: data.pace, unit: '' } : null,
  ].filter(Boolean).slice(0, 3) as Array<{ key: string; label: string; value: string; unit: string }>

  const mountainLine = [
    isVisible('mountainName', toggles) ? data.mountainName : null,
    isVisible('location', toggles) ? data.location : null,
    isVisible('date', toggles) ? data.date : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      data-testid="share-hero-preview"
      style={heroPreviewFrameStyle}
    >
      {photoDataUrl ? (
        <>
          <PreviewPhotoBackground photoDataUrl={photoDataUrl} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 24%, transparent), color-mix(in srgb, var(--color-surface) 86%, transparent) 82%, var(--color-surface))',
            }}
          />
          {isData ? <MountainTexturePreview /> : null}
        </>
      ) : isData ? (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--color-success) 14%, transparent), transparent 30%), linear-gradient(180deg, var(--color-surface-variant), var(--color-surface))',
            }}
          />
          <MountainTexturePreview />
        </>
      ) : !isData ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 58% 24%, color-mix(in srgb, var(--color-success) 10%, transparent), transparent 22%), var(--color-surface)',
          }}
        />
      ) : null}
      {isData ? null : <TrailPath trackPreview={data.trackPreview} />}
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          bottom: 0,
          height: '47%',
          background:
            'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--color-surface) 84%, transparent) 20%, var(--color-surface) 86%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: isData ? 118 : 104,
          color: 'var(--color-on-surface)',
          textAlign: isData ? 'center' : 'left',
        }}
      >
        {isData && showAltitude ? (
          <div
            data-lit="text"
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 13,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: '0.08em',
              marginBottom: 8,
            }}
          >
            最高海拔
          </div>
        ) : !isData && mountainLine ? (
          <div
            data-lit="text"
            style={{
              fontSize: 15,
              lineHeight: 1.25,
              fontWeight: 800,
              letterSpacing: '0',
              marginBottom: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountainLine}
          </div>
        ) : null}
        {showAltitude ? <div
          style={{
            color: 'var(--color-success)',
            fontFamily: 'var(--font-mono)',
            fontSize: isData ? 68 : 54,
            lineHeight: 0.95,
            fontWeight: 700,
            letterSpacing: '0',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer">
            {formatShareAltitude(data)}
          </span>
          <span style={{ fontSize: isData ? 22 : 19, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
        </div> : null}
        {isData && mountainLine ? (
          <div
            data-lit="text"
            style={{
              marginTop: 16,
              color: 'var(--color-on-surface)',
              fontSize: 14,
              lineHeight: 1.3,
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountainLine}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: isData ? 76 : 52,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, statItems.length)}, minmax(0, 1fr))`,
          alignItems: 'stretch',
          color: 'var(--color-on-surface)',
        }}
      >
        {statItems.map((item, index) => (
          <div
            key={item.key}
            data-stat-key={item.key}
            style={{
              textAlign: 'center',
              paddingInline: item.key === 'date' ? 0 : 4,
              borderLeft: index === 0 ? 'none' : '1px solid color-mix(in srgb, var(--color-on-surface-variant) 54%, transparent)',
              minWidth: 0,
            }}
          >
            <div
              data-lit="text"
              style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: 9,
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 700,
                color: 'var(--color-on-surface)',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.key === 'distance' && getMotionNumberValue(data.distance) !== undefined ? (
                <span data-role="num" data-motion-kind="distance" data-val={data.distance} data-fmt="decimal-1">{item.value}</span>
              ) : item.key === 'elevationGain' && getMotionNumberValue(data.elevationGain) !== undefined ? (
                <span data-role="num" data-motion-kind="elevationGain" data-val={data.elevationGain} data-fmt="integer">{item.value}</span>
              ) : (
                <span data-lit="text">{item.value}</span>
              )}
              {item.unit ? (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--color-on-surface-variant)', marginLeft: 2 }}>
                  {item.unit}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
        <BrandFooter data={data} />
      </div>
    </div>
  )
}

function PreviewPhotoBackground({
  photoDataUrl,
  grayscale = false,
  children,
}: {
  photoDataUrl: string | null
  grayscale?: boolean
  children?: ReactNode
}) {
  return (
    <>
      {photoDataUrl ? (
        <img
          src={photoDataUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: grayscale ? 'grayscale(1)' : 'none',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 62% 18%, color-mix(in srgb, var(--color-success) 14%, transparent), transparent 26%), linear-gradient(180deg, var(--color-surface-variant), var(--color-surface))',
          }}
        />
      )}
      {children}
    </>
  )
}

function MiniRidges() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 280 498" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, opacity: 0.26 }} aria-hidden="true">
      <path d="M-20 214 L38 168 L76 190 L128 134 L182 204 L224 154 L300 226" stroke="var(--color-on-surface)" strokeWidth="0.8" fill="none" opacity=".5" />
      <path d="M-24 268 L52 208 L100 232 L154 178 L208 260 L260 212 L310 302" stroke="var(--color-on-surface)" strokeWidth="0.7" fill="none" opacity=".34" />
      <path d="M-26 326 L44 270 L108 306 L168 250 L224 344 L276 286 L318 376" stroke="var(--color-on-surface)" strokeWidth="0.55" fill="none" opacity=".24" />
    </svg>
  )
}

function PremiumHeroPreview({
  data,
  toggles,
  template,
  photoDataUrl,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  template: AdvancedTemplateId
  photoDataUrl: string | null
}) {
  const statItems = [
    { key: 'distance', label: 'DISTANCE', value: formatDistance(data.distance), unit: 'km' },
    isVisible('duration', toggles) ? { key: 'duration', label: 'TIME', value: formatDuration(data.duration), unit: '' } : null,
    isVisible('elevationGain', toggles) ? { key: 'elevationGain', label: 'GAIN', value: formatNumber(data.elevationGain), unit: 'm' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; unit: string }>
  const mountainLine = [
    isVisible('mountainName', toggles) ? data.mountainName : null,
    isVisible('location', toggles) ? data.location : null,
    isVisible('date', toggles) ? data.date : null,
  ].filter(Boolean).join(' · ')
  const verticalStory = template === 'premium-vertical-story'
  const monoFilm = template === 'premium-mono-film'
  const certificate = template === 'premium-summit-certificate'
  const dataScatter = template === 'premium-data-scatter'
  const overlay = template === 'premium-photo-overlay'
  const bold = template === 'premium-bold-number'
  const profile = template === 'premium-altitude-profile'
  const showAltitude = hasShareAltitude(data)

  if (monoFilm) {
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
        style={heroPreviewFrameStyle}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', overflow: 'hidden' }}>
          <PreviewPhotoBackground photoDataUrl={photoDataUrl} grayscale>{photoDataUrl ? null : <MiniRidges />}</PreviewPhotoBackground>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', background: 'linear-gradient(180deg, rgba(15,17,19,0) 0%, rgba(15,17,19,.56) 58%, rgba(15,17,19,1) 100%)' }} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '56%', bottom: 0, background: 'linear-gradient(180deg, var(--color-surface), #0a0c0e)' }} />

        <div style={{ position: 'absolute', left: 18, right: 18, top: '38%' }}>
          {mountainLine ? (
            <div data-lit="text" style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.2, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {mountainLine}
            </div>
          ) : null}
          {showAltitude ? <>
          <div data-lit="text" style={{ color: 'var(--color-on-surface-variant)', fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', marginTop: 16 }}>最高海拔</div>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 10, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer" style={{ fontSize: 62, lineHeight: 0.9, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
            <span style={{ fontSize: 18, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div>
          </> : null}
        </div>

        <PreviewStats stats={statItems} bottom={62} compact />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  if (verticalStory) {
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
        style={heroPreviewFrameStyle}
      >
        <PreviewPhotoBackground photoDataUrl={photoDataUrl} grayscale>
          {!photoDataUrl ? <MiniRidges /> : null}
        </PreviewPhotoBackground>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 10%, transparent), color-mix(in srgb, var(--color-surface) 16%, transparent) 62%, transparent)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%', background: 'linear-gradient(180deg, rgba(10,12,14,0) 0%, rgba(10,12,14,0.42) 46%, rgba(10,12,14,0.84) 100%)' }} />
        <div style={{ position: 'absolute', left: 16, right: 16, top: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div data-lit="text" style={{ color: 'var(--color-on-surface)', fontSize: 10, fontWeight: 800 }}>Peak Trekker</div>
          {data.date ? <div data-lit="text" style={{ color: 'var(--color-on-surface-variant)', fontSize: 10, fontWeight: 800 }}>{data.date}</div> : null}
        </div>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 122, textAlign: 'left' }}>
          {mountainLine ? <div data-lit="text" style={{ color: 'var(--color-on-surface)', fontSize: 13, lineHeight: 1.25, fontWeight: 800 }}>{mountainLine}</div> : null}
          {showAltitude ? <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 8, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer" style={{ fontSize: 44, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
            <span style={{ fontSize: 16, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div> : null}
        </div>
        <StoryPreviewDataBar data={data} toggles={toggles} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  if (overlay) {
    const overlayName = isVisible('mountainName', toggles) ? data.mountainName : ''
    const overlayLocation = isVisible('location', toggles) ? data.location : ''
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
        style={heroPreviewFrameStyle}
      >
        <PreviewPhotoBackground photoDataUrl={photoDataUrl}>{photoDataUrl ? null : <TopoBackground />}</PreviewPhotoBackground>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--color-surface), color-mix(in srgb, var(--color-surface) 80%, transparent) 44%, transparent)' }} />
        <div style={{ position: 'absolute', left: 18, top: 74, width: 104 }}>
          {overlayName ? <div data-lit="text" style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.18, fontWeight: 800 }}>{overlayName}</div> : null}
          {overlayLocation ? <div data-lit="text" style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, lineHeight: 1.1, fontWeight: 800, marginTop: 9 }}>{overlayLocation}</div> : null}
          {showAltitude ? <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 20, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer" style={{ fontSize: 42, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
            <span style={{ fontSize: 14, marginLeft: 2, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 24 }}>
            <PremiumMetric label="总距离" value={formatDistance(data.distance)} unit="km" />
            {isVisible('duration', toggles) ? <PremiumMetric label="时长" value={formatDuration(data.duration)} /> : null}
            {isVisible('elevationGain', toggles) ? <PremiumMetric label="爬升" value={formatNumber(data.elevationGain)} unit="m" /> : null}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  if (bold) {
    return (
      <div
        data-testid="share-hero-preview"
        data-template={template}
        style={heroPreviewFrameStyle}
      >
        <PreviewPhotoBackground photoDataUrl={photoDataUrl}>{photoDataUrl ? null : <TopoBackground />}</PreviewPhotoBackground>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 12%, transparent), color-mix(in srgb, var(--color-surface) 86%, transparent) 78%, var(--color-surface))' }} />
        {showAltitude ? <>
        <div data-lit="text" style={{ position: 'absolute', left: 16, top: 54, color: 'rgba(255,255,255,0.32)', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' }}>最高海拔</div>
        <div style={{ position: 'absolute', left: 14, right: 14, top: 78, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-mono)', fontSize: 66, lineHeight: 0.92, fontWeight: 800 }}>
          <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer">
            {formatShareAltitude(data)}
          </span>
          <span style={{ fontSize: 22, marginLeft: 3 }}>m</span>
        </div>
        </> : null}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 104, textAlign: 'left' }}>
          {mountainLine ? <div data-lit="text" style={{ color: 'var(--color-on-surface)', fontSize: 14, lineHeight: 1.25, fontWeight: 800 }}>{mountainLine}</div> : null}
          {showAltitude ? <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: 8, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer" style={{ fontSize: 42, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
            <span style={{ fontSize: 16, marginLeft: 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div> : null}
        </div>
        <PreviewStats stats={statItems.slice(0, 2)} bottom={52} compact />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
          <BrandFooter data={data} />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="share-hero-preview"
      data-template={template}
      style={heroPreviewFrameStyle}
    >
      {certificate ? (
        <>
          {photoDataUrl ? (
            <>
              <PreviewPhotoBackground photoDataUrl={photoDataUrl} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 36%, transparent), color-mix(in srgb, var(--color-surface) 68%, transparent) 100%)' }} />
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, var(--color-surface-variant), var(--color-surface))' }} />
          )}
          <MiniRidges />
          <svg width="100%" height="56%" viewBox="0 0 280 278" style={{ position: 'absolute', insetInline: 0, top: 22 }} aria-hidden="true">
            <path d="M26 210 H254M26 160 H254M26 110 H254" stroke="var(--color-on-surface)" strokeWidth=".6" strokeDasharray="3 5" opacity=".18" />
            <path d="M26 222 C 58 190 86 208 116 162 S 164 110 198 82 S 228 58 254 38 L254 232 L26 232 Z" fill="var(--color-success)" opacity=".13" />
            <path data-role="draw" d="M26 222 C 58 190 86 208 116 162 S 164 110 198 82 S 228 58 254 38" stroke="var(--color-success)" strokeWidth="2" fill="none" />
          </svg>
        </>
      ) : dataScatter ? (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '42%', background: 'linear-gradient(160deg, var(--color-surface-variant), var(--color-surface))' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '60%', overflow: 'hidden' }}>
            <PreviewPhotoBackground photoDataUrl={photoDataUrl}>{photoDataUrl ? null : <TopoBackground />}</PreviewPhotoBackground>
          </div>
        </>
      ) : (
        <PreviewPhotoBackground photoDataUrl={photoDataUrl} grayscale={verticalStory}>
          {!photoDataUrl ? <TopoBackground /> : null}
        </PreviewPhotoBackground>
      )}

      {!certificate && !dataScatter ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: overlay
              ? 'linear-gradient(90deg, color-mix(in srgb, var(--color-surface) 88%, transparent), transparent 76%)'
              : 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--color-surface) 88%, transparent) 76%, var(--color-surface))',
          }}
        />
      ) : null}

      {template === 'premium-photo-composite' ? <TrailPath trackPreview={data.trackPreview} /> : null}

      {bold && showAltitude ? (
        <div style={{ position: 'absolute', left: 14, right: 14, top: 46, color: 'color-mix(in srgb, var(--color-on-surface) 26%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 66, lineHeight: 0.92, fontWeight: 800 }}>
          <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer">
            {formatShareAltitude(data)}
          </span>
          <span style={{ fontSize: 22, marginLeft: 3 }}>m</span>
        </div>
      ) : null}

      {profile ? (
        <>
          <div style={{ position: 'absolute', left: 19, top: 39 }}><ProfileMetric label="总距离" value={formatDistance(data.distance)} unit="km" accent /></div>
          <div style={{ position: 'absolute', right: 19, top: 39, textAlign: 'right' }}><ProfileMetric label="爬升" value={formatNumber(data.elevationGain)} unit="m" accent align="right" /></div>
          <div style={{ position: 'absolute', left: 19, bottom: 111, width: 42, height: 42, borderRadius: 999, border: '1px solid color-mix(in srgb, var(--color-on-surface) 28%, transparent)', display: 'grid', placeItems: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 40 40"><path data-role="draw" d="M5 30 Q 13 18 20 22 T 34 7" stroke="var(--color-on-surface)" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          </div>
          <div style={{ position: 'absolute', right: 19, bottom: 117, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            {isVisible('duration', toggles) ? <ProfileMetric label="时长" value={formatDuration(data.duration)} align="right" /> : null}
            {isVisible('date', toggles) && data.date ? <ProfileMetric label="日期" value={data.date} align="right" /> : null}
          </div>
        </>
      ) : null}

      {dataScatter ? (
        <div style={{ position: 'absolute', left: 14, top: 66, width: 92 }}>
          <div data-lit="text" style={{ color: 'var(--color-on-surface)', fontSize: 11, lineHeight: 1.2, fontWeight: 800 }}>{mountainLine}</div>
          {showAltitude ? <>
          <div data-lit="text" style={{ marginTop: 16, color: 'var(--color-on-surface-variant)', fontSize: 8, fontWeight: 800, letterSpacing: '0.08em' }}>最高海拔</div>
          <div style={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)', fontSize: 30, lineHeight: 1, fontWeight: 800 }}><span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer">{formatShareAltitude(data)}</span><span style={{ fontSize: 10, marginLeft: 2 }}>m</span></div>
          <div style={{ width: 22, height: 2, borderRadius: 999, background: 'var(--color-success)', marginTop: 14, marginBottom: 10 }} />
          </> : null}
          {statItems.map((item) => <TinyMetric key={item.key} label={item.label} value={item.value} unit={item.unit} />)}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: profile ? 64 : overlay ? 18 : 16,
            right: profile ? 64 : overlay ? 118 : 16,
            bottom: certificate ? 112 : verticalStory ? 96 : monoFilm ? 116 : profile ? 109 : 104,
            textAlign: certificate || verticalStory || profile ? 'center' : 'left',
          }}
        >
          {mountainLine ? (
            <div data-lit="text" style={{ color: 'var(--color-on-surface)', fontSize: profile ? 7.8 : 14, lineHeight: 1.25, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {mountainLine}
            </div>
          ) : null}
          {showAltitude ? <div style={{ display: 'inline-flex', alignItems: 'baseline', marginTop: profile ? 7 : 8, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            <span data-role="num" data-motion-kind="altitude" data-val={formatShareAltitude(data)} data-fmt="integer" style={{ fontSize: certificate ? 44 : verticalStory ? 44 : profile ? 24 : 56, lineHeight: 0.92, fontWeight: 800 }}>{formatShareAltitude(data)}</span>
            <span style={{ fontSize: profile ? 8 : 18, marginLeft: profile ? 2 : 3, fontFamily: 'var(--font-sans)', fontWeight: 800 }}>m</span>
          </div> : null}
        </div>
      )}

      {!dataScatter && !profile && !verticalStory ? (
        <PreviewStats stats={statItems} bottom={monoFilm ? 62 : certificate ? 74 : 52} compact={monoFilm || certificate} />
      ) : null}
      {verticalStory ? <PreviewStats stats={statItems} bottom={58} compact pill /> : null}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18 }}>
        <BrandFooter data={data} />
      </div>
    </div>
  )
}

function HeroPreview({
  data,
  toggles,
  template,
  photoDataUrl,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  template: TemplateId
  photoDataUrl: string | null
}) {
  if (template === 'base-classic' || template === 'base-data') {
    return <BaseHeroPreview data={data} toggles={toggles} template={template} photoDataUrl={photoDataUrl} />
  }
  return <PremiumHeroPreview data={data} toggles={toggles} template={template} photoDataUrl={photoDataUrl} />
}

function StoryPreviewDataBar({
  data,
  toggles,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
}) {
  const items = [
    hasShareAltitude(data) ? { key: 'altitude', icon: 'pin', value: formatShareAltitude(data), unit: 'm' } : null,
    { key: 'distance', icon: 'mountain', value: formatDistance(data.distance), unit: 'km' },
    isVisible('duration', toggles) ? { key: 'duration', icon: 'clock', value: formatDuration(data.duration), unit: '' } : null,
    isVisible('elevationGain', toggles) ? { key: 'gain', icon: 'arrow', value: formatNumber(data.elevationGain), unit: 'm' } : null,
  ].filter(Boolean) as Array<{ key: string; icon: 'pin' | 'mountain' | 'clock' | 'arrow'; value: string; unit: string }>

  return (
    <div
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 58,
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.key}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-on-surface)',
            borderLeft: index === 0 ? 'none' : '1px solid color-mix(in srgb, var(--color-on-surface-variant) 42%, transparent)',
            paddingInline: 3,
          }}
        >
          <StoryPreviewIcon kind={item.icon} />
          <span style={{ marginLeft: 3, color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {item.key === 'distance' && Number.isFinite(Number.parseFloat(item.value)) ? (
              <span data-role="num" data-motion-kind="distance" data-val={Number.parseFloat(item.value)} data-fmt="decimal-1">{item.value}</span>
            ) : item.key === 'gain' && Number.isFinite(Number.parseFloat(item.value)) ? (
              <span data-role="num" data-motion-kind="elevationGain" data-val={Number.parseFloat(item.value)} data-fmt="integer">{item.value}</span>
            ) : item.key === 'altitude' && Number.isFinite(Number.parseFloat(item.value)) ? (
              <span data-role="num" data-motion-kind="altitude" data-val={Number.parseFloat(item.value)} data-fmt="integer">{item.value}</span>
            ) : (
              <span data-lit="text">{item.value}</span>
            )}
          </span>
          {item.unit ? <span style={{ marginLeft: 1, color: 'var(--color-on-surface-variant)', fontSize: 6.5, fontWeight: 800 }}>{item.unit}</span> : null}
        </div>
      ))}
    </div>
  )
}

function StoryPreviewIcon({ kind }: { kind: 'pin' | 'mountain' | 'clock' | 'arrow' }) {
  if (kind === 'mountain') {
    return <MountainIcon size={10} color="var(--color-on-surface)" />
  }
  if (kind === 'clock') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'arrow') {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M6 18L18 6M10 6h8v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 21s7-5.2 7-12a7 7 0 0 0-14 0c0 6.8 7 12 7 12z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="9" r="2.2" fill="currentColor" />
    </svg>
  )
}

function PremiumMetric({
  label,
  value,
  unit,
  accent = false,
  align = 'left',
}: {
  label: string
  value: string
  unit?: string
  accent?: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div style={{ textAlign: align }}>
      <div data-lit="text" style={{ color: 'var(--color-on-surface-variant)', fontSize: 8, lineHeight: 1, fontWeight: 800, letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ marginTop: 4, color: accent ? 'var(--color-success)' : 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 17, lineHeight: 1, fontWeight: 800 }}>
        <span data-lit="text">{value}</span>
        {unit ? <span style={{ fontSize: 8, marginLeft: 2, color: 'var(--color-on-surface-variant)' }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function ProfileMetric({
  label,
  value,
  unit,
  accent = false,
  align = 'left',
}: {
  label: string
  value: string
  unit?: string
  accent?: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div style={{ textAlign: align }}>
      <div data-lit="text" style={{ color: 'var(--color-on-surface-variant)', fontSize: 5.5, lineHeight: 1, fontWeight: 800, letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 2, color: accent ? 'var(--color-success)' : 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1, fontWeight: 800 }}>
        <span data-lit="text">{value}</span>
        {unit ? <span style={{ fontSize: 5.5, marginLeft: 1, color: 'var(--color-on-surface-variant)' }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function TinyMetric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div data-lit="text" style={{ color: 'var(--color-on-surface-variant)', fontSize: 7, fontWeight: 800, letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, marginTop: 2 }}>
        <span data-lit="text">{value}</span>
        {unit ? <span style={{ fontSize: 6, color: 'var(--color-on-surface-variant)', marginLeft: 1 }}>{unit}</span> : null}
      </div>
    </div>
  )
}

function PreviewStats({
  stats,
  bottom,
  compact = false,
  pill = false,
}: {
  stats: Array<{ key: string; label: string; value: string; unit: string }>
  bottom: number
  compact?: boolean
  pill?: boolean
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: pill ? 16 : 16,
        right: pill ? 16 : 16,
        bottom,
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(1, stats.length)}, minmax(0, 1fr))`,
        alignItems: 'stretch',
        padding: pill ? '7px 8px' : 0,
        borderRadius: pill ? 'var(--radius-pill)' : 0,
        background: pill ? 'color-mix(in srgb, var(--color-surface) 72%, transparent)' : 'transparent',
      }}
    >
      {stats.map((item, index) => (
        <div
          key={item.key}
          style={{
            textAlign: 'center',
            paddingInline: 3,
            borderLeft: index === 0 ? 'none' : '1px solid color-mix(in srgb, var(--color-on-surface-variant) 46%, transparent)',
            minWidth: 0,
          }}
        >
          <div data-lit="text" style={{ color: 'var(--color-on-surface-variant)', fontSize: compact ? 7.5 : 9, lineHeight: 1, fontWeight: 800, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            {item.label}
          </div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: compact ? 13 : 18, lineHeight: 1, fontWeight: 800, color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
            {item.key === 'distance' && Number.isFinite(Number.parseFloat(item.value)) ? (
              <span data-role="num" data-motion-kind="distance" data-val={Number.parseFloat(item.value)} data-fmt="decimal-1">{item.value}</span>
            ) : (item.key === 'elevationGain' || item.key === 'gain') && Number.isFinite(Number.parseFloat(item.value)) ? (
              <span data-role="num" data-motion-kind="elevationGain" data-val={Number.parseFloat(item.value)} data-fmt="integer">{item.value}</span>
            ) : item.key === 'altitude' && Number.isFinite(Number.parseFloat(item.value)) ? (
              <span data-role="num" data-motion-kind="altitude" data-val={Number.parseFloat(item.value)} data-fmt="integer">{item.value}</span>
            ) : (
              <span data-lit="text">{item.value}</span>
            )}
            {item.unit ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: compact ? 7 : 10, color: 'var(--color-on-surface-variant)', marginLeft: 1 }}>{item.unit}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function TemplatePosterPreview({
  template,
  data,
  photoDataUrl,
  width = 78,
  height = 139,
}: {
  template: TemplateId
  data: ShareTemplateData
  photoDataUrl: string | null
  width?: number
  height?: number
}) {
  const templateElement = getShareTemplateComponent(template)({ data, photoDataUrl })
  const scale = height / POSTER_HEIGHT

  return (
    <div
      aria-hidden="true"
      data-testid="share-template-thumb-preview"
      style={{
        width,
        height,
        overflow: 'hidden',
        borderRadius: 10,
        background: '#111416',
        contain: 'layout paint size',
        textAlign: 'left',
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

function TemplateThumb({
  option,
  selected,
  data,
  photoDataUrl,
  onSelect,
  locked,
  limitedFree,
  disabled,
}: {
  option: ShareTemplateOption
  selected: boolean
  data: ShareTemplateData
  photoDataUrl: string | null
  onSelect: (template: TemplateId) => void
  locked: boolean
  limitedFree: boolean
  disabled: boolean
}) {
  const template = option.template.id
  return (
    <button
      type="button"
      className="share-editor-pressable"
      aria-label={`选择第 ${SHARE_TEMPLATE_OPTIONS.findIndex((item) => item.template.id === template) + 1} 款分享模板`}
      aria-pressed={selected}
      data-template-thumb={template}
      disabled={disabled}
      onClick={() => onSelect(template)}
      style={{
        width: 78,
        height: 139,
        borderRadius: 10,
        border: selected ? '1.5px solid #6ee7a1' : '1px solid rgba(255,255,255,.1)',
        background: '#0f1113',
        color: 'var(--color-on-surface)',
        position: 'relative',
        overflow: 'hidden',
        flex: '0 0 auto',
        padding: 0,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled && !selected ? 0.55 : 1,
        scrollSnapAlign: 'start',
        textAlign: 'left',
        boxShadow: selected
          ? '0 0 26px 3px rgba(110,231,161,.5), 0 0 8px 1px rgba(110,231,161,.72), inset 0 0 16px rgba(110,231,161,.3)'
          : 'none',
      }}
    >
      <TemplatePosterPreview template={template} data={data} photoDataUrl={photoDataUrl} />
      {option.tier === 'advanced' && limitedFree ? (
        <span
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            padding: '2px 6px',
            borderRadius: 6,
            background: 'rgba(8,12,10,.72)',
            backdropFilter: 'blur(4px)',
            color: '#f5f7f8',
            fontSize: 8.5,
            lineHeight: 1.2,
            fontWeight: 700,
            zIndex: 3,
          }}
        >
          限免
        </span>
      ) : null}
      {locked ? (
        <>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,17,19,0.42)',
              zIndex: 2,
            }}
          />
          <LockBadge />
        </>
      ) : null}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 10,
          border: '1.5px solid #6ee7a1',
          opacity: selected ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 200ms ease',
          zIndex: 4,
        }}
      />
    </button>
  )
}

function ThumbnailRow({
  selectedTemplate,
  data,
  photoDataUrl,
  onSelectTemplate,
  paywallEnabled,
  premiumUnlocked,
  disabled,
}: {
  selectedTemplate: TemplateId
  data: ShareActivityData
  photoDataUrl: string | null
  onSelectTemplate: (template: TemplateId) => void
  paywallEnabled: boolean
  premiumUnlocked: boolean
  disabled: boolean
}) {
  const advancedLocked = paywallEnabled && !premiumUnlocked
  const selectedIndex = Math.max(0, SHARE_TEMPLATE_OPTIONS.findIndex((option) => option.template.id === selectedTemplate))
  const templateData = toShareTemplateData(data, initialFieldToggles)
  const progressWidth = `${((selectedIndex + 1) / SHARE_TEMPLATE_OPTIONS.length) * 100}%`

  return (
    <div data-stage="templateStrip" data-export-dim="true" data-testid="share-template-strip">
      <div
        style={{
          padding: '4px 16px 0',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: '#f5f7f8', fontSize: 14, fontWeight: 700 }}>模板</span>
          <span style={{ color: '#6f7880', fontSize: 11 }}>共 10 款</span>
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          <span style={{ color: '#6ee7a1' }}>{String(selectedIndex + 1).padStart(2, '0')}</span>
          <span style={{ color: '#6f7880' }}> / {SHARE_TEMPLATE_OPTIONS.length}</span>
        </span>
      </div>
      <div
        className="share-editor-scrollbar"
        data-testid="share-thumbnail-row"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '10px 16px 4px',
          scrollSnapType: 'x proximity',
          scrollPaddingInline: 16,
        }}
      >
        {SHARE_TEMPLATE_OPTIONS.map((option) => (
          <TemplateThumb
            key={option.template.id}
            option={option}
            selected={selectedTemplate === option.template.id}
            data={templateData}
            photoDataUrl={photoDataUrl}
            onSelect={onSelectTemplate}
            locked={option.tier === 'advanced' && advancedLocked}
            limitedFree={option.tier === 'advanced' && !paywallEnabled}
            disabled={disabled}
          />
        ))}
      </div>
      <div
        style={{
          margin: '8px 16px 0',
          height: 2,
          borderRadius: 2,
          background: 'rgba(255,255,255,.08)',
          overflow: 'hidden',
        }}
      >
        <div
          data-testid="share-template-progress"
          style={{
            width: progressWidth,
            height: 2,
            borderRadius: 2,
            background: '#6ee7a1',
          }}
        />
      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l1 12.5A2 2 0 0 0 9.5 21h5a2 2 0 0 0 2-1.5L17.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ControlRow({
  onPickPhoto,
  onRemovePhoto,
  onExportTransparent,
  transparentExporting,
  hasPhoto,
  disabled,
}: {
  onPickPhoto: () => void
  onRemovePhoto: () => void
  onExportTransparent: () => void
  transparentExporting: boolean
  hasPhoto: boolean
  disabled: boolean
}) {
  return (
    <div
      data-stage="toolsRow"
      data-export-dim="true"
      data-testid="share-control-row"
      style={{
        display: 'flex',
        gap: 8,
        padding: '16px 16px 0',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        className="share-editor-pressable"
        onClick={onPickPhoto}
        disabled={disabled}
        style={{
          height: 44,
          borderRadius: 12,
          border: '1px solid #2f353b',
          background: '#23272c',
          color: '#f5f7f8',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 14px',
          flexShrink: 0,
          cursor: disabled ? 'wait' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        <CameraIcon size={18} />
        更换照片
      </button>
      <IconButton label="移除照片" onClick={onRemovePhoto} disabled={disabled || !hasPhoto}>
        <TrashIcon />
      </IconButton>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        className="share-editor-pressable"
        data-testid="share-transparent-export-button"
        onClick={onExportTransparent}
        disabled={disabled || transparentExporting}
        style={{
          height: 44,
          borderRadius: 12,
          border: 'none',
          background: 'transparent',
          color: '#6ee7a1',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 4px',
          flexShrink: 0,
          cursor: disabled || transparentExporting ? 'wait' : 'pointer',
          fontSize: 13,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          opacity: disabled || transparentExporting ? 0.72 : 1,
        }}
      >
        <DownloadIcon />
        {transparentExporting ? '生成中' : '导出透明水印'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function FieldChip({
  field,
  data,
  on,
  onToggle,
  disabled,
}: {
  field: FieldConfig
  on: boolean
  onToggle: () => void
  data: ShareActivityData
  disabled: boolean
}) {
  const missing = isFieldMissing(field.key, data)
  const value = missing ? '未记录' : formatFieldValue(field.key, data)
  const unavailable = missing || disabled

  return (
    <button
      type="button"
      className="share-editor-pressable"
      data-field-key={field.key}
      aria-pressed={on}
      disabled={unavailable}
      onClick={unavailable ? undefined : onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        height: 44,
        borderRadius: 10,
        border: on && !missing ? '1px solid rgba(110,231,161,.58)' : '1px solid rgba(255,255,255,.08)',
        background: on && !missing ? 'rgba(110,231,161,.1)' : 'rgba(255,255,255,.035)',
        opacity: missing ? 0.45 : disabled ? 0.62 : 1,
        pointerEvents: unavailable ? 'none' : 'auto',
        padding: '0 12px',
        cursor: missing ? 'not-allowed' : disabled ? 'wait' : 'pointer',
      }}
    >
      <span
        style={{
          color: on && !missing ? '#f5f7f8' : '#8d959b',
          fontSize: 13,
          lineHeight: 1,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {field.label}
      </span>
      <span
        style={{
          color: missing ? '#8d959b' : on ? '#6ee7a1' : '#8d959b',
          fontFamily: field.key === 'mountainName' || field.key === 'location' ? 'var(--font-sans)' : 'var(--font-mono)',
          fontSize: 11.5,
          lineHeight: 1,
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </button>
  )
}

function FieldSelector({
  data,
  toggles,
  onToggle,
  disabled,
}: {
  data: ShareActivityData
  toggles: Record<ShareFieldKey, boolean>
  onToggle: (field: ShareFieldKey) => void
  disabled: boolean
}) {
  const selectableFields = FIELD_CONFIGS.filter((field) => !field.locked)

  return (
    <section data-stage="fieldPanel" data-export-dim="true" data-testid="share-field-selector" style={{ padding: '20px 16px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: '#f5f7f8', fontSize: 15, fontWeight: 700 }}>展示字段</span>
        <span style={{ color: '#6f7880', fontSize: 11 }}>点选切换</span>
      </div>
      <div
        data-testid="share-locked-field-strip"
        style={{
          marginTop: 10,
          minHeight: 40,
          borderRadius: 10,
          background: 'rgba(255,255,255,.035)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
        }}
      >
        <LockIcon />
        <span
          style={{
            minWidth: 0,
            color: '#8d959b',
            fontSize: 12,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          海拔 <span style={{ color: '#f5f7f8', fontFamily: 'var(--font-mono)' }}>{formatDisplayValue('altitude', data)}</span>
          <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
          距离 <span style={{ color: '#f5f7f8', fontFamily: 'var(--font-mono)' }}>{formatDisplayValue('distance', data)}</span>
        </span>
        <span style={{ marginLeft: 'auto', color: '#6f7880', fontSize: 11, whiteSpace: 'nowrap' }}>始终展示</span>
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {selectableFields.map((field) => (
          <FieldChip
            key={field.key}
            field={field}
            data={data}
            on={Boolean(toggles[field.key])}
            onToggle={() => onToggle(field.key)}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  )
}

function ActionBar({
  exportingAction,
  successAction,
  onSave,
  onShare,
}: {
  exportingAction: ExportAction
  successAction: ExportSuccessAction
  onSave: () => void
  onShare: () => void
}) {
  const exporting = Boolean(exportingAction)
  const saveSucceeded = successAction === 'save'
  const shareFallbackSucceeded = successAction === 'share-fallback'
  return (
    <div
      data-stage="bottomActionBar"
      data-testid="share-action-bar"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        padding: '10px 16px calc(18px + env(safe-area-inset-bottom))',
        background: 'rgba(18,20,22,.84)',
        backdropFilter: 'blur(18px)',
        borderTop: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          data-testid="share-save-button"
          className="share-editor-pressable"
          onClick={onSave}
          disabled={exporting}
          style={{
            flex: 1,
            height: 44,
            borderRadius: 12,
            border: '1px solid #2f353b',
            background: '#23272c',
            color: '#f5f7f8',
            fontSize: 14,
            lineHeight: 1,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: exporting ? 'wait' : 'pointer',
            opacity: exporting && exportingAction !== 'save' ? 0.45 : 1,
            minWidth: 0,
          }}
        >
          {saveSucceeded ? '✓' : <DownloadIcon />}
          {saveSucceeded ? '已保存到相册' : exportingAction === 'save' ? '生成中' : '保存'}
        </button>
        <button
          type="button"
          data-testid="share-share-button"
          className="share-editor-pressable"
          onClick={onShare}
          disabled={exporting}
          style={{
            flex: 1.25,
            height: 44,
            borderRadius: 12,
            border: 'none',
            background: '#22c55e',
            color: '#08120d',
            fontSize: 15,
            lineHeight: 1,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            cursor: exporting ? 'wait' : 'pointer',
            opacity: exporting && exportingAction !== 'share' ? 0.45 : 1,
            minWidth: 0,
          }}
        >
          {shareFallbackSucceeded ? '✓ 已保存到相册' : exportingAction === 'share' ? '生成中' : '分享'}
          {shareFallbackSucceeded ? null : <ShareIcon size={16} />}
        </button>
      </div>
    </div>
  )
}

function WatermarkPreviewScreen({
  imageUrl,
  exportingAction,
  successAction,
  exportError,
  rootRef,
  onBack,
  onDismissError,
  onSave,
  onShare,
}: {
  imageUrl: string
  exportingAction: ExportAction
  successAction: ExportSuccessAction
  exportError: string | null
  rootRef: RefObject<HTMLElement | null>
  onBack: () => void
  onDismissError: () => void
  onSave: () => void
  onShare: () => void
}) {
  const exporting = Boolean(exportingAction)
  const saveSucceeded = successAction === 'transparent-save'
  const shareFallbackSucceeded = successAction === 'share-fallback'

  return (
    <main
      ref={rootRef}
      data-testid="share-watermark-preview"
      data-exporting={exporting ? 'true' : 'false'}
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'radial-gradient(120% 80% at 50% 0%, #0e1413 0%, #0a0c0e 55%, #08090b 100%)',
        color: 'var(--color-on-surface)',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'calc(92px + env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        .share-editor-pressable { transition: filter 140ms ease, transform 140ms ease, border-color 180ms ease, background-color 180ms ease, opacity 180ms ease; }
        .share-editor-pressable:active:not(:disabled) { filter: brightness(.94); transform: scale(.985); }
        .share-export-layer {
          position: absolute;
          pointer-events: none;
          opacity: 0;
          visibility: hidden;
        }
        .share-export-sweep-clip {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          overflow: hidden;
          pointer-events: none;
        }
        .share-export-sweep {
          left: -15%;
          right: -15%;
          top: -4%;
          height: 46%;
          background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,.07) 38%, rgba(110,231,161,.13) 52%, rgba(255,255,255,.05) 66%, transparent 100%);
          mix-blend-mode: screen;
        }
        .share-export-rim {
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(110,231,161,.86);
          box-shadow: 0 0 0 1px rgba(110,231,161,.36), 0 0 44px 6px rgba(110,231,161,.56), 0 0 14px 2px rgba(110,231,161,.72), inset 0 0 28px rgba(110,231,161,.36);
        }
        .share-export-ghost {
          position: fixed;
          z-index: 80;
          pointer-events: none;
          border-radius: 14px;
          border: 1px solid rgba(110,231,161,.48);
          background: linear-gradient(180deg, rgba(35,39,44,.86), rgba(18,20,22,.94));
          box-shadow: 0 16px 44px rgba(0,0,0,.4), 0 0 28px rgba(110,231,161,.26);
          opacity: 0;
          visibility: hidden;
        }
        .share-save-toast {
          position: fixed;
          left: 50%;
          bottom: calc(94px + env(safe-area-inset-bottom));
          z-index: 90;
          transform: translateX(-50%) translateY(16px);
          min-height: 38px;
          border-radius: 999px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(110,231,161,.34);
          background: rgba(20,24,25,.92);
          color: #f5f7f8;
          box-shadow: 0 16px 34px rgba(0,0,0,.38);
          backdrop-filter: blur(18px);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          font-size: 13px;
          font-weight: 800;
        }
      `}</style>
      <NavBarTitle title="导出透明水印" onBack={onBack} />
      <section
        data-testid="share-main-poster-preview"
        style={{
          ...heroPreviewShellStyle,
          margin: '14px auto 0',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)',
          backgroundColor: '#101317',
          backgroundImage: `
            linear-gradient(45deg, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 25%, transparent 25%),
            linear-gradient(-45deg, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 75%),
            linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--color-on-surface) 16%, transparent) 75%)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
        }}
      >
        <div data-testid="share-poster-scale-layer" style={heroPreviewScaleStyle}>
          <div
            data-testid="share-poster-inner-card"
            style={heroPreviewInnerCardStyle}
          >
            <img
              src={imageUrl}
              alt="透明水印预览"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
            <div data-testid="share-export-sweep-clip" className="share-export-sweep-clip" aria-hidden="true">
              <div data-testid="share-export-sweep" className="share-export-layer share-export-sweep" />
            </div>
            <div data-testid="share-export-rim" className="share-export-layer share-export-rim" aria-hidden="true" />
          </div>
        </div>
      </section>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px 16px 0',
        }}
      >
        {['PNG', '透明背景', '1080 × 1920'].map((item) => (
          <span
            key={item}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '4px 9px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.04)',
              color: '#8d959b',
            }}
          >
            {item}
          </span>
        ))}
      </div>
      <p
        style={{
          margin: '12px 24px 0',
          textAlign: 'center',
          fontSize: 12,
          color: '#8d959b',
          lineHeight: '18px',
        }}
      >
        导出内容跟随当前模板与展示字段设置，可叠加至任意照片。
      </p>
      {exportError ? (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            margin: '14px 20px 0',
            color: 'var(--color-error)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
          }}
        >
          <span>{exportError}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="关闭透明水印错误提示"
            style={{
              flex: '0 0 auto',
              minHeight: 32,
              border: '1px solid color-mix(in srgb, var(--color-error) 36%, transparent)',
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              color: 'var(--color-error)',
              padding: '0 var(--space-3)',
              fontSize: 'var(--font-label-s-size)',
            }}
          >
            知道了
          </button>
        </div>
      ) : null}

      <div style={{ flex: 1 }} />

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          padding: '10px 16px calc(18px + env(safe-area-inset-bottom))',
          background: 'rgba(18,20,22,.84)',
          backdropFilter: 'blur(18px)',
          borderTop: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--page-max-width)',
            margin: '0 auto',
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            type="button"
            data-testid="share-transparent-share-button"
            className="share-editor-pressable"
            onClick={onShare}
            disabled={exporting}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              border: '1px solid #2f353b',
              background: '#23272c',
              color: '#f5f7f8',
              fontSize: 14,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: exporting ? 'wait' : 'pointer',
              opacity: exporting && exportingAction !== 'share' ? 0.45 : 1,
            }}
          >
            {shareFallbackSucceeded ? null : <ShareIcon size={17} />}
            {shareFallbackSucceeded ? '✓ 已保存到相册' : exportingAction === 'share' ? '分享中' : '分享'}
          </button>
          <button
            type="button"
            data-testid="share-transparent-save-button"
            className="share-editor-pressable"
            onClick={onSave}
            disabled={exporting}
            style={{
              flex: 1.5,
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: '#22c55e',
              color: '#08120d',
              fontSize: 15,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: exporting ? 'wait' : 'pointer',
              opacity: exporting && exportingAction !== 'save' ? 0.45 : 1,
            }}
          >
            {saveSucceeded ? '✓' : <DownloadIcon />}
            {saveSucceeded ? '已保存到相册' : exportingAction === 'save' ? '保存中' : '保存透明水印'}
          </button>
        </div>
      </div>
      <div data-testid="share-export-ghost" className="share-export-ghost" aria-hidden="true" />
      <div data-testid="share-save-toast" className="share-save-toast" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <span>已保存到相册</span>
      </div>
    </main>
  )
}

function NavBarTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
      style={{
        height: 48,
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        background: 'rgba(18,20,22,.7)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}
    >
      <button
        type="button"
        aria-label="返回"
        onClick={onBack}
        style={{
          width: 44,
          height: 44,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-on-surface)',
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          cursor: 'pointer',
          zIndex: 1,
        }}
      >
        <BackIcon size={22} />
      </button>
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          pointerEvents: 'none',
          textAlign: 'center',
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-headline-m-size)',
          lineHeight: 'var(--font-headline-m-line)',
          fontWeight: 700,
        }}
      >
        {title}
      </div>
    </div>
  )
}

export default function ShareClient({
  initialData,
  checkinId,
  initialTemplate = 'base-classic',
  paywallEnabled = false,
  premiumUnlocked = true,
  currentUserId = null,
}: {
  initialData?: ShareActivityData | null
  checkinId?: string
  initialTemplate?: TemplateId
  paywallEnabled?: boolean
  premiumUnlocked?: boolean
  currentUserId?: string | null
}) {
  const router = useRouter()
  const rootRef = useRef<HTMLElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const posterRelightTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const exportTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const exportDelayTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const exportInFlightRef = useRef(false)
  const skipUpdateRelightRef = useRef(true)
  const [motionPending, setMotionPending] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(initialTemplate)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ShareViewMode>('editor')
  const [transparentBlob, setTransparentBlob] = useState<Blob | null>(null)
  const [transparentBlobUrl, setTransparentBlobUrl] = useState<string | null>(null)
  const [fieldToggles, setFieldToggles] = useState<Record<ShareFieldKey, boolean>>(initialFieldToggles)
  const [exportingAction, setExportingAction] = useState<ExportAction>(null)
  const [successAction, setSuccessAction] = useState<ExportSuccessAction>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const activityData = useMemo(() => initialData ?? MOCK_DATA, [initialData])
  const premiumPreviewLocked = paywallEnabled && isAdvancedTemplateId(selectedTemplate) && !premiumUnlocked
  const exportFrozen = Boolean(exportingAction)

  function handleShareBack() {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('from') === 'imprint') {
        router.replace(buildImprintSourceUrl(selectedTemplate))
        return
      }
    }
    if (checkinId) {
      router.replace(`/activity/${checkinId}`)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.replace('/explore')
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      exportInFlightRef.current = false
      exportTimelineRef.current?.kill()
      exportTimelineRef.current = null
      if (exportDelayTimerRef.current !== null) {
        window.clearTimeout(exportDelayTimerRef.current)
        exportDelayTimerRef.current = null
      }
    }
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const shells = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="share-main-poster-preview"]'))
    shells.forEach(syncSharePosterScale)

    if (typeof ResizeObserver === 'undefined' || shells.length === 0) return undefined

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        syncSharePosterScale(entry.target as HTMLElement)
      })
    })
    shells.forEach((shell) => observer.observe(shell))

    return () => observer.disconnect()
  }, [viewMode])

  function playPosterRelight(animate: boolean) {
    const root = rootRef.current
    if (!root) return
    posterRelightTimelineRef.current?.kill()
    posterRelightTimelineRef.current = null
    if (!animate) {
      setPosterMotionTerminal(root)
      return
    }
    preparePosterMotionInitialState(root)
    posterRelightTimelineRef.current = buildPosterRelightTimeline(root)
  }

  function safeSetExportingAction(action: ExportAction) {
    if (mountedRef.current) setExportingAction(action)
  }

  function safeSetSuccessAction(action: ExportSuccessAction) {
    if (mountedRef.current) setSuccessAction(action)
  }

  function safeSetExportError(message: string | null) {
    if (mountedRef.current) setExportError(message)
  }

  function clearExportDelayTimer() {
    if (exportDelayTimerRef.current !== null) {
      window.clearTimeout(exportDelayTimerRef.current)
      exportDelayTimerRef.current = null
    }
  }

  function cleanupExportTimeline() {
    exportTimelineRef.current?.kill()
    exportTimelineRef.current = null
    clearExportDelayTimer()
    const root = rootRef.current
    if (root) resetExportMotion(root)
  }

  function createExportSnapshot(action: ActiveExportAction, transparent: boolean): ExportSnapshot {
    return {
      action,
      template: selectedTemplate,
      fieldToggles: { ...fieldToggles },
      photoDataUrl,
      transparent,
    }
  }

  function startGeneratingMotion(action: ActiveExportAction) {
    cleanupExportTimeline()
    exportInFlightRef.current = true
    safeSetSuccessAction(null)
    safeSetExportError(null)
    safeSetExportingAction(action)
    const root = rootRef.current
    if (!root || isReducedMotionPreferred()) return
    exportTimelineRef.current = buildGeneratingTimeline(root)
  }

  function waitForMinimumExportDuration(ms: number) {
    return new Promise<void>((resolve) => {
      clearExportDelayTimer()
      exportDelayTimerRef.current = window.setTimeout(() => {
        exportDelayTimerRef.current = null
        resolve()
      }, ms)
    })
  }

  function targetButtonForSuccess(action: ExportSuccessAction) {
    const root = rootRef.current
    if (!root) return null
    if (action === 'save') return root.querySelector<HTMLElement>('[data-testid="share-save-button"]')
    if (action === 'share-fallback') {
      return root.querySelector<HTMLElement>('[data-testid="share-share-button"]')
        ?? document.querySelector<HTMLElement>('[data-testid="share-transparent-share-button"]')
    }
    if (action === 'transparent-save') {
      return document.querySelector<HTMLElement>('[data-testid="share-transparent-save-button"]')
    }
    return null
  }

  function playSaveSuccess(action: Exclude<ExportSuccessAction, null>) {
    exportTimelineRef.current?.kill()
    exportTimelineRef.current = null
    safeSetSuccessAction(action)

    const root = rootRef.current
    if (root) setPosterMotionTerminal(root)
    if (!root || isReducedMotionPreferred()) {
      return waitForMinimumExportDuration(420)
    }

    return new Promise<void>((resolve) => {
      exportTimelineRef.current = buildSuccessTimeline(root, targetButtonForSuccess(action))
      exportTimelineRef.current.eventCallback('onComplete', () => {
        exportTimelineRef.current = null
        resolve()
      })
    })
  }

  function playNativeShareSettle() {
    exportTimelineRef.current?.kill()
    exportTimelineRef.current = null
    const root = rootRef.current
    if (!root || isReducedMotionPreferred()) return Promise.resolve()
    return new Promise<void>((resolve) => {
      exportTimelineRef.current = buildNativeShareSettleTimeline(root)
      exportTimelineRef.current.eventCallback('onComplete', () => {
        exportTimelineRef.current = null
        resolve()
      })
    })
  }

  function finishExportIdle() {
    cleanupExportTimeline()
    exportInFlightRef.current = false
    safeSetSuccessAction(null)
    safeSetExportingAction(null)
  }

  function failExport(error: unknown, fallback: string) {
    cleanupExportTimeline()
    exportInFlightRef.current = false
    safeSetSuccessAction(null)
    safeSetExportingAction(null)
    safeSetExportError(error instanceof Error ? error.message : fallback)
  }

  useGSAP(() => {
    const root = rootRef.current
    if (!root) return

    const mm = gsap.matchMedia()
    mm.add({
      allowMotion: '(prefers-reduced-motion: no-preference)',
      reduceMotion: '(prefers-reduced-motion: reduce)',
    }, (context) => {
      const allowMotion = Boolean(context.conditions?.allowMotion)
      const reduceMotion = Boolean(context.conditions?.reduceMotion)
      const stages = SHARE_STAGE_ORDER
        .map((stage) => root.querySelector<HTMLElement>(`[data-stage="${stage}"]`))
        .filter(Boolean) as HTMLElement[]

      if (reduceMotion || !allowMotion) {
        gsap.set(stages, { autoAlpha: 1, y: 0, clearProps: 'willChange' })
        clearShareMotionPending(root)
        setMotionPending(false)
        playPosterRelight(false)
        return
      }

      const stageDuration = Math.max(0.5, parseMotionTokenSeconds(root, '--motion-status', 550))
      gsap.set(stages, { autoAlpha: 0, y: 14, willChange: 'transform, opacity' })
      preparePosterMotionInitialState(root)
      clearShareMotionPending(root)
      setMotionPending(false)
      const timeline = gsap.timeline({ defaults: { duration: stageDuration, ease: 'power3.out' } })
      timeline.to(stages, {
        autoAlpha: 1,
        y: 0,
        stagger: 0.08,
        clearProps: 'willChange',
      }, 0)
      timeline.call(() => playPosterRelight(true), [], '>-0.08')
    })

    return () => {
      posterRelightTimelineRef.current?.kill()
      posterRelightTimelineRef.current = null
      mm.revert()
    }
  }, { scope: rootRef })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const fallback = window.setTimeout(() => {
      clearShareMotionPending(root)
      setMotionPending(false)
    }, 1600)
    return () => window.clearTimeout(fallback)
  }, [])

  useGSAP(() => {
    if (skipUpdateRelightRef.current) {
      skipUpdateRelightRef.current = false
      return
    }
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    playPosterRelight(!reduceMotion)
  }, { scope: rootRef, dependencies: [selectedTemplate, fieldToggles, photoDataUrl] })

  useEffect(() => () => {
    if (transparentBlobUrl) URL.revokeObjectURL(transparentBlobUrl)
  }, [transparentBlobUrl])

  function toggleField(field: ShareFieldKey) {
    if (exportFrozen || exportInFlightRef.current) return
    const config = FIELD_CONFIGS.find((item) => item.key === field)
    if (config?.locked) return
    setFieldToggles((current) => ({
      ...current,
      [field]: !current[field],
    }))
  }

  function showPremiumExportHint() {
    if (!premiumPreviewLocked) return
    trackHighQualityShareGate('gate_shown')
    setExportError('当前为预览版，解锁后可导出无水印版本')
  }

  function trackHighQualityShareGate(currentState: 'gate_shown' | 'gate_dismissed' | 'gate_engaged') {
    trackEvent({
      event_type: 'paid_attempt',
      event_name: 'paid_attempt.high_quality_share',
      properties: {
        feature_id: selectedTemplate,
        current_state: currentState,
      },
    })
  }

  function dismissPremiumExportHint() {
    trackHighQualityShareGate('gate_dismissed')
    setExportError(null)
  }

  function dismissExportError() {
    setExportError(null)
  }

  function engagePremiumExportHint() {
    trackHighQualityShareGate('gate_engaged')
  }

  function handleSelectTemplate(template: TemplateId) {
    if (exportFrozen || exportInFlightRef.current) return
    setSelectedTemplate(template)
    trackEvent({
      event_type: 'business',
      event_name: 'business.share_template_select',
      properties: { template_id: template },
    })
  }

  async function renderPosterBlob(snapshot: ExportSnapshot) {
    if (!checkinId) {
      throw new Error('缺少活动记录，无法生成分享图')
    }

    const startedAt = performance.now()
    const response = await fetch('/api/share/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: snapshot.template,
        checkinId,
        fieldVisibility: {
          duration: snapshot.fieldToggles.duration,
          elevationGain: snapshot.fieldToggles.elevationGain,
          date: snapshot.fieldToggles.date,
          location: snapshot.fieldToggles.location,
          pace: snapshot.fieldToggles.pace,
          mountainName: snapshot.fieldToggles.mountainName,
        },
        photoBase64: stripDataUrlPrefix(snapshot.photoDataUrl),
        transparent: snapshot.transparent,
      }),
    })

    if (!response.ok) {
      trackEvent({
        event_type: 'business',
        event_name: 'business.share_template_generate',
        properties: {
          template_id: snapshot.template,
          success: false,
          generate_duration_ms: Math.round(performance.now() - startedAt),
        },
      })
      throw new Error('分享图生成失败，请稍后再试')
    }

    trackEvent({
      event_type: 'business',
      event_name: 'business.share_template_generate',
      properties: {
        template_id: snapshot.template,
        success: true,
        generate_duration_ms: Math.round(performance.now() - startedAt),
        transparent: snapshot.transparent,
      },
    })
    return response.blob()
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    if (exportFrozen || exportInFlightRef.current) return
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setExportError('请选择图片文件')
      return
    }
    setExportError(null)
    try {
      setPhotoDataUrl(await resizePhotoFile(file))
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '照片处理失败，请换一张再试')
    }
  }

  async function handleSave() {
    if (exportFrozen || exportInFlightRef.current) return
    const snapshot = createExportSnapshot('save', false)
    startGeneratingMotion('save')
    showPremiumExportHint()
    try {
      const [blob] = await Promise.all([
        renderPosterBlob(snapshot),
        waitForMinimumExportDuration(720),
      ])
      downloadBlob(blob, `peak-trekker-${snapshot.template}.png`)
      trackEvent({
        event_type: 'business',
        event_name: 'business.share_template_download',
        properties: { template_id: snapshot.template, transparent: false },
      })
      await playSaveSuccess('save')
    } catch (error) {
      failExport(error, '分享图生成失败，请稍后再试')
      return
    } finally {
      finishExportIdle()
    }
  }

  async function handleShare() {
    if (exportFrozen || exportInFlightRef.current) return
    const snapshot = createExportSnapshot('share', false)
    try {
      startGeneratingMotion('share')
      showPremiumExportHint()
      const [blob] = await Promise.all([
        renderPosterBlob(snapshot),
        waitForMinimumExportDuration(720),
      ])
      const file = new File([blob], 'peak-trekker.png', { type: 'image/png' })
      const { shareLinkId, url } = buildShareAttributionUrl({ checkinId, template: snapshot.template, currentUserId })
      trackEvent({
        event_type: 'business',
        event_name: 'business.share_link_create',
        properties: {
          template_id: snapshot.template,
          share_link_id: shareLinkId,
          source_user_id: currentUserId,
        },
      })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        const shareTitle = hasShareAltitude(activityData)
          ? `${activityData.mountainName ?? 'Peak Trekker'} ${formatShareAltitude(activityData)}m`
          : activityData.mountainName ?? 'Peak Trekker'
        await navigator.share({
          title: shareTitle,
          url,
          files: [file],
        })
      } else {
        downloadBlob(blob, `peak-trekker-${snapshot.template}.png`)
        trackEvent({
          event_type: 'business',
          event_name: 'business.share_template_download',
          properties: { template_id: snapshot.template, transparent: false, fallback: 'download' },
        })
        await playSaveSuccess('share-fallback')
        finishExportIdle()
        return
      }
      await playNativeShareSettle()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        finishExportIdle()
        return
      }
      failExport(error, '分享图生成失败，请稍后再试')
      return
    } finally {
      finishExportIdle()
    }
  }

  async function handleTransparentExport() {
    if (exportFrozen || exportInFlightRef.current) return
    const snapshot = createExportSnapshot('transparent', true)
    startGeneratingMotion('transparent')
    showPremiumExportHint()
    try {
      const [blob] = await Promise.all([
        renderPosterBlob(snapshot),
        waitForMinimumExportDuration(720),
      ])
      const nextUrl = URL.createObjectURL(blob)
      setTransparentBlob(blob)
      setTransparentBlobUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return nextUrl
      })
      setViewMode('watermarkPreview')
    } catch (error) {
      failExport(error, '透明水印生成失败，请稍后再试')
      return
    } finally {
      finishExportIdle()
    }
  }

  function handleWatermarkPreviewBack() {
    if (exportFrozen || exportInFlightRef.current) return
    cleanupExportTimeline()
    setMotionPending(false)
    setViewMode('editor')
  }

  async function handleSaveTransparent() {
    if (!transparentBlob || exportFrozen || exportInFlightRef.current) return
    startGeneratingMotion('save')
    try {
      await waitForMinimumExportDuration(720)
      downloadBlob(transparentBlob, `peak-trekker-${selectedTemplate}-transparent.png`)
      trackEvent({
        event_type: 'business',
        event_name: 'business.share_template_download',
        properties: { template_id: selectedTemplate, transparent: true },
      })
      await playSaveSuccess('transparent-save')
    } catch (error) {
      failExport(error, '透明水印保存失败，请稍后再试')
      return
    } finally {
      finishExportIdle()
    }
  }

  async function handleShareTransparent() {
    if (!transparentBlob || exportFrozen || exportInFlightRef.current) return
    startGeneratingMotion('share')
    try {
      await waitForMinimumExportDuration(720)
      const file = new File([transparentBlob], 'peak-trekker-transparent.png', { type: 'image/png' })
      const { shareLinkId, url } = buildShareAttributionUrl({ checkinId, template: selectedTemplate, currentUserId })
      trackEvent({
        event_type: 'business',
        event_name: 'business.share_link_create',
        properties: {
          template_id: selectedTemplate,
          share_link_id: shareLinkId,
          source_user_id: currentUserId,
          transparent: true,
        },
      })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${activityData.mountainName ?? 'Peak Trekker'} 透明水印`,
          url,
          files: [file],
        })
      } else {
        downloadBlob(transparentBlob, `peak-trekker-${selectedTemplate}-transparent.png`)
        trackEvent({
          event_type: 'business',
          event_name: 'business.share_template_download',
          properties: { template_id: selectedTemplate, transparent: true, fallback: 'download' },
        })
        await playSaveSuccess('share-fallback')
        finishExportIdle()
        return
      }
      await playNativeShareSettle()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        finishExportIdle()
        return
      }
      failExport(error, '透明水印分享失败，请稍后再试')
      return
    } finally {
      finishExportIdle()
    }
  }

  if (viewMode === 'watermarkPreview' && transparentBlobUrl) {
    return (
      <WatermarkPreviewScreen
        imageUrl={transparentBlobUrl}
        exportingAction={exportingAction}
        successAction={successAction}
        exportError={exportError}
        rootRef={rootRef}
        onBack={handleWatermarkPreviewBack}
        onDismissError={dismissExportError}
        onSave={handleSaveTransparent}
        onShare={handleShareTransparent}
      />
    )
  }

  return (
    <main
      ref={rootRef}
      className="share-editor-root"
      data-share-editor="ready"
      data-motion-pending={motionPending ? 'true' : undefined}
      data-exporting={exportFrozen ? 'true' : 'false'}
      data-checkin-id={checkinId ?? 'mock'}
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'radial-gradient(120% 80% at 50% 0%, #0e1413 0%, #0a0c0e 55%, #08090b 100%)',
        color: 'var(--color-on-surface)',
        overflowX: 'hidden',
        paddingBottom: 'calc(92px + env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        .share-editor-root * { box-sizing: border-box; }
        .share-editor-root[data-motion-pending="true"] [data-stage] {
          opacity: 0;
          transform: translateY(14px);
          visibility: hidden;
        }
        @media (prefers-reduced-motion: reduce) {
          .share-editor-root[data-motion-pending="true"] [data-stage] {
            opacity: 1;
            transform: none;
            visibility: visible;
          }
        }
        .share-editor-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .share-editor-scrollbar::-webkit-scrollbar { display: none; }
        .share-editor-pressable { transition: filter 140ms ease, transform 140ms ease, border-color 180ms ease, background-color 180ms ease, opacity 180ms ease; }
        .share-editor-pressable:active:not(:disabled) { filter: brightness(.94); transform: scale(.985); }
        .share-export-layer {
          position: absolute;
          pointer-events: none;
          opacity: 0;
          visibility: hidden;
        }
        .share-export-sweep-clip {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          overflow: hidden;
          pointer-events: none;
        }
        .share-export-sweep {
          left: -15%;
          right: -15%;
          top: -4%;
          height: 46%;
          background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,.07) 38%, rgba(110,231,161,.13) 52%, rgba(255,255,255,.05) 66%, transparent 100%);
          mix-blend-mode: screen;
        }
        .share-export-rim {
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(110,231,161,.86);
          box-shadow: 0 0 0 1px rgba(110,231,161,.36), 0 0 44px 6px rgba(110,231,161,.56), 0 0 14px 2px rgba(110,231,161,.72), inset 0 0 28px rgba(110,231,161,.36);
        }
        .share-export-ghost {
          position: fixed;
          z-index: 80;
          pointer-events: none;
          border-radius: 16px;
          border: 1px solid rgba(110,231,161,.48);
          background: linear-gradient(180deg, rgba(35,39,44,.86), rgba(18,20,22,.94));
          box-shadow: 0 16px 44px rgba(0,0,0,.4), 0 0 28px rgba(110,231,161,.26);
          opacity: 0;
          visibility: hidden;
        }
        .share-save-toast {
          position: fixed;
          left: 50%;
          bottom: calc(94px + env(safe-area-inset-bottom));
          z-index: 90;
          transform: translateX(-50%) translateY(16px);
          min-height: 38px;
          border-radius: 999px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(110,231,161,.34);
          background: rgba(20,24,25,.92);
          color: #f5f7f8;
          box-shadow: 0 16px 34px rgba(0,0,0,.38);
          backdrop-filter: blur(18px);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          font-size: 13px;
          font-weight: 800;
        }
      `}</style>
      <noscript>
        <style>{`
          .share-editor-root[data-motion-pending="true"] [data-stage] {
            opacity: 1 !important;
            transform: none !important;
            visibility: visible !important;
          }
        `}</style>
      </noscript>
      <NavBar onBack={handleShareBack} />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handlePhotoChange}
      />

      <section
        data-stage="poster"
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '6px 0 14px',
        }}
      >
        <div
          data-testid="share-main-poster-preview"
          data-current-template={selectedTemplate}
          style={heroPreviewShellStyle}
        >
          <div data-testid="share-poster-scale-layer" style={heroPreviewScaleStyle}>
            <div
              data-testid="share-poster-inner-card"
              style={heroPreviewInnerCardStyle}
            >
              <HeroPreview
                data={activityData}
                toggles={fieldToggles}
                template={selectedTemplate}
                photoDataUrl={photoDataUrl}
              />
              <div data-testid="share-export-sweep-clip" className="share-export-sweep-clip" aria-hidden="true">
                <div
                  data-testid="share-export-sweep"
                  className="share-export-layer share-export-sweep"
                />
              </div>
              <div
                data-testid="share-export-rim"
                className="share-export-layer share-export-rim"
                aria-hidden="true"
              />
              {premiumPreviewLocked ? <PreviewWatermarkOverlay /> : null}
            </div>
          </div>
        </div>
      </section>
      {premiumPreviewLocked ? (
        <UnlockHintBar onClick={engagePremiumExportHint} />
      ) : null}

      <ThumbnailRow
        selectedTemplate={selectedTemplate}
        data={activityData}
        photoDataUrl={photoDataUrl}
        onSelectTemplate={handleSelectTemplate}
        paywallEnabled={paywallEnabled}
        premiumUnlocked={premiumUnlocked}
        disabled={exportFrozen}
      />
      <ControlRow
        onPickPhoto={() => photoInputRef.current?.click()}
        onRemovePhoto={() => {
          if (!exportFrozen) setPhotoDataUrl(null)
        }}
        onExportTransparent={handleTransparentExport}
        transparentExporting={exportingAction === 'transparent'}
        hasPhoto={Boolean(photoDataUrl)}
        disabled={exportFrozen}
      />
      <FieldSelector data={activityData} toggles={fieldToggles} onToggle={toggleField} disabled={exportFrozen} />
      {exportError ? (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            margin: 'var(--space-3) var(--space-5) 0',
            color: 'var(--color-error)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
          }}
        >
          <span>{exportError}</span>
          <button
            type="button"
            onClick={dismissPremiumExportHint}
            aria-label="关闭付费提示"
            style={{
              flex: '0 0 auto',
              minHeight: 32,
              border: '1px solid color-mix(in srgb, var(--color-error) 36%, transparent)',
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              color: 'var(--color-error)',
              padding: '0 var(--space-3)',
              fontSize: 'var(--font-label-s-size)',
            }}
          >
            知道了
          </button>
        </div>
      ) : null}
      <ActionBar exportingAction={exportingAction} successAction={successAction} onSave={handleSave} onShare={handleShare} />
      <div data-testid="share-export-ghost" className="share-export-ghost" aria-hidden="true" />
      <div data-testid="share-save-toast" className="share-save-toast" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <span>已保存到相册</span>
      </div>
    </main>
  )
}
