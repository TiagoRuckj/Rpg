'use client'
import BgImage from './BgImage'

import { useState } from 'react'
import { Player, PrimaryStats, deriveStats, statUpgradeCost, critChance, calcPlayerLevel } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { useToast, ToastContainer } from './Toast'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

const STATS: { key: keyof PrimaryStats; label: string; icon: string; desc: string; color: string; bar: string }[] = [
  { key: 'fortaleza',    label: 'Fortaleza',    icon: '⚔️',  desc: '+2 ATK / punto',              color: '#f97316', bar: '#c2410c' },
  { key: 'suerte',       label: 'Suerte',       icon: '🍀',  desc: '+0.5% CRIT / punto',          color: '#4ade80', bar: '#15803d' },
  { key: 'resistencia',  label: 'Resistencia',  icon: '🛡️',  desc: '+1 DEF +5 STA / punto',      color: '#60a5fa', bar: '#1d4ed8' },
  { key: 'vigor',        label: 'Vigor',        icon: '❤️',  desc: '+10 HP / punto',              color: '#f87171', bar: '#b91c1c' },
  { key: 'inteligencia', label: 'Inteligencia', icon: '🔮',  desc: '+2 MAG +5 MANA / punto',     color: '#c084fc', bar: '#7e22ce' },
]

// Posiciones de los 5 vértices del pentagrama
// Empezamos desde arriba (270°) y giramos en sentido horario
// Radio en %, centro en 50% 50%
const CARD_W = 148
const CARD_H = 140
const R = 36 // radio aumentado para que las cards toquen las puntas

function pentagonPos(i: number, total: number) {
  const angle = (i * 2 * Math.PI) / total - Math.PI / 2
  return {
    x: 50 + R * Math.cos(angle),
    y: 52 + R * 1.1 * Math.sin(angle), // bajado de 46 a 52
  }
}

interface Props {
  player: Player
  onBack: () => void
  onPlayerUpdate: (player: Player) => void
}

