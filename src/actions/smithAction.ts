'use server'

import { createClient } from '@/lib/supabase/server'
import { UPGRADE_REQUIREMENTS, calcUpgradeBonus, calcUpgradeGoldCost } from '@/types/game'

interface SmithUpgradeInput {
  inventoryEntryId: number  // ID en inventories del arma a mejorar
}

interface SmithUpgradeResult {
  success: boolean
  error?: string
  newUpgradeLevel?: number
  newAttack?: number
  goldCost?: number
}

export async function smithUpgradeAction(input: SmithUpgradeInput): Promise<SmithUpgradeResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  // Obtener el arma a mejorar
  const { data: entry, error: entryErr } = await supabase
    .from('inventories')
    .select('id, player_id, item_id, upgrade_level, items!inner(id, name, type, stats)')
    .eq('id', input.inventoryEntryId)
    .eq('player_id', user.id)
    .single()

  if (entryErr || !entry) return { success: false, error: 'Arma no encontrada' }

  const item = (entry as any).items
  if (item.type !== 'weapon') return { success: false, error: 'Solo se pueden mejorar armas' }

  const currentLevel = entry.upgrade_level ?? 0
  const nextLevel = currentLevel + 1

  if (nextLevel > 5) return { success: false, error: 'El arma ya está al nivel máximo (+5)' }

  const requirements = UPGRADE_REQUIREMENTS[nextLevel]
  if (!requirements) return { success: false, error: `Mejora +${nextLevel} no disponible aún` }

  // Obtener gold y materiales del jugador
  const { data: player } = await supabase
    .from('players')
    .select('gold')
    .eq('id', user.id)
    .single()

  if (!player) return { success: false, error: 'Jugador no encontrado' }
  const goldCost = calcUpgradeGoldCost(item.value ?? 0, nextLevel)
  if (player.gold < goldCost) {
    return { success: false, error: `Necesitás ${goldCost} gold` }
  }

  // Verificar que tiene todos los materiales
  for (const mat of requirements.materials) {
    if (mat.itemId === 0) continue
    const { data: inv } = await supabase
      .from('inventories')
      .select('quantity')
      .eq('player_id', user.id)
      .eq('item_id', mat.itemId)
      .single()

    if (!inv || inv.quantity < mat.quantity) {
      return { success: false, error: `Materiales insuficientes` }
    }
  }

  // Consumir gold
  const { error: goldErr } = await supabase
    .from('players')
    .update({ gold: player.gold - goldCost })
    .eq('id', user.id)

  if (goldErr) return { success: false, error: 'Error al consumir gold' }

  // Consumir materiales
  for (const mat of requirements.materials) {
    if (mat.itemId === 0) continue
    const { data: inv } = await supabase
      .from('inventories')
      .select('id, quantity')
      .eq('player_id', user.id)
      .eq('item_id', mat.itemId)
      .single()

    if (!inv) continue
    if (inv.quantity - mat.quantity <= 0) {
      await supabase.from('inventories').delete().eq('id', inv.id)
    } else {
      await supabase.from('inventories').update({ quantity: inv.quantity - mat.quantity }).eq('id', inv.id)
    }
  }

  // Aplicar mejora
  const { error: upgradeErr } = await supabase
    .from('inventories')
    .update({ upgrade_level: nextLevel })
    .eq('id', input.inventoryEntryId)

  if (upgradeErr) return { success: false, error: 'Error al aplicar la mejora' }

  const baseAttack = item.stats?.attack ?? 0
  const newAttack = baseAttack + calcUpgradeBonus(baseAttack, nextLevel)

  return { success: true, newUpgradeLevel: nextLevel, newAttack, goldCost }
}

// ─── Engastar pasiva ──────────────────────────────────────────────────────────

interface SmithEngraftInput {
  inventoryEntryId: number  // item a engastar
  crystalInventoryId: number // ID de la fila en inventories del cristal
}

interface SmithEngraftResult {
  success: boolean
  error?: string
  newInstancePassives?: string[]
}

export async function smithEngraftAction(input: SmithEngraftInput): Promise<SmithEngraftResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  // Obtener el cristal y su preset_passive
  const { data: crystalEntry } = await supabase
    .from('inventories')
    .select('id, quantity, items!inner(stats)')
    .eq('id', input.crystalInventoryId)
    .eq('player_id', user.id)
    .single()

  if (!crystalEntry || crystalEntry.quantity < 1) {
    return { success: false, error: 'No tenés ese cristal' }
  }

  const crystalStats = (crystalEntry as any).items?.stats
  const passiveId: string | undefined = crystalStats?.preset_passive
  if (!passiveId) return { success: false, error: 'Cristal sin pasiva configurada' }

  // Obtener el item a engastar
  const { data: entry } = await supabase
    .from('inventories')
    .select('id, skill_slots, instance_passives')
    .eq('id', input.inventoryEntryId)
    .eq('player_id', user.id)
    .single()

  if (!entry) return { success: false, error: 'Item no encontrado' }

  const currentPassives: string[] = (entry as any).instance_passives ?? []
  const skillSlots: number = (entry as any).skill_slots ?? 0

  if (currentPassives.length >= skillSlots) {
    return { success: false, error: 'No hay ranuras disponibles' }
  }
  if (currentPassives.includes(passiveId)) {
    return { success: false, error: 'Esta pasiva ya está engastada' }
  }

  // Consumir cristal
  if (crystalEntry.quantity <= 1) {
    await supabase.from('inventories').delete().eq('id', crystalEntry.id)
  } else {
    await supabase.from('inventories').update({ quantity: crystalEntry.quantity - 1 }).eq('id', crystalEntry.id)
  }

  // Engastar pasiva
  const newPassives = [...currentPassives, passiveId]
  const { error } = await supabase
    .from('inventories')
    .update({ instance_passives: newPassives })
    .eq('id', input.inventoryEntryId)

  if (error) return { success: false, error: 'Error al engastar la pasiva' }

  return { success: true, newInstancePassives: newPassives }
}