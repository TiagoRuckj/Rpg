'use server'

import { createClient } from '@/lib/supabase/server'
import { rollSkillSlots } from '@/types/game'

// Items que NO se stackean — cada compra es una fila separada en inventario
const NON_STACKABLE_TYPES = new Set(['weapon', 'armor', 'ring', 'necklace'])

// ─── Comprar item ─────────────────────────────────────────────────────────────
export async function buyItemAction(itemId: number): Promise<{ success: boolean; error?: string; inventoryId?: number; newQuantity?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Leer item y gold del jugador en paralelo
  const [{ data: item }, { data: player }] = await Promise.all([
    supabase.from('items').select('id, value, type').eq('id', itemId).single(),
    supabase.from('players').select('gold').eq('id', user.id).single(),
  ])

  if (!item) return { success: false, error: 'Item no encontrado' }
  if (!player) return { success: false, error: 'Jugador no encontrado' }
  if (player.gold < item.value) return { success: false, error: 'Gold insuficiente' }

  // Descontar gold
  const { error: goldError } = await supabase
    .from('players')
    .update({ gold: player.gold - item.value })
    .eq('id', user.id)

  if (goldError) return { success: false, error: goldError.message }

  const isStackable = !NON_STACKABLE_TYPES.has(item.type)

  // Stackeables (consumibles, misc): incrementar si ya existe
  if (isStackable) {
    const { data: existing } = await supabase
      .from('inventories')
      .select('id, quantity')
      .eq('player_id', user.id)
      .eq('item_id', itemId)
      .single()

    if (existing) {
      const { error: updateError } = await supabase
        .from('inventories')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id)
      if (updateError) return { success: false, error: updateError.message }
      return { success: true, inventoryId: existing.id, newQuantity: existing.quantity + 1 }
    }
  }

  // No stackeables o stackeable sin entrada previa: insertar fila nueva
  const { data: inserted, error: insertError } = await supabase
    .from('inventories')
    .insert({
      player_id: user.id,
      item_id: itemId,
      quantity: 1,
      equipped: false,
      skill_slots: isStackable ? 0 : rollSkillSlots(),
    })
    .select('id')
    .single()
  if (insertError) return { success: false, error: insertError.message }
  return { success: true, inventoryId: inserted.id, newQuantity: 1 }
}

// ─── Equipar / desequipar item ────────────────────────────────────────────────
// Mapea un item a su slot único (para desequipar el anterior del mismo slot)
function getItemSlotKey(type: string, slot?: string): string {
  if (type === 'weapon') return 'weapon'
  if (type === 'armor') return `armor_${slot ?? 'chest'}`
  if (type === 'necklace') return 'necklace'
  if (type === 'ring') return 'ring' // rings se manejan aparte (hay 2)
  return type
}

export async function equipItemAction(
  inventoryId: number,
  itemType: string,
  itemSlot?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Verificar que el item pertenece al jugador
  const { data: entry } = await supabase
    .from('inventories')
    .select('id, equipped, item_id')
    .eq('id', inventoryId)
    .eq('player_id', user.id)
    .single()

  if (!entry) return { success: false, error: 'Item no encontrado en inventario' }

  const NON_EQUIPPABLE = new Set(['consumable', 'material'])
  if (NON_EQUIPPABLE.has(itemType)) return { success: false, error: 'Este item no se puede equipar' }

  const isEquipping = !entry.equipped

  // Si equipamos, desequipar el item del mismo slot (excepto rings que son 2)
  if (isEquipping && itemType !== 'ring') {
    const { data: allEquipped } = await supabase
      .from('inventories')
      .select('id, items!inner(type, stats)')
      .eq('player_id', user.id)
      .eq('equipped', true)
      .eq('items.type', itemType)

    if (allEquipped && allEquipped.length > 0) {
      // Para armaduras, desequipar solo el del mismo slot
      const toUnequip = itemType === 'armor'
        ? allEquipped.filter((e: any) => e.items?.stats?.slot === itemSlot)
        : allEquipped

      if (toUnequip.length > 0) {
        await supabase
          .from('inventories')
          .update({ equipped: false })
          .in('id', toUnequip.map((i: any) => i.id))
      }
    }
  }

  // Toggle equipped del item actual
  const { error } = await supabase
    .from('inventories')
    .update({ equipped: isEquipping })
    .eq('id', inventoryId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─── Usar consumible en combate ───────────────────────────────────────────────
interface UseItemResult {
  success: boolean
  error?: string
  healAmount?: number
  newQuantity?: number
}

export async function useConsumableAction(inventoryId: number): Promise<UseItemResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: entry } = await supabase
    .from('inventories')
    .select('id, quantity, items(effect)')
    .eq('id', inventoryId)
    .eq('player_id', user.id)
    .single()

  if (!entry || entry.quantity <= 0) return { success: false, error: 'Item no disponible' }

  const itemData = (entry as any).items as { effect?: { heal_hp?: number } } | null
  const healAmount = itemData?.effect?.heal_hp ?? 0

  // Decrementar cantidad
  const newQuantity = entry.quantity - 1
  if (newQuantity === 0) {
    await supabase.from('inventories').delete().eq('id', inventoryId)
  } else {
    await supabase.from('inventories').update({ quantity: newQuantity }).eq('id', inventoryId)
  }

  return { success: true, healAmount, newQuantity }
}

