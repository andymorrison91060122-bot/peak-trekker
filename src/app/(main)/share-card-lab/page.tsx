import Link from 'next/link'
import SharePosterButton from '@/components/ui/SharePosterButton'

export default function ShareCardLabPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px 20px 104px' }}>
      <div className="surface-card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Share Card Lab</div>
        <div className="section-subtitle" style={{ marginBottom: 18 }}>
          这里单独用于测试水印相机与分享卡编辑器，不依赖真实登顶记录。默认使用四姑娘山的示例数据，可直接验证模板、透明层和照片合成。
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <SharePosterButton
            checkinId="demo"
            mountainName="四姑娘山"
            demoMode
            allowedTemplates={['trek_snapshot', 'summit_card', 'activity_summary']}
          />
          <Link href="/onboarding-qa" className="secondary-btn" style={{ textDecoration: 'none', minHeight: 42, padding: '0 14px' }}>
            打开 QA Console
          </Link>
        </div>
      </div>

      <div className="surface-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>推荐测试顺序</div>
        <div className="section-subtitle" style={{ marginBottom: 8 }}>
          1. 先用 `Summit Card + 山峰结果卡` 检查海拔、登顶时间、品牌与山峰背景的层级。
        </div>
        <div className="section-subtitle" style={{ marginBottom: 8 }}>
          2. 再切 `透明水印`，确认海拔、登顶时间、GPS 认证徽章和 alpha 导出是否清晰。
        </div>
        <div className="section-subtitle">
          3. 最后切 `照片合成` 上传一张真实照片，试试贴顶/贴底和上下微调。
        </div>
      </div>

      <div className="surface-card" style={{ padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>快速预览接口</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <Link
            href="/api/poster-preview?template=summit_card&renderMode=classic_card"
            className="secondary-btn"
            style={{ textDecoration: 'none', justifyContent: 'flex-start' }}
          >
            Summit Card · 山峰结果卡
          </Link>
          <Link
            href="/api/poster-preview?template=summit_card&renderMode=overlay_only"
            className="secondary-btn"
            style={{ textDecoration: 'none', justifyContent: 'flex-start' }}
          >
            Summit Card · 透明水印
          </Link>
          <Link
            href="/api/poster-preview?template=summit_card&renderMode=photo_composite"
            className="secondary-btn"
            style={{ textDecoration: 'none', justifyContent: 'flex-start' }}
          >
            Summit Card · 照片合成示意
          </Link>
        </div>
      </div>
    </div>
  )
}
