import Skeleton from '@/components/ui/Skeleton'

export default function FlowRouteLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="页面加载中"
      data-route-loading="flow"
      style={{
        minHeight: 'calc(100dvh - max(env(safe-area-inset-top), var(--space-2)))',
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto',
        gap: 'var(--space-5)',
        padding: 'var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom))',
      }}
    >
      <section
        data-route-loading-region="topbar"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
      >
        <Skeleton width={44} height={44} radius="var(--radius-sm)" />
        <div style={{ flex: 1, display: 'grid', gap: 'var(--space-2)' }}>
          <Skeleton width="44%" height={20} radius="var(--radius-xs)" />
          <Skeleton width="62%" height={12} radius="var(--radius-xs)" />
        </div>
      </section>

      <section data-route-loading-region="hero">
        <Skeleton height="min(34dvh, 280px)" radius="var(--radius-lg)" />
      </section>

      <section
        data-route-loading-region="body"
        style={{ display: 'grid', alignContent: 'start', gap: 'var(--space-4)' }}
      >
        {[0, 1, 2].map((row) => (
          <div key={row} style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <Skeleton width={row === 1 ? '48%' : '36%'} height={16} radius="var(--radius-xs)" />
            <Skeleton height={14} radius="var(--radius-xs)" />
            <Skeleton width={row === 2 ? '64%' : '82%'} height={14} radius="var(--radius-xs)" />
          </div>
        ))}
      </section>

      <section data-route-loading-region="cta">
        <Skeleton height={44} radius="var(--radius-md)" />
      </section>
    </div>
  )
}
