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

// ─── Proficiencias ────────────────────────────────────────────────────────────

export interface PlayerProficiencies {
  sword_kills: number
  magic_kills: number
  spells_cast: number
  bosses_defeated: number
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
  unlocked_classes: string[]
  equipped_classes: string[]
  equipped_class: string
  unlocked_skills: string[]
  equipped_skills: string[]
  current_hp: number
  created_at: string
}