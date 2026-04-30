import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { buildAuthReturnTarget, normalizeAuthReturnPath } from '@/lib/auth-redirect'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()

  // 需要登录的路由
  const protectedPaths = ['/trek', '/community', '/profile', '/prep']
  const isProtected = protectedPaths.some(p => pathname.startsWith(p))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('from', buildAuthReturnTarget(pathname, request.nextUrl.search))
    return NextResponse.redirect(url)
  }

  // 已登录时访问 auth 页面，跳回首页
  if (user && (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register'))) {
    const returnTo = normalizeAuthReturnPath(request.nextUrl.searchParams.get('from'), '/explore')
    return NextResponse.redirect(new URL(returnTo, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
