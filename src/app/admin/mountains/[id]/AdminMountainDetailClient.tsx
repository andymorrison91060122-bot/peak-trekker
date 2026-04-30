'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import RichTextEditor from '@/components/admin/RichTextEditor'
import WaypointEditor from '@/components/admin/WaypointEditor'
import { ActionGlyph, IconActionLink } from '@/components/ui/IconActionButton'
import { DEFAULT_MOUNTAIN_COVER_URL } from '@/lib/default-media'
import { LICENSE_UI_ORDER } from '@/lib/license-ui'
import {
  ALLOWED_MOUNTAIN_COVER_TYPES,
  ALLOWED_MOUNTAIN_GALLERY_TYPES,
  MAX_MOUNTAIN_COVER_SIZE_BYTES,
  MAX_MOUNTAIN_GALLERY_SIZE_BYTES,
  normalizeMountainGalleryImages,
} from '@/lib/mountain-storage'
import type { Waypoint } from '@/lib/waypoints'
import type { Mountain } from '@/types'

type AdminMountainRecord = {
  id: string
  name: string
  description: string | null
  altitude: number
  province: string
  difficulty: Mountain['difficulty']
  min_license: Mountain['min_license']
  checkin_count: number | null
  cover_image: string | null
  gallery_images: string[] | null
}

type MountainFormState = {
  name: string
  description: string
  altitude: string
  difficulty: Mountain['difficulty']
  min_license: Mountain['min_license']
}

type FormErrors = {
  name?: string
  altitude?: string
  general?: string
}

type CoverFeedback = {
  tone: 'success' | 'error'
  message: string
}

type GalleryRouteResponse = {
  mountainId: string
  galleryImages: string[]
  removedUrls?: string[]
  deleteWarnings?: string[]
}

const DIFFICULTY_OPTIONS: Array<{
  value: Mountain['difficulty']
  label: string
}> = [
  { value: 'beginner', label: '入门' },
  { value: 'intermediate', label: '进阶' },
  { value: 'advanced', label: '挑战' },
  { value: 'expert', label: '硬核' },
]

const LICENSE_OPTIONS: Array<{
  value: Mountain['min_license']
  label: string
}> = LICENSE_UI_ORDER.map((value) => ({
  value,
  label: {
    none: '无要求',
    basic: '初级',
    intermediate: '中级',
    advanced: '高级',
  }[value],
}))

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeDescriptionToHtml(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return '<p></p>'
  if (/<[^>]+>/.test(normalized)) return normalized

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return '<p></p>'

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function createFormState(mountain: AdminMountainRecord): MountainFormState {
  return {
    name: mountain.name,
    description: normalizeDescriptionToHtml(mountain.description),
    altitude: String(mountain.altitude),
    difficulty: mountain.difficulty as Mountain['difficulty'],
    min_license: mountain.min_license as Mountain['min_license'],
  }
}

function normalizeFormState(form: MountainFormState) {
  return {
    name: form.name.trim(),
    description: form.description,
    altitude: form.altitude.trim(),
    difficulty: form.difficulty,
    min_license: form.min_license,
  }
}

function parseAltitude(value: string) {
  const normalized = value.trim()
  if (!normalized) return null
  const next = Number(normalized)
  if (!Number.isInteger(next) || next <= 0) return null
  return next
}

async function updateMountain(payload: {
  mountainId: string
  updates: Partial<Pick<Mountain, 'name' | 'description' | 'altitude' | 'difficulty' | 'min_license'>>
}) {
  const response = await fetch('/api/admin/mountains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update',
      mountainId: payload.mountainId,
      updates: payload.updates,
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(body?.error ?? '保存失败，请稍后重试。'))
  }

  return body as { mountain: AdminMountainRecord }
}

