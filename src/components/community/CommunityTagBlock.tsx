export default function CommunityTagBlock({
  tags,
  variant = 'detail',
}: {
  tags: string[]
  variant?: 'feed' | 'detail'
}) {
  const hasTags = tags.length > 0
  const isDetail = variant === 'detail'

  if (!hasTags) {
    return null
  }

  return (
    <div className={`community-tags community-tags--${variant}`}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tags.map((tag) => (
          <span key={tag} className="muted-chip">#{tag}</span>
        ))}
      </div>
    </div>
  )
}
