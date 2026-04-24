'use client'
import BgImage from '../hub/BgImage'

import { useState, useMemo } from 'react'
import { Dungeon, Enemy, Boss } from '@/types/game'
import { useRouter } from 'next/navigation'
import { startRunAction } from '@/actions/activeRunAction'
import { MONO, pixelDungeonBtn, pixelDungeonBtnHover } from '@/app/(game)/hub/pixelStyles'

interface Props {
  dungeons: Dungeon[]
  enemiesByDungeon: Record<number, Enemy[]>
  bossByDungeon: Record<number, Boss>
  onBack?: () => void
  onEnterDungeon?: (data: import('@/stores/gameNavStore').CombatData) => void
}

const rankColors: Record<string, { border: string; text: string; glow: string }> = {
  F: { border: '#555',    text: '#aaa',    glow: 'rgba(150,150,150,0.3)' },
  E: { border: '#2a7',    text: '#4e4',    glow: 'rgba(40,180,80,0.3)'  },
  D: { border: '#47f',    text: '#68f',    glow: 'rgba(60,100,255,0.3)' },
  C: { border: '#a4f',    text: '#c6f',    glow: 'rgba(150,60,255,0.3)' },
  B: { border: '#ca0',    text: '#fd0',    glow: 'rgba(220,170,0,0.3)'  },
  A: { border: '#e60',    text: '#f80',    glow: 'rgba(240,100,0,0.3)'  },
  S: { border: '#e22',    text: '#f44',    glow: 'rgba(220,30,30,0.4)'  },
}

const BOARD_W = 1560  // referencia para el algoritmo de posiciones (1920px base)
const BOARD_H = 830   // referencia para el algoritmo de posiciones (1080px base)
const CARD_W  = 190
const CARD_H  = 260
const PADDING = 16

// Generador pseudo-random determinista — mismo seed = mismos valores siempre
function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function generatePositions(dungeons: { id: number }[]): { x: number; y: number; rotate: number }[] {
  const positions: { x: number; y: number; rotate: number }[] = []
  const maxX = BOARD_W - CARD_W - PADDING
  const maxY = BOARD_H - CARD_H - PADDING

  for (let i = 0; i < dungeons.length; i++) {
    const rand = seededRandom(dungeons[i].id * 2654435761)
    let best = { x: PADDING + rand() * maxX, y: PADDING + rand() * maxY }

    for (let a = 0; a < 300; a++) {
      const r = seededRandom(dungeons[i].id * 2654435761 + a * 1000031)
      const candidate = { x: PADDING + r() * maxX, y: PADDING + r() * maxY }
      const overlaps = positions.some(p =>
        Math.abs(p.x - candidate.x) < CARD_W + 16 &&
        Math.abs(p.y - candidate.y) < CARD_H + 16
      )
      if (!overlaps) { best = candidate; break }
    }

    const rr = seededRandom(dungeons[i].id * 999983)
    positions.push({
      x: Math.round(best.x),
      y: Math.round(best.y),
      rotate: (rr() - 0.5) * 5,
    })
  }
  return positions
}

