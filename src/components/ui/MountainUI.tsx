// 像素山脉 SVG 组件（纯 CSS/SVG，用于页面装饰）
import Link from 'next/link'
export function PixelMountainBg() {
  return (
    <svg
      viewBox="0 0 375 120"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full"
      style={{ imageRendering: 'pixelated' }}
      preserveAspectRatio="none"
    >
      {/* 远山 - 深色 */}
      <polygon points="0,120 40,60 70,80 110,40 150,70 190,30 230,55 270,20 310,50 340,35 375,60 375,120" fill="#0f1f0f" />
      {/* 中山 - 中色 */}
      <polygon points="0,120 20,90 60,70 100,85 130,60 170,75 210,50 250,65 290,45 330,70 375,55 375,120" fill="#162916" />
      {/* 近山轮廓线 */}
      <polyline points="0,110 30,100 70,88 110,95 150,80 190,88 230,75 270,90 310,78 350,92 375,85" fill="none" stroke="#2D6A4F" strokeWidth="1.5" />
      {/* 像素星点 */}
      {[30,80,140,200,260,320].map((x, i) => (
        <rect key={i} x={x} y={[15,8,22,5,18,12][i]} width="2" height="2" fill="#39FF14" opacity="0.6" />
      ))}
    </svg>
  )
}

