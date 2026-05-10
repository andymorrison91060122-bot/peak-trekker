'use client'

import { useMemo, useRef, useState, type CSSProperties, type UIEvent } from 'react'
import IconActionButton, { ActionGlyph } from '@/components/ui/IconActionButton'
import type { CheckinAsset } from '@/types'

const FALLBACK_CREATED_AT = '1970-01-01T00:00:00.000Z'

type PreviewMode = 'feed' | 'detail' | 'profile-share' | 'publish' | 'embedded'

function mediaFrameStyle(compact: boolean, previewMode: PreviewMode) {
  const isContainedPreview = previewMode === 'publish' || previewMode === 'embedded'
  const isCardPreview = previewMode === 'feed' || previewMode === 'profile-share'
  const isDetailPreview = previewMode === 'detail'
  const aspectRatio = isCardPreview ? '16 / 11' : compact ? '4 / 5' : '4 / 5'
  const minHeight = compact ? (isContainedPreview ? 220 : isCardPreview ? 212 : 280) : isCardPreview ? 248 : 360
  const maxHeight = compact ? (isContainedPreview ? 300 : isCardPreview ? 272 : 360) : isCardPreview ? 328 : 520
  const borderRadius = isDetailPreview ? 'var(--radius-lg)' : compact ? (isContainedPreview ? 16 : isCardPreview ? 18 : 20) : isCardPreview ? 20 : 22
  return {
    position: 'relative' as const,
    width: '100%',
    aspectRatio,
    minHeight,
    maxHeight,
    borderRadius,
    overflow: 'hidden',
    border: isDetailPreview ? 'none' : '1px solid rgba(255,255,255,0.08)',
    background: isDetailPreview ? 'transparent' : 'linear-gradient(180deg, rgba(25,29,32,0.98), rgba(18,20,23,0.98))',
    boxShadow: isDetailPreview
      ? 'none'
      : compact
      ? isContainedPreview
        ? '0 8px 22px rgba(0,0,0,0.18)'
        : '0 12px 36px rgba(0,0,0,0.24)'
      : '0 18px 44px rgba(0,0,0,0.28)',
  }
}

function getMediaGridStyle(count: number): CSSProperties {
  if (count <= 1) {
    return {
      display: 'grid',
      gridTemplateColumns: '1fr',
      width: '100%',
      height: '100%',
    }
  }

  if (count === 2) {
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 6,
      width: '100%',
      height: '100%',
    }
  }

  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
    gap: 6,
    width: '100%',
    height: '100%',
  }
}

function buildFallbackAssets(coverUrl: string | null) {
  if (!coverUrl) return [] as CheckinAsset[]
  return [
    {
      id: 'cover-only',
      type: 'poster',
      url: coverUrl,
      thumbnail_url: coverUrl,
      sort_order: 0,
      source: 'fallback',
      checkin_id: 'fallback',
      created_at: FALLBACK_CREATED_AT,
    } satisfies CheckinAsset,
  ]
}

