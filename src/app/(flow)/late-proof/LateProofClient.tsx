'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { BackIcon } from '@/components/ui/Icons'
import { HelpTrigger } from '@/components/help/HelpTrigger'
import {
  buildLateProofExifRows,
  formatFileSize,
  parseLateProofExif,
  type LateProofExifData,
  type LateProofExifRow,
} from '@/lib/exif-utils'

type LateProofViewState = 'intro' | 'upload' | 'pending' | 'submitted'

type LateProofClientProps = {
  mountainId: string
  mountainName: string
  altitude: string | null
  summitDate: string | null
  mountainLat: number | null
  mountainLng: number | null
}

type ProofType = {
  icon: 'photo' | 'track' | 'note'
  title: string
  description: string
}

const PROOF_TYPES: ProofType[] = [
  {
    icon: 'photo',
    title: '登顶照片',
    description: '一张就够 · 含可识别的峰顶标志最好',
  },
  {
    icon: 'track',
    title: '第三方轨迹文件',
    description: 'GPX / KML · 来自其他记录工具',
  },
  {
    icon: 'note',
    title: '一段亲历说明',
    description: '时间、路线、同行者 · 由你自己讲',
  },
]

function ProofIcon({ type }: { type: ProofType['icon'] }) {
  if (type === 'photo') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }

  if (type === 'track') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M4 18l5-12 4 7 7-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UploadCameraIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function ExifStatusIcon({ status }: { status: LateProofExifRow['status'] }) {
  if (status === 'ok') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function TopBar({
  mountainName,
  right,
  onBack,
}: {
  mountainName: string
  right?: ReactNode
  onBack?: () => void
}) {
  const router = useRouter()

  return (
    <header className="lp-topbar">
      <button type="button" className="lp-topbar__back" aria-label="返回" onClick={onBack ?? (() => router.back())}>
        <BackIcon size={20} />
      </button>
      <div className="lp-topbar__title">补登记 · {mountainName}</div>
      {right ? <div className="lp-topbar__step">{right}</div> : <div className="lp-topbar__spacer" aria-hidden="true" />}
    </header>
  )
}

function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className="lp-section-header">{children}</h2>
}

function ProofTypeRow({ proofType, last }: { proofType: ProofType; last: boolean }) {
  return (
    <div className="lp-proof-row" data-last={last ? 'true' : 'false'}>
      <div className="lp-proof-icon">
        <ProofIcon type={proofType.icon} />
      </div>
      <div className="lp-proof-copy">
        <div className="lp-proof-title">{proofType.title}</div>
        <div className="lp-proof-desc">{proofType.description}</div>
      </div>
      <div className="lp-proof-chevron">
        <ChevronIcon />
      </div>
    </div>
  )
}

function IntroView({
  summitDate,
  onStart,
}: {
  summitDate: string | null
  onStart: () => void
}) {
  const dateLabel = summitDate ? `${summitDate} · 登顶日` : '未记录日期 · 登顶日'

  return (
    <>
      <main className="lp-content">
        <section className="lp-hero" aria-labelledby="late-proof-title">
          <div className="lp-date-label">{dateLabel}</div>
          <h1 id="late-proof-title" className="lp-title">
            把这次山行记进来
          </h1>
          <p className="lp-intro-copy">
            当时没有用 Peak Trekker 记录也没关系。
            <br />
            提交一张登顶照与几行说明 · 我们会以「补登记」
            <br />
            的形式收录到你的山行档案里。
          </p>
        </section>

        <SectionHeader>留证可以是这些</SectionHeader>
        <section className="lp-section-shell" aria-label="留证可以是这些">
          <div className="lp-proof-card">
            {PROOF_TYPES.map((proofType, index) => (
              <ProofTypeRow key={proofType.title} proofType={proofType} last={index === PROOF_TYPES.length - 1} />
            ))}
          </div>
        </section>

        <SectionHeader>关于真实性</SectionHeader>
        <section className="lp-section-shell" aria-label="关于真实性">
          <div className="lp-truth-card">
            <p>
              补登记会清晰地标记为<strong>「用户自报」</strong>。
              <br />
              我们不会判定真伪 · 但会让你和山友看到这是在事后补充的记录。
            </p>
          </div>
        </section>

        <div className="lp-bottom-spacer" aria-hidden="true" />
      </main>

      <div className="lp-sticky-bottom">
        <button type="button" className="lp-primary-btn" onClick={onStart}>
          开始补登记
        </button>
        <div className="lp-hint">大约需要 2 分钟</div>
      </div>
    </>
  )
}

