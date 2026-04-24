import {
  PlayerStats, BossStats, PrimaryStats, ClassBonuses,
  EnemyType, EquippedGear, PlayerSkill, WeaponType, getWeaponAttackBonus,
} from '@/types/game'

export interface DamageResult {
  damage: number
  isCritical: boolean
  isOvercrit: boolean
  blocked: boolean
}

export interface CombatRoundResult {
  playerDamage: DamageResult
  enemyDamage: DamageResult
  newPlayerHP: number
  newEnemyHP: number
  newPlayerStamina: number
  playerDefeated: boolean
  enemyDefeated: boolean
  log: string[]
}

// Variación aleatoria ±20%
function randomVariation(base: number): number {
  const variation = 0.8 + Math.random() * 0.4
  return Math.round(base * variation)
}

// Sistema de crítico y overcrit
function rollCritical(baseCritChance: number, classCritBonus: number = 0): { isCritical: boolean; isOvercrit: boolean } {
  const chance = baseCritChance + classCritBonus

  if (chance >= 1.0) {
    const overflowChance = chance - 1.0
    const isOvercrit = overflowChance > 0 && Math.random() < overflowChance
    return { isCritical: true, isOvercrit }
  }

  const isCritical = Math.random() < chance
  return { isCritical, isOvercrit: false }
}

const CRIT_MULT = 1.75

function critMultiplier(isCritical: boolean, isOvercrit: boolean, critMult: number = CRIT_MULT): number {
  if (isOvercrit) return critMult * critMult
  if (isCritical) return critMult
  return 1.0
}

// Daño físico — reducido por defense del enemigo (salvo ignores_defense)
function calculatePhysicalDamage(
  attack: number,
  defense: number,
  baseCritChance: number,
  multiplier: number = 1,
  classCritBonus: number = 0,
  ignoresDefense: boolean = false,
  critMult: number = CRIT_MULT
): DamageResult {
  const reductionPct = ignoresDefense ? 0 : Math.min(0.75, defense / (defense + 200))
  const base = attack * multiplier * (1 - reductionPct)
  const varied = randomVariation(base)
  const { isCritical, isOvercrit } = rollCritical(baseCritChance, classCritBonus)
  const damage = Math.max(1, Math.round(varied * critMultiplier(isCritical, isOvercrit, critMult)))
  return { damage, isCritical, isOvercrit, blocked: false }
}

// Daño mágico — puro inteligencia, sin reducción por defense
function calculateMagicalDamage(
  inteligencia: number,
  multiplier: number,
  baseCritChance: number,
  classCritBonus: number = 0,
  critMult: number = CRIT_MULT
): DamageResult {
  const base = inteligencia * 2 * multiplier
  const varied = randomVariation(base)
  const { isCritical, isOvercrit } = rollCritical(baseCritChance, classCritBonus)
  const damage = Math.max(1, Math.round(varied * critMultiplier(isCritical, isOvercrit, critMult)))
  return { damage, isCritical, isOvercrit, blocked: false }
}

