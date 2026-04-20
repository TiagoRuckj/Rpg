'use server'

import { createClient } from '@/lib/supabase/server'
import {
  CombatAction, PlayerStats, BossStats, PlayerSkill,
  PrimaryStats, Item, ItemEffect, EquippedGear, EMPTY_GEAR, WeaponType, BurnState,
  EnemyType, GameClass, ClassBonuses, calcClassBonuses,
  deriveStatsWithGear, EnemyCombatState,
} from '@/types/game'
import {
  resolvePlayerAttack,
  resolveEnemyAttack,
  resolveWeaponPassive,
  buildCombatLog,
} from '@/lib/game/combat'

export interface EnemyTurnState {
  instanceId: number
  currentHP: number
  maxHP: number
  alive: boolean
  attack: number
  defense: number
  name: string
  enemyTypes: EnemyType[]
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
  stunnedEnemyIds: number[]   // enemigos stunneados el turno anterior (no atacan)
  burnStates: BurnState[]      // estado de quemadura activo
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
  newStunnedEnemyIds: number[]   // stunneados este turno (para el siguiente)
  newBurnStates: BurnState[]      // quemaduras actualizadas
  log: string[]
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
    log: logMsg ? [logMsg] : [],
  }
}

export async function takeTurnAction(input: TakeTurnInput): Promise<TakeTurnResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResult(input, 'No autorizado')

  const { data: player } = await supabase
    .from('players')
    .select('name, primary_stats')
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

  // Tipo de arma equipada
  const weaponType: WeaponType = (gear.weapon?.stats?.weapon_type ?? 'none') as WeaponType
  const staffAttackBonus = weaponType === 'staff' ? (gear.weapon?.stats?.attack ?? 0) : 0

  // Leer clases equipadas
  const { data: playerFull } = await supabase
    .from('players')
    .select('equipped_classes')
    .eq('id', user.id)
    .single()

  const equippedClassIds: string[] = playerFull?.equipped_classes ?? []
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

  // ── Validaciones pre-acción ───────────────────────────────────────────────

  if (input.action === 'skill' && input.skillUsed) {
    if (input.currentPlayerStamina < input.skillUsed.stamina_cost)
      return errorResult(input, 'No tenés suficiente stamina', '❌ No tenés suficiente stamina!')
    if (input.currentPlayerMana < input.skillUsed.mana_cost)
      return errorResult(input, 'No tenés suficiente mana', '❌ No tenés suficiente mana!')
  }

  // Para usar ítem: verificar en DB que existe y tiene quantity > 0, luego descontar
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

    // Descontar quantity (o eliminar fila si llega a 0)
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
  let newPlayerHP_fromItem = input.currentPlayerHP  // HP modificado por ítem antes del contraataque
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
    // Bastón: sumar ataque_bastón*2 como daño mínimo a hechizos mágicos
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

  if (input.action === 'item' && verifiedItemEffect) {
    // El ítem se aplica ANTES del contraataque enemigo
    const healHP      = verifiedItemEffect.heal_hp      ?? 0
    const healStamina = verifiedItemEffect.heal_stamina ?? 0
    const healMana    = verifiedItemEffect.heal_mana    ?? 0

    // Calcular max_hp real con gear para no pasarnos del tope
    const maxHP      = playerStats.max_hp
    const maxStamina = playerStats.max_stamina
    const maxMana    = playerStats.max_mana

    newPlayerHP_fromItem = Math.min(input.currentPlayerHP + healHP, maxHP)
    newPlayerStamina     = Math.min(input.currentPlayerStamina + healStamina, maxStamina)
    newPlayerMana        = Math.min(input.currentPlayerMana    + healMana,    maxMana)

    // Curación real = lo que realmente subió (puede ser menos que el valor nominal por el tope)
    const actualHealHP      = newPlayerHP_fromItem - input.currentPlayerHP
    const actualHealStamina = Math.min(input.currentPlayerStamina + healStamina, maxStamina) - input.currentPlayerStamina
    const actualHealMana    = Math.min(input.currentPlayerMana    + healMana,    maxMana)    - input.currentPlayerMana

    const parts: string[] = []
    if (actualHealHP      > 0) parts.push(`❤️ +${actualHealHP} HP`)
    if (actualHealStamina > 0) parts.push(`⚡ +${actualHealStamina} stamina`)
    if (actualHealMana    > 0) parts.push(`🔮 +${actualHealMana} mana`)
    if (healHP > 0 && actualHealHP === 0) parts.push(`❤️ HP al máximo`)
    log.push(`🧪 ${player.name} usa ${verifiedItemName}${parts.length ? ' — ' + parts.join(', ') : ''} (HP: ${input.currentPlayerHP} → ${newPlayerHP_fromItem}/${maxHP})`)
  }

  const actionType = input.action === 'block' ? 'block'
    : input.action === 'skill'  ? 'skill'
    : input.action === 'item'   ? 'item'
    : 'attack'

  // ── Construir HPs actualizados (base, antes de passives) ────────────────
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
  let executedTarget = false
  let passiveLog: string[] = []

  if ((input.action === 'attack' || input.action === 'skill') && weaponType !== 'none') {
    const adjacentEnemies = liveEnemies
      .filter(e => e.instanceId !== target.instanceId)
      .map(e => ({
        instanceId: e.instanceId,
        name: e.name,
        currentHP: e.currentHP,
        defense: e.defense,
      }))

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

    passiveLog = [...passive.log]

    // Espada: aplicar splash a adyacentes
    for (const [idStr, dmg] of Object.entries(passive.splashDamage)) {
      const instId = Number(idStr)
      if (updatedEnemyHPs[instId] !== undefined) {
        updatedEnemyHPs[instId] = Math.max(0, updatedEnemyHPs[instId] - dmg)
      }
    }

    // Hacha: ejecución
    if (passive.executed) {
      executedTarget = true
      updatedEnemyHPs[target.instanceId] = 0
    }

    // Martillo: stun
    if (passive.stunned) {
      newStunnedEnemyIds.push(target.instanceId)
    }

    // Lanza: segundo ataque
    if (passive.secondAttackDamage > 0) {
      // Si el objetivo principal ya cayó (ejecutado o muerto), atacar al siguiente vivo
      const secondTargetId = updatedEnemyHPs[target.instanceId] <= 0
        ? liveEnemies.find(e => e.instanceId !== target.instanceId)?.instanceId
        : target.instanceId
      if (secondTargetId !== undefined && updatedEnemyHPs[secondTargetId] !== undefined) {
        updatedEnemyHPs[secondTargetId] = Math.max(0, updatedEnemyHPs[secondTargetId] - passive.secondAttackDamage)
      }
    }

    // Registrar nuevos derrotados por passives
    for (const e of liveEnemies) {
      if (updatedEnemyHPs[e.instanceId] <= 0 && !defeatedEnemyInstanceIds.includes(e.instanceId)) {
        defeatedEnemyInstanceIds.push(e.instanceId)
        log.push(`🏆 ¡Derrotaste a ${e.name}!`)
      }
    }
  }

  // ── Quemadura activa — aplicar daño, log se agrega después del ataque del jugador
  let newBurnStates: BurnState[] = []
  const burnLog: string[] = []
  for (const burn of input.burnStates) {
    const enemy = liveEnemies.find(e => e.instanceId === burn.instanceId)
    if (!enemy) continue
    const burnDmg = Math.max(1, Math.round(updatedEnemyHPs[burn.instanceId] * 0.05))
    updatedEnemyHPs[burn.instanceId] = Math.max(0, updatedEnemyHPs[burn.instanceId] - burnDmg)
    burnLog.push(`🔥 ${enemy.name} sufre ${burnDmg} de daño por quemadura! (${burn.turnsLeft} turno${burn.turnsLeft !== 1 ? 's' : ''} restante${burn.turnsLeft !== 1 ? 's' : ''})`)
    if (updatedEnemyHPs[burn.instanceId] <= 0 && !defeatedEnemyInstanceIds.includes(burn.instanceId)) {
      defeatedEnemyInstanceIds.push(burn.instanceId)
      burnLog.push(`🏆 ¡Derrotaste a ${enemy.name}!`)
    }
    if (burn.turnsLeft > 1) newBurnStates.push({ instanceId: burn.instanceId, turnsLeft: burn.turnsLeft - 1 })
  }

  // ── Aplicar nueva quemadura si la skill tiene burn_chance ─────────────────
  let newBurnApplied = false
  if (input.action === 'skill' && input.skillUsed?.burn_chance && playerDamageResult.damage > 0) {
    const alreadyBurning = newBurnStates.some(b => b.instanceId === target.instanceId)
    if (!alreadyBurning && Math.random() < input.skillUsed.burn_chance) {
      newBurnStates.push({ instanceId: target.instanceId, turnsLeft: 3 })
      newBurnApplied = true
    }
  }

  // ── Contraataque de cada enemigo vivo ─────────────────────────────────────
  // Al usar ítem, el jugador no bloquea ni ataca — recibe daño normal
  const isBlockingThisTurn = input.action === 'block'
  let currentPlayerHP = newPlayerHP_fromItem
  let blockFailed = false

  // Log del ataque del jugador para 1 enemigo (independiente del contraataque)
  if (liveEnemies.length === 1 && input.action !== 'item') {
    const singleEnemy = liveEnemies[0]
    const critText = playerDamageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
    if (actionType === 'block') {
      log.push(`🛡️ ${player.name} toma posición defensiva!`)
    } else if (actionType === 'skill' && input.skillUsed) {
      log.push(`✨ ${player.name} usa ${input.skillUsed.name} en ${singleEnemy.name} por ${playerDamageResult.damage} de daño!${critText}`)
    } else {
      log.push(`⚔️ ${player.name} ataca a ${singleEnemy.name} por ${playerDamageResult.damage} de daño!${critText}`)
    }
    log.push(...passiveLog)
    if (newBurnApplied) log.push(`🔥 ¡${target.name} está en llamas! Sufrirá daño por 3 turnos.`)
    log.push(...burnLog)
  }

  for (const enemy of liveEnemies) {
    // Martillo: enemigo stunneado el turno anterior no ataca
    if (input.stunnedEnemyIds.includes(enemy.instanceId)) {
      log.push(`🔨 ${enemy.name} está aturdido y no puede atacar!`)
      continue
    }
    // Dummy/entrenamiento: enemigo con attack 0 no contraataca
    if (enemy.attack === 0) continue

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
      // Un solo enemigo que sí ataca: log del contraataque
      if (input.action === 'item') {
        if (enemyDamageResult.blocked) {
          log.push(`🛡️ Bloqueaste el ataque de ${enemy.name}!`)
        } else {
          log.push(`👹 ${enemy.name} te golpea por ${enemyDamageResult.damage} de daño!`)
        }
      } else {
        // Solo loguear el contraataque (el ataque del jugador ya se logueó arriba)
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

  // Log del ataque del jugador al frente cuando hay múltiples enemigos
  if (liveEnemies.length > 1 && input.action !== 'item') {
    const attackLog: string[] = []
    if (actionType === 'block') {
      attackLog.push(`🛡️ ${player.name} toma posición defensiva!`)
    } else if (actionType === 'skill' && input.skillUsed) {
      const critText = playerDamageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
      attackLog.push(`✨ ${player.name} usa ${input.skillUsed.name} en ${target.name} por ${playerDamageResult.damage} de daño!${critText}`)
    } else {
      const critText = playerDamageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : playerDamageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
      attackLog.push(`⚔️ ${player.name} ataca a ${target.name} por ${playerDamageResult.damage} de daño!${critText}`)
    }
    log.unshift(...attackLog)
    log.push(...passiveLog)
    if (newBurnApplied) log.push(`🔥 ¡${target.name} está en llamas! Sufrirá daño por 3 turnos.`)
    log.push(...burnLog)
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
    log,
  }
}