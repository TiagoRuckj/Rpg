// src/lib/game/enemyAi.ts
// ─── Sistema de IA de Enemigos ────────────────────────────────────────────────

import {
  AiTier,
  EnemyAction,
  EnemyActionType,
  EnemyAiState,
  EnemyActionResult,
  BossPhase,
  EnemyCombatState,
} from '@/types/game'

// ─── Contexto de combate ──────────────────────────────────────────────────────

export interface EnemyCombatContext {
  playerHP: number
  playerMaxHP: number
  playerStamina: number
  playerMaxStamina: number
  playerMana: number
  playerMaxMana: number
  playerActiveEffects: string[]
  selfHP: number
  selfMaxHP: number
  selfActiveEffects: string[]
  turn: number
  aliveEnemyCount: number
}

// ─── Debug logger (solo en development) ──────────────────────────────────────

// Los logs de IA se acumulan en un array y viajan al cliente via el resultado del action
// No usamos console.log porque enemyAi corre en el servidor (importado desde combatActions)
const _aiDebugLogs: Array<{ tier: string; enemyName: string; data: Record<string, unknown> }> = []

export function flushAiDebugLogs() {
  return _aiDebugLogs.splice(0)
}

function aiLog(tier: string, enemyName: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return
  _aiDebugLogs.push({ tier, enemyName, data })
}

// ─── Tier: dumb ───────────────────────────────────────────────────────────────
// Ataca siempre. Al llegar a energy_threshold, usa su habilidad especial.

function resolveDumb(
  actions: EnemyAction[],
  aiState: EnemyAiState,
  threshold: number,
  enemyName: string
): { action: EnemyAction; resetEnergy: boolean } {
  const nextEnergy = aiState.energy + 1

  if (nextEnergy >= threshold) {
    const special = actions
      .filter(a => a.type !== 'attack')
      .sort((a, b) => b.base_weight - a.base_weight)[0]
      ?? actions
        .filter(a => a.type === 'attack')
        .sort((a, b) => (b.effect.damage_multiplier ?? 1) - (a.effect.damage_multiplier ?? 1))[0]
    const action = special ?? actions[0]
    aiLog('dumb', enemyName, {
      reason: 'especial (umbral alcanzado)',
      energy: `${aiState.energy} → reset`,
      threshold,
      chosen: action.name,
      type: action.type,
    })
    return { action, resetEnergy: true }
  }

  const normal = actions
    .filter(a => a.type === 'attack')
    .sort((a, b) => (a.effect.damage_multiplier ?? 1) - (b.effect.damage_multiplier ?? 1))[0]
    ?? actions[0]
  aiLog('dumb', enemyName, {
    reason: 'ataque normal',
    energy: `${aiState.energy} → ${nextEnergy} / ${threshold}`,
    chosen: normal.name,
    type: normal.type,
  })
  return { action: normal, resetEnergy: false }
}

// ─── Tier: medium ─────────────────────────────────────────────────────────────
// Pesos contextuales — reacciona al estado sin anticipar.

function weightedSample(actions: EnemyAction[], weights: number[]): EnemyAction {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < actions.length; i++) {
    r -= weights[i]
    if (r <= 0) return actions[i]
  }
  return actions[actions.length - 1]
}

