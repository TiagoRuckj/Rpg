'use server'

import { createClient } from '@/lib/supabase/server'

interface UseConsumableResult {
  success: boolean
  error?: string
  message?: string
  unlockedSkill?: string
}

export async function useConsumableAction(inventoryEntryId: number): Promise<UseConsumableResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Leer la entrada del inventario con el item
  const { data: entry } = await supabase
    .from('inventories')
    .select('id, player_id, quantity, items!inner(name, type, effect)')
    .eq('id', inventoryEntryId)
    .eq('player_id', user.id)
    .single()

  if (!entry) return { success: false, error: 'Item no encontrado' }

  const item = (entry as any).items
  if (item.type !== 'consumable') return { success: false, error: 'No es un consumible' }
  if (entry.quantity <= 0) return { success: false, error: 'Sin stock' }

  const effect = item.effect ?? {}

  // ── Desbloqueo de skill ──────────────────────────────────────────────────────
  if (effect.unlock_skill) {
    const skillId = effect.unlock_skill

    // Verificar que no la tenga ya
    const { data: player } = await supabase
      .from('players')
      .select('unlocked_skills')
      .eq('id', user.id)
      .single()

    const current: string[] = player?.unlocked_skills ?? []
    if (current.includes(skillId)) {
      return { success: false, error: 'Ya tenés esta habilidad desbloqueada' }
    }

    // Agregar skill al array
    const { error: updateError } = await supabase
      .from('players')
      .update({ unlocked_skills: [...current, skillId] })
      .eq('id', user.id)

    if (updateError) return { success: false, error: updateError.message }

    // Consumir el item
    if (entry.quantity === 1) {
      await supabase.from('inventories').delete().eq('id', inventoryEntryId)
    } else {
      await supabase.from('inventories').update({ quantity: entry.quantity - 1 }).eq('id', inventoryEntryId)
    }

    return {
      success: true,
      message: `✨ ¡Habilidad desbloqueada!`,
      unlockedSkill: skillId,
    }
  }

  return { success: false, error: 'Este consumible no tiene efecto conocido' }
}