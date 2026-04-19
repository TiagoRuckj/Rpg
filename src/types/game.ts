// ─── Primary Stats ────────────────────────────────────────────────────────────

export interface PrimaryStats {
  fortaleza: number
  resistencia: number
  vigor: number
  inteligencia: number
  suerte: number
}

export interface PlayerStats {
  hp: number
  max_hp: number
  stamina: number
  max_stamina: number
  mana: number
  max_mana: number
  attack: number
  defense: number
}

export function deriveStats(primary: PrimaryStats): PlayerStats {
  return {
    hp:          80 + primary.vigor        * 10,
    max_hp:      80 + primary.vigor        * 10,
    stamina:     20 + primary.resistencia  * 5,
    max_stamina: 20 + primary.resistencia  * 5,
    mana:        20 + primary.inteligencia * 5,
    max_mana:    20 + primary.inteligencia * 5,
    attack:       8 + primary.fortaleza    * 2,
    defense:      3 + primary.resistencia  * 2,
  }
}

export function calcPlayerLevel(primary: PrimaryStats): number {
  return (
    primary.fortaleza +
    primary.resistencia +
    primary.vigor +
    primary.inteligencia +
    primary.suerte
  )
}

export function statUpgradeCost(currentValue: number): number {
  return Math.floor(100 * Math.pow(1.5, currentValue))
}

