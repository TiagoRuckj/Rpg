'use server'

import { createClient } from '@/lib/supabase/server'
import {
  CombatAction, PlayerStats, BossStats, PlayerSkill,
  PrimaryStats, Item, ItemEffect, EquippedGear, EMPTY_GEAR, WeaponType, BurnState,
  EnemyType, GameClass, ClassBonuses, calcClassBonuses,
  deriveStatsWithGear, EnemyCombatState, PlayerPoisonState,
  EnemyAction, EnemyAiConfig, BossPhase, EnemyAiState,
} from '@/types/game'
import {
  StatusEffect, processStatusEffects, applyBurn, applyPoison, applyStun, fromLegacy,
  toBurnStates, toPlayerPoisonState,
} from '@/lib/game/statusEffects'
import {
  resolvePlayerAttack,
  resolveEnemyAttack,
  resolveWeaponPassive,
  buildCombatLog,
  buildTurnLog,
  applyWeaponPassiveResults,
} from '@/lib/game/combat'
import {
  resolveEnemyAction,
  evaluateBossPhase,
  flushAiDebugLogs,
  ResolveEnemyActionInput,
  EnemyCombatContext,
} from '@/lib/game/enemyAi'

export interface EnemyTurnState {
  instanceId: number
  currentHP: number
  maxHP: number
  alive: boolean
  attack: number
  defense: number
  name: string
  enemyTypes: EnemyType[]
  // nuevo: estado de IA en runtime (null = comportamiento legacy)
  aiState: EnemyAiState | null
}

// Datos del ítem a usar — el cliente los manda, el servidor los valida contra la DB
export interface ItemUsed {
  entryId: number   // inventories.id
  name: string
  effect: ItemEffect
}

interface TakeTurnInput {
  action: CombatAction
  skillUsed?: PlayerSkill
  itemUsed?: ItemUsed
  currentPlayerHP: number
  currentPlayerStamina: number
  currentPlayerMana: number
  enemies: EnemyTurnState[]
  targetIndex: number
  isBlocking: boolean
  consecutiveBlocks: number
  stunnedEnemyIds: number[]
  burnStates: BurnState[]
  poisonState: PlayerPoisonState | null
  statusEffects?: StatusEffect[]
  // nuevo: ID del boss si hay boss en combate (para cargar fases)
  bossId?: number
  // turno actual (para contexto de IA)
  turn: number
}

interface TakeTurnResult {
  success: boolean
  error?: string
  newPlayerHP: number
  newPlayerStamina: number
  newPlayerMana: number
  updatedEnemyHPs: Record<number, number>
  playerDefeated: boolean
  defeatedEnemyInstanceIds: number[]
  allEnemiesDefeated: boolean
  newConsecutiveBlocks: number
  newStunnedEnemyIds: number[]
  newBurnStates: BurnState[]
  newPoisonState: PlayerPoisonState | null
  newStatusEffects: StatusEffect[]
  // nuevo: aiStates actualizados para que el cliente los persista en el store
  updatedAiStates: Record<number, EnemyAiState>
  // nuevo: enemigos a invocar este turno (el cliente los buildea via buildSummonedEnemy)
  summonEnemyIds: number[]
  // nuevo: si el daño del jugador está capeado este turno (transición de fase)
  capPlayerDamage: boolean
  log: string[]
  aiDebugLogs: Array<{ tier: string; enemyName: string; data: Record<string, unknown> }>
}

function errorResult(input: TakeTurnInput, error: string, logMsg?: string): TakeTurnResult {
  return {
    success: false,
    error,
    newPlayerHP: input.currentPlayerHP,
    newPlayerStamina: input.currentPlayerStamina,
    newPlayerMana: input.currentPlayerMana,
    updatedEnemyHPs: {},
    playerDefeated: false,
    defeatedEnemyInstanceIds: [],
    allEnemiesDefeated: false,
    newConsecutiveBlocks: input.consecutiveBlocks,
    newStunnedEnemyIds: [],
    newBurnStates: [],
    newPoisonState: input.poisonState,
    newStatusEffects: input.statusEffects ?? fromLegacy(input.burnStates, input.poisonState),
    updatedAiStates: {},
    summonEnemyIds: [],
    capPlayerDamage: false,
    log: logMsg ? [logMsg] : [],
    aiDebugLogs: [],
  }
}

// ─── Carga de datos de IA desde Supabase ─────────────────────────────────────

async function loadAiData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  enemies: EnemyTurnState[],
  bossId?: number,
): Promise<{
  aiConfigs: EnemyAiConfig[]
  actionsByConfigId: Record<number, EnemyAction[]>
  bossPhases: BossPhase[]
}> {
  // Recopilar todos los entity_ids con aiState no nulo
  const enemyIds = enemies
    .filter(e => e.aiState !== null)
    .map(e => e.instanceId)  // usamos instanceId para buscar por entity_id en el store

  // Cargar configs de IA para los enemigos vivos con IA
  // Nota: en la DB entity_id es el enemy.id (no instanceId). El cliente debe
  // incluir enemy_id en EnemyTurnState si quiere aprovechar esto.
  // Por ahora cargamos todas las configs relevantes por bossId.
  const aiConfigs: EnemyAiConfig[] = []
  const actionsByConfigId: Record<number, EnemyAction[]> = {}
  const bossPhases: BossPhase[] = []

  if (bossId) {
    // Cargar config de IA del boss
    const { data: bossAi, error: bossAiError } = await supabase
      .from('enemy_ai')
      .select('*')
      .eq('entity_type', 'boss')
      .eq('entity_id', bossId)
      .maybeSingle()


    if (bossAi) {
      aiConfigs.push(bossAi as EnemyAiConfig)

      // Cargar acciones del boss
      if (bossAi.action_ids?.length > 0) {
        const { data: actions } = await supabase
          .from('enemy_actions')
          .select('*')
          .in('id', bossAi.action_ids)
        if (actions) actionsByConfigId[bossAi.id] = actions as EnemyAction[]
      }

      // Cargar fases del boss
      const { data: phases } = await supabase
        .from('boss_phases')
        .select('*')
        .eq('boss_id', bossId)
        .order('phase_order', { ascending: true })
      if (phases) bossPhases.push(...(phases as BossPhase[]))
    }
  }


  return { aiConfigs, actionsByConfigId, bossPhases }
}

