import Skeleton from '@/components/ui/Skeleton'

export default function MainRouteLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="页面加载中"
      data-route-loading="main"
      style={{
        minHeight: '70dvh',
        display: 'grid',
        alignContent: 'start',
        gap: 'var(--space-6)',
        padding: 'var(--space-5) var(--space-4) var(--space-8)',
      }}
    >
      <section style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <Skeleton width="42%" height={28} radius="var(--radius-sm)" />
        <Skeleton width="68%" height={14} radius="var(--radius-xs)" />
      </section>

      <section data-route-loading-region="hero">
        <Skeleton height={168} radius="var(--radius-lg)" />
      </section>

      <section
        data-route-loading-region="chips"
        style={{ display: 'flex', gap: 'var(--space-2)', overflow: 'hidden' }}
      >
        <Skeleton width={76} height={34} radius="var(--radius-pill)" />
        <Skeleton width={88} height={34} radius="var(--radius-pill)" />
        <Skeleton width={68} height={34} radius="var(--radius-pill)" />
      </section>

      <section data-route-loading-region="list" style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <Skeleton width="38%" height={22} radius="var(--radius-xs)" />
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px minmax(0, 1fr)',
              gap: 'var(--space-3)',
              alignItems: 'center',
            }}
          >
            <Skeleton width={96} height={78} radius="var(--radius-md)" />
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <Skeleton width="72%" height={18} radius="var(--radius-xs)" />
              <Skeleton width="94%" height={12} radius="var(--radius-xs)" />
              <Skeleton width="56%" height={12} radius="var(--radius-xs)" />
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
