'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { BackIcon } from '@/components/ui/Icons'

type LateProofViewState = 'intro' | 'upload' | 'pending' | 'submitted'

type LateProofClientProps = {
  mountainId: string
  mountainName: string
  altitude: string | null
  summitDate: string | null
}

type ProofType = {
  icon: 'photo' | 'track' | 'note'
  title: string
  description: string
}

const PROOF_TYPES: ProofType[] = [
  {
    icon: 'photo',
    title: '登顶照片',
    description: '一张就够 · 含可识别的峰顶标志最好',
  },
  {
    icon: 'track',
    title: '第三方轨迹文件',
    description: 'GPX / KML · 来自其他记录工具',
  },
  {
    icon: 'note',
    title: '一段亲历说明',
    description: '时间、路线、同行者 · 由你自己讲',
  },
]

function ProofIcon({ type }: { type: ProofType['icon'] }) {
  if (type === 'photo') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }

  if (type === 'track') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M4 18l5-12 4 7 7-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M5 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TopBar({ mountainName }: { mountainName: string }) {
  const router = useRouter()

  return (
    <header className="lp-topbar">
      <button type="button" className="lp-topbar__back" aria-label="返回" onClick={() => router.back()}>
        <BackIcon size={20} />
      </button>
      <div className="lp-topbar__title">补登记 · {mountainName}</div>
      <div className="lp-topbar__spacer" aria-hidden="true" />
    </header>
  )
}

function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className="lp-section-header">{children}</h2>
}

function ProofTypeRow({ proofType, last }: { proofType: ProofType; last: boolean }) {
  return (
    <div className="lp-proof-row" data-last={last ? 'true' : 'false'}>
      <div className="lp-proof-icon">
        <ProofIcon type={proofType.icon} />
      </div>
      <div className="lp-proof-copy">
        <div className="lp-proof-title">{proofType.title}</div>
        <div className="lp-proof-desc">{proofType.description}</div>
      </div>
      <div className="lp-proof-chevron">
        <ChevronIcon />
      </div>
    </div>
  )
}

function IntroView({
  summitDate,
  onStart,
}: {
  summitDate: string | null
  onStart: () => void
}) {
  const dateLabel = summitDate ? `${summitDate} · 登顶日` : '未记录日期 · 登顶日'

  return (
    <>
      <main className="lp-content">
        <section className="lp-hero" aria-labelledby="late-proof-title">
          <div className="lp-date-label">{dateLabel}</div>
          <h1 id="late-proof-title" className="lp-title">
            把这次山行记进来
          </h1>
          <p className="lp-intro-copy">
            当时没有用 Peak Trekker 记录也没关系。
            <br />
            提交一张登顶照与几行说明 · 我们会以「补登记」
            <br />
            的形式收录到你的山行档案里。
          </p>
        </section>

        <SectionHeader>留证可以是这些</SectionHeader>
        <section className="lp-section-shell" aria-label="留证可以是这些">
          <div className="lp-proof-card">
            {PROOF_TYPES.map((proofType, index) => (
              <ProofTypeRow key={proofType.title} proofType={proofType} last={index === PROOF_TYPES.length - 1} />
            ))}
          </div>
        </section>

        <SectionHeader>关于真实性</SectionHeader>
        <section className="lp-section-shell" aria-label="关于真实性">
          <div className="lp-truth-card">
            <p>
              补登记会清晰地标记为<strong>「用户自报」</strong>。
              <br />
              我们不会判定真伪 · 但会让你和山友看到这是在事后补充的记录。
            </p>
          </div>
        </section>

        <div className="lp-bottom-spacer" aria-hidden="true" />
      </main>

      <div className="lp-sticky-bottom">
        <button type="button" className="lp-primary-btn" onClick={onStart}>
          开始补登记
        </button>
        <div className="lp-hint">大约需要 2 分钟</div>
      </div>
    </>
  )
}

function PlaceholderView({ viewState }: { viewState: Exclude<LateProofViewState, 'intro'> }) {
  return <div className="lp-placeholder">{viewState} — 待实现</div>
}

export default function LateProofClient({ mountainName, summitDate }: LateProofClientProps) {
  const [viewState, setViewState] = useState<LateProofViewState>('intro')

  return (
    <div className="lp-page">
      <TopBar mountainName={mountainName} />
      {viewState === 'intro' ? (
        <IntroView summitDate={summitDate} onStart={() => setViewState('upload')} />
      ) : (
        <PlaceholderView viewState={viewState} />
      )}
    </div>
  )
}
