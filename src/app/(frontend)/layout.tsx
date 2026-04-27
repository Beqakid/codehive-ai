import React from 'react'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import Link from 'next/link'
import config from '@/payload.config'
import { LogoutButton } from '@/components/LogoutButton'
import './styles.css'

export const metadata = {
  title: 'CodeHive AI — Coding Command Center',
  description: 'AI-powered code planning, generation, and testing platform',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f9fafb', minHeight: '100vh' }}>
        {/* Top nav */}
        <nav
          style={{
            background: '#0f172a',
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
            href={user ? '/projects' : '/'}
            style={{
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            🐝 CodeHive AI
          </Link>

          {/* Nav links + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {user ? (
              <>
                <NavLink href="/projects">Projects</NavLink>
                <NavLink href="/dashboard">Dashboard</NavLink>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.82rem' }}>
                  {user.email}
                </span>
                <LogoutButton />
              </>
            ) : (
              <>
                <NavLink href="/login">Sign in</NavLink>
                <Link
                  href="/signup"
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    padding: '0.35rem 0.85rem',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>

        <main>{children}</main>
      </body>
    </html>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        color: 'rgba(255,255,255,0.75)',
        textDecoration: 'none',
        fontSize: '0.85rem',
        fontWeight: 500,
      }}
    >
      {children}
    </Link>
  )
}
