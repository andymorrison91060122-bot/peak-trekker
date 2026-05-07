'use client'

import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OcrResult, ParsedScreenshotFields } from '@/lib/screenshot/types'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { BackIcon, CheckIcon, WarnIcon } from '@/components/ui/Icons'

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
const PROCESSING_MIN_DURATION_MS = 2000
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type ScreenshotStep = 'upload' | 'processing' | 'confirm'
type RecognizeErrorKind = 'auth' | 'too_large' | 'unsupported' | 'network' | 'file'

type RecognizeResult = {
  ok: true
  ocrResult: OcrResult
  parsedFields: ParsedScreenshotFields
}

type RecognizeResponse = {
  ok?: boolean
  ocrResult?: OcrResult
  parsedFields?: ParsedScreenshotFields
  error?: string
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function readImagePreview(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('这张截图暂时无法预览，请换一张再试。'))
      }
    }
    reader.onerror = () => reject(new Error('这张截图暂时无法预览，请换一张再试。'))
    reader.readAsDataURL(file)
  })
}

function buildLoginHref() {
  return `/auth/login?from=${encodeURIComponent('/screenshot')}`
}

function validateImageFile(file: File): { message: string; kind: RecognizeErrorKind } | null {
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return {
      message: '截图文件不能超过 10MB。',
      kind: 'too_large',
    }
  }

  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return {
      message: '仅支持 JPG、PNG 或 WebP 截图。',
      kind: 'unsupported',
    }
  }

  return null
}

function responseKind(status: number): RecognizeErrorKind {
  if (status === 401) return 'auth'
  if (status === 413) return 'too_large'
  if (status === 415) return 'unsupported'
  if (status >= 500) return 'network'
  return 'file'
}

function readableError(message: string, kind: RecognizeErrorKind) {
  if (kind === 'auth') return '登录后才能识别截图。'
  if (/unauthorized/i.test(message)) return '登录后才能识别截图。'
  return message || '这张截图暂时无法识别，请换一张再试。'
}

function ScanGlyph({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M8 16V10a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M40 16V10a2 2 0 0 0-2-2h-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 32v6a2 2 0 0 0 2 2h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M40 32v6a2 2 0 0 1-2 2h-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 24h20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return <CheckIcon size={18} />
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: 12,
        height: 12,
        borderRadius: 'var(--radius-pill)',
        border: '1.5px solid currentColor',
        opacity: state === 'active' ? 0.9 : 0.45,
      }}
    />
  )
}

function SRNavBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        position: 'relative',
      }}
    >
      <button
        type="button"
        aria-label="返回"
        onClick={onBack}
        style={{
          appearance: 'none',
          width: 44,
          height: 44,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-on-surface)',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <BackIcon size={22} />
      </button>
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          color: 'var(--color-on-surface)',
          fontSize: 16,
          lineHeight: 'var(--font-title-m-line)',
          fontWeight: 600,
        }}
      >
        {title}
      </div>
    </header>
  )
}

function BottomActions({ children }: { children: ReactNode }) {
  return (
    <footer
      style={{
        padding: 'var(--space-3) var(--space-5) calc(28px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        background: 'var(--color-surface)',
      }}
    >
      {children}
    </footer>
  )
}

function ScreenshotShell({
  step,
  title = '识别截图',
  onBack,
  children,
  footer,
}: {
  step: ScreenshotStep
  title?: string
  onBack: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div
      data-screenshot-step={step}
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      <SRNavBar title={title} onBack={onBack} />
      {children}
      {footer ? <BottomActions>{footer}</BottomActions> : null}
    </div>
  )
}

function ErrorNotice({
  message,
  authRequired,
  onLogin,
}: {
  message: string
  authRequired: boolean
  onLogin: () => void
}) {
  return (
    <div
      role="alert"
      style={{
        width: '100%',
        maxWidth: 320,
        display: 'grid',
        gridTemplateColumns: '20px minmax(0, 1fr)',
        gap: 'var(--space-2)',
        alignItems: 'start',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
        color: 'var(--color-on-surface)',
        textAlign: 'left',
      }}
    >
      <span style={{ color: 'var(--color-error)' }}>
        <WarnIcon size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
          }}
        >
          {message}
        </div>
        {authRequired ? (
          <button
            type="button"
            onClick={onLogin}
            style={{
              marginTop: 'var(--space-2)',
              appearance: 'none',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-success)',
              padding: 0,
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 'var(--font-label-m-line)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            去登录
          </button>
        ) : null}
      </div>
    </div>
  )
}

