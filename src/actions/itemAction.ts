'use server'

import { createClient } from '@/lib/supabase/server'
import { Item, InventoryEntry } from '@/types/game'

// Devuelve los consumibles disponibles en el inventario del jugador
export async function getConsumablesAction(): Promise<{ items: (InventoryEntry & { item: Item })[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { items: [] }

  const { data } = await supabase
    .from('inventories')
    .select('id, player_id, item_id, quantity, equipped, items!inner(id, name, type, rarity, stats, effect, value, sprite)')
    .eq('player_id', user.id)
    .eq('equipped', false)
    .gt('quantity', 0)

  if (!data) return { items: [] }

  const consumables = data
    .filter((e: any) => e.items?.type === 'consumable')
    .map((e: any) => ({ ...e, item: e.items })) as (InventoryEntry & { item: Item })[]

  return { items: consumables }
}

interface UseItemResult {
  success: boolean
  error?: string
  healHP: number
  healStamina: number
  healMana: number
  itemName: string
}

// Usa un consumible: descuenta 1 del inventario y devuelve cuánto cura
export async function useItemAction(inventoryEntryId: number): Promise<UseItemResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado', healHP: 0, healStamina: 0, healMana: 0, itemName: '' }

  // Leer la entrada del inventario con el item
  const { data: entry } = await supabase
    .from('inventories')
    .select('id, player_id, quantity, items!inner(name, type, effect)')
    .eq('id', inventoryEntryId)
    .eq('player_id', user.id)
    .single()

  if (!entry) return { success: false, error: 'Item no encontrado', healHP: 0, healStamina: 0, healMana: 0, itemName: '' }

  const item = (entry as any).items
  if (item.type !== 'consumable') return { success: false, error: 'No es un consumible', healHP: 0, healStamina: 0, healMana: 0, itemName: '' }
  if (entry.quantity <= 0) return { success: false, error: 'Sin stock', healHP: 0, healStamina: 0, healMana: 0, itemName: '' }

  // Descontar 1 del inventario (o eliminar si quantity llega a 0)
  if (entry.quantity === 1) {
    await supabase.from('inventories').delete().eq('id', inventoryEntryId)
  } else {
    await supabase.from('inventories').update({ quantity: entry.quantity - 1 }).eq('id', inventoryEntryId)
  }

  const effect = item.effect ?? {}
  return {
    success: true,
    healHP:      effect.heal_hp      ?? 0,
    healStamina: effect.heal_stamina ?? 0,
    healMana:    effect.heal_mana    ?? 0,
    itemName:    item.name,
  }
}