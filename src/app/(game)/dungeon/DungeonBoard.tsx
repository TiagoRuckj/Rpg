'use client'

import { useState } from 'react'
import { Dungeon, Enemy, Boss } from '@/types/game'
import { useRouter } from 'next/navigation'
import { startRunAction } from '@/actions/activeRunAction'

interface Props {
  dungeons: Dungeon[]
  enemiesByDungeon: Record<number, Enemy[]>
  bossByDungeon: Record<number, Boss>
}

const rankColors: Record<string, string> = {
  F: 'text-gray-400 border-gray-400',
  E: 'text-green-400 border-green-400',
  D: 'text-blue-400 border-blue-400',
  C: 'text-purple-400 border-purple-400',
  B: 'text-yellow-400 border-yellow-400',
  A: 'text-orange-400 border-orange-400',
  S: 'text-red-400 border-red-400',
}

export default function DungeonBoard({ dungeons, enemiesByDungeon, bossByDungeon }: Props) {
  const router = useRouter()
  const [entering, setEntering] = useState<number | null>(null)

  async function handleEnter(dungeonId: number) {
    setEntering(dungeonId)
    await startRunAction(dungeonId)
    router.replace(`/dungeon/${dungeonId}`)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.replace('/hub')}
          className="text-gray-400 hover:text-white transition"
        >
          ← Volver
        </button>
        <h1 className="text-3xl font-bold text-yellow-500">🗺️ Tablero de Dungeons</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dungeons.map((dungeon) => (
          <DungeonCard
            key={dungeon.id}
            dungeon={dungeon}
            enemies={enemiesByDungeon[dungeon.id] ?? []}
            boss={bossByDungeon[dungeon.id] ?? null}
            entering={entering === dungeon.id}
            onEnter={() => handleEnter(dungeon.id)}
          />
        ))}
      </div>
    </div>
  )
}

function DungeonCard({ dungeon, enemies, boss, onEnter, entering }: {
  dungeon: Dungeon
  enemies: Enemy[]
  boss: Boss | null
  onEnter: () => void
  entering: boolean
}) {
  const [showInfo, setShowInfo] = useState(false)
  const rankStyle = rankColors[dungeon.rank] ?? 'text-white border-white'

  return (
    <>
      <div className="bg-gray-800 rounded-lg p-6 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold">{dungeon.name}</h2>
          <span className={`border-2 rounded px-2 py-1 text-sm font-bold ${rankStyle}`}>
            {dungeon.rank}
          </span>
        </div>

        <p className="text-gray-400 text-sm flex-1">{dungeon.description}</p>

        <div className="flex justify-between text-sm text-gray-400">
          <span>🚪 {dungeon.rooms} salas</span>
          <span>💰 Fee: {dungeon.extraction_fee} gold</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onEnter}
            disabled={entering}
            className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-700 disabled:cursor-not-allowed text-black font-bold py-2 rounded-lg transition"
          >
            {entering ? 'Entrando...' : 'Entrar'}
          </button>
          <button
            onClick={() => setShowInfo(true)}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-3 py-2 rounded-lg transition"
            title="Ver enemigos y loot"
          >
            📋
          </button>
        </div>
      </div>

      {/* Modal de info */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowInfo(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl flex flex-col overflow-hidden max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
              <div>
                <h2 className="font-bold text-white text-lg">{dungeon.name}</h2>
                <p className="text-gray-500 text-xs">{dungeon.rooms} salas · Rank {dungeon.rank}</p>
              </div>
              <button onClick={() => setShowInfo(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="overflow-y-auto flex flex-col gap-0">
              {/* Enemigos normales */}
              {enemies.length > 0 && (
                <div className="p-4 flex flex-col gap-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Enemigos</h3>
                  {enemies.map(enemy => (
                    <div key={enemy.id} className="bg-gray-800 rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white">{enemy.name}</span>
                        <div className="flex gap-3 text-xs text-gray-400">
                          <span>❤️ {enemy.stats.hp}</span>
                          <span>⚔️ {enemy.stats.attack}</span>
                          <span>🛡️ {enemy.stats.defense}</span>
                        </div>
                      </div>
                      {enemy.loot_table?.filter(l => l.item_id).map((loot, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-700/50 rounded-lg px-3 py-1.5">
                          {(loot as any).item_sprite
                            ? <img src={`/sprites/items/${(loot as any).item_sprite}`} alt={(loot as any).item_name} className="w-6 h-6 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            : <span className="text-sm">🎁</span>
                          }
                          <span className="text-gray-300 text-xs flex-1">{(loot as any).item_name ?? `Item #${loot.item_id}`}</span>
                          <span className="text-yellow-400 text-xs font-bold">{Math.round(loot.item_chance * 100)}%</span>
                        </div>
                      ))}
                      {!enemy.loot_table?.some(l => l.item_id) && (
                        <p className="text-gray-600 text-xs">Sin drops de items</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Boss */}
              {boss && (
                <div className="p-4 border-t border-gray-800 flex flex-col gap-3">
                  <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider">Boss</h3>
                  <div className="bg-red-950/40 border border-red-900 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-red-300">{boss.name}</span>
                      <div className="flex gap-3 text-xs text-gray-400">
                        <span>❤️ {boss.stats.hp}</span>
                        <span>⚔️ {boss.stats.attack}</span>
                        <span>🛡️ {boss.stats.defense}</span>
                      </div>
                    </div>
                    {boss.loot_table?.filter(l => l.item_id).map((loot, i) => (
                      <div key={i} className="flex items-center gap-2 bg-red-900/20 rounded-lg px-3 py-1.5">
                        {(loot as any).item_sprite
                          ? <img src={`/sprites/items/${(loot as any).item_sprite}`} alt={(loot as any).item_name} className="w-6 h-6 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <span className="text-sm">🎁</span>
                        }
                        <span className="text-gray-300 text-xs flex-1">{(loot as any).item_name ?? `Item #${loot.item_id}`}</span>
                        <span className="text-yellow-400 text-xs font-bold">{Math.round(loot.chance * 100)}%</span>
                      </div>
                    ))}
                    {!boss.loot_table?.some(l => l.item_id) && (
                      <p className="text-gray-600 text-xs">Sin drops de items</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}