'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import IconButton from '@/components/ui/IconButton'
import SecondaryButton from '@/components/ui/SecondaryButton'
import { BackIcon, SearchIcon } from '@/components/ui/Icons'
import { useAppToast } from '@/components/ui/AppToastProvider'
import { FAQ_BY_ANCHOR, FAQ_GROUPS, type FaqGroup, type FaqQuestion } from '@/lib/faq-content'

type FAQClientProps = {
  initialAnchor: string | null
}

type SearchResult = FaqQuestion & {
  group: FaqGroup
}

const monoStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
}

function ChevronIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 160ms ease',
      }}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="color-mix(in srgb, var(--color-on-surface) 8%, transparent)"
      />
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function getInitialGroupState(anchor: string | null) {
  const target = anchor ? FAQ_BY_ANCHOR[anchor] : null
  if (!target) return []
  return [target.group.id]
}

function getInitialQuestionState(anchor: string | null) {
  const target = anchor ? FAQ_BY_ANCHOR[anchor] : null
  if (!target) return {}
  return { [target.group.id]: target.anchor }
}

function getSearchResults(query: string): SearchResult[] {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return []

  const matches: SearchResult[] = []
  FAQ_GROUPS.forEach((group) => {
    group.questions.forEach((question) => {
      const questionText = normalizeText(question.q)
      const answerText = normalizeText(question.a)
      if (questionText.includes(normalizedQuery) || answerText.includes(normalizedQuery)) {
        matches.push({ ...question, group })
      }
    })
  })
  return matches
}

function previewAnswer(answer: string) {
  return answer.replace(/\s+/g, ' ').trim()
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index < 0) return text

  const before = text.slice(0, index)
  const match = text.slice(index, index + query.length)
  const after = text.slice(index + query.length)

  return (
    <>
      {before}
      <mark
        style={{
          color: 'var(--color-success)',
          background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
          borderRadius: 'var(--radius-xs)',
          paddingInline: 2,
        }}
      >
        {match}
      </mark>
      {after}
    </>
  )
}

function FAQHeader({ onBack }: { onBack: () => void }) {
  return (
    <header>
      <div
        style={{
          height: 48,
          display: 'grid',
          gridTemplateColumns: '44px minmax(0, 1fr) 44px',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-1) var(--space-3) 0',
        }}
      >
        <IconButton
          ariaLabel="返回"
          icon={<BackIcon size={20} />}
          shape="circular"
          variant="filled"
          onClick={onBack}
        />
        <div
          style={{
            minWidth: 0,
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-label-m-size)',
            lineHeight: 'var(--font-label-m-line)',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          常见问题
        </div>
        <div aria-hidden="true" />
      </div>
      <p
        style={{
          margin: 0,
          padding: 'var(--space-1) var(--space-5) 0',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-body-m-size)',
          lineHeight: 'calc(var(--font-body-m-line) * 1.12)',
        }}
      >
        不确定的时候来这里看一眼。
      </p>
    </header>
  )
}

function FAQSearchField({
  value,
  onChange,
  onClear,
}: {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}) {
  return (
    <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-1)' }}>
      <label
        style={{
          height: 42,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
          color: 'var(--color-on-surface-variant)',
          transition: 'border-color 160ms ease',
        }}
      >
        <SearchIcon size={18} />
        <input
          aria-label="搜索常见问题"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="搜你想知道的事"
          data-testid="faq-search-input"
          style={{
            flex: 1,
            width: '100%',
            border: 0,
            outline: 0,
            background: 'transparent',
            color: 'var(--color-on-surface)',
            fontSize: 'var(--font-body-m-size)',
            lineHeight: 'var(--font-body-m-line)',
          }}
          onFocus={(event) => {
            event.currentTarget.parentElement?.style.setProperty(
              'border-color',
              'color-mix(in srgb, var(--color-success) 36%, transparent)'
            )
          }}
          onBlur={(event) => {
            event.currentTarget.parentElement?.style.setProperty('border-color', 'var(--color-outline)')
          }}
        />
        {value ? (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={onClear}
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 0,
              padding: 0,
              background: 'transparent',
              color: 'var(--color-on-surface-variant)',
              cursor: 'pointer',
            }}
          >
            <ClearIcon />
          </button>
        ) : null}
      </label>
    </div>
  )
}

