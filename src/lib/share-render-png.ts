import satori from 'satori'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import type { ReactElement } from 'react'

type SatoriOptions = Parameters<typeof satori>[1]

const DEFAULT_RENDER_WIDTH = 1080
const DEFAULT_RENDER_HEIGHT = 1920

let wasmReady = false

async function ensureResvgWasm() {
  if (wasmReady) return
  const wasm = await readFile(join(process.cwd(), 'node_modules/@resvg/resvg-wasm/index_bg.wasm'))
  await initWasm(wasm)
  wasmReady = true
}

export async function renderSharePng({
  element,
  fonts = [],
  width = DEFAULT_RENDER_WIDTH,
  height = DEFAULT_RENDER_HEIGHT,
  transparent = false,
}: {
  element: ReactElement
  fonts?: SatoriOptions['fonts']
  width?: number
  height?: number
  transparent?: boolean
}) {
  await ensureResvgWasm()

  const svg = await satori(element, {
    width,
    height,
    fonts,
  })
  const resvgOptions = transparent
    ? { fitTo: { mode: 'original' as const } }
    : {
        fitTo: { mode: 'original' as const },
        background: '#121416',
      }
  const png = new Resvg(svg, resvgOptions).render().asPng()
  const pngCopy = new Uint8Array(png.byteLength)
  pngCopy.set(png)

  return pngCopy
}
