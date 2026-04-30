import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const MAX_AVATAR_SIZE_BYTES = 3 * 1024 * 1024

function sanitizeExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName
  const subtype = file.type.split('/').pop()?.toLowerCase() ?? 'png'
  return /^[a-z0-9]{1,5}$/.test(subtype) ? subtype : 'png'
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
    return NextResponse.json({ error: '缺少头像文件。' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '请上传图片格式的头像。' }, { status: 400 })
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return NextResponse.json({ error: '头像文件不能超过 3MB。' }, { status: 400 })
  }

  const ext = sanitizeExtension(file)
  const relativeDir = path.join('avatars', user.id)
  const absoluteDir = path.join(process.cwd(), 'public', relativeDir)
  await mkdir(absoluteDir, { recursive: true })

  const filename = `${Date.now()}-${randomUUID()}.${ext}`
  const absolutePath = path.join(absoluteDir, filename)
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  await writeFile(absolutePath, fileBuffer)

  const avatarUrl = `/${relativeDir}/${filename}`
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message || '头像保存失败，请稍后重试。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, avatarUrl })
}
