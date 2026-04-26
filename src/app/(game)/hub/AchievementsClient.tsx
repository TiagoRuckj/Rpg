'use client'
import BgImage from './BgImage'

import { useState, useEffect } from 'react'
import { Player, PlayerProficiencies, AchievementBonus } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { claimAchievementAction } from '@/actions/achievements'
import { useRouter } from 'next/navigation'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

// Paleta acorde al templo — gris piedra, dorado antorcha, marrón oscuro
const C = {
  border:       '#3d2e10',
  borderGold:   '#92400e',
  borderGreen:  '#14532d',
  borderActive: '#d97706',
  bg:           'rgba(8,6,2,0.92)',
  bgHeader:     'rgba(10,7,2,0.96)',
  bgCard:       'rgba(15,10,3,0.85)',
  bgClaimed:    'rgba(40,28,5,0.80)',
  bgClaimable:  'rgba(5,30,10,0.80)',
  text:         '#c8a060',
  textDim:      '#6a4a20',
  gold:         '#fbbf24',
  goldDim:      '#78530a',
  green:        '#4ade80',
  shadow:       '4px 4px 0 #000',
  shadowSm:     '2px 2px 0 #000',
}

interface Achievement {
  id: number; metric: string; threshold: number; name: string | null
  description: string | null; reward_type: string; title_id: string | null
  bonus_attack: number; bonus_defense: number; bonus_hp: number
  bonus_crit_mult: number; bonus_gold_pct: number; bonus_type_dmg: Record<string, number>
}

interface PlayerAchievement { achievement_id: number; claimed: boolean }
interface Props { player: Player; onBack: () => void }

const METRIC_LABELS: Record<string, string> = {
  sword_kills: '⚔️ Kills con espada', axe_kills: '🪓 Kills con hacha',
  hammer_kills: '🔨 Kills con martillo', bow_kills: '🏹 Kills con arco',
  spear_kills: '🗡️ Kills con lanza', magic_kills: '🔮 Kills con magia',
  total_kills: '💀 Total de kills', goblin_kills: '👺 Goblins derrotados',
  total_gold: '💰 Gold obtenido', chests_opened: '📦 Cofres abiertos',
  biggest_damage: '💥 Mayor daño de un golpe',
  goblin_king_defeated: '👑 Rey Goblin derrotado',
  gran_goblin_defeated: '🐉 Gran Goblin derrotado',
}

function fmt(metric: string, value: number) {
  if (metric === 'total_gold') return `${value.toLocaleString()} gold`
  if (metric === 'biggest_damage') return `${value.toLocaleString()} dmg`
  return value.toLocaleString()
}

function rewardDesc(a: Achievement) {
  const parts: string[] = []
  if (a.title_id) parts.push(`Título: ${a.name ?? a.title_id}`)
  if (a.bonus_attack > 0) parts.push(`+${a.bonus_attack} ATK`)
  if (a.bonus_defense > 0) parts.push(`+${a.bonus_defense} DEF`)
  if (a.bonus_hp > 0) parts.push(`+${a.bonus_hp} HP`)
  if (a.bonus_crit_mult > 0) parts.push(`+${(a.bonus_crit_mult * 100).toFixed(0)}% crit dmg`)
  if (a.bonus_gold_pct > 0) parts.push(`+${(a.bonus_gold_pct * 100).toFixed(0)}% gold`)
  for (const [type, bonus] of Object.entries(a.bonus_type_dmg ?? {}))
    parts.push(`+${((bonus ?? 0) * 100).toFixed(0)}% dmg vs ${type}`)
  return parts.join(' · ')
}

function groupByMetric(achs: Achievement[]) {
  const g: Record<string, Achievement[]> = {}
  for (const a of achs) { if (!g[a.metric]) g[a.metric] = []; g[a.metric].push(a) }
  for (const k of Object.keys(g)) g[k].sort((a, b) => a.threshold - b.threshold)
  return g
}