export async function takeTurnAction(input: TakeTurnInput): Promise<TakeTurnResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResult(input, 'No autorizado')

  const { data: player } = await supabase
    .from('players')
    .select('name, primary_stats, equipped_classes')
    .eq('id', user.id)
    .single()
  if (!player) return errorResult(input, 'Jugador no encontrado')

  // Leer inventario equipado
  const { data: equippedItems } = await supabase
    .from('inventories')
    .select('items!inner(id, type, stats, effect, name, rarity, value, sprite)')
    .eq('player_id', user.id)
    .eq('equipped', true)

  const gear: EquippedGear = { ...EMPTY_GEAR }
  if (equippedItems) {
    for (const entry of equippedItems) {
      const item = (entry as any).items as Item
      if (!item) continue
      switch (item.type) {
        case 'weapon':   gear.weapon = item; break
        case 'necklace': gear.necklace = item; break
        case 'ring':
          if (!gear.ring1) gear.ring1 = item
          else gear.ring2 = item
          break
        case 'armor': {
          const slot = item.stats?.slot
          if (slot && slot in gear) (gear as any)[slot] = item
          break
        }
      }
    }
  }

  const primaryStats = player.primary_stats as PrimaryStats
  const playerStats: PlayerStats = deriveStatsWithGear(primaryStats, gear)

  const weaponType: WeaponType = (gear.weapon?.stats?.weapon_type ?? 'none') as WeaponType
  const staffAttackBonus = weaponType === 'staff' ? (gear.weapon?.stats?.attack ?? 0) : 0

  const equippedClassIds: string[] = player.equipped_classes ?? []
  let classBonuses: ClassBonuses = {}

  if (equippedClassIds.length > 0) {
    const { data: classData } = await supabase
      .from('classes')
      .select('*')
      .in('id', equippedClassIds)
    if (classData) {
      classBonuses = calcClassBonuses(equippedClassIds, classData as GameClass[])
    }
  }

  // ── Cargar datos de IA ────────────────────────────────────────────────────
  const { aiConfigs, actionsByConfigId, bossPhases } = await loadAiData(
    supabase, input.enemies, input.bossId
  )

  // ── Validaciones pre-acción ───────────────────────────────────────────────

  if (input.action === 'skill' && input.skillUsed) {
    if (input.currentPlayerStamina < input.skillUsed.stamina_cost)
      return errorResult(input, 'No tenés suficiente stamina', '❌ No tenés suficiente stamina!')
    if (input.currentPlayerMana < input.skillUsed.mana_cost)
      return errorResult(input, 'No tenés suficiente mana', '❌ No tenés suficiente mana!')
  }

  let verifiedItemEffect: ItemEffect | null = null
  let verifiedItemName = ''

  if (input.action === 'item' && input.itemUsed) {
    const { data: invEntry, error: invErr } = await supabase
      .from('inventories')
      .select('id, quantity, items!inner(name, effect)')
      .eq('id', input.itemUsed.entryId)
      .eq('player_id', user.id)
      .single()

    if (invErr || !invEntry || invEntry.quantity <= 0)
      return errorResult(input, 'Ítem no disponible', '❌ No tenés ese ítem en el inventario')

    verifiedItemEffect = (invEntry as any).items.effect as ItemEffect
    verifiedItemName   = (invEntry as any).items.name as string

    if (invEntry.quantity === 1) {
      await supabase.from('inventories').delete().eq('id', invEntry.id)
    } else {
      await supabase.from('inventories').update({ quantity: invEntry.quantity - 1 }).eq('id', invEntry.id)
    }
  }

  // ── Setup de combate ──────────────────────────────────────────────────────

  const log: string[] = []
  const liveEnemies = input.enemies.filter(e => e.alive)
  const target = input.enemies[input.targetIndex]

  if (!target || !target.alive)
    return errorResult(input, 'Objetivo inválido', '❌ El objetivo ya no está disponible')

  const targetStats: BossStats = {
    hp: target.currentHP,
    max_hp: target.maxHP,
    attack: target.attack,
    defense: target.defense,
  }

  // ── Acción del jugador ────────────────────────────────────────────────────
  let newTargetHP = target.currentHP
  let newPlayerStamina = input.currentPlayerStamina
  let newPlayerMana = input.currentPlayerMana
  let newPlayerHP_fromItem = input.currentPlayerHP
  let playerDamageResult = { damage: 0, isCritical: false, isOvercrit: false, blocked: false }

  if (input.action === 'attack') {
    const { damageResult, newEnemyHP } = resolvePlayerAttack(
      playerStats, primaryStats, targetStats, target.currentHP,
      gear, false, 1, 'physical',
      classBonuses, target.enemyTypes
    )
    playerDamageResult = damageResult
    newTargetHP = newEnemyHP
  }

  if (input.action === 'skill' && input.skillUsed) {
    const ismagical = input.skillUsed.type === 'magical'
    const staffBonus = ismagical ? staffAttackBonus * 2 : 0

    const { damageResult, newEnemyHP } = resolvePlayerAttack(
      playerStats, primaryStats, targetStats, target.currentHP,
      gear, true, input.skillUsed.damage_multiplier, input.skillUsed.type,
      classBonuses, target.enemyTypes,
      {
        ignores_weapon:      input.skillUsed.ignores_weapon,
        ignores_defense:     input.skillUsed.ignores_defense,
        ignores_class_bonus: input.skillUsed.ignores_class_bonus,
      },
      staffBonus
    )
    playerDamageResult = damageResult
    newTargetHP = newEnemyHP
    newPlayerStamina = input.currentPlayerStamina - input.skillUsed.stamina_cost
    newPlayerMana    = input.currentPlayerMana    - input.skillUsed.mana_cost
  }

  // ── Evaluación de fase de boss (después del daño del jugador) ─────────────
  // El daño ya se aplicó. Si el HP resultante cruza un threshold no disparado:
  //   - Clampear el HP al valor exacto del umbral (floor)
  //   - Invocar adds
  //   - El boss no contraataca este turno
  let phaseTriggeredThisTurn: BossPhase | null = null
  const summonEnemyIds: number[] = []

  if (input.bossId && bossPhases.length > 0 && target.alive) {
    const bossEnemy = input.enemies.find(e => e.aiState !== null)
      ?? input.enemies.find(e => e.alive)

    if (bossEnemy && bossEnemy.instanceId === target.instanceId) {
      const triggeredPhases = bossEnemy.aiState?.triggeredPhases ?? []
      // Evaluar con el HP YA reducido por el daño del jugador
      const phase = evaluateBossPhase(
        bossPhases,
        newTargetHP,
        bossEnemy.maxHP,
        triggeredPhases,
      )
      if (phase) {
        phaseTriggeredThisTurn = phase
        // Clampear HP al umbral exacto — el exceso de daño se pierde
        newTargetHP = Math.floor(bossEnemy.maxHP * phase.hp_threshold)
        if (phase.summon_enemy_ids?.length) {
          summonEnemyIds.push(...phase.summon_enemy_ids)
          log.push(`🔔 ¡Invoca ${phase.summon_enemy_ids.length > 1 ? phase.summon_enemy_ids.length + ' refuerzos' : 'un refuerzo'}!`)
        }
        log.push(`⚠️ ¡El jefe entra en una nueva fase!`)
      }
    }
  }

  if (input.action === 'item' && verifiedItemEffect) {
    const healHP      = verifiedItemEffect.heal_hp      ?? 0
    const healStamina = verifiedItemEffect.heal_stamina ?? 0
    const healMana    = verifiedItemEffect.heal_mana    ?? 0

    const maxHP      = playerStats.max_hp
    const maxStamina = playerStats.max_stamina
    const maxMana    = playerStats.max_mana

    newPlayerHP_fromItem = Math.min(input.currentPlayerHP + healHP, maxHP)
    newPlayerStamina     = Math.min(input.currentPlayerStamina + healStamina, maxStamina)
    newPlayerMana        = Math.min(input.currentPlayerMana    + healMana,    maxMana)

    const actualHealHP      = newPlayerHP_fromItem - input.currentPlayerHP
    const actualHealStamina = Math.min(input.currentPlayerStamina + healStamina, maxStamina) - input.currentPlayerStamina
    const actualHealMana    = Math.min(input.currentPlayerMana    + healMana,    maxMana)    - input.currentPlayerMana

    const parts: string[] = []
    if (actualHealHP      > 0) parts.push(`❤️ +${actualHealHP} HP`)
    if (actualHealStamina > 0) parts.push(`⚡ +${actualHealStamina} stamina`)
    if (actualHealMana    > 0) parts.push(`🔮 +${actualHealMana} mana`)
    if (healHP > 0 && actualHealHP === 0) parts.push(`❤️ HP al máximo`)
    log.push(`🧪 ${player.name} usa ${verifiedItemName}${parts.length ? ' — ' + parts.join(', ') : ''} (HP: ${input.currentPlayerHP} → ${newPlayerHP_fromItem}/${playerStats.max_hp})`)
  }

  const actionType = input.action === 'block' ? 'block'
    : input.action === 'skill'  ? 'skill'
    : input.action === 'item'   ? 'item'
    : 'attack'

  // ── Construir HPs actualizados ───────────────────────────────────────────
  const updatedEnemyHPs: Record<number, number> = {}
  for (const e of input.enemies) {
    updatedEnemyHPs[e.instanceId] = e.instanceId === target.instanceId ? newTargetHP : e.currentHP
  }

  const defeatedEnemyInstanceIds: number[] = []
  for (const e of liveEnemies) {
    if (updatedEnemyHPs[e.instanceId] <= 0) {
      defeatedEnemyInstanceIds.push(e.instanceId)
      log.push(`🏆 ¡Derrotaste a ${e.name}!`)
    }
  }

  // ── Passives de arma ──────────────────────────────────────────────────────
  const newStunnedEnemyIds: number[] = []
  let passiveLog: string[] = []

  if ((input.action === 'attack' || input.action === 'skill') && weaponType !== 'none') {
    const adjacentEnemies = liveEnemies
      .filter(e => e.instanceId !== target.instanceId)
      .map(e => ({ instanceId: e.instanceId, name: e.name, currentHP: e.currentHP, defense: e.defense }))

    const passive = resolveWeaponPassive(
      weaponType,
      input.action === 'skill',
      input.skillUsed?.type,
      playerDamageResult.damage,
      target.currentHP,
      target.maxHP,
      target.instanceId,
      target.name,
      adjacentEnemies,
      playerStats.attack,
      primaryStats.suerte,
      target.defense,
      staffAttackBonus,
    )

    passiveLog = passive.log

    const passiveResult = applyWeaponPassiveResults({
      passive,
      target,
      liveEnemies,
      updatedEnemyHPs,
      defeatedEnemyInstanceIds,
      stunnedEnemyIds: newStunnedEnemyIds,
    })

    Object.assign(updatedEnemyHPs, passiveResult.updatedEnemyHPs)
    defeatedEnemyInstanceIds.length = 0
    defeatedEnemyInstanceIds.push(...passiveResult.defeatedEnemyInstanceIds)
    newStunnedEnemyIds.push(...passiveResult.newStunnedEnemyIds.filter(id => !newStunnedEnemyIds.includes(id)))
    passiveResult.defeatLog.forEach(msg => log.push(msg))
  }

  // ── Status effects activos ────────────────────────────────────────────────
  const activeEffects: StatusEffect[] = input.statusEffects
    ?? fromLegacy(input.burnStates, input.poisonState)

  const enemyNames: Record<number, string> = {}
  for (const e of liveEnemies) enemyNames[e.instanceId] = e.name

  const effectsResult = processStatusEffects(activeEffects, updatedEnemyHPs, enemyNames)

  for (const [idStr, delta] of Object.entries(effectsResult.enemyHPDeltas)) {
    const id = Number(idStr)
    updatedEnemyHPs[id] = Math.max(0, (updatedEnemyHPs[id] ?? 0) + delta)
    if (updatedEnemyHPs[id] <= 0 && !defeatedEnemyInstanceIds.includes(id)) {
      defeatedEnemyInstanceIds.push(id)
      effectsResult.log.push(`🏆 ¡Derrotaste a ${enemyNames[id]}!`)
    }
  }

  // Stuns del procesamiento de efectos (ej: efecto de stun de enemigo IA)
  for (const id of effectsResult.stunnedEnemyIds) {
    if (!newStunnedEnemyIds.includes(id)) newStunnedEnemyIds.push(id)
  }

  let newStatusEffects = effectsResult.updatedEffects
  const burnLog = effectsResult.log

  // ── Aplicar nueva quemadura si la skill tiene burn_chance ─────────────────
  let newBurnApplied = false
  if (input.action === 'skill' && input.skillUsed?.burn_chance && playerDamageResult.damage > 0) {
    const alreadyBurning = newStatusEffects.some(
      e => e.type === 'burn' && e.instanceId === target.instanceId
    )
    if (!alreadyBurning && Math.random() < input.skillUsed.burn_chance) {
      newStatusEffects = applyBurn(target.instanceId, newStatusEffects)
      newBurnApplied = true
    }
  }

  const newBurnStates: BurnState[] = toBurnStates(newStatusEffects)

  // ── Log del turno del jugador ─────────────────────────────────────────────
  if (input.action !== 'item') {
    const { attackLog, shouldPrepend } = buildTurnLog({
      playerName: player.name,
      action: actionType as 'attack' | 'skill' | 'block' | 'item',
      skillName: input.skillUsed?.name,
      targetName: target.name,
      playerDamage: playerDamageResult,
      enemyCount: liveEnemies.length,
      passiveLog,
      burnLog,
      newBurnApplied,
      burnTargetName: target.name,
    })
    if (shouldPrepend) {
      log.unshift(...attackLog)
    } else {
      log.push(...attackLog)
    }
  }

  // ── Contraataque de cada enemigo vivo — con IA ────────────────────────────
  const isBlockingThisTurn = input.action === 'block'
  let currentPlayerHP = newPlayerHP_fromItem
  let blockFailed = false
  const updatedAiStates: Record<number, EnemyAiState> = {}

  // Contexto compartido para todos los enemigos este turno
  const combatCtx: EnemyCombatContext = {
    playerHP: currentPlayerHP,
    playerMaxHP: playerStats.max_hp,
    playerStamina: newPlayerStamina,
    playerMaxStamina: playerStats.max_stamina,
    playerMana: newPlayerMana,
    playerMaxMana: playerStats.max_mana,
    playerActiveEffects: newStatusEffects
      .filter(e => e.target === 'player')
      .map(e => e.type),
    selfHP: 0,     // se rellena por enemigo abajo
    selfMaxHP: 0,
    selfActiveEffects: [],
    turn: input.turn,
    aliveEnemyCount: liveEnemies.filter(e => updatedEnemyHPs[e.instanceId] > 0).length,
  }

  for (const enemy of liveEnemies) {
    // Saltar si murió este turno
    if (updatedEnemyHPs[enemy.instanceId] <= 0) continue

    const stunnedThisTurn = newStunnedEnemyIds.includes(enemy.instanceId)
    const stunnedPrevTurn = input.stunnedEnemyIds.includes(enemy.instanceId)

    if (stunnedThisTurn || stunnedPrevTurn) {
      if (stunnedPrevTurn && !stunnedThisTurn) log.push(`🔨 ${enemy.name} está aturdido y no puede atacar!`)
      continue
    }

    if (enemy.attack === 0) continue  // dummy

    // ── Resolver acción con IA (si la tiene) ────────────────────────────────
    // Un boss puede llegar con aiState null en turnos donde el cliente no persistió
    // el updatedAiState previo. Si hay fase activa este turno, inicializamos el aiState
    // on-the-fly para que triggeredPhases se registre correctamente.
    const isBossEntity = input.bossId !== undefined
      && input.enemies.indexOf(enemy) === 0  // el boss es siempre el primer enemigo
    if (isBossEntity && phaseTriggeredThisTurn) {
      // Turno de transición de fase: registrar aiState y no contraatacar
      const prevTriggered = enemy.aiState?.triggeredPhases ?? []
      updatedAiStates[enemy.instanceId] = {
        tier: phaseTriggeredThisTurn.ai_tier ?? enemy.aiState?.tier ?? 'boss',
        energy: 0,
        maxEnergy: enemy.aiState?.maxEnergy ?? 8,
        activePhaseOrder: phaseTriggeredThisTurn.phase_order,
        triggeredPhases: [...prevTriggered, phaseTriggeredThisTurn.phase_order],
      }
      log.push(`👑 ${enemy.name} reorganiza sus fuerzas...`)
      continue
    }

    if (enemy.aiState !== null) {
      const aiConfig = aiConfigs.find(c =>
        c.entity_type === (input.bossId ? 'boss' : 'enemy')
      )
      const availableActions = aiConfig ? (actionsByConfigId[aiConfig.id] ?? []) : []

      // Verificar si este enemigo es el boss y hay fase activa este turno
      const isBoss = input.bossId !== undefined && aiConfig?.entity_type === 'boss'
      const phaseActive = isBoss ? phaseTriggeredThisTurn : null

      if (phaseActive && isBoss) {
        // Ya manejado por el bloque isBossEntity de arriba — este path
        // solo se alcanza si aiState no es null, que también está cubierto.
        continue
      }

      const ctx: EnemyCombatContext = {
        ...combatCtx,
        selfHP: updatedEnemyHPs[enemy.instanceId],
        selfMaxHP: enemy.maxHP,
        selfActiveEffects: newStatusEffects
          .filter(e => e.target === 'enemy' && e.instanceId === enemy.instanceId)
          .map(e => e.type),
      }

      const { result: aiResult, newAiState } = resolveEnemyAction({
        enemy: {
          instanceId: enemy.instanceId,
          enemy: { id: 0, dungeon_id: 0, name: enemy.name, stats: { hp: enemy.maxHP, attack: enemy.attack, defense: enemy.defense }, loot_table: [], enemy_type: enemy.enemyTypes },
          currentHP: updatedEnemyHPs[enemy.instanceId],
          maxHP: enemy.maxHP,
          alive: true,
          aiState: enemy.aiState,
          statMults: null,
        },
        availableActions,
        aiState: enemy.aiState,
        ctx,
        phases: isBoss ? bossPhases : [],
        energyThreshold: aiConfig?.energy_threshold ?? 3,
        energyPerTurn: aiConfig?.energy_per_turn ?? 1,
      })

      updatedAiStates[enemy.instanceId] = newAiState
      log.push(...aiResult.log)

      // Aplicar efectos de la acción IA al jugador
      if (aiResult.damageToPlayer > 0) {
        // Reducir por defensa del jugador y bloqueo
        const enemyStats: BossStats = {
          hp: enemy.currentHP,
          max_hp: enemy.maxHP,
          attack: aiResult.damageToPlayer,  // ya tiene el multiplicador aplicado
          defense: enemy.defense,
        }
        const { damageResult: enemyDamageResult, newPlayerHP, blockFailed: thisBlockFailed } =
          resolveEnemyAttack(enemyStats, playerStats, currentPlayerHP, isBlockingThisTurn, input.consecutiveBlocks)

        currentPlayerHP = newPlayerHP
        if (thisBlockFailed) blockFailed = true

        if (enemyDamageResult.blocked) {
          log.push(`🛡️ Bloqueaste el ataque de ${enemy.name}!`)
        } else if (isBlockingThisTurn && thisBlockFailed) {
          log.push(`💥 ¡Bloqueo fallido! ${enemy.name} te golpea por ${enemyDamageResult.damage} de daño!`)
        }
      }

      // Aplicar curación propia
      if (aiResult.selfHeal > 0) {
        updatedEnemyHPs[enemy.instanceId] = Math.min(
          updatedEnemyHPs[enemy.instanceId] + aiResult.selfHeal,
          enemy.maxHP
        )
      }

      // Aplicar efectos al jugador (veneno, etc.)
      for (const effectName of aiResult.newPlayerEffects) {
        if (effectName === 'poison') {
          newStatusEffects = applyPoison(newStatusEffects)
          log.push(`☠️ ¡${enemy.name} te ha envenenado!`)
        }
        if (effectName === 'stun') {
          // stun sobre el jugador: implementación futura
        }
      }

      continue  // ya procesamos este enemigo con IA
    }

    // ── Fallback legacy: ataque simple sin IA ───────────────────────────────
    const enemyStats: BossStats = {
      hp: enemy.currentHP,
      max_hp: enemy.maxHP,
      attack: enemy.attack,
      defense: enemy.defense,
    }

    const { damageResult: enemyDamageResult, newPlayerHP, blockFailed: thisBlockFailed } =
      resolveEnemyAttack(enemyStats, playerStats, currentPlayerHP, isBlockingThisTurn, input.consecutiveBlocks)

    currentPlayerHP = newPlayerHP
    if (thisBlockFailed) blockFailed = true

    if (liveEnemies.length > 1) {
      if (enemyDamageResult.blocked) {
        log.push(`🛡️ Bloqueaste el ataque de ${enemy.name}!`)
      } else if (isBlockingThisTurn && thisBlockFailed) {
        log.push(`💥 ¡Bloqueo fallido! ${enemy.name} te golpea por ${enemyDamageResult.damage} de daño!`)
      } else {
        log.push(`👹 ${enemy.name} te golpea por ${enemyDamageResult.damage} de daño!`)
      }
    } else {
      if (input.action === 'item') {
        if (enemyDamageResult.blocked) {
          log.push(`🛡️ Bloqueaste el ataque de ${enemy.name}!`)
        } else {
          log.push(`👹 ${enemy.name} te golpea por ${enemyDamageResult.damage} de daño!`)
        }
      } else {
        if (enemyDamageResult.blocked) {
          log.push(`🛡️ Bloqueaste el ataque de ${enemy.name}!`)
        } else if (isBlockingThisTurn && thisBlockFailed) {
          log.push(`💥 ¡Bloqueo fallido! ${enemy.name} te golpea por ${enemyDamageResult.damage} de daño!`)
        } else {
          log.push(`👹 ${enemy.name} te golpea por ${enemyDamageResult.damage} de daño!`)
        }
      }
    }
  }

  // ── Veneno ────────────────────────────────────────────────────────────────
  if (effectsResult.playerHPDelta < 0) {
    currentPlayerHP = Math.max(1, currentPlayerHP + effectsResult.playerHPDelta)
  }

  // ── Resultados ────────────────────────────────────────────────────────────
  const newConsecutiveBlocks = isBlockingThisTurn && !blockFailed
    ? input.consecutiveBlocks + 1
    : 0

  const allEnemiesDefeated = input.enemies.every(e => !e.alive || updatedEnemyHPs[e.instanceId] <= 0)
  const playerDefeated = currentPlayerHP <= 0
  const finalPlayerHP = (allEnemiesDefeated && playerDefeated) ? 1 : currentPlayerHP

  if (playerDefeated && !allEnemiesDefeated) log.push('💀 Has sido derrotado...')


  return {
    success: true,
    newPlayerHP: finalPlayerHP,
    newPlayerStamina,
    newPlayerMana,
    updatedEnemyHPs,
    playerDefeated: playerDefeated && !allEnemiesDefeated,
    defeatedEnemyInstanceIds,
    allEnemiesDefeated,
    newConsecutiveBlocks,
    newStunnedEnemyIds,
    newBurnStates,
    newPoisonState: toPlayerPoisonState(newStatusEffects),
    newStatusEffects,
    updatedAiStates,
    summonEnemyIds,
    capPlayerDamage: phaseTriggeredThisTurn !== null,
    log,
    aiDebugLogs: flushAiDebugLogs(),
  }
}

