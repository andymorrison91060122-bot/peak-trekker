export interface OcrTextBlock {
  text: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

export interface OcrResult {
  textBlocks: OcrTextBlock[]
  rawText: string
}

export type ScreenshotOcrSource = 'mimo_v25'

export interface ScreenshotQuotaState {
  monthKey: string
  isFirstMonth: boolean
  subscriptionTier: 'free' | 'premium' | 'premium_trial'
  freeLimit: number
  freeUsed: number
  paidLimit: number
  paidUsed: number
  freeRemaining: number
  paidRemaining: number
  remaining: number
  totalLimit: number
}

export interface ParsedScreenshotFields {
  distance?: { value: number; unit: 'km'; raw: string }
  duration?: { value: number; raw: string }
  elevation?: { value: number; raw: string }
  elevationGain?: { value: number; raw: string }
  elevationLoss?: { value: number; raw: string }
  date?: { value: string; raw: string }
  speed?: { value: number; raw: string }
  paceMinPerKm?: { value: number; raw: string }
  calories?: { value: number; raw: string }
  location?: { value: string; raw: string }
}
