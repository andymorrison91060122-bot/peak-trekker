'use client'

import { sanitizeCommunityUsername } from '@/components/community/communityRender'

export interface LikeAvatarStackProps {
  likedUsers: Array<{ id: string; avatar_url?: string | null; username?: string | null }>
  totalCount: number
}

const summaryStyle = {
  color: '#9ca3af',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
} as const

const avatarBaseStyle = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: '2px solid var(--color-surface)',
  background: 'var(--color-surface-elevated)',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  color: 'var(--color-on-surface-variant)',
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 700,
  flex: '0 0 24px',
} as const

export default function LikeAvatarStack({ likedUsers, totalCount }: LikeAvatarStackProps) {
  if (totalCount === 0) {
    return <span style={summaryStyle}>还没有人觉得有用</span>
  }

  const previewUsers = likedUsers.slice(0, 3)

  return (
    <div
      data-testid="community-like-avatar-stack"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      {previewUsers.length > 0 ? (
        <div
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginRight: 8,
            flex: '0 0 auto',
          }}
        >
          {previewUsers.map((user, index) => {
            const username = sanitizeCommunityUsername(user.username ?? '', '山友')
            const initial = username.slice(0, 1).toUpperCase()

            return user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={user.id}
                src={user.avatar_url}
                alt=""
                style={{
                  ...avatarBaseStyle,
                  objectFit: 'cover',
                  marginLeft: index === 0 ? 0 : -8,
                }}
              />
            ) : (
              <span
                key={user.id}
                style={{
                  ...avatarBaseStyle,
                  marginLeft: index === 0 ? 0 : -8,
                }}
              >
                {initial}
              </span>
            )
          })}
        </div>
      ) : null}
      <span style={summaryStyle}>{totalCount} 人觉得有用</span>
    </div>
  )
}
