type CommunityMetricItem = {
  label: string
  value: string
}

type CommunityMetricBadge = {
  label: string
  active?: boolean
}

export default function CommunityMetricsRow({
  items,
  title,
  description,
  badges = [],
  variant = 'feed',
  marginBottom = 18,
}: {
  items: CommunityMetricItem[]
  title?: string
  description?: string
  badges?: CommunityMetricBadge[]
  variant?: 'feed' | 'detail' | 'panel'
  marginBottom?: number
}) {
  const isDetail = variant === 'detail'
  const normalizedItems =
    variant === 'feed'
      ? items.slice(0, 4)
      : variant === 'detail'
        ? items.slice(0, 4)
        : items

  if (variant === 'panel') {
    return (
      <div style={{ marginBottom }}>
        {(title || description || badges.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              {title && <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{title}</div>}
              {description && <div className="section-subtitle">{description}</div>}
            </div>
            {badges.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {badges.map((badge) => (
                  <span key={badge.label} className={`muted-chip ${badge.active ? 'active' : ''}`}>
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {normalizedItems.map((item) => (
            <div key={item.label} className="metric-tile" style={{ padding: '13px 13px 12px' }}>
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.2,
                  color: 'var(--text-muted)',
                  letterSpacing: 0,
                  marginBottom: 8,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: 21,
                  lineHeight: 1.08,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: 0,
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`community-metrics community-metrics--${variant}`} style={{ marginBottom }} data-variant={variant}>
        {(title || description || badges.length > 0) && (
          <div className="community-metrics__head">
            <div style={{ minWidth: 0 }}>
              {title && <div className="community-metrics__title">{title}</div>}
              {description && <div className="section-subtitle">{description}</div>}
            </div>
          {badges.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {badges.map((badge) => (
                <span key={badge.label} className={`muted-chip ${badge.active ? 'active' : ''}`}>
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="community-metrics__list">
        {normalizedItems.map((item, index) => (
          <div key={item.label} className="community-metrics__item">
            <div className="community-metrics__label">
              {item.label}
            </div>
            <div className="community-metrics__value">
              {item.value}
            </div>
            {isDetail && index < normalizedItems.length - 1 ? <span className="community-metrics__divider" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
