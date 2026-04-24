import { EnemyType } from './enemy'
import { PlayerStats } from './player'
import { EquippedGear, deriveStatsWithGear } from './items'
import { PrimaryStats } from './player'
import { WeaponType } from './items'

// ─── Clases ───────────────────────────────────────────────────────────────────

export interface WeaponTypeBonus {
  damage: number      // multiplicador aditivo al daño (0.15 = +15%)
  crit_bonus: number  // bonus al crit chance
}

export interface ClassBonuses {
  attack?: number
  defense?: number
  crit_bonus?: number
  type_damage_bonus?: Partial<Record<EnemyType, number>>
  weapon_type_bonus?: Partial<Record<WeaponType | 'magic', WeaponTypeBonus>>
  enemy_count_bonus?: { damage_per_enemy: number }  // Masacrador
  chest_gold_bonus?: number                          // Saqueador
  crit_mult_bonus?: number                           // Devastador
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
  const result: ClassBonuses = {
    attack: 0, defense: 0, crit_bonus: 0,
    type_damage_bonus: {}, weapon_type_bonus: {},
    enemy_count_bonus: undefined,
    chest_gold_bonus: 0,
    crit_mult_bonus: 0,
  }
  for (const id of equippedClassIds) {
    const cls = allClasses.find(c => c.id === id)
    if (!cls) continue
    result.attack! += cls.bonuses.attack ?? 0
    result.defense! += cls.bonuses.defense ?? 0
    result.crit_bonus! += cls.bonuses.crit_bonus ?? 0
    result.crit_mult_bonus! += cls.bonuses.crit_mult_bonus ?? 0
    result.chest_gold_bonus! += cls.bonuses.chest_gold_bonus ?? 0
    if (cls.bonuses.type_damage_bonus) {
      for (const [type, bonus] of Object.entries(cls.bonuses.type_damage_bonus)) {
        result.type_damage_bonus![type as EnemyType] =
          (result.type_damage_bonus![type as EnemyType] ?? 0) + bonus!
      }
    }
    if (cls.bonuses.weapon_type_bonus) {
      for (const [wtype, bonus] of Object.entries(cls.bonuses.weapon_type_bonus)) {
        const existing = result.weapon_type_bonus![wtype as WeaponType] ?? { damage: 0, crit_bonus: 0 }
        result.weapon_type_bonus![wtype as WeaponType] = {
          damage: existing.damage + (bonus?.damage ?? 0),
          crit_bonus: existing.crit_bonus + (bonus?.crit_bonus ?? 0),
        }
      }
    }
    if (cls.bonuses.enemy_count_bonus) {
      result.enemy_count_bonus = {
        damage_per_enemy: (result.enemy_count_bonus?.damage_per_enemy ?? 0) + cls.bonuses.enemy_count_bonus.damage_per_enemy,
      }
    }
  }
  return result
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