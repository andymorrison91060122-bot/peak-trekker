export default function CommunityCardSkeleton() {
  return (
    <article className="community-v2-card community-v2-card--skeleton" data-testid="community-card-skeleton" aria-label="山友圈内容加载中">
      <div className="community-v2-skeleton-author">
        <div className="community-v2-skeleton community-v2-skeleton--avatar" />
        <div className="community-v2-skeleton-author__copy">
          <div className="community-v2-skeleton community-v2-skeleton--line community-v2-skeleton--name" />
          <div className="community-v2-skeleton community-v2-skeleton--line community-v2-skeleton--time" />
        </div>
      </div>
      <div className="community-v2-skeleton community-v2-skeleton--mountain" />
      <div className="community-v2-skeleton-copy">
        <div className="community-v2-skeleton community-v2-skeleton--line" />
        <div className="community-v2-skeleton community-v2-skeleton--line community-v2-skeleton--short" />
      </div>
      <div className="community-v2-skeleton community-v2-skeleton--media" />
      <div className="community-v2-skeleton community-v2-skeleton--stats" />
      <div
        style={{
          minHeight: 44,
          padding: '8px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          className="community-v2-skeleton"
          style={{
            width: 126,
            height: 20,
            borderRadius: 'var(--radius-pill)',
          }}
        />
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div className="community-v2-skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          <div className="community-v2-skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          <div className="community-v2-skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
        </div>
      </div>
    </article>
  )
}
