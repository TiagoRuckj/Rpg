'use client'

import { useState } from 'react'
import { Dungeon } from '@/types/game'
import { useRouter } from 'next/navigation'
import { startRunAction } from '@/actions/activeRunAction'

interface Props {
  dungeons: Dungeon[]
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

export default function DungeonBoard({ dungeons }: Props) {
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
            entering={entering === dungeon.id}
            onEnter={() => handleEnter(dungeon.id)}
          />
        ))}
      </div>
    </div>
  )
}

function DungeonCard({ dungeon, onEnter, entering }: { dungeon: Dungeon, onEnter: () => void, entering: boolean }) {
  const rankStyle = rankColors[dungeon.rank] ?? 'text-white border-white'

  return (
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

      <button
        onClick={onEnter}
        disabled={entering}
        className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-700 disabled:cursor-not-allowed text-black font-bold py-2 rounded-lg transition"
      >
        {entering ? 'Entrando...' : 'Entrar'}
      </button>
    </div>
  )
}