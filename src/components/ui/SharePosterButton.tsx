'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ShareAnchorPosition, ShareCardTemplate, ShareRenderMode } from '@/types'
import { useAppToast } from '@/components/ui/AppToastProvider'
import IconButton from '@/components/ui/IconButton'
import ModalShell from '@/components/ui/ModalShell'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import TertiaryButton from '@/components/ui/TertiaryButton'
import type { BuiltInIconName } from '@/components/ui/internal/buttonIcons'

const POSTER_WIDTH = 1080
const POSTER_HEIGHT = 1920
const DEFAULT_ANCHOR: ShareAnchorPosition = 'top'

type ShareSurfaceMode = 'recommended' | 'classic_card' | 'overlay_only'
const DEFAULT_SURFACE_MODE: ShareSurfaceMode = 'recommended'

type DraftPosterModel = {
  mountainName: string
  altitude: number
  province: string
  username?: string | null
  checkinDate?: string
  note?: string | null
  latitude?: number | null
  longitude?: number | null
  distanceKm?: number | null
  ascentM?: number | null
  durationSec?: number | null
  pace?: string | null
  photoUrl?: string | null
  verified?: boolean
}

type SharePreset = {
  mode: ShareSurfaceMode
  template: ShareCardTemplate
  renderMode: ShareRenderMode
  title: string
  hint: string
  description: string
}

type GeneratedPreviewKind = 'poster' | 'photo_composite'

export type SharePosterButtonHandle = {
  open: () => void
}

function resolvePreviewKind(renderMode: ShareRenderMode): GeneratedPreviewKind {
  return renderMode === 'photo_composite' ? 'photo_composite' : 'poster'
}

async function fetchBlob(url: string) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('生成分享图失败，请稍后重试。')
  }

  const blob = await res.blob()
  const contentType = res.headers.get('Content-Type') || blob.type

  if (contentType && !contentType.startsWith('image/png') && !url.startsWith('blob:')) {
    throw new Error('生成分享图失败，请稍后重试。')
  }

  return blob
}

async function loadImageFromBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('图片加载失败'))
    })
    image.src = objectUrl
    return await promise
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function resolvePhotoBlob(file: File | null, remoteUrl: string | null) {
  if (file) return file
  if (!remoteUrl) return null
  const response = await fetch(remoteUrl)
  if (!response.ok) {
    throw new Error('记录照片读取失败，请重新上传图片。')
  }
  return response.blob()
}

async function composePoster({
  photoBlob,
  overlayBlob,
}: {
  photoBlob: Blob
  overlayBlob: Blob
}) {
  const [photoImage, overlayImage] = await Promise.all([
    loadImageFromBlob(photoBlob),
    loadImageFromBlob(overlayBlob),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('当前浏览器不支持本地图片合成。')
  }

  const scale = Math.max(POSTER_WIDTH / photoImage.width, POSTER_HEIGHT / photoImage.height)
  const drawWidth = photoImage.width * scale
  const drawHeight = photoImage.height * scale
  const drawX = (POSTER_WIDTH - drawWidth) / 2
  const drawY = (POSTER_HEIGHT - drawHeight) / 2

  context.drawImage(photoImage, drawX, drawY, drawWidth, drawHeight)
  context.drawImage(overlayImage, 0, 0, POSTER_WIDTH, POSTER_HEIGHT)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })

  if (!blob) {
    throw new Error('导出合成图失败，请稍后再试。')
  }

  return blob
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

function checkerboardBackground() {
  return {
    backgroundImage:
      'linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)',
    backgroundSize: '24px 24px',
    backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
    backgroundColor: 'var(--color-surface)',
  } as const
}

function isShareAbort(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  const message = error instanceof Error ? error.message : ''
  return /abort/i.test(message)
}

function normalizePosterError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ''
  if (!message) {
    return '生成分享图失败，请稍后重试。'
  }

  if (/failed to fetch|networkerror|load failed|fetch failed|aborterror|aborted|err_failed/i.test(message)) {
    return '生成分享图失败，请稍后重试。'
  }

  return message
}

function choosePreferredTemplate(templates: ShareCardTemplate[]) {
  if (templates.includes('summit_card')) return 'summit_card'
  if (templates.includes('activity_summary')) return 'activity_summary'
  if (templates.includes('trek_snapshot')) return 'trek_snapshot'
  return templates[0]
}