export function critChance(suerte: number): number {
  return 0.15 + suerte * 0.005
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface PlayerProficiencies {
  sword_kills: number
  magic_kills: number
  spells_cast: number
  bosses_defeated: number
}

export interface Player {
  id: string
  name: string
  level: number
  experience: number
  gold: number
  primary_stats: PrimaryStats
  stats: PlayerStats
  proficiencies: PlayerProficiencies
  unlocked_classes: string[]
  equipped_classes: string[]
  equipped_class: string
  unlocked_skills: string[]
  created_at: string
}

// ─── Items ────────────────────────────────────────────────────────────────────

export type WeaponType = 'sword' | 'axe' | 'hammer' | 'spear' | 'staff' | 'none'

export type ItemType = 'weapon' | 'armor' | 'consumable' | 'ring' | 'necklace'
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type ArmorSlot = 'helmet' | 'chest' | 'gloves' | 'pants' | 'boots'

export interface ItemStats {
  attack?: number
  defense?: number
  hp_bonus?: number
  slot?: ArmorSlot
  weapon_type?: WeaponType
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
  item?: Item
}

// ─── Dungeons ─────────────────────────────────────────────────────────────────

export type DungeonRank = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S'

export interface Dungeon {
  id: number
  name: string
  rank: DungeonRank
  rooms: number
  extraction_fee: number
  description: string
  background: string
}

// ─── Bosses ───────────────────────────────────────────────────────────────────

export interface BossStats {
  hp: number
  max_hp: number
  attack: number
  defense: number
}

export interface BossSkill {
  name: string
  damage: number
  cost: number
  type: 'physical' | 'magical'
  telegraphed: boolean
}

export interface LootEntry {
  item_id: number
  chance: number
}

export interface Boss {
  id: number
  dungeon_id: number
  name: string
  stats: BossStats
  skills: BossSkill[]
  loot_table: LootEntry[]
  enemy_type: EnemyType[]
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

export interface EnemyStats {
  hp: number
  max_hp: number
  attack: number
  defense: number
}

export interface EnemyLootEntry {
  exp: number
  gold_min: number
  gold_max: number
  item_id: number | null
  item_name?: string   // populado en la page para mostrarlo en el cliente
  item_chance: number
}

export interface Enemy {
  id: number
  dungeon_id: number
  name: string
  stats: EnemyStats
  loot_table: EnemyLootEntry[]
  enemy_type: EnemyType[]
}

export interface EnemyCombatState {
  instanceId: number
  enemy: Enemy
  currentHP: number
  maxHP: number
  alive: boolean
}

// ─── Combat ───────────────────────────────────────────────────────────────────

export type CombatAction = 'attack' | 'skill' | 'item' | 'block'

export interface CombatState {
  playerHP: number
  playerStamina: number
  playerMana: number
  turn: number
  isPlayerTurn: boolean
  isBlocking: boolean
  log: string[]
  status: 'idle' | 'active' | 'victory' | 'defeat'
}

export interface PlayerSkill {
  id: string
  name: string
  description: string
  damage_multiplier: number
  stamina_cost: number
  mana_cost: number
  type: 'physical' | 'magical' | 'mixed'

  // ── Modificadores de gear ─────────────────────────────────────────────────
  // El daño se calcula sin el bonus del arma equipada (golpes con puño, patadas, etc.)
  ignores_weapon?: boolean
  // El daño ignora completamente la defensa del enemigo
  ignores_defense?: boolean
  // El daño no recibe bonus de ataque de clase
  ignores_class_bonus?: boolean
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
}

// ─── Profundidad post-boss ────────────────────────────────────────────────────

export function depthMultiplier(depth: number): number {
  if (depth <= 0) return 1.0
  return 1.0 + 0.15 * Math.pow(depth, 1.8)
}

// ─── Cantidad de enemigos por sala ────────────────────────────────────────────

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

// ─── Gear ─────────────────────────────────────────────────────────────────────

export interface EquippedGear {
  weapon:   Item | null
  helmet:   Item | null
  chest:    Item | null
  gloves:   Item | null
  pants:    Item | null
  boots:    Item | null
  ring1:    Item | null
  ring2:    Item | null
  necklace: Item | null
}

export const EMPTY_GEAR: EquippedGear = {
  weapon: null, helmet: null, chest: null,
  gloves: null, pants: null, boots: null,
  ring1: null, ring2: null, necklace: null,
}

// Cuánto ataque aporta el arma equipada (0 si no hay arma)
export function getWeaponAttackBonus(gear: EquippedGear): number {
  return gear.weapon?.stats?.attack ?? 0
}

export function deriveStatsWithGear(primary: PrimaryStats, gear: EquippedGear): PlayerStats {
  const base = deriveStats(primary)
  const allItems = [
    gear.weapon, gear.helmet, gear.chest, gear.gloves,
    gear.pants, gear.boots, gear.ring1, gear.ring2, gear.necklace,
  ].filter(Boolean) as Item[]
  const bonusAtk = allItems.reduce((s, i) => s + (i.stats?.attack   ?? 0), 0)
  const bonusDef = allItems.reduce((s, i) => s + (i.stats?.defense  ?? 0), 0)
  const bonusHP  = allItems.reduce((s, i) => s + (i.stats?.hp_bonus ?? 0), 0)
  return {
    ...base,
    hp:      base.hp      + bonusHP,
    max_hp:  base.max_hp  + bonusHP,
    attack:  base.attack  + bonusAtk,
    defense: base.defense + bonusDef,
  }
}

export function deriveStatsWithGearAndClasses(
  primary: PrimaryStats,
  gear: EquippedGear,
  classBonuses: ClassBonuses
): PlayerStats {
  const withGear = deriveStatsWithGear(primary, gear)
  return {
    ...withGear,
    attack:  withGear.attack  + (classBonuses.attack  ?? 0),
    defense: withGear.defense + (classBonuses.defense ?? 0),
  }
}

// ─── Tipos de enemigo ─────────────────────────────────────────────────────────

export type EnemyType = 'goblin' | 'undead' | 'beast' | 'demon' | 'human' | 'elemental'

// ─── Clases ───────────────────────────────────────────────────────────────────

export interface ClassBonuses {
  attack?: number
  defense?: number
  crit_bonus?: number
  type_damage_bonus?: Partial<Record<EnemyType, number>>
}

export interface GameClass {
  id: string
  name: string
  description: string
  unlock_condition: string
  bonuses: ClassBonuses
}

export function calcClassBonuses(
  equippedClassIds: string[],
  allClasses: GameClass[]
): ClassBonuses {
  const result: ClassBonuses = { attack: 0, defense: 0, crit_bonus: 0, type_damage_bonus: {} }
  for (const id of equippedClassIds) {
    const cls = allClasses.find(c => c.id === id)
    if (!cls) continue
    result.attack! += cls.bonuses.attack ?? 0
    result.defense! += cls.bonuses.defense ?? 0
    result.crit_bonus! += cls.bonuses.crit_bonus ?? 0
    if (cls.bonuses.type_damage_bonus) {
      for (const [type, bonus] of Object.entries(cls.bonuses.type_damage_bonus)) {
        result.type_damage_bonus![type as EnemyType] =
          (result.type_damage_bonus![type as EnemyType] ?? 0) + bonus!
      }
    }
  }
  return result
}