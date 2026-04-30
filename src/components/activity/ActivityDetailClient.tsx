'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { formatCommunityDate, formatCommunityDuration } from '@/lib/community'
import type { ActivityDetail } from '@/lib/activity-server'
import { DEFAULT_ACTIVITY_COVER_URL } from '@/lib/default-media'
import ActivityDetailHero, { type ActivityHeroSource } from '@/components/activity/ActivityDetailHero'
import ActivityRoutePanel from '@/components/activity/ActivityRoutePanel'
import { useAppToast } from '@/components/ui/AppToastProvider'
import IconButton from '@/components/ui/IconButton'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SharePosterButton, { type SharePosterButtonHandle } from '@/components/ui/SharePosterButton'
import TertiaryButton from '@/components/ui/TertiaryButton'
import { DifficultyBadge, SectionHeader } from '@/components/ui/MountainUI'

const MAX_ACTIVITY_PHOTO_COUNT = 9
const QA_MOUNTAIN_HERO_URL = '/debug/activity-hero-mountain.svg'
type ActivityHeroScenario = 'default' | 'photo' | 'mountain' | 'solid'
type ActivityActionMenuItem =
  | {
      key: string
      label: string
      href: string
    }
  | {
      key: string
      label: string
      onSelect: () => void
    }

function clampTextStyle(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  }
}

