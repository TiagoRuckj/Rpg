import { PlayerSkill } from '@/types/game'

export const BASE_SKILLS: PlayerSkill[] = [
  {
    id: 'golpe_destellante',
    name: 'Golpe Destellante',
    description: 'Un golpe rápido con el puño que enceguece al enemigo',
    damage_multiplier: 1.8,
    stamina_cost: 15,
    mana_cost: 0,
    type: 'physical',
    ignores_weapon: true,
  },
  {
    id: 'fireball',
    name: 'Bola de Fuego',
    description: 'Lanzás una esfera de fuego que ignora la defensa. 10% de quemar al enemigo (100% en crítico).',
    damage_multiplier: 1.5,
    stamina_cost: 0,
    mana_cost: 20,
    type: 'magical',
    ignores_defense: true,
    burn_chance: 0.10,
  },
  {
    id: 'nube_toxica',
    name: 'Nube Tóxica',
    description: 'Envuelve a todos los enemigos en una nube venenosa.',
    damage_multiplier: 0,
    stamina_cost: 0,
    mana_cost: 25,
    type: 'magical',
    ignores_weapon: true,
    ignores_defense: true,
    poison_all: true,
  },
  {
    id: 'test_nuke',
    name: '[TEST] Nuke',
    description: 'Hace 1000 de daño ignorando todo. Solo para testeo.',
    damage_multiplier: 999,
    stamina_cost: 0,
    mana_cost: 0,
    type: 'physical',
    ignores_weapon: true,
    ignores_defense: true,
    ignores_class_bonus: true,
    splash_multiplier: 1.0,  // 100% del daño a adyacentes
  },
]

// Skills que requieren desbloqueo explícito (via pergamino u otro método)
export const LOCKED_SKILLS = new Set(['fireball'])