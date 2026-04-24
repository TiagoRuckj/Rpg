'use client'
import BgImage from './BgImage'

import { useState, useEffect } from 'react'
import { Player, PlayerProficiencies, AchievementBonus } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { claimAchievementAction } from '@/actions/achievements'
import { useRouter } from 'next/navigation'

interface Achievement {
  id: number
  metric: string
  threshold: number
  name: string | null
  description: string | null
  reward_type: string
  title_id: string | null
  bonus_attack: number
  bonus_defense: number
  bonus_hp: number
  bonus_crit_mult: number
  bonus_gold_pct: number
  bonus_type_dmg: Record<string, number>
}

interface PlayerAchievement {
  achievement_id: number
  claimed: boolean
}

interface Props {
  player: Player
  onBack: () => void
}

const METRIC_LABELS: Record<string, string> = {
  sword_kills:          '⚔️ Kills con espada',
  axe_kills:            '🪓 Kills con hacha',
  hammer_kills:         '🔨 Kills con martillo',
  bow_kills:            '🏹 Kills con arco',
  spear_kills:          '🗡️ Kills con lanza',
  magic_kills:          '🔮 Kills con magia',
  total_kills:          '💀 Total de kills',
  goblin_kills:         '👺 Goblins derrotados',
  total_gold:           '💰 Gold obtenido',
  chests_opened:        '📦 Cofres abiertos',
  biggest_damage:       '💥 Mayor daño de un golpe',
  goblin_king_defeated: '👑 Rey Goblin derrotado',
  gran_goblin_defeated: '🐉 Gran Goblin derrotado',
}

function formatMetricValue(metric: string, value: number): string {
  if (metric === 'total_gold') return `${value.toLocaleString()} gold`
  if (metric === 'biggest_damage') return `${value.toLocaleString()} dmg`
  return value.toLocaleString()
}

function rewardDescription(a: Achievement): string {
  const parts: string[] = []
  if (a.title_id) parts.push(`Título: ${a.name ?? a.title_id}`)
  if (a.bonus_attack > 0) parts.push(`+${a.bonus_attack} ATK`)
  if (a.bonus_defense > 0) parts.push(`+${a.bonus_defense} DEF`)
  if (a.bonus_hp > 0) parts.push(`+${a.bonus_hp} HP`)
  if (a.bonus_crit_mult > 0) parts.push(`+${(a.bonus_crit_mult * 100).toFixed(0)}% crit dmg`)
  if (a.bonus_gold_pct > 0) parts.push(`+${(a.bonus_gold_pct * 100).toFixed(0)}% gold`)
  if (Object.keys(a.bonus_type_dmg ?? {}).length > 0) {
    for (const [type, bonus] of Object.entries(a.bonus_type_dmg)) {
      parts.push(`+${(bonus * 100).toFixed(0)}% dmg vs ${type}`)
    }
  }
  return parts.join(', ')
}

