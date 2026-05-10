'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

type IntroCarouselProps = {
  currentIndex: number
  reducedMotion: boolean
  onNext: () => void
  onSkip: () => void
}

type SlideCopy = {
  eyebrow: string
  title: [string, string]
  body: string[]
}

const SLIDES: SlideCopy[] = [
  {
    eyebrow: '01 · 选山',
    title: ['先认识这座山', '再决定走不走'],
    body: ['浏览国内可登顶的山峰 · 看清海拔、距离、季节窗口', '与等级要求。', '在出发前，了解每一座山。'],
  },
  {
    eyebrow: '02 · 记录',
    title: ['现场记录或事后导入', '都是你的山行'],
    body: ['山上轻量记录海拔与轨迹 · 不依赖复杂导航。', '没用 Peak Trekker 也没关系 · 一份 GPX 文件就能补', '回这次经历。'],
  },
  {
    eyebrow: '03 · 留下',
    title: ['让这次山行', '留下来'],
    body: ['几张照片、一段心里的话、一张可分享的留证 ·', '放进属于你的山行档案。', '发不发出去，由你决定。'],
  },
]

const surfaceShadow = '0 18px 40px color-mix(in oklch, var(--color-surface) 70%, transparent)'
const softBorder = '1px solid color-mix(in oklch, var(--color-outline) 72%, transparent)'
const mutedPanel = 'color-mix(in oklch, var(--color-surface-variant) 80%, transparent)'

function useCountUpValue({
  active,
  durationMs,
  reducedMotion,
  target,
}: {
  active: boolean
  durationMs: number
  reducedMotion: boolean
  target: number
}) {
  const hasCompletedRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const valueRef = useRef(reducedMotion ? target : 0)
  const [value, setValue] = useState(reducedMotion ? target : 0)

  useEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    if (reducedMotion || hasCompletedRef.current) {
      valueRef.current = target
      hasCompletedRef.current = true
      return undefined
    }

    if (!active) return undefined

    const startedAt = window.performance.now()
    const startValue = valueRef.current
    const delta = target - startValue
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextValue = startValue + delta * eased
      valueRef.current = nextValue
      setValue(nextValue)

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(tick)
        return
      }

      valueRef.current = target
      setValue(target)
      hasCompletedRef.current = true
      frameRef.current = null
    }

    frameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [active, durationMs, reducedMotion, target])

  return value
}

function LogoMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 18" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2 16L8.5 5L12 10L15 6L22 16Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MountainSketch({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  const paths = compact
    ? [
        {
          d: 'M8 52L46 28L78 42L112 19L150 43L184 30L252 54',
          stroke: 'color-mix(in oklch, var(--color-success) 44%, transparent)',
          strokeWidth: 1.2,
          delay: '0ms',
        },
        {
          d: 'M12 60L58 39L88 18L130 44L164 24L206 42L250 58',
          stroke: 'var(--color-success)',
          strokeWidth: 1.6,
          delay: '180ms',
        },
      ]
    : [
        {
          d: 'M4 68L42 38L76 52L112 26L148 44L184 30L256 58',
          stroke: 'color-mix(in oklch, var(--color-success) 30%, transparent)',
          strokeWidth: 1.5,
          delay: '0ms',
        },
        {
          d: 'M2 73L36 48L72 30L112 52L150 36L194 52L258 46',
          stroke: 'color-mix(in oklch, var(--color-success) 50%, transparent)',
          strokeWidth: 1.5,
          delay: '200ms',
        },
        {
          d: 'M0 78L48 52L86 24L126 46L166 24L208 42L260 66',
          stroke: 'var(--color-success)',
          strokeWidth: 2,
          delay: '400ms',
        },
      ]

  return (
    <svg
      className={`pt-mountain-sketch ${active ? 'pt-is-active' : ''}`}
      width="100%"
      height={compact ? 64 : 86}
      viewBox="0 0 260 86"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path, index) => (
        <path
          key={path.d}
          className="pt-mountain-path"
          d={path.d}
          stroke={path.stroke}
          strokeWidth={path.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animationDelay: path.delay, '--pt-path-order': index } as CSSProperties}
        />
      ))}
    </svg>
  )
}

