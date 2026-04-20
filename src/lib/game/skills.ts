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
    ignores_weapon: true,   // daño base sin contar el arma equipada
  },
  {
    id: 'fireball',
    name: 'Bola de Fuego',
    description: 'Lanzás una esfera de fuego que ignora la defensa. 10% de quemar al enemigo por 3 turnos.',
    damage_multiplier: 1.5,
    stamina_cost: 0,
    mana_cost: 20,
    type: 'magical',
    ignores_defense: true,
    burn_chance: 0.10,
  },
]

// Skills que requieren desbloqueo explícito (via pergamino u otro método)
export const LOCKED_SKILLS = new Set(['fireball'])