function UploadScreen({
  error,
  authRequired,
  onBack,
  onChoose,
  onCamera,
  onHowTo,
  onLogin,
}: {
  error: string | null
  authRequired: boolean
  onBack: () => void
  onChoose: () => void
  onCamera: () => void
  onHowTo: () => void
  onLogin: () => void
}) {
  return (
    <ScreenshotShell
      step="upload"
      onBack={onBack}
      footer={
        <>
          <PrimaryButton onClick={onChoose}>选择照片</PrimaryButton>
          <SecondaryButton onClick={onCamera}>拍照</SecondaryButton>
        </>
      }
    >
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-5) var(--space-6)',
          gap: 18,
          minHeight: 0,
        }}
      >
        <button
          type="button"
          onClick={onChoose}
          style={{
            appearance: 'none',
            width: 'min(280px, 100%)',
            height: 200,
            borderRadius: 'var(--radius-lg)',
            background: 'transparent',
            border: '2px dashed var(--color-outline)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            padding: '0 var(--space-5)',
            cursor: 'pointer',
            color: 'var(--color-on-surface)',
            textAlign: 'center',
          }}
        >
          <span style={{ color: 'var(--color-success)', display: 'grid', placeItems: 'center' }}>
            <ScanGlyph />
          </span>
          <span
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 16,
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 600,
            }}
          >
            上传记录截图
          </span>
          <span
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: 12,
              lineHeight: 1.5,
              maxWidth: 240,
            }}
          >
            支持两步路、六只脚、行者等APP的记录截图
          </span>
        </button>

        <button
          type="button"
          onClick={onHowTo}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            padding: '6px var(--space-2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--color-success)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          如何获取截图？
          <ChevronIcon />
        </button>

        {error ? <ErrorNotice message={error} authRequired={authRequired} onLogin={onLogin} /> : null}
      </main>
    </ScreenshotShell>
  )
}

function StatusRow({
  state,
  label,
}: {
  state: 'done' | 'active' | 'pending'
  label: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span
        style={{
          width: 18,
          height: 18,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          color: state === 'done' ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
        }}
      >
        <StatusIcon state={state} />
      </span>
      <span
        style={{
          color: state === 'done' ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-body-m-size)',
          lineHeight: 'var(--font-body-m-line)',
          fontWeight: state === 'done' ? 500 : 400,
        }}
      >
        {label}
      </span>
    </div>
  )
}