function StatCell({ active = false, label, last = false, reducedMotion = false, value }: { active?: boolean; label: string; last?: boolean; reducedMotion?: boolean; value: string }) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: '0 3px',
        textAlign: 'center',
        borderRight: last ? 'none' : softBorder,
      }}
    >
      <div
        className={active ? 'pt-stat-value pt-is-active' : 'pt-stat-value'}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-on-surface)',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          animationDelay: reducedMotion ? undefined : '120ms',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 11,
          color: 'var(--color-on-surface-variant)',
          lineHeight: 1,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function ChooseMountainPreview({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const altitude = useCountUpValue({ active, durationMs: 800, reducedMotion, target: 6178 })
  const distance = useCountUpValue({ active, durationMs: 800, reducedMotion, target: 12.4 })
  const hours = useCountUpValue({ active, durationMs: 800, reducedMotion, target: 6 })

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 24 }}>
      <div
        data-testid="onboarding-intro-mountain-stack"
        style={{ position: 'relative', width: 280, maxWidth: '100%', padding: '0 0 18px' }}
      >
        <div
          data-testid="onboarding-intro-mountain-stack-back-2"
          style={{
            position: 'absolute',
            top: 16,
            left: 14,
            right: -14,
            height: 'calc(100% - 18px)',
            borderRadius: 20,
            background: mutedPanel,
            border: softBorder,
            opacity: 0.4,
            transform: 'rotate(3deg)',
            zIndex: 0,
          }}
        />
        <div
          data-testid="onboarding-intro-mountain-stack-back-1"
          style={{
            position: 'absolute',
            top: 8,
            left: -8,
            right: 8,
            height: 'calc(100% - 18px)',
            borderRadius: 20,
            background: mutedPanel,
            border: softBorder,
            opacity: 0.6,
            transform: 'rotate(-2deg)',
            zIndex: 1,
          }}
        />
        <div
          data-testid="onboarding-intro-mountain-card"
          style={{
            position: 'relative',
            zIndex: 2,
            borderRadius: 20,
            padding: 16,
            background: 'var(--color-surface-variant)',
            border: softBorder,
            boxShadow: surfaceShadow,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              padding: '4px 10px',
              background: 'color-mix(in oklch, var(--color-success) 12%, transparent)',
              border: '1px solid color-mix(in oklch, var(--color-success) 30%, transparent)',
              color: 'var(--color-success)',
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            中级及以上
          </div>

          <div style={{ margin: '12px 0 10px' }}>
            <MountainSketch active={active} />
          </div>

          <div style={{ marginBottom: 15 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-on-surface)', lineHeight: 1.2 }}>
              玉珠峰
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-on-surface-variant)', lineHeight: 1.25 }}>
              青海 · 格尔木
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <StatCell
              active={active}
              reducedMotion={reducedMotion}
              value={Math.round(altitude).toLocaleString('en-US')}
              label="海拔"
            />
            <StatCell
              active={active}
              reducedMotion={reducedMotion}
              value={distance.toFixed(1)}
              label="距离"
            />
            <StatCell active={active} reducedMotion={reducedMotion} value="1.2k" label="爬升" />
            <StatCell
              active={active}
              reducedMotion={reducedMotion}
              value={`${Math.round(hours)}h`}
              label="时长"
              last
            />
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'inline-flex',
          justifyContent: 'center',
          borderRadius: 999,
          padding: '4px 10px',
          background: mutedPanel,
          color: 'var(--color-on-surface-variant)',
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.2,
        }}
      >
        初级 · 5-7月
      </div>
    </div>
  )
}

function MiniAltitudeBars({ active }: { active: boolean }) {
  return (
    <div
      className={`pt-intro-bars ${active ? 'pt-is-active' : ''}`}
      style={{
        height: 44,
        display: 'grid',
        gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
        alignItems: 'end',
        gap: 4,
      }}
      aria-hidden="true"
    >
      {[16, 22, 18, 28, 34, 26, 38, 31, 42].map((height, index) => (
        <span
          key={height + index}
          style={{
            display: 'block',
            height,
            borderRadius: 999,
            background:
              index < 6
                ? 'color-mix(in oklch, var(--color-success) 70%, transparent)'
                : 'color-mix(in oklch, var(--color-outline) 72%, transparent)',
            animationDelay: `${index * 60}ms`,
          }}
        />
      ))}
    </div>
  )
}

