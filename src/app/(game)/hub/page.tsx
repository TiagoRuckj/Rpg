import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Player, Item, InventoryEntry, PrimaryStats, deriveStats } from '@/types/game'
import HubClient from './HubClient'

export default async function HubPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!player) redirect('/login')

  // ── Curación automática al volver del dungeon ─────────────────────────────
  let healingCost = 0
  let healingMessage: string | null = null

  if (player.current_hp !== null && player.current_hp !== undefined) {
    const primary = player.primary_stats as PrimaryStats
    const derived = deriveStats(primary)
    const maxHP = derived.max_hp
    const currentHP = player.current_hp as number

    if (currentHP < maxHP) {
      const hpMissing = maxHP - currentHP
      const freeHealing = Math.min(hpMissing, 100)           // primeros 100 HP gratis
      const paidHPMissing = Math.max(0, hpMissing - 100)     // lo que excede los 100
      healingCost = paidHPMissing * 2                         // 2 gold por punto

      const newGold = Math.max(0, player.gold - healingCost)

      await supabase
        .from('players')
        .update({ current_hp: null, gold: newGold })
        .eq('id', user.id)

      player.gold = newGold

      if (healingCost > 0) {
        healingMessage = `🏥 Curación completa — primeros 100 HP gratis, ${paidHPMissing} HP adicionales por ${healingCost} gold`
      } else {
        healingMessage = `🏥 Curación completa — ${freeHealing} HP restaurados gratis`
      }
    } else {
      // Ya tenía HP completo, limpiar el campo
      await supabase.from('players').update({ current_hp: null }).eq('id', user.id)
    }
  }

  // Inventario con join a items
  const { data: inventory } = await supabase
    .from('inventories')
    .select('*, item:items(*)')
    .eq('player_id', user.id)

  // Items de la tienda
  const { data: shopItems } = await supabase
    .from('items')
    .select('*')
    .eq('sold_in_shop', true)
    .order('value')

  // Clases desbloqueadas por el jugador
  const unlockedIds: string[] = player.unlocked_classes ?? []
  const { data: unlockedClasses } = unlockedIds.length > 0
    ? await supabase
        .from('classes')
        .select('id, name, description, bonuses, unlock_condition')
        .in('id', unlockedIds)
    : { data: [] }

  return (
    <HubClient
      player={player as Player}
      inventory={(inventory ?? []) as InventoryEntry[]}
      shopItems={(shopItems ?? []) as Item[]}
      unlockedClasses={unlockedClasses ?? []}
      healingMessage={healingMessage}
    />
  )
}