export function resolvePlayerAttack(
  playerStats: PlayerStats,
  primaryStats: PrimaryStats,
  bossStats: BossStats,
  currentEnemyHP: number,
  gear: EquippedGear,
  isSkill: boolean = false,
  damageMultiplier: number = 1,
  skillType: 'physical' | 'magical' | 'mixed' = 'physical',
  classBonuses?: ClassBonuses,
  enemyTypes?: EnemyType[],
  skillModifiers?: Pick<PlayerSkill, 'ignores_weapon' | 'ignores_defense' | 'ignores_class_bonus'>,
  staffMagicBonus: number = 0,
  weaponTypeDamageBonus: Partial<Record<string, number>> = {},
  critMult: number = CRIT_MULT,
  defenseIgnorePct: number = 0
): { damageResult: DamageResult; newEnemyHP: number } {
  let damageResult: DamageResult

  const classCritBonus = classBonuses?.crit_bonus ?? 0

  // Calcular multiplicador de tipo (clases + arma) antes del crit
  let typeMultiplier = 1
  if (enemyTypes && enemyTypes.length > 0) {
    for (const enemyType of enemyTypes) {
      const classBonus = classBonuses?.type_damage_bonus?.[enemyType] ?? 0
      const weaponBonus = weaponTypeDamageBonus[enemyType] ?? 0
      typeMultiplier += classBonus + weaponBonus
    }
  }

  if (isSkill && skillType === 'magical') {
    damageResult = calculateMagicalDamage(
      primaryStats.inteligencia, damageMultiplier * typeMultiplier, playerStats.crit_chance, classCritBonus, critMult
    )
    if (staffMagicBonus > 0) {
      damageResult = { ...damageResult, damage: Math.max(damageResult.damage, staffMagicBonus) }
    }
  } else {
    const multiplier = isSkill ? damageMultiplier : 1
    const weaponBonus = (skillModifiers?.ignores_weapon) ? getWeaponAttackBonus(gear) : 0
    const classAttackBonus = (skillModifiers?.ignores_class_bonus) ? 0 : (classBonuses?.attack ?? 0)
    const totalAttack = playerStats.attack - weaponBonus + classAttackBonus

    damageResult = calculatePhysicalDamage(
      totalAttack,
      bossStats.defense * (1 - defenseIgnorePct),
      playerStats.crit_chance,
      multiplier * typeMultiplier,
      classCritBonus,
      skillModifiers?.ignores_defense ?? false,
      critMult
    )
  }

  const newEnemyHP = Math.max(0, currentEnemyHP - damageResult.damage)
  return { damageResult, newEnemyHP }
}

export function resolveEnemyAttack(
  bossStats: BossStats,
  playerStats: PlayerStats,
  currentPlayerHP: number,
  isBlocking: boolean,
  consecutiveBlocks: number = 0
): { damageResult: DamageResult; newPlayerHP: number; blockFailed: boolean } {
  if (isBlocking) {
    const blockChance = Math.max(0.10, 0.95 - consecutiveBlocks * 0.15)
    const blockSuccess = Math.random() < blockChance
    if (blockSuccess) {
      return {
        damageResult: { damage: 0, isCritical: false, isOvercrit: false, blocked: true },
        newPlayerHP: currentPlayerHP,
        blockFailed: false,
      }
    }
  }

  const reductionPct = playerStats.defense / (playerStats.defense + 200)
  const base = bossStats.attack * (1 - reductionPct)
  const damage = Math.max(1, randomVariation(base))

  return {
    damageResult: { damage, isCritical: false, isOvercrit: false, blocked: false },
    newPlayerHP: Math.max(0, currentPlayerHP - damage),
    blockFailed: isBlocking,
  }
}

// ─── Weapon Passives ─────────────────────────────────────────────────────────

export interface WeaponPassiveResult {
  splashDamage: Record<number, number>
  executed: boolean
  stunned: boolean
  secondAttackDamage: number
  staffMagicBonus: number
  typeDamageBonus: Partial<Record<string, number>>
  critMultBonus: number
  defenseIgnorePct: number   // % de defensa ignorada (ej: 0.05 = ignora 5%)
  log: string[]
}

export interface WeaponPassiveContext {
  isSkill: boolean
  skillType: 'physical' | 'magical' | 'mixed' | undefined
  primaryDamage: number           // daño ya calculado del ataque principal
  targetCurrentHP: number         // HP del objetivo ANTES del ataque principal
  targetMaxHP: number
  targetInstanceId: number
  targetName: string
  targetEnemyTypes: string[]      // tipos del enemigo objetivo (para bonus por tipo)
  adjacentEnemies: { instanceId: number; name: string; currentHP: number; defense: number }[]
  playerAttack: number            // ataque total del jugador
  playerSuerte: number
  enemyDefense: number
  staffAttackBonus: number        // stats.attack del bastón
}

