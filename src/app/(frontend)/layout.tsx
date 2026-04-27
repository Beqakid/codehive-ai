import React from 'react'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { LogoutButton } from '@/components/LogoutButton'
import HiveBackground from '@/components/HiveBackground'
import './styles.css'

export const metadata = {
  title: 'CodeHive AI — Coding Command Center',
  description: 'AI-powered code planning, generation, and testing platform',
}

/** Decode a JWT payload without verifying the signature (nav only — real auth happens per-request) */
function decodeJwtEmail(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payloadJson = Buffer.from(parts[1]!, 'base64url').toString('utf-8')
    const payload = JSON.parse(payloadJson) as Record<string, unknown>
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  const cookieStore = await cookies()
  const token = cookieStore.get('payload-token')
  const userEmail = token?.value ? decodeJwtEmail(token.value) : null
  const isLoggedIn = !!userEmail

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#020817', minHeight: '100vh', color: '#f1f5f9' }}>
        {/* Immersive hive background — fixed, behind everything */}
        <HiveBackground />

        {/* Top nav — glassmorphism over the hive */}
        <nav
          style={{
            background: 'rgba(7,13,26,0.82)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderBottom: '1px solid rgba(245,158,11,0.12)',
            padding: '0 2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 52,
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          {/* Brand */}
          <Link
            href={isLoggedIn ? '/projects' : '/'}
            style={{
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              letterSpacing: '-0.01em',
            }}
          >
            🐝 CodeHive AI
          </Link>

          {/* Nav links + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {isLoggedIn ? (
              <>
                <NavLink href="/projects">Projects</NavLink>
                <NavLink href="/dashboard">Dashboard</NavLink>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>
                  {userEmail}
                </span>
                <LogoutButton />
              </>
            ) : (
              <>
                <NavLink href="/login">Sign in</NavLink>
                <Link
                  href="/signup"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#000',
                    padding: '0.35rem 0.85rem',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                  }}
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>

        <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
      </body>
    </html>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        color: 'rgba(255,255,255,0.72)',
        textDecoration: 'none',
        fontSize: '0.85rem',
        fontWeight: 500,
        transition: 'color 0.15s',
      }}
    >
      {children}
    </Link>
  )
}
