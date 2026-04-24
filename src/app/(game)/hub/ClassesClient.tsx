'use client'
import BgImage from './BgImage'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleClassAction } from '@/actions/classActions'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

const C = {
  border:      '#5a2e00',
  borderEquip: '#c8600a',
  borderHover: '#e07020',
  bg:          'rgba(15,6,0,0.82)',
  bgEquip:     'rgba(80,35,0,0.80)',
  bgHeader:    'rgba(12,5,0,0.92)',
  bgBadge:     'rgba(0,0,0,0.45)',
  text:        '#e8a060',
  textDim:     '#7a4820',
  gold:        '#f0a030',
  shadow:      '4px 4px 0 #000',
}

type ClassBonus = {
  attack?: number; defense?: number; crit_bonus?: number
  damage_vs?: { type: string; bonus: number }
  weapon_type_bonus?: Record<string, { damage: number; crit_bonus: number }>
  enemy_count_bonus?: { damage_per_enemy: number }
  chest_gold_bonus?: number; crit_mult_bonus?: number
  type_damage_bonus?: Record<string, number>
}

type ClassData = {
  id: string; name: string; description: string
  bonuses: ClassBonus; unlock_condition: string
}

interface Props {
  unlockedClasses: ClassData[]
  equippedClasses: string[]
  playerId: string
  onBack: () => void
  onEquippedClassesChange: (classes: string[]) => void
}

