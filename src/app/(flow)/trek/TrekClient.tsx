'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { markActivationTask } from '@/lib/onboarding'
import { TREK_RULES } from '@/lib/trek-rules-client'
import { haversineMeters } from '@/lib/trek-utils'
import { useAppToast } from '@/components/ui/AppToastProvider'
import AltitudeBar from '@/components/ui/AltitudeBar'
import IconButton from '@/components/ui/IconButton'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import {
  BackIcon,
  CameraIcon,
  CheckIcon,
  GpsIcon,
  MoreIcon,
  MountainIcon,
  WarnIcon,
} from '@/components/ui/Icons'
import type { Mountain, ReviewQueueRecord, User } from '@/types'

type TrekStatus =
  | 'idle'
  | 'locating'
  | 'tracking'
  | 'approach_alert'
  | 'summit_verified'
  | 'card_preview'
  | 'shared'
type GpsState = { lat: number; lng: number; accuracy: number; altitude?: number | null } | null
type ReferenceMapVariant = 'default' | 'gpsWeak' | 'offlineCache'
type TrekViewState =
  | 'loading'
  | 'permissionDenied'
  | 'noMountain'
  | 'restricted'
  | 'preStart'
  | 'live'
  | 'gpsWeak'
  | 'paused'
  | 'nearSummit'
  | 'summitConfirmed'

const LICENSE_RANK: Record<User['license_level'], number> = {
  none: 0,
  basic: 1,
  intermediate: 2,
  advanced: 3,
}

const APPROACH_RADIUS = TREK_RULES.defaultApproachRadiusM
const SUMMIT_RADIUS = TREK_RULES.defaultSummitRadiusM
const MAX_DRIFT_SPEED_MPS = TREK_RULES.maxDriftSpeedMps
const LOCAL_TREK_SESSION_PREFIX = 'local-trek-session:'
const LOCAL_FALLBACK_SESSION_PREFIX = 'local-fallback-session:'
const INVALID_RECORD_SECONDS = 60

function isClientLocalSessionId(value: string) {
  return value.startsWith(LOCAL_TREK_SESSION_PREFIX) || value.startsWith(LOCAL_FALLBACK_SESSION_PREFIX)
}

function normalizeTrekActionError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (!message) return '确认登顶失败，请稍后重试。'
  if (message.includes('local_trek_session_disabled')) return '本次记录会话已失效，请重新开始记录。'
  if (message.includes('insufficient_track_points')) return '轨迹点还不够，请继续记录一小段再确认登顶。'
  if (message.includes('session_too_short')) return '记录时间还太短，请继续记录后再确认登顶。'
  if (message.includes('outside_summit_radius')) return '你还没有进入峰顶核验范围，请继续靠近峰顶后再试。'
  if (message.includes('invalid_session_start_time')) return '记录会话异常，请重新开始记录后再试。'
  if (message.includes('no_active_mountains')) return '当前没有可核验的山峰，请稍后再试。'
  if (message.includes('session not found')) return '本次记录会话已失效，请重新开始记录。'
  return message
}

