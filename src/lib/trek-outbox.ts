import type { TrackPoint } from './trek-utils.ts'

const DB_NAME = 'peak_trekker_trek_v1'
const DB_VERSION = 1
const POINTS_STORE = 'points'
const FINISH_STORE = 'finishIntents'

export type TrekFinishIntent =
  | {
      kind: 'finish_incomplete'
      sessionId: string
      mountainId: string
      note: string
      elapsedSeconds: number
      distanceMeters: number
      ascentMeters: number
      startedAt: number
      testMode: boolean
      createdAt: number
    }
  | {
      kind: 'verify_summit'
      sessionId: string
      mountainId: string | null
      note: string
      photoUrl: string | null
      startedAt: number
      testMode: boolean
      createdAt: number
    }

type StoredOutboxPoint = {
  key: string
  sessionId: string
  id: string
  point: TrackPoint
  state: 'pending' | 'synced' | 'rejected'
  createdAt: number
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase | null> | null = null
let initFailed = false

function pointKey(sessionId: string, pointId: string) {
  return `${sessionId}:${pointId}`
}

function openDb() {
  if (typeof indexedDB === 'undefined') {
    initFailed = true
    return Promise.resolve(null)
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(POINTS_STORE)) {
        const store = db.createObjectStore(POINTS_STORE, { keyPath: 'key' })
        store.createIndex('sessionId', 'sessionId')
        store.createIndex('state', 'state')
      }
      if (!db.objectStoreNames.contains(FINISH_STORE)) {
        db.createObjectStore(FINISH_STORE, { keyPath: 'sessionId' })
      }
    }

    request.onerror = () => {
      initFailed = true
      resolve(null)
    }
    request.onsuccess = () => {
      initFailed = false
      resolve(request.result)
    }
  })

  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
) {
  const db = await openDb()
  if (!db) return null
  try {
    const transaction = db.transaction(storeName, mode)
    return await requestToPromise(callback(transaction.objectStore(storeName)))
  } catch {
    initFailed = true
    return null
  }
}

export function getTrekOutboxStatus() {
  return {
    degraded: initFailed || typeof indexedDB === 'undefined',
  }
}

export async function putTrekOutboxPoint(sessionId: string, point: TrackPoint) {
  if (!point.id) return { persisted: false, degraded: true }
  const now = Date.now()
  const record: StoredOutboxPoint = {
    key: pointKey(sessionId, point.id),
    sessionId,
    id: point.id,
    point,
    state: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  const result = await withStore(POINTS_STORE, 'readwrite', (store) => store.put(record))
  return { persisted: result !== null, degraded: result === null }
}

export async function listTrekOutboxPoints(sessionId: string, states: Array<StoredOutboxPoint['state']> = ['pending']) {
  const rows = await withStore(POINTS_STORE, 'readonly', (store) => store.getAll())
  if (!rows) return { points: [] as TrackPoint[], degraded: true }
  const stateSet = new Set(states)
  const points = (rows as StoredOutboxPoint[])
    .filter((row) => row.sessionId === sessionId && stateSet.has(row.state))
    .sort((a, b) => a.point.ts - b.point.ts || Number(a.point.captureSeq ?? 0) - Number(b.point.captureSeq ?? 0) || a.id.localeCompare(b.id))
    .map((row) => row.point)
  return { points, degraded: false }
}

async function markTrekOutboxPoints(sessionId: string, ids: string[], state: StoredOutboxPoint['state']) {
  const db = await openDb()
  if (!db) return { updated: 0, degraded: true }
  let updated = 0
  try {
    const transaction = db.transaction(POINTS_STORE, 'readwrite')
    const store = transaction.objectStore(POINTS_STORE)
    await Promise.all(ids.map(async (id) => {
      const key = pointKey(sessionId, id)
      const row = await requestToPromise<StoredOutboxPoint | undefined>(store.get(key))
      if (!row) return
      await requestToPromise(store.put({ ...row, state, updatedAt: Date.now() }))
      updated += 1
    }))
    return { updated, degraded: false }
  } catch {
    initFailed = true
    return { updated, degraded: true }
  }
}

export function markTrekOutboxPointsSynced(sessionId: string, ids: string[]) {
  return markTrekOutboxPoints(sessionId, ids, 'synced')
}

export function markTrekOutboxPointsRejected(sessionId: string, ids: string[]) {
  return markTrekOutboxPoints(sessionId, ids, 'rejected')
}

export async function clearTrekOutboxSession(sessionId: string, options: { allowPending?: boolean } = {}) {
  const db = await openDb()
  if (!db) return { cleared: false, degraded: true }
  try {
    const transaction = db.transaction([POINTS_STORE, FINISH_STORE], 'readwrite')
    const pointsStore = transaction.objectStore(POINTS_STORE)
    const rows = await requestToPromise<StoredOutboxPoint[]>(pointsStore.getAll())
    const sessionRows = rows.filter((row) => row.sessionId === sessionId)
    const pendingCount = sessionRows.filter((row) => row.state === 'pending').length
    if (pendingCount > 0 && !options.allowPending) {
      return { cleared: false, degraded: false, pendingCount }
    }
    await Promise.all(
      sessionRows.map((row) => requestToPromise(pointsStore.delete(row.key)))
    )
    await requestToPromise(transaction.objectStore(FINISH_STORE).delete(sessionId))
    return { cleared: true, degraded: false, pendingCount: 0 }
  } catch {
    initFailed = true
    return { cleared: false, degraded: true }
  }
}

export async function writeTrekFinishIntent(intent: TrekFinishIntent) {
  const result = await withStore(FINISH_STORE, 'readwrite', (store) => store.put(intent))
  return { persisted: result !== null, degraded: result === null }
}

export async function readTrekFinishIntent(sessionId: string) {
  const result = await withStore(FINISH_STORE, 'readonly', (store) => store.get(sessionId))
  return { intent: (result as TrekFinishIntent | undefined) ?? null, degraded: result === null }
}

export async function clearTrekFinishIntent(sessionId: string) {
  const result = await withStore(FINISH_STORE, 'readwrite', (store) => store.delete(sessionId))
  return { cleared: result !== null, degraded: result === null }
}
