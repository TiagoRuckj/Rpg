// ─── Tipos de enemigo ─────────────────────────────────────────────────────────

export type EnemyType = 'goblin' | 'undead' | 'beast' | 'demon' | 'human' | 'elemental'

// ─── Enemies ──────────────────────────────────────────────────────────────────

export interface EnemyStats {
  hp: number
  attack: number
  defense: number
}

export interface EnemyLootEntry {
  exp: number
  gold_min: number
  gold_max: number
  item_id: number | null
  item_name?: string
  item_chance: number
}

export interface Enemy {
  id: number
  dungeon_id: number
  name: string
  stats: EnemyStats
  loot_table: EnemyLootEntry[]
  enemy_type: EnemyType[]
  max_energy: number
}

// ─── Bosses ───────────────────────────────────────────────────────────────────

export interface BossStats {
  hp: number
  max_hp?: number
  attack: number
  defense: number
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
  loot_table: LootEntry[]
  enemy_type: EnemyType[]
  max_energy: number
  initial_adds?: number[]
}

// ─── AI de enemigos ───────────────────────────────────────────────────────────

export type AiTier = 'dumb' | 'medium' | 'smart'
export type EnemyActionType = 'attack' | 'buff' | 'debuff' | 'recuperacion' | 'extra'
export type AttackSubtype = 'fisica' | 'magica' | 'mixta'

export interface EnemyAction {
  id: number
  name: string
  label: string
  type: EnemyActionType
  subtype?: AttackSubtype
  base_weight: number
  energy_cost: number
  effect: EnemyActionEffect
}

export interface EnemyActionEffect {
  damage_multiplier?: number
  stat_target?: string
  stat_mult?: number
  apply_effect?: string
  heal_pct?: number
  heal_stamina_pct?: number
  summon_enemy_id?: number
}

export interface EnemyAiConfig {
  id: number
  entity_type: 'enemy' | 'boss'
  entity_id: number
  ai_tier: AiTier
  energy_per_turn: number
  action_ids: number[]
}

export interface BossPhaseStatChanges {
  attack_mult?: number
  defense_add?: number
}

export interface BossPhase {
  id: number
  boss_id: number
  phase_order: number
  hp_threshold: number
  ai_tier: AiTier | null
  cap_damage: boolean
  summon_enemy_ids: number[] | null
  stat_changes: BossPhaseStatChanges | null
  action_ids: number[] | null
}

export interface EnemyAiState {
  tier: AiTier
  energy: number
  maxEnergy: number
  activePhaseOrder: number
  triggeredPhases: number[]
  nextActionId: number | null   // ID de la habilidad que está acumulando energía para usar
}

export interface EnemyCombatState {
  instanceId: number
  enemy: Enemy
  currentHP: number
  maxHP: number
  alive: boolean
  aiState: EnemyAiState
  statMults: BossPhaseStatChanges | null
}

export interface EnemyActionResult {
  action: EnemyAction
  damageToPlayer: number
  selfHeal: number
  newPlayerEffects: string[]
  summonEnemyId: number | null
  capPlayerDamage: boolean
  log: string[]
}