export default function TrekClient({
  initialReviewQueueRecords,
  initialReviewQueueCount,
  userProvince,
  userLicense,
}: {
  initialReviewQueueRecords: ReviewQueueRecord[]
  initialReviewQueueCount: number
  userProvince: string | null
  userLicense: User['license_level']
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()
  const { showToast, clearToasts } = useAppToast()
  const searchParams = useSearchParams()
  const targetMountainId = searchParams.get('mountainId')
  void initialReviewQueueRecords
  void initialReviewQueueCount

  const [status, setStatus] = useState<TrekStatus>('idle')
  const [gps, setGps] = useState<GpsState>(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsErrorCode, setGpsErrorCode] = useState<number | null>(null)
  const [mountainsLoading, setMountainsLoading] = useState(true)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [distanceKm, setDistanceKm] = useState(0)
  const [ascentM, setAscentM] = useState(0)
  const [mountains, setMountains] = useState<Mountain[]>([])
  const [selectedMountainId, setSelectedMountainId] = useState(targetMountainId ?? '')
  const [confirmedMountainId, setConfirmedMountainId] = useState<string | null>(null)
  const [nearbyMountain, setNearbyMountain] = useState<Mountain | null>(null)
  const [distanceToTarget, setDistanceToTarget] = useState<number | null>(null)
  const [checkinNote, setCheckinNote] = useState('')
  const [showPhotoPanel, setShowPhotoPanel] = useState(false)
  const [isReviewQueueOpen, setIsReviewQueueOpen] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [createdCheckinId, setCreatedCheckinId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [preStartClock, setPreStartClock] = useState(() => new Date())
  const [gpsWeakStartedAt, setGpsWeakStartedAt] = useState<number | null>(null)
  const [gpsWeakClock, setGpsWeakClock] = useState(() => Date.now())
  const [lastValidAltitudeM, setLastValidAltitudeM] = useState<number | null>(null)
  const [summitConfirmedAt, setSummitConfirmedAt] = useState<Date | null>(null)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSyncRef = useRef<number>(0)
  const syncingPointRef = useRef(false)
  const startTimeRef = useRef<number>(0)
  const trackRef = useRef<{ lat: number; lng: number; ts: number; altitude?: number | null; accuracy: number }[]>([])

  const clearTrackingRuntime = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resetLiveTrekState = useCallback(() => {
    setStatus('idle')
    setGps(null)
    setElapsedSeconds(0)
    setDistanceKm(0)
    setAscentM(0)
    setNearbyMountain(null)
    setDistanceToTarget(null)
    setSessionId(null)
    setIsPaused(false)
    setCheckinNote('')
    setGpsError('')
    setGpsErrorCode(null)
    setGpsWeakStartedAt(null)
    setLastValidAltitudeM(null)
    setSummitConfirmedAt(null)
    trackRef.current = []
    lastSyncRef.current = 0
  }, [])

  useEffect(() => {
    if (isTrackingRuntimeActive(status)) return
    setSelectedMountainId(targetMountainId ?? '')
    setConfirmedMountainId(null)
  }, [status, targetMountainId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))

    fetch('/api/trek/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_active_mountains' }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(data?.error ?? 'mountains fetch failed'))
        }
        setMountains((data?.mountains ?? []) as Mountain[])
      })
      .catch(() => setMountains([]))
      .finally(() => setMountainsLoading(false))
  }, [supabase])

  useEffect(() => {
    return () => {
      clearTrackingRuntime()
    }
  }, [clearTrackingRuntime])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPreStartClock(new Date())
    }, 30000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncOnlineState = () => setIsOnline(navigator.onLine)
    syncOnlineState()
    window.addEventListener('online', syncOnlineState)
    window.addEventListener('offline', syncOnlineState)

    return () => {
      window.removeEventListener('online', syncOnlineState)
      window.removeEventListener('offline', syncOnlineState)
    }
  }, [])

  const effectiveSelectedMountainId = selectedMountainId || targetMountainId || ''

  const selectedMountain = useMemo(
    () => mountains.find((mountain) => mountain.id === effectiveSelectedMountainId) ?? null,
    [effectiveSelectedMountainId, mountains]
  )

  const targetMountain = useMemo(
    () => mountains.find((mountain) => mountain.id === confirmedMountainId) ?? null,
    [confirmedMountainId, mountains]
  )

  const suggestedMountain = useMemo(
    () => mountains.find((mountain) => mountain.id === targetMountainId) ?? null,
    [mountains, targetMountainId]
  )

  const currentAltitude = gps?.altitude ? Math.round(gps.altitude) : targetMountain?.altitude ?? 0

  const callTrekAction = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/trek/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.error) {
      throw new Error(json?.detail || json?.error || '服务端处理失败')
    }
    return json as Record<string, unknown>
  }, [])

  const checkNearby = useCallback((lat: number, lng: number) => {
    const candidates = targetMountain ? [targetMountain] : []
    let matched: Mountain | null = null
    let closestDistance = Number.POSITIVE_INFINITY

    for (const mountain of candidates) {
      const distance = haversineMeters(lat, lng, mountain.latitude, mountain.longitude)
      if (distance < closestDistance) {
        closestDistance = distance
        matched = mountain
      }
    }

    setDistanceToTarget(Number.isFinite(closestDistance) ? closestDistance : null)

    if (matched && closestDistance <= SUMMIT_RADIUS) {
      setNearbyMountain(matched)
      setStatus('approach_alert')
      return
    }

    if (matched && closestDistance <= APPROACH_RADIUS) {
      setNearbyMountain(matched)
      setStatus('approach_alert')
      return
    }

    setNearbyMountain(null)
    setDistanceToTarget(null)
    setStatus('tracking')
  }, [targetMountain])

  useEffect(() => {
    if (!gps) return
    if (status === 'summit_verified' || status === 'card_preview' || status === 'shared') return
    checkNearby(gps.lat, gps.lng)
  }, [checkNearby, gps, status, targetMountain])

  const appendPointToServer = useCallback(
    async (
      sid: string,
      point: { lat: number; lng: number; ts: number; altitude?: number | null; accuracy: number },
      accuracy: number
    ) => {
      if (syncingPointRef.current) return
      syncingPointRef.current = true
      try {
        await callTrekAction({
          action: 'append_trek_point',
          sessionId: sid,
          point: {
            lat: point.lat,
            lng: point.lng,
            ts: point.ts,
            altitude: point.altitude,
            accuracy,
          },
        })
      } catch {}
      syncingPointRef.current = false
    },
    [callTrekAction]
  )

  const finishSession = useCallback(
    async (sid: string | null, finalStatus: 'finished' | 'aborted') => {
      if (!sid) return
      try {
        await callTrekAction({
          action: 'finish_trek_session',
          sessionId: sid,
          finalStatus,
        })
      } catch {}
    },
    [callTrekAction]
  )

  async function startTrek() {
    markActivationTask('open_start')
    if (!targetMountain) {
      showToast({ key: 'action_blocked', message: '请先确认目标山峰，再开始今天的记录。' })
      return
    }
    if (!navigator.geolocation) {
      setGpsError('当前设备不支持定位。')
      setGpsErrorCode(null)
      showToast({ key: 'device_location_unsupported' })
      return
    }

    let nextSessionId: string | null = null
    try {
      const data = await callTrekAction({
        action: 'start_trek_session',
        mountainId: targetMountain.id,
      })
      if (typeof data.sessionId !== 'string') {
        showToast({ key: 'trek_session_create_failure' })
        return
      }
      nextSessionId = data.sessionId
    } catch (error) {
      showToast({
        key: 'trek_session_create_failure',
        message: error instanceof Error ? error.message : undefined,
      })
      return
    }

    setStatus('locating')
    setIsPaused(false)
    setGpsError('')
    setGpsErrorCode(null)
    setElapsedSeconds(0)
    setDistanceKm(0)
    setAscentM(0)
    setCreatedCheckinId(null)
    setSessionId(nextSessionId)
    trackRef.current = []
    startTimeRef.current = Date.now()
    lastSyncRef.current = 0
    showToast({ key: 'trek_start_success', durationMs: 2500 })

    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitude } = position.coords
        const now = Date.now()
        const nextPoint = { lat: latitude, lng: longitude, ts: now, altitude, accuracy }
        const previousPoint = trackRef.current.at(-1)
        if (typeof altitude === 'number' && Number.isFinite(altitude)) {
          setLastValidAltitudeM(Math.round(altitude))
        }

        if (previousPoint) {
          const segmentMeters = haversineMeters(previousPoint.lat, previousPoint.lng, latitude, longitude)
          const elapsed = Math.max(1, (now - previousPoint.ts) / 1000)
          const speed = segmentMeters / elapsed
          if (speed > MAX_DRIFT_SPEED_MPS && accuracy > 25) {
            setGpsError('检测到定位漂移，已过滤异常点。请继续移动到开阔区域。')
            return
          }

          setDistanceKm((value) => Number((value + segmentMeters / 1000).toFixed(2)))
          const previousAltitude = previousPoint.altitude
          if (typeof altitude === 'number' && typeof previousAltitude === 'number' && altitude > previousAltitude) {
            setAscentM((value) => value + Math.round(altitude - previousAltitude))
          }
        }

        trackRef.current.push(nextPoint)
        setGps({ lat: latitude, lng: longitude, accuracy, altitude })
        setStatus('tracking')
        setGpsError('')
        setGpsErrorCode(null)
        checkNearby(latitude, longitude)

        if (nextSessionId && (lastSyncRef.current === 0 || now - lastSyncRef.current >= 4000)) {
          lastSyncRef.current = now
          void appendPointToServer(nextSessionId, nextPoint, accuracy)
        }
      },
      (error) => {
        const messages: Record<number, string> = {
          1: '请先允许浏览器访问位置信息。',
          2: '定位失败，请移动到更开阔的位置。',
          3: '定位超时，请重试。',
        }
        const message = messages[error.code] ?? error.message
        clearTrackingRuntime()
        void finishSession(nextSessionId, 'aborted')
        resetLiveTrekState()
        setGpsError(message)
        setGpsErrorCode(error.code)
        if (error.code === 1) {
          clearToasts()
          return
        }
        showToast({ key: 'location_error', message })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    )
  }

  function stopTrek() {
    const activeSessionId = sessionId
    const recordTooShort = elapsedSeconds > 0 && elapsedSeconds < INVALID_RECORD_SECONDS && !createdCheckinId
    clearTrackingRuntime()
    resetLiveTrekState()
    void finishSession(activeSessionId, recordTooShort ? 'aborted' : 'finished')
    if (recordTooShort) {
      showToast({ key: 'trek_record_too_short' })
    }
  }

  async function handleGpsCheckin() {
    if (!nearbyMountain || !gps || !userId) {
      showToast({ key: 'action_blocked', message: '缺少必要定位信息，暂时无法确认登顶。' })
      return
    }
    if (!sessionId) {
      showToast({ key: 'action_blocked', message: '尚未建立记录会话，请重新开启记录后再确认登顶。' })
      return
    }
    if (createdCheckinId) {
      showToast({ key: 'action_blocked', message: '本次会话已完成登顶核验，无需重复提交。' })
      return
    }
    if (trackRef.current.length === 0) {
      showToast({ key: 'action_blocked', message: '请先开始记录并采集到定位轨迹后，再确认登顶。' })
      return
    }
    setCheckinLoading(true)
    try {
      await appendPointToServer(
        sessionId,
        { lat: gps.lat, lng: gps.lng, ts: Date.now(), altitude: gps.altitude, accuracy: gps.accuracy },
        gps.accuracy
      )
      const data = await callTrekAction({
        action: 'verify_summit_checkin',
        sessionId,
        note: checkinNote,
        mountainId: nearbyMountain?.id ?? targetMountain?.id ?? null,
        ...(isClientLocalSessionId(sessionId)
          ? {
              trackPoints: trackRef.current,
              startedAt: startTimeRef.current,
            }
          : {}),
      })
      const checkinId = typeof data.checkinId === 'string' ? data.checkinId : null
      if (!checkinId) {
        throw new Error('确认登顶失败，请稍后重试。')
      }

      setCreatedCheckinId(checkinId)
      setStatus('summit_verified')
      setSessionId(null)
      clearTrackingRuntime()
      showToast({ key: 'summit_verify_success' })
    } catch (error) {
      showToast({ key: 'summit_verify_failure', message: normalizeTrekActionError(error) })
    }
    setCheckinLoading(false)
  }

  async function handlePhotoCheckin() {
    if (!targetMountain) {
      showToast({ key: 'action_blocked', message: '请先选择目标山峰' })
      return
    }
    if (!userId || !photoFile) {
      showToast({ key: 'action_blocked', message: '请先选择照片后再提交。' })
      return
    }
    setPhotoLoading(true)
    try {
      const formData = new FormData()
      formData.set('file', photoFile)
      const uploadResponse = await fetch('/api/trek/photo-upload', {
        method: 'POST',
        body: formData,
      })
      const uploadPayload = await uploadResponse.json().catch(() => ({}))
      if (!uploadResponse.ok || typeof uploadPayload?.photoUrl !== 'string') {
        throw new Error(String(uploadPayload?.error ?? '图片上传失败，请稍后重试。'))
      }

      await callTrekAction({
        action: 'submit_historical_checkin',
        mountainId: targetMountain.id,
        photoUrl: uploadPayload.photoUrl,
        note: checkinNote,
      })
      setPhotoFile(null)
      setShowPhotoPanel(false)
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      showToast({ key: 'photo_checkin_success' })
    } catch (error) {
      showToast({ key: 'image_upload_failure', message: error instanceof Error ? error.message : '照片打卡提交失败，请稍后重试。' })
    } finally {
      setPhotoLoading(false)
    }
  }

  const hasMinimumVerificationEvidence =
    trackRef.current.length >= TREK_RULES.minTrackPoints && elapsedSeconds >= TREK_RULES.minSessionSeconds
  const canConfirmSummit =
    distanceToTarget !== null && distanceToTarget <= SUMMIT_RADIUS && hasMinimumVerificationEvidence
  const isTrackingActive = status === 'locating' || status === 'tracking' || status === 'approach_alert'
  const isSummitFlow = status === 'summit_verified' || status === 'card_preview' || status === 'shared'
  const activeMountainForGate = targetMountain ?? selectedMountain ?? suggestedMountain
  const hasNoMountainTarget =
    !mountainsLoading && !targetMountainId && !selectedMountainId && !confirmedMountainId && !activeMountainForGate
  const isRestricted =
    !!activeMountainForGate &&
    LICENSE_RANK[userLicense] < LICENSE_RANK[activeMountainForGate.min_license]
  const needsTargetConfirmation = !targetMountain
  const hasIncomingTarget = Boolean(targetMountainId)
  const preflightTitle = hasIncomingTarget
    ? '确认今天要记录的山峰'
    : '先选一座山，再开始今天的记录'
  const preflightActionLabel = hasIncomingTarget ? '确认这座山，开始记录准备' : '确认目标山峰'
  const photoTargetLocked = Boolean(targetMountain)
  const selectedPhotoTargetLabel = targetMountain ? `${targetMountain.name} · ${targetMountain.province}` : ''
  const photoButtonsAriaDisabled = !photoTargetLocked ? 'true' : undefined

  function confirmTargetMountain() {
    if (!selectedMountain) return
    setConfirmedMountainId(selectedMountain.id)
    setStatus('idle')
    setNearbyMountain(null)
    setDistanceToTarget(null)
    showToast({
      key: 'mountain_target_confirmed',
      message: `已锁定目标山峰：${selectedMountain.name}。`,
      durationMs: 2500,
    })
  }

  function handlePhotoTargetBlocked() {
    showToast({ key: 'action_blocked', message: '请先选择目标山峰' })
  }

  function handlePhotoFilePick() {
    if (!photoTargetLocked) {
      handlePhotoTargetBlocked()
      return
    }
    photoInputRef.current?.click()
  }

  const gpsWeak =
    !!gps &&
    isTrackingActive &&
    !isPaused &&
    !isSummitFlow &&
    (gps.accuracy > 20 ||
      Boolean(gpsError && (gpsError.includes('漂移') || gpsError.includes('开阔') || gpsError.includes('信号'))))
  const viewState: TrekViewState = mountainsLoading
    ? 'loading'
    : gpsErrorCode === 1
      ? 'permissionDenied'
      : hasNoMountainTarget
        ? 'noMountain'
        : isRestricted
          ? 'restricted'
          : isSummitFlow
            ? 'summitConfirmed'
            : isPaused && isTrackingActive
              ? 'paused'
              : gpsWeak
                ? 'gpsWeak'
                : status === 'approach_alert'
                  ? 'nearSummit'
                  : isTrackingActive
                    ? 'live'
                    : 'preStart'
  const activeMountain = targetMountain ?? selectedMountain ?? suggestedMountain
  const summitMountain = nearbyMountain ?? targetMountain ?? activeMountain
  const targetAltitude = targetMountain?.altitude ?? activeMountain?.altitude ?? 0
  const currentGpsAltitude = typeof gps?.altitude === 'number' && Number.isFinite(gps.altitude) ? Math.round(gps.altitude) : 0
  const referenceMapProgress = targetAltitude > 0 && currentGpsAltitude > 0 ? clamp01(currentGpsAltitude / targetAltitude) : 0
  const referenceMapVariant: ReferenceMapVariant = isOnline ? 'default' : 'offlineCache'
  const summitStartAltitude = getFirstValidAltitude(trackRef.current)
  const trekMetrics = [
    { label: '已用时', value: formatElapsedCompact(elapsedSeconds) },
    { label: '距离 km', value: distanceKm.toFixed(2) },
    { label: '爬升 m', value: String(ascentM) },
  ]

  useEffect(() => {
    const fullScreenStates: TrekViewState[] = ['gpsWeak', 'nearSummit', 'summitConfirmed', 'permissionDenied']

    if (fullScreenStates.includes(viewState)) {
      clearToasts()
    }
  }, [clearToasts, viewState])

  useEffect(() => {
    if (viewState === 'summitConfirmed') {
      setSummitConfirmedAt((value) => value ?? new Date())
      return
    }

    if (!isSummitFlow) {
      setSummitConfirmedAt(null)
    }
  }, [isSummitFlow, viewState])

  useEffect(() => {
    if (viewState !== 'gpsWeak') {
      setGpsWeakStartedAt(null)
      return
    }

    const now = Date.now()
    setGpsWeakStartedAt((value) => value ?? now)
    setGpsWeakClock(now)

    const timer = window.setInterval(() => {
      setGpsWeakClock(Date.now())
    }, 60000)

    return () => window.clearInterval(timer)
  }, [viewState])

  function handleBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/explore')
  }

  function pauseTrek() {
    setIsPaused(true)
  }

  function resumeTrek() {
    setIsPaused(false)
  }

  function showManualPlaceholder() {
    showToast({ key: 'action_blocked', message: '这个入口会在后续版本接入。' })
  }

  void userProvince
  void showPhotoPanel
  void isReviewQueueOpen
  void setIsReviewQueueOpen
  void photoLoading
  void selectedPhotoTargetLabel
  void photoButtonsAriaDisabled
  void handlePhotoCheckin
  void checkinLoading
  void canConfirmSummit
  void handleGpsCheckin

  return (
    <TrekShell>
      <TrekTopBar state={viewState} onBack={handleBack} />
      {gpsError && viewState !== 'permissionDenied' && viewState !== 'gpsWeak' ? (
        <div style={{ padding: '0 var(--space-4)', marginTop: 'var(--space-1)' }}>
          <InlineBanner tone="warn" title="定位状态需要注意" sub={gpsError} />
        </div>
      ) : null}

      {viewState === 'loading' ? (
        <LoadingView />
      ) : viewState === 'permissionDenied' ? (
        <PermissionDeniedView
          onOpenSettings={() => showToast({ key: 'action_blocked', message: '请在系统设置中开启浏览器定位权限。' })}
          onManualEntry={showManualPlaceholder}
        />
      ) : viewState === 'noMountain' ? (
        <NoMountainView onPick={() => router.push('/explore')} onUnassigned={showManualPlaceholder} />
      ) : viewState === 'restricted' ? (
        <RestrictedView
          mountain={activeMountainForGate}
          userLicense={userLicense}
          onChangeMountain={() => router.push('/explore')}
          onUpgrade={() => router.push('/profile')}
        />
      ) : viewState === 'preStart' ? (
        <PreStartView
          clock={preStartClock}
          needsTargetConfirmation={needsTargetConfirmation}
          preflightTitle={preflightTitle}
          selectedMountain={selectedMountain}
          suggestedMountain={suggestedMountain}
          effectiveSelectedMountainId={effectiveSelectedMountainId}
          mountains={mountains}
          preflightActionLabel={preflightActionLabel}
          onMountainChange={setSelectedMountainId}
          onConfirmTarget={confirmTargetMountain}
          activeMountain={activeMountain}
          gps={gps}
          gpsError={gpsError}
          referenceMapProgress={referenceMapProgress}
          referenceMapVariant={referenceMapVariant}
          canStart={Boolean(targetMountain)}
          onStart={startTrek}
          onOpenMountain={(mountainId) => router.push(`/mountain/${encodeURIComponent(mountainId)}`)}
        />
      ) : viewState === 'gpsWeak' ? (
        <GpsWeakView
          altitude={lastValidAltitudeM ?? currentAltitude}
          lostMinutes={formatGpsWeakMinutes(gpsWeakStartedAt, gpsWeakClock)}
        />
      ) : viewState === 'summitConfirmed' ? (
        <SummitConfirmedView
          mountain={summitMountain}
          altitude={summitMountain?.altitude ?? currentAltitude}
          confirmedAt={summitConfirmedAt}
          elapsedSeconds={elapsedSeconds}
          distanceKm={distanceKm}
          ascentM={ascentM}
          startAltitude={summitStartAltitude}
          onAddPhoto={handlePhotoFilePick}
          onSave={() => {
            if (createdCheckinId) {
              router.push(`/activity/${createdCheckinId}`)
              return
            }
            router.push('/profile')
          }}
          onLater={() => router.push('/profile')}
        />
      ) : viewState === 'nearSummit' ? (
        <NearSummitView
          distanceMeters={distanceToTarget}
          altitude={currentAltitude}
          elapsedSeconds={elapsedSeconds}
        />
      ) : (
        <div>
          <MountainContext mountain={activeMountain} />
          <ElevationHero
            value={currentAltitude}
            target={targetAltitude}
            pulse={false}
            sub={
              viewState === 'paused'
                ? '记录已暂停 · 数据保留'
                : gps?.altitude
                  ? undefined
                  : '等待 GPS 海拔 · 暂用目标海拔'
            }
          />
          <TrekMetricRow metrics={trekMetrics} />
          <TrekReferenceMap
            progress={referenceMapProgress}
            variant={referenceMapVariant}
            showCurrentMarker={viewState === 'live'}
          />

          {viewState === 'paused' ? (
            <BottomActionBar>
              <SecondaryButton style={{ width: '100%' }} onClick={stopTrek}>
                结束并保存
              </SecondaryButton>
              <PrimaryButton style={{ width: '100%' }} onClick={resumeTrek}>
                继续记录
              </PrimaryButton>
            </BottomActionBar>
          ) : (
            <BottomActionBar columns="single">
              <PrimaryButton style={{ width: '100%' }} onClick={pauseTrek}>
                暂停
              </PrimaryButton>
            </BottomActionBar>
          )}
        </div>
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
    </TrekShell>
  )
}

function TrekShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        '--color-bg': 'var(--color-surface)',
        '--font-mono': "'IBM Plex Mono', 'Menlo', monospace",
        minHeight: '100dvh',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        position: 'relative',
        paddingBottom: 120,
        overflowX: 'hidden',
      } as CSSProperties}
    >
      <div
        data-testid="trek-top-gradient-mask"
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 140,
          pointerEvents: 'none',
          zIndex: 1,
          background:
            'linear-gradient(to bottom, var(--color-bg) 0%, color-mix(in oklch, var(--color-bg) 60%, transparent) 50%, transparent 100%)',
        }}
      />
      {children}
      <style>{`
        @keyframes pt-rec-pulse {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-error) 55%, transparent); }
          100% { box-shadow: 0 0 0 8px transparent; }
        }
        @keyframes pt-start-dot-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes pt-gps-weak-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes pt-near-summit-pulse {
          0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--color-success) 55%, transparent); }
          100% { box-shadow: 0 0 0 8px transparent; }
        }
        @keyframes pt-summit-check-enter {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes pt-shimmer {
          0% { background-position: 0% 0%; }
          100% { background-position: -200% 0%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pt-rec-dot { animation: none !important; }
          .pt-start-dot { animation: none !important; }
          .pt-gps-weak-dot { animation: none !important; }
          .pt-near-summit-dot { animation: none !important; }
          .pt-summit-check-enter { animation: none !important; opacity: 1 !important; transform: scale(1) !important; }
          .pt-shimmer { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

function TrekTopBar({
  state,
  onBack,
}: {
  state: TrekViewState
  onBack: () => void
}) {
  const isRecording = state === 'live'
  const isGpsWeak = state === 'gpsWeak'
  const isNearSummit = state === 'nearSummit'
  const isSummitConfirmed = state === 'summitConfirmed'
  const label = state === 'preStart'
    ? '待出发'
    : isGpsWeak
      ? '信号微弱'
      : isNearSummit
        ? '临近峰顶'
        : isSummitConfirmed
          ? '登顶完成'
          : isRecording
            ? '记录中'
            : state === 'paused'
              ? '已暂停'
              : '待开始'
  const chipTone: 'warning' | 'success' | 'recording' | 'neutral' = isGpsWeak
    ? 'warning'
    : isNearSummit || isSummitConfirmed
      ? 'success'
      : isRecording
        ? 'recording'
        : 'neutral'
  const chipStyle: CSSProperties = chipTone === 'warning'
    ? {
        background: 'color-mix(in oklch, var(--color-surface) 80%, transparent)',
        border: '1px solid color-mix(in oklch, var(--color-warning) 40%, transparent)',
        color: 'var(--color-warning)',
      }
    : chipTone === 'success'
      ? {
          background: 'color-mix(in oklch, var(--color-surface) 80%, transparent)',
          border: '1px solid color-mix(in oklch, var(--color-success) 40%, transparent)',
          color: 'var(--color-success)',
        }
      : {
          background: 'color-mix(in oklch, var(--color-surface) 80%, transparent)',
          border: '1px solid var(--color-outline)',
          color: 'var(--color-on-surface)',
        }

  return (
    <div
      data-testid="trek-top-bar"
      style={{
        position: 'relative',
        zIndex: 2,
        height: 56,
        padding: 'var(--space-1) var(--space-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
      }}
    >
      <IconButton
        icon={<BackIcon size={20} />}
        ariaLabel="返回"
        variant="filled"
        shape="circular"
        onClick={onBack}
      />
      <div
        data-testid="trek-status-chip"
        style={{
          minHeight: 32,
          padding: '6px 14px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          borderRadius: 'var(--radius-pill)',
          ...chipStyle,
        }}
      >
        {isSummitConfirmed ? (
          <span
            data-testid="trek-summit-check"
            className="pt-summit-check-enter"
            style={{
              width: 14,
              height: 14,
              display: 'grid',
              placeItems: 'center',
              animation: 'pt-summit-check-enter 600ms ease-out forwards',
              transformOrigin: 'center',
              flex: '0 0 auto',
            }}
          >
            <CheckIcon size={14} />
          </span>
        ) : (
          <RecDot active={isRecording} tone={isGpsWeak ? 'warning' : isNearSummit ? 'success' : 'default'} />
        )}
        <span
          style={{
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          {label}
        </span>
      </div>
      <IconButton
        icon={<MoreIcon size={20} />}
        ariaLabel="更多"
        variant="filled"
        shape="circular"
        onClick={() => {}}
      />
    </div>
  )
}

function RecDot({ active, tone = 'default' }: { active: boolean; tone?: 'default' | 'warning' | 'success' }) {
  const isWarningPulse = tone === 'warning' && !active
  const isSuccessPulse = tone === 'success' && !active
  const background = active
    ? 'var(--color-error)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'success'
        ? 'var(--color-success)'
        : 'var(--color-on-surface-variant)'

  return (
    <span
      data-testid="trek-status-dot"
      className={isWarningPulse ? 'pt-rec-dot pt-gps-weak-dot' : isSuccessPulse ? 'pt-rec-dot pt-near-summit-dot' : 'pt-rec-dot'}
      style={{
        width: 8,
        height: 8,
        borderRadius: 'var(--radius-pill)',
        background,
        animation: active
          ? 'pt-rec-pulse 1.4s ease-out infinite'
          : isWarningPulse
            ? 'pt-gps-weak-pulse 2.5s ease-in-out infinite'
            : isSuccessPulse
              ? 'pt-near-summit-pulse 2.5s ease-out infinite'
              : 'none',
        transformOrigin: 'center',
        flex: '0 0 auto',
      }}
    />
  )
}

function GpsWeakView({
  altitude,
  lostMinutes,
}: {
  altitude: number
  lostMinutes: number
}) {
  const safeAltitude = Math.max(Math.round(altitude || 0), 0)

  return (
    <div
      data-testid="trek-gps-weak-view"
      style={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        paddingBottom: 128,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -96,
          left: -80,
          right: -80,
          height: 300,
          pointerEvents: 'none',
          zIndex: 0,
          background: 'radial-gradient(ellipse at top, color-mix(in oklch, var(--color-warning) 8%, transparent) 0%, transparent 68%)',
        }}
      />
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'var(--space-6) var(--space-5) var(--space-8)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 600,
            color: 'var(--color-on-surface-variant)',
            letterSpacing: '0.12em',
            }}
        >
          当前海拔 · 暂用上次值
        </div>
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 56,
              lineHeight: 1,
              color: 'var(--color-warning)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {safeAltitude}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              lineHeight: 1,
              color: 'var(--color-on-surface-variant)',
              fontWeight: 600,
              paddingBottom: 4,
            }}
          >
            m
          </div>
        </div>
        <div
          style={{
            marginTop: 'var(--space-4)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          GPS 暂时拿不到信号 · 等回到开阔处会自动续上
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 1, padding: '0 var(--space-4)' }}>
        <div
          style={{
            padding: '20px 18px',
            borderRadius: 14,
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span
              style={{
                width: 32,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                color: 'var(--color-warning)',
                flex: '0 0 auto',
              }}
            >
              <WarnIcon size={18} />
            </span>
            <h2
              style={{
                margin: 0,
                color: 'var(--color-on-surface)',
                fontSize: 'var(--font-title-m-size)',
                lineHeight: 'var(--font-title-m-line)',
                fontWeight: 600,
              }}
            >
              暂时拿不到稳定信号
            </h2>
          </div>
          <div
            style={{
              marginTop: 'var(--space-4)',
              display: 'grid',
              gap: 'var(--space-3)',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 1.65,
              fontWeight: 'var(--font-body-m-weight)',
            }}
          >
            <p style={{ margin: 0 }}>山里树林密、谷地深，GPS 偶尔会跟丢。</p>
            <p style={{ margin: 0 }}>距离暂停更新，等信号回来会自动续上。</p>
            <p style={{ margin: 0 }}>信号丢失了 {lostMinutes} 分钟 · 这段会标记为估算，不会影响登顶留证。</p>
          </div>
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 1, padding: 'var(--space-6) var(--space-4) 0' }}>
        <div
          style={{
            padding: '20px 18px',
            borderRadius: 14,
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
          }}
        >
          <div
            style={{
              marginBottom: 'var(--space-2)',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            正在尝试
          </div>
          <GpsWeakRetryItem label="重新搜星" sub="约 30 秒一次" />
          <GpsWeakRetryItem label="使用最后有效海拔" sub="GPS 续上后会重新校准" />
          <GpsWeakRetryItem label="保留你已经走过的所有点" sub="不会丢" isLast />
        </div>
      </section>

      <BottomActionBar columns="single">
        <PrimaryButton style={{ width: '100%' }} onClick={() => {}}>
          继续记录
        </PrimaryButton>
        <div
          style={{
            marginTop: 'var(--space-3)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            color: 'var(--color-on-surface-variant)',
          }}
        >
          专注路上 · 信号会回来的
        </div>
      </BottomActionBar>
    </div>
  )
}

function GpsWeakRetryItem({
  label,
  sub,
  isLast = false,
}: {
  label: string
  sub: string
  isLast?: boolean
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '12px minmax(0, 1fr)',
        gap: 'var(--space-3)',
        padding: '12px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--color-outline)',
      }}
    >
      <span style={{ paddingTop: 6 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            width: 7,
            height: 7,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-success)',
          }}
        />
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 'var(--font-title-m-weight)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 'var(--space-1)',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
          }}
        >
          {sub}
        </span>
      </span>
    </div>
  )
}

function NearSummitView({
  distanceMeters,
  altitude,
  elapsedSeconds,
}: {
  distanceMeters: number | null
  altitude: number
  elapsedSeconds: number
}) {
  const distanceLabel = formatNearSummitDistance(distanceMeters)
  const altitudeLabel = formatGroupedMeters(altitude)
  const elapsedLabel = formatElapsedForNearSummit(elapsedSeconds)

  return (
    <div
      data-testid="trek-near-summit-view"
      style={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        paddingBottom: 128,
      }}
    >
      <div
        data-testid="trek-near-summit-ambient"
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 280,
          pointerEvents: 'none',
          zIndex: 0,
          background: 'radial-gradient(ellipse at top, color-mix(in oklch, var(--color-success) 6%, transparent) 0%, transparent 68%)',
        }}
      />

      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'var(--space-12) var(--space-5) 0',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            color: 'var(--color-on-surface-variant)',
            letterSpacing: '0.08em',
          }}
        >
          距离峰顶
        </div>
        <div
          style={{
            marginTop: 'var(--space-2)',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
          }}
        >
          <span
            data-testid="trek-near-summit-distance"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 56,
              lineHeight: 1,
              fontWeight: 700,
              color: 'var(--color-success)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {distanceLabel}
          </span>
          <span
            style={{
              marginLeft: 4,
              paddingBottom: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 18,
              lineHeight: 1,
              fontWeight: 600,
              color: 'var(--color-success)',
            }}
          >
            m
          </span>
        </div>

        <div style={{ marginTop: 'var(--space-8)' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--font-headline-m-size)',
              lineHeight: 'var(--font-headline-m-line)',
              fontWeight: 600,
              color: 'var(--color-on-surface)',
            }}
          >
            慢一点 · 看一眼脚下
          </h1>
          <div
            style={{
              marginTop: 'var(--space-4)',
              display: 'grid',
              gap: 'var(--space-2)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 1.6,
              fontWeight: 'var(--font-body-m-weight)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <p style={{ margin: 0 }}>山顶在前方。这一段更要稳。</p>
            <p style={{ margin: 0 }}>到了之后，留 10 分钟给自己。</p>
          </div>
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 1, padding: 'var(--space-8) var(--space-4) 0' }}>
        <div
          data-testid="trek-near-summit-stats"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            background: 'var(--color-surface-variant)',
            borderRadius: 16,
            padding: '20px 16px',
          }}
        >
          <NearSummitStat label="当前海拔" value={`${altitudeLabel}m`} />
          <NearSummitStat label="已用时" value={elapsedLabel} withDivider />
          <div
            data-testid="trek-near-summit-stat"
            style={{
              minWidth: 0,
              paddingLeft: 'var(--space-3)',
              borderLeft: '1px solid color-mix(in oklch, var(--color-outline) 50%, transparent)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
                fontWeight: 500,
                color: 'var(--color-on-surface-variant)',
              }}
            >
              留证准备
            </div>
            <div
              style={{
                marginTop: 'var(--space-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-success)',
                }}
              />
              <span
                style={{
                  color: 'var(--color-success)',
                  fontSize: 'var(--font-body-m-size)',
                  lineHeight: 'var(--font-body-m-line)',
                  fontWeight: 500,
                }}
              >
                就绪
              </span>
            </div>
          </div>
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 1, padding: 'var(--space-4) var(--space-4) 0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            borderRadius: 16,
            border: '1px solid color-mix(in oklch, var(--color-success) 20%, transparent)',
            background: 'var(--color-surface-variant)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--radius-pill)',
              background: 'color-mix(in oklch, var(--color-success) 12%, transparent)',
              color: 'var(--color-success)',
              flex: '0 0 auto',
            }}
          >
            <CameraIcon size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'var(--color-on-surface)',
                fontSize: 'var(--font-title-m-size)',
                lineHeight: 'var(--font-title-m-line)',
                fontWeight: 'var(--font-title-m-weight)',
              }}
            >
              到达峰顶时
            </div>
            <p
              style={{
                margin: 'var(--space-1) 0 0',
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-m-size)',
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              系统会请你拍一张登顶照作为留证 · 一张就够。
            </p>
          </div>
        </div>
      </section>

      <BottomActionBar columns="single">
        <PrimaryButton data-testid="trek-near-summit-cta" style={{ width: '100%' }} onClick={() => {}}>
          继续
        </PrimaryButton>
      </BottomActionBar>
    </div>
  )
}

function NearSummitStat({
  label,
  value,
  withDivider = false,
}: {
  label: string
  value: string
  withDivider?: boolean
}) {
  return (
    <div
      data-testid="trek-near-summit-stat"
      style={{
        minWidth: 0,
        padding: withDivider ? '0 var(--space-3)' : '0 var(--space-3) 0 0',
        borderLeft: withDivider ? '1px solid color-mix(in oklch, var(--color-outline) 50%, transparent)' : 'none',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 500,
          color: 'var(--color-on-surface-variant)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 'var(--space-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 18,
          lineHeight: 1.2,
          fontWeight: 600,
          color: 'var(--color-on-surface)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function PreStartView({
  clock,
  needsTargetConfirmation,
  preflightTitle,
  selectedMountain,
  suggestedMountain,
  effectiveSelectedMountainId,
  mountains,
  preflightActionLabel,
  onMountainChange,
  onConfirmTarget,
  activeMountain,
  gps,
  gpsError,
  referenceMapProgress,
  referenceMapVariant,
  canStart,
  onStart,
  onOpenMountain,
}: {
  clock: Date
  needsTargetConfirmation: boolean
  preflightTitle: string
  selectedMountain: Mountain | null
  suggestedMountain: Mountain | null
  effectiveSelectedMountainId: string
  mountains: Mountain[]
  preflightActionLabel: string
  onMountainChange: (value: string) => void
  onConfirmTarget: () => void
  activeMountain: Mountain | null
  gps: GpsState
  gpsError: string
  referenceMapProgress: number
  referenceMapVariant: ReferenceMapVariant
  canStart: boolean
  onStart: () => void
  onOpenMountain: (mountainId: string) => void
}) {
  return (
    <div>
      <section style={{ padding: 'var(--space-6) var(--space-6) var(--space-1)' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 600,
            color: 'var(--color-on-surface-variant)',
            letterSpacing: '0.12em',
          }}
        >
          {formatPreStartClock(clock)} · 出发前
        </div>
        <div
          style={{
            marginTop: 'var(--space-3)',
            fontSize: 'var(--font-display-l-size)',
            lineHeight: 'var(--font-display-l-line)',
            fontWeight: 600,
            color: 'var(--color-on-surface)',
          }}
        >
          <div>山在这里。</div>
          <div style={{ marginTop: 'var(--space-1)', color: 'var(--color-on-surface-variant)' }}>你也在了。</div>
        </div>
        <p
          style={{
            margin: 'var(--space-4) 0 0',
            maxWidth: 292,
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 1.65,
            fontWeight: 400,
            color: 'var(--color-on-surface-variant)',
          }}
        >
          准备好之后再出发。这次山行只属于你和这座山。
        </p>
      </section>

      {needsTargetConfirmation ? (
        <MountainTargetPicker
          title={preflightTitle}
          description={
            selectedMountain
              ? `你将以 ${selectedMountain.name} 作为本次记录目标。确认前不会创建记录会话。`
              : suggestedMountain
                ? '来自山峰详情页的目标已带入，确认后才会正式进入记录流程。'
                : '直接来到这里时需要先选择一座山，避免误开无效记录。'
          }
          value={effectiveSelectedMountainId}
          mountains={mountains}
          selectedMountain={selectedMountain}
          actionLabel={preflightActionLabel}
          onChange={onMountainChange}
          onConfirm={onConfirmTarget}
        />
      ) : (
        <>
          <PreStartMountainCard mountain={activeMountain} onClick={() => {
            if (activeMountain) onOpenMountain(activeMountain.id)
          }} />

          <PreStartPreflightList mountain={activeMountain} gps={gps} gpsError={gpsError} />

          <TrekReferenceMap
            progress={referenceMapProgress}
            variant={referenceMapVariant}
            showCurrentMarker={false}
          />

          <BottomActionBar columns="single">
            <PrimaryButton
              style={{ width: '100%' }}
              onClick={onStart}
              disabled={!canStart}
              data-onboarding="trek-start"
            >
              <span
                aria-hidden="true"
                className="pt-start-dot"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-success)',
                  marginRight: 'var(--space-2)',
                  animation: 'pt-start-dot-pulse 2s ease-in-out infinite',
                }}
              />
              从这里开始
            </PrimaryButton>
            <div
              style={{
                marginTop: 'var(--space-4)',
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 1.6,
                fontWeight: 500,
                color: 'var(--color-on-surface-variant)',
              }}
            >
              Peak Trekker 不会催促你。<br />
              路上请把这部手机放回口袋。
            </div>
          </BottomActionBar>
        </>
      )}
    </div>
  )
}

function PreStartMountainCard({
  mountain,
  onClick,
}: {
  mountain: Mountain | null | undefined
  onClick: () => void
}) {
  return (
    <div style={{ padding: 'var(--space-5) var(--space-4) 0' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={!mountain}
        style={{
          width: '100%',
          minHeight: 64,
          padding: '14px var(--space-4)',
          display: 'grid',
          gridTemplateColumns: '32px minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 'var(--space-3)',
          borderRadius: 14,
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
          color: 'var(--color-on-surface)',
          font: 'inherit',
          textAlign: 'left',
          cursor: mountain ? 'pointer' : 'default',
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
            color: 'var(--color-success)',
          }}
        >
          <MountainIcon size={20} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--font-title-m-size)',
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountain ? mountain.name : '尚未选择目标山峰'}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              color: 'var(--color-on-surface-variant)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountain
              ? `${mountain.province} · 目标 ${formatMeters(mountain.altitude)}m · ${difficultyLabel(mountain.difficulty)}`
              : '先确认一座山，再开始记录'}
          </span>
        </span>
        <span
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 20,
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
    </div>
  )
}

function MountainContext({
  mountain,
  onClick,
}: {
  mountain: Mountain | null | undefined
  onClick?: () => void
}) {
  return (
    <div style={{ padding: '0 var(--space-4)', marginTop: 'var(--space-3)' }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          minHeight: 60,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
          color: 'var(--color-on-surface)',
          font: 'inherit',
          textAlign: 'left',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-primary) 24%, transparent)',
            color: 'var(--color-success)',
            flex: '0 0 auto',
          }}
        >
          <MountainIcon size={22} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 'var(--font-body-m-line)',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountain ? mountain.name : '尚未选择目标山峰'}
            {mountain ? (
              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 12, fontWeight: 500 }}>
                {' '}· {mountain.province}
              </span>
            ) : null}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 2,
              fontFamily: "'IBM Plex Mono', Menlo, monospace",
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              color: 'var(--color-on-surface-variant)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mountain
              ? `目标 ${formatMeters(mountain.altitude)}m · ${difficultyLabel(mountain.difficulty)}`
              : '先确认一座山，再开始记录'}
          </span>
        </span>
        {onClick ? (
          <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 18, lineHeight: 1 }} aria-hidden="true">
            ›
          </span>
        ) : null}
      </button>
    </div>
  )
}

function NoMountainView({
  onPick,
  onUnassigned,
}: {
  onPick: () => void
  onUnassigned: () => void
}) {
  return (
    <div style={{ padding: '48px 28px 0', textAlign: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)',
          color: 'var(--color-success)',
          margin: '0 auto',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <MountainIcon size={28} />
      </div>
      <div style={{ fontSize: 'var(--font-title-l-size)', lineHeight: 'var(--font-title-l-line)', fontWeight: 700, marginTop: 18 }}>
        还没有选择这次要去的山
      </div>
      <div
        style={{
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 1.6,
          color: 'var(--color-on-surface-variant)',
          maxWidth: 300,
          margin: 'var(--space-2) auto 0',
        }}
      >
        Peak Trekker 的记录以一座真实的山为主语。<br />
        先选一座，再开始记录。
      </div>
      <div
        style={{
          marginTop: 22,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <PrimaryButton onClick={onPick}>
          去 Explore 选山
        </PrimaryButton>
        <button
          type="button"
          onClick={onUnassigned}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--color-on-surface-variant)',
            font: 'inherit',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          直接记为无归属 · 事后再认领
        </button>
      </div>
    </div>
  )
}

function PermissionDeniedView({
  onOpenSettings,
  onManualEntry,
}: {
  onOpenSettings: () => void
  onManualEntry: () => void
}) {
  return (
    <div style={{ padding: '48px 28px 0', textAlign: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
          color: 'var(--color-warning)',
          margin: '0 auto',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <WarnIcon size={28} />
      </div>
      <div style={{ fontSize: 'var(--font-title-l-size)', lineHeight: 'var(--font-title-l-line)', fontWeight: 700, marginTop: 18 }}>
        需要定位权限
      </div>
      <div
        style={{
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 1.6,
          color: 'var(--color-on-surface-variant)',
          maxWidth: 300,
          margin: 'var(--space-2) auto 0',
        }}
      >
        记录轨迹和海拔需要“始终允许”定位。<br />
        仅在记录期间使用，不做后台追踪。
      </div>
      <div
        style={{
          marginTop: 22,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <PrimaryButton onClick={onOpenSettings}>
          去系统设置开启
        </PrimaryButton>
        <button
          type="button"
          onClick={onManualEntry}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--color-on-surface-variant)',
            font: 'inherit',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          手动补签（不自动记录）
        </button>
      </div>
    </div>
  )
}

function RestrictedView({
  mountain,
  userLicense,
  onChangeMountain,
  onUpgrade,
}: {
  mountain: Mountain | null | undefined
  userLicense: User['license_level']
  onChangeMountain: () => void
  onUpgrade: () => void
}) {
  const requiredLabel = mountain ? licenseShortLabel(mountain.min_license) : '更高等级'
  const currentLabel = licenseShortLabel(userLicense)

  return (
    <div>
      <MountainContext mountain={mountain} />
      <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
        <div
          style={{
            background: 'var(--color-surface-variant)',
            border: '1px solid color-mix(in srgb, var(--color-error) 35%, transparent)',
            borderRadius: 14,
            padding: 'var(--space-4)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
              color: 'var(--color-error)',
              margin: '0 auto var(--space-3)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <WarnIcon size={24} />
          </div>
          <div style={{ fontSize: 'var(--font-title-m-size)', lineHeight: 'var(--font-title-m-line)', fontWeight: 700 }}>
            等级不够 · 无法开始记录
          </div>
          <div
            style={{
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 1.6,
              color: 'var(--color-on-surface-variant)',
              marginTop: 'var(--space-2)',
            }}
          >
            {mountain?.name ?? '这座山'} 需要 {requiredLabel}{'\u00A0'}及以上登山等级。<br />
            你当前为 {currentLabel}。这是硬性限制，不是建议。
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
              border: '1px solid var(--color-outline)',
              borderRadius: 10,
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 1.55,
              color: 'var(--color-on-surface)',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 700 }}>下一步：</span>完成任一 5000m+ 山行（哈巴雪山 · 四姑娘大峰 · 雪宝顶）即可晋级。
          </div>
        </div>
      </div>
      <BottomActionBar>
        <SecondaryButton style={{ width: '100%' }} onClick={onChangeMountain}>
          换一座山
        </SecondaryButton>
        <PrimaryButton style={{ width: '100%' }} onClick={onUpgrade}>
          查看升级路径
        </PrimaryButton>
      </BottomActionBar>
    </div>
  )
}

function LoadingView() {
  return (
    <div>
      <div style={{ padding: '10px var(--space-4) 0' }}>
        <SkeletonRow height={60} />
      </div>
      <div style={{ padding: 'var(--space-5) var(--space-5) var(--space-2)', textAlign: 'center' }}>
        <SkeletonRow height={10} width={70} style={{ margin: '0 auto' }} />
        <div style={{ height: 12 }} />
        <SkeletonRow height={44} width={180} style={{ margin: '0 auto' }} />
        <div style={{ height: 12 }} />
        <SkeletonRow height={8} width={240} style={{ margin: '0 auto', borderRadius: 'var(--radius-pill)' }} />
      </div>
      <div
        style={{
          padding: 'var(--space-4) var(--space-4) 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        <SkeletonRow height={64} />
        <SkeletonRow height={64} />
        <SkeletonRow height={64} />
      </div>
      <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
        <SkeletonRow height={160} style={{ borderRadius: 14 }} />
      </div>
    </div>
  )
}

function SkeletonRow({
  height,
  width = '100%',
  style,
}: {
  height: number
  width?: number | string
  style?: CSSProperties
}) {
  return (
    <div
      className="pt-shimmer"
      style={{
        height,
        width,
        borderRadius: 10,
        background:
          'linear-gradient(90deg, color-mix(in srgb, var(--color-on-surface) 3%, transparent) 0%, color-mix(in srgb, var(--color-on-surface) 7%, transparent) 50%, color-mix(in srgb, var(--color-on-surface) 3%, transparent) 100%)',
        backgroundSize: '200% 100%',
        animation: 'pt-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

function MountainTargetPicker({
  title,
  description,
  value,
  mountains,
  selectedMountain,
  actionLabel,
  onChange,
  onConfirm,
}: {
  title: string
  description: string
  value: string
  mountains: Mountain[]
  selectedMountain: Mountain | null
  actionLabel: string
  onChange: (value: string) => void
  onConfirm: () => void
}) {
  return (
    <div
      style={{
        margin: 'var(--space-3) var(--space-4) 0',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
      }}
    >
      <div style={{ fontSize: 'var(--font-title-m-size)', lineHeight: 'var(--font-title-m-line)', fontWeight: 600 }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 'var(--space-1)',
          fontSize: 'var(--font-body-m-size)',
          lineHeight: 'var(--font-body-m-line)',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        {description}
      </div>
      <label style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
        <span
          style={{
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          目标山峰
        </span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            width: '100%',
            minHeight: 48,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-outline)',
            color: 'var(--color-on-surface)',
            padding: '0 var(--space-3)',
            outline: 'none',
          }}
        >
          <option value="">请选择一座山峰</option>
          {mountains.map((mountain) => (
            <option key={mountain.id} value={mountain.id}>
              {mountain.name} · {mountain.province} · {formatMeters(mountain.altitude)}m
            </option>
          ))}
        </select>
      </label>
      {selectedMountain ? (
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
          }}
        >
          <div style={{ fontSize: 'var(--font-title-m-size)', fontWeight: 700 }}>{selectedMountain.name}</div>
          <div
            style={{
              marginTop: 4,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            {selectedMountain.province} · {formatMeters(selectedMountain.altitude)}m · 记录会围绕这座山做峰顶核验。
          </div>
        </div>
      ) : null}
      <PrimaryButton style={{ width: '100%', marginTop: 'var(--space-4)' }} disabled={!selectedMountain} onClick={onConfirm}>
        {actionLabel}
      </PrimaryButton>
    </div>
  )
}

type PreflightTone = 'success' | 'warning' | 'neutral'

function PreStartPreflightList({
  mountain,
  gps,
  gpsError,
}: {
  mountain: Mountain | null | undefined
  gps: GpsState
  gpsError: string
}) {
  const gpsTone: PreflightTone = gpsError ? 'warning' : gps?.accuracy ? 'success' : 'neutral'
  const gpsLabel = gpsError ? 'GPS 需要重新确认' : gps?.accuracy ? 'GPS 信号清晰' : 'GPS 待确认'
  const gpsSub = gpsError || (gps?.accuracy ? `水平精度 ±${Math.round(gps.accuracy)}m` : '开始后请求高精度定位')
  const mountainName = mountain?.name ?? '山峰'

  return (
    <div
      style={{
        margin: 'var(--space-4) var(--space-4) 0',
        display: 'grid',
        gap: 'var(--space-2)',
      }}
    >
      <PreStartPreflightItem tone={gpsTone} icon="gps" label={gpsLabel} sub={gpsSub} />
      <PreStartPreflightItem tone="success" label="离线地图已就绪" sub={`${mountainName}区域 · 静态路线参考`} />
      <PreStartPreflightItem tone="neutral" label="电量信息" sub="开启省电模式可记录更久" />
    </div>
  )
}

function PreStartPreflightItem({
  tone,
  icon = 'check',
  label,
  sub,
}: {
  tone: PreflightTone
  icon?: 'check' | 'gps'
  label: string
  sub: string
}) {
  const color = tone === 'success'
    ? 'var(--color-success)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : 'var(--color-on-surface-variant)'

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        padding: '14px var(--space-4)',
        borderRadius: 14,
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
      }}
    >
      <span style={{ color, marginTop: 1, flex: '0 0 auto' }}>
        {tone === 'warning' ? <WarnIcon size={18} /> : icon === 'gps' ? <GpsIcon size={18} /> : <CheckIcon size={18} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-m-line)',
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 3,
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          {sub}
        </span>
      </span>
    </div>
  )
}

function ElevationHero({
  value,
  target,
  sub,
  pulse = false,
}: {
  value: number
  target: number
  sub?: string
  pulse?: boolean
}) {
  const safeValue = Math.max(Math.round(value || 0), 0)
  const safeTarget = Math.max(Math.round(target || 0), 0)
  const delta = safeTarget > 0 ? Math.max(safeTarget - safeValue, 0) : 0

  return (
    <div style={{ padding: 'var(--space-5) var(--space-5) var(--space-2)', textAlign: 'center' }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', Menlo, monospace",
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          letterSpacing: '0.22em',
          color: 'var(--color-on-surface-variant)',
          fontWeight: 600,
        }}
      >
        当前海拔
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', Menlo, monospace",
            fontWeight: 800,
            fontSize: 56,
            lineHeight: 1,
            color: 'var(--color-success)',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            textShadow: pulse ? '0 0 18px color-mix(in srgb, var(--color-success) 34%, transparent)' : 'none',
          }}
        >
          {safeValue}
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', Menlo, monospace",
            fontSize: 16,
            color: 'var(--color-on-surface-variant)',
            fontWeight: 600,
            paddingBottom: 4,
          }}
        >
          m
        </div>
      </div>
      {safeTarget > 0 ? (
        <div style={{ marginTop: 'var(--space-3)', padding: '0 var(--space-5)' }}>
          <AltitudeBar current={safeValue} max={safeTarget} />
          <div
            style={{
              marginTop: 6,
              fontFamily: "'IBM Plex Mono', Menlo, monospace",
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              color: 'var(--color-on-surface-variant)',
              letterSpacing: '0.05em',
            }}
          >
            距峰顶 {delta}m · 目标 {safeTarget}m
          </div>
        </div>
      ) : null}
      {sub ? (
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function TrekMetricRow({ metrics }: { metrics: Array<{ label: string; value: string }> }) {
  return (
    <div
      style={{
        padding: 'var(--space-4) var(--space-4) 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 'var(--space-2)',
      }}
    >
      {metrics.map((metric) => (
        <TrekMetric key={metric.label} label={metric.label} value={metric.value} />
      ))}
    </div>
  )
}

function TrekMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: '12px 10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', Menlo, monospace",
          fontSize: 18,
          lineHeight: '22px',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 10,
          lineHeight: '14px',
          color: 'var(--color-on-surface-variant)',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function TrekReferenceMap({
  progress,
  variant = 'default',
  showCurrentMarker = true,
}: {
  progress: number
  variant?: ReferenceMapVariant
  showCurrentMarker?: boolean
}) {
  const p = clamp01(progress)
  const progressPercent = Math.round(p * 100)
  const isGpsWeak = variant === 'gpsWeak'
  const isOffline = variant === 'offlineCache'
  const dotX = 42 + p * 235
  const dotY = 204 - p * 162 - Math.sin(p * Math.PI) * 16
  const walkedControlX = 64 + p * 84
  const walkedControlY = 188 - p * 64
  const walkedPath = `M28 204 Q${walkedControlX} ${walkedControlY} ${dotX} ${dotY}`

  return (
    <div
      data-testid="trek-reference-map-module"
      style={{
        margin: 'var(--space-4) var(--space-4) 0',
      }}
    >
      <div
        data-testid="trek-reference-map-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 0,
          marginBottom: 8,
          gap: 'var(--space-3)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 500,
            color: 'var(--color-on-surface-variant)',
          }}
        >
          位置参考
        </span>
        <span
          style={{
            minWidth: 0,
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 400,
            color: 'var(--color-on-surface-variant)',
            textAlign: 'right',
          }}
        >
          海拔与进度仍是主要信息
        </span>
      </div>
      {isOffline ? (
        <div
          data-testid="trek-reference-map-offline-hint"
          style={{
            marginBottom: 8,
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 400,
            color: 'var(--color-on-surface-variant)',
          }}
        >
          本地缓存模式 · 数据未与云端同步
        </div>
      ) : null}
      <div
        data-testid="trek-reference-map-canvas"
        style={{
          height: 240,
          borderRadius: 16,
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--color-surface-variant)',
        }}
      >
        <svg
          data-testid="trek-reference-map-svg"
          width="100%"
          height="100%"
          viewBox="0 0 343 240"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0 }}
        >
          <g data-testid="trek-reference-map-contours">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <ellipse
                key={item}
                cx="246"
                cy="62"
                rx={24 + item * 29}
                ry={14 + item * 18}
                stroke="color-mix(in oklch, var(--color-outline) 40%, transparent)"
                strokeWidth="1"
                fill="none"
              />
            ))}
          </g>
          <g data-testid="trek-reference-map-route" opacity={isOffline ? 0.7 : 1}>
            {isOffline ? null : (
              <path
                data-testid="trek-reference-map-future-route"
                d="M28 204 C72 184 98 164 126 150 S178 112 208 98 S257 65 277 42"
                stroke="color-mix(in oklch, var(--color-outline) 48%, transparent)"
                strokeWidth="1.5"
                strokeDasharray="3 5"
                fill="none"
                strokeLinecap="round"
              />
            )}
            <path
              data-testid="trek-reference-map-trail"
              d={walkedPath}
              stroke="var(--color-trail)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            {showCurrentMarker ? (
              <g data-testid="trek-reference-map-current-marker" opacity={isGpsWeak ? 0.72 : 1}>
                <circle
                  cx={dotX}
                  cy={dotY}
                  r="12"
                  fill="color-mix(in oklch, var(--color-success) 25%, transparent)"
                />
                <circle cx={dotX} cy={dotY} r="6" fill="var(--color-success)" />
              </g>
            ) : null}
          </g>
          <path data-testid="trek-reference-map-summit-marker" d="M270 49 L277 35 L284 49 Z" fill="var(--color-on-surface-variant)" />
        </svg>
        <span
          data-testid="trek-reference-map-chip"
          style={{
            position: 'absolute',
            left: 12,
            top: 12,
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            background: 'color-mix(in oklch, var(--color-surface) 80%, transparent)',
            backdropFilter: 'blur(8px)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          地图仅作参考
        </span>
        <span
          data-testid="trek-reference-map-progress"
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
            color: 'var(--color-success)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" focusable="false">
            <path d="M1.5 8L5 2L8.5 8Z" fill="var(--color-on-surface-variant)" />
          </svg>
          {progressPercent}% · 顶峰
        </span>
        {isGpsWeak ? (
          <span
            data-testid="trek-reference-map-gps-weak-chip"
            style={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid color-mix(in oklch, var(--color-warning) 40%, transparent)',
              background: 'color-mix(in oklch, var(--color-warning) 16%, var(--color-surface))',
              color: 'var(--color-warning)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 500,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--color-warning)',
              }}
            />
            GPS弱 · 位置可能延迟
          </span>
        ) : null}
      </div>
    </div>
  )
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

function InlineBanner({
  tone,
  title,
  sub,
}: {
  tone: 'warn' | 'success' | 'error'
  title: string
  sub?: string
}) {
  const color = tone === 'success' ? 'var(--color-success)' : tone === 'error' ? 'var(--color-error)' : 'var(--color-warning)'
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ color, marginTop: 1 }}>{tone === 'success' ? <CheckIcon size={18} /> : <WarnIcon size={18} />}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--font-label-m-size)', fontWeight: 700, color }}>{title}</span>
        {sub ? (
          <span
            style={{
              display: 'block',
              marginTop: 3,
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  )
}

function BottomActionBar({
  children,
  columns = 'double',
}: {
  children: ReactNode
  columns?: 'single' | 'double'
}) {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '12px var(--space-4) calc(26px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(180deg, transparent, var(--color-surface) 30%)',
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-max-width)',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: columns === 'single' ? '1fr' : 'minmax(0, 0.72fr) minmax(0, 1fr)',
          gap: 'var(--space-3)',
          alignItems: 'center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SummitConfirmedView({
  mountain,
  altitude,
  confirmedAt,
  elapsedSeconds,
  distanceKm,
  ascentM,
  startAltitude,
  onAddPhoto,
  onSave,
  onLater,
}: {
  mountain: Mountain | null | undefined
  altitude: number
  confirmedAt: Date | null
  elapsedSeconds: number
  distanceKm: number
  ascentM: number
  startAltitude: number | null
  onAddPhoto: () => void
  onSave: () => void
  onLater: () => void
}) {
  const altitudeLabel = formatGroupedMeters(altitude)
  const timeLabel = formatSummitTime(confirmedAt)
  const locationLabel = formatSummitLocation(mountain)
  const stats = [
    { label: '总用时', value: formatSummitElapsed(elapsedSeconds) },
    { label: '距离', value: formatSummitDistance(distanceKm) },
    { label: '爬升', value: formatSummitAscent(ascentM) },
    { label: '出发海拔', value: formatSummitAltitude(startAltitude) },
  ]

  return (
    <div
      data-testid="trek-summit-confirmed-view"
      style={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        minHeight: 'calc(100dvh - 56px)',
        paddingBottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))',
      }}
    >
      <div
        data-testid="trek-summit-ambient"
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 320,
          pointerEvents: 'none',
          zIndex: 0,
          background: 'radial-gradient(ellipse at top, color-mix(in oklch, var(--color-success) 14%, transparent) 0%, transparent 68%)',
        }}
      />

      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'var(--space-12) var(--space-5) 0',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            fontWeight: 500,
            letterSpacing: '0.16em',
            color: 'var(--color-on-surface-variant)',
            textTransform: 'uppercase',
          }}
        >
          ALT · SUMMIT
        </div>

        <h1
          style={{
            margin: 'var(--space-3) 0 0',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-headline-m-size)',
            lineHeight: 'var(--font-headline-m-line)',
            fontWeight: 600,
          }}
        >
          {mountain?.name ?? '本次山行'}
        </h1>

        <div
          style={{
            marginTop: 6,
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 400,
          }}
        >
          {locationLabel}
        </div>

        <div
          style={{
            marginTop: 'var(--space-8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'baseline',
          }}
        >
          <span
            data-testid="trek-summit-altitude"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 88,
              lineHeight: 1,
              fontWeight: 700,
              color: 'var(--color-success)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {altitudeLabel}
          </span>
          <span
            style={{
              marginLeft: 6,
              paddingBottom: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 22,
              lineHeight: 1,
              fontWeight: 600,
              color: 'var(--color-success)',
            }}
          >
            m
          </span>
        </div>

        <div
          style={{
            marginTop: 'var(--space-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 500,
            color: 'var(--color-success)',
          }}
        >
          {timeLabel} · 留证已确认
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 1, marginTop: 'var(--space-8)' }}>
        <SummitRidgeDivider />
      </section>

      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'var(--space-8) var(--space-5) 0',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            margin: 0,
            color: 'var(--color-on-surface)',
            fontSize: 26,
            lineHeight: '32px',
            fontWeight: 700,
          }}
        >
          到了。
        </h2>
        <div
          style={{
            marginTop: 'var(--space-4)',
            display: 'grid',
            gap: 'var(--space-2)',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 1.6,
            fontWeight: 'var(--font-body-m-weight)',
          }}
        >
          <p style={{ margin: 0 }}>留 10 分钟给这里 ·</p>
          <p style={{ margin: 0 }}>下山的路慢慢走。</p>
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 1, padding: 'var(--space-8) var(--space-4) 0' }}>
        <div
          data-testid="trek-summit-stats"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            background: 'var(--color-surface-variant)',
            borderRadius: 16,
            padding: '16px 8px',
          }}
        >
          {stats.map((stat, index) => (
            <SummitStat key={stat.label} label={stat.label} value={stat.value} withDivider={index < stats.length - 1} />
          ))}
        </div>
      </section>

      <section style={{ position: 'relative', zIndex: 1, padding: 'var(--space-6) var(--space-4) 0' }}>
        <PrimaryButton
          data-testid="trek-summit-primary-cta"
          style={{ width: '100%', height: 52, minHeight: 52, borderRadius: 16 }}
          onClick={onAddPhoto}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <CameraIcon size={18} />
            <span>留下峰顶记录</span>
          </span>
        </PrimaryButton>

        <div
          style={{
            marginTop: 'var(--space-3)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <SecondaryButton
            data-testid="trek-summit-save-cta"
            style={{
              width: '100%',
              height: 52,
              minHeight: 52,
              borderRadius: 16,
              background: 'var(--color-surface-variant)',
              border: '1px solid color-mix(in oklch, var(--color-outline) 60%, transparent)',
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-m-size)',
              fontWeight: 'var(--font-title-m-weight)',
              paddingInline: 'var(--space-3)',
            }}
            onClick={onSave}
          >
            保存这次登顶
          </SecondaryButton>
          <SecondaryButton
            data-testid="trek-summit-later-cta"
            style={{
              width: '100%',
              height: 52,
              minHeight: 52,
              borderRadius: 16,
              background: 'var(--color-surface-variant)',
              border: '1px solid color-mix(in oklch, var(--color-outline) 60%, transparent)',
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-m-size)',
              fontWeight: 'var(--font-title-m-weight)',
              paddingInline: 'var(--space-3)',
            }}
            onClick={onLater}
          >
            稍后整理
          </SecondaryButton>
        </div>

        <div
          style={{
            marginTop: 'var(--space-5)',
            marginBottom: 'var(--space-6)',
            textAlign: 'center',
            color: 'var(--color-on-surface-variant)',
            fontSize: 12,
            lineHeight: 1.5,
            fontWeight: 400,
          }}
        >
          峰顶留证窗口仍有 8 分钟 · 不急。
          <br />
          下山途中也可以补充照片与一段话。
        </div>
      </section>
    </div>
  )
}

function SummitRidgeDivider() {
  return (
    <div
      data-testid="trek-summit-divider"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 var(--space-5)',
      }}
    >
      <span
        data-testid="trek-summit-divider-line"
        aria-hidden="true"
        style={{
          flex: 1,
          height: 1,
          background: 'color-mix(in oklch, var(--color-outline) 50%, transparent)',
        }}
      />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 1,
          color: 'var(--color-on-surface-variant)',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
        }}
      >
        <ArrowUpRightMini />
        <span>此刻 · 山顶</span>
      </span>
      <span
        data-testid="trek-summit-divider-line"
        aria-hidden="true"
        style={{
          flex: 1,
          height: 1,
          background: 'color-mix(in oklch, var(--color-outline) 50%, transparent)',
        }}
      />
    </div>
  )
}

function ArrowUpRightMini() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{
        width: 12,
        height: 12,
        display: 'block',
        flex: '0 0 auto',
        color: 'var(--color-on-surface-variant)',
      }}
    >
      <path
        d="M3.25 8.75L8.75 3.25M4.25 3.25h4.5v4.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SummitStat({
  label,
  value,
  withDivider = false,
}: {
  label: string
  value: string
  withDivider?: boolean
}) {
  return (
    <div
      data-testid="trek-summit-stat"
      style={{
        minWidth: 0,
        position: 'relative',
        boxSizing: 'border-box',
        padding: '0 4px',
        textAlign: 'center',
        borderRight: withDivider ? '1px solid color-mix(in oklch, var(--color-outline) 50%, transparent)' : undefined,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          lineHeight: '18px',
          fontWeight: 600,
          color: 'var(--color-on-surface)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'visible',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 'var(--space-1)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 500,
          color: 'var(--color-on-surface-variant)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function formatElapsedCompact(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatPreStartClock(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatGpsWeakMinutes(startedAt: number | null, now: number) {
  if (!startedAt) return 0
  return Math.max(0, Math.floor((now - startedAt) / 60000))
}

function formatNearSummitDistance(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '--'
  return String(Math.max(0, Math.round(Number(value))))
}

function formatGroupedMeters(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '--'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(Number(value))))
}

function getFirstValidAltitude(points: Array<{ altitude?: number | null }>) {
  const firstPoint = points.find((point) => typeof point.altitude === 'number' && Number.isFinite(point.altitude))
  return typeof firstPoint?.altitude === 'number' ? Math.round(firstPoint.altitude) : null
}

function formatSummitTime(date: Date | null) {
  if (!date) return '--'
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatSummitLocation(mountain: Mountain | null | undefined) {
  if (!mountain) return '--'
  const parts = [mountain.province, difficultyLabel(mountain.difficulty)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '--'
}

function formatSummitElapsed(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '--'
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatSummitDistance(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--'
  return `${value.toFixed(1)}km`
}

function formatSummitAscent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--'
  return `${formatGroupedMeters(value)}m`
}

function formatSummitAltitude(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '--'
  return `${formatGroupedMeters(value)}m`
}

function formatElapsedForNearSummit(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatMeters(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '0'
  return String(Math.round(Number(value)))
}

function difficultyLabel(value: Mountain['difficulty'] | null | undefined) {
  const labels: Record<Mountain['difficulty'], string> = {
    beginner: '入门线',
    intermediate: '进阶线',
    advanced: '高阶线',
    expert: '专家线',
  }
  return value ? labels[value] : '路线待确认'
}

function licenseShortLabel(value: User['license_level'] | Mountain['min_license'] | null | undefined) {
  const labels: Record<User['license_level'], string> = {
    none: '无执照',
    basic: '初级',
    intermediate: '中级',
    advanced: '高级',
  }
  if (value === 'basic' || value === 'intermediate' || value === 'advanced') return labels[value]
  return labels.none
}

function isTrackingRuntimeActive(status: TrekStatus) {
  return status === 'locating' || status === 'tracking' || status === 'approach_alert'
}
