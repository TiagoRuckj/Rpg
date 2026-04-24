'use server'

import { createClient } from '@/lib/supabase/server'
import {
  CombatAction, PlayerStats, BossStats, PlayerSkill,
  PrimaryStats, Item, ItemEffect, EquippedGear, EMPTY_GEAR, WeaponType,
  EnemyType, GameClass, ClassBonuses, calcClassBonuses,
  deriveStatsWithGear, EnemyCombatState,
  EnemyAction, EnemyAiConfig, BossPhase, EnemyAiState, AiTier,
} from '@/types/game'
import {
  StatusEffect, StatTarget, processStatusEffects,
  applyBurn, applyPoison, applyEnemyPoison, applyEnemyBuff, applyPlayerDebuff,
  getPlayerStatMult, getEnemyStatMult, getPlayerBuffMult, getEnemyDebuffMult, getEnemyMissChance,
} from '@/lib/game/statusEffects'
import {
  resolvePlayerAttack,
  resolveEnemyAttack,
  resolveWeaponPassive,
  WEAPON_PASSIVES,
  buildTurnLog,
  applyWeaponPassiveResults,
} from '@/lib/game/combat'
import { resolveSkill, SkillContext } from '@/lib/game/skillRegistry'
import {
  resolveEnemyAction,
  evaluateBossPhase,
  flushAiDebugLogs,
  ResolveEnemyActionInput,
  EnemyCombatContext,
} from '@/lib/game/enemyAi'

export interface EnemyTurnState {
  instanceId: number
  enemyId?: number
  currentHP: number
  maxHP: number
  alive: boolean
  attack: number
  defense: number
  name: string
  enemyTypes: EnemyType[]
  aiState: EnemyAiState
}

export interface ItemUsed {
  entryId: number
  name: string
  effect: ItemEffect
}

// ─── Contexto de jugador — se carga una sola vez por action ──────────────────

interface PlayerContext {
  name: string
  primaryStats: PrimaryStats
  playerStats: PlayerStats
  gear: EquippedGear
  weaponType: WeaponType
  staffAttackBonus: number
  classBonuses: ClassBonuses
  baseCritMult: number
}

async function loadPlayerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<PlayerContext | null> {
  const { data: player } = await supabase
    .from('players')
    .select('name, primary_stats, equipped_classes, achievement_bonus')
    .eq('id', userId)
    .single()
  if (!player) return null

  const { data: equippedItems } = await supabase
    .from('inventories')
    .select('upgrade_level, instance_passives, items!inner(id, type, stats, effect, name, rarity, value, sprite)')
    .eq('player_id', userId)
    .eq('equipped', true)

  const gear: EquippedGear = { ...EMPTY_GEAR }
  if (equippedItems) {
    for (const entry of equippedItems) {
      const item = (entry as any).items as Item
      if (!item) continue
      const upgradeLevel = (entry as any).upgrade_level ?? 0
      const instancePassives = (entry as any).instance_passives ?? []
      const equippedItem = { item, upgradeLevel, instancePassives }
      switch (item.type) {
        case 'weapon':   gear.weapon = equippedItem; break
        case 'necklace': gear.necklace = equippedItem; break
        case 'ring':
          if (!gear.ring1) gear.ring1 = equippedItem
          else gear.ring2 = equippedItem
          break
        case 'armor': {
          const slot = item.stats?.slot
          if (slot && slot in gear) (gear as any)[slot] = equippedItem
          break
        }
      }
    }
  }

  const primaryStats = player.primary_stats as PrimaryStats
  const achievementBonus = player.achievement_bonus ?? { attack: 0, defense: 0, hp: 0, crit_mult: 0, gold_pct: 0, type_damage: {} }
  const playerStats = deriveStatsWithGear(primaryStats, gear, achievementBonus)
  const weaponType: WeaponType = (gear.weapon?.item.stats?.weapon_type ?? 'none') as WeaponType
  const staffAttackBonus = weaponType === 'staff' ? (gear.weapon?.item.stats?.attack ?? 0) : 0

  const equippedClassIds: string[] = player.equipped_classes ?? []
  let classBonuses: ClassBonuses = {}
  if (equippedClassIds.length > 0) {
    const { data: classData } = await supabase
      .from('classes').select('*').in('id', equippedClassIds)
    if (classData) classBonuses = calcClassBonuses(equippedClassIds, classData as GameClass[])
  }

  // Sumar crit_mult del achievement_bonus al CRIT_MULT base
  const baseCritMult = 1.75 + (achievementBonus.crit_mult ?? 0)

  // Sumar type_damage del achievement_bonus al classBonuses
  if (achievementBonus.type_damage && Object.keys(achievementBonus.type_damage).length > 0) {
    classBonuses.type_damage_bonus = classBonuses.type_damage_bonus ?? {}
    for (const [type, bonus] of Object.entries(achievementBonus.type_damage)) {
      (classBonuses.type_damage_bonus as any)[type] = ((classBonuses.type_damage_bonus as any)[type] ?? 0) + bonus
    }
  }

  return { name: player.name, primaryStats, playerStats, gear, weaponType, staffAttackBonus, classBonuses, baseCritMult }
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
  const enemyEntityIds = enemies
    .filter(e => e.enemyId != null)
    .map(e => e.enemyId as number)
    .filter((id, i, arr) => arr.indexOf(id) === i)

  const aiConfigs: EnemyAiConfig[] = []
  const actionsByConfigId: Record<number, EnemyAction[]> = {}
  const bossPhases: BossPhase[] = []

  if (enemyEntityIds.length > 0) {
    const { data: enemyAiRows } = await supabase
      .from('enemy_ai')
      .select('*')
      .eq('entity_type', 'enemy')
      .in('entity_id', enemyEntityIds)

    if (enemyAiRows) {
      for (const row of enemyAiRows) {
        aiConfigs.push(row as EnemyAiConfig)
        if (row.action_ids?.length > 0) {
          const { data: actions } = await supabase
            .from('enemy_actions').select('*').in('id', row.action_ids)
          if (actions) actionsByConfigId[row.id] = actions as EnemyAction[]
        }
      }
    }
  }

  if (bossId) {
    const { data: bossAi } = await supabase
      .from('enemy_ai')
      .select('*')
      .eq('entity_type', 'boss')
      .eq('entity_id', bossId)
      .maybeSingle()

    if (bossAi) {
      aiConfigs.push(bossAi as EnemyAiConfig)
      if (bossAi.action_ids?.length > 0) {
        const { data: actions } = await supabase
          .from('enemy_actions').select('*').in('id', bossAi.action_ids)
        if (actions) actionsByConfigId[bossAi.id] = actions as EnemyAction[]
      }
      const { data: phases } = await supabase
        .from('boss_phases').select('*').eq('boss_id', bossId).order('phase_order', { ascending: true })
      if (phases) bossPhases.push(...(phases as BossPhase[]))
    }
  }

  return { aiConfigs, actionsByConfigId, bossPhases }
}

