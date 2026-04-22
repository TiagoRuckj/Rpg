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

// ─── Helper: selección de habilidad objetivo ─────────────────────────────────
// Elige aleatoriamente entre las habilidades que cuestan energía (las "especiales").
// Se llama cuando nextActionId es null — al inicio o después de usar una habilidad.

function pickNextSpecial(actions: EnemyAction[]): EnemyAction | null {
  const specials = actions.filter(a => (a.energy_cost ?? 0) > 0)
  if (specials.length === 0) return null
  return specials[Math.floor(Math.random() * specials.length)]
}

// ─── Tier: dumb ───────────────────────────────────────────────────────────────
// Elige una habilidad objetivo al inicio (o tras usarla) y acumula energía hacia ella.
// Cuando tiene energía suficiente la usa y elige la siguiente.

function resolveDumb(
  actions: EnemyAction[],
  aiState: EnemyAiState,
  currentEnergy: number,
  enemyName: string,
  maxEnergy: number,
): { action: EnemyAction; resetEnergy: boolean; nextActionId: number | null } {
  const normalAttack = actions
    .filter(a => a.type === 'attack' && (a.energy_cost ?? 0) === 0)
    .sort((a, b) => (a.effect.damage_multiplier ?? 1) - (b.effect.damage_multiplier ?? 1))[0]
    ?? actions.filter(a => a.type === 'attack')[0]
    ?? actions[0]

  // Resolver o elegir la habilidad objetivo
  let target = aiState.nextActionId !== null
    ? actions.find(a => a.id === aiState.nextActionId) ?? null
    : null

  if (!target) {
    target = pickNextSpecial(actions)
  }

  // Si no hay especiales, siempre ataque normal
  if (!target) {
    aiLog('dumb', enemyName, {
      reason: 'sin habilidades — ataque normal',
      energy: `${currentEnergy} → ${Math.min(currentEnergy + 1, maxEnergy)}`,
      maxEnergy,
      chosen: normalAttack.name,
      type: normalAttack.type,
    })
    return { action: normalAttack, resetEnergy: false, nextActionId: null }
  }

  const targetCost = target.energy_cost ?? 0

  // Tiene energía suficiente — usar la habilidad objetivo
  if (currentEnergy >= targetCost) {
    aiLog('dumb', enemyName, {
      reason: `energía lista — ${target.name}`,
      energy: `${currentEnergy} → 0`,
      maxEnergy,
      chosen: target.name,
      type: target.type,
    })
    return { action: target, resetEnergy: true, nextActionId: null }
  }

  // Aún acumulando
  aiLog('dumb', enemyName, {
    reason: `acumulando para ${target.name} (necesita ${targetCost})`,
    energy: `${currentEnergy} → ${Math.min(currentEnergy + 1, targetCost)}/${targetCost}`,
    maxEnergy,
    chosen: normalAttack.name,
    type: normalAttack.type,
  })
  return { action: normalAttack, resetEnergy: false, nextActionId: target.id }
}

// ─── Tier: medium ─────────────────────────────────────────────────────────────
// Árbol de decisión con tres zonas de HP:
//
//   HP > 50%  → ataque fuerte si puede pagarlo, si no ataque normal
//   HP 30-50% → ataque fuerte solo si después de pagarlo queda energía para curarse
//               si no, ataque normal acumulando energía
//   HP < 30%  → curación si puede pagarla, si no ataque normal esperando energía

