import satori from 'satori'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import sharp from 'sharp'
import { BaseClassicTemplate } from '@/lib/share-templates/base-classic'
import { BaseDataTemplate } from '@/lib/share-templates/base-data'
import { PremiumAltitudeProfileTemplate } from '@/lib/share-templates/premium-altitude-profile'
import { PremiumBoldNumberTemplate } from '@/lib/share-templates/premium-bold-number'
import { PremiumDataScatterTemplate } from '@/lib/share-templates/premium-data-scatter'
import { PremiumMonoFilmTemplate } from '@/lib/share-templates/premium-mono-film'
import { PremiumPhotoCompositeTemplate } from '@/lib/share-templates/premium-photo-composite'
import { PremiumPhotoOverlayTemplate } from '@/lib/share-templates/premium-photo-overlay'
import { PremiumSummitCertificateTemplate } from '@/lib/share-templates/premium-summit-certificate'
import { PremiumVerticalStoryTemplate } from '@/lib/share-templates/premium-vertical-story'
import { RenderRoot, POSTER_HEIGHT, POSTER_WIDTH } from '@/lib/share-templates/shared'
import { TransparentWatermarkTemplate } from '@/lib/share-templates/transparent-watermark'
import {
  SHARE_RENDER_TEMPLATE_IDS,
  type ShareRenderRequest,
  type ShareRenderTemplate,
  type ShareTemplateData,
  type ShareVisibleFields,
} from '@/lib/share-templates/types'
import { loadShareFonts } from '@/lib/fonts/load-share-fonts'
import { checkTemplateAccess, isPremiumPaywallEnabled } from '@/lib/premium'
import { isSchemaCompatibilityErrorMessage } from '@/lib/schema-compat'
import { ShareRenderPayloadPolicyError, assertShareRenderPayload } from '@/lib/share-render-policy'
import { buildShareTrackPreview } from '@/lib/share-track-preview'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const VALID_TEMPLATES: readonly ShareRenderTemplate[] = SHARE_RENDER_TEMPLATE_IDS

let wasmReady = false