function resolveMedium(actions: EnemyAction[], ctx: EnemyCombatContext, availableEnergy: number, enemyName: string): EnemyAction {
  const selfHpPct   = ctx.selfHP   / ctx.selfMaxHP
  const playerHpPct = ctx.playerHP / ctx.playerMaxHP

  const weights = actions.map(a => {
    let w = a.base_weight
    if (a.type === 'recuperacion' && selfHpPct < 0.30) w += 40
    if (a.type === 'recuperacion' && selfHpPct < 0.50) w += 20
    if (a.type === 'attack' && ctx.playerActiveEffects.length > 0) w += 15
    if (a.type === 'attack' && playerHpPct < 0.25 && (a.effect.damage_multiplier ?? 1) > 1.2) w += 25
    if (ctx.turn % 2 === 0 && a.type === 'extra') w += 10
    return Math.max(1, w)
  })

  const chosen = weightedSample(actions, weights)
  aiLog('medium', enemyName, {
    selfHP: `${Math.round(selfHpPct * 100)}%`,
    playerHP: `${Math.round(playerHpPct * 100)}%`,
    playerEffects: ctx.playerActiveEffects,
    turn: ctx.turn,
    energy: availableEnergy,
    weights: actions.map((a, i) => `${a.name}(cost:${a.energy_cost ?? 0}):${weights[i]}`),
    chosen: chosen.name,
    type: chosen.subtype ? `${chosen.type}/${chosen.subtype}` : chosen.type,
    cost: chosen.energy_cost ?? 0,
  })
  return chosen
}

// ─── Tier: smart ──────────────────────────────────────────────────────────────
// Árbol de decisión generalizado por tipos y efectos — sin hardcodear nombres.

function resolveSmart(actions: EnemyAction[], ctx: EnemyCombatContext, availableEnergy: number, enemyName: string): EnemyAction {
  const selfHpPct   = ctx.selfHP   / ctx.selfMaxHP
  const playerHpPct = ctx.playerHP / ctx.playerMaxHP

  const healAction   = actions.find(a => a.type === 'recuperacion')
  const poisonAction = actions.find(a => a.type === 'extra' && a.effect.apply_effect === 'poison')
  const stunAction   = actions.find(a => a.type === 'extra' && a.effect.apply_effect === 'stun')
  const strongAtk    = actions
    .filter(a => a.type === 'attack')
    .sort((a, b) => (b.effect.damage_multiplier ?? 1) - (a.effect.damage_multiplier ?? 1))[0]
  const normalAtk    = actions
    .filter(a => a.type === 'attack')
    .sort((a, b) => (a.effect.damage_multiplier ?? 1) - (b.effect.damage_multiplier ?? 1))[0]

  const playerPoisoned = ctx.playerActiveEffects.includes('poison')
  const playerStunned  = ctx.playerActiveEffects.includes('stun')

  const logAndReturn = (reason: string, action: EnemyAction) => {
    aiLog('smart', enemyName, {
      reason,
      selfHP: `${Math.round(selfHpPct * 100)}%`,
      playerHP: `${Math.round(playerHpPct * 100)}%`,
      playerEffects: ctx.playerActiveEffects,
      stamina: `${ctx.playerStamina}/${ctx.playerMaxStamina}`,
      mana: `${ctx.playerMana}/${ctx.playerMaxMana}`,
      energy: availableEnergy,
      chosen: action.name,
      type: action.type,
      cost: action.energy_cost ?? 0,
    })
    return action
  }

  // 1. Curar si HP crítico (<20%)
  if (selfHpPct < 0.20 && healAction) return logAndReturn('curar_critico (<20%)', healAction)

  // 2. Remate si jugador casi muerto (<20%)
  if (playerHpPct < 0.20 && strongAtk) return logAndReturn('remate_jugador (<20%)', strongAtk)

  // 3. Stun si jugador tiene recursos altos y no está stunneado
  if (!playerStunned && stunAction &&
      ctx.playerStamina > ctx.playerMaxStamina * 0.6 &&
      ctx.playerMana    > ctx.playerMaxMana    * 0.6) {
    return logAndReturn('stun (recursos jugador altos)', stunAction)
  }

  // 4. Veneno si jugador no está envenenado y tiene HP alto
  if (!playerPoisoned && poisonAction && playerHpPct > 0.40) return logAndReturn('veneno (jugador sano)', poisonAction)

  // 5. Curar si HP moderado (<40%)
  if (selfHpPct < 0.40 && healAction) return logAndReturn('curar_moderado (<40%)', healAction)

  // 6. Ataque fuerte si jugador en HP medio
  if (playerHpPct < 0.50 && strongAtk && (strongAtk.effect.damage_multiplier ?? 1) > 1.3) {
    return logAndReturn('ataque_fuerte (jugador <50%)', strongAtk)
  }

  // 7. Fallback: ataque normal
  const fallback = normalAtk ?? actions[0]
  return logAndReturn('fallback (ataque_normal)', fallback)
}

