'use client'

import { ButtonPrimitive, type ButtonPrimitiveProps } from '@/components/ui/internal/ButtonPrimitive'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type SecondaryButtonProps = DistributiveOmit<ButtonPrimitiveProps, 'variant'> & {
  outlined?: boolean
}

export default function SecondaryButton({
  outlined = true,
  ...props
}: SecondaryButtonProps) {
  return (
    <ButtonPrimitive
      {...(props as ButtonPrimitiveProps)}
      variant="secondary"
      outlined={outlined}
    />
  )
}