function RecordImportPreview({ active }: { active: boolean }) {
  return (
    <div className={`pt-record-preview ${active ? 'pt-is-active' : ''}`}>
      <div
        data-testid="onboarding-intro-record-grid"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
      >
        <div
          className="pt-record-card-left"
          style={{
            minWidth: 0,
            borderRadius: 16,
            padding: '14px 12px',
            background: 'var(--color-surface-variant)',
            border: softBorder,
            boxShadow: surfaceShadow,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span
              className="pt-intro-record-dot"
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: 'var(--color-success)',
                flex: '0 0 auto',
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-success)', lineHeight: 1 }}>
              记录中
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-on-surface-variant)', lineHeight: 1.2 }}>
            当前海拔
          </div>
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--color-success)',
                lineHeight: 1,
              }}
            >
              5,240
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-on-surface-variant)' }}>
              m
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <MiniAltitudeBars active={active} />
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-on-surface-variant)',
              lineHeight: 1.2,
            }}
          >
            距峰顶 938m
          </div>
          <div
            style={{
              marginTop: 12,
              borderRadius: 999,
              padding: '7px 8px',
              background: 'color-mix(in oklch, var(--color-success) 12%, transparent)',
              color: 'var(--color-success)',
              fontSize: 11,
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            实时记录
          </div>
        </div>

        <div
          className="pt-record-card-right"
          style={{
            minWidth: 0,
            borderRadius: 16,
            padding: '14px 12px',
            background: 'var(--color-surface-variant)',
            border: softBorder,
            boxShadow: surfaceShadow,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 13 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path
                d="M12 4v12M7 11l5 5 5-5M5 20h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-on-surface)', lineHeight: 1 }}>
              导入轨迹
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--color-on-surface)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            2024-09-22.gpx
          </div>
          <div style={{ margin: '12px 0 10px', height: 58 }}>
            <svg width="100%" height="58" viewBox="0 0 132 58" fill="none" aria-hidden="true" focusable="false">
              <path
                d="M10 46C28 39 34 26 48 30C63 34 68 14 84 13C98 12 104 35 122 24"
                stroke="color-mix(in oklch, var(--color-outline) 84%, transparent)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M10 46C28 39 34 26 48 30C63 34 68 14 84 13C98 12 104 35 122 24"
                stroke="var(--color-trail)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              <circle cx="10" cy="46" r="3" fill="color-mix(in oklch, var(--color-on-surface-variant) 80%, transparent)" />
              <circle cx="122" cy="24" r="4" fill="var(--color-success)" />
            </svg>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-on-surface-variant)',
              lineHeight: 1.2,
            }}
          >
            5,396m · 7h12m
          </div>
          <div
            style={{
              marginTop: 12,
              borderRadius: 999,
              padding: '7px 8px',
              border: softBorder,
              color: 'var(--color-on-surface-variant)',
              fontSize: 11,
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            事后补录
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <span
          style={{
            display: 'inline-flex',
            borderRadius: 999,
            padding: '6px 12px',
            background: mutedPanel,
            color: 'var(--color-on-surface-variant)',
            fontSize: 11,
            lineHeight: 1.2,
          }}
        >
          两种方式都能进入你的山行档案
        </span>
      </div>
    </div>
  )
}

function ShareStackPreview({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const summitAltitude = useCountUpValue({ active, durationMs: 1000, reducedMotion, target: 6178 })
  const backCardStyle: CSSProperties = {
    position: 'absolute',
    width: 220,
    height: 276,
    borderRadius: 20,
    background: 'var(--color-surface-variant)',
    border: softBorder,
    opacity: 0.4,
  }

  return (
    <div
      className={`pt-share-stack ${active ? 'pt-is-active' : ''}`}
      data-testid="onboarding-intro-share-stack"
      style={{ position: 'relative', height: 318, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      <div
        data-testid="onboarding-intro-share-stack-back-1"
        style={{ ...backCardStyle, transform: 'translate(-28px, 14px) rotate(-5deg)', opacity: 0.42 }}
      />
      <div
        data-testid="onboarding-intro-share-stack-back-2"
        style={{ ...backCardStyle, transform: 'translate(30px, 24px) rotate(5deg)', opacity: 0.24 }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          width: 240,
          borderRadius: 20,
          padding: 14,
          background: 'var(--color-surface-variant)',
          border: softBorder,
          boxShadow: surfaceShadow,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--color-on-surface)' }}>
            <LogoMark size={11} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.16em' }}>
              PEAK TREKKER
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-on-surface-variant)' }}>
            2024.10.07
          </div>
        </div>

        <MountainSketch active={active} compact />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-on-surface)', lineHeight: 1.2 }}>
            玉珠峰
          </div>
          <div
            style={{
              borderRadius: 999,
              padding: '3px 8px',
              background: 'color-mix(in oklch, var(--color-success) 12%, transparent)',
              color: 'var(--color-success)',
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            山友圈
          </div>
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-on-surface-variant)',
          }}
        >
          青海 · 6,178m
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 36,
              fontWeight: 700,
              color: 'var(--color-success)',
              lineHeight: 1,
            }}
          >
            {Math.round(summitAltitude).toLocaleString('en-US')}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-success)' }}>m</span>
        </div>
        <div
          style={{
            marginTop: 7,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-success)',
            lineHeight: 1.2,
          }}
        >
          13:24 · 留证已确认
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: softBorder,
            fontSize: 13,
            color: 'var(--color-on-surface-variant)',
            lineHeight: 1.55,
          }}
        >
          「到了那一刻只剩一句话可说」
        </div>
      </div>
    </div>
  )
}

