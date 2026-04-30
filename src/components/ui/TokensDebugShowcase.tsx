'use client'

import { Component, type ReactNode, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import IconButton from '@/components/ui/IconButton'
import PrimaryButton from '@/components/ui/PrimaryButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import TertiaryButton from '@/components/ui/TertiaryButton'

type ButtonStatus = {
  focus: string
  action: string
}

const spacingTokens = [
  ['space-1', '4px'],
  ['space-2', '8px'],
  ['space-3', '12px'],
  ['space-4', '16px'],
  ['space-5', '20px'],
  ['space-6', '24px'],
  ['space-8', '32px'],
  ['space-12', '48px'],
] as const

const typeTokens = [
  ['display-l', '28px / 36px / 700'],
  ['headline-m', '22px / 28px / 600'],
  ['title-l', '17px / 24px / 600'],
  ['title-m', '15px / 20px / 500'],
  ['body-l', '15px / 22px / 400'],
  ['body-m', '14px / 20px / 400'],
  ['label-m', '13px / 18px / 500'],
  ['label-s', '11px / 14px / 500'],
] as const

const radiusTokens = [
  ['radius-xs', '6px'],
  ['radius-sm', '8px'],
  ['radius-md', '12px'],
  ['radius-lg', '16px'],
  ['radius-xl', '20px'],
] as const

const colorTokens = [
  ['color-primary', '#22c55e', '开始记录、发布到山友圈、确认动作主按钮'],
  ['color-on-primary', '#08120d', 'PrimaryButton 文字和主 CTA 内图标'],
  ['color-surface', '#121416', '页面背景、底部导航栏底色（例如山友圈 feed 页）'],
  ['color-surface-variant', '#23272c', '常规卡片底色、SecondaryButton 底色、记录卡片容器'],
  ['color-surface-elevated', '#282d33', '弹窗面板、悬浮分享面板、悬浮操作层'],
  ['color-on-surface', '#f5f7f8', '页面主标题、卡片主文案、正文'],
  ['color-on-surface-variant', '#8d959b', '时间戳、辅助说明文字（例如“3 小时前”“海拔 3061m”的单位）'],
  ['color-outline', '#2f353b', '卡片描边、分隔线、SecondaryButton 描边'],
  ['color-error', '#ef4444', '删除/举报危险态、错误 toast、权限限制警示'],
  ['color-success', '#6ee7a1', '上传成功提示、通过状态、成功 toast'],
  ['color-warning', '#f59e0b', '待审核提醒、风险提示、警告态标签'],
] as const

class IconButtonErrorBoundary extends Component<
  {
    children: ReactNode
  },
  {
    errorMessage: string | null
  }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { errorMessage: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { errorMessage: error.message }
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div
          data-testid="icon-button-aria-error"
          className="surface-card"
          style={{ padding: 'var(--space-4)', borderColor: 'var(--color-error)' }}
        >
          <div className="ui-error-example__label">❌ 禁止使用</div>
          <div className="section-subtitle" style={{ marginTop: 'var(--space-2)' }}>
            {this.state.errorMessage}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function SectionBlock({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="surface-card" style={{ padding: 'var(--space-4)' }}>
      <div className="card-title" style={{ fontSize: 'var(--font-title-l-size)', lineHeight: 'var(--font-title-l-line)', fontWeight: 600 }}>
        {title}
      </div>
      <div className="section-subtitle" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {description}
      </div>
      {children}
    </section>
  )
}

function ButtonPreviewRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="section-subtitle" style={{ color: 'var(--color-on-surface)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  )
}

function BadExampleShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="surface-card ui-error-example" style={{ padding: 'var(--space-4)' }}>
      <div className="ui-error-example__label">{title}</div>
      <div className="section-subtitle" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {description}
      </div>
      {children}
    </div>
  )
}

export default function TokensDebugShowcase() {
  const searchParams = useSearchParams()
  const [buttonStatus, setButtonStatus] = useState<ButtonStatus>({
    focus: '未进入键盘示例',
    action: '未触发',
  })

  const keyboardStatusText = useMemo(
    () => `当前聚焦: ${buttonStatus.focus} | 最近触发: ${buttonStatus.action}`,
    [buttonStatus]
  )

  const shouldShowMissingAriaHarness = searchParams.get('iconButtonHarness') === 'missing-aria'

  function bindKeyboardStatus(label: string) {
    return {
      onFocus: () => setButtonStatus((current) => ({ ...current, focus: label })),
      onClick: () => setButtonStatus((current) => ({ ...current, action: label })),
    }
  }

  return (
    <div
      data-testid="tokens-debug-page"
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        color: 'var(--color-on-surface)',
        padding: 'var(--space-5) var(--space-4) var(--space-12)',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 'var(--space-6)' }}>
        <div className="surface-card" style={{ padding: 'var(--space-4)' }}>
          <div
            className="page-title"
            style={{
              fontSize: 'var(--font-display-l-size)',
              lineHeight: 'var(--font-display-l-line)',
              fontWeight: 700,
            }}
          >
            Design Token Lab
          </div>
          <div className="section-subtitle" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            用于校验 Peak Trekker 的 spacing、type、radius、color、button 和 card 规范是否按 3.5 token 落地。
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div
              data-testid="keyboard-focus-status"
              tabIndex={0}
              className="surface-card"
              style={{
                padding: 'var(--space-3)',
                background: 'var(--color-surface-elevated)',
                borderColor: 'var(--color-outline)',
              }}
            >
              <div className="section-subtitle" style={{ color: 'var(--color-on-surface)' }}>
                {keyboardStatusText}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <PrimaryButton data-testid="keyboard-sample-primary" {...bindKeyboardStatus('PrimaryButton (default state)')}>
                开始记录
              </PrimaryButton>
              <SecondaryButton data-testid="keyboard-sample-secondary" {...bindKeyboardStatus('SecondaryButton (default state)')}>
                查看路线
              </SecondaryButton>
              <TertiaryButton data-testid="keyboard-sample-tertiary" {...bindKeyboardStatus('TertiaryButton (default state)')}>
                风险说明
              </TertiaryButton>
              <IconButton
                data-testid="keyboard-sample-icon"
                icon="share"
                ariaLabel="分享当前 token 预览"
                {...bindKeyboardStatus('IconButton (plain state)')}
              />
            </div>
          </div>
        </div>

        <SectionBlock
          title="1. 间距刻度"
          description="每个 token 都用可视宽度块展示，方便比对不同间距在移动端页面中的真实差异。"
        >
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {spacingTokens.map(([token, value]) => (
              <div
                key={token}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 160px) 1fr',
                  gap: 'var(--space-3)',
                  alignItems: 'center',
                }}
              >
                <div className="section-subtitle" style={{ color: 'var(--color-on-surface)' }}>
                  {token} · {value}
                </div>
                <div
                  style={{
                    width: `var(--${token})`,
                    height: 'var(--space-4)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-primary)',
                  }}
                />
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock
          title="2. 字号层级"
          description="示例文案统一使用“五台山 · 海拔 3061m”，旁边直接标注 token 名、字号、行高和字重。"
        >
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {typeTokens.map(([token, spec]) => (
              <div key={token} style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <div className="section-subtitle" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {token} · {spec}
                </div>
                <div
                  style={{
                    fontSize: `var(--font-${token}-size)`,
                    lineHeight: `var(--font-${token}-line)`,
                    fontWeight: `var(--font-${token}-weight)`,
                    color: 'var(--color-on-surface)',
                  }}
                >
                  五台山 · 海拔 3061m
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock
          title="3. 圆角系统"
          description="5 个圆角在同尺寸样块里并排展示，方便肉眼比较小徽章、按钮、卡片和弹窗的边角节奏。"
        >
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {radiusTokens.map(([token, value]) => (
              <div key={token} style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <div
                  style={{
                    width: 'var(--space-12)',
                    height: 'var(--space-12)',
                    borderRadius: `var(--${token})`,
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-outline)',
                  }}
                />
                <div className="section-subtitle" style={{ color: 'var(--color-on-surface)' }}>
                  {token} · {value}
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock
          title="4. 色彩 Token"
          description="每张色卡都给出具体业务使用场景，避免把语义 token 理解成抽象配色词。"
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            {colorTokens.map(([token, value, usage]) => (
              <div key={token} className="surface-card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
                <div
                  style={{
                    height: 'var(--space-12)',
                    borderRadius: 'var(--radius-md)',
                    border: token === 'color-on-primary' ? '1px solid var(--color-outline)' : 'none',
                    background: `var(--${token})`,
                  }}
                />
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <div className="card-title" style={{ fontSize: 'var(--font-title-m-size)', lineHeight: 'var(--font-title-m-line)', fontWeight: 500 }}>
                    {token}
                  </div>
                  <div className="section-subtitle">{value}</div>
                  <div className="section-subtitle" style={{ color: 'var(--color-on-surface)' }}>
                    {usage}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock
          title="5. 按钮组件预览"
          description="展示 Primary / Secondary / Tertiary / IconButton 的状态，并把错误用法单独放在红色虚线禁用区。"
        >
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            <ButtonPreviewRow label="PrimaryButton">
              <PrimaryButton data-testid="button-preview-primary-default">开始记录</PrimaryButton>
              <PrimaryButton data-force-state="hover">开始记录</PrimaryButton>
              <PrimaryButton data-force-state="pressed">开始记录</PrimaryButton>
              <PrimaryButton disabled>开始记录</PrimaryButton>
              <PrimaryButton loading>开始记录</PrimaryButton>
            </ButtonPreviewRow>

            <ButtonPreviewRow label="SecondaryButton">
              <SecondaryButton data-testid="button-preview-secondary-default">查看路线</SecondaryButton>
              <SecondaryButton data-force-state="hover">查看路线</SecondaryButton>
              <SecondaryButton data-force-state="pressed">查看路线</SecondaryButton>
              <SecondaryButton disabled>查看路线</SecondaryButton>
              <SecondaryButton loading>查看路线</SecondaryButton>
            </ButtonPreviewRow>

            <ButtonPreviewRow label="TertiaryButton">
              <TertiaryButton>风险说明</TertiaryButton>
              <TertiaryButton data-force-state="hover">风险说明</TertiaryButton>
              <TertiaryButton data-force-state="pressed">风险说明</TertiaryButton>
              <TertiaryButton disabled>风险说明</TertiaryButton>
              <TertiaryButton loading>风险说明</TertiaryButton>
            </ButtonPreviewRow>

            <ButtonPreviewRow label="IconButton">
              <IconButton icon="share" ariaLabel="分享动态" />
              <IconButton icon="share" ariaLabel="分享动态 hover" data-force-state="hover" />
              <IconButton icon="share" ariaLabel="分享动态 pressed" data-force-state="pressed" />
              <IconButton icon="share" ariaLabel="分享动态 disabled" disabled />
              <IconButton icon="more" ariaLabel="更多操作 filled" variant="filled" />
            </ButtonPreviewRow>

            <BadExampleShell
              title="❌ 禁止使用"
              description="同组按钮高度不一致，请使用 PrimaryButton + SecondaryButton 并排，而不是混入自定义高度。"
            >
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div
                  style={{
                    minHeight: '40px',
                    padding: '0 var(--space-5)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-primary)',
                    color: 'var(--color-on-primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  40px
                </div>
                <div
                  style={{
                    minHeight: '44px',
                    padding: '0 var(--space-5)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-variant)',
                    color: 'var(--color-on-surface)',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  44px
                </div>
                <div
                  style={{
                    minHeight: '52px',
                    padding: '0 var(--space-5)',
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    color: 'var(--color-on-surface-variant)',
                    border: '1px solid var(--color-outline)',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  52px
                </div>
              </div>
            </BadExampleShell>

            {shouldShowMissingAriaHarness ? (
              <IconButtonErrorBoundary>
                <IconButton icon="share" ariaLabel="" />
              </IconButtonErrorBoundary>
            ) : null}
          </div>
        </SectionBlock>

        <SectionBlock
          title="6. 卡片规格预览"
          description="标准卡片使用 space-4 内边距和 radius-lg；错误示例明确标注“卡片套卡片”禁止。"
        >
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div className="surface-card" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)' }}>
              <div className="card-title" style={{ fontSize: 'var(--font-title-l-size)', lineHeight: 'var(--font-title-l-line)', fontWeight: 600 }}>
                标准卡片示例
              </div>
              <div className="section-subtitle" style={{ marginTop: 'var(--space-2)' }}>
                16px 内边距、16px 圆角、12px 内部分组间距，适合活动摘要、山峰概览等常规内容块。
              </div>
              <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <div className="section-subtitle" style={{ color: 'var(--color-on-surface)' }}>
                  山峰：五台山
                </div>
                <div className="section-subtitle">距离 9.4 km · 爬升 812 m · 用时 4h 12m</div>
              </div>
            </div>

            <BadExampleShell
              title="❌ 禁止使用"
              description="卡片内部请用间距分组，不要再嵌套一层独立卡片，否则视觉层级会失真。"
            >
              <div className="surface-card" style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)' }}>
                <div className="card-title" style={{ fontSize: 'var(--font-title-m-size)', lineHeight: 'var(--font-title-m-line)', fontWeight: 500 }}>
                  外层卡片
                </div>
                <div className="surface-card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-3)', borderRadius: 'var(--radius-lg)' }}>
                  <div className="section-subtitle" style={{ color: 'var(--color-on-surface)' }}>
                    内层卡片
                  </div>
                </div>
              </div>
            </BadExampleShell>
          </div>
        </SectionBlock>
      </div>
    </div>
  )
}
