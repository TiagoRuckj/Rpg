// ─── Sistema genérico de status effects ──────────────────────────────────────
//
// Para agregar un nuevo efecto:
//   1. Agregar el tipo a StatusEffectType
//   2. Agregar un case en processStatusEffects
//   3. Exportar una función helper de aplicación

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type StatusEffectType = 'burn' | 'poison' | 'stun' | 'buff' | 'debuff' | 'confused'

// Qué stat modifica un buff/debuff
export type StatTarget = 'attack' | 'defense' | 'magic' | 'damage'

export interface StatusEffect {
  type: StatusEffectType
  target: 'enemy' | 'player'
  turnsLeft: number
  value: number          // daño/turno (poison, burn), multiplicador (buff/debuff), 0 (stun)
  instanceId?: number    // requerido cuando target === 'enemy'
  stat?: StatTarget      // requerido cuando type === 'buff' | 'debuff'
}

// ─── Helpers de aplicación ───────────────────────────────────────────────────

// ─── Constantes de efectos estándar ──────────────────────────────────────────

export const BURN_VALUE_START = 0.01   // % del HP actual — turno 1
export const BURN_VALUE_MAX   = 0.05   // % del HP actual — tope (turno 5+)
export const BURN_VALUE_STEP  = 0.01   // cuánto sube por turno continuo
export const POISON_DAMAGE    = 10     // daño fijo por turno
export const POISON_TURNS     = 5      // turnos por defecto

export function applyBurn(
  instanceId: number,
  existing: StatusEffect[],
  turnsLeft = 3,
): StatusEffect[] {
  const current = existing.find(e => e.type === 'burn' && e.instanceId === instanceId)
  if (current) {
    // Ya está quemado — refrescar turnos sumando, mantener el % actual
    return existing.map(e =>
      e.type === 'burn' && e.instanceId === instanceId
        ? { ...e, turnsLeft: e.turnsLeft + turnsLeft }
        : e
    )
  }
  // Nueva quemadura — empieza en 1%
  return [...existing, { type: 'burn', target: 'enemy', turnsLeft, value: BURN_VALUE_START, instanceId }]
}

export function applyPoison(
  existing: StatusEffect[],
  damagePerTurn = POISON_DAMAGE,
  turnsLeft = POISON_TURNS,
): StatusEffect[] {
  // Resetear turnos si ya está envenenado (no acumular)
  const withoutPoison = existing.filter(e => !(e.type === 'poison' && e.target === 'player'))
  return [...withoutPoison, { type: 'poison', target: 'player', turnsLeft, value: damagePerTurn }]
}

export function applyEnemyPoison(
  instanceId: number,
  existing: StatusEffect[],
  damagePerTurn = POISON_DAMAGE,
  turnsLeft = POISON_TURNS,
): StatusEffect[] {
  // Resetear si ya está envenenado ese enemigo
  const withoutPoison = existing.filter(e => !(e.type === 'poison' && e.target === 'enemy' && e.instanceId === instanceId))
  return [...withoutPoison, { type: 'poison', target: 'enemy', turnsLeft, value: damagePerTurn, instanceId }]
}

export function applyStun(
  instanceId: number,
  existing: StatusEffect[],
  turnsLeft = 2,
): StatusEffect[] {
  const withoutStun = existing.filter(e => !(e.type === 'stun' && e.instanceId === instanceId))
  return [...withoutStun, { type: 'stun', target: 'enemy', turnsLeft, value: 0, instanceId }]
}

// Buff sobre el jugador (ej: Grito de Guerra sube el ataque)
export function applyPlayerBuff(
  stat: StatTarget,
  multiplier: number,
  existing: StatusEffect[],
  turnsLeft = 3,
): StatusEffect[] {
  const withoutBuff = existing.filter(e => !(e.type === 'buff' && e.target === 'player' && e.stat === stat))
  return [...withoutBuff, { type: 'buff', target: 'player', turnsLeft, value: multiplier, stat }]
}

