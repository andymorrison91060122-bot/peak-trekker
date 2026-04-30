export default function PrepPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div className="surface-card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="font-pixel" style={{ fontSize: 26, marginBottom: 8 }}>
          备赛
        </div>
        <div className="section-subtitle">
          这里会承接后续的装备准备、路线收藏和更深入的出发前规划。当前阶段先保留为结构占位。
        </div>
      </div>

      <div className="surface-card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="font-pixel" style={{ fontSize: 18, marginBottom: 6 }}>后续会放在这里的内容</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {['装备清单', '收藏路线', '天气与风险提示', '离线地图管理'].map((item) => (
            <div key={item} className="metric-tile">
              <div className="font-pixel" style={{ fontSize: 16 }}>{item}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
