import { createClient } from '@/lib/supabase/server'
import { Player, Item, InventoryEntry } from '@/types/game'
import GameClient from './gameClient'

export default async function GamePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Sin usuario — pasar null, el cliente muestra login
  if (!user) {
    return <GameClient player={null} inventory={[]} shopItems={[]} unlockedClasses={[]} activeDungeonId={null} />
  }

  const [
    { data: player },
    { data: inventory },
    { data: shopItems },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('id', user.id).single(),
    supabase.from('inventories').select('*, item:items(*)').eq('player_id', user.id),
    supabase.from('items').select('*').eq('sold_in_shop', true).order('value'),
  ])

  if (!player) {
    return <GameClient player={null} inventory={[]} shopItems={[]} unlockedClasses={[]} activeDungeonId={null} />
  }

  const unlockedIds: string[] = player.unlocked_classes ?? []
  const { data: unlockedClasses } = unlockedIds.length > 0
    ? await supabase
        .from('classes')
        .select('id, name, description, bonuses, unlock_condition')
        .in('id', unlockedIds)
    : { data: [] }

  const activeRun = player.active_run as { dungeon_id: number } | null

  return (
    <GameClient
      player={player as Player}
      inventory={(inventory ?? []) as InventoryEntry[]}
      shopItems={(shopItems ?? []) as Item[]}
      unlockedClasses={unlockedClasses ?? []}
      activeDungeonId={activeRun?.dungeon_id ?? null}
    />
  )
}