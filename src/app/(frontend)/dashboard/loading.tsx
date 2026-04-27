import React from 'react'

function Skeleton({ w, h, r = 8 }: { w: string | number; h: string | number; r?: number }) {
  return (
    <div
      style={{
        width: typeof w === 'number' ? w : w,
        height: typeof h === 'number' ? h : h,
        borderRadius: r,
        background: 'linear-gradient(90deg, rgba(30,58,95,0.3) 25%, rgba(30,58,95,0.5) 50%, rgba(30,58,95,0.3) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  )
}

export default function DashboardLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#070d1a' }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* Header skeleton */}
      <div
        style={{
          borderBottom: '1px solid rgba(30,58,95,0.6)',
          background: 'rgba(7,13,26,0.7)',
          padding: '2.5rem 2rem 2rem',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Skeleton w={220} h={28} />
            <div style={{ marginTop: 8 }}><Skeleton w={160} h={16} /></div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Skeleton w={90} h={56} r={10} />
            <Skeleton w={90} h={56} r={10} />
            <Skeleton w={90} h={56} r={10} />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {/* Command interface placeholder */}
        <Skeleton w="100%" h={180} r={12} />

        <div style={{ height: 1, background: 'rgba(30,58,95,0.4)', margin: '2.5rem 0' }} />

        {/* Project cards placeholder */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} w="100%" h={160} r={12} />
          ))}
        </div>
      </div>
    </div>
  )
}