async function ensureResvgWasm() {
  if (wasmReady) return
  const wasm = await readFile(join(process.cwd(), 'node_modules/@resvg/resvg-wasm/index_bg.wasm'))
  await initWasm(wasm)
  wasmReady = true
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type ShareRenderApiRequest = {
  template: ShareRenderTemplate
  checkinId: string
  fieldVisibility: Partial<ShareVisibleFields>
  photoBase64?: string
  transparent: boolean
}

type MountainRelation = {
  id: string
  name: string | null
  altitude: number | null
  province: string | null
}

type ShareCheckinRow = {
  id: string
  user_id: string
  source: string | null
  created_at: string | null
  start_time?: string | null
  end_time?: string | null
  distance_meters?: number | null
  duration_seconds?: number | null
  elevation_gain_meters?: number | null
  max_elevation_meters?: number | null
  session_id?: string | null
  track_points?: unknown
  mountains: MountainRelation | MountainRelation[] | null
}

type TrekSessionRow = {
  id: string
  started_at: string | null
  ended_at: string | null
  distance_m: number | null
  ascent_m: number | null
  max_altitude_m: number | null
  track_points?: unknown
}

const SHARE_CHECKIN_SELECT_FULL = `
  id,
  user_id,
  source,
  created_at,
  start_time,
  end_time,
  distance_meters,
  duration_seconds,
  elevation_gain_meters,
  max_elevation_meters,
  session_id,
  track_points,
  mountains(id, name, altitude, province)
`

const SHARE_CHECKIN_SELECT_LEGACY = `
  id,
  user_id,
  source,
  created_at,
  start_time,
  end_time,
  distance_meters,
  duration_seconds,
  elevation_gain_meters,
  max_elevation_meters,
  session_id,
  mountains(id, name, altitude, province)
`

const TREK_SESSION_SELECT_FULL = 'id, started_at, ended_at, distance_m, ascent_m, max_altitude_m, track_points'
const TREK_SESSION_SELECT_LEGACY = 'id, started_at, ended_at, distance_m, ascent_m, max_altitude_m'

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function formatShareDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function formatShareDuration(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const safeSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function sourceForRender(source?: string | null): ShareTemplateData['source'] {
  return source === 'track_import' || source === 'screenshot_recognition' ? 'uploaded' : 'gps'
}

function parseRequestBody(body: unknown): ShareRenderApiRequest | Response {
  if (!isObject(body)) {
    return Response.json({ error: 'Invalid share render request' }, { status: 400 })
  }

  const template = body.template
  if (typeof template !== 'string' || !VALID_TEMPLATES.includes(template as ShareRenderTemplate)) {
    return Response.json({ error: 'Invalid share render request' }, { status: 400 })
  }

  try {
    assertShareRenderPayload(body)
  } catch (error) {
    if (error instanceof ShareRenderPayloadPolicyError) {
      return Response.json(
        {
          error: error.message,
          ...(error.hint ? { hint: error.hint } : {}),
        },
        { status: 400 },
      )
    }
    throw error
  }

  const rawFieldVisibility = isObject(body.fieldVisibility) ? body.fieldVisibility : {}
  const photoBase64 = typeof body.photoBase64 === 'string'
    ? body.photoBase64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '').trim()
    : undefined

  return {
    template: template as ShareRenderTemplate,
    checkinId: body.checkinId.trim(),
    fieldVisibility: {
      duration: asBoolean(rawFieldVisibility.duration, true),
      elevationGain: asBoolean(rawFieldVisibility.elevationGain, true),
      date: asBoolean(rawFieldVisibility.date, true),
      location: asBoolean(rawFieldVisibility.location, true),
      pace: asBoolean(rawFieldVisibility.pace, false),
      mountainName: asBoolean(rawFieldVisibility.mountainName, true),
    },
    photoBase64: photoBase64 || undefined,
    transparent: asBoolean(body.transparent, false),
  }
}

async function fetchShareCheckin(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  checkinId: string,
) {
  const fullResult = await supabase.from('checkins').select(SHARE_CHECKIN_SELECT_FULL).eq('id', checkinId).single()

  if (!fullResult.error || !isSchemaCompatibilityErrorMessage(fullResult.error.message)) {
    return fullResult as { data: ShareCheckinRow | null; error: typeof fullResult.error }
  }

  return (await supabase.from('checkins').select(SHARE_CHECKIN_SELECT_LEGACY).eq('id', checkinId).single()) as {
    data: ShareCheckinRow | null
    error: typeof fullResult.error
  }
}

async function fetchTrekSession(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sessionId: string,
) {
  const fullResult = await supabase
    .from('trek_sessions')
    .select(TREK_SESSION_SELECT_FULL)
    .eq('id', sessionId)
    .maybeSingle()

  if (!fullResult.error || !isSchemaCompatibilityErrorMessage(fullResult.error.message)) {
    return (fullResult.data ?? null) as TrekSessionRow | null
  }

  const legacyResult = await supabase
    .from('trek_sessions')
    .select(TREK_SESSION_SELECT_LEGACY)
    .eq('id', sessionId)
    .maybeSingle()

  return (legacyResult.data ?? null) as TrekSessionRow | null
}

async function buildServerRenderPayload(apiRequest: ShareRenderApiRequest): Promise<{ payload: ShareRenderRequest; userId: string } | Response> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: checkin, error } = await fetchShareCheckin(supabase, apiRequest.checkinId)

  if (error || !checkin) {
    return Response.json({ error: 'checkin not found' }, { status: 404 })
  }

  const row = checkin as ShareCheckinRow
  if (row.user_id !== user.id) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const mountain = firstRelation(row.mountains)
  let session: TrekSessionRow | null = null

  if (row.session_id) {
    session = await fetchTrekSession(supabase, row.session_id)
  }

  const distanceMeters = row.distance_meters ?? session?.distance_m ?? null
  const durationSeconds =
    row.duration_seconds ??
    (session?.started_at && session?.ended_at
      ? Math.max(0, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000))
      : null)
  const elevationGain = row.elevation_gain_meters ?? session?.ascent_m ?? null
  const altitude = row.max_elevation_meters ?? session?.max_altitude_m ?? mountain?.altitude ?? null
  const trackPreview = buildShareTrackPreview(row.track_points) ?? buildShareTrackPreview(session?.track_points)

  const data: ShareTemplateData = {
    mountainName: mountain?.name ?? '未知山峰',
    location: mountain?.province ?? '',
    date: formatShareDate(row.start_time ?? session?.started_at ?? row.created_at),
    altitude: altitude ?? 0,
    distance: typeof distanceMeters === 'number' ? Number((distanceMeters / 1000).toFixed(1)) : 0,
    duration: formatShareDuration(durationSeconds),
    elevationGain: elevationGain ?? 0,
    source: sourceForRender(row.source),
    trackPreview,
    visibleFields: {
      duration: apiRequest.fieldVisibility.duration !== false,
      elevationGain: apiRequest.fieldVisibility.elevationGain !== false,
      date: apiRequest.fieldVisibility.date !== false,
      location: apiRequest.fieldVisibility.location !== false,
      pace: apiRequest.fieldVisibility.pace === true,
      mountainName: apiRequest.fieldVisibility.mountainName !== false,
    },
  }

  return {
    payload: {
      template: apiRequest.template,
      data,
      photoBase64: apiRequest.photoBase64,
      transparent: apiRequest.transparent,
    },
    userId: user.id,
  }
}

