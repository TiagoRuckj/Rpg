import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Player, Dungeon, Boss, Enemy, EnemyAiConfig } from '@/types/game'
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
  .eq('is_event', false)
  .single()
  if (!boss) redirect('/dungeon')

  const { data: enemies } = await supabase
    .from('enemies')
    .select('*')
    .eq('dungeon_id', id)

  // Cargar configs de IA de los enemigos y bosses del dungeon
  const { data: enemyAiConfigs } = await supabase
    .from('enemy_ai')
    .select('*')

  const aiConfigs: EnemyAiConfig[] = (enemyAiConfigs ?? []) as EnemyAiConfig[]
  console.log('[PAGE] aiConfigs cargados desde DB', {
    total: aiConfigs.length,
    detalle: aiConfigs.map(c => ({ id: c.id, entity_type: c.entity_type, entity_id: c.entity_id, tier: c.ai_tier })),
  })

  const enemyPool: Enemy[] = (enemies && enemies.length > 0)
    ? enemies as Enemy[]
    : [{
        id: 0,
        dungeon_id: Number(id),
        name: 'Goblin',
        stats: { hp: 30, attack: 8, defense: 3 },
        loot_table: [{ exp: 10, gold_min: 2, gold_max: 5, item_id: null, item_chance: 0 }],
        enemy_type: ['goblin'] as import('@/types/game').EnemyType[],
        max_energy: 3,
      }]

  // Cargar bosses de evento del dungeon
  const { data: eventBossesRaw } = await supabase
    .from('bosses')
    .select('*')
    .eq('dungeon_id', id)
    .eq('is_event', true)
  const eventBosses: Boss[] = (eventBossesRaw ?? []) as Boss[]

  // Parsear loot_tables que puedan venir como string JSON desde Supabase
  for (const eventBoss of eventBosses) {
    if (typeof eventBoss.loot_table === 'string') {
      ;(eventBoss as any).loot_table = JSON.parse(eventBoss.loot_table)
    }
  }
  if (typeof (boss as any).loot_table === 'string') {
    ;(boss as any).loot_table = JSON.parse((boss as any).loot_table)
  }

  // Enriquecer loot_tables (enemies + boss + eventBosses) con nombres de items
  const itemIds = [...new Set([
    ...enemyPool.flatMap(e => e.loot_table.map(l => l.item_id)),
    ...(boss?.loot_table ?? []).map((l: any) => l.item_id),
    ...eventBosses.flatMap(b => (b.loot_table as any[]).map((l: any) => l.item_id)),
  ].filter(Boolean) as number[])]

  if (itemIds.length > 0) {
    const { data: itemNames } = await supabase
      .from('items')
      .select('id, name, sprite')
      .in('id', itemIds)

    const nameMap   = Object.fromEntries((itemNames ?? []).map(i => [i.id, i.name]))
    const spriteMap = Object.fromEntries((itemNames ?? []).map(i => [i.id, i.sprite]))

    for (const enemy of enemyPool) {
      for (const entry of enemy.loot_table) {
        if (entry.item_id) {
          entry.item_name   = nameMap[entry.item_id]
          ;(entry as any).item_sprite = spriteMap[entry.item_id]
        }
      }
    }
    for (const entry of (boss as any).loot_table ?? []) {
      if (entry.item_id) {
        entry.item_name   = nameMap[entry.item_id]
        entry.item_sprite = spriteMap[entry.item_id]
      }
    }
    for (const eventBoss of eventBosses) {
      for (const entry of (eventBoss.loot_table as any[]) ?? []) {
        if (entry.item_id) {
          entry.item_name   = nameMap[entry.item_id]
          entry.item_sprite = spriteMap[entry.item_id]
        }
      }
    }
  }

  return (
    <CombatClient
      player={player as Player}
      dungeon={dungeon as Dungeon}
      boss={boss as Boss}
      enemies={enemyPool}
      aiConfigs={aiConfigs}
      eventBosses={eventBosses}
    />
  )
}