async function uploadMountainCover(payload: {
  mountainId: string
  file: File
}) {
  const formData = new FormData()
  formData.set('mountainId', payload.mountainId)
  formData.set('file', payload.file)

  const response = await fetch('/api/admin/mountains/cover', {
    method: 'POST',
    body: formData,
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok || typeof body?.coverImage !== 'string') {
    throw new Error(String(body?.error ?? '封面上传失败，请稍后重试。'))
  }

  return body as {
    mountainId: string
    objectPath: string
    coverImage: string
  }
}

async function uploadMountainGalleryImage(payload: {
  mountainId: string
  file: File
}) {
  const formData = new FormData()
  formData.set('mountainId', payload.mountainId)
  formData.set('file', payload.file)

  const response = await fetch('/api/admin/mountains/gallery/upload', {
    method: 'POST',
    body: formData,
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok || !Array.isArray(body?.galleryImages)) {
    throw new Error(String(body?.error ?? '画廊图片上传失败，请稍后重试。'))
  }

  return body as {
    mountainId: string
    objectPath: string
    galleryImages: string[]
  }
}

async function replaceMountainGallery(payload: {
  mountainId: string
  galleryImages: string[]
}) {
  const response = await fetch('/api/admin/mountains/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok || !Array.isArray(body?.galleryImages)) {
    throw new Error(String(body?.error ?? '画廊更新失败，请稍后重试。'))
  }

  return body as GalleryRouteResponse
}

function appendDeleteWarnings(message: string, warnings?: string[]) {
  return warnings && warnings.length > 0
    ? `${message}（${warnings.length} 条清理 warning）`
    : message
}

function FieldLabel({
  label,
  hint,
}: {
  label: string
  hint?: string
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label
        style={{
          fontFamily: 'Share Tech Mono',
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </label>
      {hint ? (
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            color: 'var(--text-muted)',
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}

export default function AdminMountainDetailClient({
  mountain,
  initialWaypoints,
}: {
  mountain: AdminMountainRecord
  initialWaypoints: Waypoint[]
}) {
  const router = useRouter()
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const initialForm = useMemo(() => createFormState(mountain), [mountain])
  const [form, setForm] = useState<MountainFormState>(initialForm)
  const [savedForm, setSavedForm] = useState<MountainFormState>(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [feedback, setFeedback] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(mountain.cover_image)
  const [coverFeedback, setCoverFeedback] = useState<CoverFeedback | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [isRefreshingCover, startCoverRefresh] = useTransition()
  const [galleryImages, setGalleryImages] = useState<string[]>(() => normalizeMountainGalleryImages(mountain.gallery_images))
  const [galleryFeedback, setGalleryFeedback] = useState<CoverFeedback | null>(null)
  const [isUploadingGallery, setIsUploadingGallery] = useState(false)
  const [galleryBusyIndex, setGalleryBusyIndex] = useState<number | null>(null)
  const [isRefreshingGallery, startGalleryRefresh] = useTransition()

  useEffect(() => {
    setForm(initialForm)
    setSavedForm(initialForm)
    setErrors({})
    setFeedback('')
  }, [initialForm])

  useEffect(() => {
    setCoverImageUrl(mountain.cover_image)
  }, [mountain.cover_image])

  useEffect(() => {
    setGalleryImages(normalizeMountainGalleryImages(mountain.gallery_images))
  }, [mountain.gallery_images])

  const isDirty =
    JSON.stringify(normalizeFormState(form)) !== JSON.stringify(normalizeFormState(savedForm))
  const coverPreviewSrc = coverImageUrl || DEFAULT_MOUNTAIN_COVER_URL
  const hasCoverImage = Boolean(coverImageUrl)
  const hasGalleryImages = galleryImages.length > 0

  async function handleCoverSelection(file: File | null) {
    if (!file) return

    if (!ALLOWED_MOUNTAIN_COVER_TYPES.includes(file.type as (typeof ALLOWED_MOUNTAIN_COVER_TYPES)[number])) {
      setCoverFeedback({
        tone: 'error',
        message: '仅支持 JPG、PNG、WEBP 格式的封面图。',
      })
      if (coverInputRef.current) {
        coverInputRef.current.value = ''
      }
      return
    }

    if (file.size > MAX_MOUNTAIN_COVER_SIZE_BYTES) {
      setCoverFeedback({
        tone: 'error',
        message: '封面图片不能超过 8MB。',
      })
      if (coverInputRef.current) {
        coverInputRef.current.value = ''
      }
      return
    }

    setIsUploadingCover(true)
    setCoverFeedback(null)

    try {
      const payload = await uploadMountainCover({
        mountainId: mountain.id,
        file,
      })

      setCoverImageUrl(payload.coverImage)
      setCoverFeedback({
        tone: 'success',
        message: '封面图已更新',
      })
      startCoverRefresh(() => {
        router.refresh()
      })
    } catch (error) {
      setCoverFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : '封面上传失败，请稍后重试。',
      })
    } finally {
      setIsUploadingCover(false)
      if (coverInputRef.current) {
        coverInputRef.current.value = ''
      }
    }
  }

  async function handleGalleryUpdate(nextGalleryImages: string[], successMessage: string) {
    const payload = await replaceMountainGallery({
      mountainId: mountain.id,
      galleryImages: nextGalleryImages,
    })

    setGalleryImages(payload.galleryImages)
    setGalleryFeedback({
      tone: 'success',
      message: appendDeleteWarnings(successMessage, payload.deleteWarnings),
    })
    startGalleryRefresh(() => {
      router.refresh()
    })
  }

  async function handleGallerySelection(file: File | null) {
    if (!file) return

    if (!ALLOWED_MOUNTAIN_GALLERY_TYPES.includes(file.type as (typeof ALLOWED_MOUNTAIN_GALLERY_TYPES)[number])) {
      setGalleryFeedback({
        tone: 'error',
        message: '仅支持 JPG、PNG、WEBP 格式的画廊图片。',
      })
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ''
      }
      return
    }

    if (file.size > MAX_MOUNTAIN_GALLERY_SIZE_BYTES) {
      setGalleryFeedback({
        tone: 'error',
        message: '画廊图片不能超过 8MB。',
      })
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ''
      }
      return
    }

    setIsUploadingGallery(true)
    setGalleryFeedback(null)

    try {
      const payload = await uploadMountainGalleryImage({
        mountainId: mountain.id,
        file,
      })

      setGalleryImages(payload.galleryImages)
      setGalleryFeedback({
        tone: 'success',
        message: '画廊图片已追加到列表末尾',
      })
      startGalleryRefresh(() => {
        router.refresh()
      })
    } catch (error) {
      setGalleryFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : '画廊图片上传失败，请稍后重试。',
      })
    } finally {
      setIsUploadingGallery(false)
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ''
      }
    }
  }

  async function handleMoveGalleryItem(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= galleryImages.length) return

    const nextGalleryImages = [...galleryImages]
    const [moved] = nextGalleryImages.splice(index, 1)
    nextGalleryImages.splice(targetIndex, 0, moved)

    setGalleryBusyIndex(index)
    setGalleryFeedback(null)
    try {
      await handleGalleryUpdate(nextGalleryImages, '画廊顺序已更新')
    } catch (error) {
      setGalleryFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : '画廊顺序更新失败，请稍后重试。',
      })
    } finally {
      setGalleryBusyIndex(null)
    }
  }

  async function handleDeleteGalleryItem(index: number) {
    const nextGalleryImages = galleryImages.filter((_, itemIndex) => itemIndex !== index)

    setGalleryBusyIndex(index)
    setGalleryFeedback(null)
    try {
      await handleGalleryUpdate(nextGalleryImages, '画廊图片已删除')
    } catch (error) {
      setGalleryFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : '画廊图片删除失败，请稍后重试。',
      })
    } finally {
      setGalleryBusyIndex(null)
    }
  }

  async function handleSave() {
    const nextErrors: FormErrors = {}
    const normalizedName = form.name.trim()
    const altitude = parseAltitude(form.altitude)

    if (!normalizedName) {
      nextErrors.name = '名称不能为空'
    }

    if (altitude == null) {
      nextErrors.altitude = '海拔必须是大于 0 的整数'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setFeedback('')
      return
    }

    const nextAltitude = Number(form.altitude.trim())

    setIsSaving(true)
    setErrors({})
    setFeedback('')

    try {
      const payload = await updateMountain({
        mountainId: mountain.id,
        updates: {
          name: normalizedName,
          description: form.description,
          altitude: nextAltitude,
          difficulty: form.difficulty,
          min_license: form.min_license,
        },
      })

      const nextForm = createFormState(payload.mountain)
      setForm(nextForm)
      setSavedForm(nextForm)
      setFeedback('基本信息已保存')
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : '保存失败，请稍后重试。',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div data-testid="admin-mountain-detail-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <IconActionLink href="/admin/mountains" label="返回山峰列表" icon={<ActionGlyph name="back" />} />
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'Share Tech Mono',
              fontSize: 24,
              color: 'var(--text-primary)',
            }}
          >
            {form.name || mountain.name} · 编辑
          </h1>
          <div style={{ marginTop: 4, fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-muted)' }}>
            山峰详情与关键点位管理
          </div>
        </div>
      </div>

      <section className="surface-card" style={{ padding: 18, marginBottom: 18 }} data-testid="admin-mountain-basic-info">
        <div
          style={{
            fontFamily: 'Share Tech Mono',
            fontSize: 12,
            color: 'var(--green-bright)',
            marginBottom: 14,
            letterSpacing: 1,
          }}
        >
          BASIC INFO
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <input
            ref={coverInputRef}
            type="file"
            accept={ALLOWED_MOUNTAIN_COVER_TYPES.join(',')}
            data-testid="admin-mountain-cover-input"
            style={{ display: 'none' }}
            onChange={(event) => handleCoverSelection(event.target.files?.[0] ?? null)}
          />

          <div style={{ display: 'grid', gap: 12 }}>
            <FieldLabel label="封面图" hint="支持 JPG / PNG / WEBP，最大 8MB。" />
            <div
              data-testid="admin-mountain-cover-preview"
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                overflow: 'hidden',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                background: 'color-mix(in srgb, var(--bg-card) 88%, black 12%)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverPreviewSrc}
                alt={`${form.name || mountain.name} 封面图`}
                data-testid="admin-mountain-cover-image"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="secondary-btn"
                data-testid="admin-mountain-cover-trigger"
                disabled={isUploadingCover}
                onClick={() => coverInputRef.current?.click()}
              >
                {isUploadingCover ? '上传中...' : hasCoverImage ? '更换封面' : '上传封面'}
              </button>

              {coverFeedback ? (
                <div
                  className={
                    coverFeedback.tone === 'success'
                      ? 'admin-mountain-form__success'
                      : 'admin-mountain-form__error'
                  }
                  data-testid={
                    coverFeedback.tone === 'success'
                      ? 'admin-mountain-cover-success'
                      : 'admin-mountain-cover-error'
                  }
                >
                  {coverFeedback.message}
                </div>
              ) : null}

              {isRefreshingCover ? (
                <div
                  className="admin-mountain-form__success"
                  data-testid="admin-mountain-cover-refreshing"
                >
                  正在刷新数据...
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <FieldLabel label="名称" />
            <input
              data-testid="admin-mountain-name-input"
              value={form.name}
              onChange={(event) => {
                setForm((current) => ({ ...current, name: event.target.value }))
                setErrors((current) => ({ ...current, name: undefined, general: undefined }))
              }}
              placeholder="输入山峰名称"
              className="admin-mountain-form__input"
            />
            {errors.name ? (
              <div className="admin-mountain-form__error" data-testid="admin-mountain-name-error">{errors.name}</div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <FieldLabel label="简介" hint="支持加粗、斜体、H2/H3、列表和引用。" />
            <RichTextEditor
              content={form.description}
              onChange={(html) => {
                setForm((current) => ({ ...current, description: html }))
                setErrors((current) => ({ ...current, general: undefined }))
              }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              <FieldLabel label="海拔" hint="单位：米" />
              <input
                data-testid="admin-mountain-altitude-input"
                type="number"
                min={1}
                step={1}
                value={form.altitude}
                onChange={(event) => {
                  setForm((current) => ({ ...current, altitude: event.target.value }))
                  setErrors((current) => ({ ...current, altitude: undefined, general: undefined }))
                }}
                placeholder="输入海拔"
                inputMode="numeric"
                className="admin-mountain-form__input"
              />
              {errors.altitude ? (
                <div className="admin-mountain-form__error" data-testid="admin-mountain-altitude-error">
                  {errors.altitude}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <FieldLabel label="难度" />
              <select
                data-testid="admin-mountain-difficulty-select"
                value={form.difficulty}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    difficulty: event.target.value as Mountain['difficulty'],
                  }))
                  setErrors((current) => ({ ...current, general: undefined }))
                }}
                className="admin-mountain-form__input admin-mountain-form__select"
              >
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <FieldLabel label="最低执照" />
              <select
                data-testid="admin-mountain-license-select"
                value={form.min_license}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    min_license: event.target.value as Mountain['min_license'],
                  }))
                  setErrors((current) => ({ ...current, general: undefined }))
                }}
                className="admin-mountain-form__input admin-mountain-form__select"
              >
                {LICENSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <div className="metric-tile">
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{mountain.province}</div>
              <div className="metric-label">省份（只读）</div>
            </div>
            <div className="metric-tile">
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                {String(mountain.checkin_count ?? 0)}
              </div>
              <div className="metric-label">登顶数（只读）</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                fontFamily: 'Share Tech Mono',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              基本信息保存仅处理当前表单字段；画廊管理在独立的 GALLERY 区块完成，路线图能力仍留待后续版本。
            </div>

            {errors.general ? (
              <div className="admin-mountain-form__error" data-testid="admin-mountain-save-error">
                {errors.general}
              </div>
            ) : null}

            {feedback ? (
              <div className="admin-mountain-form__success" data-testid="admin-mountain-save-success">
                {feedback}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary-btn"
                data-testid="admin-mountain-save-button"
                disabled={!isDirty || isSaving}
                onClick={handleSave}
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card" style={{ padding: 18, marginBottom: 18 }} data-testid="admin-mountain-gallery-section">
        <div
          style={{
            fontFamily: 'Share Tech Mono',
            fontSize: 12,
            color: 'var(--green-bright)',
            marginBottom: 14,
            letterSpacing: 1,
          }}
        >
          GALLERY
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <input
            ref={galleryInputRef}
            type="file"
            accept={ALLOWED_MOUNTAIN_GALLERY_TYPES.join(',')}
            data-testid="admin-mountain-gallery-upload-input"
            style={{ display: 'none' }}
            onChange={(event) => handleGallerySelection(event.target.files?.[0] ?? null)}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <FieldLabel label="画廊图" hint="单张上传，支持 JPG / PNG / WEBP，最大 8MB。支持上移 / 下移 / 删除。" />
            </div>
            <button
              type="button"
              className="secondary-btn"
              data-testid="admin-mountain-gallery-upload-trigger"
              disabled={isUploadingGallery}
              onClick={() => galleryInputRef.current?.click()}
            >
              {isUploadingGallery ? '上传中...' : hasGalleryImages ? '上传新图片' : '上传第一张'}
            </button>
          </div>

          {galleryFeedback ? (
            <div
              className={
                galleryFeedback.tone === 'success'
                  ? 'admin-mountain-form__success'
                  : 'admin-mountain-form__error'
              }
              data-testid={
                galleryFeedback.tone === 'success'
                  ? 'admin-mountain-gallery-success'
                  : 'admin-mountain-gallery-error'
              }
            >
              {galleryFeedback.message}
            </div>
          ) : null}

          {isRefreshingGallery ? (
            <div
              className="admin-mountain-form__success"
              data-testid="admin-mountain-gallery-refreshing"
            >
              正在刷新画廊数据...
            </div>
          ) : null}

          {hasGalleryImages ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
              }}
            >
              {galleryImages.map((imageUrl, index) => {
                const isBusy = galleryBusyIndex === index
                return (
                  <div
                    key={`${imageUrl}-${index}`}
                    data-testid={`admin-mountain-gallery-item-${index}`}
                    style={{
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border-color)',
                      background: 'color-mix(in srgb, var(--bg-card) 92%, black 8%)',
                      padding: 12,
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div
                        style={{
                          fontFamily: 'Share Tech Mono',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        #{index + 1}
                      </div>
                      <div className="metric-label">GALLERY ITEM</div>
                    </div>

                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '16 / 10',
                        overflow: 'hidden',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        background: 'color-mix(in srgb, var(--bg-card) 88%, black 12%)',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt={`${mountain.name} 画廊图 ${index + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        className="secondary-btn"
                        data-testid={`admin-mountain-gallery-move-up-${index}`}
                        disabled={index === 0 || isBusy || galleryBusyIndex !== null}
                        onClick={() => void handleMoveGalleryItem(index, 'up')}
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        data-testid={`admin-mountain-gallery-move-down-${index}`}
                        disabled={index === galleryImages.length - 1 || isBusy || galleryBusyIndex !== null}
                        onClick={() => void handleMoveGalleryItem(index, 'down')}
                      >
                        下移
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        data-testid={`admin-mountain-gallery-delete-${index}`}
                        disabled={isBusy || galleryBusyIndex !== null}
                        onClick={() => void handleDeleteGalleryItem(index)}
                        style={{
                          borderColor: 'rgba(239,68,68,0.24)',
                          background: 'rgba(239,68,68,0.08)',
                          color: '#fca5a5',
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              data-testid="admin-mountain-gallery-empty"
              style={{
                borderRadius: 'var(--radius-lg)',
                border: '1px dashed var(--border-color)',
                padding: 16,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              当前还没有 gallery 图片。上传后会按追加顺序写入 `mountains.gallery_images`，不会自动改动封面图。
            </div>
          )}
        </div>
      </section>

      <section className="surface-card" style={{ padding: 18 }}>
        <div
          style={{
            fontFamily: 'Share Tech Mono',
            fontSize: 12,
            color: 'var(--green-bright)',
            marginBottom: 14,
            letterSpacing: 1,
          }}
        >
          关键点位
        </div>

        <WaypointEditor mountainId={mountain.id} initialWaypoints={initialWaypoints} />
      </section>
    </div>
  )
}
