// ─── Acciones de combate ──────────────────────────────────────────────────────

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

// ─── Skills del jugador ───────────────────────────────────────────────────────

export interface PlayerSkill {
  id: string
  name: string
  description: string
  damage_multiplier: number
  stamina_cost: number
  mana_cost: number
  type: 'physical' | 'magical' | 'mixed'
  ignores_weapon?: boolean
  ignores_defense?: boolean
  ignores_class_bonus?: boolean
  burn_chance?: number
}