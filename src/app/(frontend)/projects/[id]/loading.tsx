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

export default function ProjectDetailLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#070d1a' }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid rgba(30,58,95,0.6)',
          background: 'rgba(7,13,26,0.75)',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <Skeleton w={120} h={14} />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton w={280} h={32} />
            <Skeleton w={70} h={26} r={9999} />
          </div>
          <div style={{ marginTop: 8 }}><Skeleton w={400} h={16} /></div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Skeleton w="100%" h={200} r={14} />
        <Skeleton w="100%" h={300} r={14} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <Skeleton w="100%" h={140} r={14} />
          <Skeleton w="100%" h={140} r={14} />
        </div>
      </div>
    </div>
  )
}