// ─── playerTurnAction ─────────────────────────────────────────────────────────
// Resuelve solo el ataque del jugador. No incluye contraataque enemigo.
// Devuelve el daño aplicado, HP resultante del objetivo, y si se disparó una fase.

export interface PlayerTurnInput {
  action: CombatAction
  skillUsed?: PlayerSkill
  itemUsed?: ItemUsed
  currentPlayerHP: number
  currentPlayerStamina: number
  currentPlayerMana: number
  enemies: EnemyTurnState[]
  targetIndex: number
  isBlocking: boolean
  burnStates: BurnState[]
  poisonState: PlayerPoisonState | null
  statusEffects?: StatusEffect[]
  bossId?: number
  turn: number
}

export interface PlayerTurnResult {
  success: boolean
  error?: string
  // HP máximo real del jugador (con gear aplicado)
  playerMaxHP: number
  // Daño aplicado al objetivo
  damageDealt: number
  isCritical: boolean
  isOvercrit: boolean
  // HP resultante de cada enemigo (puede incluir splash, passive, clamp de fase)
  updatedEnemyHPs: Record<number, number>
  defeatedEnemyInstanceIds: number[]
  // Recursos del jugador después de usar skill/item
  newPlayerHP: number
  newPlayerStamina: number
  newPlayerMana: number
  // Fase disparada (si aplica)
  phaseTriggered: boolean
  summonEnemyIds: number[]
  updatedAiStates: Record<number, EnemyAiState>
  // Log de solo el turno del jugador
  log: string[]
}

