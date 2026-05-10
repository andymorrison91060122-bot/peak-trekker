import Link from 'next/link'
import LateProofClient from './LateProofClient'
import './late-proof.css'

interface LateProofPageProps {
  searchParams: Promise<{
    mountainId?: string
    mountainName?: string
    altitude?: string
    summitDate?: string
  }>
}

export default async function LateProofPage({ searchParams }: LateProofPageProps) {
  const resolvedSearchParams = await searchParams
  const mountainId = resolvedSearchParams.mountainId?.trim() ?? ''
  const mountainName = resolvedSearchParams.mountainName?.trim() ?? ''

  if (!mountainId || !mountainName) {
    return (
      <main className="lp-page">
        <div className="lp-missing">
          <div className="lp-missing__eyebrow">LATE PROOF</div>
          <h1 className="lp-missing__title">缺少山峰信息</h1>
          <p className="lp-missing__body">补登记需要先确认目标山峰。请回到探索页重新选择一座山。</p>
          <Link className="lp-missing__link" href="/explore">
            返回探索
          </Link>
        </div>
      </main>
    )
  }

  return (
    <LateProofClient
      mountainId={mountainId}
      mountainName={mountainName}
      altitude={resolvedSearchParams.altitude?.trim() || null}
      summitDate={resolvedSearchParams.summitDate?.trim() || null}
    />
  )
}