// ─── Resolución de acción → EnemyActionResult ─────────────────────────────────

function buildActionResult(
  action: EnemyAction,
  enemyAttack: number,
  selfMaxHP: number,
  selfCurrentHP: number,
  capPlayerDamage: boolean
): EnemyActionResult {
  const log: string[] = []
  let damageToPlayer = 0
  let selfHeal = 0
  const newPlayerEffects: string[] = []
  let summonEnemyId: number | null = null

  switch (action.type) {
    case 'attack': {
      const mult = action.effect.damage_multiplier ?? 1.0
      const base = enemyAttack * mult
      damageToPlayer = Math.max(1, Math.round(base * (0.8 + Math.random() * 0.4)))
      log.push(`👹 ${action.label} por ${damageToPlayer} de daño!`)
      break
    }
    case 'extra': {
      if (action.effect.apply_effect) {
        newPlayerEffects.push(action.effect.apply_effect)
        log.push(`💀 ${action.label}!`)
      }
      if (action.effect.summon_enemy_id) {
        summonEnemyId = action.effect.summon_enemy_id
        log.push(`🔔 ${action.label}!`)
      }
      break
    }
    case 'recuperacion': {
      const pct = action.effect.heal_pct ?? 0.20
      selfHeal = Math.round(selfMaxHP * pct)
      const actualHeal = Math.min(selfHeal, selfMaxHP - selfCurrentHP)
      log.push(`💚 ${action.label} recupera ${actualHeal} HP!`)
      break
    }
    case 'buff': {
      log.push(`✨ ${action.label}!`)
      break
    }
    case 'debuff': {
      log.push(`⬇️ ${action.label}!`)
      break
    }
  }

  return { action, damageToPlayer, selfHeal, newPlayerEffects, summonEnemyId, capPlayerDamage, log }
}

// ─── Evaluación de fases de boss ──────────────────────────────────────────────

export function evaluateBossPhase(
  phases: BossPhase[],
  currentHP: number,
  maxHP: number,
  triggeredPhases: number[]
): BossPhase | null {
  const hpPct = currentHP / maxHP
  const sorted = [...phases].sort((a, b) => b.hp_threshold - a.hp_threshold)
  for (const phase of sorted) {
    if (hpPct <= phase.hp_threshold && !triggeredPhases.includes(phase.phase_order)) {
      return phase
    }
  }
  return null
}

// ─── Función principal ────────────────────────────────────────────────────────

export interface ResolveEnemyActionInput {
  enemy: EnemyCombatState
  availableActions: EnemyAction[]
  aiState: EnemyAiState
  ctx: EnemyCombatContext
  phases?: BossPhase[]
  activePhaseAction?: EnemyAction | null
  capPlayerDamage?: boolean
  energyThreshold?: number   // umbral de disparo para tier 'dumb'
  energyPerTurn?: number     // cuánta energía regenera este turno
}

export interface ResolveEnemyActionOutput {
  result: EnemyActionResult
  newAiState: EnemyAiState
}