function buildSharePreset({
  mode,
  template,
  recommendedRenderMode,
}: {
  mode: ShareSurfaceMode
  template: ShareCardTemplate
  recommendedRenderMode: ShareRenderMode
}): SharePreset {
  if (mode === 'classic_card') {
    return {
      mode,
      template,
      renderMode: 'classic_card',
      title: '结果卡',
      hint: '不依赖现场照片，直接生成简洁结果卡。',
      description: '适合想要快速发出成绩和核心数据的时候。',
    }
  }

  if (mode === 'overlay_only') {
    return {
      mode,
      template,
      renderMode: 'overlay_only',
      title: '透明水印',
      hint: '透明背景预览，适合导出后在外部工具继续叠加。',
      description: '产品内只保留轻量预览，高级二次加工留给外部工具。',
    }
  }

  const recommendedTitle = recommendedRenderMode === 'photo_composite' ? '推荐分享图' : '推荐结果卡'
  const recommendedHint =
    recommendedRenderMode === 'photo_composite'
      ? '已优先使用现场照片合成分享图，打开后就能直接分享。'
      : '当前没有可用现场照片，已自动切到结果卡。'

  return {
    mode,
    template,
    renderMode: recommendedRenderMode,
    title: recommendedTitle,
    hint: recommendedHint,
    description:
      recommendedRenderMode === 'photo_composite'
        ? '系统会优先帮你生成最适合直接发出的照片合成版本。'
        : '如果稍后补上现场照片，推荐预览会自动切成照片合成。',
  }
}

function appendDraftPosterParams(
  url: string,
  draftPoster: DraftPosterModel | null,
  {
    template,
    renderMode,
    anchorPosition,
  }: {
    template: ShareCardTemplate
    renderMode: ShareRenderMode
    anchorPosition: ShareAnchorPosition
  }
) {
  if (!draftPoster) {
    return `${url}?checkinId=demo&template=${template}&renderMode=${renderMode}&anchorPosition=${anchorPosition}`
  }

  const searchParams = new URLSearchParams({
    checkinId: 'demo',
    template,
    renderMode,
    anchorPosition,
    mountainName: draftPoster.mountainName,
    altitude: String(draftPoster.altitude),
    province: draftPoster.province,
    username: draftPoster.username?.trim() || 'Peak Trekker',
    checkinDate: draftPoster.checkinDate || new Date().toISOString(),
    note: draftPoster.note?.trim() || '',
    verified: draftPoster.verified ? '1' : '0',
  })

  if (typeof draftPoster.latitude === 'number') {
    searchParams.set('latitude', String(draftPoster.latitude))
  }
  if (typeof draftPoster.longitude === 'number') {
    searchParams.set('longitude', String(draftPoster.longitude))
  }
  if (typeof draftPoster.distanceKm === 'number') {
    searchParams.set('distanceKm', String(draftPoster.distanceKm))
  }
  if (typeof draftPoster.ascentM === 'number') {
    searchParams.set('ascentM', String(draftPoster.ascentM))
  }
  if (typeof draftPoster.durationSec === 'number') {
    searchParams.set('durationSec', String(Math.max(0, Math.round(draftPoster.durationSec))))
  }
  if (draftPoster.pace?.trim()) {
    searchParams.set('pace', draftPoster.pace.trim())
  }

  return `/api/poster?${searchParams.toString()}`
}

function buildExportFilename({
  mountainName,
  template,
  renderMode,
}: {
  mountainName: string
  template: ShareCardTemplate
  renderMode: ShareRenderMode
}) {
  return `peak-trekker-${mountainName}-${template}-${renderMode}.png`
}

export type SharePosterButtonProps = {
  checkinId: string
  mountainName: string
  allowedTemplates?: ShareCardTemplate[]
  buttonLabel?: string
  demoMode?: boolean
  defaultRenderMode?: ShareRenderMode
  previewSuccessMessage?: string
  draftPoster?: DraftPosterModel | null
  autoPreviewOnOpen?: boolean
  onFlowStateChange?: (state: 'preview' | 'shared' | 'idle') => void
  initialPhotoUrl?: string | null
  triggerMode?: 'legacy-text' | 'icon'
  triggerAriaLabel?: string
  triggerIcon?: BuiltInIconName
  triggerIconVariant?: 'plain' | 'filled'
  useTokenFooter?: boolean
}

