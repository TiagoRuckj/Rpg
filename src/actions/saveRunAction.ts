'use server'

import { createClient } from '@/lib/supabase/server'
import { deriveStatsWithGear, PrimaryStats, EquippedGear, EMPTY_GEAR, Item } from '@/types/game'

type RunOutcome = 'victory' | 'extracted' | 'defeat'

interface SaveRunInput {
  outcome: RunOutcome
  exp: number
  gold: number
  items: number[]
  currentHP?: number
}

interface SaveRunResult {
  success: boolean
  error?: string
  newExp?: number
  newGold?: number
  newLevel?: number
}

export async function saveRunAction(input: SaveRunInput): Promise<SaveRunResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'No autorizado' }

  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('experience, gold, level, primary_stats')
    .eq('id', user.id)
    .single()

  if (!player || fetchError) return { success: false, error: 'Jugador no encontrado' }

  // En derrota: solo EXP, sin gold ni items
  const expGained = input.exp
  const goldGained = input.outcome === 'defeat' ? 0 : input.gold
  const itemsToAdd = input.outcome === 'defeat' ? [] : input.items

  const newExp = player.experience + expGained
  const newGold = player.gold + goldGained

  // Fórmula de nivel simple: nivel = floor(exp / 100) + 1, tope 99
  // (esto se va a refinar en el sistema de EXP, por ahora placeholder)
  const newLevel = Math.min(99, Math.floor(newExp / 100) + 1)

  // En derrota el jugador llega al hub con 1 HP
  // En otros casos: clampear al HP máximo real con gear para evitar guardar HP > max
  let savedHP: number | null = null
  if (input.outcome === 'defeat') {
    savedHP = 1
  } else if (input.currentHP !== undefined) {
    // Calcular maxHP con gear para clampear correctamente
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
    savedHP = Math.min(input.currentHP, max_hp)
  }

  // Actualizar player
  const { error: updateError } = await supabase
    .from('players')
    .update({
      experience: newExp,
      gold: newGold,
      level: newLevel,
      current_hp: savedHP,
    })
    .eq('id', user.id)

  if (updateError) return { success: false, error: updateError.message }

  // Items que NO se stackean — cada drop es una fila separada
  const NON_STACKABLE_TYPES = new Set(['weapon', 'armor', 'ring', 'necklace'])

  // Agregar items al inventario (si los hay)
  if (itemsToAdd.length > 0) {
    for (const itemId of itemsToAdd) {
      // Verificar el tipo del item
      const { data: itemData } = await supabase
        .from('items')
        .select('type')
        .eq('id', itemId)
        .single()

      const isStackable = !NON_STACKABLE_TYPES.has(itemData?.type ?? '')

      if (isStackable) {
        // Consumibles/misc: incrementar si ya existe
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
        // Armas/armaduras/accesorios: siempre insertar fila nueva
        await supabase
          .from('inventories')
          .insert({ player_id: user.id, item_id: itemId, quantity: 1, equipped: false })
      }
    }
  }

  return {
    success: true,
    newExp,
    newGold,
    newLevel,
  }
}