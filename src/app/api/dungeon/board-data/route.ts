import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Enemy, Boss } from '@/types/game'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: dungeons } = await supabase.from('dungeons').select('*').order('id')
  const dungeonIds = (dungeons ?? []).map((d: any) => d.id)

  const [{ data: allEnemies }, { data: allBosses }] = await Promise.all([
    supabase.from('enemies').select('*').in('dungeon_id', dungeonIds),
    supabase.from('bosses').select('*').in('dungeon_id', dungeonIds),
  ])

  // Enriquecer loot tables con nombres de items
  const allItemIds = [...new Set([
    ...(allEnemies ?? []).flatMap((e: any) => e.loot_table?.map((l: any) => l.item_id).filter(Boolean) ?? []),
    ...(allBosses  ?? []).flatMap((b: any) => b.loot_table?.map((l: any) => l.item_id).filter(Boolean) ?? []),
  ])] as number[]

  if (allItemIds.length > 0) {
    const { data: items } = await supabase.from('items').select('id, name, sprite').in('id', allItemIds)
    const nameMap   = Object.fromEntries((items ?? []).map((i: any) => [i.id, i.name]))
    const spriteMap = Object.fromEntries((items ?? []).map((i: any) => [i.id, i.sprite]))
    for (const e of (allEnemies ?? [])) {
      for (const entry of (e as any).loot_table ?? []) {
        if (entry.item_id) { entry.item_name = nameMap[entry.item_id]; entry.item_sprite = spriteMap[entry.item_id] }
      }
    }
    for (const b of (allBosses ?? [])) {
      for (const entry of (b as any).loot_table ?? []) {
        if (entry.item_id) { entry.item_name = nameMap[entry.item_id]; entry.item_sprite = spriteMap[entry.item_id] }
      }
    }
  }

  const enemiesByDungeon: Record<number, Enemy[]> = {}
  const bossByDungeon: Record<number, Boss> = {}
  for (const e of (allEnemies ?? [])) {
    if (!enemiesByDungeon[(e as any).dungeon_id]) enemiesByDungeon[(e as any).dungeon_id] = []
    enemiesByDungeon[(e as any).dungeon_id].push(e as Enemy)
  }
  for (const b of (allBosses ?? [])) {
    bossByDungeon[(b as any).dungeon_id] = b as Boss
  }

  return NextResponse.json({ dungeons: dungeons ?? [], enemiesByDungeon, bossByDungeon })
}