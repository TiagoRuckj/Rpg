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
  crit_chance: number
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
    crit_chance: 0.15 + primary.suerte     * 0.005,
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

// Costo compartido entre todas las stats — basado en el nivel total del jugador
export function statUpgradeCost(totalLevel: number): number {
  return Math.floor(100 * Math.pow(1 + totalLevel * 0.05, 1.8))
}

export function critChance(suerte: number): number {
  return 0.15 + suerte * 0.005
}

// ─── Proficiencias ────────────────────────────────────────────────────────────

export interface PlayerProficiencies {
  // Kills por tipo de arma
  sword_kills: number
  axe_kills: number
  hammer_kills: number
  bow_kills: number
  spear_kills: number
  magic_kills: number
  // Kills generales
  total_kills: number
  goblin_kills: number
  // Economía
  total_gold: number
  chests_opened: number
  // Daño
  biggest_damage: number
  // Bosses específicos
  goblin_king_defeated: number
  gran_goblin_defeated: number
  // Legacy
  spells_cast: number
  bosses_defeated: number
}

// ─── Achievement Bonus ────────────────────────────────────────────────────────

export interface AchievementBonus {
  attack: number
  defense: number
  hp: number
  crit_mult: number       // se suma al multiplicador de crit (ej: 0.10 → overcrit hace ×1.85²)
  gold_pct: number        // % extra de gold de loot (acumulativo)
  type_damage: Partial<Record<string, number>>  // ej: { goblin: 0.15 }
}

export const EMPTY_ACHIEVEMENT_BONUS: AchievementBonus = {
  attack: 0, defense: 0, hp: 0, crit_mult: 0, gold_pct: 0, type_damage: {},
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface Player {
  id: string
  name: string
  level: number
  experience: number
  gold: number
  primary_stats: PrimaryStats
  stats: PlayerStats
  proficiencies: PlayerProficiencies
  achievement_bonus: AchievementBonus
  unlocked_classes: string[]
  equipped_classes: string[]
  equipped_class: string
  unlocked_skills: string[]
  equipped_skills: string[]
  current_hp: number
  created_at: string
}