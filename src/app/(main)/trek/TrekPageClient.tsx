'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { markActivationTask } from '@/lib/onboarding'
import { getCheckinScore } from '@/lib/province-ranking'
import { TREK_RULES } from '@/lib/trek-rules-client'
import { haversineMeters } from '@/lib/trek-utils'
import { useAppToast } from '@/components/ui/AppToastProvider'
import IconButton from '@/components/ui/IconButton'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import SharePosterButton from '@/components/ui/SharePosterButton'
import TertiaryButton from '@/components/ui/TertiaryButton'
import { MapPlaceholder, SectionHeader, DifficultyBadge } from '@/components/ui/MountainUI'
import MyRecordsModal from '@/components/profile/MyRecordsModal'
import type { Mountain, ReviewQueueRecord } from '@/types'

type TrekStatus =
  | 'idle'
  | 'locating'
  | 'tracking'
  | 'approach_alert'
  | 'summit_verified'
  | 'card_preview'
  | 'shared'
type GpsState = { lat: number; lng: number; accuracy: number; altitude?: number | null } | null

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

export default function TrekPageClient({
  initialReviewQueueRecords,
  initialReviewQueueCount,
  userProvince,
}: {
  initialReviewQueueRecords: ReviewQueueRecord[]
  initialReviewQueueCount: number
  userProvince: string | null
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const { showToast } = useAppToast()
  const searchParams = useSearchParams()
  const targetMountainId = searchParams.get('mountainId')

  const [status, setStatus] = useState<TrekStatus>('idle')
  const [gps, setGps] = useState<GpsState>(null)
  const [gpsError, setGpsError] = useState('')
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
    setCheckinNote('')
    setGpsError('')
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
  }, [supabase])

  useEffect(() => {
    return () => {
      clearTrackingRuntime()
    }
  }, [clearTrackingRuntime])

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
    setGpsError('')
    setElapsedSeconds(0)
    setDistanceKm(0)
    setAscentM(0)
    setCreatedCheckinId(null)
    setSessionId(nextSessionId)
    trackRef.current = []
    startTimeRef.current = Date.now()
    lastSyncRef.current = 0
    showToast({ key: 'trek_start_success' })

    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitude } = position.coords
        const now = Date.now()
        const nextPoint = { lat: latitude, lng: longitude, ts: now, altitude, accuracy }
        const previousPoint = trackRef.current.at(-1)

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
        showToast({ key: 'location_error', message })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    )
  }

  const avgPace = useMemo(() => {
    if (!distanceKm || !elapsedSeconds) return '--'
    const secondsPerKm = elapsedSeconds / distanceKm
    const minutes = Math.floor(secondsPerKm / 60)
    const seconds = Math.round(secondsPerKm % 60)
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}/km`
  }, [distanceKm, elapsedSeconds])

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

  const metrics = [
    { label: '时长', value: formatElapsed(elapsedSeconds) },
    { label: '距离', value: `${distanceKm.toFixed(2)} km` },
    { label: '累计爬升', value: `${ascentM} m` },
    { label: '实时海拔', value: `${currentAltitude || 0} m` },
    { label: '平均配速', value: avgPace },
    { label: '定位精度', value: gps?.accuracy ? `${Math.round(gps.accuracy)} m` : '--' },
  ]
  const hasMinimumVerificationEvidence =
    trackRef.current.length >= TREK_RULES.minTrackPoints && elapsedSeconds >= TREK_RULES.minSessionSeconds
  const canConfirmSummit =
    distanceToTarget !== null && distanceToTarget <= SUMMIT_RADIUS && hasMinimumVerificationEvidence
  const isTrackingActive = status === 'locating' || status === 'tracking' || status === 'approach_alert'
  const isSummitFlow = status === 'summit_verified' || status === 'card_preview' || status === 'shared'
  const processShareDraft = useMemo(
    () =>
      targetMountain
        ? {
            mountainName: targetMountain.name,
            altitude: currentAltitude || targetMountain.altitude,
            province: targetMountain.province,
            note: checkinNote || '正在记录途中进度，先把当前状态分享出去。',
            latitude: gps?.lat ?? null,
            longitude: gps?.lng ?? null,
            distanceKm,
            ascentM,
            durationSec: elapsedSeconds,
            verified: false,
          }
        : null,
    [ascentM, checkinNote, currentAltitude, distanceKm, elapsedSeconds, gps?.lat, gps?.lng, targetMountain]
  )
  const needsTargetConfirmation = !targetMountain
  const hasIncomingTarget = Boolean(targetMountainId)
  const preflightTitle = hasIncomingTarget
    ? '确认今天要记录的山峰'
    : '先选一座山，再开始今天的记录'
  const preflightActionLabel = hasIncomingTarget ? '确认这座山，开始记录准备' : '确认目标山峰'
  const photoTargetLocked = Boolean(targetMountain)
  const selectedPhotoTargetLabel = targetMountain ? `${targetMountain.name} · ${targetMountain.province}` : ''
  const photoButtonsAriaDisabled = !photoTargetLocked ? 'true' : undefined
  const summitContributionScore = nearbyMountain ? getCheckinScore(nearbyMountain.difficulty ?? '') : 0
  const summitContributionNote =
    createdCheckinId && userProvince && summitContributionScore > 0
      ? `+${summitContributionScore} 分 贡献给 ${userProvince}`
      : null

  function confirmTargetMountain() {
    if (!selectedMountain) return
    setConfirmedMountainId(selectedMountain.id)
    setStatus('idle')
    setNearbyMountain(null)
    setDistanceToTarget(null)
    showToast({ key: 'mountain_target_confirmed', message: `已锁定目标山峰：${selectedMountain.name}。` })
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div style={{ marginBottom: 16 }}>
        <SectionHeader
          title="开始记录"
          description={
            targetMountain
              ? `目标山峰：${targetMountain.name}。先完成记录，再决定是否生成海报和分享到山友圈。`
              : suggestedMountain
                ? `来自山峰详情页的目标已带入，确认后才会正式进入记录流程。`
                : '直接进入出发页时需要先选山，再开始记录，避免误以为已经开录。'
          }
        />
      </div>

      {needsTargetConfirmation && (
        <div className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
          <SectionHeader
            title={preflightTitle}
            description={
              selectedMountain
                ? `你将以 ${selectedMountain.name} 作为本次记录目标。确认前不会创建记录会话，也不会误开一条无效记录。`
                : '从山峰详情进入时会自动带入目标；直接来到这里则需要先手动选择。'
            }
          />
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}>
              <span className="section-subtitle">目标山峰</span>
              <select
                value={effectiveSelectedMountainId}
                onChange={(event) => setSelectedMountainId(event.target.value)}
                style={{
                  width: '100%',
                  minHeight: 52,
                  borderRadius: 12,
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '0 14px',
                  outline: 'none',
                }}
              >
                <option value="">请选择一座山峰</option>
                {mountains.map((mountain) => (
                  <option key={mountain.id} value={mountain.id}>
                    {mountain.name} · {mountain.province} · ▲ {mountain.altitude.toLocaleString()}m
                  </option>
                ))}
              </select>
            </label>
            {selectedMountain && (
              <div className="metric-tile">
                <div className="font-pixel" style={{ fontSize: 18, marginBottom: 4 }}>{selectedMountain.name}</div>
                <div className="section-subtitle">
                  {selectedMountain.province} · ▲ {selectedMountain.altitude.toLocaleString()}m · 记录会围绕这座山做接近判断与峰顶核验。
                </div>
              </div>
            )}
            <PrimaryButton
              style={{ width: '100%' }}
              disabled={!selectedMountain}
              onClick={confirmTargetMountain}
            >
              {preflightActionLabel}
            </PrimaryButton>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 18 }} data-onboarding="trek-map">
        <MapPlaceholder
          title={isTrackingActive ? 'Recording in progress' : isSummitFlow ? 'Summit verified' : 'Navigate preview'}
          subtitle={
            isSummitFlow && nearbyMountain
              ? `${nearbyMountain.name} 已核验，继续生成或分享活动卡即可。`
              : nearbyMountain
              ? `已接近 ${nearbyMountain.name}，进入峰顶范围后可确认登顶。`
              : targetMountain
                ? `当前目标为 ${targetMountain.name}。路线仅供参考，实际请以专业地图、向导与现场判断为准。`
                : '确认目标山峰后，这里会切到对应路线参考视图。'
          }
          controls={
            <div style={{ display: 'grid', gap: 8 }}>
              {['图层', '天气'].map((label) => (
                <SecondaryButton key={label}>
                  {label}
                </SecondaryButton>
              ))}
            </div>
          }
          height={420}
        />
      </div>

      <div className="surface-card" style={{ padding: 16, marginBottom: 18 }} data-onboarding="trek-panel">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
          {metrics.slice(0, 3).map((metric) => (
            <div key={metric.label} className="metric-tile">
              <div className="font-pixel" style={{ fontSize: 18 }}>{metric.value}</div>
              <div className="metric-label">{metric.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
          {metrics.slice(3).map((metric) => (
            <div key={metric.label} className="metric-tile">
              <div className="font-pixel" style={{ fontSize: 16 }}>{metric.value}</div>
              <div className="metric-label">{metric.label}</div>
            </div>
          ))}
        </div>

        {targetMountain && (
          <div className="surface-card" style={{ padding: 14, marginBottom: 16, background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <div className="font-pixel" style={{ fontSize: 16, marginBottom: 4 }}>{targetMountain.name}</div>
                <div className="section-subtitle">{targetMountain.province} · ▲ {targetMountain.altitude.toLocaleString()}m</div>
              </div>
              <DifficultyBadge level={targetMountain.difficulty} />
            </div>
            {!isTrackingActive && !isSummitFlow && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                <span className="muted-chip active">目标已确认</span>
                <SecondaryButton onClick={() => setConfirmedMountainId(null)}>
                  换一座山
                </SecondaryButton>
              </div>
            )}
          </div>
        )}

        {gpsError && (
          <div className="danger-card" style={{ padding: 14, marginBottom: 16 }}>
            <div className="section-subtitle" style={{ color: '#fecaca' }}>{gpsError}</div>
          </div>
        )}

        {isTrackingActive ? (
          <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
            <PrimaryButton style={{ width: '100%' }} onClick={stopTrek}>
              停止记录
            </PrimaryButton>
            {processShareDraft && (
              <SharePosterButton
                checkinId="demo"
                mountainName={targetMountain?.name ?? '当前进度'}
                allowedTemplates={['trek_snapshot']}
                buttonLabel="分享当前进度"
                demoMode
                defaultRenderMode="classic_card"
                previewSuccessMessage="当前进度分享卡已生成，可以预览后再分享。"
                draftPoster={processShareDraft}
                autoPreviewOnOpen
              />
            )}
          </div>
        ) : targetMountain ? (
          <PrimaryButton
            style={{ width: '100%', marginBottom: 10 }}
            onClick={startTrek}
            data-onboarding="trek-start"
          >
            Start 开启记录
          </PrimaryButton>
        ) : (
          <SecondaryButton style={{ width: '100%', marginBottom: 10 }} disabled>
            先确认目标山峰
          </SecondaryButton>
        )}
      </div>

      {status === 'approach_alert' && nearbyMountain && (
        <div className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
          <SectionHeader title="已接近峰顶" description={`进入 ${APPROACH_RADIUS}m 范围后可准备确认登顶，${SUMMIT_RADIUS}m 内优先视为峰顶范围。`} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div className="font-pixel" style={{ fontSize: 20, marginBottom: 4 }}>{nearbyMountain.name}</div>
              <div className="section-subtitle">记录完成后可直接生成 Summit Card 分享卡</div>
              {distanceToTarget !== null && (
                <div className="section-subtitle" style={{ marginTop: 6, color: canConfirmSummit ? 'var(--green-bright)' : 'var(--warning)' }}>
                  当前距离峰顶约 {Math.round(distanceToTarget)} m {canConfirmSummit ? '，可以确认登顶。' : '，继续靠近到 200m 内可确认。'}
                </div>
              )}
            </div>
            <DifficultyBadge level={nearbyMountain.difficulty} />
          </div>
          <textarea
            value={checkinNote}
            onChange={(event) => setCheckinNote(event.target.value)}
            rows={3}
            placeholder="写下这一段攀登感受..."
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 12,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              resize: 'vertical',
              marginBottom: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <SecondaryButton style={{ flex: 1 }} onClick={() => setStatus('tracking')}>
              继续记录
            </SecondaryButton>
            <PrimaryButton
              style={{ flex: 2 }}
              onClick={handleGpsCheckin}
              disabled={checkinLoading || !canConfirmSummit}
            >
              {checkinLoading ? '确认中...' : '确认登顶'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {isSummitFlow && nearbyMountain && (
        <div className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
          <SectionHeader title="登顶已核验" description="可以立即生成 Summit Card，也可以继续补充途中快照。" />
          <div className="metric-tile" style={{ marginBottom: 14 }}>
            <div className="font-pixel" style={{ fontSize: 22, marginBottom: 4 }}>{nearbyMountain.name}</div>
            <div className="section-subtitle">
              {distanceKm.toFixed(2)} km · 爬升 {ascentM} m · 用时 {formatElapsed(elapsedSeconds)}
            </div>
          </div>
          {createdCheckinId && (
            <>
              <div data-onboarding="share-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/activity/${createdCheckinId}`} className="secondary-btn" style={{ textDecoration: 'none' }}>
                  查看攀登记录
                </Link>
                <SharePosterButton
                  checkinId={createdCheckinId}
                  mountainName={nearbyMountain.name}
                  onFlowStateChange={(flowState) => {
                    if (flowState === 'preview') {
                      setStatus('card_preview')
                      return
                    }
                    if (flowState === 'shared') {
                      setStatus('shared')
                      return
                    }
                    setStatus('summit_verified')
                  }}
                />
                <Link href={`/community/publish/${createdCheckinId}`} className="primary-btn" style={{ textDecoration: 'none' }}>
                  分享到山友圈
                </Link>
              </div>
              {summitContributionNote ? (
                <div
                  data-testid="trek-province-contribution-note"
                  style={{
                    marginTop: 'var(--space-2)',
                    color: 'var(--color-on-surface-variant)',
                    fontSize: 'var(--font-label-s-size)',
                    lineHeight: 'var(--font-label-s-line)',
                    fontWeight: 'var(--font-label-s-weight)',
                  }}
                >
                  {summitContributionNote}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <div className="surface-card trek-photo-checkin" style={{ padding: 16 }}>
        <div className="trek-photo-checkin__header">
          <div>
            <div className="trek-photo-checkin__header-copy">
              <div className="section-title" style={{ marginBottom: 4 }}>
                照片打卡
              </div>
              <div className="section-subtitle">无信号或补传场景都从这里进入，提交后会进入审核。</div>
            </div>
            {initialReviewQueueCount > 0 ? (
              <TertiaryButton
                className="trek-photo-checkin__records-link"
                data-testid="trek-review-queue-trigger"
                onClick={() => setIsReviewQueueOpen(true)}
              >
                我的记录 ({initialReviewQueueCount})
              </TertiaryButton>
            ) : null}
          </div>
          <IconButton
            icon={showPhotoPanel ? 'chevron-up' : 'chevron-down'}
            ariaLabel={showPhotoPanel ? '收起' : '展开'}
            variant="filled"
            onClick={() => setShowPhotoPanel((value) => !value)}
            data-testid="photo-checkin-toggle"
          />
        </div>

        {showPhotoPanel && (
          <div className="trek-photo-checkin__body">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />

            <div
              className={`trek-photo-checkin__status ${photoTargetLocked ? 'is-ready' : 'is-warning'}`}
              data-testid="photo-checkin-status"
            >
              <span className="trek-photo-checkin__status-icon" aria-hidden="true">
                {photoTargetLocked ? '✓' : '!'}
              </span>
              <span className="section-subtitle">
                {photoTargetLocked ? `目标山峰：${selectedPhotoTargetLabel}` : '请先在上方选择目标山峰'}
              </span>
            </div>

            {photoFile ? (
              <div className="metric-tile trek-photo-checkin__file-card">
                <div>
                  <div className="font-pixel" style={{ fontSize: 15, marginBottom: 4 }}>{photoFile.name}</div>
                  <div className="section-subtitle">这张照片会绑定到当前选定山峰，审核通过后再进入正式记录。</div>
                </div>
                <SecondaryButton
                  onClick={() => {
                    if (!photoTargetLocked) {
                      handlePhotoTargetBlocked()
                      return
                    }
                    photoInputRef.current?.click()
                  }}
                  aria-disabled={photoButtonsAriaDisabled}
                >
                  更换照片
                </SecondaryButton>
              </div>
            ) : (
              <SecondaryButton onClick={handlePhotoFilePick} aria-disabled={photoButtonsAriaDisabled}>
                选择照片
              </SecondaryButton>
            )}

            <textarea
              value={checkinNote}
              onChange={(event) => setCheckinNote(event.target.value)}
              rows={3}
              placeholder="补充审核说明、拍摄时间或备注"
              className="trek-photo-checkin__textarea"
            />

            <div className="section-subtitle">审核规则：照片记录会进入人工审核，不计实时榜单。</div>

            <PrimaryButton
              style={{ width: '100%' }}
              onClick={() => {
                if (!photoTargetLocked) {
                  handlePhotoTargetBlocked()
                  return
                }
                void handlePhotoCheckin()
              }}
              aria-disabled={photoButtonsAriaDisabled}
              loading={photoLoading}
            >
              {photoLoading ? '上传中...' : '提交照片打卡'}
            </PrimaryButton>
          </div>
        )}
      </div>

      <MyRecordsModal
        open={isReviewQueueOpen}
        onClose={() => setIsReviewQueueOpen(false)}
        records={initialReviewQueueRecords}
      />
    </div>
  )
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function isTrackingRuntimeActive(status: TrekStatus) {
  return status === 'locating' || status === 'tracking' || status === 'approach_alert'
}
