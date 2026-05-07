import satori from 'satori'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { BaseClassicTemplate } from '@/lib/share-templates/base-classic'
import { BaseDataTemplate } from '@/lib/share-templates/base-data'
import { BaseMinimalTemplate } from '@/lib/share-templates/base-minimal'
import { POSTER_HEIGHT, POSTER_WIDTH } from '@/lib/share-templates/shared'
import type { ShareRenderRequest, ShareRenderTemplate, ShareTemplateData } from '@/lib/share-templates/types'
import { loadShareFonts } from '@/lib/fonts/load-share-fonts'

export const runtime = 'nodejs'

const VALID_TEMPLATES: ShareRenderTemplate[] = ['base-classic', 'base-minimal', 'base-data']

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

  return {
    template: template as ShareRenderTemplate,
    data,
  }
}

function renderTemplate({ template, data }: ShareRenderRequest) {
  if (template === 'base-minimal') return BaseMinimalTemplate({ data })
  if (template === 'base-data') return BaseDataTemplate({ data })
  return BaseClassicTemplate({ data })
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
    const [fonts] = await Promise.all([
      loadShareFonts(fontText(payload.data)),
      ensureResvgWasm(),
    ])

    const svg = await satori(renderTemplate(payload), {
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
