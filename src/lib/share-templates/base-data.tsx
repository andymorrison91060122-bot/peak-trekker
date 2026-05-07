import type { ShareTemplateData } from './types'
import {
  BrandFooter,
  C,
  DataRow,
  PosterShell,
  buildMountainLine,
  formatPlainNumber,
} from './shared'

function MountainTexture() {
  const ridges = [
    'M-40 760 L160 610 L275 690 L442 520 L620 730 L760 560 L1120 820',
    'M-60 850 L172 690 L322 770 L482 610 L648 820 L802 668 L1140 940',
    'M-80 690 L155 540 L292 638 L438 470 L610 684 L782 502 L1160 780',
    'M40 980 L220 820 L370 910 L540 760 L720 970 L886 835 L1080 1030',
    'M-40 1130 L185 960 L344 1045 L540 895 L736 1110 L902 972 L1140 1200',
    'M-70 1240 L155 1055 L330 1160 L525 1010 L708 1220 L920 1088 L1160 1325',
  ]

  return (
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      {ridges.map((path, index) => (
        <path
          key={path}
          d={path}
          stroke={C.fg}
          strokeWidth={index === 0 ? 2.8 : 1.45}
          fill="none"
          opacity={index === 0 ? 0.12 : index < 4 ? 0.065 : 0.045}
        />
      ))}
      {Array.from({ length: 16 }).map((_, index) => (
        <path
          key={index}
          d={`M${30 + index * 66} 1120 C ${96 + index * 62} 920 ${154 + index * 54} 700 ${222 + index * 48} 470`}
          stroke={C.fg}
          strokeWidth="1"
          fill="none"
          opacity=".04"
        />
      ))}
    </svg>
  )
}

export function BaseDataTemplate({ data }: { data: ShareTemplateData }) {
  const mountainLine = buildMountainLine(data)

  return (
    <PosterShell background="linear-gradient(180deg, #12181b 0%, #0a0c0e 100%)">
      <MountainTexture />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 30%, rgba(110, 231, 161, 0.14), transparent 30%), linear-gradient(180deg, rgba(18, 20, 22, 0.05), rgba(10, 12, 14, 0.7) 72%, #0a0c0e 100%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'absolute',
          left: 52,
          right: 52,
          top: 500,
        }}
      >
        <span style={{ color: C.fg2, fontSize: 38, lineHeight: 1, fontWeight: 800, letterSpacing: '0.08em' }}>
          峰顶海拔
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginTop: 46 }}>
          <span style={{ color: C.success, fontSize: 238, lineHeight: 0.92, fontWeight: 800, letterSpacing: '0' }}>
            {formatPlainNumber(data.altitude)}
          </span>
          <span style={{ color: C.success, fontSize: 78, lineHeight: 1, fontWeight: 800, marginLeft: 12 }}>m</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 520,
        }}
      >
        {mountainLine ? (
          <span style={{ color: C.fg, fontSize: 40, lineHeight: 1.2, fontWeight: 800, letterSpacing: '0', textAlign: 'center' }}>
            {mountainLine}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 72, right: 72, bottom: 360 }}>
        <DataRow data={data} />
      </div>

      <div style={{ display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 58 }}>
        <BrandFooter source={data.source} />
      </div>
    </PosterShell>
  )
}
