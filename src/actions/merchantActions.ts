'use server'

import { createClient } from '@/lib/supabase/server'

const NON_STACKABLE_TYPES = new Set(['weapon', 'armor', 'ring', 'necklace'])

/**
 * Persiste el gold acumulado en el run al jugador antes de procesar una compra.
 * Evita que el mercader rechace compras por gold que el jugador ganó en el run
 * pero aún no está en la DB.
 */
export async function flushRunGoldAction(
  runGold: number,
): Promise<{ success: boolean; error?: string }> {
  if (runGold <= 0) return { success: true }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: player } = await supabase
    .from('players').select('gold').eq('id', user.id).single()
  if (!player) return { success: false, error: 'Jugador no encontrado' }

  const { error } = await supabase
    .from('players')
    .update({ gold: player.gold + runGold })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Compra un item al mercader con precio personalizado.
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

  const { error: goldError } = await supabase
    .from('players')
    .update({ gold: player.gold - price })
    .eq('id', user.id)
  if (goldError) return { success: false, error: goldError.message }

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