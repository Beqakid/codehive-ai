'use client'

import React, { useState } from 'react'

export function LogoutButton() {
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      style={{
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.3)',
        color: '#fff',
        padding: '0.35rem 0.85rem',
        borderRadius: 6,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '0.82rem',
        fontWeight: 500,
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