type WeaponPassiveHandler = (ctx: WeaponPassiveContext) => Partial<WeaponPassiveResult>

const EMPTY_PASSIVE_RESULT: WeaponPassiveResult = {
  splashDamage: {},
  executed: false,
  stunned: false,
  secondAttackDamage: 0,
  staffMagicBonus: 0,
  typeDamageBonus: {},
  critMultBonus: 0,
  defenseIgnorePct: 0,
  log: [],
}

// Registry global de pasivas — cada entrada es un handler identificado por string.
// Agregar una pasiva nueva = agregar una entrada acá + el ID en el stats.passives del item en DB.
export const PASSIVE_REGISTRY: Record<string, WeaponPassiveHandler> = {

  splash: (ctx) => {
    if (ctx.isSkill) return {}
    if (ctx.adjacentEnemies.length === 0) return {}
    const splashDamage: Record<number, number> = {}
    const log: string[] = []
    const splashBase = Math.round(ctx.primaryDamage * 0.15)
    for (const adj of ctx.adjacentEnemies) {
      const reductionPct = Math.min(0.75, adj.defense / (adj.defense + 200))
      const splashDmg = Math.max(1, Math.round(splashBase * (1 - reductionPct)))
      splashDamage[adj.instanceId] = splashDmg
      log.push(`⚔️ Daño en área a ${adj.name} por ${splashDmg}!`)
    }
    return { splashDamage, log }
  },

  execution: (ctx) => {
    if (ctx.isSkill) return {}
    const hpPct = ctx.targetCurrentHP / ctx.targetMaxHP
    if (hpPct >= 0.15) return {}
    const executed = Math.random() < 0.50
    if (!executed) return {}
    return {
      executed: true,
      log: [`💀 ¡EJECUCIÓN! ${ctx.targetName} fue eliminado instantáneamente!`],
    }
  },

  stun: (ctx) => {
    if (ctx.isSkill) return {}
    const stunned = Math.random() < 0.07
    if (!stunned) return {}
    return {
      stunned: true,
      log: [`🔨 ¡${ctx.targetName} retrocede y no podrá atacar este turno!`],
    }
  },

  double_strike: (ctx) => {
    if (ctx.isSkill) return {}
    if (Math.random() >= 0.10) return {}
    const reductionPct = Math.min(0.75, ctx.enemyDefense / (ctx.enemyDefense + 50))
    const base = ctx.playerAttack * (1 - reductionPct)
    const secondDmg = Math.max(1, Math.round((0.8 + Math.random() * 0.4) * base))
    return {
      secondAttackDamage: secondDmg,
      log: [`🏹 ¡Ataque doble! Segundo golpe por ${secondDmg}!`],
    }
  },

  staff_magic_boost: (ctx) => {
    if (!ctx.isSkill || ctx.skillType !== 'magical') return {}
    return { staffMagicBonus: ctx.staffAttackBonus * 2 }
  },

  goblin_slayer: (ctx) => {
    if (!ctx.targetEnemyTypes.includes('goblin')) return {}
    return { typeDamageBonus: { goblin: 0.5 } }
  },

  goblin_assassin: (ctx) => {
    if (!ctx.targetEnemyTypes.includes('goblin')) return {}
    return { typeDamageBonus: { goblin: 0.20 } }
  },

  sharpened: (ctx) => {
    return { defenseIgnorePct: 0.05 }
  },

  bow_crit: (ctx) => {
    return { critMultBonus: 0.25 }  // +25% de daño crítico (se suma al baseCritMult)
  },

}

// Pasivas por defecto según tipo de arma — se usan si el item no tiene stats.passives definido.
// Esto garantiza que los items existentes en DB sigan funcionando sin migraciones.
export const WEAPON_PASSIVES: Partial<Record<WeaponType, string[]>> = {
  sword:  ['splash'],
  axe:    ['execution'],
  hammer: ['stun'],
  spear:  ['double_strike'],
  staff:  ['staff_magic_boost'],
  bow:    ['bow_crit'],
}

