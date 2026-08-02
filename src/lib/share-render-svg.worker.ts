import { getCloudflareContext } from '@opennextjs/cloudflare'
import satori, { init } from 'satori/standalone'
import type { ShareSvgRenderInput } from './share-render-runtime.ts'

let yogaReady: Promise<void> | null = null

async function ensureWorkerYoga() {
  const { env } = await getCloudflareContext({ async: true })
  const yogaWasm = env.PEAK_TREKKER_YOGA_WASM
  if (!(yogaWasm instanceof WebAssembly.Module)) {
    throw new Error('Worker Yoga module is unavailable')
  }
  yogaReady ??= init(yogaWasm)
  return yogaReady
}

export async function renderShareSvgWithWorker({ element, fonts = [], width, height }: ShareSvgRenderInput) {
  await ensureWorkerYoga()
  return satori(element, { fonts, height, width })
}