// Debuff sobre un enemigo (ej: Debilitar reduce el ataque del enemigo)
export function applyEnemyDebuff(
  instanceId: number,
  stat: StatTarget,
  multiplier: number,
  existing: StatusEffect[],
  turnsLeft = 3,
): StatusEffect[] {
  const withoutDebuff = existing.filter(e => !(e.type === 'debuff' && e.target === 'enemy' && e.instanceId === instanceId && e.stat === stat))
  return [...withoutDebuff, { type: 'debuff', target: 'enemy', turnsLeft, value: multiplier, instanceId, stat }]
}

// Confused sobre un enemigo (ej: Engaño — 10% de errar su ataque)
export function applyConfused(
  instanceId: number,
  existing: StatusEffect[],
  missChance = 0.10,
  turnsLeft = 3,
): StatusEffect[] {
  const withoutConfused = existing.filter(e => !(e.type === 'confused' && e.instanceId === instanceId))
  return [...withoutConfused, { type: 'confused', target: 'enemy', turnsLeft, value: missChance, instanceId }]
}

// Lee el multiplicador de buff del jugador para un stat
export function getPlayerBuffMult(effects: StatusEffect[], stat: StatTarget): number {
  return effects
    .filter(e => e.target === 'player' && e.type === 'buff' && e.stat === stat)
    .reduce((acc, e) => acc * e.value, 1)
}

// Lee el multiplicador de debuff de un enemigo para un stat
export function getEnemyDebuffMult(effects: StatusEffect[], instanceId: number, stat: StatTarget): number {
  return effects
    .filter(e => e.target === 'enemy' && e.type === 'debuff' && e.instanceId === instanceId && e.stat === stat)
    .reduce((acc, e) => acc * e.value, 1)
}

// Retorna la miss chance de confused para un enemigo (0 si no está confundido)
export function getEnemyMissChance(effects: StatusEffect[], instanceId: number): number {
  const confused = effects.find(e => e.type === 'confused' && e.instanceId === instanceId)
  return confused?.value ?? 0
}
export function applyEnemyBuff(
  instanceId: number,
  stat: StatTarget,
  multiplier: number,
  existing: StatusEffect[],
  turnsLeft = 3,
): StatusEffect[] {
  // Si ya tiene ese buff activo, refrescar turnos
  const withoutBuff = existing.filter(e => !(e.type === 'buff' && e.instanceId === instanceId && e.stat === stat))
  return [...withoutBuff, { type: 'buff', target: 'enemy', turnsLeft, value: multiplier, instanceId, stat }]
}

// Debuff sobre el jugador (ej: Rey Goblin intimida reduciendo el ataque del jugador)
export function applyPlayerDebuff(
  stat: StatTarget,
  multiplier: number,
  existing: StatusEffect[],
  turnsLeft = 3,
): StatusEffect[] {
  // Si ya tiene ese debuff activo, refrescar turnos
  const withoutDebuff = existing.filter(e => !(e.type === 'debuff' && e.target === 'player' && e.stat === stat))
  return [...withoutDebuff, { type: 'debuff', target: 'player', turnsLeft, value: multiplier, stat }]
}

export function getPlayerPoisonInfo(effects: StatusEffect[]): { turnsLeft: number; damagePerTurn: number } | null {
  const poison = effects.find(e => e.type === 'poison')
  if (!poison) return null
  return { turnsLeft: poison.turnsLeft, damagePerTurn: poison.value }
}

// Lee el multiplicador acumulado de un stat del jugador desde los efectos activos
export function getPlayerStatMult(effects: StatusEffect[], stat: StatTarget): number {
  return effects
    .filter(e => e.target === 'player' && e.type === 'debuff' && e.stat === stat)
    .reduce((acc, e) => acc * e.value, 1)
}