// Labels y defaults exportados desde archivo separado para uso en cliente
export { PASSIVE_LABELS, WEAPON_PASSIVES } from '@/lib/game/passiveLabels'

export function resolveWeaponPassive(
  weaponType: WeaponType,
  ctx: WeaponPassiveContext,
  itemPassives?: string[],
): WeaponPassiveResult {
  const passiveIds = itemPassives ?? WEAPON_PASSIVES[weaponType] ?? []
  const result: WeaponPassiveResult = { ...EMPTY_PASSIVE_RESULT, splashDamage: {}, typeDamageBonus: {}, critMultBonus: 0, log: [] }
  for (const id of passiveIds) {
    const handler = PASSIVE_REGISTRY[id]
    if (!handler) continue
    const partial = handler(ctx)
    if (partial.executed)           result.executed = true
    if (partial.stunned)            result.stunned = true
    if (partial.secondAttackDamage) result.secondAttackDamage = partial.secondAttackDamage
    if (partial.staffMagicBonus)    result.staffMagicBonus = partial.staffMagicBonus
    if (partial.splashDamage)       Object.assign(result.splashDamage, partial.splashDamage)
    if (partial.typeDamageBonus)    Object.assign(result.typeDamageBonus, partial.typeDamageBonus)
    if (partial.critMultBonus)   result.critMultBonus += partial.critMultBonus
    if (partial.defenseIgnorePct)   result.defenseIgnorePct = Math.min(1, result.defenseIgnorePct + partial.defenseIgnorePct)
    if (partial.log)                result.log.push(...partial.log)
  }
  return result
}

export function buildCombatLog(
  playerName: string,
  bossName: string,
  playerDamage: DamageResult,
  enemyDamage: DamageResult,
  action: 'attack' | 'skill' | 'block',
  skillName?: string
): string[] {
  const log: string[] = []

  if (action === 'block') {
    log.push(`🛡️ ${playerName} toma posición defensiva!`)
  } else if (action === 'skill' && skillName) {
    const critText = playerDamage.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamage.isCritical ? ' ⚡ CRÍTICO!' : ''
    log.push(`✨ ${playerName} usa ${skillName} por ${playerDamage.damage} de daño!${critText}`)
  } else {
    const critText = playerDamage.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamage.isCritical ? ' ⚡ CRÍTICO!' : ''
    log.push(`⚔️ ${playerName} ataca al ${bossName} por ${playerDamage.damage} de daño!${critText}`)
  }

  if (enemyDamage.blocked) {
    log.push(`🛡️ Bloqueaste el ataque de ${bossName}!`)
  } else if (action === 'block') {
    log.push(`💥 ¡Bloqueo fallido! ${bossName} te golpea por ${enemyDamage.damage} de daño!`)
  } else {
    log.push(`👹 ${bossName} contraataca por ${enemyDamage.damage} de daño!`)
  }

  return log
}

// ─── Log de turno multi-enemigo ───────────────────────────────────────────────

export interface TurnLogInput {
  playerName: string
  action: 'attack' | 'skill' | 'block' | 'item'
  skillName?: string
  skillUsed?: { name: string }
  targetName: string
  playerDamage: DamageResult
  enemyCount: number          // cantidad de enemigos vivos
  passiveLog: string[]
  burnLog: string[]
  newBurnApplied: boolean
  burnTargetName: string
}

