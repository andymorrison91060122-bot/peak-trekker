import assert from 'node:assert/strict'
import { test } from 'node:test'
import { screenshotRecognitionErrorStatus } from '../src/lib/screenshot/recognition-status.ts'

test('screenshot recognition status does not treat accurate as rate-limited', () => {
  assert.equal(
    screenshotRecognitionErrorStatus(new Error('Tencent accurate OCR failed: 照片中未检测到文本')),
    502
  )
})

test('screenshot recognition status maps real quota and rate-limit errors', () => {
  assert.equal(screenshotRecognitionErrorStatus(new Error('rate limit exceeded')), 429)
  assert.equal(screenshotRecognitionErrorStatus(new Error('Too many requests')), 429)
  assert.equal(screenshotRecognitionErrorStatus(new Error('monthly quota exhausted')), 429)
  assert.equal(screenshotRecognitionErrorStatus(new Error('HTTP 429 from provider')), 429)
})

test('screenshot recognition status maps missing configuration to server error', () => {
  assert.equal(screenshotRecognitionErrorStatus(new Error('MIMO_API_KEY is not configured')), 500)
})
