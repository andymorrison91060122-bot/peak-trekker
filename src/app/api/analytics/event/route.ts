import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { ANALYTICS_EVENT_TYPES, ANALYTICS_SESSION_COOKIE, ANALYTICS_SESSION_MAX_AGE_SECONDS } from '@/lib/analytics/constants'
import type { AnalyticsEventType } from '@/lib/analytics/types'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type AnalyticsPayload = {
  event_type?: unknown
  event_name?: unknown
  properties?: unknown
  page_path?: unknown
  referrer?: unknown
  client_ts?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEventType(value: unknown): value is AnalyticsEventType {
  return typeof value === 'string' && ANALYTICS_EVENT_TYPES.includes(value as AnalyticsEventType)
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.slice(0, 2048) : null
}

function safeProperties(value: unknown) {
  if (!isObject(value)) return {}
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function secureCookie() {
  return process.env.NODE_ENV === 'production'
}

function noContentWithSession(sessionId: string) {
  const response = new NextResponse(null, { status: 204 })
  response.cookies.set(ANALYTICS_SESSION_COOKIE, sessionId, {
    path: '/',
    sameSite: 'lax',
    secure: secureCookie(),
    maxAge: ANALYTICS_SESSION_MAX_AGE_SECONDS,
  })
  return response
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as AnalyticsPayload | null
  if (!body || !isEventType(body.event_type) || typeof body.event_name !== 'string' || !body.event_name.trim()) {
    return NextResponse.json({ error: 'invalid analytics event' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const headerStore = await headers()
  const sessionId = cookieStore.get(ANALYTICS_SESSION_COOKIE)?.value || crypto.randomUUID()
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const insertPayload = {
    user_id: user?.id ?? null,
    session_id: sessionId,
    event_type: body.event_type,
    event_name: body.event_name.trim().slice(0, 160),
    properties: safeProperties(body.properties),
    page_path: optionalString(body.page_path),
    referrer: optionalString(body.referrer),
    user_agent: optionalString(headerStore.get('user-agent')),
    client_ts: optionalString(body.client_ts),
  }

  const { error } = await supabase.from('events').insert(insertPayload)
  if (error) {
    console.warn('[analytics] insert skipped', {
      code: error.code,
      message: error.message,
      event_name: insertPayload.event_name,
    })
  }

  return noContentWithSession(sessionId)
}
