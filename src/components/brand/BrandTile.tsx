/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, ImgHTMLAttributes } from 'react'
import { BRAND_ASSETS } from '@/lib/brand-assets'

type BrandTileProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'height' | 'src' | 'srcSet' | 'width'> & {
  size: number
  sourceSet?: 'small' | 'large'
  style?: CSSProperties
}

export function BrandTile({ size, sourceSet = 'small', style, ...props }: BrandTileProps) {
  const large = sourceSet === 'large'

  return (
    <img
      {...props}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      width={size}
      height={size}
      src={large ? BRAND_ASSETS.tile.icon256 : BRAND_ASSETS.tile.icon96}
      srcSet={large
        ? `${BRAND_ASSETS.tile.icon256} 256w, ${BRAND_ASSETS.tile.icon512} 512w`
        : `${BRAND_ASSETS.tile.icon96} 96w, ${BRAND_ASSETS.tile.icon128} 128w`}
      sizes={`${size}px`}
      style={{
        display: 'block',
        width: size,
        height: size,
        objectFit: 'contain',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
