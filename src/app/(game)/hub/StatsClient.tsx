'use client'

import { useState, useRef } from 'react'
import { Player, PrimaryStats, deriveStats, statUpgradeCost, critChance, calcPlayerLevel } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { useToast, ToastContainer } from './Toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

const STAT_LABELS: Record<keyof PrimaryStats, { label: string; icon: string; description: string; color: string; barColor: string }> = {
  fortaleza:    { label: 'Fortaleza',    icon: '⚔️',  description: '+2 ataque por punto',              color: '#f97316', barColor: '#c2410c' },
  resistencia:  { label: 'Resistencia',  icon: '🛡️',  description: '+1 defensa, +5 stamina por punto', color: '#60a5fa', barColor: '#1d4ed8' },
  vigor:        { label: 'Vigor',        icon: '❤️',  description: '+10 HP por punto',                 color: '#f87171', barColor: '#b91c1c' },
  inteligencia: { label: 'Inteligencia', icon: '🔮',  description: '+5 mana, +2 daño mágico por punto', color: '#c084fc', barColor: '#7e22ce' },
  suerte:       { label: 'Suerte',       icon: '🍀',  description: '+0.5% crítico por punto',           color: '#4ade80', barColor: '#15803d' },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  player: Player
  onBack: () => void
  onPlayerUpdate: (player: Player) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function StatsClient({ player, onBack, onPlayerUpdate }: Props) {
  const supabase = createClient()
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [upgrading, setUpgrading] = useState<keyof PrimaryStats | null>(null)
  const { toasts, addToast } = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)

  const primary = currentPlayer.primary_stats
  const totalLevel = calcPlayerLevel(primary)
  const cost = statUpgradeCost(totalLevel)
  const derived = deriveStats(primary)
  const crit = critChance(primary.suerte)
  const critDisplay = (crit * 100).toFixed(1)
  const overcritDisplay = crit > 1 ? ((crit - 1) * 100).toFixed(1) : null

  async function handleUpgrade(stat: keyof PrimaryStats) {
    const savedScroll = scrollRef.current?.scrollTop ?? 0
    const currentValue = primary[stat]
    if (currentValue >= 99) return

    if (currentPlayer.experience < cost) {
      addToast(`Necesitás ${cost} EXP para subir ${STAT_LABELS[stat].label}`, 'error')
      return
    }

    setUpgrading(stat)

    const newPrimaryStats = { ...primary, [stat]: currentValue + 1 }
    const newExp = currentPlayer.experience - cost

    const { error } = await supabase
      .from('players')
      .update({ primary_stats: newPrimaryStats, experience: newExp })
      .eq('id', currentPlayer.id)

    if (error) {
      addToast('Error al guardar. Intentá de nuevo.', 'error')
      setUpgrading(null)
      return
    }

    const updatedPlayer = { ...currentPlayer, primary_stats: newPrimaryStats, experience: newExp }
    setCurrentPlayer(updatedPlayer)
    onPlayerUpdate(updatedPlayer)
    addToast(`✅ ${STAT_LABELS[stat].label} subió a ${currentValue + 1}!`)
    setUpgrading(null)
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = savedScroll
    })
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden text-white"
      style={{
        backgroundImage: 'url(/sprites/backgrounds/Stats_background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-3 border-b-4 border-yellow-900 shrink-0"
        style={{ background: 'rgba(10,5,2,0.92)', boxShadow: '0 4px 0 #000' }}
      >
        <button
          onClick={onBack}
          className="text-yellow-700 hover:text-yellow-400 transition text-sm"
          style={MONO}
        >
          ◀ Volver
        </button>
        <h1
          className="text-lg font-bold text-yellow-400 uppercase tracking-widest"
          style={{ ...MONO, textShadow: '2px 2px 0 #000' }}
        >
          📊 Estadísticas
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-purple-400 uppercase tracking-wider" style={MONO}>EXP disponible</span>
          <span
            className="text-purple-300 font-bold px-3 py-1"
            style={{
              ...MONO,
              border: '2px solid #6d28d9',
              background: 'rgba(109,40,217,0.20)',
              boxShadow: '2px 2px 0 #000',
              textShadow: '1px 1px 0 #000',
            }}
          >
            ✨ {currentPlayer.experience}
          </span>
        </div>
      </div>

      <ToastContainer toasts={toasts} />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Columna izquierda: stats derivados ── */}
        <div
          className="w-72 shrink-0 flex flex-col gap-3 p-4 overflow-y-auto border-r-4 border-yellow-900"
          style={{ background: 'rgba(10,5,2,0.82)', boxShadow: '4px 0 0 #000' }}
        >
          <p className="text-xs font-bold text-yellow-800 uppercase tracking-widest mb-1" style={MONO}>
            Stats derivados
          </p>

          {[
            { label: '❤️ HP máx',      value: derived.max_hp,      color: '#f87171' },
            { label: '⚡ Stamina máx', value: derived.max_stamina,  color: '#facc15' },
            { label: '🔮 Mana máx',    value: derived.max_mana,     color: '#c084fc' },
            { label: '⚔️ Ataque',      value: derived.attack,       color: '#fb923c' },
            { label: '🛡️ Defensa',     value: derived.defense,      color: '#60a5fa' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="flex justify-between items-center px-3 py-2 text-sm"
              style={{
                ...MONO,
                background: 'rgba(0,0,0,0.55)',
                border: '2px solid #2a1800',
                boxShadow: '2px 2px 0 #000',
              }}
            >
              <span className="text-gray-400">{label}</span>
              <span className="font-bold" style={{ color, textShadow: '1px 1px 0 #000' }}>{value}</span>
            </div>
          ))}

          {/* Crítico */}
          <div
            className="flex justify-between items-center px-3 py-2 text-sm"
            style={{
              ...MONO,
              background: 'rgba(0,0,0,0.55)',
              border: `2px solid ${crit > 1 ? '#854d0e' : '#2a1800'}`,
              boxShadow: '2px 2px 0 #000',
            }}
          >
            <span className="text-gray-400">🍀 Crítico</span>
            <span className="font-bold" style={{ color: crit > 1 ? '#fb923c' : '#4ade80', textShadow: '1px 1px 0 #000' }}>
              {crit >= 1 ? '100%' : `${critDisplay}%`}
              {overcritDisplay && (
                <span className="text-orange-400 text-xs ml-1">(+{overcritDisplay}% OC)</span>
              )}
            </span>
          </div>

          {/* Nivel total */}
          <div
            className="flex justify-between items-center px-3 py-2 text-sm mt-2"
            style={{
              ...MONO,
              background: 'rgba(120,80,0,0.25)',
              border: '2px solid #4a3000',
              boxShadow: '2px 2px 0 #000',
            }}
          >
            <span className="text-yellow-700">Nivel total</span>
            <span className="font-bold text-yellow-400" style={{ textShadow: '1px 1px 0 #000' }}>{totalLevel}</span>
          </div>

          {/* Costo próxima subida */}
          <div
            className="px-3 py-2 text-xs text-center"
            style={{
              ...MONO,
              background: 'rgba(109,40,217,0.15)',
              border: '2px solid #4c1d95',
              boxShadow: '2px 2px 0 #000',
              color: '#a78bfa',
            }}
          >
            Próxima subida: <span className="font-bold text-purple-300">{cost} EXP</span>
          </div>
        </div>

        {/* ── Columna derecha: stats primarios ── */}
        <div
          ref={scrollRef}
          className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(5,2,0,0.65)' }}
        >
          <p className="text-xs font-bold text-yellow-800 uppercase tracking-widest mb-1" style={MONO}>
            Stats primarios
          </p>

          {(Object.keys(STAT_LABELS) as (keyof PrimaryStats)[]).map((stat) => {
            const meta = STAT_LABELS[stat]
            const currentValue = primary[stat]
            const canAfford = currentPlayer.experience >= cost
            const isMaxed = currentValue >= 99
            const isUpgrading = upgrading === stat
            const pct = Math.round((currentValue / 99) * 100)

            return (
              <div
                key={stat}
                className="flex flex-col gap-3 p-4"
                style={{
                  background: 'rgba(10,5,2,0.80)',
                  border: '4px solid #2a1800',
                  boxShadow: '4px 4px 0 #000',
                }}
              >
                {/* Fila superior: nombre + valor */}
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-white text-sm" style={{ ...MONO, textShadow: '1px 1px 0 #000' }}>
                      {meta.icon} {meta.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ ...MONO, color: '#6b5a3a' }}>
                      {meta.description}
                    </p>
                  </div>
                  <span
                    className="text-2xl font-bold"
                    style={{ ...MONO, color: meta.color, textShadow: '2px 2px 0 #000' }}
                  >
                    {currentValue}
                  </span>
                </div>

                {/* Barra de progreso */}
                <div className="w-full h-3 border-2 border-black" style={{ background: '#111' }}>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: meta.barColor,
                      boxShadow: `0 0 0 1px ${meta.color} inset`,
                    }}
                  />
                </div>

                {/* Botón subir */}
                <button
                  onClick={() => handleUpgrade(stat)}
                  disabled={!canAfford || isMaxed || upgrading !== null}
                  className="w-full py-2 text-sm font-bold transition-all"
                  style={{
                    ...MONO,
                    border: '4px solid',
                    borderColor: isMaxed ? '#2a1800' : canAfford ? meta.barColor : '#2a1800',
                    background: isMaxed
                      ? 'rgba(20,10,5,0.40)'
                      : canAfford
                      ? `rgba(0,0,0,0.60)`
                      : 'rgba(20,10,5,0.40)',
                    color: isMaxed ? '#4a3020' : canAfford ? meta.color : '#4a3020',
                    boxShadow: isMaxed || !canAfford ? 'none' : '4px 4px 0 #000',
                    textShadow: canAfford && !isMaxed ? '1px 1px 0 #000' : 'none',
                    cursor: isMaxed || !canAfford || upgrading !== null ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isMaxed
                    ? '— Máximo —'
                    : isUpgrading
                    ? 'Subiendo...'
                    : canAfford
                    ? `▲ Subir por ${cost} EXP`
                    : `Necesitás ${cost} EXP`}
                </button>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}