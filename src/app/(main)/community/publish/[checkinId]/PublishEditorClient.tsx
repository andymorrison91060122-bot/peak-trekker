'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import {
  buildCommunityMetricItems,
  chooseCommunityCoverAsset,
  COMMUNITY_MAX_IMAGE_COUNT,
  formatCommunityDate,
  formatCommunityDuration,
  normalizeCommunityActionError,
  prioritizeCommunityAssets,
  serializeCommunityPostPayload,
} from '@/lib/community'
import { describeStorageError, isMissingStorageError, normalizeStorageUploadError } from '@/lib/storage-errors'
import {
  buildCheckinPhotoObjectPath,
  CHECKIN_PHOTOS_BUCKET,
  CHECKIN_PHOTOS_MAX_BYTES,
  STORAGE_CACHE_CONTROL,
  validateStorageImageFile,
} from '@/lib/storage-utils'
import type { CheckinAsset, CommunityPostMetrics, CommunityPostPayload } from '@/types'
import CommunityMediaGallery from '@/components/community/CommunityMediaGallery'
import { useAppToast } from '@/components/ui/AppToastProvider'
import { ActionGlyph, IconActionLink } from '@/components/ui/IconActionButton'
import { DifficultyBadge } from '@/components/ui/MountainUI'

const SUGGESTED_TAGS = ['夜登', '雪山', '看日出', '亲子徒步', '装备攻略', '路线提醒', '补给建议']

function AssetThumb({
  asset,
  active,
  onSetCover,
  onRemove,
}: {
  asset: CheckinAsset
  active: boolean
  onSetCover: () => void
  onRemove: () => void
}) {
  const thumb = asset.thumbnail_url || asset.url
  return (
    <div
      className="surface-card"
      style={{ padding: 10 }}
      data-asset-id={asset.id}
      data-asset-type={asset.type}
      data-cover-active={active ? 'true' : 'false'}
    >
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 120, marginBottom: 10 }}>
        {asset.type === 'video' ? (
          <video
            src={asset.url}
            poster={thumb}
            muted
            playsInline
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="素材预览" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ position: 'absolute', top: 10, right: 10 }} className={`muted-chip ${active ? 'active' : ''}`}>
          {active ? '当前封面' : asset.type === 'video' ? '视频' : asset.type === 'poster' ? '分享卡' : '图片'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={active ? 'primary-btn' : 'secondary-btn'} style={{ flex: 1 }} onClick={onSetCover}>
          {active ? '封面中' : '设为封面'}
        </button>
        <button type="button" className="secondary-btn" style={{ flex: 1 }} onClick={onRemove}>
          移除
        </button>
      </div>
    </div>
  )
}

