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
  equipped_skills: string[]
  current_hp: number
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

export type SpawnWeight = { id: number; weight: number }
export type SpawnTable = Record<string, SpawnWeight[]>  // key = sala (string)

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

// ─── Bosses ───────────────────────────────────────────────────────────────────

export interface BossStats {
  hp: number   // usado como max_hp — el HP actual se maneja en el store
  max_hp?: number
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
  hp: number   // usado como max_hp — el HP actual se maneja en el store
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

// ─── Efectos de estado ───────────────────────────────────────────────────────

export interface BurnState {
  instanceId: number
  turnsLeft: number
}

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
  burn_chance?: number   // probabilidad de aplicar quemadura (0-1)
}

// ─── Efectos de estado del jugador ───────────────────────────────────────────

export interface PlayerPoisonState {
  turnsLeft: number   // turnos restantes (5 al aplicar)
  damagePerTurn: number  // daño por turno (10)
}

// ─── Eventos de sala intermedia ──────────────────────────────────────────────

export type RoomEventType =
  | 'treasure'       // Cofre del tesoro
  | 'ambush'         // Emboscada
  | 'merchant'       // Mercader
  | 'healing_altar'  // Altar de curación
  | 'poison_trap'    // Trampa venenosa
  | 'cracked_wall'   // Muro agrietado

export interface RoomEvent {
  type: RoomEventType
  resolved: boolean  // true cuando el jugador ya interactuó
}

// Pesos para el sorteo de evento (suman 100)
export const EVENT_WEIGHTS: { type: RoomEventType; weight: number }[] = [
  { type: 'treasure',      weight: 30 },
  { type: 'ambush',        weight: 25 },
  { type: 'healing_altar', weight: 20 },
  { type: 'poison_trap',   weight: 15 },
  { type: 'merchant',      weight: 8  },
  { type: 'cracked_wall',  weight: 2  },
]

export function rollRoomEvent(): RoomEvent | null {
  // 25% de que haya evento
  if (Math.random() > 0.25) return null
  const total = EVENT_WEIGHTS.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const e of EVENT_WEIGHTS) {
    r -= e.weight
    if (r <= 0) return { type: e.type, resolved: false }
  }
  return { type: 'treasure', resolved: false }
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
  poisonState: PlayerPoisonState | null
  statusEffects: import('@/lib/game/statusEffects').StatusEffect[]
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

// ─── AI de Enemigos ───────────────────────────────────────────────────────────
// Agregar al final de src/types/game.ts

export type AiTier = 'dumb' | 'medium' | 'smart' | 'boss'

// Acción que puede ejecutar un enemigo
// Categorías:
//   attack      — daño directo (subtype: 'fisica' | 'magica' | 'mixta')
//   buff        — mejora propia (ataque, defensa, etc.)
//   debuff      — reduce stats del rival
//   recuperacion — recuperar HP, stamina u otros recursos
//   extra       — efectos especiales (stun, veneno, invocar, etc.)
export type EnemyActionType = 'attack' | 'buff' | 'debuff' | 'recuperacion' | 'extra'
export type AttackSubtype = 'fisica' | 'magica' | 'mixta'

export interface EnemyAction {
  id: number
  name: string
  label: string
  type: EnemyActionType
  subtype?: AttackSubtype       // solo para type === 'attack'
  base_weight: number
  energy_cost: number           // energía necesaria para ejecutar esta acción
  effect: EnemyActionEffect
}

export interface EnemyActionEffect {
  damage_multiplier?: number    // multiplicador sobre el ataque base (type: attack)
  stat_target?: string          // qué stat afecta (type: buff | debuff) ej: 'attack' | 'defense'
  stat_mult?: number            // multiplicador del stat (0.8 = -20%, 1.2 = +20%)
  apply_effect?: string         // efecto a aplicar (type: extra) ej: 'poison' | 'stun'
  heal_pct?: number             // % del max_hp a recuperar (type: recuperacion)
  heal_stamina_pct?: number     // % del max_stamina a recuperar (type: recuperacion)
  summon_enemy_id?: number      // ID del enemigo a invocar (type: extra)
}

// Configuración de IA de un enemigo/boss en DB
export interface EnemyAiConfig {
  id: number
  entity_type: 'enemy' | 'boss'
  entity_id: number
  ai_tier: AiTier
  energy_threshold: number | null  // umbral de disparo para tier 'dumb'
  energy_per_turn: number          // energía que regenera por turno
  max_energy: number               // techo máximo acumulable
  action_ids: number[]
}

// Fase de un boss
export interface BossPhase {
  id: number
  boss_id: number
  phase_order: number
  hp_threshold: number           // 0.0 a 1.0
  ai_tier: AiTier | null        // null = hereda el del enemy_ai base
  cap_damage: boolean
  summon_enemy_ids: number[] | null  // reemplaza summon_enemy_id
  stat_changes: BossPhaseStatChanges | null
  action_ids: number[] | null   // null = hereda del enemy_ai base
}

export interface BossPhaseStatChanges {
  attack_mult?: number           // multiplicador sobre ataque base
  defense_add?: number           // suma fija a defensa
  // extensible para futuras mecánicas
}

// Estado de IA en runtime — se guarda en EnemyCombatState
export interface EnemyAiState {
  tier: AiTier
  energy: number                 // energía acumulada actual
  maxEnergy: number              // techo acumulable (viene de enemy_ai.max_energy)
  activePhaseOrder: number       // última fase activada (0 = ninguna)
  triggeredPhases: number[]      // phase_order de fases ya disparadas (para no repetir)
}

// EnemyCombatState extendido — reemplaza la definición actual en game.ts
// Cambios respecto al original:
//   + aiState: EnemyAiState | null
//   + statMults: BossPhaseStatChanges | null  (para enrage activo)
export interface EnemyCombatState {
  instanceId: number
  enemy: Enemy
  currentHP: number
  maxHP: number
  alive: boolean
  // nuevo
  aiState: EnemyAiState | null        // null = enemigos sin IA configurada (comportamiento legacy)
  statMults: BossPhaseStatChanges | null  // modificadores de fase activos
}

// Resultado de resolveEnemyAction
export interface EnemyActionResult {
  action: EnemyAction
  // Daño efectivo a aplicar al jugador (0 si no es acción de ataque)
  damageToPlayer: number
  // HP curado al propio enemigo (0 si no es heal)
  selfHeal: number
  // Efectos a aplicar al jugador
  newPlayerEffects: string[]
  // Enemigo a invocar (null si no hay summon)
  summonEnemyId: number | null
  // Si esta acción dispara cap de daño (solo bosses en transición de fase)
  capPlayerDamage: boolean
  // Log legible
  log: string[]
}

// ─── Extensión de Boss ────────────────────────────────────────────────────────
// Agregar a la interface Boss existente en game.ts:
//
//   initial_adds?: number[]   // IDs de enemigos que spawnean junto al boss
//
// Y en la DB:
//   ALTER TABLE bosses ADD COLUMN initial_adds INT[] DEFAULT NULL;
//
// No se redefine Boss acá para no crear conflicto de tipos.
// Usarlo como (boss as any).initial_adds hasta que se agregue al tipo oficial.
export interface BossWithAdds {
  initial_adds?: number[]
}