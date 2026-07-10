'use client'

import { useCallback, useEffect, useState } from 'react'
import { HelpTrigger } from '@/components/help/HelpTrigger'
import SecondaryButton from '@/components/ui/SecondaryButton'
import Skeleton from '@/components/ui/Skeleton'
import {
  toDailyWeatherViewModel,
  type DailyWeatherViewModel,
  type WeatherIconKind,
} from '@/lib/weather/weather-view-model'
import type { WeatherResponse } from '@/lib/weather/types'

type MountainWeatherSectionMountain = {
  id: string
  name: string
  altitude: number
}

type WeatherSectionState =
  | { status: 'loading' }
  | { status: 'ready'; weather: DailyWeatherViewModel }
  | { status: 'unavailable' }

export default function WeatherSection({
  mountain,
}: {
  mountain: MountainWeatherSectionMountain
}) {
  const [state, setState] = useState<WeatherSectionState>({ status: 'loading' })

  const loadWeather = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' })

    try {
      const response = await fetch(`/api/weather/${encodeURIComponent(mountain.id)}`, {
        cache: 'no-store',
        signal,
      })
      if (!response.ok) {
        throw new Error(`Weather request failed with HTTP ${response.status}.`)
      }

      const payload = await response.json() as WeatherResponse
      const weather = toDailyWeatherViewModel(payload, mountain)
      if (!weather) {
        throw new Error('Weather response missing usable current or forecast data.')
      }

      setState({ status: 'ready', weather })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'unavailable' })
    }
  }, [mountain])

  useEffect(() => {
    const controller = new AbortController()
    void loadWeather(controller.signal)
    return () => controller.abort()
  }, [loadWeather])

  if (state.status === 'loading') {
    return (
      <section id="weather-guidance" className="mountain-weather" data-testid="mountain-weather-section" data-weather-state="loading">
        <WeatherHeader right={<span className="mountain-weather__header-meta">加载中</span>} />
        <div className="mountain-weather__card mountain-weather__card--loading" aria-busy="true">
          <div className="mountain-weather__current-row">
            <Skeleton width={44} height={44} radius="var(--radius-md)" />
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <Skeleton width="min(142px, 100%)" height={24} />
              <Skeleton width="min(190px, 100%)" height={14} />
            </div>
            <Skeleton width={58} height={30} />
          </div>
          <div className="mountain-weather__forecast-row">
            <Skeleton height={74} />
            <Skeleton height={74} />
          </div>
        </div>
      </section>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <section id="weather-guidance" className="mountain-weather" data-testid="mountain-weather-section" data-weather-state="unavailable">
        <WeatherHeader right={<span className="mountain-weather__header-meta">天气暂不可用</span>} />
        <div className="mountain-weather__card mountain-weather__card--unavailable">
          <div className="mountain-weather__empty-icon">
            <WeatherIcon kind="cloud" />
          </div>
          <div className="mountain-weather__empty-title">天气暂时拿不到</div>
          <div className="mountain-weather__empty-copy">
            区域气象点没有响应，出发前请通过其他渠道复核。
          </div>
          <SecondaryButton className="mountain-weather__retry" onClick={() => loadWeather()}>
            重试
          </SecondaryButton>
        </div>
      </section>
    )
  }

  const weather = state.weather

  return (
    <section
      id="weather-guidance"
      className="mountain-weather"
      data-testid="mountain-weather-section"
      data-weather-state={weather.state}
      data-departure-policy={weather.departureWindow.policy}
    >
      <WeatherHeader
        right={
          <span className={`mountain-weather__header-meta ${weather.state === 'stale' ? 'mountain-weather__header-meta--stale' : ''}`}>
            <span className="mountain-weather__status-dot" aria-hidden />
            {weather.updateLabel}
            <HelpTrigger anchor="map.weather-lag" size={14} style={{ width: 26, height: 26 }} />
          </span>
        }
      />
      <div className={`mountain-weather__card ${weather.state === 'stale' ? 'mountain-weather__card--stale' : ''}`}>
        <div className="mountain-weather__current-row">
          <div className="mountain-weather__icon" aria-hidden>
            <WeatherIcon kind={weather.iconKind} />
          </div>
          <div className="mountain-weather__current-copy">
            <div className="mountain-weather__temperature-row">
              <span className="mountain-weather__temperature">{weather.current.temperature}</span>
              <span className="mountain-weather__feels-like">{weather.current.feelsLike}</span>
            </div>
            <div className="mountain-weather__description">
              {weather.current.description} · {weather.current.altitude}
            </div>
          </div>
          <div className={`mountain-weather__window mountain-weather__window--${weather.departureWindow.tone}`}>
            <span>窗口</span>
            <strong>{weather.departureWindow.label}</strong>
          </div>
        </div>

        <div className="mountain-weather__forecast-row" data-testid="mountain-weather-forecast-row">
          {weather.forecast.map((day) => (
            <div className="mountain-weather__forecast-card" key={day.key}>
              <div className="mountain-weather__forecast-label">{day.label}</div>
              <div className="mountain-weather__forecast-temp">{day.temperature}</div>
              <div className="mountain-weather__forecast-desc">{day.description}</div>
              <div className="mountain-weather__forecast-rain">降水 {day.precipitation}</div>
            </div>
          ))}
        </div>

        <div className="mountain-weather__kpi-row" data-testid="mountain-weather-kpis">
          {weather.kpis.map((item) => (
            <div className="mountain-weather__kpi" key={item.label}>
              <div className="mountain-weather__kpi-label">{item.label}</div>
              <div className={`mountain-weather__kpi-value ${item.tone === 'ok' ? '' : `mountain-weather__kpi-value--${item.tone}`}`}>
                {item.value}
              </div>
              <div className="mountain-weather__kpi-sub">{item.sub}</div>
            </div>
          ))}
        </div>

        <div className={`mountain-weather__risk-note ${weather.riskNote.tone === 'ok' ? '' : `mountain-weather__risk-note--${weather.riskNote.tone}`}`}>
          <WarnGlyph />
          <div>
            <strong>{weather.riskNote.title}</strong>
            <span> · {weather.riskNote.body}</span>
          </div>
        </div>

        <div className="mountain-weather__footnote">
          {weather.footnote} · {weather.providerLabel}
        </div>
      </div>
    </section>
  )
}

function WeatherHeader({ right }: { right: React.ReactNode }) {
  return (
    <div className="mountain-weather__header">
      <h2 className="mountain-weather__title">天气参考</h2>
      {right}
    </div>
  )
}

function WeatherIcon({ kind }: { kind: WeatherIconKind }) {
  if (kind === 'rain') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 16.5h9.2a3.8 3.8 0 0 0 .8-7.5A5.2 5.2 0 0 0 6.1 7.7 4.4 4.4 0 0 0 6 16.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="m8 20 1-2M12 20l1-2M16 20l1-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'snow') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4v16M5.1 8l13.8 8M18.9 8 5.1 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="m9.5 5.8 2.5 2.5 2.5-2.5M9.5 18.2l2.5-2.5 2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'wind') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8h9.5a2.5 2.5 0 1 0-2.2-3.7M3 12h15.5a2.5 2.5 0 1 1-2.2 3.7M5 16h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'cloud') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 17h10.2a3.8 3.8 0 0 0 .8-7.5 5.2 5.2 0 0 0-9.9-1.3A4.4 4.4 0 0 0 6 17Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function WarnGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 4 9 16H3L12 4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 9v5M12 17.5v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
