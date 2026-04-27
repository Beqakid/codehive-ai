import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    // overrideAccess: true because Users.create requires super_admin,
    // but signup is a public action. Explicitly set role to 'developer'.
    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { email, password, role: 'developer' },
    })

    // Auto-login after signup
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })

    if (!result?.token) {
      return NextResponse.json({ error: 'Account created but login failed' }, { status: 500 })
    }

    const response = NextResponse.json({ success: true, user: { email } })
    response.cookies.set('payload-token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create account'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
