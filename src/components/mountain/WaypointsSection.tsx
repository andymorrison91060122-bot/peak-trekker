'use client'

import { useState } from 'react'

import type { Waypoint, WaypointType } from '@/lib/waypoints'
import { WAYPOINT_TYPE_KEYS, WAYPOINT_TYPES } from '@/lib/waypoints'
import { SectionHeader } from '@/components/ui/MountainUI'

function glyphStroke(currentColor: string) {
  return {
    stroke: currentColor,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

function WaypointTypeIcon({ type }: { type: WaypointType }) {
  const iconName = WAYPOINT_TYPES[type].icon
  const shared = glyphStroke('currentColor')

  switch (iconName) {
    case 'eye':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" {...shared} />
          <circle cx="12" cy="12" r="2.6" {...shared} />
        </svg>
      )
    case 'package':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z" {...shared} />
          <path d="M3 7.5 12 12l9-4.5" {...shared} />
          <path d="M12 12v9" {...shared} />
        </svg>
      )
    case 'corner-down-left':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M20 6v5a4 4 0 0 1-4 4H6" {...shared} />
          <path d="m10 11-4 4 4 4" {...shared} />
        </svg>
      )
    case 'tent':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M3 19 12 5l9 14" {...shared} />
          <path d="M12 5v14" {...shared} />
          <path d="M7 19h10" {...shared} />
        </svg>
      )
    case 'alert-triangle':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M12 3 2.5 20h19Z" {...shared} />
          <path d="M12 9v4.5" {...shared} />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'car':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M5 16V9.5l2-3h10l2 3V16" {...shared} />
          <path d="M3 12h18" {...shared} />
          <circle cx="7.5" cy="16.5" r="1.5" {...shared} />
          <circle cx="16.5" cy="16.5" r="1.5" {...shared} />
        </svg>
      )
    default:
      return null
  }
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 15l6-6 6 6" {...glyphStroke('currentColor')} />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" {...glyphStroke('currentColor')} />
    </svg>
  )
}

function buildExpandedState(waypoints: Waypoint[]) {
  return Object.fromEntries(
    WAYPOINT_TYPE_KEYS.map((type) => [
      type,
      waypoints.some((waypoint) => waypoint.type === type),
    ])
  ) as Record<WaypointType, boolean>
}

function formatElevation(elevation: number) {
  return `海拔 ${new Intl.NumberFormat('zh-CN').format(elevation)} 米`
}

export default function WaypointsSection({
  waypoints,
}: {
  waypoints: Waypoint[]
}) {
  if (waypoints.length === 0) return null

  const [expandedByType, setExpandedByType] = useState<Record<WaypointType, boolean>>(() =>
    buildExpandedState(waypoints)
  )

  const grouped = WAYPOINT_TYPE_KEYS
    .map((type) => ({
      type,
      label: WAYPOINT_TYPES[type].label,
      items: waypoints.filter((waypoint) => waypoint.type === type),
    }))
    .filter((group) => group.items.length > 0)

  if (grouped.length === 0) return null

  return (
    <section
      className="surface-card"
      data-testid="mountain-waypoints-section"
      style={{ padding: 16, marginBottom: 18 }}
    >
      <SectionHeader title="关键点位" />

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {grouped.map((group) => {
          const isExpanded = expandedByType[group.type]

          return (
            <div
              key={group.type}
              data-testid={`waypoint-display-group-${group.type}`}
              style={{ display: 'grid', gap: 'var(--space-3)' }}
            >
              <button
                type="button"
                data-testid={`waypoint-display-toggle-${group.type}`}
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedByType((current) => ({
                    ...current,
                    [group.type]: !current[group.type],
                  }))
                }
                style={{
                  width: '100%',
                  minHeight: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-variant)',
                  color: 'var(--color-on-surface)',
                  padding: '0 var(--space-4)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      width: 16,
                      height: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-primary)',
                      flexShrink: 0,
                    }}
                  >
                    <WaypointTypeIcon type={group.type} />
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      fontSize: 'var(--font-title-m-size)',
                      lineHeight: 'var(--font-title-m-line)',
                      fontWeight: 'var(--font-title-m-weight)',
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    {group.label}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    flexShrink: 0,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  <span
                    data-testid={`waypoint-display-count-${group.type}`}
                    style={{
                      fontSize: 'var(--font-label-s-size)',
                      lineHeight: 'var(--font-label-s-line)',
                      fontWeight: 'var(--font-label-s-weight)',
                    }}
                  >
                    {group.items.length} 个
                  </span>
                  <ChevronIcon expanded={isExpanded} />
                </div>
              </button>

              {isExpanded ? (
                <div
                  data-testid={`waypoint-display-list-${group.type}`}
                  style={{ display: 'grid', gap: 'var(--space-3)' }}
                >
                  {group.items.map((waypoint, index) => (
                    <article
                      key={waypoint.id}
                      data-testid={`waypoint-display-card-${group.type}-${index}`}
                      style={{
                        background: 'var(--color-surface-elevated)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-4)',
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--font-label-s-size)',
                          lineHeight: 'var(--font-label-s-line)',
                          fontWeight: 'var(--font-label-s-weight)',
                          color: 'var(--color-primary)',
                          marginBottom: 'var(--space-2)',
                        }}
                      >
                        {group.label}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--font-title-m-size)',
                          lineHeight: 'var(--font-title-m-line)',
                          fontWeight: 'var(--font-title-m-weight)',
                          color: 'var(--color-on-surface)',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {index + 1}. {waypoint.name}
                      </div>
                      {waypoint.description ? (
                        <div
                          data-testid={`waypoint-display-description-${group.type}-${index}`}
                          style={{
                            marginTop: 'var(--space-2)',
                            fontSize: 'var(--font-body-m-size)',
                            lineHeight: 'var(--font-body-m-line)',
                            fontWeight: 'var(--font-body-m-weight)',
                            color: 'var(--color-on-surface-variant)',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {waypoint.description}
                        </div>
                      ) : null}
                      {waypoint.elevation != null ? (
                        <div
                          data-testid={`waypoint-display-elevation-${group.type}-${index}`}
                          style={{
                            marginTop: 'var(--space-2)',
                            fontSize: 'var(--font-label-s-size)',
                            lineHeight: 'var(--font-label-s-line)',
                            fontWeight: 'var(--font-label-s-weight)',
                            color: 'var(--color-on-surface-variant)',
                          }}
                        >
                          {formatElevation(waypoint.elevation)}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