// ─── playerTurnAction ─────────────────────────────────────────────────────────

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
  statusEffects: StatusEffect[]
  bossId?: number
  bossEnemyInstanceId?: number
  turn: number
}

export interface PlayerTurnResult {
  success: boolean
  error?: string
  playerMaxHP: number
  damageDealt: number
  isCritical: boolean
  isOvercrit: boolean
  updatedEnemyHPs: Record<number, number>
  defeatedEnemyInstanceIds: number[]
  newPlayerHP: number
  newPlayerStamina: number
  newPlayerMana: number
  newStatusEffects: StatusEffect[]
  newStunnedEnemyIds: number[]
  phaseTriggered: boolean
  summonEnemyIds: number[]
  updatedAiStates: Record<number, EnemyAiState>
  splashDamage: Record<number, number>
  log: string[]
  weaponType: string        // tipo de arma usada en este turno
  isMagicAction: boolean    // si fue una acción mágica
  maxDamageDealt: number    // daño máximo de un solo golpe (para biggest_damage)
}

export async function playerTurnAction(input: PlayerTurnInput): Promise<PlayerTurnResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const fail = (error: string, log: string[] = []): PlayerTurnResult => ({
    success: false, error, playerMaxHP: 0, damageDealt: 0, isCritical: false, isOvercrit: false,
    updatedEnemyHPs: {}, defeatedEnemyInstanceIds: [],
    newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana,
    newStatusEffects: input.statusEffects, newStunnedEnemyIds: [], phaseTriggered: false, summonEnemyIds: [], updatedAiStates: {}, splashDamage: {}, log,
    weaponType: 'none', isMagicAction: false, maxDamageDealt: 0,
  })

  if (!user) return fail('No autorizado')

  const ctx = await loadPlayerContext(supabase, user.id)
  if (!ctx) return fail('Jugador no encontrado')

  const { name, primaryStats, playerStats: basePlayerStats, gear, weaponType, staffAttackBonus, classBonuses, baseCritMult } = ctx
  const { aiConfigs, actionsByConfigId, bossPhases } = await loadAiData(supabase, input.enemies, input.bossId)

  // Aplicar debuffs y buffs del jugador sobre el ataque
  const attackDebuffMult = getPlayerStatMult(input.statusEffects, 'attack')
  const attackBuffMult   = getPlayerBuffMult(input.statusEffects, 'attack')
  let attackMult = attackDebuffMult * attackBuffMult

  // weapon_type_bonus de clases (Espadachín, Leñador, etc.)
  const weaponBonus = classBonuses.weapon_type_bonus?.[weaponType]
  const isMagicSkill = input.action === 'skill' && input.skillUsed?.type === 'magical'
  const isBasicAttack = input.action === 'attack'
  const skillUsesWeapon = input.action === 'skill' && (input.skillUsed as any)?.uses_weapon

  // El bonus aplica solo a ataque básico o skills con uses_weapon (excepto magic que usa 'magic' como tipo)
  const weaponTypeMult = (() => {
    if (isMagicSkill) {
      const magicBonus = classBonuses.weapon_type_bonus?.['magic' as any]
      return magicBonus ? 1 + magicBonus.damage : 1
    }
    if ((isBasicAttack || skillUsesWeapon) && weaponBonus) {
      return 1 + weaponBonus.damage
    }
    return 1
  })()

  const weaponTypeCritBonus = (() => {
    if (isMagicSkill) return classBonuses.weapon_type_bonus?.['magic' as any]?.crit_bonus ?? 0
    if ((isBasicAttack || skillUsesWeapon) && weaponBonus) return weaponBonus.crit_bonus
    return 0
  })()

  // Masacrador: +10% daño por enemigo vivo en sala
  const liveEnemyCount = input.enemies.filter(e => e.alive).length
  const massacradorMult = classBonuses.enemy_count_bonus
    ? 1 + classBonuses.enemy_count_bonus.damage_per_enemy * liveEnemyCount
    : 1

  attackMult *= weaponTypeMult * massacradorMult

  const playerStats = attackMult !== 1 || weaponTypeCritBonus > 0
    ? {
        ...basePlayerStats,
        attack: Math.round(basePlayerStats.attack * attackMult),
        crit_chance: Math.min(1, basePlayerStats.crit_chance + weaponTypeCritBonus),
      }
    : basePlayerStats

  // Validaciones
  if (input.action === 'skill' && input.skillUsed) {
    if (input.currentPlayerStamina < input.skillUsed.stamina_cost) return fail('No tenés suficiente stamina', ['❌ No tenés suficiente stamina!'])
    if (input.currentPlayerMana < input.skillUsed.mana_cost)    return fail('No tenés suficiente mana', ['❌ No tenés suficiente mana!'])
  }

  // Item
  let verifiedItemEffect: ItemEffect | null = null
  let verifiedItemName = ''
  let newPlayerHP = input.currentPlayerHP
  let newPlayerStamina = input.currentPlayerStamina
  let newPlayerMana = input.currentPlayerMana

  if (input.action === 'item' && input.itemUsed) {
    const { data: invEntry, error: invErr } = await supabase
      .from('inventories').select('id, quantity, items!inner(name, effect)')
      .eq('id', input.itemUsed.entryId).eq('player_id', user.id).single()
    if (invErr || !invEntry || invEntry.quantity <= 0) return fail('Ítem no disponible', ['❌ No tenés ese ítem'])
    verifiedItemEffect = (invEntry as any).items.effect as ItemEffect
    verifiedItemName   = (invEntry as any).items.name as string
    if (invEntry.quantity === 1) await supabase.from('inventories').delete().eq('id', invEntry.id)
    else await supabase.from('inventories').update({ quantity: invEntry.quantity - 1 }).eq('id', invEntry.id)
  }

  const log: string[] = []
  const liveEnemies = input.enemies.filter(e => e.alive)
  const target = input.enemies[input.targetIndex]
  if (!target || !target.alive) return fail('Objetivo inválido')

  const targetStats: BossStats = { hp: target.currentHP, max_hp: target.maxHP, attack: target.attack, defense: target.defense }

  // Resolver passive antes del ataque para obtener typeDamageBonus pre-crit
  const adjacentEnemiesForPassive = liveEnemies
    .filter(e => e.instanceId !== target.instanceId)
    .map(e => ({ instanceId: e.instanceId, name: e.name, currentHP: e.currentHP, defense: e.defense }))
  const prePassive = (input.action === 'attack' || input.action === 'skill') && weaponType !== 'none'
    ? resolveWeaponPassive(weaponType, {
        isSkill: input.action === 'skill',
        skillType: input.skillUsed?.type,
        primaryDamage: 0,  // no disponible aún, solo necesitamos typeDamageBonus
        targetCurrentHP: target.currentHP,
        targetMaxHP: target.maxHP,
        targetInstanceId: target.instanceId,
        targetName: target.name,
        targetEnemyTypes: target.enemyTypes ?? [],
        adjacentEnemies: adjacentEnemiesForPassive,
        playerAttack: playerStats.attack,
        playerSuerte: primaryStats.suerte,
        enemyDefense: target.defense,
        staffAttackBonus,
      }, [
        ...(gear.weapon?.item.stats?.passives ?? WEAPON_PASSIVES[weaponType] ?? []),
        ...(gear.weapon?.instancePassives ?? []),
      ])
    : null

  let newTargetHP = target.currentHP
  let playerDamageResult = { damage: 0, isCritical: false, isOvercrit: false, blocked: false }
  let newStatusEffects = input.statusEffects
  let splashDamage: Record<number, number> = {}

  if (input.action === 'attack') {
    const { damageResult, newEnemyHP } = resolvePlayerAttack(
      playerStats, primaryStats, targetStats, target.currentHP,
      gear, false, 1, 'physical', classBonuses, target.enemyTypes, undefined, 0,
      prePassive?.typeDamageBonus ?? {}, baseCritMult + (prePassive?.critMultBonus ?? 0), prePassive?.defenseIgnorePct ?? 0
    )
    playerDamageResult = damageResult
    newTargetHP = newEnemyHP
  }

  if (input.action === 'skill' && input.skillUsed) {
    const skillCtx: SkillContext = {
      skill: input.skillUsed,
      playerName: name,
      playerStats,
      primaryStats,
      gear,
      classBonuses,
      staffAttackBonus,
      weaponTypeDamageBonus: prePassive?.typeDamageBonus ?? {},
      critMult: baseCritMult + (prePassive?.critMultBonus ?? 0),
      defenseIgnorePct: prePassive?.defenseIgnorePct ?? 0,
      target,
      liveEnemies,
      statusEffects: newStatusEffects,
      currentPlayerHP: newPlayerHP,
      currentPlayerStamina: newPlayerStamina,
      currentPlayerMana: newPlayerMana,
    }
    const skillResult = resolveSkill(skillCtx)
    log.push(...skillResult.log)
    if (skillResult.damageResult) playerDamageResult = skillResult.damageResult
    if (skillResult.newTargetHP !== undefined) newTargetHP = skillResult.newTargetHP
    if (skillResult.healPlayer) newPlayerHP = Math.min(newPlayerHP + skillResult.healPlayer, playerStats.max_hp)
    if (skillResult.newStatusEffects) newStatusEffects = skillResult.newStatusEffects
    if (skillResult.splashDamage) Object.assign(splashDamage, skillResult.splashDamage)
    newPlayerStamina = input.currentPlayerStamina - input.skillUsed.stamina_cost
    newPlayerMana    = input.currentPlayerMana    - input.skillUsed.mana_cost
  }

  if (input.action === 'item' && verifiedItemEffect) {
    newPlayerHP      = Math.min(input.currentPlayerHP + (verifiedItemEffect.heal_hp ?? 0), playerStats.max_hp)
    newPlayerStamina = Math.min(input.currentPlayerStamina + (verifiedItemEffect.heal_stamina ?? 0), playerStats.max_stamina)
    newPlayerMana    = Math.min(input.currentPlayerMana    + (verifiedItemEffect.heal_mana    ?? 0), playerStats.max_mana)
    const healedHP  = newPlayerHP - input.currentPlayerHP
    const healedST  = newPlayerStamina - input.currentPlayerStamina
    const healedMP  = newPlayerMana - input.currentPlayerMana
    const parts: string[] = []
    if (healedHP  > 0) parts.push(`+${healedHP} HP`)
    if (healedST  > 0) parts.push(`+${healedST} stamina`)
    if (healedMP  > 0) parts.push(`+${healedMP} maná`)
    log.push(`🧪 ${name} usa ${verifiedItemName}${parts.length > 0 ? ` — ${parts.join(', ')}` : ''}`)
  }

  if (input.action === 'attack') {
    const critText = playerDamageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
    log.push(`⚔️ ${name} ataca a ${target.name} por ${playerDamageResult.damage} de daño!${critText}`)
  }
  if (input.action === 'block') log.push(`🛡️ ${name} toma posición defensiva!`)

  const updatedEnemyHPs: Record<number, number> = {}
  for (const e of input.enemies) {
    updatedEnemyHPs[e.instanceId] = e.instanceId === target.instanceId ? newTargetHP : e.currentHP
  }

  // Aplicar splash de skill al mapa de HPs
  for (const [idStr, dmg] of Object.entries(splashDamage)) {
    const id = Number(idStr)
    updatedEnemyHPs[id] = Math.max(0, (updatedEnemyHPs[id] ?? 0) - dmg)
  }

  // Passives de arma
  const newStunnedFromPassive: number[] = []

  if ((input.action === 'attack' || input.action === 'skill') && weaponType !== 'none' && prePassive) {
    const passive = resolveWeaponPassive(weaponType, {
      isSkill: input.action === 'skill',
      skillType: input.skillUsed?.type,
      primaryDamage: playerDamageResult.damage,
      targetCurrentHP: target.currentHP,
      targetMaxHP: target.maxHP,
      targetInstanceId: target.instanceId,
      targetName: target.name,
      targetEnemyTypes: target.enemyTypes ?? [],
      adjacentEnemies: adjacentEnemiesForPassive,
      playerAttack: playerStats.attack,
      playerSuerte: primaryStats.suerte,
      enemyDefense: target.defense,
      staffAttackBonus,
    }, [
        ...(gear.weapon?.item.stats?.passives ?? WEAPON_PASSIVES[weaponType] ?? []),
        ...(gear.weapon?.instancePassives ?? []),
      ])
    log.push(...passive.log)
    const passiveResult = applyWeaponPassiveResults({ passive, target, liveEnemies, updatedEnemyHPs, defeatedEnemyInstanceIds: [], stunnedEnemyIds: [] })
    Object.assign(updatedEnemyHPs, passiveResult.updatedEnemyHPs)
    newStunnedFromPassive.push(...passiveResult.newStunnedEnemyIds)
    Object.assign(splashDamage, passive.splashDamage)
  }

  const defeatedEnemyInstanceIds: number[] = []
  for (const e of liveEnemies) {
    if (updatedEnemyHPs[e.instanceId] <= 0 && !defeatedEnemyInstanceIds.includes(e.instanceId)) {
      defeatedEnemyInstanceIds.push(e.instanceId)
    }
  }

  // ── Cap de HP al umbral de fase (sin activar la fase) ───────────────────────
  // La fase se activa en endTurnAction — acá solo limitamos el HP visible
  if (input.bossId && bossPhases.length > 0) {
    const bossEnemy = input.bossEnemyInstanceId !== undefined
      ? input.enemies.find(e => e.instanceId === input.bossEnemyInstanceId)
      : input.enemies.find(e => e.alive)
    if (bossEnemy) {
      const currentHP = updatedEnemyHPs[bossEnemy.instanceId]
      const triggeredPhases = bossEnemy.aiState.triggeredPhases
      const phase = evaluateBossPhase(bossPhases, currentHP, bossEnemy.maxHP, triggeredPhases)
      if (phase) {
        const clampedHP = Math.max(1, Math.floor(bossEnemy.maxHP * phase.hp_threshold))
        updatedEnemyHPs[bossEnemy.instanceId] = clampedHP
        // Si el boss quedó "muerto" antes del cap, sacarlo de los derrotados
        const killedIdx = defeatedEnemyInstanceIds.indexOf(bossEnemy.instanceId)
        if (killedIdx !== -1) defeatedEnemyInstanceIds.splice(killedIdx, 1)
      }
    }
  }

  // Calcular daño máximo del turno (para biggest_damage)
  const allDamages = [
    playerDamageResult.damage,
    ...Object.values(splashDamage),
  ]
  const maxDamageDealt = Math.max(0, ...allDamages)
  const isMagicAction = input.action === 'skill' && input.skillUsed?.type === 'magical'

  return {
    success: true,
    playerMaxHP: playerStats.max_hp,
    damageDealt: playerDamageResult.damage,
    isCritical: playerDamageResult.isCritical,
    isOvercrit: playerDamageResult.isOvercrit,
    updatedEnemyHPs,
    defeatedEnemyInstanceIds,
    newPlayerHP,
    newPlayerStamina,
    newPlayerMana,
    newStatusEffects,
    newStunnedEnemyIds: newStunnedFromPassive,
    phaseTriggered: false,
    summonEnemyIds: [],
    updatedAiStates: {},
    splashDamage,
    log,
    weaponType,
    isMagicAction,
    maxDamageDealt,
  }
}

