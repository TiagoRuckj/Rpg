'use server'

import { createClient } from '@/lib/supabase/server'
import { deriveStatsWithGear, PrimaryStats, EquippedGear, EMPTY_GEAR, Item } from '@/types/game'

/**
 * Devuelve el HP máximo real del jugador incluyendo bonuses de gear equipado.
 * Usado al iniciar el combate para evitar mostrar HP > maxHP antes del primer turno.
 */
export async function getPlayerMaxHPAction(): Promise<number | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: player } = await supabase
    .from('players')
    .select('primary_stats')
    .eq('id', user.id)
    .single()
  if (!player) return null

  const { data: equippedItems } = await supabase
    .from('inventories')
    .select('items!inner(id, type, stats, effect, name, rarity, value, sprite)')
    .eq('player_id', user.id)
    .eq('equipped', true)

  const gear: EquippedGear = { ...EMPTY_GEAR }
  if (equippedItems) {
    for (const entry of equippedItems) {
      const item = (entry as any).items as Item
      if (!item) continue
      switch (item.type) {
        case 'weapon':   gear.weapon = item; break
        case 'necklace': gear.necklace = item; break
        case 'ring':
          if (!gear.ring1) gear.ring1 = item
          else gear.ring2 = item
          break
        case 'armor': {
          const slot = item.stats?.slot
          if (slot && slot in gear) (gear as any)[slot] = item
          break
        }
      }
    }
  }

  const { max_hp } = deriveStatsWithGear(player.primary_stats as PrimaryStats, gear)
  return max_hp
}