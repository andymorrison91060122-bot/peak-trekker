'use client'

import { createContext, useContext } from 'react'

export type HelpSheetContextValue = {
  open: (anchor: string) => void
  close: () => void
}

export const HelpSheetContext = createContext<HelpSheetContextValue | null>(null)

export function useHelpSheet(): HelpSheetContextValue {
  const context = useContext(HelpSheetContext)

  if (!context) {
    throw new Error('useHelpSheet must be used within HelpSheetProvider')
  }

  return context
}
