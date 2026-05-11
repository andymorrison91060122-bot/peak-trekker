'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FAQ_BY_ANCHOR } from '@/lib/faq-content'
import { HelpSheet } from './HelpSheet'
import { HelpSheetContext } from './useHelpSheet'

const CLOSE_ANIMATION_MS = 200

export default function HelpSheetProvider({ children }: { children: ReactNode }) {
  const [anchor, setAnchor] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const open = useCallback(
    (nextAnchor: string) => {
      if (!FAQ_BY_ANCHOR[nextAnchor]) return

      clearCloseTimer()
      setAnchor(nextAnchor)
      setClosing(false)
    },
    [clearCloseTimer]
  )

  const close = useCallback(() => {
    if (!anchor || closing) return

    clearCloseTimer()
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setAnchor(null)
      setClosing(false)
      closeTimerRef.current = null
    }, CLOSE_ANIMATION_MS)
  }, [anchor, clearCloseTimer, closing])

  useEffect(() => {
    if (!anchor) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [anchor])

  useEffect(() => {
    if (!anchor || closing) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [anchor, close, closing])

  const value = useMemo(() => ({ open, close }), [close, open])

  return (
    <HelpSheetContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && anchor
        ? createPortal(<HelpSheet key={anchor} anchor={anchor} closing={closing} onClose={close} />, document.body)
        : null}
    </HelpSheetContext.Provider>
  )
}
