export const ACTIVITY_NOTE_MAX_LENGTH = 2000
export const ACTIVITY_PHOTO_MAX_COUNT = 9

export type EditableActivityStatus = 'pending' | 'approved' | 'rejected'

export type ActivityNoteValidationInput = {
  draftNote: string
  savedNote: string
  status: EditableActivityStatus
  isSaving?: boolean
}

export type ActivityPhotoUploadValidationInput = {
  currentPhotoCount: number
  selectedFileCount: number
  status: EditableActivityStatus
  isUploading?: boolean
}

export type ActivityPhotoDeleteValidationInput = {
  status: EditableActivityStatus
  isDeleting?: boolean
}

export function normalizeActivityNoteForSave(value: string) {
  return value.trim()
}

export function getActivityNoteValidation({
  draftNote,
  savedNote,
  status,
  isSaving = false,
}: ActivityNoteValidationInput) {
  const characterCount = draftNote.length
  const normalizedDraft = normalizeActivityNoteForSave(draftNote)
  const normalizedSaved = normalizeActivityNoteForSave(savedNote)
  const isApproved = status === 'approved'
  const isOverLimit = characterCount > ACTIVITY_NOTE_MAX_LENGTH
  const isChanged = normalizedDraft !== normalizedSaved

  return {
    characterCount,
    normalizedDraft,
    isApproved,
    isOverLimit,
    isChanged,
    canSave: isApproved && !isSaving && !isOverLimit && isChanged,
  }
}

export function getActivityPhotoUploadValidation({
  currentPhotoCount,
  selectedFileCount,
  status,
  isUploading = false,
}: ActivityPhotoUploadValidationInput) {
  const safeCurrentCount = Math.max(0, Math.floor(currentPhotoCount))
  const safeSelectedCount = Math.max(0, Math.floor(selectedFileCount))
  const nextPhotoCount = safeCurrentCount + safeSelectedCount
  const isApproved = status === 'approved'
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
  status,
  isDeleting = false,
}: ActivityPhotoDeleteValidationInput) {
  const isApproved = status === 'approved'

  return {
    isApproved,
    canDelete: isApproved && !isDeleting,
  }
}
