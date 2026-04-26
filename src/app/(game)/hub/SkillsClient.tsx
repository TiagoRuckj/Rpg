'use client'
import BgImage from './BgImage'

import { useState, useEffect } from 'react'
import { Player } from '@/types/game'
import { BASE_SKILLS, LOCKED_SKILLS } from '@/lib/game/skills'
import { createClient } from '@/lib/supabase/client'
import { useToast, ToastContainer } from './Toast'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

// Paleta acorde a la biblioteca arcana — azul profundo, violeta, dorado de velas
const C = {
  border:       '#1e1a4a',
  borderActive: '#6d28d9',
  borderHover:  '#7c3aed',
  borderGold:   '#92400e',
  bg:           'rgba(8,6,25,0.90)',
  bgHeader:     'rgba(5,4,18,0.95)',
  bgCard:       'rgba(15,10,40,0.82)',
  bgCardActive: 'rgba(40,20,80,0.80)',
  bgLocked:     'rgba(8,6,20,0.50)',
  text:         '#a78bfa',
  textDim:      '#4c3a80',
  gold:         '#fbbf24',
  goldDim:      '#78530a',
  shadow:       '4px 4px 0 #000',
  shadowSm:     '2px 2px 0 #000',
}

const TYPE_COLORS: Record<string, string> = {
  physical: '#fb923c',
  magical:  '#60a5fa',
  mixed:    '#c084fc',
}
const TYPE_LABELS: Record<string, string> = {
  physical: '⚔️ Físico',
  magical:  '🔮 Mágico',
  mixed:    '✨ Mixto',
}