export default function AchievementsClient({ player, onBack }: Props) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [playerAchs, setPlayerAchs] = useState<PlayerAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<number | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const proficiencies = (player.proficiencies ?? {}) as PlayerProficiencies
  const achievementBonus = (player.achievement_bonus ?? {}) as AchievementBonus

  useEffect(() => {
    async function load() {
      const [achResult, paResult] = await Promise.all([
        supabase.from('achievements').select('*').order('metric').order('threshold'),
        supabase.from('player_achievements').select('achievement_id, claimed').eq('player_id', player.id),
      ])
      if (achResult.error) { setError(achResult.error.message); setLoading(false); return }
      if (paResult.error) { setError(paResult.error.message); setLoading(false); return }
      setAchievements(achResult.data ?? [])
      setPlayerAchs(paResult.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const unlockedIds = new Set(playerAchs.map(p => p.achievement_id))
  const claimedIds = new Set(playerAchs.filter(p => p.claimed).map(p => p.achievement_id))

  async function handleClaim(id: number) {
    setClaiming(id)
    const result = await claimAchievementAction(id)
    if (!result.success) { setClaiming(null); return }
    setPlayerAchs(prev => prev.map(p => p.achievement_id === id ? { ...p, claimed: true } : p))
    setClaiming(null)
    router.refresh()
  }

  const grouped = groupByMetric(achievements)

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white">
      <BgImage src="/sprites/backgrounds/achievements_bg.png" />

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-4 shrink-0"
        style={{ background: C.bgHeader, borderColor: C.border, boxShadow: '0 4px 0 #000', position: 'relative', zIndex: 1 }}>
        <button onClick={onBack} className="font-bold text-sm transition-all"
          style={{ ...MONO, border: `3px solid ${C.border}`, background: 'rgba(25,15,3,0.80)', color: C.text, padding: '4px 14px', boxShadow: C.shadowSm, textShadow: '1px 1px 0 #000' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderActive; e.currentTarget.style.color = C.gold }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}>
          ◀ Volver
        </button>
        <h1 className="font-bold text-lg uppercase tracking-widest" style={{ ...MONO, color: C.gold, textShadow: '2px 2px 0 #000' }}>🏆 Logros</h1>
      </div>

      {/* Bonuses acumulados */}
      {(achievementBonus.attack > 0 || achievementBonus.defense > 0 || achievementBonus.hp > 0 ||
        achievementBonus.crit_mult > 0 || achievementBonus.gold_pct > 0 ||
        Object.keys(achievementBonus.type_damage ?? {}).length > 0) && (
        <div className="mx-5 mt-4 flex flex-wrap gap-2 p-4 shrink-0"
          style={{ background: 'rgba(40,28,5,0.80)', border: `3px solid ${C.borderGold}`, boxShadow: C.shadowSm, position: 'relative', zIndex: 1 }}>
          <p style={{ ...MONO, fontSize: '10px', color: C.goldDim, letterSpacing: '0.10em', width: '100%' }}>✨ BONUSES ACUMULADOS</p>
          {achievementBonus.attack > 0   && <span style={{ ...MONO, fontSize: '13px', color: '#fb923c', padding: '2px 8px', border: '2px solid #c2410c', background: 'rgba(0,0,0,0.30)' }}>+{achievementBonus.attack} ATK</span>}
          {achievementBonus.defense > 0  && <span style={{ ...MONO, fontSize: '13px', color: '#60a5fa', padding: '2px 8px', border: '2px solid #1d4ed8', background: 'rgba(0,0,0,0.30)' }}>+{achievementBonus.defense} DEF</span>}
          {achievementBonus.hp > 0       && <span style={{ ...MONO, fontSize: '13px', color: '#f87171', padding: '2px 8px', border: '2px solid #b91c1c', background: 'rgba(0,0,0,0.30)' }}>+{achievementBonus.hp} HP</span>}
          {achievementBonus.crit_mult > 0 && <span style={{ ...MONO, fontSize: '13px', color: C.gold, padding: '2px 8px', border: `2px solid ${C.borderGold}`, background: 'rgba(0,0,0,0.30)' }}>+{(achievementBonus.crit_mult * 100).toFixed(0)}% crit dmg</span>}
          {achievementBonus.gold_pct > 0  && <span style={{ ...MONO, fontSize: '13px', color: C.gold, padding: '2px 8px', border: `2px solid ${C.borderGold}`, background: 'rgba(0,0,0,0.30)' }}>+{(achievementBonus.gold_pct * 100).toFixed(0)}% gold</span>}
          {Object.entries(achievementBonus.type_damage ?? {}).map(([type, bonus]) => (
            <span key={type} style={{ ...MONO, fontSize: '13px', color: '#c084fc', padding: '2px 8px', border: '2px solid #7e22ce', background: 'rgba(0,0,0,0.30)' }}>+{((bonus ?? 0) * 100).toFixed(0)}% vs {type}</span>
          ))}
        </div>
      )}

      {/* Lista de logros */}
      <div className="flex-1 overflow-y-auto p-5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
        style={{ background: 'rgba(5,3,0,0.65)', position: 'relative', zIndex: 1 }}>

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p style={{ ...MONO, color: C.textDim }}>Cargando logros...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p style={{ ...MONO, color: '#f87171', fontSize: '13px' }}>{error}</p>
          </div>
        ) : achievements.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p style={{ ...MONO, color: C.textDim, fontSize: '13px' }}>No hay logros en la DB todavía.</p>
          </div>
        ) : (
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(grouped).map(([metric, achs]) => {
              const current = (proficiencies as any)[metric] ?? 0
              const maxThreshold = achs[achs.length - 1].threshold
              const allClaimed = achs.every(a => claimedIds.has(a.id))
              const hasClaimable = achs.some(a => unlockedIds.has(a.id) && !claimedIds.has(a.id))
              const progressPct = Math.min(100, (current / maxThreshold) * 100)

              return (
                <div key={metric} style={{
                  border: `3px solid ${allClaimed ? C.borderGold : hasClaimable ? C.borderGreen : C.border}`,
                  background: allClaimed ? C.bgClaimed : hasClaimable ? C.bgClaimable : C.bgCard,
                  boxShadow: allClaimed ? `${C.shadowSm}, 0 0 10px rgba(217,119,6,0.20)` : hasClaimable ? `${C.shadowSm}, 0 0 8px rgba(20,83,45,0.30)` : C.shadowSm,
                }}>
                  {/* Header del grupo */}
                  <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderColor: C.border }}>
                    <div>
                      <p style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: allClaimed ? C.gold : hasClaimable ? C.green : C.text, textShadow: '1px 1px 0 #000' }}>
                        {METRIC_LABELS[metric] ?? metric}
                      </p>
                      <p style={{ ...MONO, fontSize: '11px', color: C.textDim, marginTop: '2px' }}>
                        {fmt(metric, current)} acumulados
                      </p>
                    </div>
                    <div>
                      {allClaimed && <span style={{ ...MONO, fontSize: '12px', color: C.gold, textShadow: '1px 1px 0 #000' }}>🏆 Completado</span>}
                      {hasClaimable && !allClaimed && <span style={{ ...MONO, fontSize: '12px', color: C.green }}>● Reclamar</span>}
                    </div>
                  </div>

                  {/* Barra de progreso segmentada */}
                  <div className="px-4 pt-3 pb-2">
                    <div style={{ position: 'relative', height: '12px', background: 'rgba(0,0,0,0.60)', border: `2px solid ${C.border}` }}>
                      <div style={{ height: '100%', width: `${progressPct}%`, background: allClaimed ? C.borderGold : C.borderGreen, transition: 'width 0.5s', boxShadow: allClaimed ? '0 0 6px rgba(217,119,6,0.50)' : '0 0 6px rgba(20,83,45,0.50)' }} />
                      {achs.map(a => {
                        const pct = (a.threshold / maxThreshold) * 100
                        const claimed = claimedIds.has(a.id)
                        const unlocked = unlockedIds.has(a.id)
                        return (
                          <div key={a.id} style={{ position: 'absolute', top: '-4px', left: `${pct}%`, transform: 'translateX(-50%)', width: '18px', height: '18px', background: claimed ? C.borderGold : unlocked ? C.borderGreen : '#2a1800', border: `2px solid ${claimed ? C.gold : unlocked ? C.green : C.border}`, boxShadow: claimed ? '0 0 6px rgba(251,191,36,0.50)' : 'none' }} />
                        )
                      })}
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="px-4 pb-3 flex flex-col gap-2">
                    {achs.map(a => {
                      const unlocked = unlockedIds.has(a.id)
                      const claimed = claimedIds.has(a.id)
                      const canClaim = unlocked && !claimed
                      return (
                        <div key={a.id} className="flex items-start gap-3" style={{ opacity: !unlocked ? 0.45 : 1 }}>
                          <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '2px' }}>
                            {claimed ? '✅' : unlocked ? '🎁' : '🔒'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: claimed ? C.gold : unlocked ? C.green : C.textDim }}>
                                {a.name ?? fmt(metric, a.threshold)}
                              </span>
                              <span style={{ ...MONO, fontSize: '11px', color: C.textDim }}>({fmt(metric, a.threshold)})</span>
                            </div>
                            <p style={{ ...MONO, fontSize: '11px', color: claimed ? C.goldDim : unlocked ? '#15803d' : C.textDim, marginTop: '2px' }}>
                              ✦ {rewardDesc(a)}
                            </p>
                          </div>
                          {canClaim && (
                            <button onClick={() => handleClaim(a.id)} disabled={claiming === a.id}
                              style={{ ...MONO, flexShrink: 0, padding: '5px 16px', fontSize: '12px', fontWeight: 'bold', border: `3px solid ${C.borderGreen}`, background: 'rgba(10,50,10,0.85)', color: C.green, boxShadow: C.shadowSm, textShadow: '1px 1px 0 #000', cursor: claiming === a.id ? 'not-allowed' : 'pointer', opacity: claiming === a.id ? 0.5 : 1 }}>
                              {claiming === a.id ? '...' : 'Reclamar'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}