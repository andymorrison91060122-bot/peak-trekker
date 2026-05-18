import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ACTIVITY_NOTE_MAX_LENGTH,
  ACTIVITY_PHOTO_MAX_COUNT,
  getActivityNoteValidation,
  getActivityPhotoUploadValidation,
} from '../../src/lib/activity-detail-validation.ts'

test('activity note validation blocks unchanged, saving, unapproved, and over-limit drafts', () => {
  assert.equal(
    getActivityNoteValidation({
      draftNote: '今天风很大',
      savedNote: '今天风很大',
      status: 'approved',
    }).canSave,
    false
  )

  assert.equal(
    getActivityNoteValidation({
      draftNote: '今天风很大',
      savedNote: '',
      status: 'pending',
    }).canSave,
    false
  )

  assert.equal(
    getActivityNoteValidation({
      draftNote: '今天风很大',
      savedNote: '',
      status: 'approved',
      isSaving: true,
    }).canSave,
    false
  )

  const overLimit = getActivityNoteValidation({
    draftNote: '山'.repeat(ACTIVITY_NOTE_MAX_LENGTH + 1),
    savedNote: '',
    status: 'approved',
  })
  assert.equal(overLimit.isOverLimit, true)
  assert.equal(overLimit.canSave, false)
})

test('activity note validation allows changed approved drafts and trims payload', () => {
  const result = getActivityNoteValidation({
    draftNote: '  山顶风停了  ',
    savedNote: '山顶风很大',
    status: 'approved',
  })

  assert.equal(result.canSave, true)
  assert.equal(result.normalizedDraft, '山顶风停了')
})

test('activity photo upload validation enforces approved status, in-flight guard, and 9-photo cap', () => {
  assert.equal(
    getActivityPhotoUploadValidation({
      currentPhotoCount: 8,
      selectedFileCount: 1,
      status: 'approved',
    }).canUpload,
    true
  )

  const overLimit = getActivityPhotoUploadValidation({
    currentPhotoCount: 8,
    selectedFileCount: 2,
    status: 'approved',
  })
  assert.equal(overLimit.isOverLimit, true)
  assert.equal(overLimit.canUpload, false)

  assert.equal(
    getActivityPhotoUploadValidation({
      currentPhotoCount: ACTIVITY_PHOTO_MAX_COUNT,
      selectedFileCount: 1,
      status: 'approved',
    }).canUpload,
    false
  )

  assert.equal(
    getActivityPhotoUploadValidation({
      currentPhotoCount: 0,
      selectedFileCount: 1,
      status: 'pending',
    }).canUpload,
    false
  )

  assert.equal(
    getActivityPhotoUploadValidation({
      currentPhotoCount: 0,
      selectedFileCount: 1,
      status: 'approved',
      isUploading: true,
    }).canUpload,
    false
  )
})
