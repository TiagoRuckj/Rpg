'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleClassAction } from '@/actions/classActions'

type ClassBonus = {
  attack?: number
  defense?: number
  crit_bonus?: number
  damage_vs?: { type: string; bonus: number }
  weapon_type_bonus?: Record<string, { damage: number; crit_bonus: number }>
  enemy_count_bonus?: { damage_per_enemy: number }
  chest_gold_bonus?: number
  crit_mult_bonus?: number
  type_damage_bonus?: Record<string, number>
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
  playerId: string
  onBack: () => void
  onEquippedClassesChange: (classes: string[]) => void
}

export default function ClassesClient({ unlockedClasses, equippedClasses, playerId, onBack, onEquippedClassesChange }: Props) {
  const [equipped, setEquipped] = useState<string[]>(equippedClasses)
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

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
      const result = await toggleClassAction(classId)
      if (!result.success) {
        setEquipped(prev)
        setError(result.error ?? 'Error al actualizar clase.')
        setTimeout(() => setError(null), 3000)
      } else {
        onEquippedClassesChange(next)
        router.refresh()
      }
      setPendingId(null)
    })
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white" style={{ backgroundImage: 'url(/sprites/backgrounds/hub_background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="w-full min-h-screen flex flex-col max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 border-b-4 border-yellow-900 shrink-0" style={{ background: 'rgba(20,10,5,0.88)', boxShadow: '0 4px 0 #000' }}>
          <button onClick={onBack} className="text-yellow-700 hover:text-yellow-400 transition text-sm" style={{ fontFamily: 'monospace' }}>◀ Volver</button>
          <h1 className="text-lg font-bold text-yellow-400 uppercase tracking-widest" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>⚔️ Clases</h1>
          <span className="ml-auto text-sm" style={{ fontFamily: 'monospace', color: '#7a5a30' }}>
            Equipadas:{' '}
            <span className={equipped.length >= 3 ? 'text-yellow-400 font-bold' : 'text-yellow-200 font-bold'}>
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

        <div className="p-4 flex flex-col gap-3" style={{ background: 'rgba(10,5,2,0.75)' }}>

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
                  className="p-5 transition-all"
                  style={{
                    border: `4px solid ${isEquipped ? '#c8860a' : '#4a3000'}`,
                    background: isEquipped ? 'rgba(80,50,5,0.70)' : 'rgba(20,10,5,0.70)',
                    boxShadow: isEquipped ? '4px 4px 0 #000, inset 0 0 12px rgba(255,180,0,0.10)' : '4px 4px 0 #000',
                  }}
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
                        {cls.bonuses.attack != null && cls.bonuses.attack > 0 && (
                          <BonusBadge icon="⚔️" label="Ataque" value={`+${cls.bonuses.attack}`} />
                        )}
                        {cls.bonuses.defense != null && cls.bonuses.defense > 0 && (
                          <BonusBadge icon="🛡️" label="Defensa" value={`+${cls.bonuses.defense}`} />
                        )}
                        {cls.bonuses.crit_bonus != null && cls.bonuses.crit_bonus > 0 && (
                          <BonusBadge icon="🎯" label="Crítico" value={`+${Math.round(cls.bonuses.crit_bonus * 100)}%`} />
                        )}
                        {cls.bonuses.crit_mult_bonus != null && cls.bonuses.crit_mult_bonus > 0 && (
                          <BonusBadge icon="💥" label="Mult. crítico" value={`+${(cls.bonuses.crit_mult_bonus * 100).toFixed(0)}%`} />
                        )}
                        {cls.bonuses.chest_gold_bonus != null && cls.bonuses.chest_gold_bonus > 0 && (
                          <BonusBadge icon="📦" label="Gold de cofres" value={`+${Math.round(cls.bonuses.chest_gold_bonus * 100)}%`} />
                        )}
                        {cls.bonuses.enemy_count_bonus && (
                          <BonusBadge icon="💀" label="Por enemigo" value={`+${Math.round(cls.bonuses.enemy_count_bonus.damage_per_enemy * 100)}% daño`} />
                        )}
                        {cls.bonuses.weapon_type_bonus && Object.entries(cls.bonuses.weapon_type_bonus).map(([wtype, bonus]) => (
                          <BonusBadge key={wtype} icon="⚔️" label={`Con ${wtype}`} value={`+${Math.round(bonus.damage * 100)}% daño, +${Math.round(bonus.crit_bonus * 100)}% crit`} />
                        ))}
                        {cls.bonuses.type_damage_bonus && Object.entries(cls.bonuses.type_damage_bonus).map(([type, bonus]) => (
                          <BonusBadge key={type} icon="🎯" label={`vs ${type}`} value={`+${Math.round((bonus as number) * 100)}%`} />
                        ))}
                        {cls.bonuses.damage_vs && (
                          <BonusBadge icon="💀" label={`vs ${cls.bonuses.damage_vs.type}`} value={`+${Math.round(cls.bonuses.damage_vs.bonus * 100)}%`} />
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
                      className="shrink-0 px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        fontFamily: 'monospace',
                        border: '4px solid',
                        borderColor: isEquipped ? '#555' : '#c8860a',
                        background: isEquipped ? 'rgba(60,60,60,0.6)' : 'rgba(100,65,0,0.85)',
                        color: '#ffd700',
                        boxShadow: '4px 4px 0 #000',
                        textShadow: '1px 1px 0 #000',
                      }}
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
    <span className="text-xs px-2.5 py-1 flex items-center gap-1.5" style={{ fontFamily: 'monospace', border: '2px solid #4a3000', background: 'rgba(0,0,0,0.4)', color: '#a07840', boxShadow: '2px 2px 0 #000' }}>
      {icon} {label}: <span className="text-yellow-400 font-bold">{value}</span>
    </span>
  )
}