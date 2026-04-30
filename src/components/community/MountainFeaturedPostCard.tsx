import Link from 'next/link'
import type { CommunityPostViewModel } from '@/types'
import {
  sanitizeCommunityUsername,
} from '@/components/community/communityRender'

function FeaturedAuthorAvatar({
  username,
  avatarUrl,
}: {
  username: string
  avatarUrl?: string | null
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={username}
        className="mountain-featured-post-card__avatar"
      />
    )
  }

  return (
    <div className="mountain-featured-post-card__avatar-fallback">
      {username.slice(0, 1)}
    </div>
  )
}

export default function MountainFeaturedPostCard({
  post,
}: {
  post: CommunityPostViewModel
}) {
  const authorName = sanitizeCommunityUsername(post.author.username, '山友')
  const imageAsset = post.assets.find((asset) => asset.type === 'image' && asset.url)

  if (!imageAsset?.url) {
    return null
  }

  return (
    <Link
      href={`/community/${post.id}`}
      className="mountain-featured-post-card"
      data-testid="mountain-featured-post-card"
      data-post-id={post.id}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageAsset.url}
        alt=""
        aria-hidden="true"
        className="mountain-featured-post-card__image"
      />
      <div className="mountain-featured-post-card__overlay" />

      <div className="mountain-featured-post-card__content">
        <div className="mountain-featured-post-card__title">{post.title}</div>
        <div className="mountain-featured-post-card__author">
          <FeaturedAuthorAvatar
            username={authorName}
            avatarUrl={post.author.avatarUrl}
          />
          <span className="mountain-featured-post-card__username">{authorName}</span>
        </div>
      </div>
    </Link>
  )
}
