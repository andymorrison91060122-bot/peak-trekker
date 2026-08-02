'use client'

import type { CSSProperties } from 'react'
import type { FaqQuestion } from '@/lib/faq-content'

type FaqImage = NonNullable<FaqQuestion['image']>

type FaqAnswerContentProps = {
  answer: string
  image?: FaqImage
  imageMaxWidth: number
}

const bodyStyle: CSSProperties = {
  color: 'var(--color-on-surface-variant)',
  fontSize: 'var(--font-label-m-size)',
  lineHeight: 'calc(var(--font-label-m-line) * 1.26)',
  whiteSpace: 'pre-line',
}

export function FaqAnswerContent({ answer, image, imageMaxWidth }: FaqAnswerContentProps) {
  return (
    <div style={{ display: 'grid', gap: image ? 12 : 0 }}>
      <div style={bodyStyle}>{answer}</div>
      {image ? (
        <div style={{ display: 'grid' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: imageMaxWidth,
              height: 'auto',
              marginInline: 'auto',
              borderRadius: 12,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
