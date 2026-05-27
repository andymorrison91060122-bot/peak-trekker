import { DEFAULT_MOUNTAIN_COVER_URL } from '@/lib/default-media'

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>
          {title}
        </div>
        {description && <div className="section-subtitle">{description}</div>}
      </div>
      {action}
    </div>
  )
}

export function DifficultyBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    beginner: { label: '新手友好', cls: 'diff-beginner' },
    intermediate: { label: '进阶', cls: 'diff-intermediate' },
    advanced: { label: '挑战', cls: 'diff-advanced' },
    expert: { label: '专家', cls: 'diff-expert' },
  }
  const { label, cls } = map[level] ?? { label: level, cls: 'diff-beginner' }
  return (
    <span className={`pixel-badge pixel-badge-dim ${cls}`}>
      {label}
    </span>
  )
}


export function MountainImagePlaceholder({
  name,
  size = 'md',
  coverImage,
}: {
  name: string
  altitude: number
  size?: 'sm' | 'md' | 'lg'
  coverImage?: string
}) {
  const heights: Record<string, number> = { sm: 96, md: 144, lg: 252 }
  const h = heights[size]
  const resolvedCoverImage = coverImage || DEFAULT_MOUNTAIN_COVER_URL

  return (
    <div style={{ width: '100%', height: h, position: 'relative', overflow: 'hidden', borderRadius: size === 'sm' ? 12 : 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedCoverImage}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}
