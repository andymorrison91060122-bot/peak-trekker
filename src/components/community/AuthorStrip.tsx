'use client'

export default function AuthorStrip({
  name,
  avatarUrl,
  time,
  isMine,
}: {
  name: string
  avatarUrl?: string | null
  time: string
  isMine: boolean
}) {
  const initial = name.trim().slice(0, 1) || '山'

  return (
    <div className="community-v2-author-strip" data-testid="community-author-strip">
      <div className="community-v2-author-strip__avatar" aria-hidden={!avatarUrl}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="community-v2-author-strip__avatar-image" />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      <div className="community-v2-author-strip__copy">
        <div className="community-v2-author-strip__name-row">
          <span className="community-v2-author-strip__name">{name}</span>
          <span className="community-v2-author-strip__time">{time}</span>
        </div>
        {isMine ? <div className="community-v2-author-strip__mine">· 你的发布 ·</div> : null}
      </div>
    </div>
  )
}