function AnswerCard({ question }: { question: FaqQuestion }) {
  const { showToast } = useAppToast()

  async function handleCopyEmail() {
    if (!question.contactEmail) return

    const writeText = navigator.clipboard?.writeText
    if (!writeText) {
      showToast({ appearance: 'surface', message: '复制失败，请手动复制邮箱' })
      return
    }

    try {
      await writeText.call(navigator.clipboard, question.contactEmail)
      showToast({ appearance: 'surface', message: '邮箱已复制' })
    } catch {
      showToast({ appearance: 'surface', message: '复制失败，请手动复制邮箱' })
    }
  }

  return (
    <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
      <div
        style={{
          padding: 'var(--space-3) 14px',
          borderRadius: 10,
          border: '1px solid var(--color-outline)',
          background: 'color-mix(in srgb, var(--color-on-surface) 2%, transparent)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'calc(var(--font-label-m-line) * 1.26)',
          whiteSpace: 'pre-line',
        }}
      >
        {question.a}
      </div>
      {question.contactEmail ? (
        <div
          style={{
            minWidth: 0,
            marginTop: 'var(--space-3)',
            padding: 14,
            borderRadius: 10,
            border: '1px solid color-mix(in srgb, var(--color-success) 36%, var(--color-outline))',
            background: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
            color: 'var(--color-on-surface)',
          }}
        >
          <span
            style={{
              display: 'block',
              minWidth: 0,
              color: 'var(--color-success)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-label-m-size)',
              lineHeight: 'var(--font-label-m-line)',
              textAlign: 'center',
              overflowWrap: 'anywhere',
              wordBreak: 'break-all',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          >
            {question.contactEmail}
          </span>
          <button
            type="button"
            onClick={handleCopyEmail}
            aria-label={`复制邮箱 ${question.contactEmail}`}
            style={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              margin: 'var(--space-3) 0 0',
              padding: '0 18px',
              borderRadius: 9,
              border: '1px solid color-mix(in srgb, var(--color-success) 42%, var(--color-outline))',
              background: 'color-mix(in srgb, var(--color-success) 14%, transparent)',
              color: 'var(--color-success)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'copy',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
            </svg>
            复制
          </button>
        </div>
      ) : null}
    </div>
  )
}

function FAQGroupCard({
  group,
  open,
  openQuestionAnchor,
  highlightAnchor,
  highlightActive,
  targetRef,
  onToggleGroup,
  onToggleQuestion,
}: {
  group: FaqGroup
  open: boolean
  openQuestionAnchor: string | null
  highlightAnchor: string | null
  highlightActive: boolean
  targetRef: RefObject<HTMLDivElement | null>
  onToggleGroup: (groupId: string) => void
  onToggleQuestion: (groupId: string, anchor: string) => void
}) {
  return (
    <section
      style={{
        margin: '0 var(--space-4) var(--space-3)',
        borderRadius: 14,
        border: '1px solid var(--color-outline)',
        background: 'var(--color-surface-variant)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => onToggleGroup(group.id)}
        aria-expanded={open}
        style={{
          width: '100%',
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: '0 var(--space-4)',
          border: 0,
          background: 'transparent',
          color: 'var(--color-on-surface)',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-title-m-size)',
            lineHeight: 'var(--font-title-l-line)',
            fontWeight: 700,
          }}
        >
          {group.title}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            color: 'var(--color-on-surface-variant)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              ...monoStyle,
              fontSize: 'var(--font-label-s-size)',
              lineHeight: 'var(--font-label-s-line)',
            }}
          >
            · {group.questions.length} 个问题
          </span>
          <ChevronIcon open={open} />
        </span>
      </button>
      {open ? (
        <div style={{ borderTop: '1px solid var(--color-outline)' }}>
          {group.questions.map((question, index) => {
            const expanded = openQuestionAnchor === question.anchor
            const highlighted = highlightAnchor === question.anchor && highlightActive
            return (
              <div
                key={question.anchor}
                ref={highlightAnchor === question.anchor ? targetRef : null}
                data-faq-anchor={question.anchor}
                style={{
                  borderTop: index === 0 ? 'none' : '1px solid var(--color-outline)',
                  backgroundColor: highlighted
                    ? 'color-mix(in srgb, var(--color-success) 6%, transparent)'
                    : 'transparent',
                  transition: 'background-color 1500ms ease-out',
                }}
              >
                <button
                  type="button"
                  onClick={() => onToggleQuestion(group.id, question.anchor)}
                  aria-expanded={expanded}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    padding: '14px var(--space-4)',
                    border: 0,
                    background: 'transparent',
                    color: 'var(--color-on-surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 'var(--font-body-m-size)',
                      lineHeight: 'calc(var(--font-body-m-line) * 1.05)',
                      fontWeight: 500,
                    }}
                  >
                    {question.q}
                  </span>
                  <span style={{ marginTop: 3, color: 'var(--color-on-surface-variant)' }}>
                    <ChevronIcon open={expanded} />
                  </span>
                </button>
                {expanded ? <AnswerCard question={question} /> : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function FAQResultCard({
  result,
  query,
  onOpen,
}: {
  result: SearchResult
  query: string
  onOpen: (anchor: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(result.anchor)}
      style={{
        width: '100%',
        padding: '14px var(--space-4)',
        border: '1px solid var(--color-outline)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-variant)',
        color: 'var(--color-on-surface)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          ...monoStyle,
          color: 'var(--color-on-surface-variant)',
          fontSize: 10,
          lineHeight: 'var(--font-label-s-line)',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {result.group.title}
      </div>
      <div
        style={{
          marginTop: 'var(--space-2)',
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-body-m-size)',
          lineHeight: 'calc(var(--font-body-m-line) * 1.02)',
          fontWeight: 600,
        }}
      >
        <HighlightedText text={result.q} query={query} />
      </div>
      <div
        style={{
          marginTop: 'var(--space-2)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 12,
          lineHeight: 'calc(var(--font-label-m-line) * 1.06)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {previewAnswer(result.a)}
      </div>
    </button>
  )
}

function FAQSearchResults({
  query,
  results,
  onOpen,
}: {
  query: string
  results: SearchResult[]
  onOpen: (anchor: string) => void
}) {
  if (!results.length) return null

  return (
    <>
      <div
        data-testid="faq-search-count"
        style={{
          ...monoStyle,
          padding: 'var(--space-1) var(--space-5) var(--space-3)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-s-size)',
          lineHeight: 'var(--font-label-s-line)',
        }}
      >
        {results.length} 条匹配
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-2)', padding: '0 var(--space-4)' }}>
        {results.map((result) => (
          <FAQResultCard key={result.anchor} result={result} query={query} onOpen={onOpen} />
        ))}
      </div>
    </>
  )
}

function FAQEmptySearch({ onFeedback }: { onFeedback: () => void }) {
  return (
    <div
      data-testid="faq-search-empty"
      style={{
        padding: 'var(--space-16) var(--space-8) 0',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto',
          borderRadius: 14,
          border: '1px solid var(--color-outline)',
          background: 'var(--color-surface-variant)',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        <SearchIcon size={22} />
      </div>
      <div
        style={{
          marginTop: 18,
          color: 'var(--color-on-surface)',
          fontSize: 'var(--font-title-m-size)',
          lineHeight: 'var(--font-title-l-line)',
          fontWeight: 700,
        }}
      >
        没有找到
      </div>
      <p
        style={{
          margin: 'var(--space-2) 0 0',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'calc(var(--font-label-m-line) * 1.18)',
        }}
      >
        试试别的说法。
        <br />
        或者直接告诉我们,这个问题应该写进来。
      </p>
      <div style={{ marginTop: 'var(--space-5)', display: 'flex', justifyContent: 'center' }}>
        <SecondaryButton onClick={onFeedback}>提交反馈</SecondaryButton>
      </div>
    </div>
  )
}

function FAQFooter({ onFeedback }: { onFeedback: () => void }) {
  return (
    <footer>
      <div
        style={{
          margin: 'var(--space-6) var(--space-5) 0',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'calc(var(--font-label-m-line) * 1.1)',
        }}
      >
        没有找到答案?
      </div>
      <div
        style={{
          margin: 'var(--space-2) var(--space-5) 0',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 'var(--font-label-m-size)',
          lineHeight: 'var(--font-label-m-line)',
        }}
      >
        <Link
          href="/explore"
          style={{
            color: 'inherit',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            textDecorationColor: 'color-mix(in srgb, var(--color-on-surface-variant) 40%, transparent)',
          }}
        >
          去找山
        </Link>
        <span aria-hidden="true" style={{ opacity: 0.55 }}>
          ·
        </span>
        <button
          type="button"
          onClick={onFeedback}
          style={{
            border: 0,
            padding: 0,
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            textDecorationColor: 'color-mix(in srgb, var(--color-on-surface-variant) 40%, transparent)',
          }}
        >
          提交反馈
        </button>
      </div>
      <div
        style={{
          ...monoStyle,
          padding: 'var(--space-6) 0 var(--space-8)',
          color: 'var(--color-on-surface-variant)',
          fontSize: 10,
          lineHeight: 'var(--font-label-s-line)',
          letterSpacing: '0.16em',
          textAlign: 'center',
        }}
      >
        PEAK TREKKER · 真实记录与分享
      </div>
    </footer>
  )
}

export default function FAQClient({ initialAnchor }: FAQClientProps) {
  const router = useRouter()
  const targetRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [openGroups, setOpenGroups] = useState<string[]>(() => getInitialGroupState(initialAnchor))
  const [openQuestions, setOpenQuestions] = useState<Record<string, string | null>>(() =>
    getInitialQuestionState(initialAnchor)
  )
  const [highlightAnchor, setHighlightAnchor] = useState<string | null>(initialAnchor)
  const [highlightActive, setHighlightActive] = useState(Boolean(initialAnchor))

  const results = useMemo(() => getSearchResults(debouncedQuery), [debouncedQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 80)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!initialAnchor) return

    const scrollTimer = window.setTimeout(() => {
      targetRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
    const fadeTimer = window.setTimeout(() => {
      setHighlightActive(false)
    }, 700)
    return () => {
      window.clearTimeout(scrollTimer)
      window.clearTimeout(fadeTimer)
    }
  }, [initialAnchor])

  function handleBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/profile')
  }

  function handleToggleGroup(groupId: string) {
    setOpenGroups((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    )
  }

  function handleToggleQuestion(groupId: string, anchor: string) {
    setOpenQuestions((current) => ({
      ...current,
      [groupId]: current[groupId] === anchor ? null : anchor,
    }))
  }

  function handleOpenFromSearch(anchor: string) {
    const target = FAQ_BY_ANCHOR[anchor]
    if (!target) return
    setQuery('')
    setDebouncedQuery('')
    setOpenGroups((current) => (current.includes(target.group.id) ? current : [...current, target.group.id]))
    setOpenQuestions((current) => ({ ...current, [target.group.id]: anchor }))
    setHighlightAnchor(anchor)
    setHighlightActive(true)
    window.setTimeout(() => {
      targetRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 100)
    window.setTimeout(() => {
      setHighlightActive(false)
    }, 700)
  }

  const hasSearch = Boolean(debouncedQuery.trim())

  return (
    <main
      data-testid="faq-page"
      style={{
        minHeight: '100dvh',
        maxWidth: 'var(--page-max-width)',
        margin: '0 auto',
        paddingBottom: 'var(--space-4)',
        background: 'var(--color-surface)',
      }}
    >
      <FAQHeader onBack={handleBack} />
      <FAQSearchField value={query} onChange={setQuery} onClear={() => setQuery('')} />

      {hasSearch ? (
        results.length ? (
          <FAQSearchResults query={debouncedQuery} results={results} onOpen={handleOpenFromSearch} />
        ) : (
          <FAQEmptySearch onFeedback={() => handleOpenFromSearch('account.feedback')} />
        )
      ) : (
        <div style={{ marginTop: 'var(--space-2)' }}>
          {FAQ_GROUPS.map((group) => (
            <FAQGroupCard
              key={group.id}
              group={group}
              open={openGroups.includes(group.id)}
              openQuestionAnchor={openQuestions[group.id] ?? null}
              highlightAnchor={highlightAnchor}
              highlightActive={highlightActive}
              targetRef={targetRef}
              onToggleGroup={handleToggleGroup}
              onToggleQuestion={handleToggleQuestion}
            />
          ))}
          <FAQFooter onFeedback={() => handleOpenFromSearch('account.feedback')} />
        </div>
      )}
    </main>
  )
}
