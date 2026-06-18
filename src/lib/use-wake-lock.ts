'use client'

import { useEffect } from 'react'

export type WakeLockTrekStatus =
  | 'idle'
  | 'locating'
  | 'tracking'
  | 'approach_alert'
  | 'summit_photo'
  | 'summit_verified'
  | 'card_preview'
  | 'shared'

type WakeLockSentinelLike = {
  released?: boolean
  release: () => Promise<void> | void
  addEventListener?: (type: 'release', listener: () => void) => void
  removeEventListener?: (type: 'release', listener: () => void) => void
}

type WakeLockNavigatorLike = {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

type WakeLockDocumentLike = {
  visibilityState?: DocumentVisibilityState
  addEventListener?: (type: 'visibilitychange', listener: () => void) => void
  removeEventListener?: (type: 'visibilitychange', listener: () => void) => void
}

type ScreenWakeLockControllerOptions = {
  navigatorRef?: WakeLockNavigatorLike | null
  documentRef?: WakeLockDocumentLike | null
  onError?: (error: unknown) => void
}

export function shouldHoldScreenWakeLock(status: WakeLockTrekStatus, isPaused: boolean) {
  return ((status === 'locating' || status === 'tracking' || status === 'approach_alert') && !isPaused)
    || status === 'summit_photo'
}

function defaultNavigator() {
  return typeof navigator === 'undefined' ? null : (navigator as WakeLockNavigatorLike)
}

function defaultDocument() {
  return typeof document === 'undefined' ? null : (document as WakeLockDocumentLike)
}

export function createScreenWakeLockController(options: ScreenWakeLockControllerOptions = {}) {
  const navigatorRef = 'navigatorRef' in options ? options.navigatorRef : defaultNavigator()
  const documentRef = 'documentRef' in options ? options.documentRef : defaultDocument()
  const onError = options.onError

  let active = false
  let disposed = false
  let pendingRequestId: number | null = null
  let requestSeq = 0
  let sentinel: WakeLockSentinelLike | null = null
  let sentinelReleaseListener: (() => void) | null = null
  let visibilityListener: (() => void) | null = null

  const report = (error: unknown) => {
    onError?.(error)
  }

  const detachSentinelListener = () => {
    if (sentinel && sentinelReleaseListener) {
      sentinel.removeEventListener?.('release', sentinelReleaseListener)
    }
    sentinelReleaseListener = null
  }

  const clearSentinelRef = () => {
    detachSentinelListener()
    sentinel = null
  }

  const releaseSentinel = (target: WakeLockSentinelLike) => {
    Promise.resolve()
      .then(() => target.release())
      .catch(report)
  }

  const releaseCurrentSentinel = () => {
    const current = sentinel
    if (!current) return
    clearSentinelRef()
    releaseSentinel(current)
  }

  const hasLiveSentinel = () => {
    if (!sentinel) return false
    if (sentinel.released === true) {
      clearSentinelRef()
      return false
    }
    return true
  }

  const attachSentinel = (nextSentinel: WakeLockSentinelLike) => {
    clearSentinelRef()
    sentinel = nextSentinel
    sentinelReleaseListener = () => {
      if (sentinel === nextSentinel) {
        clearSentinelRef()
      }
    }
    nextSentinel.addEventListener?.('release', sentinelReleaseListener)
  }

  const requestWakeLock = async () => {
    if (disposed || !active || hasLiveSentinel() || pendingRequestId !== null) return
    const wakeLock = navigatorRef?.wakeLock
    if (!wakeLock || typeof wakeLock.request !== 'function') return

    const requestId = requestSeq + 1
    requestSeq = requestId
    pendingRequestId = requestId

    try {
      const nextSentinel = await wakeLock.request('screen')
      const shouldKeep = !disposed && active && pendingRequestId === requestId
      if (pendingRequestId === requestId) {
        pendingRequestId = null
      }

      if (!shouldKeep) {
        releaseSentinel(nextSentinel)
        return
      }

      attachSentinel(nextSentinel)
    } catch (error) {
      if (pendingRequestId === requestId) {
        pendingRequestId = null
      }
      report(error)
    }
  }

  const removeVisibilityListener = () => {
    if (!visibilityListener) return
    documentRef?.removeEventListener?.('visibilitychange', visibilityListener)
    visibilityListener = null
  }

  const ensureVisibilityListener = () => {
    if (visibilityListener || !documentRef?.addEventListener) return

    visibilityListener = () => {
      if (!active || disposed) return
      if (documentRef.visibilityState !== 'visible') return
      void requestWakeLock()
    }

    documentRef.addEventListener('visibilitychange', visibilityListener)
  }

  return {
    setActive(nextActive: boolean) {
      if (disposed) return

      active = nextActive

      if (!active) {
        pendingRequestId = null
        removeVisibilityListener()
        releaseCurrentSentinel()
        return
      }

      ensureVisibilityListener()
      void requestWakeLock()
    },

    dispose() {
      if (disposed) return

      disposed = true
      active = false
      pendingRequestId = null
      removeVisibilityListener()
      releaseCurrentSentinel()
    },
  }
}

export function useWakeLock(active: boolean) {
  useEffect(() => {
    const controller = createScreenWakeLockController()
    controller.setActive(active)

    return () => {
      controller.dispose()
    }
  }, [active])
}