async function photoDataUrlForTemplate(template: ShareRenderTemplate, photoBase64?: string) {
  if (!photoBase64) return null
  if (template !== 'premium-vertical-story') {
    return `data:image/jpeg;base64,${photoBase64}`
  }

  const grayBuffer = await sharp(Buffer.from(photoBase64, 'base64'))
    .grayscale()
    .jpeg({ quality: 86 })
    .toBuffer()
  return `data:image/jpeg;base64,${grayBuffer.toString('base64')}`
}

function renderTemplate({ template, data }: ShareRenderRequest, photoDataUrl: string | null) {
  if (template === 'base-data') return BaseDataTemplate({ data, photoDataUrl })
  if (template === 'premium-photo-composite') return PremiumPhotoCompositeTemplate({ data, photoDataUrl })
  if (template === 'premium-photo-overlay') return PremiumPhotoOverlayTemplate({ data, photoDataUrl })
  if (template === 'premium-bold-number') return PremiumBoldNumberTemplate({ data, photoDataUrl })
  if (template === 'premium-data-scatter') return PremiumDataScatterTemplate({ data, photoDataUrl })
  if (template === 'premium-mono-film') return PremiumMonoFilmTemplate({ data, photoDataUrl })
  if (template === 'premium-altitude-profile') return PremiumAltitudeProfileTemplate({ data, photoDataUrl })
  if (template === 'premium-summit-certificate') return PremiumSummitCertificateTemplate({ data })
  if (template === 'premium-vertical-story') return PremiumVerticalStoryTemplate({ data, photoDataUrl })
  return BaseClassicTemplate({ data, photoDataUrl })
}

function renderPayload(payload: ShareRenderRequest, photoDataUrl: string | null) {
  if (payload.transparent) {
    return TransparentWatermarkTemplate({ data: payload.data })
  }

  return renderTemplate(payload, photoDataUrl)
}

function fontText(data: ShareTemplateData) {
  return [
    data.mountainName,
    data.location,
    data.date,
    data.duration,
    String(data.altitude),
    String(data.distance),
    String(data.elevationGain),
    '峰顶海拔总距离时长爬升日期Peak Trekker GPS VERIFIED UPLOADED 预览版',
  ].join(' ')
}

export async function POST(request: Request) {
  let body: unknown = null

  try {
    body = await request.json()
  } catch {
    body = null
  }

  const apiRequest = parseRequestBody(body)
  if (apiRequest instanceof Response) {
    return apiRequest
  }

  let serverPayload: { payload: ShareRenderRequest; userId: string } | Response
  try {
    serverPayload = await buildServerRenderPayload(apiRequest)
  } catch (error) {
    console.error('share render failed to load server data', error)
    return Response.json({ error: 'Unable to load share data' }, { status: 500 })
  }

  if (serverPayload instanceof Response) {
    return serverPayload
  }

  try {
    const { payload, userId } = serverPayload
    const paywallEnabled = isPremiumPaywallEnabled()
    const [fonts, , photoDataUrl] = await Promise.all([
      loadShareFonts(fontText(payload.data)),
      ensureResvgWasm(),
      photoDataUrlForTemplate(payload.template, payload.photoBase64),
    ])
    const access = paywallEnabled
      ? await checkTemplateAccess(payload.template, userId)
      : { allowed: true }
    const templateElement = renderPayload(payload, photoDataUrl)

    const svg = await satori(
      access.allowed
        ? templateElement
        : RenderRoot({
            paywallWatermark: true,
            children: templateElement,
          }),
      {
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        fonts,
      },
    )
    const resvgOptions = payload.transparent
      ? { fitTo: { mode: 'original' as const } }
      : {
          fitTo: { mode: 'original' as const },
          background: '#121416',
        }
    const png = new Resvg(svg, resvgOptions).render().asPng()
    const pngCopy = new Uint8Array(png.byteLength)
    pngCopy.set(png)

    return new Response(new Blob([pngCopy.buffer], { type: 'image/png' }), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('share render failed', error)
    return Response.json({ error: 'Unable to render share image' }, { status: 500 })
  }
}
