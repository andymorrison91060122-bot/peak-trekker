'use client'

import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'

import IconButton from '@/components/ui/IconButton'
import {
  MAX_WAYPOINTS_PER_TYPE,
  WAYPOINT_TYPE_KEYS,
  WAYPOINT_TYPES,
  parseWaypointCoordinateInput,
  type Waypoint,
  type WaypointCoordinateField,
  type WaypointInput,
  type WaypointType,
} from '@/lib/waypoints'

type WaypointGroupMap = Record<WaypointType, Waypoint[]>
type WaypointDraft = {
  name: string
  description: string
  elevation: string
  latitude: string
  longitude: string
}

function createWaypointDraft(value?: Partial<Waypoint>): WaypointDraft {
  return {
    name: value?.name ?? '',
    description: value?.description ?? '',
    elevation: value?.elevation == null ? '' : String(value.elevation),
    latitude: value?.latitude == null ? '' : String(value.latitude),
    longitude: value?.longitude == null ? '' : String(value.longitude),
  }
}

function createEmptyByType<T>(factory: () => T): Record<WaypointType, T> {
  return Object.fromEntries(
    WAYPOINT_TYPE_KEYS.map((type) => [type, factory()])
  ) as Record<WaypointType, T>
}

function groupWaypoints(items: Waypoint[]): WaypointGroupMap {
  const groups = createEmptyByType<Waypoint[]>(() => [])
  for (const item of items) {
    groups[item.type].push(item)
  }
  return groups
}

function buildExpandedState(groups: WaypointGroupMap) {
  return Object.fromEntries(
    WAYPOINT_TYPE_KEYS.map((type) => [type, groups[type].length > 0])
  ) as Record<WaypointType, boolean>
}

function parseElevation(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  const next = Number(normalized)
  return Number.isFinite(next) ? next : null
}

function parseDraftCoordinate(field: WaypointCoordinateField, value: string) {
  const normalized = value.trim()
  const coordinate = parseWaypointCoordinateInput(field, normalized === '' ? null : normalized)
  return coordinate === undefined
    ? { ok: false as const, value: null }
    : { ok: true as const, value: coordinate }
}

function isDraftEqualToWaypoint(draft: WaypointDraft, waypoint: Waypoint) {
  const latitude = parseDraftCoordinate('latitude', draft.latitude)
  const longitude = parseDraftCoordinate('longitude', draft.longitude)

  return (
    draft.name === waypoint.name
    && draft.description === waypoint.description
    && parseElevation(draft.elevation) === waypoint.elevation
    && latitude.ok
    && latitude.value === waypoint.latitude
    && longitude.ok
    && longitude.value === waypoint.longitude
  )
}

function WaypointTypeIcon({ type }: { type: WaypointType }) {
  const iconName = WAYPOINT_TYPES[type].icon
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (iconName) {
    case 'eye':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" {...common} />
          <circle cx="12" cy="12" r="2.6" {...common} />
        </svg>
      )
    case 'package':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z" {...common} />
          <path d="M3 7.5 12 12l9-4.5" {...common} />
          <path d="M12 12v9" {...common} />
        </svg>
      )
    case 'corner-down-left':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M20 6v5a4 4 0 0 1-4 4H6" {...common} />
          <path d="m10 11-4 4 4 4" {...common} />
        </svg>
      )
    case 'tent':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M3 19 12 5l9 14" {...common} />
          <path d="M12 5v14" {...common} />
          <path d="M7 19h10" {...common} />
        </svg>
      )
    case 'alert-triangle':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M12 3 2.5 20h19Z" {...common} />
          <path d="M12 9v4.5" {...common} />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'car':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M5 16V9.5l2-3h10l2 3V16" {...common} />
          <path d="M3 12h18" {...common} />
          <circle cx="7.5" cy="16.5" r="1.5" {...common} />
          <circle cx="16.5" cy="16.5" r="1.5" {...common} />
        </svg>
      )
    default:
      return null
  }
}

async function postWaypointAction(body: Record<string, unknown>) {
  const response = await fetch('/api/admin/waypoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(payload?.error ?? '操作失败，请稍后重试。'))
  }

  return payload as Record<string, unknown>
}

