'use client'
import { useMemo } from 'react'

export default function HiveBackground() {
  const data = useMemo(() => {
    const s = 30 // circumradius
    const SQ3 = Math.sqrt(3)
    const colStep = SQ3 * s  // ~51.96
    const rowStep = 1.5 * s  // 45

    const COLS = 26
    const ROWS = 20

    const vw = COLS * colStep + colStep / 2
    const vh = ROWS * rowStep + s

    const cx = vw / 2
    const cy = vh / 2
    const maxR = Math.sqrt(cx * cx + cy * cy)

    const hexes: Array<{
      pts: string
      so: number
      fo: number
      glow: boolean
    }> = []

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = col * colStep + (row % 2) * (colStep / 2) + colStep / 2
        const y = row * rowStep + s

        const dx = x - cx
        const dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const norm = dist / maxR

        // Stroke opacity: very dark at center tunnel, glowing in wall zone, fading at edges
        let so: number
        if (norm < 0.12) {
          so = 0.015 + norm * 0.15  // dim tunnel
        } else if (norm < 0.22) {
          // transition zone
          so = 0.03 + (norm - 0.12) * 1.0
        } else if (norm < 0.65) {
          // wall zone — amber honeycomb glow
          const peak = 1 - Math.abs(norm - 0.42) / 0.3
          so = 0.10 + 0.18 * Math.max(0, peak)
        } else {
          so = Math.max(0, 0.10 * (1 - (norm - 0.65) / 0.35))
        }

        // Filled "honey" cells: scattered in wall zone
        const seed = (row * 37 + col * 23 + row * col * 3) % 100
        const inWallZone = norm > 0.18 && norm < 0.58
        const fo = inWallZone && seed < 14 ? 0.04 + 0.09 * (1 - norm) : 0
        const glow = fo > 0 && norm < 0.40

        // Pointy-top hex vertices
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 6
          return `${(x + s * Math.cos(a)).toFixed(2)},${(y + s * Math.sin(a)).toFixed(2)}`
        }).join(' ')

        hexes.push({ pts, so, fo, glow })
      }
    }

    return { hexes, vw: vw.toFixed(1), vh: vh.toFixed(1) }
  }, [])

  return (
    <div
      className="fixed inset-0 pointer-events-none select-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${data.vw} ${data.vh}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          {/* Amber ring — peaks in the wall zone */}
          <radialGradient id="hg-ring" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#92400e" stopOpacity="0" />
            <stop offset="18%" stopColor="#b45309" stopOpacity="0" />
            <stop offset="32%" stopColor="#d97706" stopOpacity="0.13" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.07" />
            <stop offset="75%" stopColor="#92400e" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>

          {/* Tunnel mouth — dark center */}
          <radialGradient id="hg-tunnel" cx="50%" cy="50%" r="18%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.65" />
            <stop offset="60%" stopColor="#000" stopOpacity="0.25" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Edge vignette */}
          <radialGradient id="hg-vignette" cx="50%" cy="50%" r="72%">
            <stop offset="45%" stopColor="transparent" stopOpacity="0" />
            <stop offset="100%" stopColor="#020817" stopOpacity="0.88" />
          </radialGradient>

          {/* Honey cell bloom */}
          <filter id="hg-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Honeycomb grid */}
        <g>
          {data.hexes.map(({ pts, so, fo, glow }, i) => (
            <polygon
              key={i}
              points={pts}
              fill={fo > 0 ? '#f59e0b' : 'none'}
              fillOpacity={fo}
              stroke="#f59e0b"
              strokeWidth="0.65"
              strokeOpacity={so}
              filter={glow ? 'url(#hg-glow)' : undefined}
            />
          ))}
        </g>

        {/* Layered atmosphere */}
        <rect width="100%" height="100%" fill="url(#hg-ring)" />
        <rect width="100%" height="100%" fill="url(#hg-tunnel)" />
        <rect width="100%" height="100%" fill="url(#hg-vignette)" />
      </svg>

      {/* Breathing amber pulse */}
      <div
        className="hive-pulse"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 52% 42% at 50% 50%, rgba(245,158,11,0.055) 0%, transparent 65%)',
        }}
      />

      {/* Second slower pulse ring */}
      <div
        className="hive-pulse-slow"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(180,83,9,0.04) 0%, transparent 60%)',
        }}
      />
    </div>
  )
}
