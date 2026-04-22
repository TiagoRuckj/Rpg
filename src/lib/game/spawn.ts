import { Enemy, EnemyCombatState } from '@/types/game'
import { EnemyAiConfig } from '@/types/game'
import { initAiState } from '@/lib/game/enemyAi'

// ─── Contador de instancias ───────────────────────────────────────────────────

let instanceCounter = 0
export function nextInstanceId() { return ++instanceCounter }

// ─── Helpers de selección ─────────────────────────────────────────────────────

function pickRandomEnemy(pool: Enemy[]): Enemy {
  return pool[Math.floor(Math.random() * pool.length)]
}

function pickWeightedEnemy(pool: Enemy[], weights?: { id: number; weight: number }[]): Enemy {
  if (!weights || weights.length === 0) return pickRandomEnemy(pool)
  const total = weights.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const w of weights) {
    r -= w.weight
    if (r <= 0) {
      const found = pool.find(e => e.id === w.id)
      if (found) return found
    }
  }
  return pickRandomEnemy(pool)
}

function getSpawnWeights(
  spawnTable: Record<string, { id: number; weight: number }[]> | undefined,
  room: number
): { id: number; weight: number }[] | undefined {
  if (!spawnTable) return undefined
  const keys = Object.keys(spawnTable).map(Number).sort((a, b) => a - b)
  const key = keys.filter(k => k <= room).pop()
  return key !== undefined ? spawnTable[String(key)] : undefined
}

// ─── Builder principal ────────────────────────────────────────────────────────
// aiConfigs es opcional: si se pasa, inicializa aiState por enemy.id

export function buildEnemyCombatStates(
  pool: Enemy[],
  count: number,
  depthMult: number,
  spawnTable?: Record<string, { id: number; weight: number }[]>,
  room?: number,
  aiConfigs?: EnemyAiConfig[],
): EnemyCombatState[] {
  const weights = spawnTable && room ? getSpawnWeights(spawnTable, room) : undefined

  return Array.from({ length: count }, () => {
    const enemy = pickWeightedEnemy(pool, weights)
    const maxHP = Math.round(enemy.stats.hp * depthMult)

    // Buscar config de IA para este enemigo — si no hay, usar dumb por defecto
    const aiConfig = aiConfigs?.find(c => c.entity_type === 'enemy' && c.entity_id === enemy.id)
    const aiState = initAiState(aiConfig?.ai_tier ?? 'dumb', enemy.max_energy)

    return {
      instanceId: nextInstanceId(),
      enemy,
      currentHP: maxHP,
      maxHP,
      alive: true,
      aiState,
      statMults: null,
    }
  })
}

// ─── Builder para un único enemigo invocado (por boss phase) ─────────────────

export function buildSummonedEnemy(
  enemy: Enemy,
  depthMult: number,
  aiConfig?: EnemyAiConfig,
): EnemyCombatState {
  const maxHP = Math.round(enemy.stats.hp * depthMult)
  // Si no hay config, usar dumb por defecto
  const aiState = initAiState(aiConfig?.ai_tier ?? 'dumb', enemy.max_energy)

  return {
    instanceId: nextInstanceId(),
    enemy,
    currentHP: maxHP,
    maxHP,
    alive: true,
    aiState,
    statMults: null,
  }
}