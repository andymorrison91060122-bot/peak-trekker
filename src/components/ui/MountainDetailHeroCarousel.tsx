'use client'

import { useMemo, useRef, useState } from 'react'
import { MountainImagePlaceholder } from '@/components/ui/MountainUI'

export default function MountainDetailHeroCarousel({
  name,
  altitude,
  images,
}: {
  name: string
  altitude: number
  images: string[]
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const slides = useMemo(() => {
    const normalized = images.filter((image) => typeof image === 'string' && image.trim().length > 0).slice(0, 3)
    return normalized.length > 0 ? normalized : [null]
  }, [images])

  function syncIndex() {
    if (!trackRef.current) return
    const nextIndex = Math.round(trackRef.current.scrollLeft / Math.max(trackRef.current.clientWidth, 1))
    setActiveIndex(Math.max(0, Math.min(slides.length - 1, nextIndex)))
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={trackRef}
        data-testid="mountain-hero-carousel"
        data-slide-count={slides.length}
        onScroll={syncIndex}
        style={{
          display: 'flex',
          overflowX: slides.length > 1 ? 'auto' : 'hidden',
          scrollSnapType: slides.length > 1 ? 'x mandatory' : undefined,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {slides.map((image, index) => (
          <div
            key={`${image ?? 'placeholder'}-${index}`}
            data-testid="mountain-hero-slide"
            style={{
              flex: '0 0 100%',
              minWidth: '100%',
              scrollSnapAlign: 'start',
            }}
          >
            <MountainImagePlaceholder
              name={slides.length > 1 ? `${name} 图 ${index + 1}` : name}
              altitude={altitude}
              size="lg"
              coverImage={image ?? undefined}
            />
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div
          data-testid="mountain-hero-indicator"
          style={{
            position: 'absolute',
            right: 14,
            bottom: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(8, 12, 14, 0.7)',
            backdropFilter: 'blur(10px)',
            color: 'rgba(245, 247, 248, 0.92)',
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          <span>{activeIndex + 1}/{slides.length}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {slides.map((_, index) => (
              <span
                key={index}
                aria-hidden="true"
                style={{
                  width: index === activeIndex ? 12 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: index === activeIndex ? 'var(--green-bright)' : 'rgba(255,255,255,0.4)',
                  transition: 'width 0.18s ease, background-color 0.18s ease',
                }}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