export async function playerTurnAction(input: PlayerTurnInput): Promise<PlayerTurnResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado', playerMaxHP: 0, damageDealt: 0, isCritical: false, isOvercrit: false, updatedEnemyHPs: {}, defeatedEnemyInstanceIds: [], newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana, phaseTriggered: false, summonEnemyIds: [], updatedAiStates: {}, log: [] }

  const { data: player } = await supabase
    .from('players')
    .select('name, primary_stats, equipped_classes')
    .eq('id', user.id)
    .single()
  if (!player) return { success: false, error: 'Jugador no encontrado', playerMaxHP: 0, damageDealt: 0, isCritical: false, isOvercrit: false, updatedEnemyHPs: {}, defeatedEnemyInstanceIds: [], newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana, phaseTriggered: false, summonEnemyIds: [], updatedAiStates: {}, log: [] }

  const { data: equippedItems } = await supabase
    .from('inventories')
    .select('items!inner(id, type, stats, effect, name, rarity, value, sprite)')
    .eq('player_id', user.id)
    .eq('equipped', true)

  const gear: EquippedGear = { ...EMPTY_GEAR }
  if (equippedItems) {
    for (const entry of equippedItems) {
      const item = (entry as any).items as Item
      if (!item) continue
      switch (item.type) {
        case 'weapon':   gear.weapon = item; break
        case 'necklace': gear.necklace = item; break
        case 'ring':
          if (!gear.ring1) gear.ring1 = item
          else gear.ring2 = item
          break
        case 'armor': {
          const slot = item.stats?.slot
          if (slot && slot in gear) (gear as any)[slot] = item
          break
        }
      }
    }
  }

  const primaryStats = player.primary_stats as PrimaryStats
  const playerStats: PlayerStats = deriveStatsWithGear(primaryStats, gear)
  const weaponType: WeaponType = (gear.weapon?.stats?.weapon_type ?? 'none') as WeaponType
  const staffAttackBonus = weaponType === 'staff' ? (gear.weapon?.stats?.attack ?? 0) : 0

  const equippedClassIds: string[] = player.equipped_classes ?? []
  let classBonuses: ClassBonuses = {}
  if (equippedClassIds.length > 0) {
    const { data: classData } = await supabase.from('classes').select('*').in('id', equippedClassIds)
    if (classData) classBonuses = calcClassBonuses(equippedClassIds, classData as GameClass[])
  }

  const { aiConfigs, actionsByConfigId, bossPhases } = await loadAiData(supabase, input.enemies, input.bossId)

  // Validaciones
  if (input.action === 'skill' && input.skillUsed) {
    if (input.currentPlayerStamina < input.skillUsed.stamina_cost)
      return { success: false, error: 'No tenés suficiente stamina', playerMaxHP: 0, damageDealt: 0, isCritical: false, isOvercrit: false, updatedEnemyHPs: {}, defeatedEnemyInstanceIds: [], newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana, phaseTriggered: false, summonEnemyIds: [], updatedAiStates: {}, log: ['❌ No tenés suficiente stamina!'] }
    if (input.currentPlayerMana < input.skillUsed.mana_cost)
      return { success: false, error: 'No tenés suficiente mana', playerMaxHP: 0, damageDealt: 0, isCritical: false, isOvercrit: false, updatedEnemyHPs: {}, defeatedEnemyInstanceIds: [], newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana, phaseTriggered: false, summonEnemyIds: [], updatedAiStates: {}, log: ['❌ No tenés suficiente mana!'] }
  }

  // Item
  let verifiedItemEffect: ItemEffect | null = null
  let verifiedItemName = ''
  let newPlayerHP_fromItem = input.currentPlayerHP
  let newPlayerStamina = input.currentPlayerStamina
  let newPlayerMana = input.currentPlayerMana

  if (input.action === 'item' && input.itemUsed) {
    const { data: invEntry, error: invErr } = await supabase
      .from('inventories').select('id, quantity, items!inner(name, effect)')
      .eq('id', input.itemUsed.entryId).eq('player_id', user.id).single()
    if (invErr || !invEntry || invEntry.quantity <= 0)
      return { success: false, error: 'Ítem no disponible', playerMaxHP: 0, damageDealt: 0, isCritical: false, isOvercrit: false, updatedEnemyHPs: {}, defeatedEnemyInstanceIds: [], newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana, phaseTriggered: false, summonEnemyIds: [], updatedAiStates: {}, log: ['❌ No tenés ese ítem'] }
    verifiedItemEffect = (invEntry as any).items.effect as ItemEffect
    verifiedItemName   = (invEntry as any).items.name as string
    if (invEntry.quantity === 1) await supabase.from('inventories').delete().eq('id', invEntry.id)
    else await supabase.from('inventories').update({ quantity: invEntry.quantity - 1 }).eq('id', invEntry.id)
  }

  const log: string[] = []
  const liveEnemies = input.enemies.filter(e => e.alive)
  const target = input.enemies[input.targetIndex]
  if (!target || !target.alive)
    return { success: false, error: 'Objetivo inválido', playerMaxHP: 0, damageDealt: 0, isCritical: false, isOvercrit: false, updatedEnemyHPs: {}, defeatedEnemyInstanceIds: [], newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana, phaseTriggered: false, summonEnemyIds: [], updatedAiStates: {}, log: [] }

  const targetStats: BossStats = { hp: target.currentHP, max_hp: target.maxHP, attack: target.attack, defense: target.defense }

  let newTargetHP = target.currentHP
  let playerDamageResult = { damage: 0, isCritical: false, isOvercrit: false, blocked: false }

  if (input.action === 'attack') {
    const { damageResult, newEnemyHP } = resolvePlayerAttack(
      playerStats, primaryStats, targetStats, target.currentHP,
      gear, false, 1, 'physical', classBonuses, target.enemyTypes
    )
    playerDamageResult = damageResult
    newTargetHP = newEnemyHP
  }

  if (input.action === 'skill' && input.skillUsed) {
    const ismagical = input.skillUsed.type === 'magical'
    const staffBonus = ismagical ? staffAttackBonus * 2 : 0
    const { damageResult, newEnemyHP } = resolvePlayerAttack(
      playerStats, primaryStats, targetStats, target.currentHP,
      gear, true, input.skillUsed.damage_multiplier, input.skillUsed.type,
      classBonuses, target.enemyTypes,
      { ignores_weapon: input.skillUsed.ignores_weapon, ignores_defense: input.skillUsed.ignores_defense, ignores_class_bonus: input.skillUsed.ignores_class_bonus },
      staffBonus
    )
    playerDamageResult = damageResult
    newTargetHP = newEnemyHP
    newPlayerStamina = input.currentPlayerStamina - input.skillUsed.stamina_cost
    newPlayerMana    = input.currentPlayerMana    - input.skillUsed.mana_cost
  }

  if (input.action === 'item' && verifiedItemEffect) {
    const maxHP = playerStats.max_hp
    newPlayerHP_fromItem = Math.min(input.currentPlayerHP + (verifiedItemEffect.heal_hp ?? 0), maxHP)
    newPlayerStamina     = Math.min(input.currentPlayerStamina + (verifiedItemEffect.heal_stamina ?? 0), playerStats.max_stamina)
    newPlayerMana        = Math.min(input.currentPlayerMana    + (verifiedItemEffect.heal_mana    ?? 0), playerStats.max_mana)
    log.push(`🧪 ${player.name} usa ${verifiedItemName}`)
  }

  // Log de acción del jugador
  if (input.action === 'attack' || input.action === 'skill') {
    const critText = playerDamageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
    if (input.action === 'skill' && input.skillUsed) {
      log.push(`✨ ${player.name} usa ${input.skillUsed.name} en ${target.name} por ${playerDamageResult.damage} de daño!${critText}`)
    } else {
      log.push(`⚔️ ${player.name} ataca a ${target.name} por ${playerDamageResult.damage} de daño!${critText}`)
    }
  }
  if (input.action === 'block') {
    log.push(`🛡️ ${player.name} toma posición defensiva!`)
  }

  // HPs base
  const updatedEnemyHPs: Record<number, number> = {}
  for (const e of input.enemies) {
    updatedEnemyHPs[e.instanceId] = e.instanceId === target.instanceId ? newTargetHP : e.currentHP
  }

  // Passives de arma
  if ((input.action === 'attack' || input.action === 'skill') && weaponType !== 'none') {
    const adjacentEnemies = liveEnemies
      .filter(e => e.instanceId !== target.instanceId)
      .map(e => ({ instanceId: e.instanceId, name: e.name, currentHP: e.currentHP, defense: e.defense }))
    const passive = resolveWeaponPassive(
      weaponType, input.action === 'skill', input.skillUsed?.type,
      playerDamageResult.damage, target.currentHP, target.maxHP,
      target.instanceId, target.name, adjacentEnemies,
      playerStats.attack, primaryStats.suerte, target.defense, staffAttackBonus,
    )
    log.push(...passive.log)
    const passiveResult = applyWeaponPassiveResults({ passive, target, liveEnemies, updatedEnemyHPs, defeatedEnemyInstanceIds: [], stunnedEnemyIds: [] })
    Object.assign(updatedEnemyHPs, passiveResult.updatedEnemyHPs)
    // No loguear victorias aquí — el cliente las agrega para evitar duplicados
  }

  // Burn (aplicar nueva quemadura si skill tiene burn_chance)
  const activeEffects: StatusEffect[] = input.statusEffects ?? fromLegacy(input.burnStates, input.poisonState)
  let newStatusEffects = activeEffects
  if (input.action === 'skill' && input.skillUsed?.burn_chance && playerDamageResult.damage > 0) {
    const alreadyBurning = newStatusEffects.some(e => e.type === 'burn' && e.instanceId === target.instanceId)
    if (!alreadyBurning && Math.random() < input.skillUsed.burn_chance) {
      newStatusEffects = applyBurn(target.instanceId, newStatusEffects)
      log.push(`🔥 ¡${target.name} está en llamas!`)
    }
  }

  // Derrotados antes de fase
  // Derrotados — solo trackear IDs, el cliente agrega el log para evitar duplicados
  const defeatedEnemyInstanceIds: number[] = []
  for (const e of liveEnemies) {
    if (updatedEnemyHPs[e.instanceId] <= 0 && !defeatedEnemyInstanceIds.includes(e.instanceId)) {
      defeatedEnemyInstanceIds.push(e.instanceId)
    }
  }

  // Evaluación de fase
  let phaseTriggered = false
  const summonEnemyIds: number[] = []
  const updatedAiStates: Record<number, EnemyAiState> = {}

  if (input.bossId && bossPhases.length > 0 && target.alive) {
    const bossEnemy = input.enemies.find(e => e.aiState !== null) ?? input.enemies.find(e => e.alive)
    if (bossEnemy && bossEnemy.instanceId === target.instanceId) {
      const triggeredPhases = bossEnemy.aiState?.triggeredPhases ?? []
      const resultHP = updatedEnemyHPs[target.instanceId]
      const phase = evaluateBossPhase(bossPhases, resultHP, bossEnemy.maxHP, triggeredPhases)
      if (phase) {
        phaseTriggered = true
        // Si el boss estaba "muerto" (HP <= 0), lo revivimos al umbral de la fase
        const clampedHP = Math.max(1, Math.floor(bossEnemy.maxHP * phase.hp_threshold))
        updatedEnemyHPs[target.instanceId] = clampedHP
        // Quitar de los derrotados si estaba ahí — la fase lo mantiene vivo
        const killedIdx = defeatedEnemyInstanceIds.indexOf(target.instanceId)
        if (killedIdx !== -1) defeatedEnemyInstanceIds.splice(killedIdx, 1)
        if (phase.summon_enemy_ids?.length) {
          summonEnemyIds.push(...phase.summon_enemy_ids)
          log.push(`🔔 ¡Invoca ${phase.summon_enemy_ids.length > 1 ? phase.summon_enemy_ids.length + ' refuerzos' : 'un refuerzo'}!`)
        }
        log.push(`⚠️ ¡El jefe entra en una nueva fase!`)
        const prevTriggered = bossEnemy.aiState?.triggeredPhases ?? []
        updatedAiStates[bossEnemy.instanceId] = {
          tier: phase.ai_tier ?? bossEnemy.aiState?.tier ?? 'boss',
          energy: 0,
          maxEnergy: bossEnemy.aiState?.maxEnergy ?? 8,
          activePhaseOrder: phase.phase_order,
          triggeredPhases: [...prevTriggered, phase.phase_order],
        }
      }
    }
  }

  return {
    success: true,
    playerMaxHP: playerStats.max_hp,
    damageDealt: playerDamageResult.damage,
    isCritical: playerDamageResult.isCritical,
    isOvercrit: playerDamageResult.isOvercrit,
    updatedEnemyHPs,
    defeatedEnemyInstanceIds,
    newPlayerHP: newPlayerHP_fromItem,
    newPlayerStamina,
    newPlayerMana,
    phaseTriggered,
    summonEnemyIds,
    updatedAiStates,
    log,
  }
}

