'use client'

import { Player, Dungeon, Boss, RunState } from '@/types/game'

interface ResultsScreenProps {
  player: Player
  dungeon: Dungeon
  boss: Boss
  run: RunState
  bossDrops: { name: string; sprite: string }[]
  isSaving: boolean
  onContinue: () => void
  onReturnToHub: () => void
}

export function ResultsScreen({
  dungeon, boss, run, bossDrops, isSaving, onContinue, onReturnToHub,
}: ResultsScreenProps) {
  return (
    <div className="min-h-screen flex justify-center" style={{
      backgroundImage: `url(/sprites/backgrounds/${dungeon.background || 'Goblin_cave_bg.jpg'})`,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      <div className="w-full min-h-screen text-white p-4 flex flex-col gap-4 max-w-2xl" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>

        <div className="text-center py-4">
          <h1 className="text-3xl font-bold text-yellow-500 mb-1">🏆 ¡Victoria!</h1>
          <p className="text-gray-400">{dungeon.name} completada</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 flex flex-col gap-0">
          <h2 className="font-bold text-white text-lg mb-4">Recompensas</h2>
          <div className="flex justify-between items-center py-3 border-b border-gray-700">
            <span className="text-gray-400">EXP obtenida</span>
            <span className="text-purple-400 font-bold text-lg">+{run.accumulatedLoot.exp} EXP</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-gray-700">
            <span className="text-gray-400">Gold obtenido</span>
            <span className="text-yellow-400 font-bold text-lg">+{run.accumulatedLoot.gold} 💰</span>
          </div>
          {bossDrops.length > 0 && (
            <div className="flex flex-col py-3 border-b border-gray-700 gap-3">
              <span className="text-gray-400">Items obtenidos</span>
              <div className="flex flex-wrap gap-3">
                {bossDrops.map((drop, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2">
                    {drop.sprite ? (
                      <img
                        src={`/sprites/items/${drop.sprite}`}
                        alt={drop.name}
                        className="w-8 h-8 object-contain"
                        style={{ imageRendering: 'pixelated' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <span className="text-lg">🎁</span>
                    )}
                    <span className="text-green-400 font-bold text-sm">{drop.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-between items-center py-3">
            <span className="text-gray-400">Boss derrotado</span>
            <span className="text-red-400 font-bold">💀 {boss.name}</span>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center">Las recompensas ya fueron guardadas en tu cuenta</p>

        <div className="flex flex-col gap-3 mt-auto">
          <button
            onClick={onContinue}
            className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-4 rounded-lg text-lg transition"
          >
            ⚔️ Continuar — Profundidad {run.depth + 1}
          </button>
          <button
            onClick={onReturnToHub}
            disabled={isSaving}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold py-3 rounded-lg transition"
          >
            {isSaving ? '💾 Guardando...' : 'Volver al Hub'}
          </button>
        </div>

      </div>
    </div>
  )
}