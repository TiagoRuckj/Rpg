'use server'

import { createClient } from '@/lib/supabase/server'
import { PlayerProficiencies } from '@/types/game'

const MAX_EQUIPPED_CLASSES = 3

// ─── Equipar / desequipar clase ───────────────────────────────────────────────
export async function toggleClassAction(classId: string): Promise<{
  success: boolean
  error?: string
  equipped_classes?: string[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: player } = await supabase
    .from('players')
    .select('unlocked_classes, equipped_classes')
    .eq('id', user.id)
    .single()

  if (!player) return { success: false, error: 'Jugador no encontrado' }

  const unlocked: string[] = player.unlocked_classes ?? []
  const equipped: string[] = player.equipped_classes ?? []

  if (!unlocked.includes(classId)) {
    return { success: false, error: 'Clase no desbloqueada' }
  }

  let newEquipped: string[]

  if (equipped.includes(classId)) {
    // Desequipar
    newEquipped = equipped.filter(id => id !== classId)
  } else {
    // Equipar — máximo 3
    if (equipped.length >= MAX_EQUIPPED_CLASSES) {
      return { success: false, error: `Máximo ${MAX_EQUIPPED_CLASSES} clases equipadas` }
    }
    newEquipped = [...equipped, classId]
  }

  const { error } = await supabase
    .from('players')
    .update({ equipped_classes: newEquipped })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  return { success: true, equipped_classes: newEquipped }
}

// ─── Registrar kill y evaluar logros ─────────────────────────────────────────
export async function registerKillAction(params: {
  enemyTypes: string[]
  weaponType?: string        // tipo de arma equipada al momento del kill
  isMagicKill?: boolean      // si el kill fue con magia
  isBossKill?: boolean
  dungeonId?: number
  biggestDamage?: number     // daño máximo del golpe que mató al enemigo
  isGoblinKing?: boolean
  isGranGoblin?: boolean
}): Promise<{ newlyUnlocked: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newlyUnlocked: [] }

  const { data: player } = await supabase
    .from('players')
    .select('proficiencies, unlocked_classes, achievement_bonus')
    .eq('id', user.id)
    .single()

  if (!player) return { newlyUnlocked: [] }

  const prof = (player.proficiencies ?? {}) as PlayerProficiencies

  // Construir updates de proficiencias
  const updates: Partial<PlayerProficiencies> = {
    total_kills: 1,
  }

  // Kill por tipo de arma
  if (params.isMagicKill) {
    updates.magic_kills = 1
  } else if (params.weaponType) {
    const weaponKey = `${params.weaponType}_kills` as keyof PlayerProficiencies
    if (weaponKey in prof || ['sword_kills','axe_kills','hammer_kills','bow_kills','spear_kills'].includes(weaponKey)) {
      (updates as any)[weaponKey] = 1
    }
  }

  // Kills por tipo de enemigo
  if (params.enemyTypes.includes('goblin')) updates.goblin_kills = 1

  // Bosses específicos
  if (params.isGoblinKing) updates.goblin_king_defeated = 1
  if (params.isGranGoblin) updates.gran_goblin_defeated = 1

  // Daño máximo
  if (params.biggestDamage && params.biggestDamage > (prof.biggest_damage ?? 0)) {
    updates.biggest_damage = params.biggestDamage
  }

  const { updateProficienciesAndEvaluate } = await import('./achievements')
  const newAchievements = await updateProficienciesAndEvaluate(user.id, updates, prof)

  const newlyUnlocked = newAchievements
    .filter(a => a.achievement.title_id)
    .map(a => a.achievement.title_id!)

  return { newlyUnlocked }
}

// Obtener clases desbloqueadas con datos completos
export async function getUnlockedClassesAction(playerId: string) {
  const supabase = await createClient();

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("unlocked_classes, equipped_classes")
    .eq("id", playerId)
    .single();

  if (playerError || !player) return { success: false, classes: [], equipped: [] };

  const unlockedIds: string[] = player.unlocked_classes ?? [];
  const equippedIds: string[] = player.equipped_classes ?? [];

  if (unlockedIds.length === 0) return { success: true, classes: [], equipped: [] };

  const { data: classes, error: classError } = await supabase
    .from("classes")
    .select("id, name, description, bonuses, unlock_condition")
    .in("id", unlockedIds);

  if (classError) return { success: false, classes: [], equipped: [] };

  return { success: true, classes: classes ?? [], equipped: equippedIds };
}