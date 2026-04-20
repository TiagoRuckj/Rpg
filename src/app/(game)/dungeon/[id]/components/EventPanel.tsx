'use client'

import { useState } from 'react'
import { RoomEvent, Enemy, Dungeon, Boss, EnemyCombatState, PlayerPoisonState } from '@/types/game'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EventEffect {
  healHP?: number
  damage?: number
  gold?: number
  poison?: PlayerPoisonState
  startCombat?: boolean
  combatEnemies?: EnemyCombatState[]
  isBoss?: boolean
}

interface EventPanelProps {
  event: RoomEvent
  playerHP: number
  maxHP: number
  playerGold: number
  enemies: Enemy[]
  dungeon: Dungeon
  depthMult: number
  granGoblinBoss: Boss | null
  onSetGranGoblinBoss: (boss: Boss | null) => void
  onResolve: (effect: EventEffect) => void
  isSheet?: boolean  // cuando es true, el panel no renderiza sus propios bordes/esquinas
}

const EVENT_INFO: Record<string, { icon: string; title: string; color: string }> = {
  treasure:      { icon: '📦', title: 'Cofre del Tesoro',    color: 'border-yellow-700 bg-yellow-950/40' },
  ambush:        { icon: '⚔️', title: 'Emboscada',           color: 'border-red-700 bg-red-950/40'       },
  merchant:      { icon: '🧙', title: 'Mercader Errante',    color: 'border-blue-700 bg-blue-950/40'     },
  healing_altar: { icon: '✨', title: 'Altar de Curación',   color: 'border-green-700 bg-green-950/40'   },
  poison_trap:   { icon: '☠️', title: 'Trampa Venenosa',     color: 'border-purple-700 bg-purple-950/40' },
  cracked_wall:  { icon: '🧱', title: 'Muro Agrietado',      color: 'border-gray-600 bg-gray-800/60'     },
}

