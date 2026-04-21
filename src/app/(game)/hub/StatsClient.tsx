'use client'

import { useState, useRef } from 'react'
import { Player, PrimaryStats, deriveStats, statUpgradeCost, critChance } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { useToast, ToastContainer } from './Toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STAT_LABELS: Record<keyof PrimaryStats, { label: string; icon: string; description: string }> = {
  fortaleza:    { label: 'Fortaleza',    icon: '⚔️',  description: '+2 ataque por punto' },
  resistencia:  { label: 'Resistencia',  icon: '🛡️',  description: '+1 defensa, +5 stamina por punto' },
  vigor:        { label: 'Vigor',        icon: '❤️',  description: '+10 HP por punto' },
  inteligencia: { label: 'Inteligencia', icon: '🔮',  description: '+5 mana, +2 daño mágico por punto' },
  suerte:       { label: 'Suerte',       icon: '🍀',  description: '+0.5% crítico por punto' },
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
  const derived = deriveStats(primary)
  const crit = critChance(primary.suerte)
  const critDisplay = (crit * 100).toFixed(1)
  const overcritDisplay = crit > 1 ? ((crit - 1) * 100).toFixed(1) : null

  async function handleUpgrade(stat: keyof PrimaryStats) {
    const savedScroll = scrollRef.current?.scrollTop ?? 0
    const currentValue = primary[stat]
    if (currentValue >= 99) return

    const cost = statUpgradeCost(currentValue)
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
    <div className="min-h-screen bg-gray-950 flex justify-center">
      <div className="w-full h-screen bg-gray-950 text-white max-w-5xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-gray-800">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition">← Volver</button>
          <h1 className="text-xl font-bold text-yellow-500">📊 Estadísticas</h1>
          <span className="ml-auto text-purple-400 font-bold">✨ {currentPlayer.experience} EXP</span>
        </div>

        <ToastContainer toasts={toasts} />

        <div className="flex flex-1 overflow-hidden">

          {/* Columna izquierda: stats derivados */}
          <div className="w-1/4 border-r border-gray-800 p-4 flex flex-col gap-3 overflow-y-auto">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Stats derivados</h2>

            {[
              { label: '❤️ HP máx',      value: derived.max_hp },
              { label: '⚡ Stamina máx', value: derived.max_stamina },
              { label: '🔮 Mana máx',    value: derived.max_mana },
              { label: '⚔️ Ataque',      value: derived.attack },
              { label: '🛡️ Defensa',     value: derived.defense },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3 flex justify-between items-center text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-bold">{value}</span>
              </div>
            ))}

            <div className="bg-gray-800 rounded-lg p-3 flex justify-between items-center text-sm">
              <span className="text-gray-400">🍀 Crítico</span>
              <span className={`font-bold ${crit > 1 ? 'text-orange-400' : 'text-white'}`}>
                {crit >= 1 ? '100%' : `${critDisplay}%`}
                {overcritDisplay && (
                  <span className="text-orange-400 text-xs ml-1">(+{overcritDisplay}% OC)</span>
                )}
              </span>
            </div>
          </div>

          {/* Columna derecha: stats primarios */}
          <div ref={scrollRef} className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Stats primarios</h2>

            <div className="grid grid-cols-1 gap-3">
              {(Object.keys(STAT_LABELS) as (keyof PrimaryStats)[]).map((stat) => {
                const currentValue = primary[stat]
                const cost = statUpgradeCost(currentValue)
                const canAfford = currentPlayer.experience >= cost
                const isMaxed = currentValue >= 99
                const isUpgrading = upgrading === stat

                return (
                  <div key={stat} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-bold text-white">
                          {STAT_LABELS[stat].icon} {STAT_LABELS[stat].label}
                        </span>
                        <p className="text-gray-500 text-xs mt-0.5">{STAT_LABELS[stat].description}</p>
                      </div>
                      <span className="text-2xl font-bold text-yellow-400">{currentValue}</span>
                    </div>

                    <div className="w-full bg-gray-700 rounded-full h-1.5 mb-3">
                      <div
                        className="bg-yellow-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(currentValue / 99) * 100}%` }}
                      />
                    </div>

                    <button
                      onClick={() => handleUpgrade(stat)}
                      disabled={!canAfford || isMaxed || upgrading !== null}
                      className={`w-full py-2 rounded-lg text-sm font-bold transition ${
                        isMaxed
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : canAfford
                          ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isMaxed
                        ? 'Máximo'
                        : isUpgrading
                        ? 'Subiendo...'
                        : canAfford
                        ? `Subir por ${cost} EXP`
                        : `Necesitás ${cost} EXP`}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}