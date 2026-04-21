// ─── Sistema genérico de status effects ──────────────────────────────────────
//
// Para agregar un nuevo efecto:
//   1. Agregar el tipo a StatusEffectType
//   2. Agregar un case en processStatusEffects
//   3. Exportar una función helper de aplicación (applyBurn, applyStun, etc.)

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type StatusEffectType = 'burn' | 'poison' | 'stun'

export interface StatusEffect {
  type: StatusEffectType
  target: 'enemy' | 'player'
  turnsLeft: number
  value: number          // daño fijo por turno (poison), % del HP actual (burn), 0 (stun)
  instanceId?: number    // requerido cuando target === 'enemy'
}

// ─── Helpers de aplicación ───────────────────────────────────────────────────

export function applyBurn(
  instanceId: number,
  existing: StatusEffect[],
  turnsLeft = 3,
): StatusEffect[] {
  const alreadyBurning = existing.some(
    e => e.type === 'burn' && e.instanceId === instanceId
  )
  if (alreadyBurning) return existing
  return [...existing, { type: 'burn', target: 'enemy', turnsLeft, value: 0.05, instanceId }]
}

export function applyPoison(
  existing: StatusEffect[],
  damagePerTurn = 10,
  turnsLeft = 5,
): StatusEffect[] {
  // Si ya está envenenado, resetear turnos (no acumular)
  const withoutPoison = existing.filter(e => e.type !== 'poison')
  return [...withoutPoison, { type: 'poison', target: 'player', turnsLeft, value: damagePerTurn }]
}

// Stun sobre un enemigo: lo salta el turno actual Y el siguiente.
// turnsLeft = 2 → se procesa este turno (→1) y el siguiente (→0 y se descarta).
// combatActions ya chequea stunnedPrevTurn vía stunnedEnemyIds; este efecto
// garantiza que el store sepa qué enemigos están stuneados incluso sin martillo.
export function applyStun(
  instanceId: number,
  existing: StatusEffect[],
  turnsLeft = 2,
): StatusEffect[] {
  // Si ya está stuneado, no acumular — solo refrescar si queda menos tiempo
  const withoutStun = existing.filter(e => !(e.type === 'stun' && e.instanceId === instanceId))
  return [...withoutStun, { type: 'stun', target: 'enemy', turnsLeft, value: 0, instanceId }]
}

// ─── Procesamiento por turno ──────────────────────────────────────────────────

export interface EnemyHPMap {
  [instanceId: number]: number
}

export interface ProcessEffectsResult {
  updatedEffects: StatusEffect[]
  enemyHPDeltas: EnemyHPMap      // daño aplicado a cada enemigo (negativo)
  playerHPDelta: number           // daño total aplicado al jugador (negativo)
  stunnedEnemyIds: number[]       // enemigos que no pueden atacar este turno por stun
  log: string[]
}

export function processStatusEffects(
  effects: StatusEffect[],
  enemyCurrentHPs: EnemyHPMap,
  enemyNames: Record<number, string>,
): ProcessEffectsResult {
  const updatedEffects: StatusEffect[] = []
  const enemyHPDeltas: EnemyHPMap = {}
  const stunnedEnemyIds: number[] = []
  let playerHPDelta = 0
  const log: string[] = []

  for (const effect of effects) {
    switch (effect.type) {

      case 'burn': {
        const id = effect.instanceId!
        const currentHP = (enemyCurrentHPs[id] ?? 0) + (enemyHPDeltas[id] ?? 0)
        if (currentHP <= 0) continue  // enemigo ya muerto, descartar efecto

        const dmg = Math.max(1, Math.round(currentHP * effect.value))
        enemyHPDeltas[id] = (enemyHPDeltas[id] ?? 0) - dmg

        const name = enemyNames[id] ?? 'Enemigo'
        const remaining = effect.turnsLeft
        log.push(`🔥 ${name} sufre ${dmg} de daño por quemadura! (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
        break
      }

      case 'poison': {
        playerHPDelta -= effect.value
        const remaining = effect.turnsLeft
        log.push(`☠️ El veneno te quema! -${effect.value} HP (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
        break
      }

      case 'stun': {
        const id = effect.instanceId!
        const currentHP = enemyCurrentHPs[id] ?? 0
        if (currentHP <= 0) continue  // enemigo muerto, descartar

        stunnedEnemyIds.push(id)
        const name = enemyNames[id] ?? 'Enemigo'
        const remaining = effect.turnsLeft
        log.push(`🔨 ${name} está aturdido! (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
        break
      }

    }

    if (effect.turnsLeft > 1) {
      updatedEffects.push({ ...effect, turnsLeft: effect.turnsLeft - 1 })
    }
  }

  return { updatedEffects, enemyHPDeltas, playerHPDelta, stunnedEnemyIds, log }
}

// ─── Compatibilidad con el store ─────────────────────────────────────────────

export function toBurnStates(effects: StatusEffect[]): { instanceId: number; turnsLeft: number }[] {
  return effects
    .filter(e => e.type === 'burn' && e.instanceId !== undefined)
    .map(e => ({ instanceId: e.instanceId!, turnsLeft: e.turnsLeft }))
}

export function toPlayerPoisonState(effects: StatusEffect[]): { turnsLeft: number; damagePerTurn: number } | null {
  const poison = effects.find(e => e.type === 'poison')
  if (!poison) return null
  return { turnsLeft: poison.turnsLeft, damagePerTurn: poison.value }
}

export function fromLegacy(
  burnStates: { instanceId: number; turnsLeft: number }[],
  poisonState: { turnsLeft: number; damagePerTurn: number } | null,
): StatusEffect[] {
  const effects: StatusEffect[] = []
  for (const b of burnStates) {
    effects.push({ type: 'burn', target: 'enemy', turnsLeft: b.turnsLeft, value: 0.05, instanceId: b.instanceId })
  }
  if (poisonState) {
    effects.push({ type: 'poison', target: 'player', turnsLeft: poisonState.turnsLeft, value: poisonState.damagePerTurn })
  }
  return effects
}