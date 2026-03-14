'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Mountain } from '@/types'

// 两点间距离（米），Haversine公式
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type TrekStatus = 'idle' | 'tracking' | 'checkin_ready' | 'checkin_done'
type GpsState = { lat: number; lng: number; accuracy: number } | null

const CHECKIN_RADIUS_METERS = 500

export default function TrekPage() {
  const supabase = createSupabaseBrowserClient()
  const [status, setStatus] = useState<TrekStatus>('idle')
  const [gps, setGps] = useState<GpsState>(null)
  const [gpsError, setGpsError] = useState<string>('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [nearbyMountain, setNearbyMountain] = useState<Mountain | null>(null)
  const [mountains, setMountains] = useState<Mountain[]>([])
  const [checkinNote, setCheckinNote] = useState('')
  const [checkinDone, setCheckinDone] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const trackRef = useRef<{ lat: number; lng: number; ts: number }[]>([])

  // 拉取用户 & 山峰数据
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    supabase.from('mountains').select('*').eq('is_active', true).then(({ data }) => {
      setMountains(data ?? [])
    })
  }, [supabase])

  // 检查附近山峰
  const checkNearby = useCallback((lat: number, lng: number) => {
    for (const m of mountains) {
      const dist = getDistance(lat, lng, m.latitude, m.longitude)
      if (dist <= CHECKIN_RADIUS_METERS) {
        setNearbyMountain(m)
        setStatus('checkin_ready')
        return
      }
    }
    setNearbyMountain(null)
    if (status === 'checkin_ready') setStatus('tracking')
  }, [mountains, status])

  // 开始记录
  function startTrek() {
    if (!navigator.geolocation) {
      setGpsError('你的设备不支持 GPS 定位')
      return
    }
    setStatus('tracking')
    startTimeRef.current = Date.now()
    trackRef.current = []

    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        setGps({ lat: latitude, lng: longitude, accuracy })
        setGpsError('')
        trackRef.current.push({ lat: latitude, lng: longitude, ts: Date.now() })
        checkNearby(latitude, longitude)
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: '请在浏览器中允许位置权限',
          2: 'GPS 信号获取失败，请移至开阔地',
          3: '位置获取超时，请重试',
        }
        setGpsError(msgs[err.code] ?? err.message)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    )
  }

  // 停止记录
  function stopTrek() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    setStatus('idle')
    setGps(null)
    setElapsedSeconds(0)
    setNearbyMountain(null)
    setCheckinDone(false)
    trackRef.current = []
  }

  // 清理
  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  // GPS 打卡提交
  async function handleGpsCheckin() {
    if (!gps || !nearbyMountain || !userId) return
    setCheckinLoading(true)
    const { error } = await supabase.from('checkins').insert({
      user_id: userId,
      mountain_id: nearbyMountain.id,
      type: 'gps',
      status: 'approved',
      latitude: gps.lat,
      longitude: gps.lng,
      note: checkinNote,
    })
    if (!error) {
      // 更新山峰打卡计数（忽略错误，RPC 函数可选）
      try {
        await supabase.rpc('increment_checkin_count', { mid: nearbyMountain.id })
      } catch (_) {}
      setCheckinDone(true)
      setStatus('checkin_done')
    }
    setCheckinLoading(false)
  }

  // 照片打卡提交
  async function handlePhotoCheckin() {
    if (!userId || !photoFile) return
    setCheckinLoading(true)

    // 上传图片
    const ext = photoFile.name.split('.').pop()
    const path = `checkins/${userId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('checkin-photos')
      .upload(path, photoFile)

    if (uploadError) {
      setCheckinLoading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('checkin-photos').getPublicUrl(path)

    const { error } = await supabase.from('checkins').insert({
      user_id: userId,
      type: 'photo',
      status: 'pending',
      photo_url: urlData.publicUrl,
      note: checkinNote,
    })

    if (!error) {
      setCheckinDone(true)
      setStatus('checkin_done')
    }
    setCheckinLoading(false)
  }

  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '16px' }}>

      {/* 页头 */}
      <div style={{ marginBottom: 20 }}>
        <div className="font-pixel" style={{ fontSize: 9, color: 'var(--green-neon)', letterSpacing: 2, marginBottom: 4 }}>
          // TREK · 出发记录
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>
          开启GPS追踪，接近山顶500m内自动触发打卡
        </div>
      </div>

      {/* 主状态卡 */}
      {status === 'idle' && <IdleCard onStart={startTrek} gpsError={gpsError} />}
      {status === 'tracking' && (
        <TrackingCard
          gps={gps}
          elapsed={fmt(elapsedSeconds)}
          trackCount={trackRef.current.length}
          onStop={stopTrek}
          gpsError={gpsError}
        />
      )}
      {status === 'checkin_ready' && nearbyMountain && (
        <CheckinReadyCard
          mountain={nearbyMountain}
          gps={gps}
          elapsed={fmt(elapsedSeconds)}
          note={checkinNote}
          onNoteChange={setCheckinNote}
          onCheckin={handleGpsCheckin}
          onSkip={() => setStatus('tracking')}
          loading={checkinLoading}
        />
      )}
      {status === 'checkin_done' && <CheckinDoneCard onReset={stopTrek} />}

      {/* 照片打卡区（独立，tracking 时可用） */}
      {(status === 'tracking' || status === 'idle') && !checkinDone && (
        <PhotoCheckinCard
          photoFile={photoFile}
          onPhotoChange={setPhotoFile}
          note={checkinNote}
          onNoteChange={setCheckinNote}
          onSubmit={handlePhotoCheckin}
          loading={checkinLoading}
          disabled={!userId}
        />
      )}
    </div>
  )
}

// ── 子组件 ──────────────────────────────────────────

function IdleCard({ onStart, gpsError }: { onStart: () => void; gpsError: string }) {
  return (
    <div className="mountain-card" style={{ padding: 24, marginBottom: 16, textAlign: 'center' }}>
      {/* 像素登山动画 - 静止状态 */}
      <div style={{ fontSize: 48, marginBottom: 12, lineHeight: 1 }}>🥾</div>
      <div className="font-pixel" style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 2 }}>
        准备好了吗？<br />开启记录，向山峰出发
      </div>
      {gpsError && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderLeft: '3px solid #E63946', color: '#E63946', fontSize: 11, fontFamily: 'Share Tech Mono', textAlign: 'left' }}>
          ⚠ {gpsError}
        </div>
      )}
      <button onClick={onStart} className="pixel-btn" style={{ width: '100%', padding: '14px', fontSize: 9, letterSpacing: 2 }}>
        ▶ 开启出发记录
      </button>
    </div>
  )
}

function TrackingCard({ gps, elapsed, trackCount, onStop, gpsError }: {
  gps: GpsState; elapsed: string; trackCount: number; onStop: () => void; gpsError: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* 计时器 */}
      <div className="topo-card" style={{ padding: 20, marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 8 }}>ELAPSED TIME</div>
        <div className="font-pixel neon-green" style={{ fontSize: 24, letterSpacing: 4 }}>{elapsed}</div>
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>
          已记录 {trackCount} 个轨迹点
        </div>
      </div>

      {/* GPS 状态 */}
      <div className="mountain-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="font-pixel" style={{ fontSize: 7, color: 'var(--green-primary)' }}>GPS 定位</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="glow-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: gps ? 'var(--green-neon)' : '#E63946' }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: gps ? 'var(--green-neon)' : '#E63946' }}>
              {gps ? `±${Math.round(gps.accuracy)}m` : '获取中...'}
            </span>
          </div>
        </div>
        {gps ? (
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', lineHeight: 2 }}>
            <div>N {gps.lat.toFixed(5)}° · E {gps.lng.toFixed(5)}°</div>
          </div>
        ) : gpsError ? (
          <div style={{ fontSize: 11, color: '#E63946', fontFamily: 'Share Tech Mono' }}>⚠ {gpsError}</div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>正在获取位置信号...</div>
        )}
      </div>

      {/* 提示 */}
      <div style={{
        padding: '10px 14px', marginBottom: 12,
        background: 'rgba(45,106,79,0.08)',
        border: '1px solid rgba(45,106,79,0.2)',
        borderLeft: '3px solid var(--green-primary)',
        fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.8,
      }}>
        ⛰ 接近山顶 500m 范围内，将自动触发打卡
      </div>

      <button onClick={onStop} style={{
        width: '100%', padding: '12px',
        fontFamily: 'Press Start 2P', fontSize: 8,
        background: 'transparent', color: '#E63946',
        border: '1px solid rgba(230,57,70,0.4)', cursor: 'pointer',
      }}>
        ■ 结束记录
      </button>
    </div>
  )
}

function CheckinReadyCard({ mountain, gps, elapsed, note, onNoteChange, onCheckin, onSkip, loading }: {
  mountain: Mountain; gps: GpsState; elapsed: string
  note: string; onNoteChange: (v: string) => void
  onCheckin: () => void; onSkip: () => void; loading: boolean
}) {
  const dist = gps ? Math.round(getDistance(gps.lat, gps.lng, mountain.latitude, mountain.longitude)) : null

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 触发提示 */}
      <div className="topo-card" style={{ padding: 20, marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
        <div className="font-pixel" style={{ fontSize: 9, color: 'var(--green-neon)', textShadow: '0 0 8px var(--green-neon)', marginBottom: 6, lineHeight: 2 }}>
          已到达山峰附近！
        </div>
        <div className="font-pixel" style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 4 }}>
          {mountain.name}
        </div>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
          ▲ {mountain.altitude.toLocaleString()}m
          {dist !== null && ` · 距山顶约 ${dist}m`}
        </div>
      </div>

      {/* 打卡备注 */}
      <div className="mountain-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono', marginBottom: 8 }}>
          登顶感言（可选）
        </div>
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="记录此刻的心情..."
          rows={3}
          style={{
            width: '100%', padding: '10px 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderBottom: '2px solid var(--green-primary)',
            color: 'var(--text-primary)',
            fontFamily: 'Share Tech Mono', fontSize: 12,
            outline: 'none', resize: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* 耗时展示 */}
      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 16 }}>
        本次记录时长 <span style={{ color: 'var(--green-bright)' }}>{elapsed}</span>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSkip} style={{
          flex: 1, padding: '12px',
          fontFamily: 'Press Start 2P', fontSize: 8,
          background: 'transparent', color: 'var(--text-muted)',
          border: '1px solid var(--border-color)', cursor: 'pointer',
        }}>稍后再打</button>
        <button onClick={onCheckin} disabled={loading} className="pixel-btn" style={{ flex: 2, padding: '12px', fontSize: 8 }}>
          {loading ? '提交中...' : '⛰ 确认登顶打卡'}
        </button>
      </div>
    </div>
  )
}

function CheckinDoneCard({ onReset }: { onReset: () => void }) {
  return (
    <div className="topo-card" style={{ padding: 32, textAlign: 'center', marginBottom: 16 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏔</div>
      <div className="font-pixel neon-green" style={{ fontSize: 10, marginBottom: 12, lineHeight: 2 }}>
        登顶打卡成功！
      </div>
      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.8 }}>
        记录已保存，可在「山友圈」分享你的登顶时刻
      </div>
      <button onClick={onReset} className="pixel-btn" style={{ width: '100%', padding: '12px', fontSize: 8 }}>
        ▶ 开始新的记录
      </button>
    </div>
  )
}

function PhotoCheckinCard({ photoFile, onPhotoChange, note, onNoteChange, onSubmit, loading, disabled }: {
  photoFile: File | null; onPhotoChange: (f: File | null) => void
  note: string; onNoteChange: (v: string) => void
  onSubmit: () => void; loading: boolean; disabled: boolean
}) {
  return (
    <div className="mountain-card" style={{ padding: 16, marginTop: 8 }}>
      <div className="font-pixel" style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 12, letterSpacing: 1 }}>
        // 照片打卡（无信号时使用）
      </div>
      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.8 }}>
        拍摄登顶照片，上传后由管理员审核通过即生效
      </div>

      {/* 图片上传区 */}
      <label style={{
        display: 'block', cursor: 'pointer',
        border: '1px dashed var(--green-primary)',
        padding: '20px',
        textAlign: 'center',
        marginBottom: 12,
        background: photoFile ? 'rgba(45,106,79,0.1)' : 'transparent',
      }}>
        <input type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }}
          onChange={e => onPhotoChange(e.target.files?.[0] ?? null)}
        />
        {photoFile ? (
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--green-bright)' }}>
            ✓ {photoFile.name}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📷</div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
              点击拍照或选择图片
            </div>
          </div>
        )}
      </label>

      {!note && (
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="补充说明（位置、天气等）"
          rows={2}
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 12,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderBottom: '2px solid var(--green-primary)',
            color: 'var(--text-primary)',
            fontFamily: 'Share Tech Mono', fontSize: 11,
            outline: 'none', resize: 'none', boxSizing: 'border-box',
          }}
        />
      )}

      <button
        onClick={onSubmit}
        disabled={loading || !photoFile || disabled}
        style={{
          width: '100%', padding: '12px',
          fontFamily: 'Press Start 2P', fontSize: 8,
          background: photoFile && !disabled ? 'var(--green-primary)' : 'var(--bg-secondary)',
          color: photoFile && !disabled ? 'var(--text-primary)' : 'var(--text-muted)',
          border: `1px solid ${photoFile && !disabled ? 'var(--green-primary)' : 'var(--border-color)'}`,
          cursor: photoFile && !disabled ? 'pointer' : 'not-allowed',
          letterSpacing: 1,
        }}
      >
        {disabled ? '请先登录' : loading ? '上传中...' : '📷 提交照片打卡'}
      </button>
    </div>
  )
}
