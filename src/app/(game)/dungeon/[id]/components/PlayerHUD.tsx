'use client'

import { StatusEffect } from '@/lib/game/statusEffects'

interface PlayerHUDProps {
  name: string
  playerHP: number
  playerStamina: number
  playerMana: number
  maxHP: number
  maxStamina: number
  maxMana: number
  statusEffects?: StatusEffect[]
  isBeingHit?: boolean
}

const STAT_LABELS: Record<string, string> = {
  attack: 'ATK', defense: 'DEF', magic: 'MAG', damage: 'DMG',
}

export function PlayerHUD({
  name, playerHP, playerStamina, playerMana,
  maxHP, maxStamina, maxMana, statusEffects = [],
  isBeingHit = false,
}: PlayerHUDProps) {
  const hpPct = Math.max(0, Math.round((playerHP / maxHP) * 100))

  const playerEffects = statusEffects.filter(e => e.target === 'player')
  const poison  = playerEffects.find(e => e.type === 'poison')
  const debuffs = playerEffects.filter(e => e.type === 'debuff')
  const buffs   = playerEffects.filter(e => e.type === 'buff')

  return (
    <div className={`bg-gray-800 rounded-lg p-4 transition-all duration-150 ${isBeingHit ? 'ring-2 ring-red-500 bg-red-950/30' : ''}`}>
      <div className="flex justify-between mb-2">
        <span className="font-bold text-green-400">🧙 {name}</span>
        <span className="text-sm text-gray-400">{playerHP}/{maxHP} HP</span>
      </div>
      <div className="w-full bg-gray-600 rounded-full h-3 mb-2">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${
            hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${hpPct}%` }}
        />
      </div>
      <div className="flex gap-4 text-sm flex-wrap">
        <span className="text-yellow-400">⚡ {playerStamina}/{maxStamina}</span>
        <span className="text-blue-400">🔮 {playerMana}/{maxMana}</span>
        {poison && <span className="text-purple-400">☠️ Veneno</span>}
        {buffs.map((e, i) => (
          <span key={i} className="text-green-400">⬆️ {STAT_LABELS[e.stat ?? ''] ?? e.stat}</span>
        ))}
        {debuffs.map((e, i) => (
          <span key={i} className="text-red-400">⬇️ {STAT_LABELS[e.stat ?? ''] ?? e.stat}</span>
        ))}
      </div>
    </div>
  )
}