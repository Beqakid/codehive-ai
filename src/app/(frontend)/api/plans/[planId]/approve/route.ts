/**
 * POST /api/plans/:planId/approve
 *
 * Manually approves a draft/submitted agent plan so CodeGen can run.
 * Requires the user to be logged in.
 */

export const dynamic = 'force-dynamic'

import { getPayload } from 'payload'
import config from '@/payload.config'

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers: new Headers(request.headers) })

  if (!user) {
    return new Response(null, { status: 302, headers: { Location: '/login' } })
  }

  const id = Number(planId)
  if (!id || isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid plan ID' }), { status: 400 })
  }

  try {
    await payload.update({
      collection: 'agent-plans',
      id,
      data: { status: 'approved' },
      overrideAccess: true,
    })

    // Redirect back to referrer or projects list
    const referer = request.headers.get('referer') || '/projects'
    return new Response(null, { status: 302, headers: { Location: referer } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
