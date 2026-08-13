import { loadBrandMarkMaskDataUri } from '@/lib/brand-assets.server'
import { RenderRoot } from '@/lib/share-templates/shared'
import { getShareTemplateComponent } from '@/lib/share-templates/registry'
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
import { renderShareSvg, renderSvgPng } from '@/lib/share-render-png'
import { createWorkerSvgResponse } from '@/lib/share-render-runtime'
import { ShareRenderPayloadPolicyError, assertShareRenderPayload } from '@/lib/share-render-policy'
import { applyPhotoGrayscaleSvgFilter } from '@/lib/share-svg-filters'
import {
  buildShareTrackPreview,
  buildShareTrackPreviewFromScreenshotRouteShape,
} from '@/lib/share-track-preview'
import { resolveMeasuredShareAltitude, resolveShareMountainName, resolveShareRenderSource } from '@/lib/share-data'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isScreenshotRecognitionSource } from '@/lib/trek-utils'

export const runtime = 'nodejs'

const VALID_TEMPLATES: readonly ShareRenderTemplate[] = SHARE_RENDER_TEMPLATE_IDS
const GRAYSCALE_PHOTO_TEMPLATES = new Set<ShareRenderTemplate>([
  'premium-mono-film',
  'premium-vertical-story',
])
const SHARE_RENDER_REQUEST_ID_HEADER = 'x-peak-trekker-render-id'

type ShareRenderFailureCode =
  | 'SR-AUTH'
  | 'SR-DATA'
  | 'SR-INVALID'
  | 'SR-PHOTO'
  | 'SR-FONT'
  | 'SR-BRAND'
  | 'SR-SVG'
  | 'SR-SVG-SIZE'
  | 'SR-PNG'
  | 'SR-UNKNOWN'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRequestId(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
}

function requestIdFor(request: Request) {
  const supplied = request.headers.get(SHARE_RENDER_REQUEST_ID_HEADER)
  return isRequestId(supplied) ? supplied : crypto.randomUUID()
}

function shareRenderFailure(requestId: string, code: ShareRenderFailureCode, status: number) {
  return Response.json(
    {
      error: 'Unable to render share image',
      code,
      errorId: requestId,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        [SHARE_RENDER_REQUEST_ID_HEADER]: requestId,
      },
    },
  )
}