// Categoría inferida por los campos de la skill
type SkillCategory = 'attack' | 'recovery' | 'buff' | 'debuff' | 'extra'
const CAT_LABELS: Record<SkillCategory, string> = {
  attack:   '⚔ Ataque',
  recovery: '💚 Recuperación',
  buff:     '⬆ Buff',
  debuff:   '⬇ Debuff',
  extra:    '✦ Extra',
}
const CAT_COLORS: Record<SkillCategory, { border: string; bg: string; text: string }> = {
  attack:   { border: '#c2410c', bg: 'rgba(194,65,12,0.15)', text: '#fb923c' },
  recovery: { border: '#15803d', bg: 'rgba(21,128,61,0.15)', text: '#4ade80' },
  buff:     { border: '#1d4ed8', bg: 'rgba(29,78,216,0.15)', text: '#60a5fa' },
  debuff:   { border: '#7e22ce', bg: 'rgba(126,34,206,0.15)', text: '#c084fc' },
  extra:    { border: '#6b7280', bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
}

function inferCategory(skill: import('@/types/game').PlayerSkill): SkillCategory {
  const s = skill as any
  if (s.heal_hp || s.heal_pct || s.cure_sagrada || skill.id.includes('cura')) return 'recovery'
  if (s.buff_turns || s.damage_buff || skill.id.includes('grito') || skill.id.includes('buff')) return 'buff'
  if (s.debuff_turns || s.reduce_damage || skill.id.includes('debilitar') || skill.id.includes('engano')) return 'debuff'
  if (skill.damage_multiplier > 0) return 'attack'
  return 'extra'
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0 8px' }}>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, ${C.borderActive}, transparent)` }} />
      <span style={{ ...MONO, fontSize: '10px', color: C.text, letterSpacing: '0.12em' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, ${C.borderActive}, transparent)` }} />
    </div>
  )
}

interface Props {
  player: Player
  onBack: () => void
  onPlayerUpdate: (player: Player) => void
}

export default function SkillsClient({ player, onBack, onPlayerUpdate }: Props) {
  const supabase = createClient()
  const [equippedSkills, setEquippedSkills] = useState<string[]>(player.equipped_skills ?? [])
  const [savedSkills, setSavedSkills] = useState<string[]>(player.equipped_skills ?? [])
  const [saving, setSaving] = useState(false)
  const { toasts, addToast } = useToast()

  const unlockedIds = new Set(player.unlocked_skills ?? [])
  const availableSkills = BASE_SKILLS.filter(s => !LOCKED_SKILLS.has(s.id) || unlockedIds.has(s.id))
  const lockedSkills = BASE_SKILLS.filter(s => LOCKED_SKILLS.has(s.id) && !unlockedIds.has(s.id))
  const hasChanges = JSON.stringify([...equippedSkills].sort()) !== JSON.stringify([...savedSkills].sort())

  type SkillTab = 'all' | 'attack' | 'attack_physical' | 'attack_magical' | 'attack_mixed' | 'recovery' | 'buff' | 'debuff' | 'extra'
  const [skillTab, setSkillTab] = useState<SkillTab>('all')

  function filterBySkillTab(skills: typeof BASE_SKILLS) {
    if (skillTab === 'all') return skills
    if (skillTab === 'attack') return skills.filter(s => inferCategory(s) === 'attack')
    if (skillTab === 'attack_physical') return skills.filter(s => inferCategory(s) === 'attack' && s.type === 'physical')
    if (skillTab === 'attack_magical') return skills.filter(s => inferCategory(s) === 'attack' && s.type === 'magical')
    if (skillTab === 'attack_mixed') return skills.filter(s => inferCategory(s) === 'attack' && s.type === 'mixed')
    return skills.filter(s => inferCategory(s) === skillTab)
  }

  const filteredAvailable = filterBySkillTab(availableSkills)
  const filteredLocked = filterBySkillTab(lockedSkills)

  function toggleSkill(skillId: string) {
    setEquippedSkills(prev =>
      prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]
    )
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('players').update({ equipped_skills: equippedSkills }).eq('id', player.id)
    if (error) { addToast('Error al guardar', 'error') }
    else {
      onPlayerUpdate({ ...player, equipped_skills: equippedSkills })
      setSavedSkills([...equippedSkills])
      addToast('✅ Habilidades guardadas', 'success')
    }
    setSaving(false)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white">
      <BgImage src="/sprites/backgrounds/skills_background.png" />
      <ToastContainer toasts={toasts} />

      {/* Header full-width */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-4 shrink-0"
        style={{ background: C.bgHeader, borderColor: C.border, boxShadow: '0 4px 0 #000', position: 'relative', zIndex: 1 }}>
        <button onClick={onBack}
          className="font-bold text-sm transition-all"
          style={{ ...MONO, border: `3px solid ${C.border}`, background: 'rgba(20,15,50,0.80)', color: C.text, padding: '4px 14px', boxShadow: C.shadowSm, textShadow: '1px 1px 0 #000' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.gold }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}>
          ◀ Volver
        </button>
        <h1 className="font-bold text-lg uppercase tracking-widest" style={{ ...MONO, color: C.gold, textShadow: '2px 2px 0 #000' }}>✨ Habilidades</h1>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Col izquierda: skills equipadas ── */}
        <div className="w-72 shrink-0 flex flex-col border-r-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(5,4,18,0.90)', borderColor: C.border, boxShadow: '4px 0 0 #000' }}>

          {/* Equipadas */}
          <div className="p-4 flex flex-col gap-2">
            <p style={{ ...MONO, fontSize: '10px', color: C.textDim, letterSpacing: '0.10em', marginBottom: '4px' }}>
              EQUIPADAS EN COMBATE ({equippedSkills.length})
            </p>

            {equippedSkills.length === 0 ? (
              <div style={{ ...MONO, fontSize: '12px', color: C.textDim, textAlign: 'center', padding: '24px 0', border: `2px dashed ${C.border}` }}>
                Ninguna equipada
              </div>
            ) : (
              equippedSkills.map(skillId => {
                const skill = BASE_SKILLS.find(s => s.id === skillId)
                if (!skill) return null
                return (
                  <div key={skillId} className="flex flex-col gap-1.5 p-3"
                    style={{ background: C.bgCardActive, border: `3px solid ${C.borderActive}`, boxShadow: `${C.shadowSm}, 0 0 8px rgba(109,40,217,0.20)` }}>
                    <div className="flex justify-between items-start">
                      <p style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: '#e9d5ff', textShadow: '1px 1px 0 #000' }}>{skill.name}</p>
                      <button onClick={() => toggleSkill(skill.id)} style={{ ...MONO, color: C.textDim, fontSize: '14px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = C.textDim}>✕</button>
                    </div>
                    <div className="flex gap-3">
                      <span style={{ ...MONO, fontSize: '11px', color: TYPE_COLORS[skill.type] }}>{TYPE_LABELS[skill.type]}</span>
                      {skill.stamina_cost > 0 && <span style={{ ...MONO, fontSize: '11px', color: '#fbbf24' }}>⚡{skill.stamina_cost}</span>}
                      {skill.mana_cost > 0 && <span style={{ ...MONO, fontSize: '11px', color: '#60a5fa' }}>🔮{skill.mana_cost}</span>}
                    </div>
                  </div>
                )
              })
            )}

            {/* Guardar */}
            {hasChanges && (
              <div style={{ position: 'fixed', bottom: '24px', left: '50%', translate: '-50%', zIndex: 200, animation: 'saveBtnUp 400ms linear forwards' }}>
                <style>{`
                  @keyframes saveBtnUp {
                    0%   { transform: translateY(120px);  animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
                    48%  { transform: translateY(0px);   animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
                    65%  { transform: translateY(-6%);   animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
                    79%  { transform: translateY(0px);   animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
                    89%  { transform: translateY(-2%);   animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
                    100% { transform: translateY(0px); }
                  }
                `}</style>
                <button onClick={handleSave} disabled={saving}
                  className="font-bold transition disabled:opacity-40"
                  style={{ ...MONO, fontSize: '15px', padding: '12px 40px', border: `4px solid ${C.borderGold}`, background: 'rgba(80,40,0,0.95)', color: C.gold, boxShadow: `${C.shadow}, 0 0 20px rgba(200,134,10,0.30)`, textShadow: '1px 1px 0 #000', cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  {saving ? 'Guardando...' : '▶ Guardar cambios'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Col derecha: lista de skills ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tabs principales */}
          <div className="flex shrink-0 border-b-4" style={{ borderColor: C.border, background: 'rgba(5,4,18,0.92)' }}>
            {([
              { id: 'all',      label: 'Todos' },
              { id: 'attack',   label: '⚔ Ataque' },
              { id: 'recovery', label: '💚 Restauración' },
              { id: 'buff',     label: '⬆ Buff' },
              { id: 'debuff',   label: '⬇ Debuff' },
              { id: 'extra',    label: '✦ Extra' },
            ] as { id: string; label: string }[]).map(t => (
              <button key={t.id} onClick={() => setSkillTab(t.id as any)}
                className="flex-1 py-2 text-xs font-bold transition"
                style={{
                  ...MONO,
                  background: skillTab === t.id || (t.id === 'attack' && skillTab.startsWith('attack'))
                    ? 'rgba(80,40,180,0.50)' : 'transparent',
                  color: skillTab === t.id || (t.id === 'attack' && skillTab.startsWith('attack'))
                    ? '#e9d5ff' : C.text,
                  borderBottom: skillTab === t.id || (t.id === 'attack' && skillTab.startsWith('attack'))
                    ? `3px solid ${C.borderActive}` : '3px solid transparent',
                  borderRight: `1px solid ${C.border}`,
                  textShadow: skillTab === t.id ? '1px 1px 0 #000' : 'none',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Subpestañas de Ataque — solo cuando está activo */}
          {(skillTab === 'attack' || skillTab.startsWith('attack_')) && (
            <div className="flex justify-center shrink-0 border-b-2" style={{ borderColor: C.border, background: 'rgba(3,2,12,0.85)' }}>
              {([
                { id: 'attack',          label: 'Todos' },
                { id: 'attack_physical', label: '⚔️ Físico' },
                { id: 'attack_magical',  label: '🔮 Mágico' },
                { id: 'attack_mixed',    label: '✨ Mixto' },
              ] as { id: string; label: string }[]).map(t => (
                <button key={t.id} onClick={() => setSkillTab(t.id as any)}
                  className="px-5 py-1.5 text-xs font-bold transition"
                  style={{
                    ...MONO,
                    background: skillTab === t.id ? 'rgba(60,30,140,0.50)' : 'transparent',
                    color: skillTab === t.id ? '#c4b5fd' : C.textDim,
                    borderBottom: skillTab === t.id ? `2px solid ${C.borderHover}` : '2px solid transparent',
                    borderRight: `1px solid ${C.border}`,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Skills scrolleables */}
          <div className="flex-1 overflow-y-auto p-5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
            style={{ background: 'rgba(5,3,15,0.70)' }}>
            <div style={{ maxWidth: '860px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>

            {/* Disponibles */}
            {filteredAvailable.length > 0 && (
              <>
                <SectionDivider label="DISPONIBLES" />
                {filteredAvailable.map(skill => {
                  const isEquipped = equippedSkills.includes(skill.id)
                  const cat = inferCategory(skill)
                  const catStyle = CAT_COLORS[cat]
                  return (
                    <button key={skill.id} onClick={() => toggleSkill(skill.id)}
                      className="w-full text-left px-4 py-3 transition-all"
                      style={{
                        border: `2px solid ${isEquipped ? C.borderActive : C.border}`,
                        background: isEquipped ? C.bgCardActive : C.bgCard,
                        boxShadow: isEquipped ? `${C.shadowSm}, 0 0 10px rgba(109,40,217,0.25)` : 'none',
                        transition: 'border-color 0.12s, background 0.12s',
                        minHeight: '112px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={e => { if (!isEquipped) (e.currentTarget as HTMLButtonElement).style.borderColor = C.borderHover }}
                      onMouseLeave={e => { if (!isEquipped) (e.currentTarget as HTMLButtonElement).style.borderColor = C.border }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Badges izquierda */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <span style={{ ...MONO, fontSize: '11px', padding: '3px 8px', border: `2px solid ${catStyle.border}`, background: catStyle.bg, color: catStyle.text, whiteSpace: 'nowrap' }}>
                            {CAT_LABELS[cat]}
                          </span>
                          <span style={{ ...MONO, fontSize: '11px', padding: '3px 8px', border: `1px solid ${TYPE_COLORS[skill.type]}44`, background: `${TYPE_COLORS[skill.type]}11`, color: TYPE_COLORS[skill.type], whiteSpace: 'nowrap' }}>
                            {TYPE_LABELS[skill.type]}
                          </span>
                        </div>

                        {/* Nombre + descripción */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span style={{ ...MONO, fontSize: '15px', fontWeight: 'bold', color: isEquipped ? '#e9d5ff' : '#c4b5fd', textShadow: '1px 1px 0 #000' }}>
                              {skill.name}
                            </span>
                            {isEquipped && (
                              <span style={{ ...MONO, fontSize: '10px', padding: '1px 6px', border: `2px solid ${C.borderActive}`, background: 'rgba(109,40,217,0.30)', color: '#c084fc', flexShrink: 0 }}>
                                EQUIPADA
                              </span>
                            )}
                          </div>
                          <p style={{ ...MONO, fontSize: '12px', color: '#6d5a8a', lineHeight: '1.4' }}>
                            {skill.description}
                            {skill.damage_multiplier > 0 && <span style={{ color: '#7c3aed', marginLeft: '6px' }}>×{skill.damage_multiplier} daño</span>}
                          </p>
                        </div>

                        {/* Costos */}
                        <div className="flex flex-col gap-1.5 shrink-0 items-end">
                          {skill.stamina_cost > 0 && <span style={{ ...MONO, fontSize: '13px', color: '#fbbf24' }}>⚡ {skill.stamina_cost}</span>}
                          {skill.mana_cost > 0 && <span style={{ ...MONO, fontSize: '13px', color: '#60a5fa' }}>🔮 {skill.mana_cost}</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </>
            )}

            {/* Bloqueadas */}
            {filteredLocked.length > 0 && (
              <>
                <SectionDivider label="BLOQUEADAS" />
                {filteredLocked.map(skill => (
                  <div key={skill.id} className="p-4"
                    style={{ border: `2px solid ${C.border}`, background: C.bgLocked, opacity: 0.55 }}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: C.textDim }}>🔒 {skill.name}</p>
                        <p style={{ ...MONO, fontSize: '12px', color: '#2d1f50', marginTop: '4px', lineHeight: '1.4' }}>{skill.description}</p>
                        <p style={{ ...MONO, fontSize: '11px', color: '#2d1f50', marginTop: '4px' }}>Requiere desbloqueo</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {skill.stamina_cost > 0 && <span style={{ ...MONO, fontSize: '12px', color: '#2d1f50' }}>⚡ {skill.stamina_cost}</span>}
                        {skill.mana_cost > 0 && <span style={{ ...MONO, fontSize: '12px', color: '#2d1f50' }}>🔮 {skill.mana_cost}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {filteredAvailable.length === 0 && filteredLocked.length === 0 && (
              <div style={{ ...MONO, color: C.textDim, textAlign: 'center', padding: '48px 0', fontSize: '13px' }}>
                No tenés habilidades todavía
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}