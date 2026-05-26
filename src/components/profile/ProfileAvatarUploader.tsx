'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isMissingStorageError } from '@/lib/storage-errors'
import { useAppToast } from '@/components/ui/AppToastProvider'
import IconButton from '@/components/ui/IconButton'
import { getLicenseLevelLabel } from '@/lib/license-ui'
import { LicenseTierGlyph } from '@/components/profile/LicenseProgressSheet'

const AVATAR_TOAST_STORAGE_KEY = 'peak-trekker:avatar-uploaded'
const AVATAR_STATUS_STORAGE_KEY = 'peak-trekker:avatar-status'
const AVATAR_INLINE_SUCCESS_MESSAGE = '头像更新成功，个人主页和山友圈会同步刷新。'

export default function ProfileAvatarUploader({
  username,
  province,
  initialAvatarUrl,
  licenseLevel,
  onLicenseClick,
}: {
  userId: string
  username: string
  province: string | null
  joinedAt: string
  initialAvatarUrl: string | null
  licenseLevel: string
  onLicenseClick?: () => void
}) {
  const router = useRouter()
  const { showToast } = useAppToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [isUploading, setIsUploading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusTone, setStatusTone] = useState<'success' | 'error'>('success')

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (window.sessionStorage.getItem(AVATAR_TOAST_STORAGE_KEY) === '1') {
      window.sessionStorage.removeItem(AVATAR_TOAST_STORAGE_KEY)
      showToast({ key: 'avatar_upload_success' })
    }

    const persistedStatus = window.sessionStorage.getItem(AVATAR_STATUS_STORAGE_KEY)
    if (persistedStatus === 'success') {
      setStatusTone('success')
      setStatusMessage(AVATAR_INLINE_SUCCESS_MESSAGE)
      window.sessionStorage.removeItem(AVATAR_STATUS_STORAGE_KEY)
    }
  }, [showToast])

  async function uploadAvatarViaRoute(file: File) {
    const formData = new FormData()
    formData.set('file', file)
    const response = await fetch('/api/profile/avatar-upload', {
      method: 'POST',
      body: formData,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || typeof data?.avatarUrl !== 'string') {
      throw new Error(String(data?.error ?? '头像上传失败，请稍后重试。'))
    }
    return data.avatarUrl as string
  }

  async function uploadAvatar(file: File) {
    const nextAvatarUrl = await uploadAvatarViaRoute(file)

    setAvatarUrl(`${nextAvatarUrl}${nextAvatarUrl.includes('?') ? '&' : '?'}t=${Date.now()}`)
    setStatusTone('success')
    setStatusMessage(AVATAR_INLINE_SUCCESS_MESSAGE)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(AVATAR_TOAST_STORAGE_KEY, '1')
      window.sessionStorage.setItem(AVATAR_STATUS_STORAGE_KEY, 'success')
    }
    showToast({ key: 'avatar_upload_success' })

    // Give the local success state enough time to render before refreshing server surfaces.
    window.setTimeout(() => {
      router.refresh()
    }, 1600)
  }

  function handleFileChange(file: File | null) {
    if (!file) return
    setStatusMessage('')
    setIsUploading(true)
    void (async () => {
      try {
        await uploadAvatar(file)
      } catch (error) {
        const message = error instanceof Error ? error.message : '头像上传失败，请稍后重试。'
        setStatusTone('error')
        setStatusMessage(message)
        showToast({
          key: isMissingStorageError(message) ? 'storage_missing' : 'avatar_upload_failure',
          message,
        })
      } finally {
        setIsUploading(false)
        if (inputRef.current) {
          inputRef.current.value = ''
        }
      }
    })()
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        data-testid="profile-avatar-input"
        suppressHydrationWarning
        style={{ display: 'none' }}
        onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
      />
      <section
        data-testid="profile-identity-card"
        style={{
          display: 'grid',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            minWidth: 0,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 58,
              height: 58,
              flex: '0 0 58px',
            }}
            data-testid="profile-avatar-shell"
          >
            <button
              type="button"
              aria-label="编辑头像"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              style={{
                width: 58,
                height: 58,
                border: 0,
                padding: 0,
                borderRadius: 'var(--radius-pill)',
                background: 'transparent',
                cursor: isUploading ? 'default' : 'pointer',
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={`${username} 的头像`}
                  data-testid="profile-avatar-image"
                  style={{
                    display: 'block',
                    width: 58,
                    height: 58,
                    borderRadius: 'var(--radius-pill)',
                    objectFit: 'cover',
                    border: '1px solid var(--color-outline)',
                  }}
                />
              ) : (
                <span
                  data-testid="profile-avatar-fallback"
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 'var(--radius-pill)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--color-on-surface)',
                    fontSize: 20,
                    lineHeight: 1,
                    fontWeight: 700,
                    border: '1px solid var(--color-outline)',
                    background:
                      'linear-gradient(180deg, color-mix(in srgb, var(--color-success) 28%, var(--color-surface-variant)), color-mix(in srgb, var(--color-success) 8%, var(--color-surface)))',
                  }}
                >
                  {username.trim().slice(0, 1) || '山'}
                </span>
              )}
            </button>
            <IconButton
              icon="edit"
              ariaLabel="编辑头像"
              variant="filled"
              shape="circular"
              data-testid="profile-avatar-edit-trigger"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 28,
                minWidth: 28,
                height: 28,
                minHeight: 28,
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--color-outline)',
                background: 'var(--color-surface-elevated)',
                color: 'var(--color-on-surface)',
              }}
            />
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-2)', minWidth: 0, flex: '1 1 auto' }}>
            <div
              className="pt-title-l"
              style={{
                color: 'var(--color-on-surface)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {username}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minWidth: 0, flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="profile-license-badge"
                aria-label={`查看执照进度，当前${getLicenseLevelLabel(licenseLevel)}`}
                onClick={onLicenseClick}
                className="pt-label-s"
                style={{
                  minHeight: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '0 var(--space-2)',
                  color: 'var(--color-success)',
                  border: '1px solid color-mix(in srgb, var(--color-success) 28%, transparent)',
                  background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
                  whiteSpace: 'nowrap',
                  cursor: onLicenseClick ? 'pointer' : 'default',
                }}
              >
                <LicenseTierGlyph level={licenseLevel} size={13} />
                <span>{getLicenseLevelLabel(licenseLevel)}</span>
                <span aria-hidden="true" style={{ color: 'var(--color-on-surface-variant)' }}>›</span>
              </button>
              <span
                className="pt-label-s"
                style={{
                  minHeight: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 'var(--radius-pill)',
                  padding: '0 var(--space-3)',
                  color: 'var(--color-on-surface-variant)',
                  border: '1px solid var(--color-outline)',
                  background: 'color-mix(in srgb, var(--color-on-surface) 5%, transparent)',
                  whiteSpace: 'nowrap',
                }}
              >
                {province ?? '未设置省份'}
              </span>
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div
            className="pt-label-m"
            data-tone={statusTone}
            style={{
              color: statusTone === 'error' ? 'var(--color-error)' : 'var(--color-success)',
            }}
          >
            {statusMessage}
          </div>
        ) : null}
      </section>
    </>
  )
}