function formatActivityDateTime(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getPublishStateSummary(activity: ActivityDetail, showDeletedFeedback: boolean) {
  if (showDeletedFeedback) {
    return '已从山友圈移除，可在整理好内容后再次发布。'
  }

  if (!activity.linkedPost) {
    return '未发布到山友圈 · 这次攀登记录会先独立保留在这里。'
  }

  return `已发布到山友圈 · ${activity.linkedPost.visibility === 'private' ? '仅自己可见' : '公开可见'}`
}

function resolveActivityHero({
  scenario,
  photoUrl,
  mountainImageUrl,
}: {
  scenario: ActivityHeroScenario
  photoUrl: string | null
  mountainImageUrl: string | null
}): {
  source: ActivityHeroSource
  imageUrl: string | null
} {
  if (scenario === 'mountain') {
    return {
      source: 'mountain',
      imageUrl: QA_MOUNTAIN_HERO_URL,
    }
  }

  if (scenario === 'solid') {
    return {
      source: 'default',
      imageUrl: DEFAULT_ACTIVITY_COVER_URL,
    }
  }

  if (photoUrl) {
    return {
      source: 'photo',
      imageUrl: photoUrl,
    }
  }

  if (scenario === 'photo') {
    return {
      source: 'default',
      imageUrl: DEFAULT_ACTIVITY_COVER_URL,
    }
  }

  if (mountainImageUrl) {
    return {
      source: 'mountain',
      imageUrl: mountainImageUrl,
    }
  }

  return {
    source: 'default',
    imageUrl: DEFAULT_ACTIVITY_COVER_URL,
  }
}

export default function ActivityDetailClient({
  activity,
  profileBackHref,
  published,
  publishMode,
  postDeleted,
  heroScenario = 'default',
}: {
  activity: ActivityDetail
  profileBackHref: string
  published: boolean
  publishMode: 'created' | 'updated'
  postDeleted: boolean
  heroScenario?: ActivityHeroScenario
}) {
  const router = useRouter()
  const { showToast } = useAppToast()
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const sharePosterButtonRef = useRef<SharePosterButtonHandle | null>(null)
  const [note, setNote] = useState(activity.note)
  const [savedNote, setSavedNote] = useState(activity.note)
  const [photos, setPhotos] = useState(activity.photos)
  const [heroPhotoUrl, setHeroPhotoUrl] = useState(activity.photoUrl ?? activity.photos[0]?.url ?? null)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [isSavingNote, startSavingNote] = useTransition()
  const [isUploadingPhotos, startUploadingPhotos] = useTransition()

  const photoCount = photos.length
  const hasLinkedPost = Boolean(activity.linkedPost)
  const actionStateSummary = getPublishStateSummary(activity, postDeleted)
  const noteChanged = note.trim() !== savedNote.trim()
  const heroCover = resolveActivityHero({
    scenario: heroScenario,
    photoUrl: heroPhotoUrl,
    mountainImageUrl: activity.mountain.coverImage ?? null,
  })
  const actionMenuItems = useMemo<ActivityActionMenuItem[]>(
    () =>
      hasLinkedPost
        ? [
            {
              key: 'edit-post',
              label: '编辑山友圈内容',
              href: `/community/publish/${activity.checkinId}`,
            },
          ]
        : [
            {
              key: 'open-share-sheet',
              label: '生成分享素材',
              onSelect: () => {
                setActionMenuOpen(false)
                sharePosterButtonRef.current?.open()
              },
            },
          ],
    [activity.checkinId, hasLinkedPost]
  )
  const detailFacts = useMemo(
    () =>
      [
        { label: '开始记录时间', value: formatActivityDateTime(activity.startedAt) ?? '按记录创建时间记入' },
        { label: '登顶时间', value: formatActivityDateTime(activity.summitAt) ?? '本次未记录登顶时间' },
        { label: '记录来源', value: activity.recordSourceLabel },
        { label: '核验状态', value: activity.verificationStatusLabel },
      ],
    [activity.recordSourceLabel, activity.startedAt, activity.summitAt, activity.verificationStatusLabel]
  )

  async function handleSaveNote() {
    startSavingNote(async () => {
      try {
        const response = await fetch('/api/activity/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_activity_note',
            checkinId: activity.checkinId,
            note,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(payload?.error ?? '攀登日记保存失败，请稍后重试。'))
        }
        const nextNote = typeof payload?.note === 'string' ? payload.note : note.trim()
        setNote(nextNote)
        setSavedNote(nextNote)
        showToast({ tone: 'success', message: '攀登日记已保存。' })
      } catch (error) {
        showToast({
          tone: 'error',
          message: error instanceof Error ? error.message : '攀登日记保存失败，请稍后重试。',
        })
      }
    })
  }

  function handlePhotoSelection(files: FileList | null) {
    if (!files?.length) return

    const selectedFiles = [...files]
    if (photoCount + selectedFiles.length > MAX_ACTIVITY_PHOTO_COUNT) {
      showToast({
        tone: 'info',
        message: `最多只能保留 ${MAX_ACTIVITY_PHOTO_COUNT} 张现场照片。`,
      })
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    startUploadingPhotos(async () => {
      try {
        const formData = new FormData()
        formData.set('action', 'add_activity_images')
        formData.set('checkinId', activity.checkinId)
        for (const file of selectedFiles) {
          formData.append('files', file)
        }

        const response = await fetch('/api/activity/actions', {
          method: 'POST',
          body: formData,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(payload?.error ?? '现场照片上传失败，请稍后重试。'))
        }

        const nextAssets: unknown[] = Array.isArray(payload?.assets) ? payload.assets : []
        setPhotos((current) => {
          const currentUrls = new Set(current.map((asset) => asset.url))
          const appended = nextAssets.filter((asset: unknown): asset is ActivityDetail['photos'][number] => {
            if (!asset || typeof asset !== 'object') return false
            const candidate = asset as Partial<ActivityDetail['photos'][number]>
            return typeof candidate.id === 'string' && typeof candidate.url === 'string' && !currentUrls.has(candidate.url)
          })
          return [...current, ...appended]
        })
        if (typeof payload?.photoUrl === 'string' && payload.photoUrl) {
          setHeroPhotoUrl(payload.photoUrl)
        }
        showToast({
          tone: 'success',
          message: nextAssets.length > 1 ? '现场照片已上传。' : '现场照片已添加。',
        })
      } catch (error) {
        showToast({
          tone: 'error',
          message: error instanceof Error ? error.message : '现场照片上传失败，请稍后重试。',
        })
      } finally {
        if (photoInputRef.current) photoInputRef.current.value = ''
      }
    })
  }

  const hasActivityPhotoCover = Boolean(heroPhotoUrl || photos.length > 0)
  const publishPrimaryLabel = hasLinkedPost ? '查看已发布内容' : '发布到山友圈'

  useEffect(() => {
    if (!actionMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (actionMenuRef.current?.contains(event.target as Node)) return
      setActionMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActionMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionMenuOpen])

  return (
    <div
      className="activity-detail-page"
      data-activity-checkin-id={activity.checkinId}
      data-activity-post-state={hasLinkedPost ? 'published' : 'unshared'}
    >
      {(published || postDeleted) && (
        <div
          className="surface-card activity-feedback-banner"
          style={{
            padding: 14,
            marginBottom: 16,
            borderColor: postDeleted ? 'rgba(251,191,36,0.24)' : 'rgba(34,197,94,0.26)',
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <div
              className="font-pixel"
              style={{
                fontSize: 17,
                color: postDeleted ? 'var(--warning)' : 'var(--green-bright)',
              }}
            >
              {postDeleted ? '内容已从山友圈移除' : publishMode === 'updated' ? '分享已更新' : '发布成功'}
            </div>
            <div className="section-subtitle">
              {postDeleted
                ? '攀登记录仍完整保留在这里，你可以整理好内容后再次发布。'
                : publishMode === 'updated'
                  ? '这次社区表达已经更新，攀登记录仍然保持为主对象。'
                  : '这次攀登记录已经和山友圈内容建立关联，后续仍建议从这里继续回看和派生分享。'}
            </div>
          </div>
        </div>
      )}

      <section className="surface-card activity-detail-shell" style={{ marginBottom: 18 }}>
        <div className="activity-detail__hero">
          <ActivityDetailHero
            heroSource={heroCover.source}
            imageUrl={heroCover.imageUrl}
            mountainName={activity.mountain.name}
            locationLabel={activity.mountain.province}
            onBackClick={() => router.push(profileBackHref)}
            onShareClick={() => sharePosterButtonRef.current?.open()}
          />

          <div className="activity-detail__hero-body">
            <div className="activity-detail__status-row">
              <span className={`muted-chip ${activity.sourceType === 'realtime_gps' ? 'active' : ''}`}>
                {activity.recordSourceLabel}
              </span>
              <span className="muted-chip active">{activity.summitStatusLabel}</span>
            </div>

            <div className="activity-detail__hero-title" style={clampTextStyle(2)}>
              {activity.mountain.name} 攀登记录
            </div>
            <div className="activity-detail__hero-meta">
              {formatCommunityDate(activity.verifiedAt || activity.createdAt)} · {activity.mountain.province} · ▲{' '}
              {activity.mountain.altitude.toLocaleString()}m
            </div>

            <div className="activity-detail__header-meta">
              <div className="activity-detail__header-copy">
                <div className="activity-detail__header-eyebrow">记录状态</div>
                <div className="activity-detail__header-detail">{actionStateSummary}</div>
              </div>
              <DifficultyBadge level={activity.mountain.difficulty} />
            </div>

            <div className="activity-detail__metric-grid">
              {[
                { label: '海拔', value: `${activity.metrics.altitudeM.toLocaleString()} m` },
                { label: '累计爬升', value: `${activity.metrics.ascentM.toLocaleString()} m` },
                { label: '路线距离', value: `${activity.metrics.distanceKm.toFixed(1)} km` },
                { label: '活动时长', value: formatCommunityDuration(activity.metrics.durationSec) },
              ].map((item) => (
                <div key={item.label} className="metric-tile">
                  <div className="metric-value activity-detail__metric-value">{item.value}</div>
                  <div className="metric-label">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="detail-info-list">
              {detailFacts.map((fact) => (
                <div key={fact.label} className="surface-card detail-info-row">
                  <div className="detail-info-row__label">{fact.label}</div>
                  <div className="detail-info-row__value">{fact.value}</div>
                </div>
              ))}
            </div>

            <div className="activity-detail__actions" data-testid="activity-actions">
              <PrimaryButton
                as="a"
                href={hasLinkedPost ? `/community/${activity.linkedPost!.postId}` : `/community/publish/${activity.checkinId}`}
                className="activity-detail__primary-action"
                data-testid="activity-primary-action"
              >
                {publishPrimaryLabel}
              </PrimaryButton>

              <div className="activity-detail__utility-action" data-testid="activity-utility-action">
                <SharePosterButton
                  ref={sharePosterButtonRef}
                  checkinId={activity.checkinId}
                  mountainName={activity.mountain.name}
                  initialPhotoUrl={heroPhotoUrl}
                  buttonLabel={hasLinkedPost ? '查看分享素材' : '生成分享素材'}
                  triggerMode="icon"
                  triggerAriaLabel={hasLinkedPost ? '查看分享素材' : '生成分享素材'}
                  triggerIcon="share"
                  triggerIconVariant="filled"
                  useTokenFooter
                />
              </div>

              {actionMenuItems.length ? (
                <div ref={actionMenuRef} className="token-action-menu" data-testid="activity-overflow-actions">
                  <IconButton
                    icon="more"
                    ariaLabel="更多操作"
                    variant="filled"
                    onClick={() => setActionMenuOpen((current) => !current)}
                  />
                  {actionMenuOpen ? (
                    <div className="surface-card token-action-menu__panel token-action-menu__panel--activity" role="menu">
                      <div className="token-action-menu__content">
                        {actionMenuItems.map((item) =>
                          'href' in item ? (
                            <TertiaryButton
                              key={item.key}
                              as="a"
                              href={item.href}
                              className="token-action-menu__item"
                              onClick={() => setActionMenuOpen(false)}
                            >
                              {item.label}
                            </TertiaryButton>
                          ) : (
                            <TertiaryButton
                              key={item.key}
                              className="token-action-menu__item"
                              onClick={item.onSelect}
                            >
                              {item.label}
                            </TertiaryButton>
                          )
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <ActivityRoutePanel trackPreview={activity.trackPreview} />

      <section className="surface-card" style={{ padding: 16, marginBottom: 18 }}>
        <div className="activity-section-head">
          <SectionHeader
            title="现场照片"
            description={
              hasActivityPhotoCover
                ? '这次攀登留下的现场照片会优先在这里回看；活动封面已有内容时，本轮不会自动覆盖。'
                : '补充现场照片后，首张图会作为活动封面候选，方便后续回看和分享。'
            }
          />
          <button
            type="button"
            className="secondary-btn activity-photo-upload-btn"
            onClick={() => photoInputRef.current?.click()}
            disabled={isUploadingPhotos || photoCount >= MAX_ACTIVITY_PHOTO_COUNT}
            data-testid="activity-photo-upload-trigger"
          >
            {photoCount >= MAX_ACTIVITY_PHOTO_COUNT ? '已达上限' : isUploadingPhotos ? '上传中...' : '上传现场照片'}
          </button>
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => handlePhotoSelection(event.target.files)}
        />

        <div className="section-subtitle" style={{ marginBottom: 12 }}>
          最多 {MAX_ACTIVITY_PHOTO_COUNT} 张 · 当前 {photoCount} 张
        </div>

        {photoCount > 0 ? (
          <div className="activity-photo-grid" data-testid="activity-photo-grid">
            {photos.map((photo, index) => (
              <div key={photo.id} className="activity-photo-grid__item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnail_url || photo.url}
                  alt={`${activity.mountain.name} 现场照片 ${index + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {heroPhotoUrl === photo.url && (
                  <span className="muted-chip activity-photo-grid__badge">封面候选</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="metric-tile">
            <div className="section-subtitle">
              这次攀登记录还没有补充现场照片，活动对象依然可回看，也可以先{publishPrimaryLabel}。
            </div>
          </div>
        )}
      </section>

      <section className="surface-card" style={{ padding: 16 }}>
        <div className="activity-section-head">
          <SectionHeader
            title="攀登日记"
            description="把这次攀登的路况、节奏、天气或感受留在活动对象里，不把社区正文混进记录本身。"
          />
          <button
            type="button"
            className="primary-btn activity-note-save-btn"
            onClick={handleSaveNote}
            disabled={isSavingNote || !noteChanged}
            data-testid="activity-note-save"
          >
            {isSavingNote ? '保存中...' : '保存日记'}
          </button>
        </div>

        <textarea
          ref={noteInputRef}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={6}
          className="activity-note-input"
          placeholder="记录这次攀登的天气、节奏、体感，或你想留给未来自己的提醒。"
          data-testid="activity-note-input"
        />
        <div className="section-subtitle" style={{ marginTop: 8 }}>
          {savedNote.trim() ? '已保存的内容会一直跟随这条攀登记录。' : '还没有留下攀登日记，保存后会和这次记录一起长期保留。'}
        </div>
      </section>
    </div>
  )
}
