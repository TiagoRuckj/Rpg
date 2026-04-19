import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Player, Dungeon, Boss, Enemy } from '@/types/game'
import CombatClient from './CombatClient'

export default async function DungeonRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!player) redirect('/login')

  // Verificar que el jugador inició este run desde el tablero
  const activeRun = player.active_run as { dungeon_id: number } | null
  if (!activeRun || activeRun.dungeon_id !== Number(id)) {
    redirect('/dungeon')
  }

  const { data: dungeon } = await supabase
    .from('dungeons')
    .select('*')
    .eq('id', id)
    .single()

  if (!dungeon) redirect('/dungeon')

  const { data: boss } = await supabase
    .from('bosses')
    .select('*')
    .eq('dungeon_id', id)
    .single()

  if (!boss) redirect('/dungeon')

  // Pool de enemigos para las salas previas al boss
  const { data: enemies } = await supabase
    .from('enemies')
    .select('*')
    .eq('dungeon_id', id)

  const enemyPool: Enemy[] = (enemies && enemies.length > 0)
    ? enemies as Enemy[]
    : [{
        id: 0,
        dungeon_id: Number(id),
        name: 'Goblin',
        stats: { hp: 30, max_hp: 30, attack: 8, defense: 3 },
        loot_table: [{ exp: 10, gold_min: 2, gold_max: 5, item_id: null, item_chance: 0 }],
        enemy_type: ['goblin'] as import('@/types/game').EnemyType[],
      }]

  // Enriquecer loot_tables (enemies + boss) con nombres de items
  const itemIds = [...new Set([
    ...enemyPool.flatMap(e => e.loot_table.map(l => l.item_id)),
    ...(boss?.loot_table ?? []).map((l: any) => l.item_id),
  ].filter(Boolean) as number[])]

  if (itemIds.length > 0) {
    const { data: itemNames } = await supabase
      .from('items')
      .select('id, name')
      .in('id', itemIds)

    const nameMap = Object.fromEntries((itemNames ?? []).map(i => [i.id, i.name]))

    for (const enemy of enemyPool) {
      for (const entry of enemy.loot_table) {
        if (entry.item_id) entry.item_name = nameMap[entry.item_id]
      }
    }
    for (const entry of (boss as any)?.loot_table ?? []) {
      if (entry.item_id) entry.item_name = nameMap[entry.item_id]
    }
  }

  return (
    <CombatClient
      player={player as Player}
      dungeon={dungeon as Dungeon}
      boss={boss as Boss}
      enemies={enemyPool}
    />
  )
}