// ─── enemyTurnAction ──────────────────────────────────────────────────────────
// Resuelve solo los contraataques de los enemigos vivos.
// Se llama después de playerTurnAction.

export interface EnemyTurnInput {
  currentPlayerHP: number
  currentPlayerStamina: number
  currentPlayerMana: number
  enemies: EnemyTurnState[]
  isBlocking: boolean
  consecutiveBlocks: number
  stunnedEnemyIds: number[]
  burnStates: BurnState[]
  poisonState: PlayerPoisonState | null
  statusEffects?: StatusEffect[]
  bossId?: number
  turn: number
  // Si hubo fase este turno, el boss no contraataca
  phaseTriggeredThisTurn: boolean
}

export interface EnemyTurnResult {
  success: boolean
  error?: string
  newPlayerHP: number
  newPlayerStamina: number
  newPlayerMana: number
  // Daño que hizo cada enemigo al jugador (para animaciones)
  damageByEnemy: Record<number, number>
  playerDefeated: boolean
  newConsecutiveBlocks: number
  newStunnedEnemyIds: number[]
  newBurnStates: BurnState[]
  newPoisonState: PlayerPoisonState | null
  newStatusEffects: StatusEffect[]
  updatedAiStates: Record<number, EnemyAiState>
  // HPs de enemigos actualizados por burn/efectos
  updatedEnemyHPs: Record<number, number>
  defeatedByEffects: number[]
  log: string[]
  aiDebugLogs: Array<{ tier: string; enemyName: string; data: Record<string, unknown> }>
}

