// ─── Sistema genérico de status effects ──────────────────────────────────────
//
// Cada StatusEffect tiene:
//   - target: 'enemy' (por instanceId) o 'player'
//   - type: el tipo de efecto (burn, poison, stun, etc.)
//   - turnsLeft: turnos restantes
//   - value: magnitud del efecto (daño, % de HP, etc.)
//   - instanceId: solo para efectos sobre enemigos
//
// Para agregar un nuevo efecto:
//   1. Agregar el tipo a StatusEffectType
//   2. Agregar un case en processEnemyEffects o processPlayerEffects
//   3. Exportar una función helper de aplicación (applyBurn, applyPoison, etc.)

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type StatusEffectType = 'burn' | 'poison'

export interface StatusEffect {
  type: StatusEffectType
  target: 'enemy' | 'player'
  turnsLeft: number
  value: number          // daño fijo por turno (poison) o % del HP actual (burn)
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

// ─── Procesamiento por turno ──────────────────────────────────────────────────

export interface EnemyHPMap {
  [instanceId: number]: number
}

export interface ProcessEffectsResult {
  updatedEffects: StatusEffect[]
  enemyHPDeltas: EnemyHPMap      // daño aplicado a cada enemigo
  playerHPDelta: number           // daño total aplicado al jugador (negativo)
  log: string[]
}

// Procesa todos los efectos activos para el turno actual.
// Devuelve los efectos que siguen activos (turnsLeft > 1 → turnsLeft - 1).
export function processStatusEffects(
  effects: StatusEffect[],
  enemyCurrentHPs: EnemyHPMap,    // HP actual de cada enemigo (para calcular % en burn)
  enemyNames: Record<number, string>,
): ProcessEffectsResult {
  const updatedEffects: StatusEffect[] = []
  const enemyHPDeltas: EnemyHPMap = {}
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

    }

    // Mantener efecto si le quedan más turnos
    if (effect.turnsLeft > 1) {
      updatedEffects.push({ ...effect, turnsLeft: effect.turnsLeft - 1 })
    }
    // turnsLeft === 1: efecto se agota, no se agrega a updatedEffects
  }

  return { updatedEffects, enemyHPDeltas, playerHPDelta, log }
}

// ─── Compatibilidad con el store ─────────────────────────────────────────────
// Helpers para migrar hacia/desde los tipos legacy mientras se completa el refactor

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