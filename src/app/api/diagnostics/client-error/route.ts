import { handleClientErrorDiagnosticPost } from '@/lib/client-error-diagnostic-request'

export async function POST(request: Request) {
  return handleClientErrorDiagnosticPost(request)
}
