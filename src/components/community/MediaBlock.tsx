import type { CheckinAsset } from '@/types'

function renderAsset(asset: CheckinAsset, title: string, index: number) {
  const src = asset.thumbnail_url || asset.url

  if (asset.type === 'video') {
    return (
      <video
        src={asset.url}
        poster={asset.thumbnail_url || undefined}
        muted
        playsInline
        preload="metadata"
        className="community-v2-media-block__media"
        aria-label={`${title} 素材 ${index + 1}`}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${title} 素材 ${index + 1}`} className="community-v2-media-block__media" />
  )
}

export default function MediaBlock({
  media,
  title,
}: {
  media: CheckinAsset[]
  title: string
}) {
  if (!media.length) return null

  if (media.length === 1) {
    return (
      <div className="community-v2-media-block community-v2-media-block--single" data-testid="community-media-block">
        {renderAsset(media[0], title, 0)}
      </div>
    )
  }

  if (media.length === 2) {
    return (
      <div className="community-v2-media-block community-v2-media-block--double" data-testid="community-media-block">
        {media.slice(0, 2).map((asset, index) => (
          <div key={asset.id} className="community-v2-media-block__tile">
            {renderAsset(asset, title, index)}
          </div>
        ))}
      </div>
    )
  }

  const extra = Math.max(0, media.length - 3)

  return (
    <div className="community-v2-media-block community-v2-media-block--asymmetric" data-testid="community-media-block">
      <div className="community-v2-media-block__tile community-v2-media-block__tile--large">
        {renderAsset(media[0], title, 0)}
      </div>
      <div className="community-v2-media-block__stack">
        {media.slice(1, 3).map((asset, index) => (
          <div key={asset.id} className="community-v2-media-block__tile">
            {renderAsset(asset, title, index + 1)}
            {extra > 0 && index === 1 ? (
              <div className="community-v2-media-block__count" data-testid="community-media-extra-count">
                +{extra}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
