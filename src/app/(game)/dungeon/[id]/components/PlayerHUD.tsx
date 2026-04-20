'use client'

import { PlayerPoisonState } from '@/types/game'

interface PlayerHUDProps {
  name: string
  playerHP: number
  playerStamina: number
  playerMana: number
  maxHP: number
  maxStamina: number
  maxMana: number
  poisonState?: PlayerPoisonState | null
}

export function PlayerHUD({
  name, playerHP, playerStamina, playerMana,
  maxHP, maxStamina, maxMana, poisonState,
}: PlayerHUDProps) {
  const hpPct = Math.max(0, Math.round((playerHP / maxHP) * 100))

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between mb-2">
        <span className="font-bold text-green-400">🧙 {name}</span>
        <span className="text-sm text-gray-400">{playerHP}/{maxHP} HP</span>
      </div>
      <div className="w-full bg-gray-600 rounded-full h-3 mb-2">
        <div
          className="bg-green-500 h-3 rounded-full transition-all duration-500"
          style={{ width: `${hpPct}%` }}
        />
      </div>
      <div className="flex gap-4 text-sm">
        <span className="text-yellow-400">⚡ {playerStamina}/{maxStamina}</span>
        <span className="text-blue-400">🔮 {playerMana}/{maxMana}</span>
        {poisonState && poisonState.turnsLeft > 0 && (
          <span className="text-purple-400">☠️ Veneno ({poisonState.turnsLeft}t)</span>
        )}
      </div>
    </div>
  )
}