export default function WaypointEditor({
  mountainId,
  initialWaypoints,
}: {
  mountainId: string
  initialWaypoints: Waypoint[]
}) {
  const [itemsByType, setItemsByType] = useState<WaypointGroupMap>(() => groupWaypoints(initialWaypoints))
  const [expandedTypes, setExpandedTypes] = useState<Record<WaypointType, boolean>>(() =>
    buildExpandedState(groupWaypoints(initialWaypoints))
  )
  const [draftEditsById, setDraftEditsById] = useState<Record<string, WaypointDraft>>({})
  const [draftNewByType, setDraftNewByType] = useState<Partial<Record<WaypointType, WaypointDraft>>>({})
  const [pendingById, setPendingById] = useState<Record<string, 'save' | 'delete' | undefined>>({})
  const [pendingNewByType, setPendingNewByType] = useState<Partial<Record<WaypointType, boolean>>>({})
  const [errorById, setErrorById] = useState<Record<string, string>>({})
  const [newErrorByType, setNewErrorByType] = useState<Partial<Record<WaypointType, string>>>({})
  const [groupFeedbackByType, setGroupFeedbackByType] = useState<Partial<Record<WaypointType, string>>>({})
  const feedbackTimersRef = useRef<Partial<Record<WaypointType, ReturnType<typeof setTimeout>>>>({})

  useEffect(() => {
    return () => {
      Object.values(feedbackTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer)
      })
    }
  }, [])

  function showGroupFeedback(type: WaypointType, message: string) {
    const timer = feedbackTimersRef.current[type]
    if (timer) clearTimeout(timer)
    setGroupFeedbackByType((current) => ({ ...current, [type]: message }))
    feedbackTimersRef.current[type] = setTimeout(() => {
      setGroupFeedbackByType((current) => ({ ...current, [type]: '' }))
    }, 2000)
  }

  function toggleGroup(type: WaypointType) {
    setExpandedTypes((current) => ({ ...current, [type]: !current[type] }))
  }

  function updateDraft(id: string, patch: Partial<WaypointDraft>) {
    setDraftEditsById((current) => {
      const next = { ...(current[id] ?? createWaypointDraft()), ...patch }
      return { ...current, [id]: next }
    })
  }

  function updateNewDraft(type: WaypointType, patch: Partial<WaypointDraft>) {
    setDraftNewByType((current) => ({
      ...current,
      [type]: { ...(current[type] ?? createWaypointDraft()), ...patch },
    }))
  }

  async function handleSaveExisting(type: WaypointType, waypoint: Waypoint) {
    const draft = draftEditsById[waypoint.id] ?? createWaypointDraft(waypoint)
    if (!draft.name.trim()) {
      setErrorById((current) => ({ ...current, [waypoint.id]: '名称不能为空' }))
      return
    }
    const latitude = parseDraftCoordinate('latitude', draft.latitude)
    const longitude = parseDraftCoordinate('longitude', draft.longitude)
    if (!latitude.ok || !longitude.ok) {
      setErrorById((current) => ({ ...current, [waypoint.id]: '坐标范围不正确' }))
      return
    }

    setPendingById((current) => ({ ...current, [waypoint.id]: 'save' }))
    setErrorById((current) => ({ ...current, [waypoint.id]: '' }))

    try {
      const payload = await postWaypointAction({
        action: 'update',
        waypointId: waypoint.id,
        updates: {
          name: draft.name.trim(),
          description: draft.description,
          elevation: parseElevation(draft.elevation),
          latitude: latitude.value,
          longitude: longitude.value,
        },
      })

      const nextWaypoint = payload.waypoint as Waypoint
      setItemsByType((current) => ({
        ...current,
        [type]: current[type].map((item) => (item.id === waypoint.id ? nextWaypoint : item)),
      }))
      setDraftEditsById((current) => {
        const next = { ...current }
        delete next[waypoint.id]
        return next
      })
      showGroupFeedback(type, '已保存')
    } catch (error) {
      setErrorById((current) => ({
        ...current,
        [waypoint.id]: error instanceof Error ? error.message : '保存失败，请稍后重试。',
      }))
    } finally {
      setPendingById((current) => ({ ...current, [waypoint.id]: undefined }))
    }
  }

  async function handleDelete(type: WaypointType, waypoint: Waypoint) {
    if (!window.confirm(`确认删除点位“${waypoint.name}”吗？`)) {
      return
    }

    setPendingById((current) => ({ ...current, [waypoint.id]: 'delete' }))
    setErrorById((current) => ({ ...current, [waypoint.id]: '' }))

    try {
      await postWaypointAction({
        action: 'delete',
        waypointId: waypoint.id,
      })
      setItemsByType((current) => ({
        ...current,
        [type]: current[type].filter((item) => item.id !== waypoint.id),
      }))
      setDraftEditsById((current) => {
        const next = { ...current }
        delete next[waypoint.id]
        return next
      })
      setErrorById((current) => {
        const next = { ...current }
        delete next[waypoint.id]
        return next
      })
      showGroupFeedback(type, '已删除')
    } catch (error) {
      setErrorById((current) => ({
        ...current,
        [waypoint.id]: error instanceof Error ? error.message : '删除失败，请稍后重试。',
      }))
    } finally {
      setPendingById((current) => ({ ...current, [waypoint.id]: undefined }))
    }
  }

  function handleStartAdd(type: WaypointType) {
    if (draftNewByType[type] || itemsByType[type].length >= MAX_WAYPOINTS_PER_TYPE) return

    setExpandedTypes((current) => ({ ...current, [type]: true }))
    setDraftNewByType((current) => ({ ...current, [type]: createWaypointDraft() }))
    setNewErrorByType((current) => ({ ...current, [type]: '' }))
  }

  async function handleSaveNew(type: WaypointType) {
    const draft = draftNewByType[type]
    if (!draft) return
    if (!draft.name.trim()) {
      setNewErrorByType((current) => ({ ...current, [type]: '名称不能为空' }))
      return
    }
    const latitude = parseDraftCoordinate('latitude', draft.latitude)
    const longitude = parseDraftCoordinate('longitude', draft.longitude)
    if (!latitude.ok || !longitude.ok) {
      setNewErrorByType((current) => ({ ...current, [type]: '坐标范围不正确' }))
      return
    }

    setPendingNewByType((current) => ({ ...current, [type]: true }))
    setNewErrorByType((current) => ({ ...current, [type]: '' }))

    try {
      const payload = await postWaypointAction({
        action: 'add',
        mountainId,
        waypoint: {
          type,
          name: draft.name.trim(),
          description: draft.description,
          elevation: parseElevation(draft.elevation),
          latitude: latitude.value,
          longitude: longitude.value,
        } satisfies WaypointInput,
      })

      const waypoint = payload.waypoint as Waypoint
      setItemsByType((current) => ({
        ...current,
        [type]: [...current[type], waypoint],
      }))
      setDraftNewByType((current) => ({ ...current, [type]: undefined }))
      showGroupFeedback(type, '已添加')
    } catch (error) {
      setNewErrorByType((current) => ({
        ...current,
        [type]: error instanceof Error ? error.message : '新增失败，请稍后重试。',
      }))
    } finally {
      setPendingNewByType((current) => ({ ...current, [type]: false }))
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="waypoint-editor">
      {WAYPOINT_TYPE_KEYS.map((type) => {
        const label = WAYPOINT_TYPES[type].label
        const items = itemsByType[type]
        const isExpanded = expandedTypes[type]
        const newDraft = draftNewByType[type]
        const isAddDisabled = items.length >= MAX_WAYPOINTS_PER_TYPE || Boolean(newDraft)

        return (
          <div
            key={type}
            className="surface-card"
            data-testid={`waypoint-group-${type}`}
            style={{ padding: 14, display: 'grid', gap: 12 }}
          >
            <button
              type="button"
              onClick={() => toggleGroup(type)}
              data-testid={`waypoint-toggle-${type}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--green-bright)',
                    flexShrink: 0,
                  }}
                >
                  <WaypointTypeIcon type={type} />
                </span>
                <div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: 'var(--text-primary)' }}>
                    {label} ({items.length}/{MAX_WAYPOINTS_PER_TYPE})
                  </div>
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                    {isExpanded ? '点击收起' : '点击展开'}
                  </div>
                </div>
              </div>

              <span style={{ fontFamily: 'Share Tech Mono', fontSize: 18, color: 'var(--text-muted)' }}>
                {isExpanded ? '▾' : '▸'}
              </span>
            </button>

            {isExpanded && (
              <div style={{ display: 'grid', gap: 12 }}>
                {groupFeedbackByType[type] ? (
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--green-bright)' }}>
                    {groupFeedbackByType[type]}
                  </div>
                ) : null}

                {items.length === 0 && !newDraft ? (
                  <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-muted)' }}>
                    当前还没有{label}
                  </div>
                ) : null}

                {items.map((waypoint) => {
                  const draft = draftEditsById[waypoint.id] ?? createWaypointDraft(waypoint)
                  const isDirty = !isDraftEqualToWaypoint(draft, waypoint)
                  const isSaving = pendingById[waypoint.id] === 'save'
                  const isDeleting = pendingById[waypoint.id] === 'delete'

                  return (
                    <div
                      key={waypoint.id}
                      data-testid={`waypoint-row-${waypoint.id}`}
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        padding: 12,
                        background: 'rgba(255,255,255,0.02)',
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <div style={waypointFieldGridStyle}>
                        <input
                          value={draft.name}
                          onChange={(event) => updateDraft(waypoint.id, { name: event.target.value })}
                          placeholder="点位名称"
                          disabled={isSaving || isDeleting}
                          style={fieldStyle}
                        />
                        <textarea
                          value={draft.description}
                          onChange={(event) => updateDraft(waypoint.id, { description: event.target.value })}
                          placeholder="点位描述"
                          disabled={isSaving || isDeleting}
                          rows={2}
                          style={{ ...fieldStyle, resize: 'vertical', minHeight: 68 }}
                        />
                        <input
                          value={draft.elevation}
                          onChange={(event) => updateDraft(waypoint.id, { elevation: event.target.value })}
                          placeholder="海拔(m)"
                          inputMode="numeric"
                          disabled={isSaving || isDeleting}
                          style={fieldStyle}
                        />
                        <input
                          value={draft.latitude}
                          onChange={(event) => updateDraft(waypoint.id, { latitude: event.target.value })}
                          placeholder="纬度"
                          inputMode="decimal"
                          disabled={isSaving || isDeleting}
                          style={fieldStyle}
                        />
                        <input
                          value={draft.longitude}
                          onChange={(event) => updateDraft(waypoint.id, { longitude: event.target.value })}
                          placeholder="经度"
                          inputMode="decimal"
                          disabled={isSaving || isDeleting}
                          style={fieldStyle}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={!isDirty || !draft.name.trim() || isSaving || isDeleting}
                          onClick={() => handleSaveExisting(type, waypoint)}
                          style={{ minHeight: 40, padding: '0 14px' }}
                        >
                          {isSaving ? '保存中...' : '保存'}
                        </button>
                        <IconButton
                          icon="delete"
                          ariaLabel={`删除${waypoint.name}`}
                          disabled={isSaving || isDeleting}
                          onClick={() => handleDelete(type, waypoint)}
                        />
                      </div>

                      {errorById[waypoint.id] ? (
                        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--color-error, #ef4444)' }}>
                          {errorById[waypoint.id]}
                        </div>
                      ) : null}
                    </div>
                  )
                })}

                {newDraft ? (
                  <div
                    data-testid={`waypoint-new-${type}`}
                    style={{
                      border: '1px dashed var(--border-color)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'rgba(255,255,255,0.02)',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={waypointFieldGridStyle}>
                      <input
                        value={newDraft.name}
                        onChange={(event) => updateNewDraft(type, { name: event.target.value })}
                        placeholder="点位名称"
                        disabled={Boolean(pendingNewByType[type])}
                        style={fieldStyle}
                      />
                      <textarea
                        value={newDraft.description}
                        onChange={(event) => updateNewDraft(type, { description: event.target.value })}
                        placeholder="点位描述"
                        disabled={Boolean(pendingNewByType[type])}
                        rows={2}
                        style={{ ...fieldStyle, resize: 'vertical', minHeight: 68 }}
                      />
                      <input
                        value={newDraft.elevation}
                        onChange={(event) => updateNewDraft(type, { elevation: event.target.value })}
                        placeholder="海拔(m)"
                        inputMode="numeric"
                        disabled={Boolean(pendingNewByType[type])}
                        style={fieldStyle}
                      />
                      <input
                        value={newDraft.latitude}
                        onChange={(event) => updateNewDraft(type, { latitude: event.target.value })}
                        placeholder="纬度"
                        inputMode="decimal"
                        disabled={Boolean(pendingNewByType[type])}
                        style={fieldStyle}
                      />
                      <input
                        value={newDraft.longitude}
                        onChange={(event) => updateNewDraft(type, { longitude: event.target.value })}
                        placeholder="经度"
                        inputMode="decimal"
                        disabled={Boolean(pendingNewByType[type])}
                        style={fieldStyle}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={!newDraft.name.trim() || Boolean(pendingNewByType[type])}
                        onClick={() => handleSaveNew(type)}
                        style={{ minHeight: 40, padding: '0 14px' }}
                      >
                        {pendingNewByType[type] ? '保存中...' : '保存'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={Boolean(pendingNewByType[type])}
                        onClick={() => {
                          setDraftNewByType((current) => ({ ...current, [type]: undefined }))
                          setNewErrorByType((current) => ({ ...current, [type]: '' }))
                        }}
                        style={{ minHeight: 40, padding: '0 14px' }}
                      >
                        取消
                      </button>
                    </div>

                    {newErrorByType[type] ? (
                      <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--color-error, #ef4444)' }}>
                        {newErrorByType[type]}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={isAddDisabled}
                    onClick={() => handleStartAdd(type)}
                    data-testid={`waypoint-add-${type}`}
                    style={{ minHeight: 40, padding: '0 14px' }}
                  >
                    + 添加{label}
                  </button>
                  {items.length >= MAX_WAYPOINTS_PER_TYPE ? (
                    <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: 'var(--text-muted)' }}>
                      已达上限
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const fieldStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'Share Tech Mono',
  fontSize: 12,
  outline: 'none',
}

const waypointFieldGridStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
}
