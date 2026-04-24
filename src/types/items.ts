import { PrimaryStats, PlayerStats, deriveStats } from './player'

// ─── Items ────────────────────────────────────────────────────────────────────

export type WeaponType = 'sword' | 'axe' | 'hammer' | 'spear' | 'staff' | 'bow' | 'none'
export type ItemType = 'weapon' | 'armor' | 'consumable' | 'ring' | 'necklace' | 'material'
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type ArmorSlot = 'helmet' | 'chest' | 'gloves' | 'pants' | 'boots'

export interface ItemStats {
  attack?: number
  defense?: number
  hp_bonus?: number
  crit_chance?: number
  slot?: ArmorSlot
  weapon_type?: WeaponType
  passives?: string[]
}

export interface ItemEffect {
  heal_hp?: number
  heal_stamina?: number
  heal_mana?: number
}

export interface Item {
  id: number
  name: string
  type: ItemType
  rarity: ItemRarity
  stats: ItemStats
  effect: ItemEffect
  value: number
  sprite: string
}

export interface InventoryEntry {
  id: number
  player_id: string
  item_id: number
  quantity: number
  equipped: boolean
  locked: boolean
  upgrade_level: number
  skill_slots: number
  instance_passives: string[]
  item?: Item
}

// Tira cuántas ranuras de habilidad tiene un item al entrar al inventario
export function rollSkillSlots(): number {
  const r = Math.random()
  if (r < 0.75) return 0   // 75%
  if (r < 0.95) return 1   // 20%
  if (r < 0.99) return 2   // 4%
  return 3                  // 1%
}

// ─── Upgrade ──────────────────────────────────────────────────────────────────

// Porcentaje de bonus de ataque por nivel de mejora
const UPGRADE_PCT: Record<number, number> = {
  1: 0.05,
  2: 0.10,
  3: 0.15,
  4: 0.20,
  5: 0.25,
}

// Bonus mínimo de ataque por nivel de mejora
const UPGRADE_MIN: Record<number, number> = {
  1: 3,
  2: 6,
  3: 9,
  4: 12,
  5: 15,
}

// Materiales requeridos por nivel de mejora
// Agregar entradas para niveles futuros
export interface UpgradeRequirement {
  materials: { itemId: number; quantity: number }[]
}

export const UPGRADE_REQUIREMENTS: Record<number, UpgradeRequirement> = {
  1: {
    materials: [
      { itemId: 24, quantity: 1  },  // Mineral de Hierro
      { itemId: 23, quantity: 10 },  // Colmillo de Goblin
    ],
  },
  // 2: { materials: [...] },
  // 3: { materials: [...] },
  // 4: { materials: [...] },
  // 5: { materials: [...] },
}

export function calcUpgradeGoldCost(itemValue: number, upgradeLevel: number): number {
  return itemValue * 3 * upgradeLevel
}

// Calcula el bonus de ataque que otorga un nivel de mejora sobre el ataque base
export function calcUpgradeBonus(baseAttack: number, upgradeLevel: number): number {
  if (upgradeLevel <= 0) return 0
  const pct = UPGRADE_PCT[upgradeLevel] ?? 0
  const min = UPGRADE_MIN[upgradeLevel] ?? 0
  return Math.max(min, Math.floor(baseAttack * pct))
}

// ─── Gear ─────────────────────────────────────────────────────────────────────

// Item equipado con su nivel de mejora (dato de instancia, no del catálogo)
export interface EquippedItem {
  item: Item
  upgradeLevel: number
  instancePassives: string[]  // pasivas engastadas por instancia (herrero)
}

export interface EquippedGear {
  weapon:   EquippedItem | null
  helmet:   EquippedItem | null
  chest:    EquippedItem | null
  gloves:   EquippedItem | null
  pants:    EquippedItem | null
  boots:    EquippedItem | null
  ring1:    EquippedItem | null
  ring2:    EquippedItem | null
  necklace: EquippedItem | null
}

export const EMPTY_GEAR: EquippedGear = {
  weapon: null, helmet: null, chest: null,
  gloves: null, pants: null, boots: null,
  ring1: null, ring2: null, necklace: null,
}

export function getWeaponAttackBonus(gear: EquippedGear): number {
  if (!gear.weapon) return 0
  const base = gear.weapon.item.stats?.attack ?? 0
  return base + calcUpgradeBonus(base, gear.weapon.upgradeLevel)
}

export function deriveStatsWithGear(primary: PrimaryStats, gear: EquippedGear, achievementBonus?: import('./player').AchievementBonus): PlayerStats {
  const base = deriveStats(primary)
  const allEquipped = [
    gear.weapon, gear.helmet, gear.chest, gear.gloves,
    gear.pants, gear.boots, gear.ring1, gear.ring2, gear.necklace,
  ].filter(Boolean) as EquippedItem[]

  const bonusAtk  = allEquipped.reduce((s, e) => {
    const b = e.item.stats?.attack ?? 0
    return s + b + calcUpgradeBonus(b, e.upgradeLevel)
  }, 0)
  const bonusDef  = allEquipped.reduce((s, e) => s + (e.item.stats?.defense     ?? 0), 0)
  const bonusHP   = allEquipped.reduce((s, e) => s + (e.item.stats?.hp_bonus    ?? 0), 0)
  const bonusCrit = allEquipped.reduce((s, e) => s + (e.item.stats?.crit_chance ?? 0), 0)

  // Arco: +25% de daño crítico (se maneja en combat.ts vía bow_crit pasiva, no en crit_chance)
  const achAtk  = achievementBonus?.attack  ?? 0
  const achDef  = achievementBonus?.defense ?? 0
  const achHP   = achievementBonus?.hp      ?? 0

  return {
    ...base,
    hp:          base.hp         + bonusHP  + achHP,
    max_hp:      base.max_hp     + bonusHP  + achHP,
    attack:      base.attack     + bonusAtk + achAtk,
    defense:     base.defense    + bonusDef + achDef,
    crit_chance: Math.min(1, base.crit_chance + bonusCrit),
  }
}