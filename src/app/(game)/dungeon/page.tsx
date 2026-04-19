import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Dungeon } from '@/types/game'
import DungeonBoard from './DungeonBoard'

export default async function DungeonPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: dungeons, error } = await supabase
    .from('dungeons')
    .select('*')
    .order('id')

  console.log('dungeons:', dungeons)
  console.log('error:', error)

  return <DungeonBoard dungeons={(dungeons ?? []) as Dungeon[]} />
}