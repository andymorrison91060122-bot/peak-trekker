import type satori from 'satori'
import type { ReactElement } from 'react'

type SatoriOptions = Parameters<typeof satori>[1]

export type ShareSvgRenderInput = {
  element: ReactElement
  fonts?: SatoriOptions['fonts']
  width: number
  height: number
}

export type SvgPngRenderInput = {
  svg: string
  fontBuffers?: ArrayBuffer[]
  transparent?: boolean
}

export type SvgPngRenderer = (input: SvgPngRenderInput) => Promise<Uint8Array<ArrayBuffer>>

export const WORKER_SVG_RESPONSE_HEADER = 'x-peak-trekker-worker-svg'
export const WORKER_SVG_TRANSPARENT_HEADER = 'x-peak-trekker-worker-transparent'

function isWorkerSvgRenderEnabled() {
  return process.env.NEXT_PUBLIC_PEAK_TREKKER_RUNTIME === 'cloudflare'
}

export async function createWorkerSvgResponse({
  request,
  svg,
  headers,
  transparent = false,
}: {
  request: Request
  svg: string
  headers?: HeadersInit
  transparent?: boolean
}) {
  void request
  if (!isWorkerSvgRenderEnabled()) return null

  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'image/svg+xml')
  responseHeaders.set('Content-Length', String(new TextEncoder().encode(svg).byteLength))
  responseHeaders.set(WORKER_SVG_RESPONSE_HEADER, '1')
  if (transparent) responseHeaders.set(WORKER_SVG_TRANSPARENT_HEADER, '1')
  return new Response(svg, { headers: responseHeaders })
}
