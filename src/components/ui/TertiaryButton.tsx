'use client'

import { ButtonPrimitive, type ButtonPrimitiveProps } from '@/components/ui/internal/ButtonPrimitive'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type TertiaryButtonProps = DistributiveOmit<ButtonPrimitiveProps, 'variant' | 'outlined'>

export default function TertiaryButton(props: TertiaryButtonProps) {
  return <ButtonPrimitive {...(props as ButtonPrimitiveProps)} variant="tertiary" />
}
