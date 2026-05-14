import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isMissingOptionalCheckinColumnError } from '../src/lib/checkin-fallback-utils.ts'

describe('insertCheckinWithFallback missing column detection', () => {
  test('matches PostgreSQL quoted missing column errors', () => {
    assert.equal(
      isMissingOptionalCheckinColumnError('column "completion_status" does not exist', 'completion_status'),
      true
    )
  })

  test('matches PostgreSQL qualified missing column errors', () => {
    assert.equal(
      isMissingOptionalCheckinColumnError(
        'column checkins.completion_status does not exist',
        'completion_status'
      ),
      true
    )
  })

  test('matches PostgREST schema cache errors', () => {
    assert.equal(
      isMissingOptionalCheckinColumnError(
        "Could not find the 'completion_status' column of 'checkins' in the schema cache",
        'completion_status'
      ),
      true
    )
  })

  test('matches legacy optional column errors', () => {
    assert.equal(
      isMissingOptionalCheckinColumnError("'completion_status' column is not available", 'completion_status'),
      true
    )
  })

  test('does not match unrelated errors for the same column', () => {
    assert.equal(
      isMissingOptionalCheckinColumnError(
        'new row for relation "checkins" violates check constraint "checkins_completion_status_check"',
        'completion_status'
      ),
      false
    )
  })

  test('does not match missing errors for other columns', () => {
    assert.equal(
      isMissingOptionalCheckinColumnError('column checkins.photo_url does not exist', 'completion_status'),
      false
    )
  })
})
