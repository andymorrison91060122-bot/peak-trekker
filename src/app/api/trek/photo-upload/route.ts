import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024

function sanitizeExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName
  const subtype = file.type.split('/').pop()?.toLowerCase() ?? 'png'
  return /^[a-z0-9]{1,5}$/.test(subtype) ? subtype : 'png'
}

function sanitizeBaseName(file: File) {
  return (
    file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'checkin-photo'
  )
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少照片文件。' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '只能上传图片格式的照片。' }, { status: 400 })
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return NextResponse.json({ error: '照片文件不能超过 10MB。' }, { status: 400 })
  }

  const ext = sanitizeExtension(file)
  const safeBaseName = sanitizeBaseName(file)
  const relativeDir = path.join('checkin-photos', 'checkins', user.id)
  const absoluteDir = path.join(process.cwd(), 'public', relativeDir)
  await mkdir(absoluteDir, { recursive: true })

  const filename = `${Date.now()}-${safeBaseName}-${randomUUID()}.${ext}`
  const absolutePath = path.join(absoluteDir, filename)
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  await writeFile(absolutePath, fileBuffer)

  return NextResponse.json({
    ok: true,
    photoUrl: `/${relativeDir}/${filename}`,
  })
}