export default function StatsClient({ player, onBack, onPlayerUpdate }: Props) {
  const supabase = createClient()
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [upgrading, setUpgrading] = useState<keyof PrimaryStats | null>(null)
  const [hoveredStat, setHoveredStat] = useState<keyof PrimaryStats | null>(null)
  const [errorStat, setErrorStat] = useState<keyof PrimaryStats | null>(null)
  const [glowStat, setGlowStat] = useState<keyof PrimaryStats | null>(null)
  const { toasts, addToast } = useToast()

  const primary = currentPlayer.primary_stats
  const totalLevel = calcPlayerLevel(primary)
  const cost = statUpgradeCost(totalLevel)
  const derived = deriveStats(primary)
  const crit = critChance(primary.suerte)
  const overcritDisplay = crit > 1 ? ((crit - 1) * 100).toFixed(1) : null

  async function handleUpgrade(stat: keyof PrimaryStats) {
    const currentValue = primary[stat]
    if (currentValue >= 99) return
    if (currentPlayer.experience < cost) {
      addToast(`Necesitás ${cost} EXP para subir`, 'error')
      setErrorStat(stat)
      setTimeout(() => setErrorStat(null), 600)
      return
    }
    setUpgrading(stat)
    const newPrimaryStats = { ...primary, [stat]: currentValue + 1 }
    const newExp = currentPlayer.experience - cost
    const { error } = await supabase
      .from('players')
      .update({ primary_stats: newPrimaryStats, experience: newExp })
      .eq('id', currentPlayer.id)
    if (error) { addToast('Error al guardar.', 'error'); setUpgrading(null); return }
    const updated = { ...currentPlayer, primary_stats: newPrimaryStats, experience: newExp }
    setCurrentPlayer(updated)
    onPlayerUpdate(updated)
    addToast(`✅ ${STATS.find(s => s.key === stat)!.label} subió a ${currentValue + 1}!`)
    setGlowStat(stat)
    setTimeout(() => setGlowStat(null), 900)
    setUpgrading(null)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white" style={{}}>
      <BgImage src="/sprites/backgrounds/Stats_background.png" />

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-4 border-blue-900 shrink-0"
        style={{ background: 'rgba(5,5,20,0.92)', boxShadow: '0 4px 0 #000', zIndex: 1 }}>
        <button
          onClick={onBack}
          className="font-bold text-sm transition-all"
          style={{
            ...MONO,
            border: '3px solid #1e3a8a',
            background: 'rgba(10,15,50,0.80)',
            color: '#93c5fd',
            padding: '4px 14px',
            boxShadow: '3px 3px 0 #000',
            textShadow: '1px 1px 0 #000',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#60a5fa'
            e.currentTarget.style.color = '#bfdbfe'
            e.currentTarget.style.boxShadow = '3px 3px 0 #000, 0 0 8px #3b82f688'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#1e3a8a'
            e.currentTarget.style.color = '#93c5fd'
            e.currentTarget.style.boxShadow = '3px 3px 0 #000'
          }}
        >◀ Volver</button>
        <h1 className="text-lg font-bold text-blue-300 uppercase tracking-widest" style={{ ...MONO, textShadow: '2px 2px 0 #000' }}>📊 Estadísticas</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-purple-400 uppercase tracking-wider" style={MONO}>EXP</span>
          <span className="text-purple-300 font-bold px-3 py-1" style={{ ...MONO, border: '2px solid #6d28d9', background: 'rgba(109,40,217,0.20)', boxShadow: '2px 2px 0 #000' }}>
            ✨ {currentPlayer.experience}
          </span>
          <span className="text-xs text-yellow-700 uppercase tracking-wider" style={MONO}>Costo</span>
          <span className="text-blue-300 font-bold px-3 py-1" style={{ ...MONO, border: '2px solid #1e3a8a', background: 'rgba(30,58,138,0.20)', boxShadow: '2px 2px 0 #000' }}>
            {cost} EXP
          </span>
        </div>
      </div>

      <ToastContainer toasts={toasts} />

      {/* Layout principal */}
      <div className="flex flex-1 overflow-hidden" style={{}}>

        {/* ── Columna izquierda: stats derivados ── */}
        <div className="w-80 shrink-0 flex flex-col gap-2 p-3 overflow-y-auto border-r-4 border-blue-900"
          style={{ background: 'rgba(5,8,25,0.88)', boxShadow: '4px 0 0 #000', zIndex: 1 }}>
          <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-1" style={MONO}>Stats derivados</p>
          {[
            { label: '❤️ HP',      value: derived.max_hp,      color: '#f87171' },
            { label: '⚡ Stamina', value: derived.max_stamina,  color: '#facc15' },
            { label: '🔮 Mana',    value: derived.max_mana,     color: '#c084fc' },
            { label: '⚔️ Ataque',  value: derived.attack,       color: '#fb923c' },
            { label: '🛡️ Defensa', value: derived.defense,      color: '#60a5fa' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between items-center px-3 py-2 text-sm"
              style={{ ...MONO, background: 'rgba(10,10,40,0.60)', border: '2px solid #1e3a8a', boxShadow: '2px 2px 0 #000' }}>
              <span className="text-blue-300/70">{label}</span>
              <span className="font-bold" style={{ color, textShadow: '1px 1px 0 #000' }}>{value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center px-3 py-2 text-sm"
            style={{ ...MONO, background: 'rgba(10,10,40,0.60)', border: `2px solid ${crit > 1 ? '#854d0e' : '#1e3a8a'}`, boxShadow: '2px 2px 0 #000' }}>
            <span className="text-blue-300/70">🍀 CRIT</span>
            <span className="font-bold" style={{ color: crit > 1 ? '#fb923c' : '#4ade80', textShadow: '1px 1px 0 #000' }}>
              {crit >= 1 ? '100%' : `${(crit * 100).toFixed(1)}%`}
              {overcritDisplay && <span className="text-orange-400 ml-1">(+{overcritDisplay}%)</span>}
            </span>
          </div>
          <div className="flex justify-between items-center px-3 py-2 text-sm mt-2"
            style={{ ...MONO, background: 'rgba(30,30,80,0.35)', border: '2px solid #3730a3', boxShadow: '2px 2px 0 #000' }}>
            <span className="text-indigo-400">Nivel</span>
            <span className="font-bold text-indigo-300" style={{ textShadow: '1px 1px 0 #000' }}>{totalLevel}</span>
          </div>
        </div>

        {/* ── Pentagrama de stats primarios ── */}
        <div className="flex-1 relative" style={{ background: 'rgba(2,2,15,0.45)' }}>

          {/* Líneas del pentagrama decorativas — coordenadas en viewBox 0-100 */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15, pointerEvents: 'none' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {STATS.map((_, i) => {
              const a = pentagonPos(i, 5)
              const b = pentagonPos((i + 2) % 5, 5)
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c8860a" strokeWidth="0.5" />
            })}
          </svg>

          {/* Cards en los vértices — posición en % del contenedor */}
          {STATS.map((s, i) => {
            const pos = pentagonPos(i, 5)
            const currentValue = primary[s.key]
            const canAfford = currentPlayer.experience >= cost
            const isMaxed = currentValue >= 99
            const isUpgrading = upgrading === s.key
            const pct = Math.round((currentValue / 99) * 100)

            return (
              <div
                key={s.key}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: `${CARD_W}px`,
                  zIndex: 1,
                }}
                onMouseEnter={() => setHoveredStat(s.key)}
                onMouseLeave={() => setHoveredStat(null)}
              >
                <div
                  className="flex flex-col gap-2 p-3"
                  style={{
                    background: 'rgba(5,5,25,0.88)',
                    border: `3px solid ${glowStat === s.key ? s.color : s.color + '44'}`,
                    boxShadow: glowStat === s.key
                      ? `3px 3px 0 #000, 0 0 28px ${s.color}cc, 0 0 8px ${s.color}`
                      : hoveredStat === s.key
                      ? `3px 3px 0 #000, 0 0 12px ${s.color}55`
                      : `3px 3px 0 #000, 0 0 12px ${s.color}22`,
                    transition: 'box-shadow 0.2s, border-color 0.2s',
                  }}
                >
                  {/* Nombre + valor */}
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold" style={{ ...MONO, color: s.color, textShadow: '1px 1px 0 #000' }}>
                      {s.icon} {s.label}
                    </span>
                    <span className="text-xl font-bold" style={{ ...MONO, color: s.color, textShadow: '2px 2px 0 #000' }}>
                      {currentValue}
                    </span>
                  </div>

                  {/* Descripción */}
                  <p className="text-xs" style={{ ...MONO, color: '#6b7db3' }}>{s.desc}</p>

                  {/* Barra de progreso */}
                  <div className="w-full h-2 border border-black" style={{ background: '#0a0a2a' }}>
                    <div className="h-full transition-all" style={{ width: `${pct}%`, background: s.bar, boxShadow: `0 0 0 1px ${s.color} inset` }} />
                  </div>

                  {/* Botón */}
                  <button
                    onClick={() => handleUpgrade(s.key)}
                    disabled={isMaxed || upgrading !== null}
                    className="w-full py-1.5 text-xs font-bold transition-all"
                    style={(() => {
                      const isError = errorStat === s.key
                      const isHovered = hoveredStat === s.key && !isMaxed && canAfford
                      const base = {
                        ...MONO,
                        border: '3px solid',
                        transition: 'all 0.12s',
                        textShadow: '1px 1px 0 #000',
                        cursor: isMaxed || upgrading !== null ? 'not-allowed' : 'pointer',
                      }
                      if (isMaxed) return { ...base, borderColor: '#1e2a4a', background: 'rgba(5,10,30,0.40)', color: '#2a3560', textShadow: 'none', boxShadow: 'none' }
                      if (isError) return { ...base, borderColor: '#ef4444', background: 'rgba(180,0,0,0.50)', color: '#fca5a5', boxShadow: '0 0 12px #ef444488, 3px 3px 0 #000' }
                      if (isHovered) return { ...base, borderColor: s.color, background: `rgba(0,0,0,0.80)`, color: s.color, boxShadow: `0 0 14px ${s.color}88, 3px 3px 0 #000` }
                      if (!canAfford) return { ...base, borderColor: '#1e2a4a', background: 'rgba(5,10,30,0.40)', color: '#2a3560', textShadow: 'none', boxShadow: 'none' }
                      return { ...base, borderColor: s.bar, background: 'rgba(0,0,0,0.60)', color: s.color, boxShadow: '3px 3px 0 #000' }
                    })()}
                  >
                    {isMaxed ? '— Máx —' : isUpgrading ? '...' : canAfford ? `▲ +1 (${cost} EXP)` : `${cost} EXP`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}