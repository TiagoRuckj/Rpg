'use server'

import { createClient } from '@/lib/supabase/server'
import { calcHealCost } from '@/lib/game/combat'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface HealResult {
  success: boolean
  error?: string
  newHP?: number
  newGold?: number
  cost?: number
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function healAction(maxHP: number): Promise<HealResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('current_hp, gold')
    .eq('id', user.id)
    .single()

  if (fetchError || !player) return { success: false, error: 'No se pudo leer el jugador' }

  const currentHP = player.current_hp ?? maxHP
  const missingHP = maxHP - currentHP
  if (missingHP <= 0) return { success: false, error: 'HP al máximo' }

  const cost = calcHealCost(missingHP)
  if (cost > 0 && player.gold < cost) return { success: false, error: 'Gold insuficiente' }

  const { error: updateError } = await supabase
    .from('players')
    .update({ current_hp: maxHP, gold: player.gold - cost })
    .eq('id', user.id)

  if (updateError) return { success: false, error: 'Error al guardar' }

  return { success: true, newHP: maxHP, newGold: player.gold - cost, cost }
}