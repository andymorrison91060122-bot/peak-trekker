import satori from 'satori'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import sharp from 'sharp'
import { BaseClassicTemplate } from '@/lib/share-templates/base-classic'
import { BaseDataTemplate } from '@/lib/share-templates/base-data'
import { BaseMinimalTemplate } from '@/lib/share-templates/base-minimal'
import { PremiumAltitudeProfileTemplate } from '@/lib/share-templates/premium-altitude-profile'
import { PremiumBoldNumberTemplate } from '@/lib/share-templates/premium-bold-number'
import { PremiumDataScatterTemplate } from '@/lib/share-templates/premium-data-scatter'
import { PremiumMonoFilmTemplate } from '@/lib/share-templates/premium-mono-film'
import { PremiumPhotoCompositeTemplate } from '@/lib/share-templates/premium-photo-composite'
import { PremiumPhotoOverlayTemplate } from '@/lib/share-templates/premium-photo-overlay'
import { PremiumSplitViewTemplate } from '@/lib/share-templates/premium-split-view'
import { PremiumSummitCertificateTemplate } from '@/lib/share-templates/premium-summit-certificate'
import { PremiumVerticalStoryTemplate } from '@/lib/share-templates/premium-vertical-story'
import { POSTER_HEIGHT, POSTER_WIDTH } from '@/lib/share-templates/shared'
import type { ShareRenderRequest, ShareRenderTemplate, ShareTemplateData } from '@/lib/share-templates/types'
import { loadShareFonts } from '@/lib/fonts/load-share-fonts'

export const runtime = 'nodejs'

const VALID_TEMPLATES: ShareRenderTemplate[] = [
  'base-classic',
  'base-minimal',
  'base-data',
  'premium-photo-composite',
  'premium-photo-overlay',
  'premium-split-view',
  'premium-bold-number',
  'premium-data-scatter',
  'premium-mono-film',
  'premium-altitude-profile',
  'premium-summit-certificate',
  'premium-vertical-story',
]

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

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeRequest(body: unknown): ShareRenderRequest | null {
  if (!isObject(body)) return null
  const template = body.template
  if (typeof template !== 'string' || !VALID_TEMPLATES.includes(template as ShareRenderTemplate)) {
    return null
  }

  const rawData = isObject(body.data) ? body.data : null
  if (!rawData) return null
  const rawVisibleFields = isObject(rawData.visibleFields) ? rawData.visibleFields : {}
  const source = rawData.source === 'uploaded' ? 'uploaded' : 'gps'

  const data: ShareTemplateData = {
    mountainName: asString(rawData.mountainName, '未知山峰') || '未知山峰',
    location: asString(rawData.location),
    date: asString(rawData.date),
    altitude: asNumber(rawData.altitude),
    distance: asNumber(rawData.distance),
    duration: asString(rawData.duration, '--') || '--',
    elevationGain: asNumber(rawData.elevationGain),
    source,
    visibleFields: {
      duration: asBoolean(rawVisibleFields.duration, true),
      elevationGain: asBoolean(rawVisibleFields.elevationGain, true),
      date: asBoolean(rawVisibleFields.date, true),
      location: asBoolean(rawVisibleFields.location, true),
      pace: asBoolean(rawVisibleFields.pace, false),
      mountainName: asBoolean(rawVisibleFields.mountainName, true),
    },
  }

  const photoBase64 = typeof body.photoBase64 === 'string'
    ? body.photoBase64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '').trim()
    : undefined

  return {
    template: template as ShareRenderTemplate,
    data,
    photoBase64: photoBase64 || undefined,
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
  if (template === 'base-minimal') return BaseMinimalTemplate({ data, photoDataUrl })
  if (template === 'base-data') return BaseDataTemplate({ data, photoDataUrl })
  if (template === 'premium-photo-composite') return PremiumPhotoCompositeTemplate({ data, photoDataUrl })
  if (template === 'premium-photo-overlay') return PremiumPhotoOverlayTemplate({ data, photoDataUrl })
  if (template === 'premium-split-view') return PremiumSplitViewTemplate({ data, photoDataUrl })
  if (template === 'premium-bold-number') return PremiumBoldNumberTemplate({ data, photoDataUrl })
  if (template === 'premium-data-scatter') return PremiumDataScatterTemplate({ data, photoDataUrl })
  if (template === 'premium-mono-film') return PremiumMonoFilmTemplate({ data, photoDataUrl })
  if (template === 'premium-altitude-profile') return PremiumAltitudeProfileTemplate({ data, photoDataUrl })
  if (template === 'premium-summit-certificate') return PremiumSummitCertificateTemplate({ data })
  if (template === 'premium-vertical-story') return PremiumVerticalStoryTemplate({ data, photoDataUrl })
  return BaseClassicTemplate({ data, photoDataUrl })
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
    '峰顶海拔总距离时长爬升日期Peak Trekker GPS VERIFIED UPLOADED',
  ].join(' ')
}

export async function POST(request: Request) {
  let payload: ShareRenderRequest | null = null

  try {
    payload = normalizeRequest(await request.json())
  } catch {
    payload = null
  }

  if (!payload) {
    return Response.json({ error: 'Invalid share render request' }, { status: 400 })
  }

  try {
    const [fonts, , photoDataUrl] = await Promise.all([
      loadShareFonts(fontText(payload.data)),
      ensureResvgWasm(),
      photoDataUrlForTemplate(payload.template, payload.photoBase64),
    ])

    const svg = await satori(renderTemplate(payload, photoDataUrl), {
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      fonts,
    })
    const png = new Resvg(svg, {
      fitTo: { mode: 'original' },
      background: '#121416',
    }).render().asPng()
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
