'use server'

import { createClient } from '@/lib/supabase/server'
import { PlayerProficiencies, AchievementBonus, EMPTY_ACHIEVEMENT_BONUS } from '@/types/game'

export interface Achievement {
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

export interface AchievementUnlocked {
  achievement: Achievement
  isNew: boolean
}

// Evalúa los logros afectados por las métricas que cambiaron.
// Solo registra como desbloqueados (claimed: false) — NO aplica recompensas.
// Las recompensas se aplican cuando el jugador reclama manualmente.
export async function evaluateAchievements(
  userId: string,
  proficiencies: PlayerProficiencies,
  changedMetrics: (keyof PlayerProficiencies)[],
): Promise<AchievementUnlocked[]> {
  const supabase = await createClient()

  const { data: achievements } = await supabase
    .from('achievements')
    .select('*')
    .in('metric', changedMetrics)

  if (!achievements || achievements.length === 0) return []

  const { data: existing } = await supabase
    .from('player_achievements')
    .select('achievement_id')
    .eq('player_id', userId)

  const existingIds = new Set((existing ?? []).map(u => u.achievement_id))

  const newlyUnlocked = (achievements as Achievement[]).filter(a => {
    if (existingIds.has(a.id)) return false
    const current = proficiencies[a.metric as keyof PlayerProficiencies] ?? 0
    return current >= a.threshold
  })

  if (newlyUnlocked.length === 0) return []

  // Insertar como desbloqueados pero NO reclamados
  await supabase.from('player_achievements').insert(
    newlyUnlocked.map(a => ({ player_id: userId, achievement_id: a.id, claimed: false }))
  )

  return newlyUnlocked.map(a => ({ achievement: a, isNew: true }))
}

// Reclama un logro desbloqueado: aplica la recompensa y marca claimed: true
export async function claimAchievementAction(
  achievementId: number,
): Promise<{ success: boolean; error?: string; newUnlockedClass?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  // Verificar que está desbloqueado y no reclamado
  const { data: pa } = await supabase
    .from('player_achievements')
    .select('claimed')
    .eq('player_id', user.id)
    .eq('achievement_id', achievementId)
    .single()

  if (!pa) return { success: false, error: 'Logro no desbloqueado' }
  if (pa.claimed) return { success: false, error: 'Logro ya reclamado' }

  // Obtener el logro
  const { data: achievement } = await supabase
    .from('achievements')
    .select('*')
    .eq('id', achievementId)
    .single()

  if (!achievement) return { success: false, error: 'Logro no encontrado' }

  let newUnlockedClass: string | undefined

  // Aplicar título
  if (achievement.title_id && (achievement.reward_type === 'title' || achievement.reward_type === 'both')) {
    const { data: player } = await supabase
      .from('players').select('unlocked_classes').eq('id', user.id).single()
    if (player && !player.unlocked_classes.includes(achievement.title_id)) {
      await supabase
        .from('players')
        .update({ unlocked_classes: [...player.unlocked_classes, achievement.title_id] })
        .eq('id', user.id)
      newUnlockedClass = achievement.title_id
    }
  }

  // Aplicar achievement bonus
  if (achievement.reward_type === 'achievement_bonus' || achievement.reward_type === 'both') {
    const { data: player } = await supabase
      .from('players').select('achievement_bonus').eq('id', user.id).single()
    const current: AchievementBonus = player?.achievement_bonus ?? { ...EMPTY_ACHIEVEMENT_BONUS }
    const updated: AchievementBonus = {
      attack:      current.attack      + (achievement.bonus_attack    ?? 0),
      defense:     current.defense     + (achievement.bonus_defense   ?? 0),
      hp:          current.hp          + (achievement.bonus_hp        ?? 0),
      crit_mult:   current.crit_mult   + (achievement.bonus_crit_mult ?? 0),
      gold_pct:    current.gold_pct    + (achievement.bonus_gold_pct  ?? 0),
      type_damage: { ...current.type_damage },
    }
    for (const [type, bonus] of Object.entries(achievement.bonus_type_dmg ?? {})) {
      updated.type_damage[type] = (updated.type_damage[type] ?? 0) + bonus
    }
    await supabase.from('players').update({ achievement_bonus: updated }).eq('id', user.id)
  }

  // Marcar como reclamado
  await supabase
    .from('player_achievements')
    .update({ claimed: true })
    .eq('player_id', user.id)
    .eq('achievement_id', achievementId)

  return { success: true, newUnlockedClass }
}

// Actualiza las proficiencias del jugador e inmediatamente evalúa logros
export async function updateProficienciesAndEvaluate(
  userId: string,
  updates: Partial<PlayerProficiencies>,
  currentProficiencies: PlayerProficiencies,
): Promise<AchievementUnlocked[]> {
  const supabase = await createClient()

  const updated: PlayerProficiencies = { ...currentProficiencies }
  for (const [key, value] of Object.entries(updates)) {
    const k = key as keyof PlayerProficiencies
    if (k === 'biggest_damage') {
      updated[k] = Math.max(updated[k] ?? 0, value as number)
    } else {
      (updated as any)[k] = ((updated as any)[k] ?? 0) + (value as number)
    }
  }

  await supabase.from('players').update({ proficiencies: updated }).eq('id', userId)

  const changedMetrics = Object.keys(updates) as (keyof PlayerProficiencies)[]
  return evaluateAchievements(userId, updated, changedMetrics)
}