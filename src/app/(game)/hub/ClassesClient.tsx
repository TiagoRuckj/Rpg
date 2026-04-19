'use client'

import { useState, useTransition } from 'react'
import { toggleClassAction } from '@/actions/classActions'

type ClassBonus = {
  attack?: number
  defense?: number
  crit_bonus?: number
  damage_vs?: { type: string; bonus: number }
}

type ClassData = {
  id: string
  name: string
  description: string
  bonuses: ClassBonus
  unlock_condition: string
}

interface Props {
  unlockedClasses: ClassData[]
  equippedClasses: string[]
  playerId: string // This is now technically unused, but left here to avoid breaking the parent component
  onBack: () => void
}

export default function ClassesClient({ unlockedClasses, equippedClasses, playerId, onBack }: Props) {
  const [equipped, setEquipped] = useState<string[]>(equippedClasses)
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = (classId: string) => {
    const isEquipped = equipped.includes(classId)

    if (!isEquipped && equipped.length >= 3) {
      setError('Ya tenés 3 clases equipadas. Desequipá una primero.')
      setTimeout(() => setError(null), 3000)
      return
    }

    setError(null)
    const prev = equipped
    const next = isEquipped
      ? equipped.filter((id) => id !== classId)
      : [...equipped, classId]

    setEquipped(next)
    setPendingId(classId)

    startTransition(async () => {
      // ✅ FIX APPLIED HERE: Removed playerId, passing only classId
      const result = await toggleClassAction(classId) 
      
      if (!result.success) {
        setEquipped(prev)
        setError(result.error ?? 'Error al actualizar clase.')
        setTimeout(() => setError(null), 3000)
      }
      setPendingId(null)
    })
  }

  return (
    <div className="min-h-screen bg-black flex justify-center">
      <div className="w-full min-h-screen bg-gray-900 text-white max-w-5xl">

        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-gray-800">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition">
            ← Volver
          </button>
          <h1 className="text-xl font-bold text-yellow-500">⚔️ Clases</h1>
          <span className="ml-auto text-sm text-gray-400">
            Equipadas:{' '}
            <span className={equipped.length >= 3 ? 'text-yellow-400 font-bold' : 'text-white font-bold'}>
              {equipped.length}/3
            </span>
          </span>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-3 rounded-lg p-3 text-center text-sm font-bold bg-red-900 text-red-400">
            {error}
          </div>
        )}

        <div className="p-4 flex flex-col gap-3">

          {unlockedClasses.length === 0 ? (
            <div className="text-center text-gray-400 py-24">
              <p className="text-4xl mb-4">🔒</p>
              <p className="font-semibold">Todavía no desbloqueaste ninguna clase.</p>
              <p className="text-sm mt-2 text-gray-500">
                Acumulá kills y completá dungeons para desbloquear clases.
              </p>
            </div>
          ) : (
            unlockedClasses.map((cls) => {
              const isEquipped = equipped.includes(cls.id)
              const isLoading = pendingId === cls.id
              const canEquip = equipped.length < 3 || isEquipped

              return (
                <div
                  key={cls.id}
                  className={`rounded-lg border p-5 transition-all ${
                    isEquipped
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : 'border-gray-700 bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">

                    {/* Info de la clase */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-white text-lg">{cls.name}</h3>
                        {isEquipped && (
                          <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full font-semibold shrink-0">
                            EQUIPADA
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mb-4">{cls.description}</p>

                      {/* Bonuses */}
                      <div className="flex flex-wrap gap-2">
                        {cls.bonuses.attack != null && (
                          <BonusBadge icon="⚔️" label="Ataque" value={`+${cls.bonuses.attack}`} />
                        )}
                        {cls.bonuses.defense != null && (
                          <BonusBadge icon="🛡️" label="Defensa" value={`+${cls.bonuses.defense}`} />
                        )}
                        {cls.bonuses.crit_bonus != null && (
                          <BonusBadge icon="🎯" label="Crítico" value={`+${Math.round(cls.bonuses.crit_bonus * 100)}%`} />
                        )}
                        {cls.bonuses.damage_vs && (
                          <BonusBadge
                            icon="💀"
                            label={`vs ${cls.bonuses.damage_vs.type}`}
                            value={`+${Math.round(cls.bonuses.damage_vs.bonus * 100)}%`}
                          />
                        )}
                      </div>

                      {/* Condición de desbloqueo */}
                      <p className="text-xs text-gray-600 mt-3">
                        🔓 {cls.unlock_condition}
                      </p>
                    </div>

                    {/* Botón equipar */}
                    <button
                      onClick={() => handleToggle(cls.id)}
                      disabled={isPending || !canEquip}
                      className={`shrink-0 px-5 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        isEquipped
                          ? 'bg-gray-700 hover:bg-gray-600 text-white'
                          : 'bg-yellow-500 hover:bg-yellow-400 text-black'
                      }`}
                    >
                      {isLoading ? '...' : isEquipped ? 'Desequipar' : 'Equipar'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function BonusBadge({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span className="text-xs bg-gray-700 text-gray-200 px-2.5 py-1 rounded flex items-center gap-1.5">
      {icon} {label}: <span className="text-green-400 font-bold">{value}</span>
    </span>
  )
}