function MockScreenshotPreview() {
  return (
    <div
      data-sr-mock-preview="true"
      style={{
        width: 220,
        aspectRatio: '9 / 16',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-outline)',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-variant) 100%)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 22,
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--color-on-surface-variant)',
          opacity: 0.72,
        }}
      >
        <span style={{ width: 26, height: 4, borderRadius: 'var(--radius-xs)', background: 'var(--color-outline)' }} />
        <span style={{ width: 18, height: 4, borderRadius: 'var(--radius-xs)', background: 'var(--color-outline)' }} />
      </div>

      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ height: 6, width: '70%', background: 'var(--color-outline)', borderRadius: 'var(--radius-xs)' }} />
        <div
          style={{
            height: 4,
            width: '40%',
            background: 'var(--color-outline)',
            borderRadius: 'var(--radius-xs)',
            marginTop: 5,
            opacity: 0.55,
          }}
        />
      </div>

      <div
        style={{
          margin: '0 10px',
          height: 140,
          borderRadius: 'var(--radius-xs)',
          background: 'radial-gradient(ellipse at 30% 40%, var(--color-outline) 0%, var(--color-surface-variant) 60%, var(--color-surface) 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 140"
          fill="none"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0 }}
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M20 110 Q50 80 70 90 T110 60 Q130 45 150 50 T185 25"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            opacity="0.96"
          />
          <circle cx="20" cy="110" r="3" fill="var(--color-success)" />
          <circle cx="185" cy="25" r="3" fill="var(--color-success)" />
        </svg>
      </div>

      <div style={{ padding: '12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
        {[0, 1, 2].map((item) => (
          <div key={item}>
            <div style={{ height: 10, width: '72%', background: 'var(--color-outline)', borderRadius: 'var(--radius-xs)' }} />
            <div
              style={{
                height: 4,
                width: '52%',
                background: 'var(--color-outline)',
                borderRadius: 'var(--radius-xs)',
                marginTop: 4,
                opacity: 0.45,
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[90, 75, 82, 60].map((width) => (
          <div
            key={width}
            style={{
              height: 3,
              width: `${width}%`,
              background: 'var(--color-outline)',
              borderRadius: 'var(--radius-xs)',
              opacity: 0.45,
            }}
          />
        ))}
      </div>

      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '18%',
          height: 2,
          background: 'var(--color-success)',
          boxShadow: '0 0 12px var(--color-success), 0 0 24px color-mix(in srgb, var(--color-success) 50%, transparent)',
          animation: 'sr-scan 2.4s ease-in-out infinite',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(18% - 30px)',
          height: 32,
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--color-success) 12%, transparent) 80%, transparent 100%)',
          animation: 'sr-scan-glow 2.4s ease-in-out infinite',
        }}
      />
    </div>
  )
}

function ProcessingScreen({ onBack }: { onBack: () => void }) {
  return (
    <ScreenshotShell step="processing" onBack={onBack}>
      <style>{`
        @keyframes sr-scan {
          0%, 100% { top: 18%; }
          50% { top: 78%; }
        }
        @keyframes sr-scan-glow {
          0%, 100% { top: calc(18% - 30px); }
          50% { top: calc(78% - 30px); }
        }
        @keyframes sr-pulse {
          0%, 80%, 100% { opacity: .25; transform: scale(.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'var(--space-6) var(--space-4) var(--space-6)',
          minHeight: 0,
        }}
      >
        <MockScreenshotPreview />

        <div style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
          <div
            style={{
              color: 'var(--color-on-surface)',
              fontSize: 16,
              lineHeight: 'var(--font-title-m-line)',
              fontWeight: 600,
            }}
          >
            正在识别你的记录...
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 'var(--space-3)' }}>
            {[0, 1, 2].map((item) => (
              <span
                key={item}
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-success)',
                  animation: 'sr-pulse 1.4s ease-in-out infinite',
                  animationDelay: `${item * 0.18}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            width: '100%',
            maxWidth: 300,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <StatusRow state="done" label="文字信息提取完成" />
          <StatusRow state="active" label="轨迹路线识别中..." />
          <StatusRow state="pending" label="数据整理中..." />
        </div>
      </main>
    </ScreenshotShell>
  )
}

function ConfirmPlaceholder({
  imagePreview,
  result,
  onBack,
}: {
  imagePreview: string | null
  result: RecognizeResult | null
  onBack: () => void
}) {
  return (
    <ScreenshotShell step="confirm" title="确认识别结果" onBack={onBack}>
      <main
        style={{
          flex: 1,
          padding: 'var(--space-6) var(--space-4) var(--space-8)',
          textAlign: 'center',
          minWidth: 0,
        }}
      >
        <p
          style={{
            margin: 0,
            color: 'var(--color-success)',
            fontSize: 'var(--font-title-l-size)',
            lineHeight: 'var(--font-title-l-line)',
            fontWeight: 700,
          }}
        >
          ✓ 识别完成
        </p>
        <p
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            margin: 'var(--space-2) 0 0',
          }}
        >
          Confirm 屏幕将在 Part 2 中实现
        </p>
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- Data URLs from local file input are not compatible with Next image optimization.
          <img
            src={imagePreview}
            alt="识别截图预览"
            style={{
              width: 200,
              maxWidth: '100%',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-outline)',
              marginTop: 'var(--space-4)',
            }}
          />
        ) : null}
        <pre
          style={{
            margin: 'var(--space-4) 0 0',
            padding: 'var(--space-3)',
            maxHeight: 360,
            overflow: 'auto',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-outline)',
            background: 'var(--color-surface-variant)',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-label-s-size)',
            lineHeight: 1.55,
            textAlign: 'left',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      </main>
    </ScreenshotShell>
  )
}

