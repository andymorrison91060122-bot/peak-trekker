'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 像素风 SVG 图标 - 登山工具主题
const TabIcons = {
  explore: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ imageRendering: 'pixelated' }}>
      {/* 山形轮廓 */}
      <polygon points="11,3 3,18 19,18" fill="none" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" strokeLinejoin="round"/>
      <polygon points="15,9 10,18 20,18" fill={active ? 'rgba(57,255,20,0.15)' : 'rgba(75,85,99,0.1)'} stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" strokeLinejoin="round"/>
      {/* 山顶旗帜 */}
      <rect x="10.5" y="1" width="1" height="4" fill={active ? '#39FF14' : '#4B5563'}/>
      <polygon points="11.5,1 15,2.5 11.5,4" fill={active ? '#39FF14' : '#4B5563'}/>
    </svg>
  ),
  prep: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ imageRendering: 'pixelated' }}>
      {/* 背包 */}
      <rect x="6" y="8" width="10" height="11" rx="1" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" fill={active ? 'rgba(57,255,20,0.1)' : 'none'}/>
      {/* 背包带 */}
      <path d="M8 8 Q8 5 11 5 Q14 5 14 8" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" fill="none"/>
      {/* 口袋 */}
      <rect x="8" y="13" width="6" height="4" rx="0.5" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1"/>
      {/* 带扣 */}
      <line x1="9" y1="10" x2="13" y2="10" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1"/>
    </svg>
  ),
  trek: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ imageRendering: 'pixelated' }}>
      {/* 登山杖 */}
      <line x1="14" y1="4" x2="8" y2="19" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5"/>
      <line x1="6" y1="19" x2="10" y2="19" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5"/>
      <circle cx="14" cy="4" r="1.5" fill={active ? '#39FF14' : '#4B5563'}/>
      {/* 靴子 */}
      <rect x="4" y="15" width="7" height="4" rx="1" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" fill={active ? 'rgba(57,255,20,0.15)' : 'none'}/>
      <rect x="3" y="18" width="9" height="2" rx="0.5" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1"/>
    </svg>
  ),
  community: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ imageRendering: 'pixelated' }}>
      {/* 三座小山 = 社区 */}
      <polygon points="11,5 6,14 16,14" fill={active ? 'rgba(57,255,20,0.15)' : 'none'} stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" strokeLinejoin="round"/>
      <polygon points="5,9 2,14 8,14" fill="none" stroke={active ? '#52B788' : '#374151'} strokeWidth="1.2" strokeLinejoin="round"/>
      <polygon points="17,9 14,14 20,14" fill="none" stroke={active ? '#52B788' : '#374151'} strokeWidth="1.2" strokeLinejoin="round"/>
      {/* 地面线 */}
      <line x1="1" y1="17" x2="21" y2="17" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1" strokeDasharray="2,2"/>
    </svg>
  ),
  profile: (active: boolean) => (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ imageRendering: 'pixelated' }}>
      {/* 勋章/执照样式 */}
      <circle cx="11" cy="9" r="4" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" fill={active ? 'rgba(57,255,20,0.1)' : 'none'}/>
      <path d="M5 19 Q5 14 11 14 Q17 14 17 19" stroke={active ? '#39FF14' : '#4B5563'} strokeWidth="1.5" fill="none"/>
      {/* 顶部星章 */}
      {active && <polygon points="11,5 11.5,7 13,7 12,8 12.5,10 11,9 9.5,10 10,8 9,7 10.5,7" fill="#39FF14" opacity="0.8"/>}
    </svg>
  ),
}

const tabs = [
  { href: '/explore', label: '探索', icon: TabIcons.explore },
  { href: '/prep',    label: '备赛', icon: TabIcons.prep },
  { href: '/trek',    label: '出发', icon: TabIcons.trek },
  { href: '/community', label: '山友圈', icon: TabIcons.community },
  { href: '/profile', label: '我的', icon: TabIcons.profile },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(10,10,10,0.97)',
        backdropFilter: 'blur(8px)',
        // 顶部山形锯齿边框
        borderTop: 'none',
        boxShadow: '0 -2px 0 #2D6A4F, 0 -4px 0 rgba(45,106,79,0.2), 0 -1px 20px rgba(57,255,20,0.08)'
      }}
    >
      {/* 顶部刻度线 */}
      <div style={{
        height: '2px',
        background: 'repeating-linear-gradient(90deg, var(--green-primary) 0, var(--green-primary) 3px, transparent 3px, transparent 7px)',
      }} />

      <div className="flex justify-around items-center py-2 max-w-lg mx-auto" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-1 relative"
              style={{ minWidth: 56, padding: '4px 0' }}
            >
              {/* 激活时的背景光晕 */}
              {isActive && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 44, height: 44, borderRadius: 0,
                  background: 'radial-gradient(ellipse, rgba(57,255,20,0.12) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }} />
              )}
              {tab.icon(isActive)}
              <span
                className="font-pixel"
                style={{
                  fontSize: 7,
                  color: isActive ? '#39FF14' : '#4B5563',
                  textShadow: isActive ? '0 0 6px rgba(57,255,20,0.8)' : 'none',
                  lineHeight: 1,
                }}
              >
                {tab.label}
              </span>
              {/* 激活指示点 */}
              {isActive && (
                <div className="glow-pulse" style={{
                  width: 3, height: 3,
                  background: '#39FF14',
                  marginTop: 1,
                }} />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
