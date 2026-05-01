'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isMissingStorageError } from '@/lib/storage-errors'
import { useAppToast } from '@/components/ui/AppToastProvider'
import IconButton from '@/components/ui/IconButton'
import { getLicenseIcon, getLicenseLevelLabel } from '@/lib/license-ui'

const AVATAR_TOAST_STORAGE_KEY = 'peak-trekker:avatar-uploaded'
const AVATAR_STATUS_STORAGE_KEY = 'peak-trekker:avatar-status'
const AVATAR_INLINE_SUCCESS_MESSAGE = '头像更新成功，个人主页和山友圈会同步刷新。'

export default function ProfileAvatarUploader({
  username,
  province,
  joinedAt,
  initialAvatarUrl,
  licenseLevel,
}: {
  userId: string
  username: string
  province: string | null
  joinedAt: string
  initialAvatarUrl: string | null
  licenseLevel: string
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
        style={{ display: 'none' }}
        onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
      />
      <div className="profile-identity-card" data-testid="profile-identity-card">
        <div className="profile-identity-row">
          <div className="profile-avatar-shell" data-testid="profile-avatar-shell">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={`${username} 的头像`}
                data-testid="profile-avatar-image"
                className="profile-avatar-image"
              />
            ) : (
              <div className="profile-avatar-fallback" data-testid="profile-avatar-fallback">
                {province?.slice(0, 1) ?? '山'}
              </div>
            )}
            <IconButton
              icon="edit"
              ariaLabel="编辑头像"
              variant="filled"
              shape="circular"
              className="profile-avatar-edit-trigger"
              data-testid="profile-avatar-edit-trigger"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            />
          </div>

          <div className="profile-identity-copy">
            <div className="profile-identity-name">{username}</div>
            <div className="profile-identity-meta">
              {province ?? '—'} · 注册于 {new Date(joinedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
            </div>
            <div className="profile-identity-license">
              <div className="muted-chip active">
                {getLicenseIcon(licenseLevel)} {getLicenseLevelLabel(licenseLevel)}
              </div>
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div className="profile-avatar-status" data-tone={statusTone}>
            {statusMessage}
          </div>
        ) : null}
      </div>
    </>
  )
}