export default function ScreenshotClient() {
  const router = useRouter()
  const albumInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [step, setStep] = useState<ScreenshotStep>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [recognizeResult, setRecognizeResult] = useState<RecognizeResult | null>(null)
  const [recognizeError, setRecognizeError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function recognize(file: File) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const formData = new FormData()
      formData.append('image', file)

      const [response] = await Promise.all([
        fetch('/api/screenshot/recognize', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        }),
        wait(PROCESSING_MIN_DURATION_MS),
      ])

      const payload = (await response.json().catch(() => ({}))) as RecognizeResponse
      if (!response.ok) {
        const kind = responseKind(response.status)
        throw Object.assign(new Error(readableError(payload.error ?? '', kind)), { kind })
      }

      if (!payload.ok || !payload.ocrResult || !payload.parsedFields) {
        throw Object.assign(new Error('这张截图暂时无法识别，请换一张再试。'), { kind: 'file' as RecognizeErrorKind })
      }

      setRecognizeResult({
        ok: true,
        ocrResult: payload.ocrResult,
        parsedFields: payload.parsedFields,
      })
      setStep('confirm')
    } catch (error) {
      if (controller.signal.aborted) return
      const kind = (error instanceof Error && 'kind' in error ? error.kind : 'network') as RecognizeErrorKind
      const message = error instanceof Error ? error.message : '这张截图暂时无法识别，请换一张再试。'
      setRecognizeError(readableError(message, kind))
      setAuthRequired(kind === 'auth')
      setStep('upload')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }

  function resetPreview() {
    abortRef.current?.abort()
    abortRef.current = null
    setImageFile(null)
    setImagePreview(null)
    setRecognizeResult(null)
  }

  function resetToUpload() {
    resetPreview()
    setRecognizeError(null)
    setAuthRequired(false)
    setStep('upload')
  }

  async function handleFile(file: File | null) {
    if (!file) return
    const validation = validateImageFile(file)
    if (validation) {
      resetPreview()
      setRecognizeError(validation.message)
      setAuthRequired(validation.kind === 'auth')
      setStep('upload')
      return
    }

    let nextPreview: string
    try {
      nextPreview = await readImagePreview(file)
    } catch (error) {
      resetPreview()
      setRecognizeError(error instanceof Error ? error.message : '这张截图暂时无法预览，请换一张再试。')
      setAuthRequired(false)
      setStep('upload')
      return
    }

    setImageFile(file)
    setImagePreview(nextPreview)
    setRecognizeResult(null)
    setRecognizeError(null)
    setAuthRequired(false)
    setStep('processing')
    void recognize(file)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    void handleFile(file)
  }

  function handleBack() {
    if (step === 'upload') {
      router.back()
      return
    }

    resetToUpload()
  }

  function openLogin() {
    router.push(buildLoginHref())
  }

  return (
    <>
      <input
        ref={albumInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {step === 'upload' ? (
        <UploadScreen
          error={recognizeError}
          authRequired={authRequired}
          onBack={handleBack}
          onChoose={() => albumInputRef.current?.click()}
          onCamera={() => cameraInputRef.current?.click()}
          onHowTo={() => console.log('Screenshot how-to will be added later')}
          onLogin={openLogin}
        />
      ) : null}

      {step === 'processing' ? <ProcessingScreen onBack={handleBack} /> : null}

      {step === 'confirm' ? (
        <ConfirmPlaceholder imagePreview={imagePreview} result={recognizeResult} onBack={handleBack} />
      ) : null}

      <span data-screenshot-file={imageFile?.name ?? ''} hidden />
    </>
  )
}
