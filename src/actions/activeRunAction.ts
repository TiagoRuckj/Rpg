'use server'

import { createClient } from '@/lib/supabase/server'

export async function startRunAction(dungeonId: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('players')
    .update({ active_run: { dungeon_id: dungeonId } })
    .eq('id', user.id)

  if (error) return { error: error.message }
  return { ok: true }
}

export async function clearRunAction(currentHP?: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const updates: Record<string, any> = { active_run: null }
  if (currentHP !== undefined) updates.current_hp = currentHP

  const { error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', user.id)

  if (error) return { error: error.message }
  return { ok: true }
}