export default function PublishEditorClient({
  checkinId,
  sourceType,
  defaultTitle,
  initialPayload,
  record,
  existingPostId,
  userId,
}: {
  checkinId: string
  sourceType: 'realtime_gps' | 'historical_photo' | 'track_import'
  defaultTitle: string
  initialPayload: CommunityPostPayload
  record: {
    mountain: {
      id: string
      name: string
      altitude: number
      province: string
      difficulty: string
      coverImage?: string | null
    }
    metrics: CommunityPostMetrics
    note: string
    photoUrl: string | null
    posterUrl: string | null
    createdAt: string
  }
  existingPostId: string | null
  userId: string
}) {
  const supabase = createSupabaseBrowserClient()
  const { showToast } = useAppToast()
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState(initialPayload.title || defaultTitle)
  const [body, setBody] = useState(initialPayload.body)
  const [visibility, setVisibility] = useState<'public' | 'private'>(initialPayload.visibility)
  const [tags, setTags] = useState<string[]>(initialPayload.tags)
  const [customTag, setCustomTag] = useState('')
  const [assets, setAssets] = useState<CheckinAsset[]>(initialPayload.assets)
  const [coverAssetId, setCoverAssetId] = useState<string | null>(initialPayload.coverAssetId)
  const [isUploading, startUploading] = useTransition()
  const [isSubmitting, startSubmitting] = useTransition()
  const recordMetrics = buildCommunityMetricItems({
    sourceType,
    metrics: record.metrics,
    mountain: record.mountain,
  })

  useEffect(() => {
    if (!assets.length) {
      if (coverAssetId) setCoverAssetId(null)
      return
    }

    const currentAssetStillExists = assets.some((asset) => asset.id === coverAssetId)
    if (!coverAssetId || !currentAssetStillExists) {
      const preferredCover = chooseCommunityCoverAsset({
        schemaVersion: 1,
        title,
        body,
        visibility,
        status: 'published',
        sourceType,
        tags,
        coverAssetId,
        coverUrl: null,
        assets,
        trackPreview: initialPayload.trackPreview ?? null,
      })
      setCoverAssetId(preferredCover?.id ?? null)
    }
  }, [assets, body, coverAssetId, initialPayload.trackPreview, sourceType, tags, title, visibility])

  function addTag(tag: string) {
    const cleaned = tag.trim().replace(/^#+/, '')
    if (!cleaned) return
    setTags((current) => {
      if (current.includes(cleaned) || current.length >= 3) return current
      return [...current, cleaned]
    })
    setCustomTag('')
  }

  function removeTag(tag: string) {
    setTags((current) => current.filter((item) => item !== tag))
  }

  function removeAsset(assetId: string) {
    setAssets((current) => prioritizeCommunityAssets(current.filter((asset) => asset.id !== assetId)))
    setCoverAssetId((current) => (current === assetId ? null : current))
  }

  function buildStoragePath(file: File, index?: number) {
    return buildCheckinPhotoObjectPath({
      userId,
      file,
      fallbackBase: file.type.includes('video') ? 'community-video' : 'community-image',
      scopeId: checkinId,
      index,
    })
  }

  function handleImageUpload(files: FileList | null) {
    if (!files?.length) return

    startUploading(async () => {
      try {
        const imageFiles = [...files].slice(0, COMMUNITY_MAX_IMAGE_COUNT)
        const nonVideoAssets = assets.filter((asset) => asset.type !== 'video')
        const currentImageCount = nonVideoAssets.filter((asset) => asset.type === 'image').length
        const availableSlots = Math.max(0, COMMUNITY_MAX_IMAGE_COUNT - currentImageCount)
        const filesToUpload = imageFiles.slice(0, availableSlots)

        if (!filesToUpload.length) {
          throw new Error(`最多只能保留 ${COMMUNITY_MAX_IMAGE_COUNT} 张图片。`)
        }

        const uploadedAssets: CheckinAsset[] = []
        for (const file of filesToUpload) {
          const validation = validateStorageImageFile(file, {
            maxBytes: CHECKIN_PHOTOS_MAX_BYTES,
            invalidTypeMessage: '只能上传 JPG、PNG 或 WebP 格式的图片。',
            tooLargeMessage: '单张图片不能超过 8MB。',
          })
          if (!validation.ok) {
            throw new Error(validation.error)
          }

          const path = buildStoragePath(file, uploadedAssets.length)
          const { error: uploadError } = await supabase.storage.from(CHECKIN_PHOTOS_BUCKET).upload(path, file, {
            contentType: file.type,
            upsert: false,
            cacheControl: STORAGE_CACHE_CONTROL,
          })
          if (uploadError) {
            throw new Error(normalizeStorageUploadError(describeStorageError(uploadError), '图片上传失败，请稍后重试。'))
          }
          const { data } = supabase.storage.from(CHECKIN_PHOTOS_BUCKET).getPublicUrl(path)
          uploadedAssets.push({
            id: `upload-${Date.now()}-${uploadedAssets.length}`,
            checkin_id: checkinId,
            type: 'image',
            url: data.publicUrl,
            thumbnail_url: data.publicUrl,
            created_at: new Date().toISOString(),
            sort_order: nonVideoAssets.length + uploadedAssets.length,
            source: 'upload',
          })
        }

        const nextAssets = prioritizeCommunityAssets(
          [...nonVideoAssets, ...uploadedAssets].map((asset, index) => ({ ...asset, sort_order: index }))
        )
        setAssets(nextAssets)
        showToast({ key: 'image_upload_success' })
      } catch (error) {
        const message = normalizeStorageUploadError(
          normalizeCommunityActionError(error instanceof Error ? error.message : null, '图片上传失败，请稍后重试。'),
          '图片上传失败，请稍后重试。'
        )
        showToast({
          key: isMissingStorageError(message) ? 'storage_missing' : 'image_upload_failure',
          message,
        })
      }
    })
  }

  function handleVideoUpload(file: File | null) {
    if (!file) return

    startUploading(async () => {
      try {
        const keepPosterAssets = assets.filter((asset) => asset.type === 'poster')
        const path = buildStoragePath(file)
        const { error: uploadError } = await supabase.storage.from(CHECKIN_PHOTOS_BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: STORAGE_CACHE_CONTROL,
        })
        if (uploadError) {
          throw new Error(normalizeStorageUploadError(describeStorageError(uploadError), '视频上传失败，请稍后重试。'))
        }
        const { data } = supabase.storage.from(CHECKIN_PHOTOS_BUCKET).getPublicUrl(path)
        const nextAssets = prioritizeCommunityAssets([
          ...keepPosterAssets,
          {
            id: `upload-video-${Date.now()}`,
            checkin_id: checkinId,
            type: 'video' as const,
            url: data.publicUrl,
            thumbnail_url: record.posterUrl || record.mountain.coverImage || null,
            created_at: new Date().toISOString(),
            sort_order: keepPosterAssets.length,
            source: 'upload' as const,
          },
        ])
        setAssets(nextAssets)
        setCoverAssetId(nextAssets.find((asset) => asset.type === 'video')?.id ?? nextAssets.at(0)?.id ?? null)
        showToast({ key: 'video_upload_success' })
      } catch (error) {
        const message = normalizeStorageUploadError(
          normalizeCommunityActionError(error instanceof Error ? error.message : null, '视频上传失败，请稍后重试。'),
          '视频上传失败，请稍后重试。'
        )
        showToast({
          key: isMissingStorageError(message) ? 'storage_missing' : 'video_upload_failure',
          message,
        })
      }
    })
  }

  function publishPost() {
    startSubmitting(async () => {
      try {
        const response = await fetch('/api/community/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_or_update_post',
            checkinId,
            title,
            body,
            visibility,
            tags,
            assets,
            coverAssetId,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(String(data?.error ?? '发布失败，请稍后重试。'))
        }

        const nextUrl = `/activity/${checkinId}?published=1&mode=${data.mode === 'updated' ? 'updated' : 'created'}`

        window.location.assign(nextUrl)
      } catch (error) {
        const message = normalizeCommunityActionError(
          error instanceof Error ? error.message : null,
          '发布失败，请稍后重试。'
        )

        if (existingPostId && /row-level security|publish failed/i.test(message)) {
          try {
            const orderedAssets = prioritizeCommunityAssets(
              [...assets]
                .sort((left, right) => left.sort_order - right.sort_order)
                .map((asset, index) => ({ ...asset, sort_order: index }))
            )
            const nextPayload = {
              schemaVersion: 1 as const,
              title: title.trim() || defaultTitle,
              body,
              visibility,
              status: initialPayload.status,
              sourceType,
              tags,
              coverAssetId,
              coverUrl: null,
              assets: orderedAssets,
              trackPreview: initialPayload.trackPreview ?? null,
            }
            const coverAsset = chooseCommunityCoverAsset(nextPayload)
            const coverUrl =
              coverAsset?.thumbnail_url ??
              coverAsset?.url ??
              record.photoUrl ??
              record.posterUrl ??
              record.mountain.coverImage ??
              null
            const serialized = serializeCommunityPostPayload({
              ...nextPayload,
              coverAssetId: coverAsset?.id ?? null,
              coverUrl,
            })

            const directUpdate = await supabase
              .from('posts')
              .update({
                content: serialized,
                poster_url: coverUrl,
              })
              .eq('id', existingPostId)
              .select('id')
              .maybeSingle()

            if (!directUpdate.error) {
              const readBack = await supabase
                .from('posts')
                .select('id, content, poster_url')
                .eq('id', existingPostId)
                .maybeSingle()

              if (
                readBack.data?.id === existingPostId &&
                readBack.data?.content === serialized &&
                (readBack.data?.poster_url ?? null) === coverUrl
              ) {
                window.location.assign(`/activity/${checkinId}?published=1&mode=updated`)
                return
              }
            }
          } catch {}
        }

        showToast({
          key: /当前网络不稳定/.test(message) ? 'network_unstable' : 'publish_failure',
          message,
        })
      }
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div className="publish-editor__topbar" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="publish-editor__topbar-copy">
          <div className="font-pixel publish-editor__title" style={{ fontSize: 24, marginBottom: 6 }}>
            {existingPostId ? '编辑山友圈内容' : '发布到山友圈'}
          </div>
          <div className="section-subtitle publish-editor__intro">
            山峰、时间和活动数据会自动带入，这里只补充你想对山友圈说的话和要展示的素材。
          </div>
        </div>
        <IconActionLink
          href={`/activity/${checkinId}`}
          label="返回攀登记录"
          icon={<ActionGlyph name="back" />}
          size="sm"
          className="publish-editor__back-link"
        />
      </div>

      <div className="surface-card publish-editor__record-shell" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="font-pixel" style={{ fontSize: 24, marginBottom: 6 }}>{record.mountain.name}</div>
            <div className="section-subtitle">
              {record.mountain.province} · {sourceType === 'historical_photo' ? '照片补签记录' : 'GPS 实时记录'} · {formatCommunityDate(record.createdAt)}
            </div>
          </div>
          <DifficultyBadge level={record.mountain.difficulty} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${recordMetrics.length}, minmax(0, 1fr))`,
            gap: 10,
            marginBottom: 14,
          }}
        >
          {recordMetrics.map((item) => (
            <div key={item.label} className="metric-tile">
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{item.value}</div>
              <div className="metric-label">{item.label}</div>
            </div>
          ))}
        </div>

        {record.note && (
          <div className="metric-tile">
            <div className="section-subtitle" style={{ color: 'var(--text-secondary)' }}>
              攀登记录里已保存的日记：{record.note}
            </div>
          </div>
        )}
      </div>

      <div className="surface-card publish-editor__editor-shell" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>社区表达</div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>标题</div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 30))}
              placeholder={defaultTitle}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <div className="section-subtitle" style={{ marginTop: 6 }}>{title.length} / 30</div>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>文字描述</div>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value.slice(0, 1000))}
              rows={6}
              placeholder="补充路况攻略、装备建议、注意事项或你的登山感受。"
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 12,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div className="section-subtitle" style={{ marginTop: 6 }}>{body.length} / 1000</div>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>可见性</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { value: 'public', label: '所有人可见' },
                { value: 'private', label: '仅自己可见' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={visibility === item.value ? 'primary-btn' : 'secondary-btn'}
                  onClick={() => setVisibility(item.value as 'public' | 'private')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>标签</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={tags.includes(tag) ? 'primary-btn' : 'secondary-btn'}
                  onClick={() => (tags.includes(tag) ? removeTag(tag) : addTag(tag))}
                  disabled={!tags.includes(tag) && tags.length >= 3}
                >
                  #{tag}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={customTag}
                onChange={(event) => setCustomTag(event.target.value)}
                placeholder="自定义标签，最多 3 个"
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <button type="button" className="secondary-btn" onClick={() => addTag(customTag)} disabled={tags.length >= 3}>
                添加
              </button>
            </div>
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {tags.map((tag) => (
                  <button key={tag} type="button" className="muted-chip active" onClick={() => removeTag(tag)} style={{ border: 'none', cursor: 'pointer' }}>
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="surface-card publish-editor__assets-shell" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>素材与封面</div>
            <div className="section-subtitle">
              最多 9 张图片或 1 条视频。素材会绑定到当前登山记录，封面优先用于山友圈信息流展示。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="secondary-btn" onClick={() => imageInputRef.current?.click()}>
              上传图片
            </button>
            <button type="button" className="secondary-btn" onClick={() => videoInputRef.current?.click()}>
              上传视频
            </button>
          </div>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => handleImageUpload(event.target.files)}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(event) => handleVideoUpload(event.target.files?.[0] ?? null)}
        />

        {assets.length === 0 ? (
          <div className="metric-tile" style={{ marginBottom: 14 }}>
            <div className="section-subtitle">
              当前没有额外素材。发布后会优先使用分享卡或山峰封面作为视觉内容。
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
            {assets.map((asset) => (
              <AssetThumb
                key={asset.id}
                asset={asset}
                active={coverAssetId === asset.id}
                onSetCover={() => setCoverAssetId(asset.id)}
                onRemove={() => removeAsset(asset.id)}
              />
            ))}
          </div>
        )}

        <div className="metric-tile publish-editor__preview-shell" data-testid="publish-editor-preview">
          <div className="publish-editor__preview-label">发布预览</div>
          <div className="section-subtitle publish-editor__preview-copy" style={{ marginBottom: 10 }}>
            这里只做嵌入式预览，确认展示顺序和边界是否正常即可。
          </div>
          <CommunityMediaGallery
            assets={assets}
            coverUrl={
              assets.find((asset) => asset.id === coverAssetId)?.thumbnail_url ??
              assets.find((asset) => asset.id === coverAssetId)?.url ??
              record.photoUrl ??
              record.posterUrl ??
              record.mountain.coverImage ??
              null
            }
            title={title || defaultTitle}
            compact
            previewMode="publish"
          />
        </div>
      </div>

      <div className="publish-editor__footer-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="primary-btn" onClick={publishPost} disabled={isSubmitting || isUploading}>
          {isSubmitting ? '发布中...' : existingPostId ? '更新内容' : '发布到山友圈'}
        </button>
        {existingPostId && (
          <Link href={`/community/${existingPostId}`} className="secondary-btn" style={{ textDecoration: 'none' }}>
            查看已发布内容
          </Link>
        )}
        <Link href={`/activity/${checkinId}`} className="publish-editor__quiet-link" style={{ textDecoration: 'none' }}>
          返回攀登记录
        </Link>
      </div>
    </div>
  )
}
