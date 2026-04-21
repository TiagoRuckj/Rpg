'use server'

import { createClient } from '@/lib/supabase/server'

const NON_STACKABLE_TYPES = new Set(['weapon', 'armor', 'ring', 'necklace'])

/**
 * Compra un item al mercader con precio personalizado (puede diferir del value en DB).
 * Valida que el jugador tenga suficiente gold, descuenta y agrega al inventario.
 */
export async function buyMerchantItemAction(
  itemId: number,
  price: number,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const [{ data: item }, { data: player }] = await Promise.all([
    supabase.from('items').select('id, type').eq('id', itemId).single(),
    supabase.from('players').select('gold').eq('id', user.id).single(),
  ])

  if (!item)   return { success: false, error: 'Item no encontrado' }
  if (!player) return { success: false, error: 'Jugador no encontrado' }
  if (player.gold < price) return { success: false, error: 'Gold insuficiente' }

  // Descontar gold
  const { error: goldError } = await supabase
    .from('players')
    .update({ gold: player.gold - price })
    .eq('id', user.id)
  if (goldError) return { success: false, error: goldError.message }

  // Agregar al inventario
  const isStackable = !NON_STACKABLE_TYPES.has(item.type)
  if (isStackable) {
    const { data: existing } = await supabase
      .from('inventories')
      .select('id, quantity')
      .eq('player_id', user.id)
      .eq('item_id', itemId)
      .single()

    if (existing) {
      await supabase
        .from('inventories')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('inventories')
        .insert({ player_id: user.id, item_id: itemId, quantity: 1, equipped: false })
    }
  } else {
    await supabase
      .from('inventories')
      .insert({ player_id: user.id, item_id: itemId, quantity: 1, equipped: false })
  }

  return { success: true }
}