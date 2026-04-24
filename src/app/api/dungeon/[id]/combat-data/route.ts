import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Boss, Enemy, EnemyAiConfig } from '@/types/game'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const dungeonId = Number(id)
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    { data: dungeon },
    { data: enemies },
    { data: enemyAiConfigs },
    { data: eventBossesRaw },
    { data: allBosses },
  ] = await Promise.all([
    supabase.from('dungeons').select('*').eq('id', dungeonId).single(),
    supabase.from('enemies').select('*').eq('dungeon_id', dungeonId),
    supabase.from('enemy_ai').select('*'),
    supabase.from('bosses').select('*').eq('dungeon_id', dungeonId).eq('is_event', true),
    supabase.from('bosses').select('*').eq('dungeon_id', dungeonId), // sin filtro is_event
  ])

  if (!dungeon) return NextResponse.json({ error: 'Dungeon not found' }, { status: 404 })

  // Separar boss principal y bosses de evento
  const boss = (allBosses ?? []).find((b: any) => b.is_event === false) ?? (allBosses ?? [])[0]
  if (!boss) return NextResponse.json({ error: 'Boss not found' }, { status: 404 })

  const eventBosses: Boss[] = (eventBossesRaw ?? []) as Boss[]
  for (const eb of eventBosses) {
    if (typeof (eb as any).loot_table === 'string') (eb as any).loot_table = JSON.parse((eb as any).loot_table)
  }
  if (typeof (boss as any).loot_table === 'string') (boss as any).loot_table = JSON.parse((boss as any).loot_table)
  if (!Array.isArray((boss as any).loot_table)) (boss as any).loot_table = []

  const enemyPool: Enemy[] = (enemies && enemies.length > 0)
    ? enemies as Enemy[]
    : [{ id: 0, dungeon_id: dungeonId, name: 'Goblin', stats: { hp: 30, attack: 8, defense: 3 }, loot_table: [{ exp: 10, gold_min: 2, gold_max: 5, item_id: null, item_chance: 0 }], enemy_type: ['goblin'] as any, max_energy: 3 }]

  // Enriquecer loot tables
  const itemIds = [...new Set([
    ...enemyPool.flatMap(e => e.loot_table.map(l => l.item_id)),
    ...((boss as any).loot_table ?? []).map((l: any) => l.item_id),
    ...eventBosses.flatMap(b => ((b.loot_table as any[]) ?? []).map((l: any) => l.item_id)),
  ].filter(Boolean) as number[])]

  if (itemIds.length > 0) {
    const { data: itemNames } = await supabase.from('items').select('id, name, sprite').in('id', itemIds)
    const nameMap   = Object.fromEntries((itemNames ?? []).map((i: any) => [i.id, i.name]))
    const spriteMap = Object.fromEntries((itemNames ?? []).map((i: any) => [i.id, i.sprite]))
    for (const enemy of enemyPool) {
      for (const entry of enemy.loot_table) {
        if (entry.item_id) { entry.item_name = nameMap[entry.item_id]; (entry as any).item_sprite = spriteMap[entry.item_id] }
      }
    }
    for (const entry of (boss as any).loot_table ?? []) {
      if (entry.item_id) { entry.item_name = nameMap[entry.item_id]; entry.item_sprite = spriteMap[entry.item_id] }
    }
    for (const eb of eventBosses) {
      for (const entry of ((eb.loot_table as any[]) ?? [])) {
        if (entry.item_id) { entry.item_name = nameMap[entry.item_id]; entry.item_sprite = spriteMap[entry.item_id] }
      }
    }
  }

  return NextResponse.json({
    dungeon,
    boss,
    enemies: enemyPool,
    aiConfigs: (enemyAiConfigs ?? []) as EnemyAiConfig[],
    eventBosses,
  })
}