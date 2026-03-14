import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// 海拔剖面路径点生成（模拟真实山峰剖面曲线）
function generateAltitudeProfile(altitude: number, points = 60): number[] {
  const profile: number[] = []
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    // 经典登山曲线：缓升→陡升→顶峰→下降
    let h: number
    if (t < 0.1) {
      h = t * 2 * 0.3 // 营地出发，缓坡
    } else if (t < 0.5) {
      const s = (t - 0.1) / 0.4
      h = 0.06 + s * s * 0.85 // 主攀升段，指数曲线
    } else if (t < 0.55) {
      h = 0.91 + (t - 0.5) * 1.8 // 顶峰冲刺
    } else if (t < 0.6) {
      h = 1.0 - (t - 0.55) * 0.4 // 顶峰平台
    } else {
      const s = (t - 0.6) / 0.4
      h = 0.98 - s * s * 0.85 // 下山，先慢后快
    }
    // 加入轻微噪声模拟真实地形
    const noise = (Math.sin(i * 1.7) * 0.02 + Math.cos(i * 3.1) * 0.015)
    profile.push(Math.max(0, Math.min(1, h + noise)) * altitude)
  }
  return profile
}

// 将海拔数组转为 SVG path 字符串（浮雕感线条）
function profileToSvgPath(
  profile: number[],
  maxAlt: number,
  width: number,
  height: number,
  padding: number
): { line: string; fill: string } {
  const drawH = height - padding * 2
  const drawW = width - padding * 2

  const pts = profile.map((alt, i) => {
    const x = padding + (i / (profile.length - 1)) * drawW
    const y = padding + drawH - (alt / maxAlt) * drawH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const line = `M ${pts.join(' L ')}`
  const fill = `M ${padding},${padding + drawH} L ${pts.join(' L ')} L ${padding + drawW},${padding + drawH} Z`
  return { line, fill }
}

// 用 SVG 字符串生成海报（不依赖 Canvas，纯 SVG → sharp）
function buildPosterSVG({
  mountainName,
  altitude,
  province,
  difficulty,
  username,
  licenseLevel,
  checkinDate,
  checkinType,
  note,
}: {
  mountainName: string
  altitude: number
  province: string
  difficulty: string
  username: string
  licenseLevel: string
  checkinDate: string
  checkinType: string
  note?: string
}): string {
  const W = 750
  const H = 1334  // 9:16 竖屏比例

  const profile = generateAltitudeProfile(altitude)
  const { line, fill } = profileToSvgPath(profile, altitude, W, 220, 16)

  const diffColor: Record<string, string> = {
    beginner: '#52B788',
    intermediate: '#F4A261',
    advanced: '#E76F51',
    expert: '#E63946',
  }
  const diffLabel: Record<string, string> = {
    beginner: '入门', intermediate: '中级', advanced: '高级', expert: '专家',
  }
  const licenseIcon: Record<string, string> = {
    none: '○', basic: '◉', intermediate: '◈', advanced: '★',
  }
  const licenseLabel: Record<string, string> = {
    none: '无执照', basic: '初级登山证', intermediate: '中级登山证', advanced: '高级登山证',
  }

  const accent = diffColor[difficulty] ?? '#52B788'
  const date = new Date(checkinDate)
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  // 像素星点（仅上半区）
  const stars = Array.from({ length: 50 }, (_, i) => {
    const x = ((i * 173.3) % W).toFixed(0)
    const y = ((i * 91.7) % (H * 0.5)).toFixed(0)
    const r = i % 4 === 0 ? 2 : 1
    const op = (0.15 + (i % 6) * 0.08).toFixed(2)
    return `<rect x="${x}" y="${y}" width="${r}" height="${r}" fill="#39FF14" opacity="${op}"/>`
  }).join('\n')

  // 等高线网格（剖面区背景）
  const contours = Array.from({ length: 4 }, (_, i) => {
    const y = 760 + i * 52
    return `<line x1="30" y1="${y}" x2="${W - 30}" y2="${y}" stroke="${accent}" stroke-width="0.5" stroke-dasharray="3,10" opacity="0.2"/>`
  }).join('\n')

  // 海拔刻度
  const altTicks = Array.from({ length: 3 }, (_, i) => {
    const pct = (i + 1) / 4
    const y = (990 - pct * 200).toFixed(0)
    const a = Math.round(altitude * pct).toLocaleString()
    return `<text x="${W - 28}" y="${y}" font-family="monospace" font-size="13" fill="${accent}" text-anchor="end" opacity="0.5">${a}</text>`
  }).join('\n')

  // 感言（最多24字，两行显示）
  const rawNote = (note ?? '').slice(0, 48)
  const line1 = rawNote.slice(0, 24)
  const line2 = rawNote.slice(24)
  const noteBlock = rawNote.length > 0 ? `
    <text x="${W / 2}" y="1098" font-family="monospace" font-size="20" fill="#D1FAE5" text-anchor="middle" opacity="0.85">"${line1}</text>
    ${line2 ? `<text x="${W / 2}" y="1124" font-family="monospace" font-size="20" fill="#D1FAE5" text-anchor="middle" opacity="0.85">${line2}"</text>` : `<text x="${W / 2}" y="1098" font-family="monospace" font-size="20" fill="#D1FAE5" text-anchor="middle" opacity="0.85">"${line1}"</text>`}
  ` : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- 背景（模拟用户照片占位，后续替换为 image 标签） -->
    <linearGradient id="photoBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#0a1a14"/>
      <stop offset="50%"  stop-color="#050f0a"/>
      <stop offset="100%" stop-color="#020808"/>
    </linearGradient>

    <!-- 毛玻璃遮罩：顶部压暗 -->
    <linearGradient id="topMask" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>

    <!-- 毛玻璃遮罩：底部信息区压暗 -->
    <linearGradient id="bottomMask" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="30%"  stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
    </linearGradient>

    <!-- 剖面区毛玻璃底色 -->
    <linearGradient id="glassBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
    </linearGradient>

    <!-- 剖面填充渐变 -->
    <linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.02"/>
    </linearGradient>

    <!-- 海拔数字光晕 -->
    <filter id="altGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- 剖面线光晕 -->
    <filter id="lineGlow" x="-5%" y="-20%" width="110%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- 毛玻璃模糊（用于信息块背景） -->
    <filter id="glassBlur">
      <feGaussianBlur stdDeviation="12"/>
    </filter>

    <!-- 网格 -->
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M30 0L0 0 0 30" fill="none" stroke="${accent}" stroke-width="0.3" opacity="0.15"/>
    </pattern>
  </defs>

  <!-- ━━━ 图层1：背景（照片占位） ━━━ -->
  <rect width="${W}" height="${H}" fill="url(#photoBg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>

  <!-- 星点装饰 -->
  ${stars}

  <!-- ━━━ 图层2：毛玻璃遮罩层 ━━━ -->
  <!-- 顶部压暗（保证 LOGO + 打卡类型可读） -->
  <rect x="0" y="0" width="${W}" height="220" fill="url(#topMask)"/>
  <!-- 底部压暗（保证信息区可读）-->
  <rect x="0" y="680" width="${W}" height="${H - 680}" fill="url(#bottomMask)"/>

  <!-- ━━━ 图层3：顶部 LOGO 区 ━━━ -->
  <!-- 难度色顶边 -->
  <rect x="0" y="0" width="${W}" height="4" fill="${accent}"/>
  <!-- LOGO -->
  <text x="40" y="62" font-family="monospace" font-size="17" fill="${accent}" letter-spacing="5" opacity="0.95">PEAK TREKKER</text>
  <text x="40" y="86" font-family="monospace" font-size="12" fill="#6B7280" letter-spacing="2">// SUMMIT RECORD</text>

  <!-- 打卡类型徽章（右上） -->
  <rect x="${W - 154}" y="44" width="114" height="26"
    fill="${checkinType === 'gps' ? 'rgba(57,255,20,0.12)' : 'rgba(244,162,97,0.12)'}"
    stroke="${checkinType === 'gps' ? '#39FF14' : '#F4A261'}" stroke-width="1" rx="2"/>
  <text x="${W - 97}" y="62" font-family="monospace" font-size="13"
    fill="${checkinType === 'gps' ? '#39FF14' : '#F4A261'}" text-anchor="middle">
    ${checkinType === 'gps' ? 'GPS VERIFIED' : 'PHOTO CHECK'}
  </text>

  <!-- ━━━ 图层4：核心信息区（中部毛玻璃卡片）━━━ -->
  <!-- 毛玻璃背景板 -->
  <rect x="0" y="340" width="${W}" height="420" fill="#000000" opacity="0.01" filter="url(#glassBlur)"/>
  <rect x="30" y="350" width="${W - 60}" height="390" fill="#0a1a10" opacity="0.55" rx="2"/>
  <rect x="30" y="350" width="${W - 60}" height="390" fill="none"
    stroke="${accent}" stroke-width="1" opacity="0.25" rx="2"/>
  <!-- 卡片左侧难度色条 -->
  <rect x="30" y="350" width="4" height="390" fill="${accent}" rx="2"/>

  <!-- 山峰名称（大字） -->
  <text x="58" y="430" font-family="monospace" font-size="58" font-weight="bold"
    fill="#FFFFFF" letter-spacing="-1" opacity="0.95">${mountainName}</text>

  <!-- 省份 + 难度标签 -->
  <text x="60" y="468" font-family="monospace" font-size="18" fill="#9CA3AF">${province}</text>
  <rect x="${60 + province.length * 11 + 16}" y="450" width="58" height="22"
    fill="${accent}22" stroke="${accent}" stroke-width="1" rx="1"/>
  <text x="${60 + province.length * 11 + 45}" y="466" font-family="monospace" font-size="12"
    fill="${accent}" text-anchor="middle">${diffLabel[difficulty] ?? difficulty}</text>

  <!-- 分隔线 -->
  <line x1="58" y1="488" x2="${W - 58}" y2="488" stroke="${accent}" stroke-width="0.5" opacity="0.3"/>

  <!-- ★ 海拔大字（视觉重心） -->
  <text x="58" y="560" font-family="monospace" font-size="96" font-weight="bold"
    fill="${accent}" filter="url(#altGlow)" opacity="0.95">${altitude.toLocaleString()}</text>
  <text x="62" y="595" font-family="monospace" font-size="16" fill="${accent}" opacity="0.6"
    letter-spacing="3">METERS ABOVE SEA</text>

  <!-- vs 珠峰百分比 -->
  <text x="${W - 58}" y="560" font-family="monospace" font-size="15" fill="#6B7280"
    text-anchor="end">vs 珠峰</text>
  <text x="${W - 58}" y="585" font-family="monospace" font-size="28" fill="#E8F5E9"
    text-anchor="end" font-weight="bold">${((altitude / 8848) * 100).toFixed(1)}%</text>

  <!-- ★ 登顶时间（视觉重心） -->
  <text x="58" y="658" font-family="monospace" font-size="44" font-weight="bold"
    fill="#FFFFFF" opacity="0.9">${dateStr}</text>
  <text x="${W - 58}" y="658" font-family="monospace" font-size="44" font-weight="bold"
    fill="${accent}" text-anchor="end" opacity="0.85">${timeStr}</text>
  <text x="58" y="682" font-family="monospace" font-size="12" fill="#6B7280"
    letter-spacing="2">SUMMIT DATE</text>
  <text x="${W - 58}" y="682" font-family="monospace" font-size="12" fill="#6B7280"
    text-anchor="end" letter-spacing="2">LOCAL TIME</text>

  <!-- ━━━ 图层5：海拔剖面图（浮雕水印）━━━ -->
  <g transform="translate(0, 760)">
    ${contours}
    ${altTicks}
    <!-- 剖面填充 -->
    <path d="${fill}" fill="url(#profileFill)"/>
    <!-- 外发光描边 -->
    <path d="${line}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.25" filter="url(#lineGlow)"/>
    <!-- 主线 -->
    <path d="${line}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.8"/>
    <!-- 顶峰发光点 -->
    <circle cx="${W / 2}" cy="24" r="6" fill="${accent}" opacity="0.9" filter="url(#lineGlow)"/>
    <circle cx="${W / 2}" cy="24" r="12" fill="${accent}" opacity="0.15"/>
    <!-- 基准线 -->
    <line x1="30" y1="208" x2="${W - 30}" y2="208" stroke="${accent}" stroke-width="0.8" opacity="0.35"/>
    <text x="34" y="224" font-family="monospace" font-size="11" fill="${accent}" opacity="0.5">0 m</text>
    <text x="${W / 2}" y="224" font-family="monospace" font-size="11" fill="#6B7280"
      text-anchor="middle" opacity="0.6">— ALTITUDE PROFILE —</text>
    <text x="${W - 34}" y="224" font-family="monospace" font-size="11" fill="${accent}"
      text-anchor="end" opacity="0.9">▲ ${altitude.toLocaleString()} m</text>
  </g>

  <!-- ━━━ 图层6：感言区 ━━━ -->
  ${noteBlock}

  <!-- ━━━ 图层7：用户信息（底部毛玻璃条）━━━ -->
  <!-- 用户信息毛玻璃底条 -->
  <rect x="0" y="${H - 130}" width="${W}" height="130" fill="#000000" opacity="0.5"/>
  <rect x="0" y="${H - 130}" width="${W}" height="1" fill="${accent}" opacity="0.2"/>

  <!-- 头像 -->
  <rect x="36" y="${H - 104}" width="56" height="56" fill="#0f2318" stroke="${accent}" stroke-width="1.5" rx="2"/>
  <text x="64" y="${H - 66}" font-family="monospace" font-size="26" fill="${accent}"
    text-anchor="middle">${username.slice(0, 1).toUpperCase()}</text>

  <!-- 用户信息 -->
  <text x="108" y="${H - 84}" font-family="monospace" font-size="20" font-weight="bold"
    fill="#E8F5E9">${username}</text>
  <text x="108" y="${H - 60}" font-family="monospace" font-size="13" fill="#6B7280">
    ${licenseIcon[licenseLevel] ?? '○'} ${licenseLabel[licenseLevel] ?? '无执照'}
  </text>

  <!-- 右侧 LOGO 水印 -->
  <text x="${W - 36}" y="${H - 72}" font-family="monospace" font-size="13" fill="${accent}"
    text-anchor="end" letter-spacing="2" opacity="0.7">PEAK TREKKER</text>
  <text x="${W - 36}" y="${H - 50}" font-family="monospace" font-size="11" fill="#374151"
    text-anchor="end">peaktrekker.app</text>

  <!-- 底部难度色条 -->
  <rect x="0" y="${H - 5}" width="${W}" height="5" fill="${accent}" opacity="0.6"/>
</svg>`
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const checkinId = searchParams.get('checkinId')

  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId required' }, { status: 400 })
  }

  // demo 模式：直接用固定数据生成预览
  if (checkinId === 'demo') {
    const svg = buildPosterSVG({
      mountainName: '珠穆朗玛峰',
      altitude:     8848,
      province:     '西藏',
      difficulty:   'expert',
      username:     'TrekkerDemo',
      licenseLevel: 'advanced',
      checkinDate:  new Date().toISOString(),
      checkinType:  'gps',
      note:         '站在世界之巅，万里云海尽收眼底',
    })
    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
    })
  }

  const supabase = await createSupabaseServerClient()

  const { data: checkin, error } = await supabase
    .from('checkins')
    .select(`
      id, type, note, created_at, status,
      mountains(name, altitude, province, difficulty),
      profiles(username, license_level)
    `)
    .eq('id', checkinId)
    .eq('status', 'approved')
    .single()

  if (error || !checkin) {
    return NextResponse.json({ error: 'Checkin not found' }, { status: 404 })
  }

  const m = (checkin.mountains as any)
  const p = (checkin.profiles as any)

  const svg = buildPosterSVG({
    mountainName: m?.name ?? '未知山峰',
    altitude:     m?.altitude ?? 0,
    province:     m?.province ?? '',
    difficulty:   m?.difficulty ?? 'beginner',
    username:     p?.username ?? '登山者',
    licenseLevel: p?.license_level ?? 'none',
    checkinDate:  checkin.created_at,
    checkinType:  checkin.type,
    note:         checkin.note ?? '',
  })

  // 尝试用 sharp 转 PNG，失败则直接返回 SVG
  try {
    const sharp = (await import('sharp')).default
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    return new NextResponse(png.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="peak-trekker-${m?.name ?? 'summit'}.png"`,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }
}