// Lee el multiplicador acumulado de un stat de un enemigo desde los efectos activos
export function getEnemyStatMult(effects: StatusEffect[], instanceId: number, stat: StatTarget): number {
  return effects
    .filter(e => e.target === 'enemy' && e.type === 'buff' && e.instanceId === instanceId && e.stat === stat)
    .reduce((acc, e) => acc * e.value, 1)
}

// ─── Procesamiento por turno ──────────────────────────────────────────────────

export interface EnemyHPMap {
  [instanceId: number]: number
}

export interface ProcessEffectsResult {
  updatedEffects: StatusEffect[]
  enemyHPDeltas: EnemyHPMap
  playerHPDelta: number
  stunnedEnemyIds: number[]
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
        if (currentHP <= 0) continue

        const dmg = Math.max(1, Math.round(currentHP * effect.value))
        enemyHPDeltas[id] = (enemyHPDeltas[id] ?? 0) - dmg

        const name = enemyNames[id] ?? 'Enemigo'
        const pct  = Math.round(effect.value * 100)

        if (effect.turnsLeft > 1) {
          const nextEffect = {
            ...effect,
            turnsLeft: effect.turnsLeft - 1,
            value: Math.min(BURN_VALUE_MAX, effect.value + BURN_VALUE_STEP),
          }
          updatedEffects.push(nextEffect)
          const remaining = nextEffect.turnsLeft
          log.push(`🔥 ${name} sufre ${dmg} de daño por quemadura (${pct}%)! (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
          continue
        }
        log.push(`🔥 ${name} sufre ${dmg} de daño por quemadura (${pct}%)! (último turno)`)
        break
      }

      case 'poison': {
        if (effect.target === 'enemy') {
          const id = effect.instanceId!
          const currentHP = (enemyCurrentHPs[id] ?? 0) + (enemyHPDeltas[id] ?? 0)
          if (currentHP <= 0) continue
          enemyHPDeltas[id] = (enemyHPDeltas[id] ?? 0) - effect.value
          const name = enemyNames[id] ?? 'Enemigo'
          if (effect.turnsLeft > 1) {
            updatedEffects.push({ ...effect, turnsLeft: effect.turnsLeft - 1 })
            const remaining = effect.turnsLeft - 1
            log.push(`☠️ ${name} sufre ${effect.value} de daño por veneno! (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
          } else {
            log.push(`☠️ ${name} sufre ${effect.value} de daño por veneno! (último turno)`)
          }
        } else {
          playerHPDelta -= effect.value
          const remaining = effect.turnsLeft
          log.push(`☠️ El veneno te quema! -${effect.value} HP (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
          if (effect.turnsLeft > 1) updatedEffects.push({ ...effect, turnsLeft: effect.turnsLeft - 1 })
        }
        continue
      }

      case 'stun': {
        const id = effect.instanceId!
        const currentHP = enemyCurrentHPs[id] ?? 0
        if (currentHP <= 0) continue
        stunnedEnemyIds.push(id)
        const name = enemyNames[id] ?? 'Enemigo'
        const remaining = effect.turnsLeft
        log.push(`🔨 ${name} está aturdido! (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
        break
      }

      case 'buff': {
        // Buffs pasivos — solo decrementar turnos
        break
      }

      case 'debuff': {
        // Debuffs pasivos — solo decrementar turnos
        break
      }

      case 'confused': {
        const id = effect.instanceId!
        const currentHP = enemyCurrentHPs[id] ?? 0
        if (currentHP <= 0) continue
        const name = enemyNames[id] ?? 'Enemigo'
        const remaining = effect.turnsLeft - 1
        if (remaining > 0) log.push(`😵 ${name} está confundido! (${remaining} turno${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''})`)
        break
      }

    }

    if (effect.turnsLeft > 1) {
      updatedEffects.push({ ...effect, turnsLeft: effect.turnsLeft - 1 })
    }
  }

  return { updatedEffects, enemyHPDeltas, playerHPDelta, stunnedEnemyIds, log }
}