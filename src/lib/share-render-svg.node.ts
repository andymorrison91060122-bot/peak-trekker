import satori from 'satori'
import type { ShareSvgRenderInput } from './share-render-runtime.ts'

export function renderShareSvgWithNode({ element, fonts = [], width, height }: ShareSvgRenderInput) {
  return satori(element, { fonts, height, width })
}
