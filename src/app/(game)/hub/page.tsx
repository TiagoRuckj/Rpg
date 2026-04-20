import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Player, Item, InventoryEntry } from '@/types/game'
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
    />
  )
}