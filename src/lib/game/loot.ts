// ─── Sistema de loot ─────────────────────────────────────────────────────────
//
// Funciones puras para resolver drops de enemigos y bosses.
// Sin side effects, sin dependencias de store ni de React.

import { Enemy, Boss } from '@/types/game'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EnemyLootResult {
  exp: number
  gold: number
  itemId: number | null
  itemName: string | null
  itemSprite: string | null
}

export interface BossLootResult {
  items: number[]                                    // ids de items dropeados
  itemDetails: { id: number; name: string; sprite: string }[]  // para mostrar en UI
  exp: number
  gold: number
}

// ─── Resolución de loot de enemigo normal ────────────────────────────────────

export function resolveEnemyLoot(
  enemy: Enemy,
  luckMultiplier: number = 1,  // depthMult u otro modificador de suerte
): EnemyLootResult {
  if (!enemy.loot_table || enemy.loot_table.length === 0) {
    return { exp: 0, gold: 0, itemId: null, itemName: null, itemSprite: null }
  }

  // Primera entrada determina exp y gold
  const primary = enemy.loot_table[0]
  const gold = primary.gold_min + Math.floor(Math.random() * (primary.gold_max - primary.gold_min + 1))
  const exp = primary.exp

  // Tirar drop para cada entrada con item_id
  let itemId: number | null = null
  let itemName: string | null = null
  let itemSprite: string | null = null

  for (const entry of enemy.loot_table) {
    if (entry.item_id === null) continue
    const adjustedChance = Math.min(0.95, entry.item_chance * luckMultiplier)
    if (Math.random() < adjustedChance) {
      itemId = entry.item_id
      itemName = (entry as any).item_name ?? null
      itemSprite = (entry as any).item_sprite ?? null
      break  // un solo item por enemigo
    }
  }

  return { exp, gold, itemId, itemName, itemSprite }
}

// ─── Resolución de loot de boss ───────────────────────────────────────────────

export function resolveBossLoot(
  boss: Boss,
  baseExp: number = 100,
  baseGold: number = 50,
): BossLootResult {
  const items: number[] = []
  const itemDetails: { id: number; name: string; sprite: string }[] = []
  let totalExp = baseExp
  let totalGold = baseGold

  for (const entry of boss.loot_table ?? []) {
    // Leer exp y gold de la entrada si están definidos
    if ((entry as any).exp !== undefined) totalExp = (entry as any).exp
    if ((entry as any).gold_min !== undefined && (entry as any).gold_max !== undefined) {
      const min = (entry as any).gold_min
      const max = (entry as any).gold_max
      totalGold = min + Math.floor(Math.random() * (max - min + 1))
    }
    if (!entry.item_id) continue
    if (Math.random() < entry.chance) {
      items.push(entry.item_id)
      itemDetails.push({
        id: entry.item_id,
        name: (entry as any).item_name ?? `Item #${entry.item_id}`,
        sprite: (entry as any).item_sprite ?? '',
      })
    }
  }

  return { items, itemDetails, exp: totalExp, gold: totalGold }
}