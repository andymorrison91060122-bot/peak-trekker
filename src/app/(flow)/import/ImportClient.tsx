'use client'

import type { ChangeEvent, DragEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ImportedTrackData, TrackPoint } from '@/lib/import/types'
import Card from '@/components/ui/Card'
import Chip from '@/components/ui/Chip'
import IconButton from '@/components/ui/IconButton'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { SourceLabel } from '@/components/ui/SourceLabel'
import StatTile from '@/components/ui/StatTile'
import TopBar from '@/components/ui/TopBar'
import {
  BackIcon,
  CheckIcon,
  GpsIcon,
  ShareIcon,
  WarnIcon,
} from '@/components/ui/Icons'

const IMPORT_MAX_BYTES = 20 * 1024 * 1024
const SUPPORTED_FORMATS = ['gpx', 'kml', 'fit'] as const

type ImportStep = 'upload' | 'parsing' | 'confirm' | 'submitting' | 'success'
type SupportedFormat = (typeof SUPPORTED_FORMATS)[number]

type ParseResponse = {
  ok?: boolean
  parsedData?: ImportedTrackData
  error?: string
}

type ConfirmResponse = {
  ok?: boolean
  checkinId?: string
  error?: string
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function isSupportedFormat(value: string): value is SupportedFormat {
  return SUPPORTED_FORMATS.includes(value as SupportedFormat)
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function formatDistance(meters?: number) {
  if (typeof meters !== 'number') return '未识别'
  return `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds?: number) {
  if (typeof seconds !== 'number') return '未识别'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

function formatMeters(value?: number) {
  if (typeof value !== 'number') return '未识别'
  return `${Math.round(value).toLocaleString('zh-CN')} m`
}

function formatDate(value?: string) {
  if (!value) return '未识别'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '未识别'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toDateInputValue(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function getNumberInputValue(value?: number, divisor = 1, fractionDigits = 0) {
  if (typeof value !== 'number') return ''
  return (value / divisor).toFixed(fractionDigits)
}

function parseOptionalNumber(value: string, multiplier = 1) {
  if (value.trim() === '') return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue * multiplier : undefined
}

function getTrackBounds(points: TrackPoint[]) {
  const elevations = points
    .map((point) => point.elevation)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (elevations.length < 2) return null
  return {
    min: Math.min(...elevations),
    max: Math.max(...elevations),
  }
}

function buildElevationPolyline(points: TrackPoint[]) {
  const withElevation = points.filter((point) => typeof point.elevation === 'number')
  const bounds = getTrackBounds(withElevation)
  if (!bounds || withElevation.length < 2) return null

  const samples = withElevation.filter((_, index) => {
    const interval = Math.max(1, Math.floor(withElevation.length / 56))
    return index % interval === 0 || index === withElevation.length - 1
  })
  const width = 320
  const height = 118
  const range = Math.max(1, bounds.max - bounds.min)

  const pointsString = samples
    .map((point, index) => {
      const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * width
      const normalized = ((point.elevation ?? bounds.min) - bounds.min) / range
      const y = height - normalized * 86 - 14
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const fillPath = `M${pointsString.replaceAll(' ', ' L')} L${width},${height} L0,${height} Z`

  return {
    line: pointsString,
    fillPath,
    min: bounds.min,
    max: bounds.max,
  }
}

function buildLoginHref() {
  return `/auth/login?from=${encodeURIComponent('/import')}`
}

export default function ImportClient() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState<ImportStep>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ImportedTrackData | null>(null)
  const [editableData, setEditableData] = useState<ImportedTrackData | null>(null)
  const [selectedMountainId, setSelectedMountainId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [matchNotice, setMatchNotice] = useState<string | null>(null)
  const [checkinId, setCheckinId] = useState<string | null>(null)

  useEffect(() => {
    if (step !== 'success' || !checkinId) return
    const timer = window.setTimeout(() => {
      router.push(`/activity/${checkinId}`)
    }, 1100)

    return () => window.clearTimeout(timer)
  }, [checkinId, router, step])

  const elevationPreview = useMemo(
    () => buildElevationPolyline(editableData?.trackPoints ?? parsedData?.trackPoints ?? []),
    [editableData?.trackPoints, parsedData?.trackPoints]
  )

  function openFilePicker() {
    inputRef.current?.click()
  }

  function resetForNewFile() {
    setStep('upload')
    setSelectedFile(null)
    setParsedData(null)
    setEditableData(null)
    setSelectedMountainId(null)
    setNote('')
    setParseError(null)
    setSubmitError(null)
    setAuthRequired(false)
    setMatchNotice(null)
    setCheckinId(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function validateFile(file: File) {
    const extension = getFileExtension(file.name)
    if (!isSupportedFormat(extension)) {
      return '仅支持 GPX、KML 或 FIT 轨迹文件。'
    }
    if (file.size > IMPORT_MAX_BYTES) {
      return '轨迹文件不能超过 20MB。'
    }
    return null
  }

  async function parseFile(file: File) {
    const validationError = validateFile(file)
    setSelectedFile(file)
    setParsedData(null)
    setEditableData(null)
    setSelectedMountainId(null)
    setSubmitError(null)
    setAuthRequired(false)
    setMatchNotice(null)

    if (validationError) {
      setParseError(validationError)
      setStep('upload')
      return
    }

    setParseError(null)
    setStep('parsing')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/import/parse', {
        method: 'POST',
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as ParseResponse | null

      if (response.status === 401) {
        setAuthRequired(true)
        setParseError('登录后即可解析并保存这条轨迹。')
        setStep('upload')
        return
      }

      if (!response.ok || !payload?.ok || !payload.parsedData) {
        setParseError(payload?.error ?? '轨迹文件解析失败，请换一个文件重试。')
        setStep('upload')
        return
      }

      setParsedData(payload.parsedData)
      setEditableData(payload.parsedData)
      setSelectedMountainId(payload.parsedData.suggestedMountain?.id ?? null)
      setStep('confirm')
    } catch {
      setParseError('网络暂时不可用，请稍后重试。')
      setStep('upload')
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (file) {
      void parseFile(file)
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void parseFile(file)
    }
  }

  function updateEditableData(patch: Partial<ImportedTrackData>) {
    setEditableData((current) => (current ? { ...current, ...patch } : current))
  }

  async function confirmImport() {
    if (!editableData) return

    setStep('submitting')
    setSubmitError(null)
    setAuthRequired(false)

    try {
      const response = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsedData: editableData,
          mountainId: selectedMountainId || undefined,
          note: note.trim() || undefined,
          source: 'track_import',
        }),
      })
      const payload = (await response.json().catch(() => null)) as ConfirmResponse | null

      if (response.status === 401) {
        setAuthRequired(true)
        setSubmitError('登录后即可生成活动记录。')
        setStep('confirm')
        return
      }

      if (!response.ok || !payload?.ok || !payload.checkinId) {
        setSubmitError(payload?.error ?? '生成活动失败，请稍后重试。')
        setStep('confirm')
        return
      }

      setCheckinId(payload.checkinId)
      setStep('success')
    } catch {
      setSubmitError('网络暂时不可用，请稍后重试。')
      setStep('confirm')
    }
  }

  const isBusy = step === 'parsing' || step === 'submitting'
  const content =
    step === 'confirm' || step === 'submitting'
      ? (
          <ConfirmView
            data={editableData}
            elevationPreview={elevationPreview}
            selectedMountainId={selectedMountainId}
            note={note}
            submitError={submitError}
            authRequired={authRequired}
            matchNotice={matchNotice}
            submitting={step === 'submitting'}
            onBack={() => setStep('upload')}
            onUpdate={updateEditableData}
            onNoteChange={setNote}
            onSelectSuggested={() => {
              setSelectedMountainId(editableData?.suggestedMountain?.id ?? null)
              setMatchNotice(null)
            }}
            onSkipMatch={() => {
              setSelectedMountainId(null)
              setMatchNotice('这次活动将作为未关联山峰的导入记录保存。')
            }}
            onModifyMatch={() => {
              setMatchNotice('山峰搜索选择器将在后续批次接入；本轮可保留推荐匹配，或选择不关联山峰。')
            }}
            onConfirm={() => void confirmImport()}
            onLogin={() => router.push(buildLoginHref())}
          />
        )
      : step === 'success'
        ? <SuccessView checkinId={checkinId} onView={() => checkinId && router.push(`/activity/${checkinId}`)} />
        : (
            <UploadView
              selectedFile={selectedFile}
              parseError={parseError}
              authRequired={authRequired}
              parsing={isBusy}
              onBack={() => router.back()}
              onPick={openFilePicker}
              onDrop={handleDrop}
              onRetry={() => selectedFile && void parseFile(selectedFile)}
              onReset={() => {
                resetForNewFile()
                window.setTimeout(openFilePicker, 0)
              }}
              onLogin={() => router.push(buildLoginHref())}
            />
          )

  return (
    <>
      <style>
        {'.import-drop-zone:focus-visible{outline:var(--space-1) solid color-mix(in srgb,var(--color-primary) 32%,transparent);outline-offset:var(--space-1)}.import-field-input::placeholder,.import-note-input::placeholder{color:var(--color-on-surface-variant);opacity:1}'}
      </style>
      <input
        ref={inputRef}
        aria-label="轨迹文件"
        type="file"
        accept=".gpx,.kml,.fit"
        onChange={handleFileInput}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />
      {content}
    </>
  )
}

function UploadView({
  selectedFile,
  parseError,
  authRequired,
  parsing,
  onBack,
  onPick,
  onDrop,
  onRetry,
  onReset,
  onLogin,
}: {
  selectedFile: File | null
  parseError: string | null
  authRequired: boolean
  parsing: boolean
  onBack: () => void
  onPick: () => void
  onDrop: (event: DragEvent<HTMLButtonElement>) => void
  onRetry: () => void
  onReset: () => void
  onLogin: () => void
}) {
  const extension = selectedFile ? getFileExtension(selectedFile.name).toUpperCase() : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <TopBar
        title="导入记录"
        leftAction={<IconButton ariaLabel="返回" icon={<BackIcon />} onClick={onBack} />}
      />
      <main
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: 'var(--space-6)',
          padding: 'var(--space-4)',
          minWidth: 0,
        }}
      >
        <section style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <h1
            style={{
              margin: 0,
              color: 'var(--color-on-surface)',
              fontSize: 'var(--font-title-m-size)',
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 'var(--font-title-m-weight)',
            }}
          >
            上传你的轨迹文件
          </h1>
          <p
            style={{
              margin: 0,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-body-m-size)',
              lineHeight: 'var(--font-body-m-line)',
              fontWeight: 'var(--font-body-m-weight)',
            }}
          >
            支持 GPX、KML、FIT 格式。系统会提取距离、时长、海拔与轨迹点，并尝试匹配山峰。
          </p>
        </section>

        <button
          type="button"
          className="import-drop-zone"
          onClick={onPick}
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
          style={{
            appearance: 'none',
            width: '100%',
            minHeight: 210,
            border: '1.5px dashed var(--color-outline)',
            borderRadius: 'var(--radius-lg)',
            background: 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
            color: 'inherit',
            padding: 'var(--space-6) var(--space-4)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
          }}
        >
          <span style={{ display: 'grid', gap: 'var(--space-3)', justifyItems: 'center' }}>
            <span
              style={{
                width: 58,
                height: 58,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 'var(--radius-lg)',
                background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-primary) 24%, transparent)',
                color: 'var(--color-success)',
              }}
            >
              <ShareIcon size={28} />
            </span>
            <span
              style={{
                color: 'var(--color-on-surface)',
                fontSize: 'var(--font-title-l-size)',
                lineHeight: 'var(--font-title-l-line)',
                fontWeight: 'var(--font-title-l-weight)',
              }}
            >
              点击选择文件
            </span>
            <span
              style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-m-size)',
                lineHeight: 'var(--font-label-m-line)',
                fontWeight: 'var(--font-label-m-weight)',
              }}
            >
              或拖放 GPX / KML / FIT 到这里
            </span>
          </span>
        </button>

        {selectedFile ? (
          <Card>
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 'var(--radius-md)',
                    background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                    color: 'var(--color-success)',
                    flex: '0 0 auto',
                  }}
                >
                  <GpsIcon size={22} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--color-on-surface)',
                      fontSize: 'var(--font-title-m-size)',
                      lineHeight: 'var(--font-title-m-line)',
                      fontWeight: 600,
                    }}
                  >
                    {selectedFile.name}
                  </div>
                  <div
                    style={{
                      marginTop: 'var(--space-1)',
                      color: 'var(--color-on-surface-variant)',
                      fontFamily: "'IBM Plex Mono', Menlo, monospace",
                      fontSize: 'var(--font-label-s-size)',
                      lineHeight: 'var(--font-label-s-line)',
                    }}
                  >
                    {formatFileSize(selectedFile.size)} · {extension}
                  </div>
                </div>
                <Chip tone={parseError ? 'error' : 'success'}>
                  {parseError ? '待处理' : '已选择'}
                </Chip>
              </div>
              {parsing ? (
                <StatusMessage tone="success" title="正在解析轨迹文件..." description="读取轨迹点、计算距离和爬升，并尝试匹配山峰。" />
              ) : null}
            </div>
          </Card>
        ) : null}

        {parseError ? (
          <Card>
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <StatusMessage tone={authRequired ? 'warn' : 'error'} title={parseError} description={authRequired ? '导入记录会保存到你的个人档案，需要先登录。' : '请确认文件来自运动 App 或手表导出的轨迹记录。'} />
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {authRequired ? (
                  <PrimaryButton onClick={onLogin}>去登录</PrimaryButton>
                ) : (
                  <>
                    <PrimaryButton onClick={onReset}>选择其他文件</PrimaryButton>
                    {selectedFile ? <SecondaryButton onClick={onRetry}>重试解析</SecondaryButton> : null}
                  </>
                )}
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div>
              <div
                style={{
                  color: 'var(--color-on-surface)',
                  fontSize: 'var(--font-title-m-size)',
                  lineHeight: 'var(--font-title-m-line)',
                  fontWeight: 600,
                }}
              >
                支持格式
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                {SUPPORTED_FORMATS.map((format) => (
                  <Chip key={format} tone="success">
                    {format.toUpperCase()}
                  </Chip>
                ))}
              </div>
            </div>
            <FormatRows />
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              fontWeight: 'var(--font-label-s-weight)',
              textAlign: 'center',
            }}
          >
            文件只用于解析，不会保存原始文件
          </div>
          <PrimaryButton onClick={onPick} loading={parsing} style={{ width: '100%' }}>
            选择文件
          </PrimaryButton>
        </div>
      </main>
    </div>
  )
}

function ConfirmView({
  data,
  elevationPreview,
  selectedMountainId,
  note,
  submitError,
  authRequired,
  matchNotice,
  submitting,
  onBack,
  onUpdate,
  onNoteChange,
  onSelectSuggested,
  onSkipMatch,
  onModifyMatch,
  onConfirm,
  onLogin,
}: {
  data: ImportedTrackData | null
  elevationPreview: ReturnType<typeof buildElevationPolyline>
  selectedMountainId: string | null
  note: string
  submitError: string | null
  authRequired: boolean
  matchNotice: string | null
  submitting: boolean
  onBack: () => void
  onUpdate: (patch: Partial<ImportedTrackData>) => void
  onNoteChange: (value: string) => void
  onSelectSuggested: () => void
  onSkipMatch: () => void
  onModifyMatch: () => void
  onConfirm: () => void
  onLogin: () => void
}) {
  if (!data) return null
  const suggested = data.suggestedMountain
  const hasSuggestedMatch = Boolean(suggested)
  const matchSelected = Boolean(suggested?.id && suggested.id === selectedMountainId)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <TopBar
        title="确认导入数据"
        leftAction={<IconButton ariaLabel="返回上传页" icon={<BackIcon />} onClick={onBack} />}
      />
      <main
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: 'var(--space-5)',
          padding: 'var(--space-4)',
          minWidth: 0,
        }}
      >
        <RoutePreviewCard data={data} elevationPreview={elevationPreview} />

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', minWidth: 0 }}>
          <StatTile label="距离" value={formatDistance(data.distanceMeters)} />
          <StatTile label="时长" value={formatDuration(data.durationSeconds)} />
          <StatTile label="累计爬升" value={formatMeters(data.elevationGainMeters)} accent />
          <StatTile label="最高点" value={formatMeters(data.maxElevation)} accent />
        </section>

        <Card>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <SectionTitle title="导入数据" />
            <EditableField
              label="轨迹名"
              value={data.name ?? data.fileName}
              onChange={(value) => onUpdate({ name: value.trim() || undefined })}
            />
            <EditableField
              label="总距离"
              type="number"
              suffix="km"
              value={getNumberInputValue(data.distanceMeters, 1000, 1)}
              onChange={(value) => onUpdate({ distanceMeters: parseOptionalNumber(value, 1000) })}
            />
            <EditableField
              label="时长"
              type="number"
              suffix="分钟"
              value={getNumberInputValue(data.durationSeconds, 60, 0)}
              onChange={(value) => onUpdate({ durationSeconds: parseOptionalNumber(value, 60) })}
            />
            <EditableField
              label="爬升"
              type="number"
              suffix="m"
              value={getNumberInputValue(data.elevationGainMeters)}
              onChange={(value) => onUpdate({ elevationGainMeters: parseOptionalNumber(value) })}
            />
            <EditableField
              label="最高海拔"
              type="number"
              suffix="m"
              value={getNumberInputValue(data.maxElevation)}
              onChange={(value) => onUpdate({ maxElevation: parseOptionalNumber(value) })}
            />
            <EditableField
              label="日期"
              type="date"
              value={toDateInputValue(data.startTime)}
              onChange={(value) => onUpdate({ startTime: value ? `${value}T00:00:00.000Z` : undefined })}
            />
          </div>
        </Card>

        <Card>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <SectionTitle title="山峰匹配" />
            <div
              style={{
                borderRadius: 'var(--radius-md)',
                border: hasSuggestedMatch && matchSelected
                  ? '1px solid color-mix(in srgb, var(--color-primary) 36%, transparent)'
                  : '1px solid var(--color-outline)',
                background: hasSuggestedMatch && matchSelected
                  ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
                  : 'color-mix(in srgb, var(--color-on-surface) 3%, transparent)',
                padding: 'var(--space-4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: 'var(--color-on-surface)',
                      fontSize: 'var(--font-title-m-size)',
                      lineHeight: 'var(--font-title-m-line)',
                      fontWeight: 600,
                    }}
                  >
                    {suggested?.name ?? '暂未匹配到山峰'}
                  </div>
                  <div
                    style={{
                      marginTop: 'var(--space-1)',
                      color: 'var(--color-on-surface-variant)',
                      fontSize: 'var(--font-label-m-size)',
                      lineHeight: 'var(--font-label-m-line)',
                    }}
                  >
                    {suggested
                      ? `距离轨迹最高点约 ${Math.max(1, Math.round(suggested.distanceMeters / 1000)).toLocaleString('zh-CN')} km`
                      : '可以先保存为未关联山行，之后再整理。'}
                  </div>
                </div>
                {matchSelected ? <Chip tone="success">已选择</Chip> : <Chip>未关联</Chip>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              <SecondaryButton onClick={onModifyMatch} style={{ width: '100%' }}>
                修改匹配
              </SecondaryButton>
              <SecondaryButton onClick={onSkipMatch} style={{ width: '100%' }}>
                不关联
              </SecondaryButton>
            </div>
            {hasSuggestedMatch && !matchSelected ? (
              <SecondaryButton onClick={onSelectSuggested} style={{ width: '100%' }}>
                使用推荐匹配
              </SecondaryButton>
            ) : null}
            {matchNotice ? <StatusMessage tone="warn" title={matchNotice} /> : null}
          </div>
        </Card>

        <Card>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <SectionTitle title="来源标签" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <SourceLabel type="uploaded" size="md" />
              <span
                style={{
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 'var(--font-label-m-size)',
                  lineHeight: 'var(--font-label-m-line)',
                }}
              >
                轨迹导入活动会以 UPLOADED 标识展示
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <span
              style={{
                color: 'var(--color-on-surface)',
                fontSize: 'var(--font-title-m-size)',
                lineHeight: 'var(--font-title-m-line)',
                fontWeight: 600,
              }}
            >
              备注
            </span>
            <textarea
              className="import-note-input"
              value={note}
              maxLength={240}
              onChange={(event) => onNoteChange(event.currentTarget.value)}
              placeholder="给这次山行补一句话，可选"
              style={{
                width: '100%',
                minHeight: 96,
                resize: 'vertical',
                border: '1px solid var(--color-outline)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                color: 'var(--color-on-surface)',
                padding: 'var(--space-3)',
                fontSize: 'var(--font-body-m-size)',
                lineHeight: 'var(--font-body-m-line)',
              }}
            />
            <span
              style={{
                justifySelf: 'end',
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-s-size)',
                lineHeight: 'var(--font-label-s-line)',
              }}
            >
              {note.length}/240
            </span>
          </label>
        </Card>

        {submitError ? (
          <Card>
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <StatusMessage tone={authRequired ? 'warn' : 'error'} title={submitError} />
              {authRequired ? <PrimaryButton onClick={onLogin}>去登录</PrimaryButton> : null}
            </div>
          </Card>
        ) : null}

        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <PrimaryButton onClick={onConfirm} loading={submitting} style={{ width: '100%' }}>
            确认并生成活动
          </PrimaryButton>
          <p
            style={{
              margin: 0,
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
              textAlign: 'center',
            }}
          >
            确认后将生成活动记录，可在活动详情中继续补充照片和分享。
          </p>
        </div>
      </main>
    </div>
  )
}

function SuccessView({
  checkinId,
  onView,
}: {
  checkinId: string | null
  onView: () => void
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <TopBar title="导入完成" />
      <main
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          padding: 'var(--space-4)',
        }}
      >
        <Card>
          <div style={{ display: 'grid', gap: 'var(--space-4)', justifyItems: 'center', textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 'var(--radius-pill)',
                background: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
                color: 'var(--color-success)',
                border: '1px solid color-mix(in srgb, var(--color-primary) 32%, transparent)',
              }}
            >
              <CheckIcon size={30} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  color: 'var(--color-on-surface)',
                  fontSize: 'var(--font-headline-m-size)',
                  lineHeight: 'var(--font-headline-m-line)',
                  fontWeight: 'var(--font-headline-m-weight)',
                }}
              >
                已生成活动
              </h1>
              <p
                style={{
                  margin: 'var(--space-2) 0 0',
                  color: 'var(--color-on-surface-variant)',
                  fontSize: 'var(--font-body-m-size)',
                  lineHeight: 'var(--font-body-m-line)',
                }}
              >
                这条导入记录已经带回你的活动档案。
              </p>
            </div>
            <PrimaryButton onClick={onView} disabled={!checkinId}>
              立即查看活动
            </PrimaryButton>
          </div>
        </Card>
      </main>
    </div>
  )
}

function RoutePreviewCard({
  data,
  elevationPreview,
}: {
  data: ImportedTrackData
  elevationPreview: ReturnType<typeof buildElevationPolyline>
}) {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'center' }}>
          <SectionTitle title="轨迹预览" />
          <Chip tone="success">{data.format.toUpperCase()}</Chip>
        </div>
        <div
          style={{
            height: 158,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            background: 'linear-gradient(180deg, var(--color-surface-elevated), var(--color-surface))',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {elevationPreview ? (
            <svg viewBox="0 0 320 118" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <g stroke="var(--color-outline)" strokeWidth="0.6" opacity="0.55">
                <line x1="0" y1="30" x2="320" y2="30" />
                <line x1="0" y1="62" x2="320" y2="62" />
                <line x1="0" y1="94" x2="320" y2="94" />
              </g>
              <path d={elevationPreview.fillPath} fill="color-mix(in srgb, var(--color-primary) 14%, transparent)" />
              <polyline points={elevationPreview.line} fill="none" stroke="var(--color-success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--color-on-surface-variant)',
                fontSize: 'var(--font-label-m-size)',
                lineHeight: 'var(--font-label-m-line)',
                textAlign: 'center',
                padding: 'var(--space-4)',
              }}
            >
              已读取 {data.trackPoints.length.toLocaleString('zh-CN')} 个轨迹点
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              left: 'var(--space-3)',
              right: 'var(--space-3)',
              bottom: 'var(--space-3)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 'var(--space-2)',
              color: 'var(--color-on-surface-variant)',
              fontFamily: "'IBM Plex Mono', Menlo, monospace",
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            <span>{formatMeters(elevationPreview?.min ?? data.minElevation)}</span>
            <span>{data.trackPoints.length.toLocaleString('zh-CN')} pts</span>
            <span>{formatMeters(elevationPreview?.max ?? data.maxElevation)}</span>
          </div>
        </div>
        <div
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 'var(--font-label-s-line)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.fileName} · {formatDate(data.startTime)}
        </div>
      </div>
    </Card>
  )
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'date'
  suffix?: string
}) {
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: '82px minmax(0, 1fr) auto',
        gap: 'var(--space-2)',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <span
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
          fontWeight: 'var(--font-label-m-weight)',
        }}
      >
        {label}
      </span>
      <input
        className="import-field-input"
        type={type}
        value={value}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 'any' : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          width: '100%',
          minWidth: 0,
          border: '1px solid var(--color-outline)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface)',
          color: 'var(--color-on-surface)',
          padding: 'var(--space-2)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
        }}
      />
      <span
        style={{
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
          minWidth: suffix ? 28 : 0,
        }}
      >
        {suffix}
      </span>
    </label>
  )
}

function FormatRows() {
  const rows = [
    ['GPX', '高驰 / Suunto / Strava 导出的标准轨迹'],
    ['KML', '两步路 / Google Earth 的路线文件'],
    ['FIT', '佳明 / 高驰等运动设备记录'],
  ]

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      {rows.map(([label, description]) => (
        <div
          key={label}
          style={{
            display: 'grid',
            gridTemplateColumns: '52px minmax(0, 1fr)',
            gap: 'var(--space-3)',
            alignItems: 'center',
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
          }}
        >
          <span
            style={{
              color: 'var(--color-on-surface)',
              fontFamily: "'IBM Plex Mono', Menlo, monospace",
              fontWeight: 700,
            }}
          >
            {label}
          </span>
          <span>{description}</span>
        </div>
      ))}
    </div>
  )
}

function StatusMessage({
  tone,
  title,
  description,
}: {
  tone: 'success' | 'warn' | 'error'
  title: string
  description?: string
}) {
  const color =
    tone === 'success'
      ? 'var(--color-success)'
      : tone === 'warn'
        ? 'var(--color-warning)'
        : 'var(--color-error)'

  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', minWidth: 0 }}>
      <span
        style={{
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
          borderRadius: 'var(--radius-sm)',
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
        }}
      >
        {tone === 'success' ? <CheckIcon size={18} /> : <WarnIcon size={18} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        {description ? (
          <span
            style={{
              display: 'block',
              marginTop: 'var(--space-1)',
              color: 'var(--color-on-surface-variant)',
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            {description}
          </span>
        ) : null}
      </span>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2
      style={{
        margin: 0,
        color: 'var(--color-on-surface)',
        fontSize: 'var(--font-title-m-size)',
        lineHeight: 'var(--font-title-m-line)',
        fontWeight: 600,
      }}
    >
      {title}
    </h2>
  )
}