export function resolveEnemyAction(input: ResolveEnemyActionInput): ResolveEnemyActionOutput {
  const { enemy, availableActions, aiState, ctx } = input
  const capPlayerDamage = input.capPlayerDamage ?? false
  const enemyName = enemy.enemy.name

  // Acción de fase prioritaria
  if (input.activePhaseAction) {
    if (process.env.NODE_ENV === 'development') console.log(`%c[AI:boss] ${enemyName}`, 'color:#f472b6;font-weight:bold', {
      reason: 'accion_de_fase',
      action: input.activePhaseAction.name,
      type: input.activePhaseAction.type,
    })
    const result = buildActionResult(
      input.activePhaseAction,
      enemy.enemy.stats.attack * (enemy.statMults?.attack_mult ?? 1),
      enemy.maxHP, enemy.currentHP, capPlayerDamage
    )
    return { result, newAiState: { ...aiState } }
  }

  // Sin acciones configuradas → ataque genérico (fallback legacy)
  if (!availableActions.length) {
    if (process.env.NODE_ENV === 'development') console.log(`%c[AI:legacy] ${enemyName}`, 'color:#9ca3af;font-weight:bold', {
      reason: 'sin_acciones_configuradas — fallback ataque simple',
      attack: enemy.enemy.stats.attack,
    })
    const fallback: EnemyAction = {
      id: -1, name: 'fallback',
      label: `${enemy.enemy.name} ataca`,
      type: 'attack', base_weight: 100,
      energy_cost: 0,
      effect: { damage_multiplier: 1.0 },
    }
    const result = buildActionResult(
      fallback,
      enemy.enemy.stats.attack * (enemy.statMults?.attack_mult ?? 1),
      enemy.maxHP, enemy.currentHP, capPlayerDamage
    )
    return { result, newAiState: { ...aiState } }
  }

  const effectiveAttack = enemy.enemy.stats.attack * (enemy.statMults?.attack_mult ?? 1)
  const energyPerTurn = input.energyPerTurn ?? 1
  const maxEnergy = aiState.maxEnergy

  // Regenerar energía este turno (con techo)
  const energyAfterRegen = Math.min(aiState.energy + energyPerTurn, maxEnergy)

  // Filtrar acciones que el enemigo puede pagar con su energía actual
  const affordableActions = availableActions.filter(a => (a.energy_cost ?? 0) <= energyAfterRegen)
  // Siempre hay al menos un ataque gratis disponible como fallback
  const actionsToUse = affordableActions.length > 0 ? affordableActions : availableActions.filter(a => a.type === 'attack')

  let chosenAction: EnemyAction
  let newEnergy = energyAfterRegen

  switch (aiState.tier) {
    case 'dumb': {
      const threshold = input.energyThreshold ?? 3
      const { action, resetEnergy } = resolveDumb(actionsToUse, aiState, threshold, enemyName)
      chosenAction = action
      newEnergy = resetEnergy ? energyAfterRegen - (action.energy_cost ?? 0) : energyAfterRegen
      break
    }
    case 'medium':
      chosenAction = resolveMedium(actionsToUse, ctx, energyAfterRegen, enemyName)
      newEnergy = energyAfterRegen - (chosenAction.energy_cost ?? 0)
      break
    case 'smart':
    case 'boss':
      chosenAction = resolveSmart(actionsToUse, ctx, energyAfterRegen, enemyName)
      newEnergy = energyAfterRegen - (chosenAction.energy_cost ?? 0)
      break
    default:
      chosenAction = availableActions.find(a => a.type === 'attack') ?? availableActions[0]
      newEnergy = energyAfterRegen - (chosenAction.energy_cost ?? 0)
      if (process.env.NODE_ENV === 'development') console.log(`%c[AI:unknown] ${enemyName}`, 'color:#9ca3af', {
        reason: 'tier_desconocido — ataque simple',
        tier: aiState.tier,
      })
  }

  const result = buildActionResult(
    chosenAction, effectiveAttack, enemy.maxHP, enemy.currentHP, capPlayerDamage
  )

  return { result, newAiState: { ...aiState, energy: Math.max(0, newEnergy), maxEnergy } }
}

// ─── Helper: inicializar aiState ──────────────────────────────────────────────

export function initAiState(tier: AiTier, maxEnergy = 5): EnemyAiState {
  return { tier, energy: 0, maxEnergy, activePhaseOrder: 0, triggeredPhases: [] }
}