function VisualPreview({ active, index, reducedMotion }: { active: boolean; index: number; reducedMotion: boolean }) {
  if (index === 0) return <ChooseMountainPreview active={active} reducedMotion={reducedMotion} />
  if (index === 1) return <RecordImportPreview active={active} />
  return <ShareStackPreview active={active} reducedMotion={reducedMotion} />
}

function SlideText({ active, slide }: { active: boolean; slide: SlideCopy }) {
  return (
    <section className={active ? 'pt-slide-copy pt-is-active' : 'pt-slide-copy'} style={{ padding: '0 var(--space-6)' }}>
      <div
        className="pt-slide-copy-piece"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--color-success)',
          letterSpacing: '0.16em',
          marginBottom: 16,
          lineHeight: 1.2,
          animationDelay: '100ms',
        }}
      >
        {slide.eyebrow}
      </div>
      <h1
        className="pt-slide-copy-piece"
        style={{
          margin: '0 0 16px',
          fontSize: 30,
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          lineHeight: 1.2,
          letterSpacing: 0,
          animationDelay: '200ms',
        }}
      >
        {slide.title[0]}
        <br />
        {slide.title[1]}
      </h1>
      <div className="pt-slide-copy-piece" style={{ marginBottom: 32, animationDelay: '300ms' }}>
        {slide.body.map((line) => (
          <p
            key={line}
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 400,
              color: 'var(--color-on-surface-variant)',
              lineHeight: 1.7,
            }}
          >
            {line}
          </p>
        ))}
      </div>
    </section>
  )
}