// 像素等高线卡片边框
export function TopoFrame({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`topo-card ${className}`} style={{ position: 'relative' }}>
      {/* 顶部海拔刻度装饰 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '2px',
        background: 'repeating-linear-gradient(90deg, var(--green-primary) 0px, var(--green-primary) 4px, transparent 4px, transparent 8px)'
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}

// 山峰难度标签
export function DifficultyBadge({ level }: { level: string }) {
  const map: Record<string, { label: string, cls: string }> = {
    beginner:     { label: '初级', cls: 'diff-beginner' },
    intermediate: { label: '中级', cls: 'diff-intermediate' },
    advanced:     { label: '高级', cls: 'diff-advanced' },
    expert:       { label: '专家', cls: 'diff-expert' },
  }
  const { label, cls } = map[level] ?? { label: level, cls: '' }
  return (
    <span className={`pixel-badge pixel-badge-dim ${cls}`} style={{ fontSize: '7px' }}>
      {label}
    </span>
  )
}

// 海拔条
export function AltitudeBar({ altitude, max = 9000 }: { altitude: number, max?: number }) {
  const pct = Math.min((altitude / max) * 100, 100)
  return (
    <div>
      <div className="altitude-bar" style={{ borderRadius: 0 }}>
        <div className="altitude-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// 山峰图片占位区（等待真实素材时显示像素风占位）
export function MountainImagePlaceholder({
  name, altitude, size = 'md', coverImage
}: {
  name: string, altitude: number, size?: 'sm' | 'md' | 'lg', coverImage?: string
}) {
  const heights: Record<string, number> = { sm: 72, md: 100, lg: 180 }
  const h = heights[size]

  if (coverImage) {
    return (
      <div style={{ width: '100%', height: h, position: 'relative', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImage}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'auto' }}
        />
        {/* 像素边框叠层 */}
        <div style={{
          position: 'absolute', inset: 0,
          boxShadow: 'inset 0 0 0 2px rgba(45,106,79,0.6)',
          pointerEvents: 'none'
        }} />
      </div>
    )
  }

  // 占位：像素山形 SVG + 网格背景
  const pct = Math.min((altitude / 9000) * 100, 100)
  return (
    <div style={{
      width: '100%', height: h, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(180deg, #050f0a 0%, #0a1a10 60%, #0d1a0d 100%)',
      border: '1px solid rgba(45,106,79,0.4)',
    }}>
      {/* 网格底纹 */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(45,106,79,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(45,106,79,0.06) 1px, transparent 1px)',
        backgroundSize: '12px 12px',
      }} />

      {/* 像素山形 SVG */}
      <svg
        viewBox="0 0 200 80"
        preserveAspectRatio="xMidYMax meet"
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', imageRendering: 'pixelated' }}
      >
        {/* 雪顶 */}
        <polygon points="100,8 86,28 114,28" fill="#c8e6d0" opacity="0.9" />
        {/* 主山体 */}
        <polygon points="100,12 60,65 140,65" fill="#1a3320" />
        {/* 山脊阴影 */}
        <polygon points="100,12 100,65 140,65" fill="#0f1f13" />
        {/* 左侧伴峰 */}
        <polygon points="55,30 36,65 74,65" fill="#152a1a" />
        {/* 右侧伴峰 */}
        <polygon points="145,35 126,65 164,65" fill="#152a1a" />
        {/* 地面 */}
        <rect x="0" y="64" width="200" height="16" fill="#0a150c" />
        {/* 山顶高亮像素 */}
        <rect x="99" y="8" width="2" height="2" fill="#39FF14" opacity="0.7" />
        {/* 积雪细节像素 */}
        {[88,92,96,104,108,112].map((x, i) => (
          <rect key={i} x={x} y={22 + (i % 2) * 2} width="2" height="2" fill="white" opacity="0.4" />
        ))}
      </svg>

      {/* 星点 */}
      {size !== 'sm' && [20, 60, 120, 170].map((x, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: x, top: [8, 16, 6, 12][i],
          width: 2, height: 2,
          background: '#39FF14',
          opacity: 0.5,
        }} />
      ))}

      {/* 右下角占位标注 */}
      <div style={{
        position: 'absolute', bottom: 6, right: 8,
        fontFamily: 'Share Tech Mono', fontSize: 9,
        color: 'rgba(82,183,136,0.6)',
        letterSpacing: 1,
      }}>
        IMG PLACEHOLDER · {Math.round(pct)}%
      </div>

      {/* 海拔水位线 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: `${pct * 0.4}%`,
        background: 'linear-gradient(180deg, transparent, rgba(45,106,79,0.15))',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// 精选山峰大卡（探索页顶部）
export function MountainFeatureCard({ mountain }: { mountain: {
  id: string, name: string, altitude: number, province: string,
  difficulty: string, checkin_count: number, min_license: string, cover_image?: string
}}) {
  const isLocked = mountain.min_license !== 'none'
  return (
    <Link href={`/explore/${mountain.id}`} style={{ textDecoration: 'none' }}>
      <div className="mountain-card" style={{ marginBottom: 16, opacity: isLocked ? 0.75 : 1 }}>
        {/* 山峰图片区 - 大尺寸 */}
        <div style={{ margin: '-16px -16px 12px -16px', position: 'relative' }}>
          <MountainImagePlaceholder
            name={mountain.name}
            altitude={mountain.altitude}
            size="lg"
            coverImage={mountain.cover_image}
          />
          {/* 图片叠层：左下角山名 */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '24px 12px 10px',
            background: 'linear-gradient(transparent, rgba(5,10,5,0.92))',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <div className="font-pixel" style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {isLocked ? '🔒 ' : ''}{mountain.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>
                  {mountain.province}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="altitude-tag" style={{ fontSize: 12 }}>
                  {mountain.altitude.toLocaleString()}m
                </div>
                <DifficultyBadge level={mountain.difficulty} />
              </div>
            </div>
          </div>
          {/* 锁定遮罩 */}
          {isLocked && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 32 }}>🔒</span>
            </div>
          )}
        </div>

        {/* 海拔进度 */}
        <AltitudeBar altitude={mountain.altitude} />

        {/* 底部数据行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>
          <span>▲ {mountain.checkin_count.toLocaleString()} 人登顶</span>
          {isLocked
            ? <span style={{ color: '#E76F51', fontSize: 9 }}>需执照解锁 →</span>
            : <span style={{ color: 'var(--green-bright)' }}>查看详情 →</span>
          }
        </div>
      </div>
    </Link>
  )
}

// 山峰列表卡片（横向布局，左图右文）
export function MountainCard({ mountain }: { mountain: {
  id: string, name: string, altitude: number, province: string,
  difficulty: string, checkin_count: number, min_license: string, cover_image?: string
}}) {
  const isLocked = mountain.min_license !== 'none'
  return (
    <Link href={`/explore/${mountain.id}`} style={{ textDecoration: 'none' }}>
      <div className="mountain-card" style={{ marginBottom: 10, opacity: isLocked ? 0.72 : 1 }}>
        <div style={{ display: 'flex', gap: 12 }}>

          {/* 左侧：山峰图片 */}
          <div style={{ flexShrink: 0, width: 88, position: 'relative' }}>
            <MountainImagePlaceholder
              name={mountain.name}
              altitude={mountain.altitude}
              size="sm"
              coverImage={mountain.cover_image}
            />
            {isLocked && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>🔒</div>
            )}
          </div>

          {/* 右侧：信息区 */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {/* 顶行：山名 + 难度 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="font-pixel" style={{ fontSize: 9, color: isLocked ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom: 3, lineHeight: 1.6 }}>
                  {mountain.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Share Tech Mono' }}>
                  {mountain.province}
                </div>
              </div>
              <DifficultyBadge level={mountain.difficulty} />
            </div>

            {/* 中间：海拔条 */}
            <div style={{ margin: '8px 0 4px' }}>
              <AltitudeBar altitude={mountain.altitude} />
            </div>
            {/* 底行：数据 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Share Tech Mono' }}>
            <span className="altitude-tag">{mountain.altitude.toLocaleString()}m</span>
            {isLocked
              ? <span style={{ color: '#E76F51', fontSize: 8 }}>需执照</span>
              : <span style={{ color: 'var(--text-muted)' }}>▲ {mountain.checkin_count.toLocaleString()}人</span>
            }
          </div>
        </div>

      </div>
    </div>
    </Link>
  )
}
