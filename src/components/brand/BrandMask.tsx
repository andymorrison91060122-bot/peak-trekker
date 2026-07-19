import type { CSSProperties, HTMLAttributes } from 'react'
import { BRAND_ASSETS } from '@/lib/brand-assets'

type BrandMaskProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  asset?: 'mark' | 'crest'
  size: number
  style?: CSSProperties
}

export function BrandMask({ asset = 'mark', size, style, ...props }: BrandMaskProps) {
  const image = asset === 'crest' ? BRAND_ASSETS.mask.crestUi384 : BRAND_ASSETS.mask.markUi128

  return (
    <span
      {...props}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: 'currentColor',
        maskImage: `url(${image})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: `url(${image})`,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        ...style,
      }}
    />
  )
}