export function buildTurnLog(input: TurnLogInput): {
  attackLog: string[]
  shouldPrepend: boolean   // true = unshift (múltiples enemigos), false = push (1 enemigo)
} {
  const { playerName, action, targetName, playerDamage, enemyCount } = input
  const critText = playerDamage.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamage.isCritical ? ' ⚡ CRÍTICO!' : ''

  const attackLog: string[] = []

  if (action === 'block') {
    attackLog.push(`🛡️ ${playerName} toma posición defensiva!`)
  } else if (action === 'skill' && input.skillName) {
    attackLog.push(`✨ ${playerName} usa ${input.skillName} en ${targetName} por ${playerDamage.damage} de daño!${critText}`)
  } else if (action === 'attack') {
    attackLog.push(`⚔️ ${playerName} ataca a ${targetName} por ${playerDamage.damage} de daño!${critText}`)
  }

  if (input.newBurnApplied) {
    attackLog.push(`🔥 ¡${input.burnTargetName} está en llamas! Sufrirá daño por 3 turnos.`)
  }

  return {
    attackLog: [...attackLog, ...input.passiveLog, ...input.burnLog],
    shouldPrepend: enemyCount > 1,
  }
}

// ─── Aplicar resultados de weapon passive al mapa de HPs ────────────────────

export interface ApplyPassiveInput {
  passive: WeaponPassiveResult
  target: { instanceId: number }
  liveEnemies: { instanceId: number; name: string; alive: boolean }[]
  updatedEnemyHPs: Record<number, number>
  defeatedEnemyInstanceIds: number[]
  stunnedEnemyIds: number[]
}

export interface ApplyPassiveOutput {
  updatedEnemyHPs: Record<number, number>
  defeatedEnemyInstanceIds: number[]
  newStunnedEnemyIds: number[]
  defeatLog: string[]
}

export function applyWeaponPassiveResults(input: ApplyPassiveInput): ApplyPassiveOutput {
  const { passive, target, liveEnemies } = input
  const updatedEnemyHPs = { ...input.updatedEnemyHPs }
  const defeatedEnemyInstanceIds = [...input.defeatedEnemyInstanceIds]
  const newStunnedEnemyIds = [...input.stunnedEnemyIds]
  const defeatLog: string[] = []

  // Espada: splash a adyacentes
  for (const [idStr, dmg] of Object.entries(passive.splashDamage)) {
    const id = Number(idStr)
    if (updatedEnemyHPs[id] !== undefined) {
      updatedEnemyHPs[id] = Math.max(0, updatedEnemyHPs[id] - dmg)
    }
  }

  // Hacha: ejecución
  if (passive.executed) {
    updatedEnemyHPs[target.instanceId] = 0
  }

  // Martillo: stun
  if (passive.stunned) {
    newStunnedEnemyIds.push(target.instanceId)
  }

  // Lanza: segundo ataque
  if (passive.secondAttackDamage > 0) {
    const secondTargetId = updatedEnemyHPs[target.instanceId] <= 0
      ? liveEnemies.find(e => e.instanceId !== target.instanceId)?.instanceId
      : target.instanceId
    if (secondTargetId !== undefined && updatedEnemyHPs[secondTargetId] !== undefined) {
      updatedEnemyHPs[secondTargetId] = Math.max(0, updatedEnemyHPs[secondTargetId] - passive.secondAttackDamage)
    }
  }

  // Registrar nuevos derrotados
  for (const e of liveEnemies) {
    if (updatedEnemyHPs[e.instanceId] <= 0 && !defeatedEnemyInstanceIds.includes(e.instanceId)) {
      defeatedEnemyInstanceIds.push(e.instanceId)
      defeatLog.push(`🏆 ¡Derrotaste a ${e.name}!`)
    }
  }

  return { updatedEnemyHPs, defeatedEnemyInstanceIds, newStunnedEnemyIds, defeatLog }
}
// ─── Costo de curación en el hub ─────────────────────────────────────────────
// Primeros 100 HP gratis, 2 gold por HP adicional
export function calcHealCost(missingHP: number): number {
  if (missingHP <= 100) return 0
  return Math.ceil((missingHP - 100) * 2)
}