// ─── enemyTurnAction ──────────────────────────────────────────────────────────

export interface EnemyTurnInput {
  currentPlayerHP: number
  currentPlayerStamina: number
  currentPlayerMana: number
  enemies: EnemyTurnState[]
  isBlocking: boolean
  consecutiveBlocks: number
  stunnedEnemyIds: number[]
  statusEffects: StatusEffect[]
  bossId?: number
  bossEnemyInstanceId?: number
  turn: number
  phaseTriggeredThisTurn: boolean
}

export interface EnemyTurnResult {
  success: boolean
  error?: string
  newPlayerHP: number
  newPlayerStamina: number
  newPlayerMana: number
  damageByEnemy: Record<number, number>
  playerDefeated: boolean
  newConsecutiveBlocks: number
  newStunnedEnemyIds: number[]
  newStatusEffects: StatusEffect[]
  updatedAiStates: Record<number, EnemyAiState>
  updatedEnemyHPs: Record<number, number>
  log: string[]
  aiDebugLogs: Array<{ tier: string; enemyName: string; data: Record<string, unknown> }>
}

export async function enemyTurnAction(input: EnemyTurnInput): Promise<EnemyTurnResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const fail = (msg: string): EnemyTurnResult => ({
    success: false, error: msg,
    newPlayerHP: input.currentPlayerHP, newPlayerStamina: input.currentPlayerStamina, newPlayerMana: input.currentPlayerMana,
    damageByEnemy: {}, playerDefeated: false,
    newConsecutiveBlocks: input.consecutiveBlocks, newStunnedEnemyIds: [],
    newStatusEffects: input.statusEffects,
    updatedAiStates: {}, updatedEnemyHPs: {}, log: [], aiDebugLogs: [],
  })

  if (!user) return fail('No autorizado')

  const ctx = await loadPlayerContext(supabase, user.id)
  if (!ctx) return fail('Jugador no encontrado')

  const { playerStats } = ctx
  const { aiConfigs, actionsByConfigId, bossPhases } = await loadAiData(supabase, input.enemies, input.bossId)

  const log: string[] = []
  const liveEnemies = input.enemies.filter(e => e.alive)
  const updatedEnemyHPs: Record<number, number> = {}
  for (const e of input.enemies) updatedEnemyHPs[e.instanceId] = e.currentHP

  const newStunnedEnemyIds: number[] = []
  let newStatusEffects = input.statusEffects
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
    if (enemy.attack === 0) {
      // Dummy de entrenamiento — no ataca pero sí acumula energía para el debug de IA
      const energyPerTurn = (await (async () => {
        const aiConfig = aiConfigs.find(c => c.entity_id === enemy.enemyId && c.entity_type === 'enemy')
        return aiConfig?.energy_per_turn ?? 1
      })())
      if (enemy.aiState) {
        const newEnergy = Math.min(enemy.aiState.energy + energyPerTurn, enemy.aiState.maxEnergy)
        updatedAiStates[enemy.instanceId] = { ...enemy.aiState, energy: newEnergy }
      }
      continue
    }

    const isBossEntity = input.bossId !== undefined && (
      input.bossEnemyInstanceId !== undefined
        ? enemy.instanceId === input.bossEnemyInstanceId
        : input.enemies.indexOf(enemy) === 0  // fallback legacy
    )
    if (isBossEntity && input.phaseTriggeredThisTurn) {
      log.push(`👑 ${enemy.name} reorganiza sus fuerzas...`)
      continue
    }

    const entityType = isBossEntity ? 'boss' : 'enemy'
    const aiConfig = aiConfigs.find(c =>
      c.entity_type === entityType &&
      (isBossEntity ? c.entity_id === input.bossId : c.entity_id === enemy.enemyId)
    )
    const availableActions = aiConfig ? (actionsByConfigId[aiConfig.id] ?? []) : []
    const isBoss = input.bossId !== undefined && aiConfig?.entity_type === 'boss'

    const enemyCtx: EnemyCombatContext = {
      ...combatCtx,
      selfHP: updatedEnemyHPs[enemy.instanceId], selfMaxHP: enemy.maxHP,
      selfActiveEffects: newStatusEffects.filter(e => e.target === 'enemy' && e.instanceId === enemy.instanceId).map(e => e.type),
    }

    // Miss chance por confused (Engaño)
    const missChance = getEnemyMissChance(newStatusEffects, enemy.instanceId)
    if (missChance > 0 && Math.random() < missChance) {
      log.push(`🎭 ${enemy.name} falla su ataque por confusión!`)
      continue
    }

    const { result: aiResult, newAiState } = resolveEnemyAction({
      enemy: {
        instanceId: enemy.instanceId,
        enemy: { id: 0, dungeon_id: 0, name: enemy.name, stats: {
        hp: enemy.maxHP,
        attack: Math.round(enemy.attack * getEnemyStatMult(newStatusEffects, enemy.instanceId, 'attack') * getEnemyDebuffMult(newStatusEffects, enemy.instanceId, 'attack')),
        defense: Math.round(enemy.defense * getEnemyStatMult(newStatusEffects, enemy.instanceId, 'defense')),
      }, loot_table: [], enemy_type: enemy.enemyTypes, max_energy: enemy.aiState?.maxEnergy ?? 3 },
        currentHP: updatedEnemyHPs[enemy.instanceId], maxHP: enemy.maxHP, alive: true,
        aiState: enemy.aiState, statMults: null,
      },
      availableActions, aiState: enemy.aiState, ctx: enemyCtx,
      phases: isBoss ? bossPhases : [],
      energyPerTurn: aiConfig?.energy_per_turn ?? 1,
    })

    updatedAiStates[enemy.instanceId] = {
      ...newAiState,
      tier: (aiConfig?.ai_tier ?? newAiState.tier) as AiTier,
    }
    log.push(...aiResult.log)

    if (aiResult.damageToPlayer > 0) {
      // aiResult.damageToPlayer es daño bruto (attack × mult) — resolveEnemyAttack aplica defensa y variación
      const enemyStats: BossStats = { hp: enemy.currentHP, max_hp: enemy.maxHP, attack: aiResult.damageToPlayer, defense: enemy.defense }
      const { damageResult, newPlayerHP, blockFailed: thisBlockFailed } = resolveEnemyAttack(enemyStats, playerStats, currentPlayerHP, isBlockingThisTurn, input.consecutiveBlocks)
      damageByEnemy[enemy.instanceId] = damageResult.blocked ? 0 : damageResult.damage
      currentPlayerHP = newPlayerHP
      if (thisBlockFailed) blockFailed = true
      // Log con daño real post-defensa (completa el log parcial de enemyAi)
      if (damageResult.blocked) log.push(` — 🛡️ Bloqueaste el ataque!`)
      else if (isBlockingThisTurn && thisBlockFailed) log.push(` — 💥 ¡Bloqueo fallido! ${damageResult.damage} de daño!`)
      else log.push(` — ${damageResult.damage} de daño!`)
    }

    if (aiResult.selfHeal > 0) {
      updatedEnemyHPs[enemy.instanceId] = Math.min(updatedEnemyHPs[enemy.instanceId] + aiResult.selfHeal, enemy.maxHP)
    }

    for (const effectName of aiResult.newPlayerEffects) {
      if (effectName === 'poison') {
        newStatusEffects = applyPoison(newStatusEffects)
        log.push(`☠️ ¡${enemy.name} te ha envenenado!`)
      } else if (effectName.startsWith('player_debuff:')) {
        const [, stat, multStr] = effectName.split(':')
        const mult = parseFloat(multStr)
        if (stat && !isNaN(mult)) {
          newStatusEffects = applyPlayerDebuff(stat as StatTarget, mult, newStatusEffects)
          log.push(`⬇️ ¡${enemy.name} te ha debuffeado! (${stat} ×${mult})`)
        }
      } else if (effectName.startsWith('enemy_buff:')) {
        const [, stat, multStr] = effectName.split(':')
        const mult = parseFloat(multStr)
        if (stat && !isNaN(mult)) {
          newStatusEffects = applyEnemyBuff(enemy.instanceId, stat as StatTarget, mult, newStatusEffects)
          log.push(`✨ ¡${enemy.name} se ha buffeado! (${stat} ×${mult})`)
        }
      }
    }
  }

  // (veneno procesado en endTurnAction)

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
    newStatusEffects,
    updatedAiStates,
    updatedEnemyHPs,
    log,
    aiDebugLogs: flushAiDebugLogs(),
  }
}