function resolveMedium(
  actions: EnemyAction[],
  aiState: EnemyAiState,
  ctx: EnemyCombatContext,
  currentEnergy: number,
  enemyName: string,
  maxEnergy: number,
): { action: EnemyAction; resetEnergy: boolean; nextActionId: number | null } {
  const selfHpPct = ctx.selfHP / ctx.selfMaxHP

  const healAction = actions
    .filter(a => a.type === 'recuperacion')
    .sort((a, b) => (b.effect.heal_pct ?? 0) - (a.effect.heal_pct ?? 0))[0]

  const nonHealActions = actions.filter(a => a.type !== 'recuperacion' && (a.energy_cost ?? 0) > 0)

  const normalAttack = actions
    .filter(a => a.type === 'attack' && (a.energy_cost ?? 0) === 0)
    .sort((a, b) => (a.effect.damage_multiplier ?? 1) - (b.effect.damage_multiplier ?? 1))[0]
    ?? actions.filter(a => a.type === 'attack')[0]
    ?? actions[0]

  const healCost = healAction ? (healAction.energy_cost ?? 0) : Infinity
  const canHeal  = currentEnergy >= healCost

  const logAndReturn = (reason: string, action: EnemyAction, reset: boolean, nextId: number | null) => {
    aiLog('medium', enemyName, {
      reason,
      energy: `${currentEnergy}`,
      maxEnergy,
      selfHP: `${Math.round(selfHpPct * 100)}`,
      playerHP: `${Math.round((ctx.playerHP / ctx.playerMaxHP) * 100)}`,
      chosen: action.name,
      type: action.type,
    })
    return { action, resetEnergy: reset, nextActionId: nextId }
  }

  // ── HP < 30% — restauración prioritaria, cancela cualquier otra intención ──
  if (selfHpPct < 0.30) {
    if (!healAction) {
      // No tiene restauración — ataque normal
      return logAndReturn('HP crítico (sin restauración)', normalAttack, false, null)
    }
    if (canHeal) return logAndReturn('HP crítico — restauración', healAction, true, null)
    return logAndReturn('HP crítico — acumulando para restauración', normalAttack, false, healAction.id)
  }

  // ── HP 30-50% — baraja skills no-restauración, pero reserva energía para curar ──
  if (selfHpPct < 0.50) {
    if (!healAction) {
      // Sin restauración — comportarse como zona alta
    } else {
      // Resolver o elegir skill objetivo (excluyendo restauración)
      let target = aiState.nextActionId !== null && aiState.nextActionId !== healAction.id
        ? actions.find(a => a.id === aiState.nextActionId) ?? null
        : null
      if (!target && nonHealActions.length > 0) {
        target = nonHealActions[Math.floor(Math.random() * nonHealActions.length)]
      }

      if (target) {
        const targetCost = target.energy_cost ?? 0
        const canUseAndStillHeal = currentEnergy >= targetCost && (currentEnergy - targetCost) >= healCost
        if (canUseAndStillHeal) return logAndReturn('skill + reserva para curar', target, true, null)
        // No puede usar la skill sin comprometer la curación — acumular
        return logAndReturn('vida media — acumulando (reservando para curar)', normalAttack, false, target.id)
      }
    }
  }

  // ── HP > 50% — baraja cualquier skill excepto restauración ──
  let target = aiState.nextActionId !== null
    ? actions.find(a => a.id === aiState.nextActionId && a.type !== 'recuperacion') ?? null
    : null
  if (!target && nonHealActions.length > 0) {
    target = nonHealActions[Math.floor(Math.random() * nonHealActions.length)]
  }

  if (!target) {
    // Solo tiene restauración o sin skills — ataque normal
    return logAndReturn('sin skills ofensivas — ataque normal', normalAttack, false, null)
  }

  const targetCost = target.energy_cost ?? 0
  if (currentEnergy >= targetCost) return logAndReturn(`HP alto — ${target.name}`, target, true, null)
  return logAndReturn(`HP alto — acumulando para ${target.name}`, normalAttack, false, target.id)
}

// ─── Tier: smart ──────────────────────────────────────────────────────────────
// Analiza su arsenal y el estado del combate para tomar decisiones situacionales.
// Prioridades: curación > remate > reacción defensiva > control > presión ofensiva > acumular

