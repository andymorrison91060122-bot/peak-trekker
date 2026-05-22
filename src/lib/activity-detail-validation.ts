export const ACTIVITY_NOTE_MAX_LENGTH = 2000
export const ACTIVITY_PHOTO_MAX_COUNT = 9

export type ActivityNoteValidationInput = {
  draftNote: string
  savedNote: string
  isSaving?: boolean
}

export type ActivityPhotoUploadValidationInput = {
  currentPhotoCount: number
  selectedFileCount: number
  isUploading?: boolean
}

export type ActivityPhotoDeleteValidationInput = {
  isDeleting?: boolean
}

export function normalizeActivityNoteForSave(value: string) {
  return value.trim()
}

export function getActivityNoteValidation({
  draftNote,
  savedNote,
  isSaving = false,
}: ActivityNoteValidationInput) {
  const characterCount = draftNote.length
  const normalizedDraft = normalizeActivityNoteForSave(draftNote)
  const normalizedSaved = normalizeActivityNoteForSave(savedNote)
  const isApproved = true
  const isOverLimit = characterCount > ACTIVITY_NOTE_MAX_LENGTH
  const isChanged = normalizedDraft !== normalizedSaved

  return {
    characterCount,
    normalizedDraft,
    isApproved,
    isOverLimit,
    isChanged,
    canSave: !isSaving && !isOverLimit && isChanged,
  }
}

export function getActivityPhotoUploadValidation({
  currentPhotoCount,
  selectedFileCount,
  isUploading = false,
}: ActivityPhotoUploadValidationInput) {
  const safeCurrentCount = Math.max(0, Math.floor(currentPhotoCount))
  const safeSelectedCount = Math.max(0, Math.floor(selectedFileCount))
  const nextPhotoCount = safeCurrentCount + safeSelectedCount
  const isApproved = true
  const isOverLimit = nextPhotoCount > ACTIVITY_PHOTO_MAX_COUNT

  return {
    currentPhotoCount: safeCurrentCount,
    selectedFileCount: safeSelectedCount,
    nextPhotoCount,
    remainingPhotoCount: Math.max(0, ACTIVITY_PHOTO_MAX_COUNT - safeCurrentCount),
    isApproved,
    isOverLimit,
    canUpload: isApproved && !isUploading && safeSelectedCount > 0 && !isOverLimit,
  }
}

export function getActivityPhotoDeleteValidation({
  isDeleting = false,
}: ActivityPhotoDeleteValidationInput) {
  const isApproved = true

  return {
    isApproved,
    canDelete: isApproved && !isDeleting,
  }
}
