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

export default function ProjectsLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#070d1a' }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid rgba(30,58,95,0.6)',
          background: 'rgba(7,13,26,0.75)',
          padding: '2.25rem 2rem 1.75rem',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ marginBottom: '1rem' }}><Skeleton w={140} h={14} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Skeleton w={180} h={28} />
              <div style={{ marginTop: 6 }}><Skeleton w={220} h={16} /></div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Skeleton w={70} h={48} r={9} />
              <Skeleton w={70} h={48} r={9} />
              <Skeleton w={70} h={48} r={9} />
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.1rem' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} w="100%" h={140} r={13} />
          ))}
        </div>
      </div>
    </div>
  )
}