function resolveSmart(
  actions: EnemyAction[],
  ctx: EnemyCombatContext,
  currentEnergy: number,
  enemyName: string,
  maxEnergy: number,
): EnemyAction {
  const selfHpPct   = ctx.selfHP   / ctx.selfMaxHP
  const playerHpPct = ctx.playerHP / ctx.playerMaxHP

  // ── Clasificar arsenal ────────────────────────────────────────────────────
  const healAction    = actions.filter(a => a.type === 'recuperacion')
                               .sort((a, b) => (b.effect.heal_pct ?? 0) - (a.effect.heal_pct ?? 0))[0]
  const offensiveBuff = actions.filter(a => a.type === 'buff' && (a.effect.stat_target === 'attack' || a.effect.stat_target === 'damage'))
                               .sort((a, b) => (a.energy_cost ?? 0) - (b.energy_cost ?? 0))[0]
  const defensiveBuff = actions.filter(a => a.type === 'buff' && (a.effect.stat_target === 'defense' || a.effect.stat_target === 'resistance'))
                               .sort((a, b) => (a.energy_cost ?? 0) - (b.energy_cost ?? 0))[0]
  const magicDebuff   = actions.filter(a => a.type === 'debuff' && (a.effect.stat_target === 'magic' || a.effect.stat_target === 'mana'))
                               .sort((a, b) => (a.energy_cost ?? 0) - (b.energy_cost ?? 0))[0]
  const generalDebuff = actions.filter(a => a.type === 'debuff')
                               .sort((a, b) => (a.energy_cost ?? 0) - (b.energy_cost ?? 0))[0]
  const strongAtk     = actions.filter(a => a.type === 'attack' && (a.effect.damage_multiplier ?? 1) > 1.0)
                               .sort((a, b) => (b.effect.damage_multiplier ?? 1) - (a.effect.damage_multiplier ?? 1))[0]
  const normalAtk     = actions.filter(a => a.type === 'attack')
                               .sort((a, b) => (a.effect.damage_multiplier ?? 1) - (b.effect.damage_multiplier ?? 1))[0]
                               ?? actions[0]

  // ── Helpers ───────────────────────────────────────────────────────────────
  const canAfford = (a: EnemyAction | undefined): a is EnemyAction =>
    !!a && currentEnergy >= (a.energy_cost ?? 0)

  const playerUsesMagic = ctx.playerMana > 0 && ctx.playerMana < ctx.playerMaxMana
  const selfPoisoned    = ctx.selfActiveEffects.includes('poison')
  const isEarlyGame     = ctx.turn <= 2
  const buffApplied     = ctx.selfActiveEffects.includes('buff')
  const debuffApplied   = ctx.playerActiveEffects.includes('debuff')

  const logAndReturn = (reason: string, action: EnemyAction) => {
    aiLog('smart', enemyName, {
      reason,
      energy: `${currentEnergy}`,
      maxEnergy,
      selfHP: `${Math.round(selfHpPct * 100)}`,
      playerHP: `${Math.round(playerHpPct * 100)}`,
      chosen: action.name,
      type: action.type,
    })
    return action
  }

  // ── 1. Modo desesperado: HP crítico y curación no viable ─────────────────
  // Si estoy muy bajo y curarme no cambia el resultado, todo el daño posible
  if (selfHpPct < 0.20 && canAfford(healAction)) {
    return logAndReturn('HP crítico — curación de emergencia', healAction)
  }
  if (selfHpPct < 0.15 && canAfford(strongAtk)) {
    return logAndReturn('HP crítico sin curación — todo el daño posible', strongAtk)
  }

  // ── 2. Remate: jugador casi muerto ────────────────────────────────────────
  if (playerHpPct < 0.25 && canAfford(strongAtk)) {
    return logAndReturn('remate — jugador débil', strongAtk)
  }

  // ── 3. Curación preventiva: HP bajo-medio ─────────────────────────────────
  if (selfHpPct < 0.40 && canAfford(healAction)) {
    return logAndReturn('curación preventiva — HP bajo', healAction)
  }

  // ── 4. Apertura: buffeo ofensivo en primeros turnos ──────────────────────
  if (isEarlyGame && !buffApplied && canAfford(offensiveBuff)) {
    return logAndReturn('apertura — buff ofensivo', offensiveBuff)
  }

  // ── 5. Reacción defensiva: buff defensivo si el jugador pega fuerte ───────
  // El jugador "pega fuerte" si causó más del 15% del HP máximo en daño reciente
  const playerHitHard = selfHpPct < 0.70 && (1 - selfHpPct) > 0.15
  if (playerHitHard && !buffApplied && canAfford(defensiveBuff)) {
    return logAndReturn('reacción defensiva — buff defensivo', defensiveBuff)
  }

  // ── 6. Debuff mágico: jugador usa magia y no está debuffeado ─────────────
  if (playerUsesMagic && !debuffApplied && canAfford(magicDebuff)) {
    return logAndReturn('debuff mágico — reducir daño mágico', magicDebuff)
  }

  // ── 7. Debuff general: jugador sano y sin debuff activo ──────────────────
  if (playerHpPct > 0.60 && !debuffApplied && canAfford(generalDebuff)) {
    return logAndReturn('debuff general — debilitar al rival', generalDebuff)
  }

  // ── 8. Presión ofensiva: jugador en rango medio ───────────────────────────
  if (playerHpPct < 0.60 && canAfford(strongAtk)) {
    return logAndReturn('presión ofensiva — ataque fuerte', strongAtk)
  }

  // ── 9. Ataque fuerte si puede ─────────────────────────────────────────────
  if (canAfford(strongAtk)) {
    return logAndReturn('ataque fuerte', strongAtk)
  }

  // ── 10. Fallback: ataque normal acumulando ────────────────────────────────
  return logAndReturn('acumulando energía', normalAtk)
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
      // Daño bruto — variación y defensa del jugador se aplican en combatActions
      damageToPlayer = Math.round(enemyAttack * mult)
      // El log con el daño real lo genera combatActions después de resolveEnemyAttack
      log.push(`👹 ${action.label}`)
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
      // Buff sobre el propio enemigo — el efecto se aplica en combatActions via newEnemyEffects
      if (action.effect.stat_target && action.effect.stat_mult) {
        newPlayerEffects.push(`enemy_buff:${action.effect.stat_target}:${action.effect.stat_mult}`)
      }
      log.push(`✨ ${action.label}!`)
      break
    }
    case 'debuff': {
      // Debuff sobre el jugador — el efecto se aplica en combatActions via newPlayerEffects
      if (action.effect.stat_target && action.effect.stat_mult) {
        newPlayerEffects.push(`player_debuff:${action.effect.stat_target}:${action.effect.stat_mult}`)
      } else if (action.effect.apply_effect) {
        newPlayerEffects.push(action.effect.apply_effect)
      }
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

  // Sin acciones configuradas → usar ataque básico genérico como única acción
  // Pasa por resolveDumb igual que cualquier otro enemigo para mantener energía consistente
  const effectiveActions: EnemyAction[] = availableActions.length > 0
    ? availableActions
    : [{
        id: -1, name: 'ataque_basico',
        label: `${enemy.enemy.name} ataca`,
        type: 'attack', base_weight: 100,
        energy_cost: 0,
        effect: { damage_multiplier: 1.0 },
      }]

  const effectiveAttack = enemy.enemy.stats.attack * (enemy.statMults?.attack_mult ?? 1)
  const energyPerTurn = input.energyPerTurn ?? 1
  const maxEnergy = aiState.maxEnergy
  const currentEnergy = aiState.energy  // energía ANTES de actuar — se suma al final del turno

  // Normalizar tiers legacy o desconocidos a smart
  const knownTiers: AiTier[] = ['dumb', 'medium', 'smart']
  const effectiveTier: AiTier = knownTiers.includes(aiState.tier) ? aiState.tier : 'smart'

  let chosenAction: EnemyAction = effectiveActions.find(a => a.type === 'attack') ?? effectiveActions[0]
  let newEnergy: number = Math.min(currentEnergy + energyPerTurn, maxEnergy)

  let nextActionId = aiState.nextActionId ?? null

  switch (effectiveTier) {
    case 'dumb': {
      const { action, resetEnergy, nextActionId: nextId } = resolveDumb(effectiveActions, aiState, currentEnergy, enemyName, maxEnergy)
      chosenAction = action
      newEnergy = resetEnergy ? 0 : Math.min(currentEnergy + energyPerTurn, maxEnergy)
      nextActionId = nextId
      break
    }
    case 'medium': {
      const { action, resetEnergy, nextActionId: nextId } = resolveMedium(effectiveActions, aiState, ctx, currentEnergy, enemyName, maxEnergy)
      chosenAction = action
      newEnergy = resetEnergy ? 0 : Math.min(currentEnergy - (action.energy_cost ?? 0) + energyPerTurn, maxEnergy)
      nextActionId = nextId
      break
    }
    case 'smart':
      chosenAction = resolveSmart(effectiveActions, ctx, currentEnergy, enemyName, maxEnergy)
      newEnergy = Math.min(currentEnergy - (chosenAction.energy_cost ?? 0) + energyPerTurn, maxEnergy)
      break
  }

  const result = buildActionResult(
    chosenAction, effectiveAttack, enemy.maxHP, enemy.currentHP, capPlayerDamage
  )

  return { result, newAiState: { ...aiState, energy: Math.max(0, newEnergy), maxEnergy, nextActionId } }
}

// ─── Helper: inicializar aiState ──────────────────────────────────────────────

export function initAiState(tier: AiTier, maxEnergy = 5): EnemyAiState {
  return { tier, energy: 0, maxEnergy, activePhaseOrder: 0, triggeredPhases: [], nextActionId: null }
}