// ─── endTurnAction ────────────────────────────────────────────────────────────
// Tercer paso del turno:
//   1. Evaluar fases del boss (cap HP al umbral si fue cruzado por el ataque)
//   2. Aplicar status effects (burn, poison, stun)
//   3. Evaluar fases del boss de nuevo (cap HP si efectos cruzaron un umbral)

export interface EndTurnInput {
  statusEffects: StatusEffect[]
  enemies: EnemyTurnState[]
  currentPlayerHP: number
  // Boss data para evaluación de fases
  bossId?: number
  bossEnemyInstanceId?: number  // instanceId del boss en el array
}

export interface PhaseResult {
  phaseTriggered: boolean
  summonEnemyIds: number[]
  updatedAiState: EnemyAiState | null
}

export interface EndTurnResult {
  success: boolean
  updatedEnemyHPs: Record<number, number>
  defeatedByEffects: number[]
  newPlayerHP: number
  playerDefeated: boolean
  newStatusEffects: StatusEffect[]
  // Fase activada (si la hubo)
  phaseResult: PhaseResult
  log: string[]
}

export async function endTurnAction(input: EndTurnInput): Promise<EndTurnResult> {
  const supabase = await createClient()
  const updatedEnemyHPs: Record<number, number> = {}
  for (const e of input.enemies) updatedEnemyHPs[e.instanceId] = e.currentHP

  const log: string[] = []
  const liveEnemies = input.enemies.filter(e => e.alive)
  const phaseResult: PhaseResult = { phaseTriggered: false, summonEnemyIds: [], updatedAiState: null }

  // Cargar fases del boss si hay boss activo
  let bossPhases: BossPhase[] = []
  if (input.bossId) {
    const { data: phases } = await supabase
      .from('boss_phases').select('*').eq('boss_id', input.bossId).order('phase_order', { ascending: true })
    if (phases) bossPhases = phases as BossPhase[]
  }

  // ── 1. Evaluar fase con HP post-ataque ────────────────────────────────────
  const bossEnemy = input.bossEnemyInstanceId !== undefined
    ? input.enemies.find(e => e.instanceId === input.bossEnemyInstanceId)
    : undefined

  const tryActivatePhase = (currentHP: number): boolean => {
    if (!bossEnemy || !bossPhases.length) return false
    const triggeredPhases = bossEnemy.aiState.triggeredPhases
    const phase = evaluateBossPhase(bossPhases, currentHP, bossEnemy.maxHP, [
      ...triggeredPhases,
      ...(phaseResult.phaseTriggered ? [phaseResult.updatedAiState!.activePhaseOrder] : [])
    ])
    if (!phase) return false

    const clampedHP = Math.max(1, Math.floor(bossEnemy.maxHP * phase.hp_threshold))
    updatedEnemyHPs[bossEnemy.instanceId] = clampedHP

    if (phase.summon_enemy_ids?.length) {
      phaseResult.summonEnemyIds.push(...phase.summon_enemy_ids)
      log.push(`🔔 ¡Invoca ${phase.summon_enemy_ids.length > 1 ? phase.summon_enemy_ids.length + ' refuerzos' : 'un refuerzo'}!`)
    }
    log.push(`⚠️ ¡El jefe entra en una nueva fase!`)

    phaseResult.phaseTriggered = true
    phaseResult.updatedAiState = {
      ...bossEnemy.aiState,
      tier: phase.ai_tier ?? bossEnemy.aiState.tier,
      activePhaseOrder: phase.phase_order,
      triggeredPhases: [...bossEnemy.aiState.triggeredPhases, phase.phase_order],
      nextActionId: null,
    }
    return true
  }

  if (bossEnemy) {
    tryActivatePhase(updatedEnemyHPs[bossEnemy.instanceId])
  }

  // ── 2. Aplicar status effects ─────────────────────────────────────────────
  const enemyNames: Record<number, string> = {}
  for (const e of liveEnemies) enemyNames[e.instanceId] = e.name

  const effectsResult = processStatusEffects(input.statusEffects, updatedEnemyHPs, enemyNames)

  for (const [idStr, delta] of Object.entries(effectsResult.enemyHPDeltas)) {
    const id = Number(idStr)
    const prevHP = updatedEnemyHPs[id] ?? 0
    let newHP = Math.max(0, prevHP + delta)

    // Si es el boss y hay un umbral no activado, capear el daño al umbral
    if (bossEnemy && id === bossEnemy.instanceId && delta < 0) {
      const triggeredSoFar = [
        ...bossEnemy.aiState.triggeredPhases,
        ...(phaseResult.updatedAiState ? [phaseResult.updatedAiState.activePhaseOrder] : [])
      ]
      const nextPhase = evaluateBossPhase(bossPhases, newHP, bossEnemy.maxHP, triggeredSoFar)
      if (nextPhase) {
        newHP = Math.max(1, Math.floor(bossEnemy.maxHP * nextPhase.hp_threshold))
      }
    }

    updatedEnemyHPs[id] = newHP
  }

  log.push(...effectsResult.log)

  // ── 3. Evaluar fase de nuevo si efectos cruzaron umbral ───────────────────
  if (bossEnemy && !phaseResult.phaseTriggered) {
    tryActivatePhase(updatedEnemyHPs[bossEnemy.instanceId])
  }

  const defeatedByEffects: number[] = []
  for (const e of liveEnemies) {
    if (updatedEnemyHPs[e.instanceId] <= 0 && !defeatedByEffects.includes(e.instanceId)) {
      defeatedByEffects.push(e.instanceId)
      log.push(`🏆 ¡Derrotaste a ${e.name}!`)
    }
  }

  let newPlayerHP = input.currentPlayerHP
  if (effectsResult.playerHPDelta < 0) {
    newPlayerHP = Math.max(1, input.currentPlayerHP + effectsResult.playerHPDelta)
  }

  return {
    success: true,
    updatedEnemyHPs,
    defeatedByEffects,
    newPlayerHP,
    playerDefeated: newPlayerHP <= 0,
    newStatusEffects: effectsResult.updatedEffects,
    phaseResult,
    log,
  }
}