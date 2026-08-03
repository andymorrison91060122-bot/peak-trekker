import type { ReactElement } from 'react'
import type { ShareSvgRenderInput, SvgPngRenderInput } from './share-render-runtime.ts'

const DEFAULT_RENDER_WIDTH = 1080
const DEFAULT_RENDER_HEIGHT = 1920

export async function renderSvgPng(input: SvgPngRenderInput) {
  return (await import('./share-render-png.node.ts')).renderSvgPngWithNode(input)
}

export async function renderShareSvg({
  element,
  fonts = [],
  width = DEFAULT_RENDER_WIDTH,
  height = DEFAULT_RENDER_HEIGHT,
}: Omit<ShareSvgRenderInput, 'width' | 'height'> & {
  width?: number
  height?: number
}) {
  const input = { element, fonts, width, height }
  if (process.env.NEXT_PUBLIC_PEAK_TREKKER_RUNTIME === 'cloudflare') {
    return (await import('./share-render-svg.worker.ts')).renderShareSvgWithWorker(input)
  }
  return (await import('./share-render-svg.node.ts')).renderShareSvgWithNode(input)
}

export async function renderSharePng({
  element,
  fonts = [],
  width = DEFAULT_RENDER_WIDTH,
  height = DEFAULT_RENDER_HEIGHT,
  transparent = false,
}: {
  element: ReactElement
  fonts?: ShareSvgRenderInput['fonts']
  width?: number
  height?: number
  transparent?: boolean
}) {
  const svg = await renderShareSvg({ element, fonts, width, height })
  return renderSvgPng({ svg, transparent })
}
