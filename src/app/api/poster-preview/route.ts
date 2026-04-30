import { NextRequest } from 'next/server'

// 直接用固定数据生成预览，不需要 Supabase 数据
import { GET as posterGET } from '../poster/route'

// 提供一个带假数据的预览地址：注入 mock checkinId
// 实际上我们直接复用 poster 的 SVG 逻辑，传入 demo 参数
export async function GET(request: NextRequest) {
  // 构建一个带 demo=1 的请求转发给 poster
  const url = new URL(request.url)
  url.pathname = '/api/poster'
  url.searchParams.set('checkinId', 'demo')
  const renderMode = url.searchParams.get('renderMode')
  if (!url.searchParams.get('previewBackground')) {
    if (renderMode === 'overlay_only') {
      url.searchParams.set('previewBackground', 'checker')
    }
    if (renderMode === 'photo_composite') {
      url.searchParams.set('previewBackground', 'scenic')
    }
  }
  const fakeReq = new NextRequest(url.toString())
  return posterGET(fakeReq)
}