function SlideFrame({ active, index, children }: { active: boolean; index: number; children: ReactNode }) {
  return (
    <div
      data-testid={`onboarding-intro-screen-${index + 1}`}
      data-active={active ? 'true' : 'false'}
      style={{
        minWidth: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'minmax(300px, 1fr) auto',
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  )
}

export default function IntroCarousel({ currentIndex, reducedMotion, onNext, onSkip }: IntroCarouselProps) {
  const activeIndex = Math.max(0, Math.min(currentIndex, SLIDES.length - 1))

  return (
    <div
      data-testid="onboarding-intro"
      className={reducedMotion ? 'pt-intro-motion-off' : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 180,
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        overflow: 'hidden',
      }}
    >
      <style>
        {`
          @keyframes pt-intro-fade-up {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }

          @keyframes pt-mountain-draw {
            0% { stroke-dashoffset: 360; }
            100% { stroke-dashoffset: 0; }
          }

          @keyframes pt-record-card-left-enter {
            0% { opacity: 0; transform: translateX(-12px); }
            100% { opacity: 1; transform: translateX(0); }
          }

          @keyframes pt-record-card-right-enter {
            0% { opacity: 0; transform: translateX(12px); }
            100% { opacity: 1; transform: translateX(0); }
          }

          @keyframes pt-intro-bar-grow {
            0% { transform: scaleY(0); }
            100% { transform: scaleY(1); }
          }

          @keyframes pt-share-stack-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }

          @keyframes pt-intro-record-pulse {
            0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--color-success) 50%, transparent); }
            100% { box-shadow: 0 0 0 8px transparent; }
          }
          .pt-intro-visual,
          .pt-slide-copy-piece,
          .pt-stat-value {
            opacity: 1;
            transform: translateY(0);
          }

          .pt-intro-visual.pt-is-active,
          .pt-slide-copy.pt-is-active .pt-slide-copy-piece,
          .pt-stat-value.pt-is-active {
            animation: pt-intro-fade-up 0.5s ease-out both;
          }

          .pt-mountain-path {
            stroke-dasharray: 360;
            stroke-dashoffset: 0;
          }

          .pt-mountain-sketch.pt-is-active .pt-mountain-path {
            animation: pt-mountain-draw 0.8s ease-out both;
          }

          .pt-record-card-left,
          .pt-record-card-right {
            opacity: 1;
            transform: translateX(0);
          }

          .pt-record-preview.pt-is-active .pt-record-card-left {
            animation: pt-record-card-left-enter 0.5s ease-out both;
          }

          .pt-record-preview.pt-is-active .pt-record-card-right {
            animation: pt-record-card-right-enter 0.5s ease-out 80ms both;
          }

          .pt-intro-bars span {
            transform-origin: bottom;
            transform: scaleY(1);
          }

          .pt-intro-bars.pt-is-active span {
            animation: pt-intro-bar-grow 0.4s ease-out both;
          }

          .pt-share-stack.pt-is-active {
            animation: pt-share-stack-float 4s ease-in-out infinite;
          }

          .pt-intro-record-dot {
            animation: pt-intro-record-pulse 1.8s ease-out infinite;
          }
          .pt-intro-motion-off .pt-intro-visual,
          .pt-intro-motion-off .pt-slide-copy-piece,
          .pt-intro-motion-off .pt-stat-value,
          .pt-intro-motion-off .pt-mountain-path,
          .pt-intro-motion-off .pt-record-card-left,
          .pt-intro-motion-off .pt-record-card-right,
          .pt-intro-motion-off .pt-intro-bars span,
          .pt-intro-motion-off .pt-share-stack,
          .pt-intro-motion-off .pt-intro-record-dot {
            animation: none !important;
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
            stroke-dashoffset: 0 !important;
          }
          @media (prefers-reduced-motion: reduce) {
            .pt-intro-visual,
            .pt-slide-copy-piece,
            .pt-stat-value,
            .pt-mountain-path,
            .pt-record-card-left,
            .pt-record-card-right,
            .pt-intro-bars span,
            .pt-share-stack,
            .pt-intro-record-dot {
              animation: none !important;
              transition: none !important;
              opacity: 1 !important;
              transform: none !important;
              stroke-dashoffset: 0 !important;
            }
          }
        `}
      </style>

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -120,
          left: '-30%',
          right: '-30%',
          height: 380,
          pointerEvents: 'none',
          background:
            activeIndex === 0
              ? 'radial-gradient(ellipse at center top, color-mix(in oklch, var(--color-on-surface-variant) 12%, transparent), transparent 65%)'
              : activeIndex === 1
                ? 'radial-gradient(ellipse at center top, color-mix(in oklch, var(--color-success) 12%, transparent), transparent 65%)'
                : 'radial-gradient(ellipse at center top, color-mix(in oklch, var(--color-warning) 10%, transparent), transparent 65%)',
        }}
      />

      <header
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'calc(env(safe-area-inset-top) + 16px) var(--space-4) var(--space-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-on-surface)' }}>
          <LogoMark />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.16em',
              lineHeight: 1,
            }}
          >
            PEAK TREKKER
          </span>
        </div>
        <button
          type="button"
          onClick={onSkip}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-on-surface-variant)',
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1,
            padding: '10px 4px',
            cursor: 'pointer',
          }}
        >
          跳过
        </button>
      </header>

      <main style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div
          data-testid="onboarding-intro-track"
          style={{
            height: '100%',
            display: 'flex',
            transform: `translateX(-${activeIndex * 100}%)`,
            transition: reducedMotion ? 'none' : 'transform 0.4s ease-out',
          }}
        >
          {SLIDES.map((slide, index) => (
            <SlideFrame key={slide.eyebrow} active={index === activeIndex} index={index}>
              <div
                className={index === activeIndex ? 'pt-intro-visual pt-is-active' : 'pt-intro-visual'}
                style={{ padding: '10px var(--space-6) 0' }}
              >
                <VisualPreview active={index === activeIndex} index={index} reducedMotion={reducedMotion} />
              </div>
              <SlideText active={index === activeIndex} slide={slide} />
            </SlideFrame>
          ))}
        </div>
      </main>

      <footer
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '0 var(--space-6) calc(env(safe-area-inset-bottom) + 30px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {SLIDES.map((slide, index) => {
            const active = index === activeIndex
            return (
              <span
                key={slide.eyebrow}
                data-testid={active ? 'onboarding-intro-dot-active' : undefined}
                style={{
                  width: active ? 24 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: active
                    ? 'var(--color-on-surface)'
                    : 'color-mix(in oklch, var(--color-outline) 50%, transparent)',
                  transition: reducedMotion ? 'none' : 'all 0.3s ease',
                }}
              />
            )
          })}
        </div>
        <button
          data-testid="onboarding-intro-primary"
          type="button"
          onClick={onNext}
          style={{
            appearance: 'none',
            width: '100%',
            minHeight: 52,
            border: 'none',
            borderRadius: 16,
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {activeIndex === SLIDES.length - 1 ? '开始使用' : '下一步'}
        </button>
        {activeIndex === 0 ? (
          <div
            style={{
              marginTop: 16,
              fontSize: 11,
              color: 'var(--color-on-surface-variant)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Peak Trekker 不会要求任何权限 · 直到你第一次准备山行时
          </div>
        ) : null}
      </footer>
    </div>
  )
}
