import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createScreenWakeLockController,
  shouldHoldScreenWakeLock,
  type WakeLockTrekStatus,
} from '../src/lib/use-wake-lock.ts'

type Listener = () => void

class FakeDocument {
  visibilityState: DocumentVisibilityState = 'visible'
  readonly listeners = new Set<Listener>()

  addEventListener(type: 'visibilitychange', listener: Listener) {
    assert.equal(type, 'visibilitychange')
    this.listeners.add(listener)
  }

  removeEventListener(type: 'visibilitychange', listener: Listener) {
    assert.equal(type, 'visibilitychange')
    this.listeners.delete(listener)
  }

  emitVisibilityChange() {
    for (const listener of Array.from(this.listeners)) {
      listener()
    }
  }
}

class FakeWakeLockSentinel {
  released = false
  releaseCalls = 0
  rejectRelease = false
  readonly listeners = new Set<Listener>()

  addEventListener(type: 'release', listener: Listener) {
    assert.equal(type, 'release')
    this.listeners.add(listener)
  }

  removeEventListener(type: 'release', listener: Listener) {
    assert.equal(type, 'release')
    this.listeners.delete(listener)
  }

  async release() {
    this.releaseCalls += 1
    if (this.rejectRelease) {
      throw new Error('release failed')
    }
    this.emitRelease()
  }

  emitRelease() {
    this.released = true
    for (const listener of Array.from(this.listeners)) {
      listener()
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

test('shouldHoldScreenWakeLock pins active trek status truth table', () => {
  const allStatuses: WakeLockTrekStatus[] = [
    'idle',
    'locating',
    'tracking',
    'approach_alert',
    'summit_photo',
    'summit_verified',
    'card_preview',
    'shared',
  ]
  const gpsStatuses: WakeLockTrekStatus[] = ['locating', 'tracking', 'approach_alert']

  for (const status of gpsStatuses) {
    assert.equal(shouldHoldScreenWakeLock(status, false), true, `${status} should hold while unpaused`)
    assert.equal(shouldHoldScreenWakeLock(status, true), false, `${status} should release while paused`)
  }

  assert.equal(shouldHoldScreenWakeLock('summit_photo', false), true)
  assert.equal(shouldHoldScreenWakeLock('summit_photo', true), true)

  for (const status of allStatuses.filter((value) => !gpsStatuses.includes(value) && value !== 'summit_photo')) {
    assert.equal(shouldHoldScreenWakeLock(status, false), false, `${status} should not hold while unpaused`)
    assert.equal(shouldHoldScreenWakeLock(status, true), false, `${status} should not hold while paused`)
  }
})

test('screen wake lock requests on active and releases on inactive', async () => {
  const documentRef = new FakeDocument()
  const sentinel = new FakeWakeLockSentinel()
  const requestTypes: string[] = []
  const controller = createScreenWakeLockController({
    documentRef,
    navigatorRef: {
      wakeLock: {
        request: async (type) => {
          requestTypes.push(type)
          return sentinel
        },
      },
    },
  })

  controller.setActive(true)
  await flushAsync()

  assert.deepEqual(requestTypes, ['screen'])
  assert.equal(documentRef.listeners.size, 1)

  controller.setActive(false)
  await flushAsync()

  assert.equal(sentinel.releaseCalls, 1)
  assert.equal(documentRef.listeners.size, 0)
})

test('screen wake lock releases a resolved sentinel after cleanup wins the request race', async () => {
  const documentRef = new FakeDocument()
  const sentinel = new FakeWakeLockSentinel()
  const request = deferred<FakeWakeLockSentinel>()
  const controller = createScreenWakeLockController({
    documentRef,
    navigatorRef: {
      wakeLock: {
        request: () => request.promise,
      },
    },
  })

  controller.setActive(true)
  controller.setActive(false)
  request.resolve(sentinel)
  await flushAsync()

  assert.equal(sentinel.releaseCalls, 1)
  assert.equal(documentRef.listeners.size, 0)
})

test('screen wake lock re-requests on visible only when no live sentinel is held', async () => {
  const documentRef = new FakeDocument()
  const firstSentinel = new FakeWakeLockSentinel()
  const secondSentinel = new FakeWakeLockSentinel()
  const sentinels = [firstSentinel, secondSentinel]
  const requestTypes: string[] = []
  const controller = createScreenWakeLockController({
    documentRef,
    navigatorRef: {
      wakeLock: {
        request: async (type) => {
          requestTypes.push(type)
          const nextSentinel = sentinels.shift()
          assert.ok(nextSentinel)
          return nextSentinel
        },
      },
    },
  })

  controller.setActive(true)
  await flushAsync()
  assert.equal(requestTypes.length, 1)

  documentRef.visibilityState = 'visible'
  documentRef.emitVisibilityChange()
  await flushAsync()
  assert.equal(requestTypes.length, 1)

  firstSentinel.emitRelease()
  documentRef.emitVisibilityChange()
  await flushAsync()

  assert.equal(requestTypes.length, 2)
})

test('screen wake lock no-ops when navigator wakeLock is unavailable', async () => {
  const documentRef = new FakeDocument()
  const missingWakeLockController = createScreenWakeLockController({
    documentRef,
    navigatorRef: {},
  })
  const missingNavigatorController = createScreenWakeLockController({
    documentRef,
    navigatorRef: null,
  })

  assert.doesNotThrow(() => {
    missingWakeLockController.setActive(true)
    missingNavigatorController.setActive(true)
    documentRef.emitVisibilityChange()
    missingWakeLockController.setActive(false)
    missingNavigatorController.setActive(false)
    missingWakeLockController.dispose()
    missingNavigatorController.dispose()
  })
  await flushAsync()
})

test('screen wake lock swallows request and release rejections', async () => {
  const requestErrors: unknown[] = []
  const requestRejectingController = createScreenWakeLockController({
    documentRef: new FakeDocument(),
    navigatorRef: {
      wakeLock: {
        request: async () => {
          throw new Error('request failed')
        },
      },
    },
    onError: (error) => requestErrors.push(error),
  })

  requestRejectingController.setActive(true)
  await flushAsync()

  assert.equal(requestErrors.length, 1)

  const releaseErrors: unknown[] = []
  const sentinel = new FakeWakeLockSentinel()
  sentinel.rejectRelease = true
  const releaseRejectingController = createScreenWakeLockController({
    documentRef: new FakeDocument(),
    navigatorRef: {
      wakeLock: {
        request: async () => sentinel,
      },
    },
    onError: (error) => releaseErrors.push(error),
  })

  releaseRejectingController.setActive(true)
  await flushAsync()
  releaseRejectingController.setActive(false)
  await flushAsync()

  assert.equal(releaseErrors.length, 1)
})

test('screen wake lock dispose removes listener and prevents later visibility requests', async () => {
  const documentRef = new FakeDocument()
  const sentinel = new FakeWakeLockSentinel()
  const requestTypes: string[] = []
  const controller = createScreenWakeLockController({
    documentRef,
    navigatorRef: {
      wakeLock: {
        request: async (type) => {
          requestTypes.push(type)
          return sentinel
        },
      },
    },
  })

  controller.setActive(true)
  await flushAsync()
  assert.equal(documentRef.listeners.size, 1)

  controller.dispose()
  await flushAsync()
  documentRef.emitVisibilityChange()
  await flushAsync()

  assert.equal(documentRef.listeners.size, 0)
  assert.equal(sentinel.releaseCalls, 1)
  assert.equal(requestTypes.length, 1)
})