export async function enemyTurnAction(input: EnemyTurnInput): Promise<EnemyTurnResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const errorOut = (msg: string): EnemyTurnResult => ({
    success: false, error: msg,
    newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana,
    damageByEnemy: {}, playerDefeated: false,
    newConsecutiveBlocks: input.consecutiveBlocks, newStunnedEnemyIds: [], newBurnStates: [],
    newPoisonState: input.poisonState, newStatusEffects: input.statusEffects ?? fromLegacy(input.burnStates, input.poisonState),
    updatedAiStates: {}, updatedEnemyHPs: {}, defeatedByEffects: [], log: [], aiDebugLogs: [],
  })
  if (!user) return errorOut('No autorizado')

  const { data: player } = await supabase
    .from('players').select('name, primary_stats, equipped_classes').eq('id', user.id).single()
  if (!player) return errorOut('Jugador no encontrado')

  const { data: equippedItems } = await supabase
    .from('inventories').select('items!inner(id, type, stats, effect, name, rarity, value, sprite)')
    .eq('player_id', user.id).eq('equipped', true)

  const gear: EquippedGear = { ...EMPTY_GEAR }
  if (equippedItems) {
    for (const entry of equippedItems) {
      const item = (entry as any).items as Item
      if (!item) continue
      switch (item.type) {
        case 'weapon':   gear.weapon = item; break
        case 'necklace': gear.necklace = item; break
        case 'ring':     if (!gear.ring1) gear.ring1 = item; else gear.ring2 = item; break
        case 'armor': { const slot = item.stats?.slot; if (slot && slot in gear) (gear as any)[slot] = item; break }
      }
    }
  }

  const primaryStats = player.primary_stats as PrimaryStats
  const playerStats: PlayerStats = deriveStatsWithGear(primaryStats, gear)
  const equippedClassIds: string[] = player.equipped_classes ?? []
  let classBonuses: ClassBonuses = {}
  if (equippedClassIds.length > 0) {
    const { data: classData } = await supabase.from('classes').select('*').in('id', equippedClassIds)
    if (classData) classBonuses = calcClassBonuses(equippedClassIds, classData as GameClass[])
  }

  const { aiConfigs, actionsByConfigId, bossPhases } = await loadAiData(supabase, input.enemies, input.bossId)

  const log: string[] = []
  const liveEnemies = input.enemies.filter(e => e.alive)
  const updatedEnemyHPs: Record<number, number> = {}
  for (const e of input.enemies) updatedEnemyHPs[e.instanceId] = e.currentHP

  // Status effects — burn y poison
  const activeEffects: StatusEffect[] = input.statusEffects ?? fromLegacy(input.burnStates, input.poisonState)
  const enemyNames: Record<number, string> = {}
  for (const e of liveEnemies) enemyNames[e.instanceId] = e.name
  const effectsResult = processStatusEffects(activeEffects, updatedEnemyHPs, enemyNames)

  for (const [idStr, delta] of Object.entries(effectsResult.enemyHPDeltas)) {
    const id = Number(idStr)
    updatedEnemyHPs[id] = Math.max(0, (updatedEnemyHPs[id] ?? 0) + delta)
  }

  const defeatedByEffects: number[] = []
  for (const e of liveEnemies) {
    if (updatedEnemyHPs[e.instanceId] <= 0 && !defeatedByEffects.includes(e.instanceId)) {
      defeatedByEffects.push(e.instanceId)
      effectsResult.log.push(`🏆 ¡Derrotaste a ${e.name}!`)
    }
  }

  let newStatusEffects = effectsResult.updatedEffects
  log.push(...effectsResult.log)

  // Stuns de efectos
  const newStunnedEnemyIds: number[] = [...effectsResult.stunnedEnemyIds]

  // Contraataques
  const isBlockingThisTurn = input.isBlocking
  let currentPlayerHP = input.currentPlayerHP
  let blockFailed = false
  const damageByEnemy: Record<number, number> = {}
  const updatedAiStates: Record<number, EnemyAiState> = {}

  const combatCtx: EnemyCombatContext = {
    playerHP: currentPlayerHP, playerMaxHP: playerStats.max_hp,
    playerStamina: input.currentPlayerStamina, playerMaxStamina: playerStats.max_stamina,
    playerMana: input.currentPlayerMana, playerMaxMana: playerStats.max_mana,
    playerActiveEffects: newStatusEffects.filter(e => e.target === 'player').map(e => e.type),
    selfHP: 0, selfMaxHP: 0, selfActiveEffects: [],
    turn: input.turn,
    aliveEnemyCount: liveEnemies.filter(e => updatedEnemyHPs[e.instanceId] > 0).length,
  }

  for (const enemy of liveEnemies) {
    if (updatedEnemyHPs[enemy.instanceId] <= 0) continue

    const stunnedThisTurn = newStunnedEnemyIds.includes(enemy.instanceId)
    const stunnedPrevTurn = input.stunnedEnemyIds.includes(enemy.instanceId)
    if (stunnedThisTurn || stunnedPrevTurn) {
      if (stunnedPrevTurn && !stunnedThisTurn) log.push(`🔨 ${enemy.name} está aturdido!`)
      continue
    }
    if (enemy.attack === 0) continue

    // Boss: si hubo fase este turno, no contraataca
    const isBossEntity = input.bossId !== undefined && input.enemies.indexOf(enemy) === 0
    if (isBossEntity && input.phaseTriggeredThisTurn) {
      log.push(`👑 ${enemy.name} reorganiza sus fuerzas...`)
      continue
    }

    if (enemy.aiState !== null) {
      const aiConfig = aiConfigs.find(c => c.entity_type === (input.bossId ? 'boss' : 'enemy'))
      const availableActions = aiConfig ? (actionsByConfigId[aiConfig.id] ?? []) : []
      const isBoss = input.bossId !== undefined && aiConfig?.entity_type === 'boss'

      const ctx: EnemyCombatContext = {
        ...combatCtx,
        selfHP: updatedEnemyHPs[enemy.instanceId], selfMaxHP: enemy.maxHP,
        selfActiveEffects: newStatusEffects.filter(e => e.target === 'enemy' && e.instanceId === enemy.instanceId).map(e => e.type),
      }

      const { result: aiResult, newAiState } = resolveEnemyAction({
        enemy: {
          instanceId: enemy.instanceId,
          enemy: { id: 0, dungeon_id: 0, name: enemy.name, stats: { hp: enemy.maxHP, attack: enemy.attack, defense: enemy.defense }, loot_table: [], enemy_type: enemy.enemyTypes },
          currentHP: updatedEnemyHPs[enemy.instanceId], maxHP: enemy.maxHP, alive: true,
          aiState: enemy.aiState, statMults: null,
        },
        availableActions, aiState: enemy.aiState, ctx,
        phases: isBoss ? bossPhases : [],
        energyThreshold: aiConfig?.energy_threshold ?? 3,
        energyPerTurn: aiConfig?.energy_per_turn ?? 1,
      })

      updatedAiStates[enemy.instanceId] = newAiState
      log.push(...aiResult.log)

      if (aiResult.damageToPlayer > 0) {
        const enemyStats: BossStats = { hp: enemy.currentHP, max_hp: enemy.maxHP, attack: aiResult.damageToPlayer, defense: enemy.defense }
        const { damageResult, newPlayerHP, blockFailed: thisBlockFailed } = resolveEnemyAttack(enemyStats, playerStats, currentPlayerHP, isBlockingThisTurn, input.consecutiveBlocks)
        damageByEnemy[enemy.instanceId] = damageResult.blocked ? 0 : damageResult.damage
        currentPlayerHP = newPlayerHP
        if (thisBlockFailed) blockFailed = true
        if (damageResult.blocked) log.push(`🛡️ Bloqueaste el ataque de ${enemy.name}!`)
        else if (isBlockingThisTurn && thisBlockFailed) log.push(`💥 ¡Bloqueo fallido! ${enemy.name} te golpea por ${damageResult.damage}!`)
      }

      if (aiResult.selfHeal > 0) {
        updatedEnemyHPs[enemy.instanceId] = Math.min(updatedEnemyHPs[enemy.instanceId] + aiResult.selfHeal, enemy.maxHP)
      }

      for (const effectName of aiResult.newPlayerEffects) {
        if (effectName === 'poison') { newStatusEffects = applyPoison(newStatusEffects); log.push(`☠️ ¡${enemy.name} te ha envenenado!`) }
      }
      continue
    }

    // Fallback legacy
    const enemyStats: BossStats = { hp: enemy.currentHP, max_hp: enemy.maxHP, attack: enemy.attack, defense: enemy.defense }
    const { damageResult, newPlayerHP, blockFailed: thisBlockFailed } = resolveEnemyAttack(enemyStats, playerStats, currentPlayerHP, isBlockingThisTurn, input.consecutiveBlocks)
    damageByEnemy[enemy.instanceId] = damageResult.blocked ? 0 : damageResult.damage
    currentPlayerHP = newPlayerHP
    if (thisBlockFailed) blockFailed = true

    if (damageResult.blocked) log.push(`🛡️ Bloqueaste el ataque de ${enemy.name}!`)
    else if (isBlockingThisTurn && thisBlockFailed) log.push(`💥 ¡Bloqueo fallido! ${enemy.name} te golpea por ${damageResult.damage}!`)
    else log.push(`👹 ${enemy.name} te golpea por ${damageResult.damage} de daño!`)
  }

  // Veneno
  if (effectsResult.playerHPDelta < 0) {
    currentPlayerHP = Math.max(1, currentPlayerHP + effectsResult.playerHPDelta)
  }

  const newConsecutiveBlocks = isBlockingThisTurn && !blockFailed ? input.consecutiveBlocks + 1 : 0
  const playerDefeated = currentPlayerHP <= 0
  if (playerDefeated) log.push('💀 Has sido derrotado...')

  return {
    success: true,
    newPlayerHP: Math.max(0, currentPlayerHP),
    newPlayerStamina: input.currentPlayerStamina,
    newPlayerMana: input.currentPlayerMana,
    damageByEnemy,
    playerDefeated,
    newConsecutiveBlocks,
    newStunnedEnemyIds,
    newBurnStates: toBurnStates(newStatusEffects),
    newPoisonState: toPlayerPoisonState(newStatusEffects),
    newStatusEffects,
    updatedAiStates,
    updatedEnemyHPs,
    defeatedByEffects,
    log,
    aiDebugLogs: flushAiDebugLogs(),
  }
}