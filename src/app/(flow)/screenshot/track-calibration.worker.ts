/// <reference lib="webworker" />

import {
  solveLivewireCalibration,
  type CalibrationControlPoint,
  type LivewireSolveResult,
} from '../../../lib/screenshot-track/calibration.ts'

type InitMessage = {
  type: 'init'
  requestId: number
  version: number
  width: number
  height: number
  rgbaBuffer: ArrayBuffer
}

type SolveMessage = {
  type: 'solve'
  requestId: number
  version: number
  controlPoints: CalibrationControlPoint[]
}

type WorkerInboundMessage = InitMessage | SolveMessage

type WorkerOutboundMessage =
  | {
      type: 'ready'
      requestId: number
      version: number
      width: number
      height: number
    }
  | {
      type: 'result'
      requestId: number
      version: number
      result: LivewireSolveResult
    }
  | {
      type: 'error'
      requestId: number
      version: number
      message: string
    }

let rgba: Uint8ClampedArray | null = null
let imageWidth = 0
let imageHeight = 0

function post(message: WorkerOutboundMessage) {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data
  try {
    if (message.type === 'init') {
      rgba = new Uint8ClampedArray(message.rgbaBuffer)
      imageWidth = message.width
      imageHeight = message.height
      post({
        type: 'ready',
        requestId: message.requestId,
        version: message.version,
        width: imageWidth,
        height: imageHeight,
      })
      return
    }

    if (!rgba || imageWidth <= 0 || imageHeight <= 0) {
      throw new Error('校准底图尚未准备好。')
    }

    const result = solveLivewireCalibration({
      rgba,
      width: imageWidth,
      height: imageHeight,
      controlPoints: message.controlPoints,
    })
    post({
      type: 'result',
      requestId: message.requestId,
      version: message.version,
      result,
    })
  } catch (error) {
    post({
      type: 'error',
      requestId: message.requestId,
      version: message.version,
      message: error instanceof Error ? error.message : '轨迹校准计算失败。',
    })
  }
}