function isBase64(value: string) {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
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
  track_name?: string | null
  track_points?: unknown
  screenshot_route_shape?: unknown
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
  track_name,
  track_points,
  screenshot_route_shape,
  mountains(id, name, altitude, province)
`

const SHARE_CHECKIN_SELECT_WITHOUT_SCREENSHOT_ROUTE_SHAPE = `
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
  track_name,
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
  track_name,
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

function parseRequestBody(body: unknown, requestId: string): ShareRenderApiRequest | Response {
  if (!isObject(body)) {
    return shareRenderFailure(requestId, 'SR-INVALID', 400)
  }

  const template = body.template
  if (typeof template !== 'string' || !VALID_TEMPLATES.includes(template as ShareRenderTemplate)) {
    return shareRenderFailure(requestId, 'SR-INVALID', 400)
  }

  try {
    assertShareRenderPayload(body)
  } catch (error) {
    if (error instanceof ShareRenderPayloadPolicyError) {
      return shareRenderFailure(requestId, 'SR-INVALID', 400)
    }
    throw error
  }

  const rawFieldVisibility = isObject(body.fieldVisibility) ? body.fieldVisibility : {}
  const photoBase64 = typeof body.photoBase64 === 'string'
    ? body.photoBase64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '').trim()
    : undefined
  if (photoBase64 && !isBase64(photoBase64)) {
    return shareRenderFailure(requestId, 'SR-PHOTO', 400)
  }

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

  const withoutShapeResult = await supabase
    .from('checkins')
    .select(SHARE_CHECKIN_SELECT_WITHOUT_SCREENSHOT_ROUTE_SHAPE)
    .eq('id', checkinId)
    .single()

  if (!withoutShapeResult.error || !isSchemaCompatibilityErrorMessage(withoutShapeResult.error.message)) {
    return withoutShapeResult as { data: ShareCheckinRow | null; error: typeof withoutShapeResult.error }
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

async function buildServerRenderPayload(
  apiRequest: ShareRenderApiRequest,
  requestId: string,
): Promise<{ payload: ShareRenderRequest; userId: string } | Response> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return shareRenderFailure(requestId, 'SR-AUTH', 403)
  }

  const { data: checkin, error } = await fetchShareCheckin(supabase, apiRequest.checkinId)

  if (error || !checkin) {
    return shareRenderFailure(requestId, 'SR-DATA', 404)
  }

  const row = checkin as ShareCheckinRow
  if (row.user_id !== user.id) {
    return shareRenderFailure(requestId, 'SR-AUTH', 403)
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
  const altitude = resolveMeasuredShareAltitude(row.max_elevation_meters, session?.max_altitude_m)
  const isScreenshotRecognition = isScreenshotRecognitionSource(row.source)
  const trackPreview = isScreenshotRecognition
    ? buildShareTrackPreviewFromScreenshotRouteShape(row.screenshot_route_shape)
    : buildShareTrackPreview(row.track_points) ?? buildShareTrackPreview(session?.track_points)

  const data: ShareTemplateData = {
    mountainName: resolveShareMountainName({
      mountainName: mountain?.name,
      trackName: row.track_name,
    }),
    location: mountain?.province ?? '',
    date: formatShareDate(row.start_time ?? session?.started_at ?? row.created_at),
    altitude,
    distance: typeof distanceMeters === 'number' ? Number((distanceMeters / 1000).toFixed(1)) : 0,
    duration: formatShareDuration(durationSeconds),
    elevationGain: elevationGain ?? 0,
    source: resolveShareRenderSource(row.source),
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
  void template
  const mimeType = photoBase64.startsWith('iVBORw0KGgo')
    ? 'image/png'
    : photoBase64.startsWith('UklGR')
      ? 'image/webp'
      : photoBase64.startsWith('R0lGOD')
        ? 'image/gif'
        : 'image/jpeg'
  return `data:${mimeType};base64,${photoBase64}`
}

function renderTemplate(
  { template, data }: ShareRenderRequest,
  photoDataUrl: string | null,
  brandMarkSrc?: string,
) {
  const Template = getShareTemplateComponent(template)
  if (!brandMarkSrc) return Template({ data, photoDataUrl })
  return Template({ data, photoDataUrl, brandMarkSrc })
}

function renderPayload(payload: ShareRenderRequest, photoDataUrl: string | null, brandMarkSrc?: string) {
  if (payload.transparent) {
    if (!brandMarkSrc) {
      return TransparentWatermarkTemplate({
        data: payload.data,
        template: payload.template,
      })
    }
    return TransparentWatermarkTemplate({ data: payload.data, template: payload.template, brandMarkSrc })
  }

  return renderTemplate(payload, photoDataUrl, brandMarkSrc)
}

function fontText(data: ShareTemplateData) {
  return [
    data.mountainName,
    data.location,
    data.date,
    data.duration,
    data.altitude == null ? '' : String(data.altitude),
    String(data.distance),
    String(data.elevationGain),
    '最高海拔总距离时长爬升日期Peak Trekker GPS VERIFIED UPLOADED 预览版',
  ].join(' ')
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  let body: unknown = null

  try {
    body = await request.json()
  } catch {
    body = null
  }

  let apiRequest: ShareRenderApiRequest | Response
  try {
    apiRequest = parseRequestBody(body, requestId)
  } catch (error) {
    console.error('share render failed to parse request', error)
    return shareRenderFailure(requestId, 'SR-UNKNOWN', 500)
  }
  if (apiRequest instanceof Response) {
    return apiRequest
  }

  let serverPayload: { payload: ShareRenderRequest; userId: string } | Response
  try {
    serverPayload = await buildServerRenderPayload(apiRequest, requestId)
  } catch (error) {
    console.error('share render failed to load server data', error)
    return shareRenderFailure(requestId, 'SR-DATA', 500)
  }

  if (serverPayload instanceof Response) {
    return serverPayload
  }

  const { payload, userId } = serverPayload
  const [fontsResult, photoResult, brandResult] = await Promise.allSettled([
      loadShareFonts(fontText(payload.data), request.url),
      payload.transparent ? null : photoDataUrlForTemplate(payload.template, payload.photoBase64),
      loadBrandMarkMaskDataUri(request.url),
  ])
  if (fontsResult.status === 'rejected') {
    console.error('share render failed to load fonts', fontsResult.reason)
    return shareRenderFailure(requestId, 'SR-FONT', 500)
  }
  if (photoResult.status === 'rejected') {
    console.error('share render failed to prepare photo input', photoResult.reason)
    return shareRenderFailure(requestId, 'SR-PHOTO', 400)
  }
  if (brandResult.status === 'rejected') {
    console.error('share render failed to load brand asset', brandResult.reason)
    return shareRenderFailure(requestId, 'SR-BRAND', 500)
  }

  let access: { allowed: boolean }
  try {
    const paywallEnabled = isPremiumPaywallEnabled()
    access = paywallEnabled
      ? await checkTemplateAccess(payload.template, userId)
      : { allowed: true }
  } catch (error) {
    console.error('share render failed to load access data', error)
    return shareRenderFailure(requestId, 'SR-DATA', 500)
  }

  let svg: string
  try {
    const fonts = fontsResult.value
    const photoDataUrl = photoResult.value
    const brandMarkSrc = brandResult.value
    const templateElement = renderPayload(payload, photoDataUrl, brandMarkSrc)
    const element = access.allowed
      ? templateElement
      : RenderRoot({
          paywallWatermark: true,
          children: templateElement,
        })
    svg = await renderShareSvg({
      element,
      fonts,
    })
    if (GRAYSCALE_PHOTO_TEMPLATES.has(payload.template) && photoDataUrl) {
      svg = applyPhotoGrayscaleSvgFilter(svg, photoDataUrl)
    }
  } catch (error) {
    console.error('share render failed to create SVG', error)
    return shareRenderFailure(requestId, 'SR-SVG', 500)
  }

  try {
    const workerSvgResponse = await createWorkerSvgResponse({
      request,
      svg,
      transparent: payload.transparent,
      headers: {
        'Cache-Control': 'no-store',
        [SHARE_RENDER_REQUEST_ID_HEADER]: requestId,
      },
    })
    if (workerSvgResponse) return workerSvgResponse
  } catch (error) {
    console.error('share render failed to hand off SVG', error)
    return shareRenderFailure(requestId, 'SR-UNKNOWN', 500)
  }

  try {
    const png = await renderSvgPng({ svg, transparent: payload.transparent })
    return new Response(new Blob([png.buffer], { type: 'image/png' }), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('share render failed to create PNG', error)
    return shareRenderFailure(requestId, 'SR-PNG', 500)
  }
}