function ExifRow({ row, last }: { row: LateProofExifRow; last: boolean }) {
  return (
    <div className="lp-exif-row" data-last={last ? 'true' : 'false'}>
      <div className={`lp-exif-icon lp-exif-icon--${row.status}`}>
        <ExifStatusIcon status={row.status} />
      </div>
      <div className="lp-exif-label">{row.label}</div>
      <div className="lp-exif-value">{row.value}</div>
    </div>
  )
}

function UploadView({
  selectedFile,
  previewUrl,
  exifData,
  exifLoading,
  userNote,
  exifRows,
  fileInputRef,
  onFileChange,
  onFilePick,
  onNoteChange,
  onSubmit,
}: {
  selectedFile: File | null
  previewUrl: string | null
  exifData: LateProofExifData | null
  exifLoading: boolean
  userNote: string
  exifRows: LateProofExifRow[]
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onFilePick: () => void
  onNoteChange: (value: string) => void
  onSubmit: () => void
}) {
  const fileMeta = selectedFile
    ? `${formatFileSize(selectedFile.size)} · ${fileTimeLabel(exifLoading, exifData)}`
    : ''

  return (
    <>
      <main className="lp-content">
        <section className="lp-upload-head" aria-labelledby="late-proof-upload-title">
          <h1 id="late-proof-upload-title" className="lp-upload-title">
            放一张你登顶时的照片
          </h1>
          <p className="lp-upload-subtitle">有山顶标志或合影都好 · 单张即可，不需多张</p>
        </section>

        <section className="lp-upload-shell" aria-label="照片上传">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="lp-file-input"
            onChange={onFileChange}
          />
          {selectedFile && previewUrl ? (
            <div className="lp-photo-preview lp-fade-in">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob previews cannot be optimized by next/image */}
              <img className="lp-photo-preview__image" src={previewUrl} alt="登顶照片预览" />
              <div className="lp-photo-preview__scrim" aria-hidden="true" />
              <div className="lp-photo-preview__meta">
                <div className="lp-photo-preview__copy">
                  <div className="lp-photo-preview__name">{selectedFile.name}</div>
                  <div className="lp-photo-preview__info">{fileMeta}</div>
                </div>
                <button type="button" className="lp-change-photo-btn" onClick={onFilePick}>
                  更换
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="lp-upload-dropzone" onClick={onFilePick}>
              <span className="lp-upload-dropzone__icon">
                <UploadCameraIcon />
              </span>
              <span className="lp-upload-dropzone__title">点击选择一张照片</span>
              <span className="lp-upload-dropzone__hint">支持 JPG / PNG / HEIC</span>
            </button>
          )}
        </section>

        {selectedFile ? (
          <>
            <SectionHeader>从这张照片读到了</SectionHeader>
            <section className="lp-section-shell" aria-label="从这张照片读到了">
              <div className="lp-exif-card">
                {exifLoading ? (
                  <ExifRow
                    row={{
                      key: 'metadata',
                      status: 'warn',
                      label: '照片信息',
                      value: '正在读取拍摄信息',
                    }}
                    last
                  />
                ) : (
                  exifRows.map((row, index) => (
                    <ExifRow key={row.key} row={row} last={index === exifRows.length - 1} />
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}

        <section className="lp-note-shell" aria-label="补登记说明">
          <textarea
            className="lp-note-input"
            placeholder="想说点什么吗？路线、同行者、当天的状态… 一两行就好。"
            value={userNote}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </section>

        <div className="lp-bottom-spacer" aria-hidden="true" />
      </main>

      <div className="lp-sticky-bottom">
        <button type="button" className="lp-primary-btn" disabled={!selectedFile} onClick={onSubmit}>
          提交补登记
        </button>
        <div className="lp-hint">提交后会标记为「用户自报 · 待生效」</div>
      </div>
    </>
  )
}

function PendingClockIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="var(--color-on-surface-variant)" strokeWidth="1.5" />
      <path d="M12 7v5l3 2" stroke="var(--color-on-surface)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function VerifiedTag({ helpAnchor }: { helpAnchor?: string }) {
  const tag = (
    <span className="lp-verified-tag">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
        <path d="M3 6l2 2 4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      用户自报
    </span>
  )

  if (!helpAnchor) return tag

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
      {tag}
      <HelpTrigger anchor={helpAnchor} size={14} style={{ width: 28, height: 28 }} />
    </span>
  )
}

type TimelineState = 'done' | 'active' | 'future'

function TimelineRow({
  state,
  label,
  sub,
  last,
}: {
  state: TimelineState
  label: string
  sub: string
  last?: boolean
}) {
  return (
    <div className="lp-timeline-row" data-state={state} data-last={last ? 'true' : 'false'}>
      <div className="lp-timeline-marker" aria-hidden="true">
        <span className="lp-timeline-dot" />
        {!last ? <span className="lp-timeline-line" /> : null}
      </div>
      <div className="lp-timeline-copy">
        <div className="lp-timeline-label">{label}</div>
        <div className="lp-timeline-sub">{sub}</div>
      </div>
    </div>
  )
}

function PendingView({
  mountainName,
  altitude,
  summitDate,
  previewUrl,
  exifData,
  userNote,
}: {
  mountainName: string
  altitude: string | null
  summitDate: string | null
  previewUrl: string | null
  exifData: LateProofExifData | null
  userNote: string
}) {
  const summitTitle = altitude ? `${mountainName} · ${altitude}m` : mountainName
  const submittedAtLabel = pendingSummitDateLabel(exifData?.dateTime, summitDate)
  const trimmedNote = userNote.trim()

  return (
    <main className="lp-content">
      <section className="lp-pending-hero" aria-labelledby="late-proof-pending-title">
        <div className="lp-pending-icon">
          <div className="lp-pending-pulse" aria-hidden="true" />
          <PendingClockIcon />
        </div>
        <h1 id="late-proof-pending-title" className="lp-pending-title">
          已收到，正在整理
        </h1>
        <p className="lp-pending-copy">
          这次补登记会以「用户自报」的形式收录。
          <br />
          通常 24 小时内会出现在你的山行档案里。
        </p>
      </section>

      <SectionHeader>这一次提交</SectionHeader>
      <section className="lp-section-shell" aria-label="这一次提交">
        <div className="lp-submission-card">
          <div className="lp-submission-main">
            <div className="lp-submission-thumb">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob previews cannot be optimized by next/image
                <img src={previewUrl} alt="补登记照片缩略图" />
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
            <div className="lp-submission-info">
              <div className="lp-submission-title">{summitTitle}</div>
              <div className="lp-submission-time">{submittedAtLabel}</div>
            </div>
            <VerifiedTag helpAnchor="review.what-is-review" />
          </div>
          {trimmedNote ? <div className="lp-submission-note">{trimmedNote}</div> : null}
        </div>
      </section>

      <SectionHeader>之后会发生什么</SectionHeader>
      <section className="lp-timeline-shell" aria-label="之后会发生什么">
        <div className="lp-timeline-card">
          <TimelineRow state="done" label="提交已收到" sub="刚刚 · 你这边已完成" />
          <TimelineRow state="active" label="进入档案整理" sub="约 24 小时内 · 自动处理" />
          <TimelineRow state="future" label="出现在你的山行档案" sub="标记为「用户自报」" last />
        </div>
      </section>
    </main>
  )
}

function SubmittedCheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        className="lp-submitted-check-path"
        d="M5 12.5l4 4 10-10"
        stroke="var(--color-success)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ActivityPreviewPlaceholder() {
  return (
    <div className="lp-activity-preview__placeholder" aria-hidden="true">
      <svg width="132" height="58" viewBox="0 0 132 58" fill="none" focusable="false">
        <path
          d="M4 48L26 28L42 38L61 14L83 34L101 22L128 48"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 50L45 34L65 42L83 24L113 48"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>
    </div>
  )
}

function SubmittedView({
  mountainName,
  altitude,
  summitDate,
  previewUrl,
  onViewRecord,
  onSubmitAnother,
  onArchive,
}: {
  mountainName: string
  altitude: string | null
  summitDate: string | null
  previewUrl: string | null
  onViewRecord: () => void
  onSubmitAnother: () => void
  onArchive: () => void
}) {
  const year = submittedYearLabel(summitDate)
  const dateAltitudeLabel = submittedDateAltitudeLabel(summitDate, altitude)

  return (
    <main className="lp-content">
      <section className="lp-submitted-hero" aria-labelledby="late-proof-submitted-title">
        <div className="lp-submitted-icon">
          <SubmittedCheckIcon />
        </div>
        <h1 id="late-proof-submitted-title" className="lp-submitted-title">
          已收录到你的档案
        </h1>
        <p className="lp-submitted-copy">{year} 年的第 3 次登顶 · 已加入你的山行档案。</p>
      </section>

      <section className="lp-activity-preview-shell" aria-label="补登记活动预览">
        <div className="lp-activity-preview-card">
          <div className="lp-activity-preview-photo">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob previews cannot be optimized by next/image
              <img src={previewUrl} alt="补登记活动预览" />
            ) : (
              <ActivityPreviewPlaceholder />
            )}
            <div className="lp-activity-preview-scrim" aria-hidden="true" />
            <div className="lp-activity-preview-meta">
              <div className="lp-activity-preview-copy">
                <div className="lp-activity-preview-name">{mountainName}</div>
                <div className="lp-activity-preview-sub">{dateAltitudeLabel}</div>
              </div>
              <VerifiedTag />
            </div>
          </div>
        </div>
      </section>

      <section className="lp-submitted-actions" aria-label="补登记完成操作">
        <button type="button" className="lp-primary-btn" onClick={onViewRecord}>
          查看这次记录
        </button>
        <div className="lp-submitted-secondary-grid">
          <button type="button" className="lp-secondary-btn" onClick={onSubmitAnother}>
            再补一次
          </button>
          <button type="button" className="lp-secondary-btn" onClick={onArchive}>
            回到档案
          </button>
        </div>
      </section>
    </main>
  )
}