export function EventPanel({ event, playerHP, maxHP, enemies, dungeon, depthMult, granGoblinBoss, onSetGranGoblinBoss, onResolve, isSheet }: EventPanelProps) {
  const info = EVENT_INFO[event.type]
  const [fetchedBoss, setFetchedBoss] = useState(false)
  const [resolvedMsg, setResolvedMsg] = useState<string | null>(null)

  const healAmount = Math.round(maxHP * 0.3)

  // Cuando está dentro del sheet, no usamos borde/rounded propio
  const wrapperClass = isSheet
    ? `p-4 flex flex-col gap-3 ${info.color}`
    : `rounded-xl border p-4 flex flex-col gap-3 ${info.color}`

  async function loadGranGoblin() {
    if (granGoblinBoss || fetchedBoss) return
    setFetchedBoss(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('bosses')
      .select('*')
      .eq('name', 'Gran Goblin')
      .single()
    if (data) onSetGranGoblinBoss(data as Boss)
  }

  if (event.type === 'cracked_wall' && !fetchedBoss) {
    loadGranGoblin()
  }

  function handleAmbush() {
    const count = Math.random() < 0.4 ? 2 : 1
    const pool = enemies.filter(e => e.stats.attack > 0)
    const combatEnemies: EnemyCombatState[] = Array.from({ length: count }, (_, i) => {
      const enemy = pool[Math.floor(Math.random() * pool.length)]
      const maxHP = Math.round(enemy.stats.hp * depthMult * 1.2)
      return { instanceId: Date.now() + i, enemy, currentHP: maxHP, maxHP, alive: true }
    })
    onResolve({ startCombat: true, combatEnemies, isBoss: false })
  }

  function handleCrackedWall() {
    if (!granGoblinBoss) return
    const maxHP = granGoblinBoss.stats.hp
    const combatEnemies: EnemyCombatState[] = [{
      instanceId: Date.now(),
      enemy: {
        id: granGoblinBoss.id,
        dungeon_id: granGoblinBoss.dungeon_id,
        name: granGoblinBoss.name,
        stats: { hp: maxHP, attack: granGoblinBoss.stats.attack, defense: granGoblinBoss.stats.defense },
        loot_table: [],
        enemy_type: granGoblinBoss.enemy_type,
      },
      currentHP: maxHP,
      maxHP,
      alive: true,
    }]
    onResolve({ startCombat: true, combatEnemies, isBoss: true })
  }

  if (resolvedMsg) {
    return (
      <div className={`${isSheet ? 'p-4' : 'rounded-xl border p-4'} flex items-center gap-3 ${info.color}`}>
        <span className="text-2xl">{info.icon}</span>
        <p className="text-white font-bold text-sm">{resolvedMsg}</p>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{info.icon}</span>
        <h3 className="font-bold text-white">{info.title}</h3>
      </div>

      {event.type === 'treasure' && (
        <>
          <p className="text-gray-300 text-sm">Encontrás un cofre abandonado. Contiene algo de gold.</p>
          <button
            onClick={() => {
              const gold = 20 + Math.floor(Math.random() * 41)
              setResolvedMsg(`💰 Abriste el cofre y encontraste ${gold} gold!`)
              onResolve({ gold })
            }}
            className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            🔓 Abrir cofre
          </button>
        </>
      )}

      {event.type === 'ambush' && (
        <>
          <p className="text-gray-300 text-sm">¡Un grupo de goblins te tiende una emboscada! No podés evitar el combate.</p>
          <button onClick={handleAmbush} className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg transition text-sm">
            ⚔️ Combatir
          </button>
        </>
      )}

      {event.type === 'healing_altar' && (
        <>
          <p className="text-gray-300 text-sm">Un altar antiguo emite un suave resplandor. Podés absorber su energía.</p>
          <p className="text-green-400 text-sm font-bold">❤️ +{Math.min(healAmount, maxHP - playerHP)} HP</p>
          <button
            onClick={() => {
              const actual = Math.min(healAmount, maxHP - playerHP)
              setResolvedMsg(`✨ Absorbiste la energía del altar. +${actual} HP recuperado.`)
              onResolve({ healHP: healAmount })
            }}
            disabled={playerHP >= maxHP}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            {playerHP >= maxHP ? 'HP al máximo' : '✨ Absorber energía'}
          </button>
        </>
      )}

      {event.type === 'poison_trap' && (
        <>
          <p className="text-gray-300 text-sm">Pisás una trampa oculta. El veneno te quemará las venas durante los próximos 5 turnos de combate.</p>
          <p className="text-purple-400 text-sm font-bold">☠️ -10 HP por turno durante 5 turnos</p>
          <button
            onClick={() => {
              setResolvedMsg('☠️ Envenenado! Sufrirás -10 HP por turno durante 5 turnos.')
              onResolve({ poison: { turnsLeft: 5, damagePerTurn: 10 } })
            }}
            className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            😬 Continuar
          </button>
        </>
      )}

      {event.type === 'merchant' && (
        <>
          <p className="text-gray-300 text-sm">Un mercader misterioso aparece entre las sombras. No tenés gold del run disponible.</p>
          <button
            onClick={() => { setResolvedMsg('🚶 Ignoraste al mercader.'); onResolve({}) }}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            🚶 Ignorar
          </button>
        </>
      )}

      {event.type === 'cracked_wall' && (
        <>
          <p className="text-gray-300 text-sm">Ves una grieta en la pared que lleva a una cámara oculta. Se escuchan ruidos al otro lado...</p>
          <p className="text-orange-400 text-xs">⚠️ Peligro desconocido — recompensa asegurada si sobrevivís</p>
          <div className="flex gap-2">
            <button
              onClick={handleCrackedWall}
              disabled={!granGoblinBoss}
              className="flex-1 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              {granGoblinBoss ? '🧱 Atravesar' : 'Cargando...'}
            </button>
            <button
              onClick={() => { setResolvedMsg('🚶 Ignoraste el muro agrietado.'); onResolve({}) }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              🚶 Ignorar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
// ─── EventSheet — aparece desde abajo y se centra en pantalla ────────────────

interface EventSheetProps extends EventPanelProps {
  visible: boolean
}

export function EventSheet({ visible, ...panelProps }: EventSheetProps) {
  const info = EVENT_INFO[panelProps.event.type]
  const bgColor = info.color.split(' ').find(c => c.startsWith('bg-')) ?? 'bg-gray-900'

  return (
    <>
      {/* Overlay oscuro */}
      <div className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`} />

      {/* Sheet centrado, entra desde abajo */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16 pointer-events-none'
      }`}>
        <div className={`w-full max-w-lg rounded-2xl shadow-2xl border ${info.color.split(' ').find(c => c.startsWith('border-')) ?? 'border-gray-600'} overflow-hidden`}>
          {/* Handle visual */}
          <div className={`flex justify-center pt-3 pb-2 ${bgColor}`}>
            <div className="w-10 h-1 rounded-full bg-white/30" />
          </div>
          {/* Contenido sin bordes propios */}
          <EventPanel {...panelProps} isSheet />
        </div>
      </div>
    </>
  )
}