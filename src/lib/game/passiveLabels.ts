import type { WeaponType } from '@/types/items'

// Labels legibles de pasivas para mostrar en el cliente (tooltip, herrero, etc.)
export const PASSIVE_LABELS: Record<string, { name: string; description: string }> = {
  splash:           { name: 'Impacto en área',     description: '15% del daño a enemigos adyacentes' },
  execution:        { name: 'Ejecución',            description: '50% de matar instantáneamente a enemigos con menos del 15% de HP' },
  stun:             { name: 'Aturdimiento',         description: '7% de impedir el ataque del enemigo este turno' },
  double_strike:    { name: 'Golpe doble',          description: '10% de realizar un segundo ataque automático' },
  staff_magic_boost:{ name: 'Potencia mágica',      description: 'Aumenta el daño mínimo de hechizos mágicos' },
  goblin_slayer:    { name: 'Cazador de goblins',   description: '+50% de daño contra goblins' },
  goblin_assassin:  { name: 'Asesino de goblins',   description: '+20% de daño contra goblins' },
  sharpened:        { name: 'Afilado',              description: 'Ignora el 5% de la defensa del enemigo' },
  bow_crit:         { name: 'Puntería letal',       description: '+25% de daño crítico' },
}

// Pasivas por defecto según tipo de arma — para usar en el cliente (tooltip)
export const WEAPON_PASSIVES: Partial<Record<WeaponType, string[]>> = {
  sword:  ['splash'],
  axe:    ['execution'],
  hammer: ['stun'],
  spear:  ['double_strike'],
  staff:  ['staff_magic_boost'],
  bow:    ['bow_crit'],
}