export default function LateProofClient({
  mountainName,
  altitude,
  summitDate,
  mountainLat,
  mountainLng,
}: LateProofClientProps) {
  const router = useRouter()
  const [viewState, setViewState] = useState<LateProofViewState>('intro')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [exifData, setExifData] = useState<LateProofExifData | null>(null)
  const [exifLoading, setExifLoading] = useState(false)
  const [userNote, setUserNote] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const exifRequestIdRef = useRef(0)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (viewState !== 'pending') return undefined

    const timer = window.setTimeout(() => {
      setViewState('submitted')
    }, 2400)

    return () => window.clearTimeout(timer)
  }, [viewState])

  const exifRows = useMemo(
    () =>
      buildLateProofExifRows({
        exifData,
        mountainName,
        altitude,
        mountainLat,
        mountainLng,
      }),
    [altitude, exifData, mountainLat, mountainLng, mountainName],
  )

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const requestId = exifRequestIdRef.current + 1
    exifRequestIdRef.current = requestId
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setExifData(null)
    setExifLoading(true)

    try {
      const parsedExif = await parseLateProofExif(file)
      if (exifRequestIdRef.current === requestId) {
        setExifData(parsedExif)
      }
    } catch {
      if (exifRequestIdRef.current === requestId) {
        setExifData({ hasFullMetadata: false })
      }
    } finally {
      if (exifRequestIdRef.current === requestId) {
        setExifLoading(false)
      }
    }
  }

  function handleFilePick() {
    fileInputRef.current?.click()
  }

  function resetFlow() {
    exifRequestIdRef.current += 1
    setSelectedFile(null)
    setPreviewUrl(null)
    setExifData(null)
    setExifLoading(false)
    setUserNote('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setViewState('intro')
  }

  return (
    <div className="lp-page">
      <TopBar
        mountainName={mountainName}
        right={viewState === 'upload' ? '2 / 3' : undefined}
        onBack={
          viewState === 'upload'
            ? () => setViewState('intro')
            : viewState === 'submitted'
              ? () => router.push('/archive')
              : undefined
        }
      />
      {viewState === 'intro' ? (
        <IntroView summitDate={summitDate} onStart={() => setViewState('upload')} />
      ) : viewState === 'upload' ? (
        <UploadView
          selectedFile={selectedFile}
          previewUrl={previewUrl}
          exifData={exifData}
          exifLoading={exifLoading}
          userNote={userNote}
          exifRows={exifRows}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onFilePick={handleFilePick}
          onNoteChange={setUserNote}
          onSubmit={() => setViewState('pending')}
        />
      ) : viewState === 'pending' ? (
        <PendingView
          mountainName={mountainName}
          altitude={altitude}
          summitDate={summitDate}
          previewUrl={previewUrl}
          exifData={exifData}
          userNote={userNote}
        />
      ) : (
        <SubmittedView
          mountainName={mountainName}
          altitude={altitude}
          summitDate={summitDate}
          previewUrl={previewUrl}
          onViewRecord={() => router.push('/archive')}
          onSubmitAnother={resetFlow}
          onArchive={() => router.push('/archive')}
        />
      )}
    </div>
  )
}

function fileTimeLabel(exifLoading: boolean, exifData: LateProofExifData | null) {
  if (exifLoading) return '正在读取拍摄信息'
  if (exifData?.dateTime) return `拍摄于 ${exifData.dateTime.replace(' · ', ' ')}`
  return '未读取到拍摄时间'
}

function pendingSummitDateLabel(dateTime: string | undefined, summitDate: string | null) {
  const [exifDate, exifTime] = dateTime?.split(' · ') ?? []
  const dateLabel = summitDate || exifDate

  if (dateLabel && exifTime) return `${dateLabel} · ${exifTime} 登顶`
  if (dateLabel) return `${dateLabel} 登顶`
  return '未记录日期 登顶'
}

function submittedYearLabel(summitDate: string | null) {
  const match = summitDate?.match(/^(\d{4})/)
  return match?.[1] ?? String(new Date().getFullYear())
}

function submittedDateAltitudeLabel(summitDate: string | null, altitude: string | null) {
  const dateLabel = summitDate ?? '未记录日期'
  return altitude ? `${dateLabel} · ${altitude}m` : dateLabel
}