export default function DungeonBoard({ dungeons, enemiesByDungeon, bossByDungeon, onBack, onEnterDungeon }: Props) {
  const router = useRouter()
  const [entering, setEntering] = useState<number | null>(null)
  const positions = useMemo(() => generatePositions(dungeons), [dungeons])

  async function handleEnter(dungeonId: number) {
    setEntering(dungeonId)
    await startRunAction(dungeonId)
    if (onEnterDungeon) {
      // Modo SPA: fetch de datos del dungeon en cliente y transición sin navegación
      const res = await fetch(`/api/dungeon/${dungeonId}/combat-data`)
      if (res.ok) {
        const data = await res.json()
        onEnterDungeon(data)
      } else {
        // Fallback a navegación tradicional
        router.replace(`/dungeon/${dungeonId}`)
      }
    } else {
      router.replace(`/dungeon/${dungeonId}`)
    }
  }

  return (
    <div
      className="h-screen text-white flex flex-col overflow-hidden"
      
     style={{}}>
      <BgImage src="/sprites/backgrounds/dungeonboard_background.png" />
      <style>{`
        @keyframes cardSettle {
          0%   { transform: rotate(var(--card-rotate));                                    animation-timing-function: cubic-bezier(0.4, 0, 1, 1); }
          48%  { transform: rotate(calc(var(--card-rotate) + var(--card-swing)));          animation-timing-function: cubic-bezier(0, 0, 0.3, 1); }
          65%  { transform: rotate(calc(var(--card-rotate) - calc(var(--card-swing) * 0.45))); animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1); }
          78%  { transform: rotate(calc(var(--card-rotate) + calc(var(--card-swing) * 0.18))); animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1); }
          88%  { transform: rotate(calc(var(--card-rotate) - calc(var(--card-swing) * 0.06))); animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1); }
          100% { transform: rotate(var(--card-rotate)); }
        }
      `}</style>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-3 border-b-4 border-yellow-900 shrink-0"
        style={{ background: 'rgba(20,10,5,0.88)', boxShadow: '0 4px 0 #000' }}
      >
        <button
          onClick={() => onBack ? onBack() : router.replace('/hub')}
          className="font-bold text-sm transition-all"
          style={{ ...MONO, border: '3px solid #4a3000', background: 'rgba(40,20,0,0.80)', color: '#c8860a', padding: '4px 14px', boxShadow: '3px 3px 0 #000', textShadow: '1px 1px 0 #000' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8860a'; e.currentTarget.style.color = '#ffd700'; e.currentTarget.style.boxShadow = '3px 3px 0 #000, 0 0 8px #c8860a88' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#4a3000'; e.currentTarget.style.color = '#c8860a'; e.currentTarget.style.boxShadow = '3px 3px 0 #000' }}
        >
          ◀ Volver
        </button>
        <h1
          className="text-xl font-bold text-yellow-400 uppercase tracking-widest"
          style={{ ...MONO, textShadow: '2px 2px 0 #000' }}
        >
          🗺 Tablero de Dungeons
        </h1>
      </div>

      {/* Área del tablón */}
      <div
        className="flex-1 flex items-start justify-start overflow-hidden"
        style={{ paddingLeft: '9.9vw', paddingTop: '8.3vh' }}
      >
        <div
          className="relative shrink-0"
          style={{ width: '81.25vw', height: '76.8vh' }}
        >
          {dungeons.map((dungeon, i) => {
            const pos = positions[i] ?? { x: 0, y: 0, rotate: 0 }
            // Convertir posiciones absolutas (base 1920x1080) a porcentuales del board
            const leftPct = (pos.x / BOARD_W) * 100
            const topPct  = (pos.y / BOARD_H) * 100
            return (
              <div
                key={dungeon.id}
                className="absolute"
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${(CARD_W / BOARD_W) * 100}%`,
                  transform: `rotate(${pos.rotate}deg)`,
                  zIndex: 10,
                  transformOrigin: 'top center',
                  animationName: 'cardSettle',
                  animationDuration: `${880 + (dungeon.id % 4) * 40}ms`,
                  animationTimingFunction: 'linear',
                  animationFillMode: 'both',
                  animationDelay: '0ms',
                  '--card-rotate': `${pos.rotate}deg`,
                  // Swing = tirón de inercia al caer, alterno por carta para variedad
                  '--card-swing': `${(dungeon.id % 2 === 0 ? 1 : -1) * (12 + (dungeon.id % 3) * 5)}deg`,
                } as React.CSSProperties}
                onMouseEnter={e => { e.currentTarget.style.zIndex = '20' }}
                onMouseLeave={e => { e.currentTarget.style.zIndex = '10' }}
              >
                <DungeonCard
                  dungeon={dungeon}
                  entering={entering === dungeon.id}
                  onEnter={() => handleEnter(dungeon.id)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DungeonCard({ dungeon, onEnter, entering }: {
  dungeon: Dungeon
  onEnter: () => void
  entering: boolean
}) {
  const rank = rankColors[dungeon.rank] ?? { border: '#fff', text: '#fff', glow: 'rgba(255,255,255,0.2)' }

  return (
    <>
      <div
        className="flex flex-col gap-2 transition-all duration-150 cursor-pointer relative"
        style={{
          background: 'linear-gradient(160deg, #d4b483 0%, #c9a96e 40%, #b8955a 100%)',
          border: '4px solid #7a5a2a',
          boxShadow: '4px 4px 0 #000, inset 0 1px 0 rgba(255,240,180,0.4), inset 0 -1px 0 rgba(0,0,0,0.2)',
          padding: '14px 16px 12px',
          width: `${CARD_W}px`
        }}
        onMouseEnter={e => {
          const el = e.currentTarget
          el.style.background = 'linear-gradient(160deg, #e0c48e 0%, #d4ae7a 40%, #c4a060 100%)'
          el.style.boxShadow = `4px 4px 0 #000, inset 0 1px 0 rgba(255,240,180,0.5), 0 0 10px ${rank.glow}`
        }}
        onMouseLeave={e => {
          const el = e.currentTarget
          el.style.background = 'linear-gradient(160deg, #d4b483 0%, #c9a96e 40%, #b8955a 100%)'
          el.style.boxShadow = '4px 4px 0 #000, inset 0 1px 0 rgba(255,240,180,0.4), inset 0 -1px 0 rgba(0,0,0,0.2)'
        }}
      >
        {/* Líneas de papel decorativas */}
        <div className="absolute inset-x-4 inset-y-10 flex flex-col justify-around pointer-events-none opacity-15">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="w-full h-px" style={{ background: '#7a5a2a' }} />
          ))}
        </div>

        {/* Pin decorativo arriba */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-yellow-900 z-10"
          style={{ background: 'radial-gradient(circle at 35% 35%, #e8a020, #8a5000)', boxShadow: '1px 1px 0 #000' }}
        />

        {/* Header: rank + nombre */}
        <div className="flex items-center gap-2 mt-2 relative z-10">
          <span
            className="text-xs font-bold px-1.5 py-0.5 border-2 shrink-0"
            style={{
              ...MONO,
              color: rank.text,
              borderColor: rank.border,
              background: 'rgba(0,0,0,0.65)',
              boxShadow: `1px 1px 0 #000, 0 0 4px ${rank.glow}`,
              textShadow: '1px 1px 0 #000'
            }}
          >
            {dungeon.rank}
          </span>
          <h2
            className="font-bold text-xs uppercase tracking-wide leading-tight"
            style={{ ...MONO, color: '#2a1500', textShadow: '0 1px 0 rgba(255,220,150,0.5)' }}
          >
            {dungeon.name}
          </h2>
        </div>

        {/* Separador */}
        <div className="relative z-10 flex items-center gap-1 my-1">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, #7a5a2a, transparent)' }} />
          <span className="text-xs" style={{ color: '#7a5a2a' }}>✦</span>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, #7a5a2a, transparent)' }} />
        </div>

        {/* Descripción */}
        <p className="text-xs relative z-10 leading-relaxed" style={{ ...MONO, color: '#3a2000' }}>
          {dungeon.description}
        </p>

        {/* Info salas */}
        <div className="text-xs relative z-10 mt-1" style={{ ...MONO, color: '#5a3a10' }}>
          <span>🚪 {dungeon.rooms} salas</span>
        </div>

        {/* Botones */}
        <div className="flex gap-2 mt-2 relative z-10">
          <button
            onClick={onEnter}
            disabled={entering}
            className="flex-1 font-bold py-1.5 text-xs transition-all"
            style={{
              ...MONO,
              background: entering ? 'rgba(80,50,0,0.5)' : 'rgba(100,65,0,0.85)',
              border: `4px solid ${entering ? '#4a3000' : '#c8860a'}`,
              boxShadow: entering ? 'none' : '4px 4px 0 #000',
              color: entering ? '#888' : '#ffd700',
              textShadow: '1px 1px 0 #000',
              cursor: entering ? 'not-allowed' : 'pointer'
            }}
            onMouseEnter={e => {
              if (entering) return
              const el = e.currentTarget
              el.style.background = 'rgba(160,100,0,0.95)'
              el.style.borderColor = '#f0d030'
              el.style.boxShadow = '4px 4px 0 #000, 0 0 8px rgba(255,200,0,0.4)'
            }}
            onMouseLeave={e => {
              if (entering) return
              const el = e.currentTarget
              el.style.background = 'rgba(100,65,0,0.85)'
              el.style.borderColor = '#c8860a'
              el.style.boxShadow = '4px 4px 0 #000'
            }}
          >
            {entering ? 'Entrando...' : '▶ Aceptar'}
          </button>

        </div>
      </div>

    </>
  )
}