// ─── Vender item ──────────────────────────────────────────────────────────────
export async function sellItemAction(inventoryId: number): Promise<{ success: boolean; error?: string; goldGained?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: entry } = await supabase
    .from('inventories')
    .select('id, equipped, quantity, items(value, type)')
    .eq('id', inventoryId)
    .eq('player_id', user.id)
    .single()

  if (!entry) return { success: false, error: 'Item no encontrado' }
  if (entry.equipped) return { success: false, error: 'No podés vender un item equipado' }

  const itemValue = (entry as any).items?.value ?? 0
  const itemType  = (entry as any).items?.type  ?? 'consumable'
  const sellPrice = Math.floor(itemValue * 0.5)
  const isStackable = !NON_STACKABLE_TYPES.has(itemType)

  // No-stackeables: eliminar siempre la fila. Stackeables: reducir quantity.
  if (!isStackable || entry.quantity <= 1) {
    const { error } = await supabase.from('inventories').delete().eq('id', inventoryId)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('inventories').update({ quantity: entry.quantity - 1 }).eq('id', inventoryId)
    if (error) return { success: false, error: error.message }
  }

  const { data: player } = await supabase.from('players').select('gold').eq('id', user.id).single()
  if (!player) return { success: false, error: 'Jugador no encontrado' }

  await supabase.from('players').update({ gold: player.gold + sellPrice }).eq('id', user.id)

  return { success: true, goldGained: sellPrice }
}
// ─── Carrito de compra ────────────────────────────────────────────────────────
// cart: { itemId → quantity }
export async function buyCartAction(
  cart: Record<number, number>
): Promise<{ success: boolean; error?: string; goldSpent: number; freshInventory?: any[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado', goldSpent: 0 }

  const itemIds = Object.keys(cart).map(Number)
  if (itemIds.length === 0) return { success: false, error: 'Carrito vacío', goldSpent: 0 }

  // Leer items, gold y inventario existente en paralelo
  const [{ data: items }, { data: player }, { data: existingInventory }] = await Promise.all([
    supabase.from('items').select('id, value, type').in('id', itemIds),
    supabase.from('players').select('gold').eq('id', user.id).single(),
    supabase.from('inventories').select('id, item_id, quantity')
      .eq('player_id', user.id).in('item_id', itemIds),
  ])

  if (!items || !player) return { success: false, error: 'Error al leer datos', goldSpent: 0 }

  const total = items.reduce((sum, item) => sum + item.value * (cart[item.id] ?? 0), 0)
  if (player.gold < total) return { success: false, error: 'Gold insuficiente', goldSpent: 0 }

  // Separar stackeables y no-stackeables
  const stackableItems = items.filter(i => !NON_STACKABLE_TYPES.has(i.type))
  const nonStackableItems = items.filter(i => NON_STACKABLE_TYPES.has(i.type))

  const existingMap = new Map((existingInventory ?? []).map(e => [e.item_id, e]))

  // Preparar todas las operaciones de inventario
  const inventoryOps: Promise<unknown>[] = []

  // Stackeables: update o insert en paralelo
  for (const item of stackableItems) {
    const qty = cart[item.id] ?? 0
    if (qty === 0) continue
    const existing = existingMap.get(item.id)
    if (existing) {
      inventoryOps.push(
        Promise.resolve(supabase.from('inventories')
          .update({ quantity: existing.quantity + qty })
          .eq('id', existing.id))
      )
    } else {
      inventoryOps.push(
        Promise.resolve(supabase.from('inventories')
          .insert({ player_id: user.id, item_id: item.id, quantity: qty, equipped: false }))
      )
    }
  }

  // No-stackeables: un insert batch por tipo
  const nonStackableRows = nonStackableItems.flatMap(item =>
    Array.from({ length: cart[item.id] ?? 0 }, () => ({
      player_id: user.id, item_id: item.id, quantity: 1, equipped: false, skill_slots: rollSkillSlots(),
    }))
  )
  if (nonStackableRows.length > 0) {
    inventoryOps.push(Promise.resolve(supabase.from('inventories').insert(nonStackableRows)))
  }

  // Descontar gold + todas las ops de inventario en paralelo
  await Promise.all([
    Promise.resolve(supabase.from('players').update({ gold: player.gold - total }).eq('id', user.id)),
    ...inventoryOps,
  ])

  // Leer inventario actualizado para devolver IDs reales
  const { data: freshInventory } = await supabase
    .from('inventories')
    .select('id, player_id, item_id, quantity, equipped, locked, upgrade_level, skill_slots, instance_passives, items!inner(id, name, type, rarity, stats, effect, value, sprite)')
    .eq('player_id', user.id)

  return { success: true, goldSpent: total, freshInventory: freshInventory ?? [] }
}

// ─── Bloquear / desbloquear item ─────────────────────────────────────────────

export async function toggleLockAction(
  inventoryId: number,
  locked: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('inventories')
    .update({ locked })
    .eq('id', inventoryId)
    .eq('player_id', user.id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
// cart: { inventoryId → quantity }
export async function sellCartAction(
  cart: Record<number, number>
): Promise<{ success: boolean; error?: string; goldGained: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado', goldGained: 0 }

  const entryIds = Object.keys(cart).map(Number)
  if (entryIds.length === 0) return { success: false, error: 'Carrito vacío', goldGained: 0 }

  // Leer entradas de inventario y gold en paralelo
  const [{ data: entries }, { data: player }] = await Promise.all([
    supabase.from('inventories')
      .select('id, equipped, locked, quantity, items(value, type)')
      .in('id', entryIds)
      .eq('player_id', user.id),
    supabase.from('players').select('gold').eq('id', user.id).single(),
  ])

  if (!entries || !player) return { success: false, error: 'Error al leer datos', goldGained: 0 }

  const equipped = entries.find(e => e.equipped)
  if (equipped) return { success: false, error: 'No podés vender items equipados', goldGained: 0 }

  const locked = entries.find(e => (e as any).locked)
  if (locked) return { success: false, error: 'No podés vender items bloqueados', goldGained: 0 }

  // Calcular gold total
  const totalGold = entries.reduce((sum, entry) => {
    const qty = cart[entry.id] ?? 0
    const value = (entry as any).items?.value ?? 0
    return sum + Math.floor(value * 0.5) * qty
  }, 0)

  // Separar filas a eliminar vs actualizar
  const toDelete: number[] = []
  const toUpdate: { id: number; quantity: number }[] = []

  for (const entry of entries) {
    const qty = cart[entry.id] ?? 0
    const itemType = (entry as any).items?.type ?? 'consumable'
    const isStackable = !NON_STACKABLE_TYPES.has(itemType)
    if (!isStackable || entry.quantity <= qty) {
      toDelete.push(entry.id)
    } else {
      toUpdate.push({ id: entry.id, quantity: entry.quantity - qty })
    }
  }

  // Todas las operaciones en paralelo
  await Promise.all([
    Promise.resolve(supabase.from('players').update({ gold: player.gold + totalGold }).eq('id', user.id)),
    toDelete.length > 0
      ? Promise.resolve(supabase.from('inventories').delete().in('id', toDelete))
      : Promise.resolve(),
    ...toUpdate.map(({ id, quantity }) =>
      Promise.resolve(supabase.from('inventories').update({ quantity }).eq('id', id))
    ),
  ])

  return { success: true, goldGained: totalGold }
}