function renderMedia(asset: CheckinAsset, title: string, index: number, posterFallback?: string | null, withControls?: boolean) {
  const src = asset.thumbnail_url || asset.url
  const isVideo = asset.type === 'video'

  if (isVideo) {
    return (
      <video
        src={asset.url}
        poster={asset.thumbnail_url || posterFallback || undefined}
        controls={Boolean(withControls)}
        muted={!withControls}
        playsInline
        preload="metadata"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: 'var(--color-surface)' }}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${title} 素材 ${index + 1}`}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

export default function CommunityMediaGallery({
  assets,
  coverUrl,
  title,
  compact = false,
  allowLightbox = true,
  previewMode = 'detail',
}: {
  assets: CheckinAsset[]
  coverUrl: string | null
  title: string
  compact?: boolean
  allowLightbox?: boolean
  previewMode?: PreviewMode
}) {
  const media = useMemo(() => {
    const fallbackAssets = buildFallbackAssets(coverUrl)
    const resolved = assets.length ? assets : fallbackAssets
    if (!coverUrl) return resolved

    const preferredIndex = resolved.findIndex(
      (asset) => asset.url === coverUrl || asset.thumbnail_url === coverUrl
    )

    if (preferredIndex <= 0) return resolved

    return [resolved[preferredIndex], ...resolved.filter((_, index) => index !== preferredIndex)]
  }, [assets, coverUrl])
  const isContainedPreview = previewMode === 'publish' || previewMode === 'embedded'
  const isCardPreview = previewMode === 'feed' || previewMode === 'profile-share'
  const containedMedia = isContainedPreview ? media.slice(0, Math.min(media.length, 4)) : media
  const hiddenCount = isContainedPreview ? Math.max(0, media.length - containedMedia.length) : 0
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const safeActiveIndex = media.length ? Math.max(0, Math.min(media.length - 1, activeIndex)) : 0
  const activeAsset = media[safeActiveIndex] ?? media[0] ?? null

  function scrollToIndex(nextIndex: number) {
    const safeIndex = Math.max(0, Math.min(media.length - 1, nextIndex))
    const node = scrollRef.current?.children.item(safeIndex) as HTMLElement | null
    node?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    })
    setActiveIndex(safeIndex)
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const container = event.currentTarget
    if (!container.clientWidth) return
    const nextIndex = Math.round(container.scrollLeft / container.clientWidth)
    if (nextIndex !== safeActiveIndex) {
      setActiveIndex(Math.max(0, Math.min(media.length - 1, nextIndex)))
    }
  }

  if (!media.length) {
    return (
      <div style={mediaFrameStyle(compact, previewMode)}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}
        >
          暂无可展示素材
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        data-testid="community-media-gallery"
        data-preview-mode={previewMode}
        style={{ display: 'grid', gap: isContainedPreview ? 0 : 10, width: '100%' }}
      >
        <div
          data-testid="community-media-gallery-viewport"
          style={{
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
          }}
        >
          {isContainedPreview ? (
            <div style={mediaFrameStyle(compact, previewMode)}>
              <div style={{ ...getMediaGridStyle(containedMedia.length), padding: 6 }}>
                {containedMedia.map((asset, index) => {
                  const highlightPrimaryTile = containedMedia.length >= 3 && index === 0
                  return (
                    <div
                      key={asset.id}
                      data-gallery-slide
                      style={{
                        position: 'relative',
                        minWidth: 0,
                        minHeight: 0,
                        overflow: 'hidden',
                        borderRadius: 12,
                        background: 'var(--color-surface)',
                        gridRow: highlightPrimaryTile ? 'span 2' : undefined,
                      }}
                    >
                      {renderMedia(asset, title, index, coverUrl, false)}

                      {asset.type === 'video' && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: 'rgba(10,12,14,0.72)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'white',
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          VIDEO
                        </div>
                      )}

                      {hiddenCount > 0 && index === containedMedia.length - 1 && (
                        <div
                          data-gallery-overlay
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'grid',
                            placeItems: 'center',
                            background: 'rgba(8,10,12,0.52)',
                            color: 'white',
                            fontSize: 18,
                            fontWeight: 800,
                            pointerEvents: 'none',
                          }}
                        >
                          +{hiddenCount}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : isCardPreview ? (
            <div
              data-gallery-slide
              style={mediaFrameStyle(compact, previewMode)}
            >
              {renderMedia(activeAsset ?? media[0], title, safeActiveIndex, coverUrl, false)}
              <div
                data-gallery-overlay
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(8,10,12,0.02) 0%, rgba(8,10,12,0.08) 28%, rgba(8,10,12,0.28) 70%, rgba(8,10,12,0.58) 100%)',
                  pointerEvents: 'none',
                }}
              />
              {activeAsset?.type === 'video' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(10,12,14,0.72)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  VIDEO
                </div>
              )}
              {media.length > 1 && (
                <div
                  data-gallery-overlay
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 10px',
                    borderRadius: 999,
                    background: 'rgba(10,12,14,0.74)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span aria-hidden="true">+</span>
                  {media.length - 1}
                </div>
              )}
            </div>
          ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              width: '100%',
              paddingBottom: 2,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {media.map((asset, index) => {
              return (
                <div
                  key={asset.id}
                  data-gallery-slide
                  style={{
                    ...mediaFrameStyle(compact, previewMode),
                    flex: '0 0 100%',
                    scrollSnapAlign: 'start',
                  }}
                >
                  {renderMedia(asset, title, index, coverUrl, !compact)}

                  <div
                    data-gallery-overlay
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(180deg, rgba(8,10,12,0.08) 0%, rgba(8,10,12,0.02) 28%, rgba(8,10,12,0.34) 72%, rgba(8,10,12,0.78) 100%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {asset.type === 'video' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 14,
                        right: 14,
                        padding: '8px 12px',
                        borderRadius: 999,
                        background: 'rgba(10,12,14,0.72)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                      }}
                    >
                      VIDEO
                    </div>
                  )}

                  {media.length > 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 14,
                        left: 14,
                        padding: '8px 12px',
                        borderRadius: 999,
                        background: 'rgba(10,12,14,0.72)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'white',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {index + 1} / {media.length}
                    </div>
                  )}

                  {(allowLightbox || compact) && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveIndex(index)
                        if (allowLightbox && previewMode === 'detail') setLightboxOpen(true)
                      }}
                      aria-label={`查看 ${title} 素材 ${index + 1}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'transparent',
                        border: 'none',
                        cursor: allowLightbox && previewMode === 'detail' ? 'zoom-in' : 'default',
                        padding: 0,
                      }}
                    />
                  )}

                </div>
              )
            })}
          </div>
          )}

          {media.length > 1 && previewMode === 'detail' && (
            <>
              <button
                type="button"
                data-gallery-control
                aria-label="上一张素材"
                onClick={() => scrollToIndex(safeActiveIndex - 1)}
                className="secondary-btn"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 3,
                  minWidth: 40,
                  height: 40,
                  padding: 0,
                  borderRadius: 999,
                  background: 'rgba(10,12,14,0.72)',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                ‹
              </button>
              <button
                type="button"
                data-gallery-control
                aria-label="下一张素材"
                onClick={() => scrollToIndex(safeActiveIndex + 1)}
                className="secondary-btn"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 3,
                  minWidth: 40,
                  height: 40,
                  padding: 0,
                  borderRadius: 999,
                  background: 'rgba(10,12,14,0.72)',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                ›
              </button>
            </>
          )}
        </div>

        {previewMode === 'detail' && media.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {media.map((asset, index) => (
              <button
                key={`${asset.id}-dot`}
                type="button"
                data-gallery-control
                onClick={() => scrollToIndex(index)}
                aria-label={`切换到第 ${index + 1} 张素材`}
                style={{
                  width: safeActiveIndex === index ? 24 : 8,
                  height: 8,
                  borderRadius: 999,
                  border: 'none',
                  background: safeActiveIndex === index ? 'var(--green-bright)' : 'rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  transition: 'all 180ms ease',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxOpen && activeAsset && allowLightbox && previewMode === 'detail' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(6,8,10,0.92)',
            backdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <IconActionButton
            label="关闭"
            icon={<ActionGlyph name="close" />}
            size="sm"
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'rgba(10,12,14,0.72)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          />

          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => scrollToIndex(safeActiveIndex - 1)}
                className="secondary-btn"
                style={{
                  position: 'absolute',
                  left: 20,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 3,
                  minWidth: 44,
                  height: 44,
                  padding: 0,
                  borderRadius: 999,
                }}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => scrollToIndex(safeActiveIndex + 1)}
                className="secondary-btn"
                style={{
                  position: 'absolute',
                  right: 20,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 3,
                  minWidth: 44,
                  height: 44,
                  padding: 0,
                  borderRadius: 999,
                }}
              >
                ›
              </button>
            </>
          )}

          <div
            style={{
              width: 'min(92vw, 960px)',
              display: 'grid',
              gap: 14,
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxHeight: '78vh',
                aspectRatio: '4 / 5',
                borderRadius: 24,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'var(--color-surface)',
              }}
            >
              {renderMedia(activeAsset, title, safeActiveIndex, coverUrl, true)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
                <div className="section-subtitle">
                  {safeActiveIndex + 1} / {media.length} · {activeAsset.type === 'video' ? '视频素材' : activeAsset.type === 'poster' ? '分享卡素材' : '照片素材'}
                </div>
              </div>
              {media.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {media.map((asset, index) => (
                    <button
                      key={`${asset.id}-thumb`}
                      type="button"
                      onClick={() => scrollToIndex(index)}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 16,
                        overflow: 'hidden',
                        padding: 0,
                        border: safeActiveIndex === index ? '2px solid var(--green-bright)' : '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                      }}
                    >
                      {asset.type === 'video' ? (
                        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-primary)', fontWeight: 800 }}>
                          ▶
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.thumbnail_url || asset.url}
                          alt={`${title} 缩略图 ${index + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
