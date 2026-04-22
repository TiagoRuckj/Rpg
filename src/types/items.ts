import { PrimaryStats, PlayerStats, deriveStats } from './player'

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