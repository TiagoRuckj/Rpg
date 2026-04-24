import { Enemy, EnemyCombatState } from './enemy'
import { StatusEffect } from '@/lib/game/statusEffects'

// ─── Dungeons ─────────────────────────────────────────────────────────────────

export type DungeonRank = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S'

export type SpawnWeight = { id: number; weight: number }
export type SpawnTable = Record<string, SpawnWeight[]>

export interface Dungeon {
  id: number
  name: string
  rank: DungeonRank
  rooms: number
  extraction_fee: number
  description: string
  background: string
  spawn_table?: SpawnTable
}

// ─── Eventos de sala intermedia ───────────────────────────────────────────────

export type RoomEventType =
  | 'treasure'
  | 'ambush'
  | 'merchant'
  | 'healing_altar'
  | 'poison_trap'
  | 'cracked_wall'

export interface RoomEvent {
  type: RoomEventType
  resolved: boolean
}

export const EVENT_WEIGHTS: { type: RoomEventType; weight: number }[] = [
  { type: 'treasure',      weight: 3  },
  { type: 'ambush',        weight: 3  },
  { type: 'healing_altar', weight: 2  },
  { type: 'poison_trap',   weight: 2  },
  { type: 'merchant',      weight: 2  },
  { type: 'cracked_wall',  weight: 2  },
]

export function rollRoomEvent(): RoomEvent | null {
  if (Math.random() > 0.25) return null
  const total = EVENT_WEIGHTS.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const e of EVENT_WEIGHTS) {
    r -= e.weight
    if (r <= 0) return { type: e.type, resolved: false }
  }
  return { type: 'cracked_wall', resolved: false }
}

// ─── Run State ────────────────────────────────────────────────────────────────

export type RoomPhase = 'between_rooms' | 'in_combat' | 'boss' | 'results'

export interface AccumulatedLoot {
  exp: number
  gold: number
  items: number[]
}

export interface RunState {
  currentRoom: number
  totalRooms: number
  phase: RoomPhase
  currentEnemy: Enemy | null
  currentEnemies: EnemyCombatState[]
  targetIndex: number
  accumulatedLoot: AccumulatedLoot
  bossDefeated: boolean
  depth: number
  currentEvent: RoomEvent | null
  statusEffects: StatusEffect[]
  bossInstanceId: number | null  // instanceId del boss activo en combate
}

// ─── Fórmulas de dungeon ──────────────────────────────────────────────────────

export function depthMultiplier(depth: number): number {
  if (depth <= 0) return 1.0
  return 1.0 + 0.15 * Math.pow(depth, 1.8)
}

export function rollEnemyCount(room: number, rank: DungeonRank, depth: number): number {
  const rankOrder: Record<DungeonRank, number> = { F: 0, E: 1, D: 2, C: 3, B: 4, A: 5, S: 6 }
  const rankLevel = rankOrder[rank]
  const maxEnemies = Math.min(5, 1 + Math.floor(rankLevel / 2) + Math.floor(depth / 2))
  if (maxEnemies <= 1) return 1
  const baseChance = Math.min(0.85, (room - 1) * 0.12 + rankLevel * 0.08 + depth * 0.06)
  let count = 1
  for (let i = 1; i < maxEnemies; i++) {
    if (Math.random() < baseChance) count++
    else break
  }
  return count
}