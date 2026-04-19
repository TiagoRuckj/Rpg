'use server'

import { createClient } from '@/lib/supabase/server'

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

// ─── Registrar kill y chequear desbloqueos ────────────────────────────────────
export async function registerKillAction(params: {
  enemyTypes: string[]
  hasWeaponEquipped: boolean
  isBossKill: boolean
  dungeonId?: number
}): Promise<{ newlyUnlocked: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newlyUnlocked: [] }

  const { data: player } = await supabase
    .from('players')
    .select('proficiencies, unlocked_classes')
    .eq('id', user.id)
    .single()

  if (!player) return { newlyUnlocked: [] }

  const proficiencies = player.proficiencies ?? {}
  const unlocked: string[] = player.unlocked_classes ?? []
  const newlyUnlocked: string[] = []

  // Actualizar contadores
  const newProf = { ...proficiencies }

  // Kills con espada equipada
  if (params.hasWeaponEquipped) {
    newProf.sword_kills = (newProf.sword_kills ?? 0) + 1
  }

  // Bosses derrotados
  if (params.isBossKill) {
    newProf.bosses_defeated = (newProf.bosses_defeated ?? 0) + 1
  }

  // Kills por tipo de enemigo
  for (const type of params.enemyTypes) {
    const key = `${type}_kills`
    newProf[key] = (newProf[key] ?? 0) + 1
  }

  // Chequear desbloqueos
  // Espadachín: 100 kills con espada
  if (!unlocked.includes('swordsman') && (newProf.sword_kills ?? 0) >= 100) {
    newlyUnlocked.push('swordsman')
  }

  // Asesino de Goblins: matar al boss de la Cueva de Goblins (dungeon_id = 1)
  if (!unlocked.includes('goblin_slayer') && params.isBossKill && params.dungeonId === 1) {
    newlyUnlocked.push('goblin_slayer')
  }

  const newUnlocked = [...unlocked, ...newlyUnlocked]

  await supabase
    .from('players')
    .update({
      proficiencies: newProf,
      unlocked_classes: newUnlocked,
    })
    .eq('id', user.id)

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