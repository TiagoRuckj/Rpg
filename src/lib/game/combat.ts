import {
  PlayerStats, BossStats, PrimaryStats, ClassBonuses,
  EnemyType, EquippedGear, PlayerSkill, WeaponType, critChance, getWeaponAttackBonus,
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
function rollCritical(suerte: number, classCritBonus: number = 0): { isCritical: boolean; isOvercrit: boolean } {
  const chance = critChance(suerte) + classCritBonus

  if (chance >= 1.0) {
    const overflowChance = chance - 1.0
    const isOvercrit = overflowChance > 0 && Math.random() < overflowChance
    return { isCritical: true, isOvercrit }
  }

  const isCritical = Math.random() < chance
  return { isCritical, isOvercrit: false }
}

function critMultiplier(isCritical: boolean, isOvercrit: boolean): number {
  if (isOvercrit) return 2.0
  if (isCritical) return 1.75
  return 1.0
}

// Daño físico — reducido por defense del enemigo (salvo ignores_defense)
function calculatePhysicalDamage(
  attack: number,
  defense: number,
  suerte: number,
  multiplier: number = 1,
  classCritBonus: number = 0,
  ignoresDefense: boolean = false
): DamageResult {
  const reductionPct = ignoresDefense ? 0 : Math.min(0.75, defense / (defense + 50))
  const base = attack * multiplier * (1 - reductionPct)
  const varied = randomVariation(base)
  const { isCritical, isOvercrit } = rollCritical(suerte, classCritBonus)
  const damage = Math.max(1, Math.round(varied * critMultiplier(isCritical, isOvercrit)))
  return { damage, isCritical, isOvercrit, blocked: false }
}

// Daño mágico — puro inteligencia, sin reducción por defense
function calculateMagicalDamage(
  inteligencia: number,
  multiplier: number,
  suerte: number,
  classCritBonus: number = 0
): DamageResult {
  const base = inteligencia * 2 * multiplier
  const varied = randomVariation(base)
  const { isCritical, isOvercrit } = rollCritical(suerte, classCritBonus)
  const damage = Math.max(1, Math.round(varied * critMultiplier(isCritical, isOvercrit)))
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
  staffMagicBonus: number = 0    // bastón: bonus de daño mínimo a hechizos mágicos
): { damageResult: DamageResult; newEnemyHP: number } {
  let damageResult: DamageResult

  const classCritBonus = classBonuses?.crit_bonus ?? 0

  if (isSkill && skillType === 'magical') {
    damageResult = calculateMagicalDamage(
      primaryStats.inteligencia, damageMultiplier, primaryStats.suerte, classCritBonus
    )
    // Bastón: garantizar daño mínimo = staffMagicBonus
    if (staffMagicBonus > 0) {
      damageResult = { ...damageResult, damage: Math.max(damageResult.damage, staffMagicBonus) }
    }
  } else {
    const multiplier = isSkill ? damageMultiplier : 1

    // Attack base del jugador:
    // - Si ignores_weapon: restar el bonus del arma equipada
    // - Si ignores_class_bonus: no sumar el bonus de clase
    const weaponBonus = (skillModifiers?.ignores_weapon) ? getWeaponAttackBonus(gear) : 0
    const classAttackBonus = (skillModifiers?.ignores_class_bonus) ? 0 : (classBonuses?.attack ?? 0)
    const totalAttack = playerStats.attack - weaponBonus + classAttackBonus

    damageResult = calculatePhysicalDamage(
      totalAttack,
      bossStats.defense,
      primaryStats.suerte,
      multiplier,
      classCritBonus,
      skillModifiers?.ignores_defense ?? false
    )
  }

  // Bonus de daño por tipo de enemigo
  if (classBonuses?.type_damage_bonus && enemyTypes && enemyTypes.length > 0) {
    let typeMultiplier = 1
    for (const enemyType of enemyTypes) {
      const bonus = classBonuses.type_damage_bonus[enemyType]
      if (bonus) typeMultiplier += bonus
    }
    damageResult = {
      ...damageResult,
      damage: Math.round(damageResult.damage * typeMultiplier),
    }
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

  const reductionPct = playerStats.defense / (playerStats.defense + 50)
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
  // Espada: daño splash a adyacentes (map instanceId → damage)
  splashDamage: Record<number, number>
  // Hacha: ejecutar al objetivo (solo si HP < 15%)
  executed: boolean
  // Martillo: stun al objetivo (no ataca este turno)
  stunned: boolean
  // Lanza: segundo ataque (damage ya calculado, 0 si no triggereo)
  secondAttackDamage: number
  // Bastón: bonus de daño mínimo al hechizo (se suma externamente)
  staffMagicBonus: number
  log: string[]
}

export function resolveWeaponPassive(
  weaponType: WeaponType,
  isSkill: boolean,
  skillType: 'physical' | 'magical' | 'mixed' | undefined,
  primaryDamage: number,           // daño ya calculado del ataque principal
  targetCurrentHP: number,         // HP del objetivo ANTES del ataque principal
  targetMaxHP: number,
  targetInstanceId: number,
  targetName: string,
  adjecentEnemies: { instanceId: number; name: string; currentHP: number; defense: number }[],
  playerAttack: number,            // ataque total del jugador (para lanza)
  playerSuerte: number,
  enemyDefense: number,
  staffAttackBonus: number,        // stats.attack del bastón
): WeaponPassiveResult {
  const result: WeaponPassiveResult = {
    splashDamage: {},
    executed: false,
    stunned: false,
    secondAttackDamage: 0,
    staffMagicBonus: 0,
    log: [],
  }

  switch (weaponType) {
    case 'sword': {
      if (isSkill) break
      if (adjecentEnemies.length === 0) break
      const splashBase = Math.round(primaryDamage * 0.15)
      for (const adj of adjecentEnemies) {
        const reductionPct = Math.min(0.75, adj.defense / (adj.defense + 50))
        const splashDmg = Math.max(1, Math.round(splashBase * (1 - reductionPct)))
        result.splashDamage[adj.instanceId] = splashDmg
        result.log.push(`⚔️ Daño en área a ${adj.name} por ${splashDmg}!`)
      }
      break
    }

    case 'axe': {
      // Solo ataques normales (no skills)
      if (isSkill) break
      const hpPct = targetCurrentHP / targetMaxHP
      if (hpPct < 0.15) {
        const executed = Math.random() < 0.50
        if (executed) {
          result.executed = true
          result.log.push(`💀 ¡EJECUCIÓN! ${targetName} fue eliminado instantáneamente!`)
        }
      }
      break
    }

    case 'hammer': {
      // Solo ataques normales
      if (isSkill) break
      const stunned = Math.random() < 0.07
      if (stunned) {
        result.stunned = true
        result.log.push(`🔨 ¡${targetName} retrocede y no podrá atacar este turno!`)
      }
      break
    }

    case 'spear': {
      const triggered = Math.random() < 0.10
      if (!triggered) break
      // Segundo ataque: daño normal sin variación crítica extra (simplificado)
      const reductionPct = Math.min(0.75, enemyDefense / (enemyDefense + 50))
      const base = playerAttack * (1 - reductionPct)
      const secondDmg = Math.max(1, Math.round((0.8 + Math.random() * 0.4) * base))
      result.secondAttackDamage = secondDmg
      result.log.push(`🏹 ¡Ataque doble! Segundo golpe por ${secondDmg}!`)
      break
    }

    case 'staff': {
      // Solo skills mágicas
      if (!isSkill || skillType !== 'magical') break
      result.staffMagicBonus = staffAttackBonus * 2
      // No logueamos aquí — se suma silenciosamente al daño del hechizo
      break
    }
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

