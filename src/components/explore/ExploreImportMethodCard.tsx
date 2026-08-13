'use client'

import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, Ref } from 'react'

type PressFallbackEvent = PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>

function markPressFallback(event: PointerEvent<HTMLButtonElement>) {
  event.currentTarget.dataset.ptPressActive = 'true'
}

function clearPressFallback(event: PressFallbackEvent) {
  delete event.currentTarget.dataset.ptPressActive
}

function markKeyboardPressFallback(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === 'Enter' || event.key === ' ') event.currentTarget.dataset.ptPressActive = 'true'
}

export type ExploreImportMethod = 'import' | 'screenshot'

export function ExploreImportMethodCard({
  kind,
  title,
  description,
  onClick,
  videoRef,
  src,
  poster,
  primary = false,
}: {
  kind: ExploreImportMethod
  title: string
  description: string
  onClick: () => void
  videoRef?: Ref<HTMLVideoElement>
  src: string
  poster: string
  primary?: boolean
}) {
  return (
    <button
      type="button"
      className={`pt-pressable-card explore-search-empty__action${primary ? ' explore-search-empty__action--primary' : ''}`}
      aria-label={title}
      onClick={(event) => {
        clearPressFallback(event)
        onClick()
      }}
      onPointerDown={markPressFallback}
      onPointerUp={clearPressFallback}
      onPointerCancel={clearPressFallback}
      onPointerLeave={clearPressFallback}
      onKeyDown={markKeyboardPressFallback}
      onKeyUp={clearPressFallback}
      onBlur={clearPressFallback}
    >
      <video
        ref={videoRef}
        className="explore-search-empty__action-video"
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        data-explore-empty-video-state="poster"
      />
      <span className="explore-search-empty__action-scrim" aria-hidden="true" />
      <span className="explore-search-empty__action-icon" aria-hidden="true">
        <ExploreImportMethodIcon kind={kind} />
      </span>
      <span className="explore-search-empty__action-copy">
        <span className="explore-search-empty__action-title">{title}</span>
        <span className="explore-search-empty__action-description">{description}</span>
      </span>
      <svg className="explore-search-empty__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function ExploreImportMethodIcon({ kind }: { kind: ExploreImportMethod }) {
  if (kind === 'import') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M12 15V4.5m0 0-4 4m4-4 4 4M5 13.5v4A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 8.5v-2A2.5 2.5 0 0 1 6.5 4H8m8 0h1.5A2.5 2.5 0 0 1 20 6.5v2m0 7v2a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="9.5" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