function BonusBadge({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span style={{ ...MONO, fontSize: '11px', padding: '2px 8px', border: `2px solid ${C.border}`, background: C.bgBadge, color: C.text, boxShadow: '2px 2px 0 #000', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {icon} {label}: <span style={{ color: C.gold, fontWeight: 'bold' }}>{value}</span>
    </span>
  )
}

function SectionDivider({ label, equipped }: { label: string; equipped: boolean }) {
  const color = equipped ? C.borderEquip : C.border
  const textColor = equipped ? C.gold : C.text
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
      <div style={{ flex: 1, height: '2px', background: `linear-gradient(to right, ${color}, transparent)` }} />
      <span style={{ ...MONO, fontSize: '11px', color: textColor, letterSpacing: '0.12em', textShadow: '1px 1px 0 #000' }}>{label}</span>
      <div style={{ flex: 1, height: '2px', background: `linear-gradient(to left, ${color}, transparent)` }} />
    </div>
  )
}

interface CardProps {
  cls: ClassData
  isEquipped: boolean
  isLoading: boolean
  canEquip: boolean
  isPending: boolean
  onToggle: (id: string) => void
}

function ClassCard({ cls, isEquipped, isLoading, canEquip, isPending, onToggle }: CardProps) {
  const [hovered, setHovered] = useState(false)
  const [btnHovered, setBtnHovered] = useState(false)

  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{
        // Tamaño fijo — border siempre 4px, outline no afecta layout
        border: `4px solid ${isEquipped ? C.borderEquip : hovered ? C.borderHover : C.border}`,
        background: isEquipped ? C.bgEquip : C.bg,
        boxShadow: isEquipped ? `${C.shadow}, inset 0 0 20px rgba(200,96,10,0.12)` : C.shadow,
        outline: isEquipped ? '0px solid transparent' : hovered ? '0px solid transparent' : '0px solid transparent',
        transition: 'border-color 0.12s, background 0.12s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <h3 style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: isEquipped ? C.gold : '#d4a060', textShadow: '1px 1px 0 #000', margin: 0 }}>
            {cls.name}
          </h3>
          {isEquipped && (
            <span style={{ ...MONO, fontSize: '10px', padding: '1px 7px', border: `2px solid ${C.borderEquip}`, background: 'rgba(200,96,10,0.25)', color: C.gold, boxShadow: '1px 1px 0 #000', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              EQUIPADA
            </span>
          )}
        </div>

        <button
          onClick={() => onToggle(cls.id)}
          disabled={isPending || !canEquip}
          style={{
            ...MONO,
            flexShrink: 0,
            fontSize: '12px',
            fontWeight: 'bold',
            padding: '5px 14px',
            border: '3px solid',
            borderColor: isEquipped ? '#666' : btnHovered ? C.borderHover : C.borderEquip,
            background: isEquipped ? 'rgba(50,50,50,0.60)' : 'rgba(80,35,0,0.85)',
            color: isEquipped ? '#aaa' : C.gold,
            boxShadow: C.shadow,
            textShadow: '1px 1px 0 #000',
            cursor: isPending || !canEquip ? 'not-allowed' : 'pointer',
            opacity: isPending || !canEquip ? 0.45 : 1,
            transition: 'border-color 0.12s',
          }}
          onMouseEnter={() => setBtnHovered(true)}
          onMouseLeave={() => setBtnHovered(false)}
        >
          {isLoading ? '...' : isEquipped ? 'Desequipar' : 'Equipar'}
        </button>
      </div>

      {/* Descripción */}
      <p style={{ ...MONO, fontSize: '12px', color: '#a07848', lineHeight: '1.5', margin: 0 }}>{cls.description}</p>

      {/* Bonuses */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {cls.bonuses.attack != null && cls.bonuses.attack > 0 && <BonusBadge icon="⚔️" label="ATK" value={`+${cls.bonuses.attack}`} />}
        {cls.bonuses.defense != null && cls.bonuses.defense > 0 && <BonusBadge icon="🛡️" label="DEF" value={`+${cls.bonuses.defense}`} />}
        {cls.bonuses.crit_bonus != null && cls.bonuses.crit_bonus > 0 && <BonusBadge icon="🎯" label="CRIT" value={`+${Math.round(cls.bonuses.crit_bonus * 100)}%`} />}
        {cls.bonuses.crit_mult_bonus != null && cls.bonuses.crit_mult_bonus > 0 && <BonusBadge icon="💥" label="CRIT DMG" value={`+${(cls.bonuses.crit_mult_bonus * 100).toFixed(0)}%`} />}
        {cls.bonuses.chest_gold_bonus != null && cls.bonuses.chest_gold_bonus > 0 && <BonusBadge icon="📦" label="Gold cofres" value={`+${Math.round(cls.bonuses.chest_gold_bonus * 100)}%`} />}
        {cls.bonuses.enemy_count_bonus && <BonusBadge icon="💀" label="Por enemigo" value={`+${Math.round(cls.bonuses.enemy_count_bonus.damage_per_enemy * 100)}% daño`} />}
        {cls.bonuses.weapon_type_bonus && Object.entries(cls.bonuses.weapon_type_bonus).map(([wtype, bonus]) => (
          <BonusBadge key={wtype} icon="⚔️" label={`Con ${wtype}`} value={`+${Math.round(bonus.damage * 100)}% dmg +${Math.round(bonus.crit_bonus * 100)}% crit`} />
        ))}
        {cls.bonuses.type_damage_bonus && Object.entries(cls.bonuses.type_damage_bonus).map(([type, bonus]) => (
          <BonusBadge key={type} icon="🎯" label={`vs ${type}`} value={`+${Math.round((bonus as number) * 100)}%`} />
        ))}
        {cls.bonuses.damage_vs && <BonusBadge icon="💀" label={`vs ${cls.bonuses.damage_vs.type}`} value={`+${Math.round(cls.bonuses.damage_vs.bonus * 100)}%`} />}
      </div>

      {/* Unlock condition */}
      <p style={{ ...MONO, fontSize: '11px', color: C.textDim, margin: 0 }}>🔓 {cls.unlock_condition}</p>
    </div>
  )
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
      setError('Ya tenés 3 títulos equipados. Desequipá uno primero.')
      setTimeout(() => setError(null), 3000)
      return
    }
    setError(null)
    const prev = equipped
    const next = isEquipped ? equipped.filter(id => id !== classId) : [...equipped, classId]
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

  const equippedClasses2 = unlockedClasses.filter(c => equipped.includes(c.id))
  const availableClasses = unlockedClasses.filter(c => !equipped.includes(c.id))

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white" style={{}}>
      <BgImage src="/sprites/backgrounds/classes_background.png" />

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-4 shrink-0"
        style={{ background: C.bgHeader, borderColor: C.border, boxShadow: '0 4px 0 #000', zIndex: 1 }}>
        <button
          onClick={onBack}
          className="font-bold text-sm transition-all"
          style={{ ...MONO, border: `3px solid ${C.border}`, background: 'rgba(40,15,0,0.80)', color: C.text, padding: '4px 14px', boxShadow: C.shadow, textShadow: '1px 1px 0 #000' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.gold }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}
        >◀ Volver</button>

        <h1 style={{ ...MONO, fontSize: '18px', fontWeight: 'bold', color: C.gold, textShadow: '2px 2px 0 #000', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>🏅 Títulos</h1>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Equipados</span>
          <div style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', padding: '3px 12px', border: `3px solid ${equipped.length >= 3 ? C.borderEquip : C.border}`, background: equipped.length >= 3 ? 'rgba(80,35,0,0.70)' : 'rgba(20,8,0,0.70)', color: equipped.length >= 3 ? C.gold : C.text, boxShadow: C.shadow, textShadow: '1px 1px 0 #000' }}>
            {equipped.length}/3
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...MONO, margin: '12px 16px 0', padding: '8px 16px', border: '3px solid #8b1a00', background: 'rgba(80,10,0,0.90)', color: '#f87171', boxShadow: C.shadow, textShadow: '1px 1px 0 #000', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', zIndex: 1 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
        style={{ background: 'rgba(8,3,0,0.60)', zIndex: 1 }}>

        {unlockedClasses.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: C.textDim }}>
            <span style={{ fontSize: '48px' }}>🔒</span>
            <p style={{ ...MONO, color: C.text, fontWeight: 'bold' }}>Todavía no desbloqueaste ningún título.</p>
            <p style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Acumulá kills y completá dungeons para desbloquear títulos.</p>
          </div>
        ) : (
          <>
            {equippedClasses2.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <SectionDivider label="EQUIPADAS" equipped={true} />
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                  {equippedClasses2.map(cls => (
                    <ClassCard key={cls.id} cls={cls} isEquipped={true} isLoading={pendingId === cls.id} canEquip={true} isPending={isPending} onToggle={handleToggle} />
                  ))}
                </div>
              </div>
            )}

            {availableClasses.length > 0 && (
              <div>
                <SectionDivider label="DISPONIBLES" equipped={false} />
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                  {availableClasses.map(cls => (
                    <ClassCard key={cls.id} cls={cls} isEquipped={false} isLoading={pendingId === cls.id} canEquip={equipped.length < 3} isPending={isPending} onToggle={handleToggle} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}