const SharePosterButton = forwardRef<SharePosterButtonHandle, SharePosterButtonProps>(function SharePosterButton({
  checkinId,
  mountainName,
  allowedTemplates,
  buttonLabel = '生成分享素材',
  demoMode = false,
  defaultRenderMode = 'photo_composite',
  previewSuccessMessage,
  draftPoster = null,
  autoPreviewOnOpen = false,
  onFlowStateChange,
  initialPhotoUrl = null,
  triggerMode = 'legacy-text',
  triggerAriaLabel,
  triggerIcon = 'share',
  triggerIconVariant = 'filled',
  useTokenFooter: _useTokenFooter = false,
}: SharePosterButtonProps, ref) {
  const { showToast } = useAppToast()
  const availableTemplates = useMemo(
    () => (allowedTemplates?.length ? allowedTemplates : (['trek_snapshot', 'summit_card', 'activity_summary'] as ShareCardTemplate[])),
    [allowedTemplates]
  )
  const preferredTemplate = useMemo(() => choosePreferredTemplate(availableTemplates), [availableTemplates])

  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const lastGeneratedPreviewRef = useRef(0)
  const nextPreviewRequestRef = useRef(0)
  const latestGenerationRequestRef = useRef(0)
  const generatedOutputBlobRef = useRef<Blob | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedMode, setSelectedMode] = useState<ShareSurfaceMode>(DEFAULT_SURFACE_MODE)
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null)
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(initialPhotoUrl ?? null)
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [overlayExportUrl, setOverlayExportUrl] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [previewNonce, setPreviewNonce] = useState(0)

  useEffect(() => {
    setExistingPhotoUrl(initialPhotoUrl ?? null)
  }, [initialPhotoUrl])

  useEffect(() => {
    if (!selectedPhotoFile) {
      setLocalPhotoUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      return
    }

    const nextUrl = URL.createObjectURL(selectedPhotoFile)
    setLocalPhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return nextUrl
    })

    return () => {
      URL.revokeObjectURL(nextUrl)
    }
  }, [selectedPhotoFile])

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl)
      if (overlayExportUrl) URL.revokeObjectURL(overlayExportUrl)
      if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl)
    }
  }, [localPhotoUrl, outputUrl, overlayExportUrl])

  useEffect(() => {
    if (!moreOpen) return

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (moreMenuRef.current?.contains(target)) return
      setMoreOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMoreOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('touchstart', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [moreOpen])

  const hasPreferredPhoto = Boolean(selectedPhotoFile || existingPhotoUrl || draftPoster?.photoUrl)
  const recommendedRenderMode =
    defaultRenderMode === 'classic_card' ? 'classic_card' : hasPreferredPhoto ? 'photo_composite' : 'classic_card'
  const activePreset = useMemo(
    () =>
      buildSharePreset({
        mode: selectedMode,
        template: preferredTemplate,
        recommendedRenderMode,
      }),
    [preferredTemplate, recommendedRenderMode, selectedMode]
  )

  const activePhotoPreview = selectedPhotoFile
    ? localPhotoUrl
    : existingPhotoUrl ?? draftPoster?.photoUrl ?? null
  const currentPreviewKind = resolvePreviewKind(activePreset.renderMode)

  function resetGeneratedUrls() {
    generatedOutputBlobRef.current = null
    setOutputUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setOverlayExportUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }

  function schedulePreviewRefresh() {
    nextPreviewRequestRef.current += 1
    resetGeneratedUrls()
    setPreviewNonce(nextPreviewRequestRef.current)
  }

  function resetPhotoInputs() {
    if (uploadInputRef.current) {
      uploadInputRef.current.value = ''
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ''
    }
  }

  function resetLocalPhotoPreview() {
    setLocalPhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }

  function resetComposerSession() {
    nextPreviewRequestRef.current += 1
    lastGeneratedPreviewRef.current = 0
    latestGenerationRequestRef.current = 0
    resetGeneratedUrls()
    resetLocalPhotoPreview()
    setPreviewNonce(0)
    setSelectedPhotoFile(null)
    setExistingPhotoUrl(initialPhotoUrl ?? null)
    setSelectedMode(DEFAULT_SURFACE_MODE)
    setIsGenerating(false)
    setMoreOpen(false)
    resetPhotoInputs()
  }

  function dismissComposer() {
    resetComposerSession()
    setIsOpen(false)
  }

  function closeComposer() {
    dismissComposer()
    onFlowStateChange?.('idle')
  }

  function openComposer() {
    setIsOpen(true)
    setMoreOpen(false)
    if (!autoPreviewOnOpen) {
      schedulePreviewRefresh()
      return
    }
    schedulePreviewRefresh()
  }

  useImperativeHandle(
    ref,
    () => ({
      open: openComposer,
    }),
    [openComposer]
  )

  function handleModeChange(mode: ShareSurfaceMode) {
    setSelectedMode(mode)
    setMoreOpen(false)
    schedulePreviewRefresh()
  }

  function handlePhotoSelection(file: File | null) {
    resetLocalPhotoPreview()
    setSelectedPhotoFile(file)
    setMoreOpen(false)
    resetPhotoInputs()
    schedulePreviewRefresh()
  }

  function clearPhotoSelection() {
    resetLocalPhotoPreview()
    setSelectedPhotoFile(null)
    setExistingPhotoUrl(null)
    setMoreOpen(false)
    resetPhotoInputs()
    schedulePreviewRefresh()
  }

  const generatePoster = useCallback(async (requestNonce: number) => {
    latestGenerationRequestRef.current = requestNonce
    setIsGenerating(true)

    try {
      let effectiveRenderMode: ShareRenderMode = activePreset.renderMode
      let posterUrl = demoMode
        ? appendDraftPosterParams('/api/poster', draftPoster, {
            template: activePreset.template,
            renderMode: effectiveRenderMode,
            anchorPosition: DEFAULT_ANCHOR,
          })
        : `/api/poster?checkinId=${encodeURIComponent(checkinId)}&template=${activePreset.template}&renderMode=${effectiveRenderMode}&anchorPosition=${DEFAULT_ANCHOR}`
      let fallbackPhotoUrl: string | null = selectedPhotoFile ? null : draftPoster?.photoUrl ?? existingPhotoUrl

      if (!demoMode) {
        const actionRes = await fetch('/api/trek/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate_share_card',
            checkinId,
            template: activePreset.template,
            renderMode: activePreset.renderMode,
            anchorPosition: DEFAULT_ANCHOR,
          }),
        })

        const actionJson = await actionRes.json().catch(() => ({}))
        if (!actionRes.ok) {
          throw new Error(String(actionJson?.detail ?? actionJson?.error ?? '生成失败，请稍后重试。'))
        }

        effectiveRenderMode =
          typeof actionJson?.effectiveRenderMode === 'string' ? actionJson.effectiveRenderMode : effectiveRenderMode
        posterUrl = typeof actionJson?.posterUrl === 'string' ? actionJson.posterUrl : posterUrl

        fallbackPhotoUrl = typeof actionJson?.photoUrl === 'string' ? actionJson.photoUrl : fallbackPhotoUrl
        if (fallbackPhotoUrl) {
          setExistingPhotoUrl(fallbackPhotoUrl)
        }
      } else if (fallbackPhotoUrl) {
        setExistingPhotoUrl(fallbackPhotoUrl)
      }

      const overlayBlob = await fetchBlob(posterUrl)
      const overlayUrl = URL.createObjectURL(overlayBlob)
      if (requestNonce !== nextPreviewRequestRef.current) {
        URL.revokeObjectURL(overlayUrl)
        return
      }
      setOverlayExportUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return overlayUrl
      })

      let finalBlob = overlayBlob
      if (effectiveRenderMode === 'photo_composite') {
        const photoBlob = await resolvePhotoBlob(selectedPhotoFile, fallbackPhotoUrl)
        if (!photoBlob) {
          throw new Error('当前没有可用的现场照片，请先补一张照片再分享。')
        }
        finalBlob = await composePoster({
          photoBlob,
          overlayBlob,
        })
      }

      if (requestNonce !== nextPreviewRequestRef.current) {
        URL.revokeObjectURL(overlayUrl)
        return
      }

      generatedOutputBlobRef.current = finalBlob
      const finalUrl = URL.createObjectURL(finalBlob)
      if (requestNonce !== nextPreviewRequestRef.current) {
        URL.revokeObjectURL(finalUrl)
        return
      }
      setOutputUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return finalUrl
      })
      if (previewSuccessMessage) {
        showToast({
          key: 'poster_generate_success',
          message: previewSuccessMessage,
        })
      }
      onFlowStateChange?.('preview')
    } catch (error) {
      if (requestNonce !== nextPreviewRequestRef.current) {
        return
      }
      showToast({
        key: 'poster_generate_failure',
        message: normalizePosterError(error),
      })
    } finally {
      if (latestGenerationRequestRef.current === requestNonce) {
        setIsGenerating(false)
      }
    }
  }, [
    activePreset.renderMode,
    activePreset.template,
    checkinId,
    demoMode,
    draftPoster,
    existingPhotoUrl,
    onFlowStateChange,
    previewSuccessMessage,
    selectedPhotoFile,
    showToast,
  ])

  useEffect(() => {
    if (!isOpen || previewNonce === 0 || lastGeneratedPreviewRef.current === previewNonce) return
    lastGeneratedPreviewRef.current = previewNonce
    void generatePoster(previewNonce)
  }, [generatePoster, isOpen, previewNonce])

  async function sharePoster() {
    if (!outputUrl) return

    const filename = buildExportFilename({
      mountainName,
      template: activePreset.template,
      renderMode: activePreset.renderMode,
    })
    const absoluteUrl = typeof window !== 'undefined' ? window.location.href : ''

    try {
      const blob = generatedOutputBlobRef.current ?? await fetchBlob(outputUrl)
      const file = new File([blob], filename, { type: blob.type || 'image/png' })
      const sharePayload = {
        title: `${mountainName} 分享素材`,
        text: 'Peak Trekker 户外活动记录',
        url: absoluteUrl,
      }

      if (navigator.share) {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            ...sharePayload,
            files: [file],
          })
        } else {
          await navigator.share(sharePayload)
        }
        onFlowStateChange?.('shared')
        dismissComposer()
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl)
        showToast({
          key: 'dynamic_link_copied',
          appearance: 'surface',
          durationMs: 2000,
        })
        onFlowStateChange?.('shared')
        dismissComposer()
      } else {
        showToast({
          key: 'share_unsupported',
          appearance: 'surface',
          durationMs: 2000,
        })
      }
    } catch (error) {
      if (isShareAbort(error)) {
        return
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(absoluteUrl)
          showToast({
            key: 'dynamic_link_copied',
            appearance: 'surface',
            durationMs: 2000,
          })
          onFlowStateChange?.('shared')
          dismissComposer()
          return
        } catch {
          // fall through to the failure toast below
        }
      }

      showToast({
        key: 'share_unsupported',
        appearance: 'surface',
        durationMs: 2000,
      })
    }
  }

  function downloadCurrentPreview() {
    if (!outputUrl) return
    triggerDownload(
      outputUrl,
      buildExportFilename({
        mountainName,
        template: activePreset.template,
        renderMode: activePreset.renderMode,
      })
    )
  }

  function downloadOverlayExport() {
    if (!overlayExportUrl) return
    triggerDownload(
      overlayExportUrl,
      `peak-trekker-${mountainName}-${activePreset.template}-overlay.png`
    )
    setMoreOpen(false)
  }

  const footer = (
    <div className="share-sheet__sticky-footer" data-testid="share-sheet-sticky-footer">
      <div className="share-sheet__footer" data-testid="share-sheet-footer-actions">
        <SecondaryButton onClick={downloadCurrentPreview} disabled={!outputUrl || isGenerating}>
          下载
        </SecondaryButton>
        <PrimaryButton onClick={sharePoster} disabled={!outputUrl} loading={isGenerating}>
          分享
        </PrimaryButton>
        <div ref={moreMenuRef} className="share-sheet__more token-action-menu">
          <IconButton
            icon="more"
            ariaLabel="更多操作"
            variant="filled"
            onClick={() => setMoreOpen((current) => !current)}
            disabled={isGenerating}
          />
          {moreOpen ? (
            <div className="token-action-menu__panel share-sheet__menu">
              <div className="token-action-menu__content">
                <TertiaryButton
                  className="token-action-menu__item"
                  onClick={() => {
                    setMoreOpen(false)
                    schedulePreviewRefresh()
                  }}
                >
                  重新生成预览
                </TertiaryButton>
                {overlayExportUrl && activePreset.renderMode !== 'overlay_only' ? (
                  <TertiaryButton className="token-action-menu__item" onClick={downloadOverlayExport}>
                    下载透明水印
                  </TertiaryButton>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  const showPhotoUtility = selectedMode === 'recommended'

  return (
    <>
      {triggerMode === 'icon' ? (
        <IconButton
          icon={triggerIcon}
          ariaLabel={(triggerAriaLabel ?? buttonLabel).trim()}
          variant={triggerIconVariant}
          onClick={openComposer}
        />
      ) : (
        <SecondaryButton onClick={openComposer}>
          {buttonLabel}
        </SecondaryButton>
      )}

      <input
        ref={uploadInputRef}
        data-testid="share-upload-input"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => handlePhotoSelection(event.target.files?.[0] ?? null)}
      />
      <input
        ref={cameraInputRef}
        data-testid="share-camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(event) => handlePhotoSelection(event.target.files?.[0] ?? null)}
      />

      {isOpen ? (
        <ModalShell
          title="分享素材"
          description="默认先给你最适合直接发出的推荐预览。"
          onClose={closeComposer}
          mode="sheet"
          layout="share-sheet"
          maxWidth={480}
          zIndex={140}
          panelStyle={{ width: '100%' }}
          footer={footer}
        >
          <div className="share-sheet" data-testid="share-sheet-layout">
            <div className="share-sheet__preview-card">
              <div
                data-testid="share-preview-surface"
                data-preview-kind={currentPreviewKind}
                data-render-mode={activePreset.renderMode}
                data-template={activePreset.template}
                className={`share-sheet__preview-surface ${activePreset.renderMode === 'overlay_only' ? 'share-sheet__preview-surface--transparent' : ''}`}
                style={activePreset.renderMode === 'overlay_only' ? checkerboardBackground() : undefined}
              >
                {outputUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    data-testid="share-preview-image"
                    src={outputUrl}
                    alt={`${mountainName} 分享预览`}
                    className="share-sheet__preview-image"
                  />
                ) : (
                  <div className="share-sheet__preview-loading">
                    {isGenerating ? '正在生成推荐预览...' : '准备分享预览...'}
                  </div>
                )}
              </div>
            </div>

            <div className="share-sheet__mode-switch" data-testid="share-sheet-tabs">
                {([
                  { key: 'recommended', label: '推荐' },
                  { key: 'classic_card', label: '结果卡' },
                  { key: 'overlay_only', label: '透明水印' },
                ] as const).map((item) => (
                  selectedMode === item.key ? (
                    <PrimaryButton key={item.key} className="share-sheet__mode-button" onClick={() => handleModeChange(item.key)}>
                      {item.label}
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton key={item.key} className="share-sheet__mode-button" onClick={() => handleModeChange(item.key)}>
                      {item.label}
                    </SecondaryButton>
                  )
                ))}
            </div>

            <div className="share-sheet__mode-copy" data-testid="share-sheet-mode-copy">
              {activePreset.hint}
            </div>

            {showPhotoUtility ? (
              <div data-testid="share-photo-utility" className="share-sheet__utility-card">
                <div className="share-sheet__utility-copy">
                  {activePhotoPreview
                    ? '当前预览优先使用这张现场照片。'
                    : '补一张现场照片后，推荐分享图会自动切到照片合成。'}
                </div>
                <div
                  className="share-sheet__utility-actions"
                  style={{
                    gridTemplateColumns: `repeat(${activePhotoPreview ? 3 : 2}, minmax(0, 1fr))`,
                  }}
                >
                  <SecondaryButton className="share-sheet__utility-button" onClick={() => uploadInputRef.current?.click()}>
                    上传照片
                  </SecondaryButton>
                  <SecondaryButton className="share-sheet__utility-button" onClick={() => cameraInputRef.current?.click()}>
                    拍照
                  </SecondaryButton>
                  {activePhotoPreview ? (
                    <SecondaryButton className="share-sheet__utility-button" onClick={clearPhotoSelection}>
                      移除
                    </SecondaryButton>
                  ) : null}
                </div>

                {activePhotoPreview ? (
                  <div data-testid="share-photo-preview" className="share-sheet__photo-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={activePhotoPreview} alt="现场照片预览" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </>
  )
})

SharePosterButton.displayName = 'SharePosterButton'

export default SharePosterButton
