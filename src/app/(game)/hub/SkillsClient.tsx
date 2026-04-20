'use client'

import { useState } from 'react'
import { Player, PlayerSkill } from '@/types/game'
import { BASE_SKILLS, LOCKED_SKILLS } from '@/lib/game/skills'
import { createClient } from '@/lib/supabase/client'

const MAX_EQUIPPED = 3

interface Props {
  player: Player
  onBack: () => void
  onPlayerUpdate: (player: Player) => void
}

const TYPE_COLORS: Record<string, string> = {
  physical: 'text-orange-400',
  magical:  'text-blue-400',
  mixed:    'text-purple-400',
}

const TYPE_LABELS: Record<string, string> = {
  physical: '⚔️ Físico',
  magical:  '🔮 Mágico',
  mixed:    '✨ Mixto',
}

export default function SkillsClient({ player, onBack, onPlayerUpdate }: Props) {
  const supabase = createClient()
  const [equippedSkills, setEquippedSkills] = useState<string[]>(player.equipped_skills ?? [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const unlockedIds = new Set(player.unlocked_skills ?? [])

  // Skills disponibles — base desbloqueadas + las que no requieren desbloqueo
  const availableSkills = BASE_SKILLS.filter(
    s => !LOCKED_SKILLS.has(s.id) || unlockedIds.has(s.id)
  )
  const lockedSkills = BASE_SKILLS.filter(
    s => LOCKED_SKILLS.has(s.id) && !unlockedIds.has(s.id)
  )

  function showMsg(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 2500)
  }

  function toggleSkill(skillId: string) {
    setEquippedSkills(prev => {
      if (prev.includes(skillId)) return prev.filter(id => id !== skillId)
      if (prev.length >= MAX_EQUIPPED) {
        showMsg(`Podés equipar un máximo de ${MAX_EQUIPPED} habilidades`, 'error')
        return prev
      }
      return [...prev, skillId]
    })
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('players')
      .update({ equipped_skills: equippedSkills })
      .eq('id', player.id)

    if (error) {
      showMsg('Error al guardar', 'error')
    } else {
      onPlayerUpdate({ ...player, equipped_skills: equippedSkills })
      showMsg('✅ Habilidades guardadas', 'success')
    }
    setSaving(false)
  }

  const hasChanges = JSON.stringify(equippedSkills.sort()) !== JSON.stringify((player.equipped_skills ?? []).sort())

  return (
    <div className="h-screen bg-gray-950 flex justify-center overflow-hidden">
      <div className="w-full h-screen bg-gray-950 text-white max-w-3xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-gray-800 shrink-0">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition">← Volver</button>
          <h1 className="text-xl font-bold text-purple-400">✨ Habilidades</h1>
          <span className="ml-auto text-gray-500 text-sm">{equippedSkills.length}/{MAX_EQUIPPED} equipadas</span>
        </div>

        {/* Mensaje */}
        {message && (
          <div className={`mx-4 mt-3 rounded-lg p-3 text-center text-sm font-bold shrink-0 ${
            message.type === 'success' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Slots equipados */}
        <div className="px-4 pt-4 shrink-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Equipadas en combate</p>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: MAX_EQUIPPED }).map((_, i) => {
              const skillId = equippedSkills[i]
              const skill = skillId ? BASE_SKILLS.find(s => s.id === skillId) : null
              return (
                <div
                  key={i}
                  className={`rounded-xl p-3 border min-h-20 flex flex-col justify-between ${
                    skill
                      ? 'bg-purple-950/50 border-purple-700'
                      : 'bg-gray-800/30 border-dashed border-gray-700'
                  }`}
                >
                  {skill ? (
                    <>
                      <div>
                        <p className="text-white text-sm font-bold">{skill.name}</p>
                        <p className={`text-xs mt-0.5 ${TYPE_COLORS[skill.type]}`}>{TYPE_LABELS[skill.type]}</p>
                      </div>
                      <div className="flex gap-2 text-xs mt-2">
                        {skill.stamina_cost > 0 && <span className="text-yellow-400">⚡{skill.stamina_cost}</span>}
                        {skill.mana_cost > 0 && <span className="text-blue-400">🔮{skill.mana_cost}</span>}
                        <button
                          onClick={() => toggleSkill(skill.id)}
                          className="ml-auto text-gray-500 hover:text-red-400 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-gray-700 text-2xl">+</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Lista de skills — scrolleable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

          {/* Desbloqueadas */}
          {availableSkills.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Disponibles</p>
              <div className="flex flex-col gap-2">
                {availableSkills.map(skill => {
                  const isEquipped = equippedSkills.includes(skill.id)
                  const isFull = equippedSkills.length >= MAX_EQUIPPED && !isEquipped
                  return (
                    <button
                      key={skill.id}
                      onClick={() => toggleSkill(skill.id)}
                      disabled={isFull}
                      className={`w-full text-left rounded-xl p-4 border transition ${
                        isEquipped
                          ? 'bg-purple-900/40 border-purple-600 hover:bg-purple-900/60'
                          : isFull
                          ? 'bg-gray-800/30 border-gray-700 opacity-40 cursor-not-allowed'
                          : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{skill.name}</span>
                            {isEquipped && (
                              <span className="text-xs bg-purple-700 text-purple-200 px-2 py-0.5 rounded-full">Equipada</span>
                            )}
                          </div>
                          <p className="text-gray-400 text-xs mt-1">{skill.description}</p>
                          <p className={`text-xs mt-1 ${TYPE_COLORS[skill.type]}`}>
                            {TYPE_LABELS[skill.type]} · x{skill.damage_multiplier} daño
                          </p>
                        </div>
                        <div className="flex flex-col gap-1 text-xs ml-4 shrink-0">
                          {skill.stamina_cost > 0 && <span className="text-yellow-400">⚡ {skill.stamina_cost}</span>}
                          {skill.mana_cost > 0    && <span className="text-blue-400">🔮 {skill.mana_cost}</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bloqueadas */}
          {lockedSkills.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Bloqueadas</p>
              <div className="flex flex-col gap-2">
                {lockedSkills.map(skill => (
                  <div
                    key={skill.id}
                    className="w-full text-left rounded-xl p-4 border border-gray-800 bg-gray-800/20 opacity-50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-400">🔒 {skill.name}</span>
                        </div>
                        <p className="text-gray-600 text-xs mt-1">{skill.description}</p>
                        <p className="text-gray-600 text-xs mt-1">Requiere desbloqueo</p>
                      </div>
                      <div className="flex flex-col gap-1 text-xs ml-4 shrink-0">
                        {skill.stamina_cost > 0 && <span className="text-gray-600">⚡ {skill.stamina_cost}</span>}
                        {skill.mana_cost > 0    && <span className="text-gray-600">🔮 {skill.mana_cost}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {availableSkills.length === 0 && lockedSkills.length === 0 && (
            <p className="text-gray-600 text-center py-12">No tenés habilidades todavía</p>
          )}
        </div>

        {/* Footer con guardar */}
        {hasChanges && (
          <div className="p-4 border-t border-gray-800 shrink-0">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}