function groupByMetric(achievements: Achievement[]): Record<string, Achievement[]> {
  const groups: Record<string, Achievement[]> = {}
  for (const a of achievements) {
    if (!groups[a.metric]) groups[a.metric] = []
    groups[a.metric].push(a)
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.threshold - b.threshold)
  }
  return groups
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
      if (achResult.error) { setError(`Error: ${achResult.error.message}`); setLoading(false); return }
      if (paResult.error) { setError(`Error: ${paResult.error.message}`); setLoading(false); return }
      setAchievements(achResult.data ?? [])
      setPlayerAchs(paResult.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const unlockedIds = new Set(playerAchs.map(p => p.achievement_id))
  const claimedIds = new Set(playerAchs.filter(p => p.claimed).map(p => p.achievement_id))

  async function handleClaim(achievementId: number) {
    setClaiming(achievementId)
    const result = await claimAchievementAction(achievementId)
    if (!result.success) {
      setClaiming(null)
      return
    }
    setPlayerAchs(prev => prev.map(p =>
      p.achievement_id === achievementId ? { ...p, claimed: true } : p
    ))
    setClaiming(null)
    router.refresh()
  }

  const grouped = groupByMetric(achievements)

  return (
    <div className="h-screen flex justify-center overflow-hidden" style={{}}>
      <BgImage src="/sprites/backgrounds/achievements_bg.png" />
      <div className="w-full h-full text-white max-w-2xl flex flex-col overflow-hidden bg-black/60">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 border-b-4 border-yellow-900 shrink-0" style={{ background: 'rgba(20,10,5,0.88)', boxShadow: '0 4px 0 #000' }}>
          <button onClick={onBack} className="text-yellow-700 hover:text-yellow-400 transition text-sm" style={{ fontFamily: 'monospace' }}>◀ Volver</button>
          <h1 className="text-lg font-bold text-yellow-400 uppercase tracking-widest" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>🏆 Logros</h1>
        </div>

        {/* Bonus acumulado */}
        {(achievementBonus.attack > 0 || achievementBonus.defense > 0 || achievementBonus.hp > 0 ||
          achievementBonus.crit_mult > 0 || achievementBonus.gold_pct > 0 ||
          Object.keys(achievementBonus.type_damage ?? {}).length > 0) && (
          <div className="mx-4 mt-4 bg-yellow-950/30 border border-yellow-700/40 rounded-xl p-4">
            <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2">✨ Bonuses acumulados</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {achievementBonus.attack > 0   && <span className="text-orange-300">+{achievementBonus.attack} ATK</span>}
              {achievementBonus.defense > 0  && <span className="text-blue-300">+{achievementBonus.defense} DEF</span>}
              {achievementBonus.hp > 0       && <span className="text-red-300">+{achievementBonus.hp} HP</span>}
              {achievementBonus.crit_mult > 0 && <span className="text-yellow-300">+{(achievementBonus.crit_mult * 100).toFixed(0)}% crit dmg</span>}
              {achievementBonus.gold_pct > 0  && <span className="text-yellow-300">+{(achievementBonus.gold_pct * 100).toFixed(0)}% gold</span>}
              {Object.entries(achievementBonus.type_damage ?? {}).map(([type, bonus]) => (
                <span key={type} className="text-purple-300">+{((bonus ?? 0) * 100).toFixed(0)}% vs {type}</span>
              ))}
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500">Cargando logros...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : achievements.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500 text-sm">No hay logros en la DB todavía.</p>
            </div>
          ) : Object.entries(grouped).map(([metric, achs]) => {
            const current = (proficiencies as any)[metric] ?? 0
            const maxThreshold = achs[achs.length - 1].threshold
            const allUnlocked = achs.every(a => unlockedIds.has(a.id))
            const allClaimed = achs.every(a => claimedIds.has(a.id))
            const progressPct = Math.min(100, (current / maxThreshold) * 100)
            const hasClaimable = achs.some(a => unlockedIds.has(a.id) && !claimedIds.has(a.id))

            return (
              <div
                key={metric}
                className={`border rounded-2xl p-5 transition backdrop-blur-sm ${
                  allClaimed
                    ? 'border-yellow-600/40 bg-yellow-950/20'
                    : hasClaimable
                      ? 'border-green-600/50 bg-green-950/10'
                      : 'border-gray-700/50 bg-black/20'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-bold text-white text-base">{METRIC_LABELS[metric] ?? metric}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatMetricValue(metric, current)} acumulados</p>
                  </div>
                  {allClaimed && <span className="text-yellow-400 text-sm font-bold">🏆 Completado</span>}
                  {hasClaimable && !allClaimed && <span className="text-green-400 text-sm font-bold animate-pulse">● Reclamar</span>}
                </div>

                {/* Barra segmentada */}
                <div className="relative mb-5 h-4">
                  <div className="absolute inset-0 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${allClaimed ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {/* Marcadores */}
                  {achs.map(a => {
                    const pct = (a.threshold / maxThreshold) * 100
                    const claimed = claimedIds.has(a.id)
                    const unlocked = unlockedIds.has(a.id)
                    return (
                      <div
                        key={a.id}
                        className="absolute top-0 h-4 -translate-x-1/2 flex items-center"
                        style={{ left: `${pct}%` }}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 transition ${
                          claimed
                            ? 'bg-yellow-400 border-yellow-300'
                            : unlocked
                              ? 'bg-green-400 border-green-300'
                              : 'bg-gray-700 border-gray-600'
                        }`} />
                      </div>
                    )
                  })}
                </div>

                {/* Milestones */}
                <div className="flex flex-col gap-3">
                  {achs.map(a => {
                    const unlocked = unlockedIds.has(a.id)
                    const claimed = claimedIds.has(a.id)
                    const canClaim = unlocked && !claimed
                    return (
                      <div key={a.id} className={`flex items-start gap-3 ${!unlocked ? 'opacity-50' : ''}`}>
                        <span className="text-lg mt-0.5 shrink-0">
                          {claimed ? '✅' : unlocked ? '🎁' : '🔒'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className={`font-semibold text-sm ${claimed ? 'text-yellow-300' : unlocked ? 'text-green-300' : 'text-gray-400'}`}>
                              {a.name ?? formatMetricValue(metric, a.threshold)}
                            </span>
                            <span className="text-xs text-gray-600">({formatMetricValue(metric, a.threshold)})</span>
                          </div>
                          <p className={`text-xs mt-0.5 ${claimed ? 'text-green-400' : unlocked ? 'text-green-500' : 'text-gray-600'}`}>
                            ✦ {rewardDescription(a)}
                          </p>
                        </div>
                        {canClaim && (
                          <button
                            onClick={() => handleClaim(a.id)}
                            disabled={claiming === a.id}
                            className={`shrink-0 px-4 py-1.5 rounded-lg text-sm font-bold transition ${
                              claiming === a.id
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-500 text-white'
                            }`}
                          >
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
      </div>
    </div>
  )
}