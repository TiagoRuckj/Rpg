'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  Player, Dungeon, Boss, Enemy, CombatAction, PlayerSkill,
  EnemyType, EnemyCombatState, deriveStats, depthMultiplier, rollEnemyCount,
  rollRoomEvent, EnemyAiState, EnemyAiConfig,
} from '@/types/game'
import { useCombatStore } from '@/stores/combatStore'
import { playerTurnAction, enemyTurnAction, endTurnAction, EnemyTurnState, ItemUsed } from '@/actions/combatActions'
import { registerKillAction } from '@/actions/classActions'
import { saveRunAction } from '@/actions/saveRunAction'
import { clearRunAction } from '@/actions/activeRunAction'
import { BASE_SKILLS, LOCKED_SKILLS } from '@/lib/game/skills'
import { resolveEnemyLoot, resolveBossLoot } from '@/lib/game/loot'
import { nextInstanceId, buildEnemyCombatStates, buildSummonedEnemy } from '@/lib/game/spawn'
import { initAiState } from '@/lib/game/enemyAi'
import { StatusEffect } from '@/lib/game/statusEffects'
import { useItemHandlers } from './hooks/useItemHandlers'
import { BetweenRoomsScreen } from './components/BetweenRoomsScreen'
import { ResultsScreen } from './components/ResultsScreen'
import { CombatScreen, EnemyAnimState, PlayerAnimState } from './components/CombatScreen'
import { VictoryModal } from './components/VictoryModal'
import { getPlayerMaxHPAction } from '@/actions/playerStatsAction'
import AiDebugPanel, { AiDebugEntry } from './components/AiDebugPanel'

export { nextInstanceId, buildEnemyCombatStates }

interface Props {
  player: Player
  dungeon: Dungeon
  boss: Boss
  enemies: Enemy[]
  aiConfigs: EnemyAiConfig[]
  eventBosses: Boss[]
  onBack?: () => void
  onBackToDungeonBoard?: () => void
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CombatClient({ player, dungeon, boss, enemies, aiConfigs, eventBosses, onBack, onBackToDungeonBoard }: Props) {
  const router = useRouter()
  const logRef = useRef<HTMLDivElement>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeEventBoss, setActiveEventBoss] = useState<Boss | null>(
    (eventBosses ?? []).find(b => b.name === 'Gran Goblin') ?? null
  )
  const [fightingEvent, setFightingEvent] = useState(false)
  const aiDebugAccRef = useRef<AiDebugEntry[]>([])
  const [aiDebugTick, setAiDebugTick] = useState(0)
  const [eventPendingGold, setEventPendingGold] = useState(0)
  const [lastLoot, setLastLoot] = useState<{ exp: number; gold: number; itemId: number | null; itemName: string | null } | null>(null)
  const [bossDrops, setBossDrops] = useState<{ name: string; sprite: string }[]>([])

  // ── maxHP real (con gear) — se actualiza del primer resultado del server ────
  const [realMaxHP, setRealMaxHP] = useState<number | null>(null)
  // hpReady evita mostrar HP/maxHP inconsistentes mientras carga el maxHP real
  const [hpReady, setHpReady] = useState(false)

  // ── Estado de victoria ───────────────────────────────────────────────────
  const [victoryModal, setVictoryModal] = useState<{
    type: 'room' | 'boss'
    exp: number
    gold: number
    items: { itemId: number; itemName: string; sprite?: string }[]
  } | null>(null)

  // ── Estado de animaciones ─────────────────────────────────────────────────
  const [enemyAnimStates, setEnemyAnimStates] = useState<Record<number, EnemyAnimState>>({})
  const [playerAnimState, setPlayerAnimState] = useState<PlayerAnimState>('idle')
  const [floatingDamages, setFloatingDamages] = useState<Array<{ id: number; instanceId: number; value: number; isCrit: boolean; isPlayer: boolean }>>([])
  const floatIdRef = useRef(0)

  function triggerEnemyAnim(instanceId: number, type: EnemyAnimState, ms = 400) {
    setEnemyAnimStates(prev => ({ ...prev, [instanceId]: type }))
    // 'dead' no resetea — el sprite permanece en estado muerto hasta que el modal limpia el estado
    if (type !== 'dead') {
      setTimeout(() => setEnemyAnimStates(prev => ({ ...prev, [instanceId]: 'idle' })), ms)
    }
  }

  function triggerPlayerAnim(type: PlayerAnimState, ms = 400) {
    setPlayerAnimState(type)
    setTimeout(() => setPlayerAnimState('idle'), ms)
  }

  function spawnFloat(instanceId: number, value: number, isCrit: boolean, isPlayer: boolean) {
    if (value <= 0) return
    const id = ++floatIdRef.current
    setFloatingDamages(prev => [...prev, { id, instanceId, value, isCrit, isPlayer }])
    setTimeout(() => setFloatingDamages(prev => prev.filter(f => f.id !== id)), 900)
  }

  const {
    playerHP, playerStamina, playerMana,
    turn, log, status,
    run,
    initCombat, setPlayerHP, setEnemyHP,
    setPlayerStamina, setPlayerMana, addLog, nextTurn, setStatus,
    initRun, setPhase, setCurrentEnemy, addLoot, advanceRoom,
    setBossDefeated, setBossInstanceId, increaseDepth,
    setCurrentEvent,
    consecutiveBlocks, setConsecutiveBlocks,
    stunnedEnemyIds, setStunnedEnemyIds,
    setTargetIndex,
    setCurrentEnemies,
    setStatusEffects, applyPoisonEffect,
    combatPhase, setCombatPhase,
    setLastPlayerDamage, setLastEnemyDamages,
    proficiencyUpdates, addProficiency,
  } = useCombatStore()

  const derived = deriveStats(player.primary_stats)
  const displayMaxHP = realMaxHP ?? derived.max_hp
  const availableSkills = BASE_SKILLS.filter(s =>
    (player.equipped_skills ?? []).includes(s.id) &&
    (!LOCKED_SKILLS.has(s.id) || (player.unlocked_skills ?? []).includes(s.id))
  )

  const depthMult = depthMultiplier(run.depth)
  const isTraining = (boss?.stats?.attack === 0) && ((boss?.loot_table?.length ?? 0) === 0)

  const handleActionRef = useRef<(action: CombatAction, skill?: PlayerSkill, item?: any) => Promise<void>>(async () => {})

  const items = useItemHandlers({
    playerHP, playerStamina, playerMana,
    maxHP: displayMaxHP, maxStamina: derived.max_stamina, maxMana: derived.max_mana,
    setPlayerHP, setPlayerStamina, setPlayerMana,
    handleAction: (...args) => handleActionRef.current(...args),
  })

  useEffect(() => {
    initRun(dungeon.rooms)
    setPlayerStamina(derived.max_stamina)
    setPlayerMana(derived.max_mana)

    // Fetchear el HP máximo real (con gear) desde el server para no mostrar valores incorrectos
    getPlayerMaxHPAction().then((maxHP: number | null) => {
      if (maxHP) {
        setRealMaxHP(maxHP)
        setPlayerHP(Math.min(player.current_hp ?? maxHP, maxHP))
      } else {
        setPlayerHP(player.current_hp ?? derived.max_hp)
      }
      setHpReady(true)
    })
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  useEffect(() => {
    if (run.phase !== 'boss' || run.currentEnemies.length > 0 || status !== 'idle') return
    const scaledMaxHP = Math.round(boss.stats.hp * (run.depth > 0 ? depthMult : 1))
    const bossState: EnemyCombatState = {
      instanceId: nextInstanceId(),
      enemy: { id: boss.id, dungeon_id: boss.dungeon_id, name: boss.name, stats: { ...boss.stats, hp: scaledMaxHP }, loot_table: [], enemy_type: boss.enemy_type, max_energy: boss.max_energy },
      currentHP: scaledMaxHP, maxHP: scaledMaxHP, alive: true,
      // aiState inicial: tier viene de la aiConfig, max_energy del boss directamente.
      // El servidor lo actualiza con updatedAiStates cada turno.
      aiState: (() => {
        const bossAiConfig = aiConfigs.find(c => c.entity_type === 'boss' && c.entity_id === boss.id)
        return { tier: bossAiConfig?.ai_tier ?? 'smart', energy: 0, maxEnergy: boss.max_energy, activePhaseOrder: 0, triggeredPhases: [], nextActionId: null }
      })(),
      statMults: null,
    }
    setStunnedEnemyIds([])

    // Spawnear adds iniciales si el boss los tiene configurados
    const combatEnemies: EnemyCombatState[] = [bossState]
    if ((boss as any).initial_adds?.length) {
      for (const enemyId of (boss as any).initial_adds as number[]) {
        const template = enemies.find(e => e.id === enemyId)
        if (template) combatEnemies.push(buildSummonedEnemy(template, depthMult, aiConfigs.find(c => c.entity_id === template.id && c.entity_type === 'enemy')))
      }
    }

    setBossInstanceId(bossState.instanceId)
    initCombat(playerHP, playerStamina, playerMana, combatEnemies)
  }, [run.phase, run.currentEnemies.length, status])

  const isBossRoom = run.bossDefeated === false && run.currentRoom >= run.totalRooms && !fightingEvent
  const playerHPPct = Math.max(0, Math.round((playerHP / displayMaxHP) * 100))
  const aliveEnemies = run.currentEnemies.filter(e => e.alive)

  const safeTargetIndex = (() => {
    const t = run.currentEnemies[run.targetIndex]
    if (t && t.alive) return run.targetIndex
    const firstAlive = run.currentEnemies.findIndex(e => e.alive)
    return firstAlive >= 0 ? firstAlive : 0
  })()

  const targetEnemy = run.currentEnemies[safeTargetIndex]
  const bossEnemyState = isBossRoom
    ? run.currentEnemies.find(e => e.instanceId === run.bossInstanceId) ?? null
    : null

  const itemInfoMap = new Map<number, { name: string; sprite: string }>()
  for (const enemy of enemies) {
    for (const entry of enemy.loot_table) {
      if (entry.item_id && entry.item_name)
        itemInfoMap.set(entry.item_id, { name: entry.item_name, sprite: (entry as any).item_sprite ?? '' })
    }
  }
  for (const entry of (boss as any)?.loot_table ?? []) {
    if (entry.item_id && entry.item_name)
      itemInfoMap.set(entry.item_id, { name: entry.item_name, sprite: (entry as any).item_sprite ?? '' })
  }
  for (const eb of eventBosses) {
    for (const entry of (eb.loot_table as any[]) ?? []) {
      if (entry.item_id && entry.item_name)
        itemInfoMap.set(entry.item_id, { name: entry.item_name, sprite: entry.item_sprite ?? '' })
    }
  }

  // ─── Combate ──────────────────────────────────────────────────────────────

  async function handleAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    if (status !== 'active' || isProcessing) return
    setIsProcessing(true)
    setShowSkills(false)
    if (isBossRoom) await handleBossAction(action, skill, itemUsed)
    else await handleRoomAction(action, skill, itemUsed)
    setIsProcessing(false)
  }
  handleActionRef.current = handleAction

  async function handleRoomAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    const enemyTurnStates: EnemyTurnState[] = run.currentEnemies.map(e => ({
      instanceId: e.instanceId, enemyId: e.enemy.id, currentHP: e.currentHP, maxHP: e.maxHP, alive: e.alive,
      attack: Math.round(e.enemy.stats.attack * depthMult),
      defense: Math.round(e.enemy.stats.defense * depthMult),
      name: e.enemy.name, enemyTypes: e.enemy.enemy_type as EnemyType[],
      aiState: e.aiState,
    }))

    // ── FASE 1: turno del jugador ──────────────────────────────────────────
    setCombatPhase('player_acting')

    const ptResult = await playerTurnAction({
      action, skillUsed: skill, itemUsed,
      currentPlayerHP: playerHP, currentPlayerStamina: playerStamina, currentPlayerMana: playerMana,
      enemies: enemyTurnStates, targetIndex: safeTargetIndex,
      isBlocking: action === 'block',
      statusEffects: run.statusEffects,
      turn,
    })

    if (!ptResult.success) { addLog(ptResult.error ?? 'Error'); setCombatPhase('idle'); return }

    // Log del jugador — render síncrono
    flushSync(() => {
      ptResult.log.forEach(m => addLog(m))
      setPlayerStamina(ptResult.newPlayerStamina)
      setPlayerMana(ptResult.newPlayerMana)
      // Actualizar maxHP real (con gear) desde el server
      if (ptResult.playerMaxHP > 0) setRealMaxHP(ptResult.playerMaxHP)
      // Aplicar curación de item inmediatamente
      if (action === 'item') setPlayerHP(ptResult.newPlayerHP)
    })

    // ── Fix: animación ANTES de marcar alive:false ───────────────────────────
    // 1. Actualizar solo HP (alive sigue true para que el sprite se vea)
    const hitDuration = (ptResult.isCritical || ptResult.isOvercrit) ? 600 : 400
    const enemiesHPOnly = run.currentEnemies.map(e => {
      const newHP = ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP
      return { ...e, currentHP: Math.max(0, newHP) }
      // alive NO se cambia todavía
    })
    setCurrentEnemies(enemiesHPOnly)
    setStatusEffects(ptResult.newStatusEffects)
    const targetState = enemyTurnStates[safeTargetIndex]
    if (targetState && ptResult.damageDealt > 0) {
      triggerEnemyAnim(targetState.instanceId, ptResult.isCritical || ptResult.isOvercrit ? 'crit' : 'hit', hitDuration)
      spawnFloat(targetState.instanceId, ptResult.damageDealt, ptResult.isCritical || ptResult.isOvercrit, false)
    }

    // 2b. Animación splash (espada) en adyacentes
    for (const [idStr, dmg] of Object.entries(ptResult.splashDamage)) {
      const id = Number(idStr)
      triggerEnemyAnim(id, 'hit', hitDuration)
      spawnFloat(id, dmg, false, false)
    }

    // 3. Después de la animación hit → animación dead → marcar alive:false
    for (const id of ptResult.defeatedEnemyInstanceIds) {
      const fallen = run.currentEnemies.find(e => e.instanceId === id)
      if (fallen) {
        flushSync(() => addLog(`🏆 ¡Derrotaste a ${fallen.enemy.name}!`))
        registerKillAction({
          enemyTypes: fallen.enemy.enemy_type as EnemyType[],
          weaponType: ptResult.isMagicAction ? undefined : ptResult.weaponType,
          isMagicKill: ptResult.isMagicAction,
          biggestDamage: ptResult.maxDamageDealt,
          isGoblinKing: fallen.enemy.enemy_type?.includes('goblin') && fallen.enemy.name.toLowerCase().includes('rey'),
          isGranGoblin: fallen.enemy.name.toLowerCase().includes('gran goblin'),
        })
      }
      // Primero dead anim, luego marcar alive:false
      // Usamos función de estado en setCurrentEnemies para evitar closures stale
      const idToKill = id
      setTimeout(() => {
        triggerEnemyAnim(idToKill, 'dead')
        setTimeout(() => {
          setCurrentEnemies(prev =>
            prev.map(e => e.instanceId === idToKill ? { ...e, alive: false } : e)
          )
        }, 50)
      }, hitDuration)
    }

    // 4. Construir updatedEnemies con alive correcto (para lógica de continuación)
    const updatedEnemies = enemiesHPOnly.map(e => ({
      ...e,
      alive: (ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP) > 0,
    }))

    // Cambiar target si el actual murió
    if (ptResult.defeatedEnemyInstanceIds.includes(targetEnemy?.instanceId ?? -1)) {
      const nextAlive = updatedEnemies.findIndex(
        (e, i) => i !== safeTargetIndex && e.alive && !ptResult.defeatedEnemyInstanceIds.includes(e.instanceId)
      )
      if (nextAlive >= 0) setTargetIndex(nextAlive)
    }

    // Calcular loot UNA sola vez y guardarlo (evita doble conteo)
    let totalExp = 0, totalGold = 0
    const modalItems: { itemId: number; itemName: string; sprite?: string }[] = []
    for (const id of ptResult.defeatedEnemyInstanceIds) {
      const fallen = run.currentEnemies.find(e => e.instanceId === id)
      if (!fallen) continue
      const loot = resolveEnemyLoot(fallen.enemy, depthMult, player.achievement_bonus?.gold_pct ?? 0)
      totalExp  += loot.exp
      totalGold += loot.gold
      const allItems = [...(loot.itemId ? [loot.itemId] : []), ...loot.materialIds]
      addLoot({ exp: loot.exp, gold: loot.gold, items: allItems })
      setLastLoot({ exp: loot.exp, gold: loot.gold, itemId: loot.itemId, itemName: loot.itemName })
      if (loot.itemId && loot.itemName) {
        modalItems.push({ itemId: loot.itemId, itemName: loot.itemName, sprite: (loot as any).itemSprite ?? undefined })
      }
    }

    const allDefeatedByPlayer = updatedEnemies.every(e => !e.alive)
    if (allDefeatedByPlayer) {
      await new Promise(r => setTimeout(r, hitDuration + 800))
      applyEnemyUpdates(ptResult.updatedEnemyHPs, ptResult.updatedAiStates, [], run.currentEnemies, ptResult.defeatedEnemyInstanceIds)

      // Procesar un tick de efectos del jugador aunque no haya turno enemigo
      const efResult = await endTurnAction({
        statusEffects: ptResult.newStatusEffects,
        enemies: [],
        currentPlayerHP: ptResult.newPlayerHP,
      })
      if (efResult.log.length > 0) efResult.log.forEach(m => addLog(m))
      setPlayerHP(efResult.newPlayerHP)
      setStatusEffects(efResult.newStatusEffects)

      nextTurn()
      setCombatPhase('idle')

      // Si es un evento de Gran Goblin
      if (fightingEvent && activeEventBoss) {
        setFightingEvent(false); setActiveEventBoss(null); setCurrentEvent(null)
      }
      // Si es un evento de mímico, agregar el gold del cofre
      else if (fightingEvent && !activeEventBoss && eventPendingGold > 0) {
        addLoot({ gold: eventPendingGold })
        addLog(`💰 ¡Encontraste ${eventPendingGold} gold en el cofre del Mímico!`)
        totalGold += eventPendingGold
        setFightingEvent(false); setCurrentEvent(null); setEventPendingGold(0)
      } else if (fightingEvent && !activeEventBoss) {
        setFightingEvent(false); setCurrentEvent(null)
      }

      setStatus('victory')
      setEnemyAnimStates({})
      setVictoryModal({ type: 'room', exp: totalExp, gold: totalGold, items: modalItems })
      return
    }

    // Pausa entre turnos
    await new Promise(r => setTimeout(r, ptResult.isCritical ? 700 : 500))

    // ── FASE 2: turno del enemigo ──────────────────────────────────────────
    setCombatPhase('enemy_acting')
    await new Promise(r => setTimeout(r, 200))

    const alreadyDefeated = new Set(ptResult.defeatedEnemyInstanceIds)
    const enemyStatesAfter = updatedEnemies
      .filter(e => e.alive && !alreadyDefeated.has(e.instanceId))
      .map(e => ({
        instanceId: e.instanceId, enemyId: e.enemy.id,
        currentHP: ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP,
        maxHP: e.maxHP, alive: e.alive,
        attack: Math.round(e.enemy.stats.attack * depthMult),
        defense: Math.round(e.enemy.stats.defense * depthMult),
        name: e.enemy.name, enemyTypes: e.enemy.enemy_type as EnemyType[],
        aiState: ptResult.updatedAiStates[e.instanceId] ?? e.aiState,
      }))

    const etResult = await enemyTurnAction({
      currentPlayerHP: ptResult.newPlayerHP,
      currentPlayerStamina: ptResult.newPlayerStamina,
      currentPlayerMana: ptResult.newPlayerMana,
      enemies: enemyStatesAfter,
      isBlocking: action === 'block',
      consecutiveBlocks: action === 'block' ? consecutiveBlocks : 0,
      stunnedEnemyIds: [...stunnedEnemyIds, ...(ptResult.newStunnedEnemyIds ?? [])],
      statusEffects: ptResult.newStatusEffects,
      turn,
      phaseTriggeredThisTurn: false,
    })

    if (!etResult.success) { addLog(etResult.error ?? 'Error'); setCombatPhase('idle'); return }

    // Animación: jugador recibe daño
    const totalDmg = Object.values(etResult.damageByEnemy).reduce((s, d) => s + d, 0)
    if (totalDmg > 0) {
      triggerPlayerAnim('hit', 500)
      spawnFloat(-1, totalDmg, false, true)
    }

    await new Promise(r => setTimeout(r, 400))

    emitAiDebugLogs(etResult.aiDebugLogs ?? [])
    flushSync(() => {
      addLog('─────────────────')
      etResult.log.forEach(m => addLog(m))
    })

    setPlayerHP(etResult.newPlayerHP)
    setConsecutiveBlocks(etResult.newConsecutiveBlocks)
    setStunnedEnemyIds(etResult.newStunnedEnemyIds)

    // Aplicar aiStates
    if (Object.keys(etResult.updatedAiStates).length > 0 || Object.keys(etResult.updatedEnemyHPs).length > 0) {
      applyEnemyUpdates(etResult.updatedEnemyHPs, etResult.updatedAiStates, [], run.currentEnemies, [])
    }

    // ── FASE 3: fin de turno — efectos de estado ──────────────────────────
    await new Promise(r => setTimeout(r, 300))
    setCombatPhase('effects')

    // Construir estados actuales para endTurnAction
    const enemiesForEffects = run.currentEnemies
      .filter(e => e.alive)
      .map(e => ({
        instanceId: e.instanceId, enemyId: e.enemy.id,
        currentHP: etResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP,
        maxHP: e.maxHP, alive: e.alive,
        attack: Math.round(e.enemy.stats.attack * depthMult),
        defense: Math.round(e.enemy.stats.defense * depthMult),
        name: e.enemy.name, enemyTypes: e.enemy.enemy_type as EnemyType[],
        aiState: e.aiState,
      }))

    const efResult = await endTurnAction({
      statusEffects: etResult.newStatusEffects,
      enemies: enemiesForEffects,
      currentPlayerHP: etResult.newPlayerHP,
      bossId: boss.id,
      bossEnemyInstanceId: bossEnemyState?.instanceId,
    })

    if (efResult.log.length > 0) {
      flushSync(() => {
        addLog('─────────────────')
        efResult.log.forEach(m => addLog(m))
      })
    }

    // Shake y número flotante por daño de efectos
    for (const e of enemiesForEffects) {
      const prevHP = e.currentHP
      const newHP  = efResult.updatedEnemyHPs[e.instanceId] ?? prevHP
      if (newHP < prevHP && !efResult.defeatedByEffects.includes(e.instanceId)) {
        triggerEnemyAnim(e.instanceId, 'hit', 300)
        spawnFloat(e.instanceId, prevHP - newHP, false, false)
      }
    }

    // Animación de muerte y loot para enemigos eliminados por efectos
    let effectKillExp = 0, effectKillGold = 0
    const effectKillItems: { itemId: number; itemName: string; sprite?: string }[] = []
    for (const id of efResult.defeatedByEffects) {
      const fallen = run.currentEnemies.find(e => e.instanceId === id)
      if (fallen) {
        const loot = resolveEnemyLoot(fallen.enemy, depthMult, player.achievement_bonus?.gold_pct ?? 0)
        const allItems = [...(loot.itemId ? [loot.itemId] : []), ...loot.materialIds]
        addLoot({ exp: loot.exp, gold: loot.gold, items: allItems })
        effectKillExp  += loot.exp
        effectKillGold += loot.gold
        if (loot.itemId && loot.itemName) effectKillItems.push({ itemId: loot.itemId, itemName: loot.itemName })
      }
      triggerEnemyAnim(id, 'dead')
    }

    setPlayerHP(efResult.newPlayerHP)
    setStatusEffects(efResult.newStatusEffects)
    applyEnemyUpdates(efResult.updatedEnemyHPs, {}, [], run.currentEnemies, efResult.defeatedByEffects)

    nextTurn()
    setCombatPhase('idle')

    if (etResult.playerDefeated || efResult.playerDefeated) {
      setStatus('defeat')
      saveRunAction({ outcome: 'defeat', exp: run.accumulatedLoot.exp, gold: 0, items: [], currentHP: 1, proficiencyUpdates })
      return
    }

    // Victoria si todos murieron por efectos
    const allDefeatedByEffects = enemiesForEffects
      .every(e => efResult.defeatedByEffects.includes(e.instanceId) || (efResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP) <= 0)
    if (allDefeatedByEffects) {
      await new Promise(r => setTimeout(r, 800))
      // Si es mímico, agregar gold del cofre
      if (fightingEvent && !activeEventBoss && eventPendingGold > 0) {
        addLoot({ gold: eventPendingGold })
        addLog(`💰 ¡Encontraste ${eventPendingGold} gold en el cofre del Mímico!`)
        effectKillGold += eventPendingGold
        setFightingEvent(false); setCurrentEvent(null); setEventPendingGold(0)
      } else if (fightingEvent && !activeEventBoss) {
        setFightingEvent(false); setCurrentEvent(null)
      }
      setStatus('victory')
      setEnemyAnimStates({})
      setVictoryModal({ type: 'room', exp: effectKillExp, gold: effectKillGold, items: effectKillItems })
      return
    }
  }

  // ─── Helper: construir EnemyTurnStates del boss room ────────────────────────
  function buildBossEnemyStates(): EnemyTurnState[] {
    if (!bossEnemyState) return []
    const scaledAtk = Math.round(boss.stats.attack  * (run.depth > 0 ? depthMult : 1))
    const scaledDef = Math.round(boss.stats.defense * (run.depth > 0 ? depthMult : 1))
    return run.currentEnemies
      .filter(e => e.alive && e.currentHP > 0)
      .map(e => {
        const isBossEntity = e.instanceId === bossEnemyState.instanceId
        return {
          instanceId: e.instanceId, enemyId: e.enemy.id, currentHP: e.currentHP, maxHP: e.maxHP, alive: e.alive,
          attack: isBossEntity ? scaledAtk : Math.round(e.enemy.stats.attack * depthMult),
          defense: isBossEntity ? scaledDef : Math.round(e.enemy.stats.defense * depthMult),
          name: e.enemy.name, enemyTypes: e.enemy.enemy_type as EnemyType[],
          aiState: e.aiState,
        }
      })
  }

  // ─── Helper: aplicar resultado de enemigos al store ───────────────────────
  function applyEnemyUpdates(
    updatedEnemyHPs: Record<number, number>,
    updatedAiStatesMap: Record<number, EnemyAiState>,
    summonIds: number[],
    baseEnemies: EnemyCombatState[],
    alreadyDeadIds: number[] = [],
  ) {
    // Usar función de estado para leer el alive actual del store
    // y no pisar alive:false que ya fue escrito por los timeouts de animación
    setCurrentEnemies((prev: EnemyCombatState[]) => {
      let updated = prev.map(e => {
        // Si el store ya lo marcó muerto (por timeout), respetar ese estado
        if (!e.alive) return e
        // Si está en alreadyDeadIds, marcarlo muerto
        if (alreadyDeadIds.includes(e.instanceId)) return { ...e, currentHP: 0, alive: false }
        // Aplicar HP actualizado por efectos
        const newHP = updatedEnemyHPs[e.instanceId] ?? e.currentHP
        return { ...e, currentHP: Math.max(0, newHP), alive: newHP > 0 }
      })
      // Aplicar aiStates
      if (Object.keys(updatedAiStatesMap).length > 0) {
        updated = updated.map(e => {
          const newAiState = updatedAiStatesMap[e.instanceId]
          return newAiState ? { ...e, aiState: newAiState } : e
        })
      }
      // Agregar summons
      for (const enemyId of summonIds) {
        const template = enemies.find(e => e.id === enemyId)
        if (!template) continue
        const summonAiConfig = aiConfigs.find(c => c.entity_id === template.id && c.entity_type === 'enemy')
        const summoned = buildSummonedEnemy(template, depthMult, summonAiConfig)
        updated = [...updated, summoned]
        addLog(`👹 ¡${summoned.enemy.name} entra al combate!`)
      }
      return updated
    })
    // Retornar baseEnemies actualizado para uso local (lógica de victoria, etc.)
    return baseEnemies.map(e => {
      if (alreadyDeadIds.includes(e.instanceId)) return { ...e, currentHP: 0, alive: false }
      const newHP = updatedEnemyHPs[e.instanceId] ?? e.currentHP
      return { ...e, currentHP: Math.max(0, newHP), alive: newHP > 0 }
    })
  }

  // ─── Helper: emitir logs de IA al panel visual (solo dev) ─────────────────
  function emitAiDebugLogs(logs: Array<{ tier: string; enemyName: string; data: Record<string, unknown> }>) {
    if (process.env.NODE_ENV !== 'development' || !logs.length) return
    aiDebugAccRef.current = [...aiDebugAccRef.current.slice(-49), ...logs]
    setAiDebugTick(t => t + 1)
  }

  // ─── Helper: resolver victoria/derrota ───────────────────────────────────
  function resolveOutcome(allDefeated: boolean, playerDef: boolean, newHP: number, ptResult?: import('@/actions/combatActions').PlayerTurnResult) {
    if (allDefeated) {
      // Gran Goblin (evento especial)
      if (fightingEvent && activeEventBoss) {
        const loot = resolveBossLoot(activeEventBoss, 0, 0)
        addLoot({ items: loot.items })
        addLog('🏆 ¡Derrotaste al Gran Goblin!')
        setFightingEvent(false); setActiveEventBoss(null); setCurrentEvent(null)
        setStatus('victory')
        const modalItems = loot.itemDetails.map((d, i) => ({ itemId: loot.items[i] ?? 0, itemName: d.name, sprite: d.sprite }))
        setVictoryModal({ type: 'room', exp: 0, gold: 0, items: modalItems })
        return true
      }

      // Mímico (evento especial — gold del cofre se suma al derrotarlo)
      if (fightingEvent && !activeEventBoss) {
        if (eventPendingGold > 0) {
          addLoot({ gold: eventPendingGold })
          addLog(`💰 ¡Encontraste ${eventPendingGold} gold en el cofre del Mímico!`)
        }
        addLog('🏆 ¡Derrotaste al Mímico!')
        setFightingEvent(false); setCurrentEvent(null); setEventPendingGold(0)
        setStatus('victory')
        setVictoryModal({ type: 'room', exp: 0, gold: eventPendingGold, items: [] })
        return true
      }

      // Training dummy
      if (isTraining) {
        addLog('💪 ¡El dummy fue destruido! Respawneando...')
        setTimeout(() => {
          const scaledMaxHP = Math.round(boss.stats.hp * (run.depth > 0 ? depthMult : 1))
          const newDummy: EnemyCombatState = {
            instanceId: nextInstanceId(),
            enemy: { id: boss.id, dungeon_id: boss.dungeon_id, name: boss.name, stats: { ...boss.stats, hp: scaledMaxHP }, loot_table: [], enemy_type: boss.enemy_type, max_energy: boss.max_energy },
            currentHP: scaledMaxHP, maxHP: scaledMaxHP, alive: true, aiState: initAiState('dumb', 3), statMults: null,
          }
          setConsecutiveBlocks(0); setStunnedEnemyIds([])
          // Limpiar efectos de enemigos (burn, stun) — el nuevo dummy tiene otro instanceId
          setStatusEffects(run.statusEffects.filter((e: StatusEffect) => e.target === 'player'))
          initCombat(playerHP, playerStamina, playerMana, [newDummy])
        }, 1000)
        return true
      }

      // Boss real
      const bossLoot = resolveBossLoot(boss, undefined, undefined, player.achievement_bonus?.gold_pct ?? 0)
      const totalExp   = run.accumulatedLoot.exp  + bossLoot.exp
      const totalGold  = run.accumulatedLoot.gold + bossLoot.gold
      const totalItems = [...run.accumulatedLoot.items, ...bossLoot.items]
      addLoot({ exp: bossLoot.exp, gold: bossLoot.gold, items: bossLoot.items })
      setBossDefeated(true)
      setBossInstanceId(null)
      setStatus('victory')
      registerKillAction({
        enemyTypes: boss.enemy_type ?? [],
        weaponType: ptResult?.isMagicAction ? undefined : ptResult?.weaponType,
        isMagicKill: ptResult?.isMagicAction,
        biggestDamage: ptResult?.maxDamageDealt,
        isGoblinKing: boss.name.toLowerCase().includes('rey goblin'),
        isGranGoblin: boss.name.toLowerCase().includes('gran goblin'),
      })
      saveRunAction({ outcome: 'victory', exp: totalExp, gold: totalGold, items: totalItems, currentHP: newHP, proficiencyUpdates: proficiencyUpdates })

      // Construir items para el modal
      const modalItems = bossLoot.itemDetails.map((d, i) => ({
        itemId: bossLoot.items[i] ?? 0,
        itemName: d.name,
        sprite: d.sprite,
      }))
      // Limpiar animStates de enemigos muertos al mostrar el modal
      setEnemyAnimStates({})
      setVictoryModal({ type: 'boss', exp: bossLoot.exp, gold: bossLoot.gold, items: modalItems })
      return true
    }

    if (playerDef) {
      setStatus('defeat')
      saveRunAction({ outcome: 'defeat', exp: run.accumulatedLoot.exp, gold: 0, items: [], currentHP: 1, proficiencyUpdates })
      return true
    }
    return false
  }

  // ── Handlers del modal de victoria ────────────────────────────────────────

  function handleRoomModalContinue() {
    setVictoryModal(null)
    setStatus('idle')
    if (fightingEvent) {
      setFightingEvent(false); setCurrentEvent(null)
      setPhase('between_rooms')
    } else {
      advanceRoom()
      if (!run.bossDefeated) setCurrentEvent(rollRoomEvent())
      setPhase('between_rooms')
    }
  }

  function handleBossModalContinue() {
    setVictoryModal(null)
    setStatus('idle')
    increaseDepth()
    setBossDefeated(true)
    setPhase('between_rooms')
  }

  async function handleBossModalExit() {
    setIsSaving(true)
    setVictoryModal(null)
    await clearRunAction(playerHP)
    onBack ? onBack() : router.replace('/hub')
  }

  async function handleBossAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    if (!bossEnemyState) return

    // ── FASE 1: turno del jugador ──────────────────────────────────────────
    setCombatPhase('player_acting')
    const enemyStates = buildBossEnemyStates()
    // Recalcular targetIndex sobre el array filtrado (sin muertos)
    const targetInstanceId = run.currentEnemies[safeTargetIndex]?.instanceId
    const filteredTargetIndex = Math.max(0, enemyStates.findIndex(e => e.instanceId === targetInstanceId))

    const ptResult = await playerTurnAction({
      action, skillUsed: skill, itemUsed,
      currentPlayerHP: playerHP, currentPlayerStamina: playerStamina, currentPlayerMana: playerMana,
      enemies: enemyStates, targetIndex: filteredTargetIndex,
      isBlocking: action === 'block',
      statusEffects: run.statusEffects,
      bossId: boss.id, bossEnemyInstanceId: bossEnemyState?.instanceId, turn,
    })

    if (!ptResult.success) { addLog(ptResult.error ?? 'Error'); setCombatPhase('idle'); setIsProcessing(false); return }

    // Log del jugador — flushSync fuerza render síncrono antes del turno enemigo
    flushSync(() => {
      ptResult.log.forEach(m => addLog(m))
      setPlayerStamina(ptResult.newPlayerStamina)
      setPlayerMana(ptResult.newPlayerMana)
      if (ptResult.playerMaxHP > 0) setRealMaxHP(ptResult.playerMaxHP)
      // Aplicar curación de item inmediatamente
      if (action === 'item') setPlayerHP(ptResult.newPlayerHP)
    })

    // ── Animación hit/crit ANTES de marcar alive:false ──────────────────────
    const hitDurationBoss = (ptResult.isCritical || ptResult.isOvercrit) ? 600 : 400

    // Animar el objetivo (puede ser el boss o un add)
    const bossTargetId = run.currentEnemies[safeTargetIndex]?.instanceId ?? bossEnemyState.instanceId
    if (ptResult.damageDealt > 0) {
      triggerEnemyAnim(bossTargetId, ptResult.isCritical || ptResult.isOvercrit ? 'crit' : 'hit', hitDurationBoss)
      spawnFloat(bossTargetId, ptResult.damageDealt, ptResult.isCritical || ptResult.isOvercrit, false)
    }

    // Animación splash (espada) en adyacentes
    for (const [idStr, dmg] of Object.entries(ptResult.splashDamage)) {
      const id = Number(idStr)
      triggerEnemyAnim(id, 'hit', hitDurationBoss)
      spawnFloat(id, dmg, false, false)
    }

    // Actualizar HPs sin tocar alive (para que el sprite se vea durante la animación)
    const enemiesHPOnlyBoss = run.currentEnemies.map(e => {
      const newHP = ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP
      return { ...e, currentHP: Math.max(0, newHP) }
    })
    // Aplicar adds, pero preservar alive=true por ahora
    let enemiesAfterPlayer = enemiesHPOnlyBoss.map(e => {
      const newAiState = ptResult.updatedAiStates[e.instanceId]
      return newAiState ? { ...e, aiState: newAiState } : e
    })
    setStatusEffects(ptResult.newStatusEffects)

    // Agregar adds invocados
    if (ptResult.summonEnemyIds.length > 0) {
      for (const enemyId of ptResult.summonEnemyIds) {
        const template = enemies.find(e => e.id === enemyId)
        if (!template) continue
        const summonAiConfig = aiConfigs.find(c => c.entity_id === template.id && c.entity_type === 'enemy')
        const summoned = buildSummonedEnemy(template, depthMult, summonAiConfig)
        enemiesAfterPlayer = [...enemiesAfterPlayer, summoned]
        addLog(`👹 ¡${summoned.enemy.name} entra al combate!`)
      }
    }
    setCurrentEnemies(enemiesAfterPlayer)

    // Construir lista completa de muertos ESTE turno:
    // - Los que el servidor identificó por instanceId
    // - Adds con HP<=0 que el servidor no conoce por instanceId (generados en el cliente)
    // Excluir enemigos que ya estaban muertos ANTES de este turno (!e.alive en run.currentEnemies)
    const alreadyDeadBeforeTurn = new Set(run.currentEnemies.filter(e => !e.alive).map(e => e.instanceId))
    const clientDefeatedIds = [...ptResult.defeatedEnemyInstanceIds]
    for (const e of enemiesAfterPlayer) {
      if (alreadyDeadBeforeTurn.has(e.instanceId)) continue
      const resultHP = ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP
      if (resultHP <= 0 && !clientDefeatedIds.includes(e.instanceId)) {
        clientDefeatedIds.push(e.instanceId)
      }
    }

    // Log y loot de derrotados
    for (const id of clientDefeatedIds) {
      const fallen = run.currentEnemies.find(e => e.instanceId === id)
        ?? enemiesAfterPlayer.find(e => e.instanceId === id)
      if (fallen) {
        flushSync(() => addLog(`🏆 ¡Derrotaste a ${fallen.enemy.name}!`))
        const loot = resolveEnemyLoot(fallen.enemy, depthMult, player.achievement_bonus?.gold_pct ?? 0)
        const allItems = [...(loot.itemId ? [loot.itemId] : []), ...loot.materialIds]
        addLoot({ exp: loot.exp, gold: loot.gold, items: allItems })
      }
      const idToKill = id
      setTimeout(() => {
        triggerEnemyAnim(idToKill, 'dead')
        setTimeout(() => {
          setCurrentEnemies((prev: EnemyCombatState[]) =>
            prev.map(e => e.instanceId === idToKill ? { ...e, alive: false } : e)
          )
        }, 750)
      }, hitDurationBoss)
    }

    // Pausa para que el jugador vea su daño antes del contraataque
    await new Promise(r => setTimeout(r, hitDurationBoss + 100))

    // Para lógica de victoria usar HP actualizado (alive aún es true para la animación)
    const allDefeatedByPlayer = enemiesAfterPlayer.every(e =>
      (ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP) <= 0 ||
      clientDefeatedIds.includes(e.instanceId)
    )

    if (allDefeatedByPlayer) {
      await new Promise(r => setTimeout(r, 500))
      applyEnemyUpdates(ptResult.updatedEnemyHPs, ptResult.updatedAiStates, [], enemiesAfterPlayer, clientDefeatedIds)

      // Procesar un tick de efectos del jugador aunque no haya turno enemigo
      const efResult = await endTurnAction({
        statusEffects: ptResult.newStatusEffects,
        enemies: [],
        currentPlayerHP: ptResult.newPlayerHP,
      })
      if (efResult.log.length > 0) efResult.log.forEach(m => addLog(m))
      setPlayerHP(efResult.newPlayerHP)
      setStatusEffects(efResult.newStatusEffects)

      nextTurn()
      setCombatPhase('idle')
      resolveOutcome(true, false, efResult.newPlayerHP, ptResult)
      return
    }

    // Si hubo fase: pausa dramática antes del turno enemigo
    if (ptResult.phaseTriggered) {
      setCombatPhase('phase_transition')
      await new Promise(r => setTimeout(r, 800))
    }

    // ── FASE 2: turno del enemigo ──────────────────────────────────────────
    setCombatPhase('enemy_acting')
    await new Promise(r => setTimeout(r, 300))

    // Reconstruir estados con los HPs ya actualizados
    // Solo pasar enemigos que siguen vivos después del turno del jugador
    const alreadyDefeated = new Set(clientDefeatedIds)
    const enemyStatesAfter = enemiesAfterPlayer
      .filter(e => e.alive && (ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP) > 0 && !alreadyDefeated.has(e.instanceId))
      .map(e => {
        const isBossEntity = e.instanceId === bossEnemyState.instanceId
        const scaledAtk = Math.round(boss.stats.attack  * (run.depth > 0 ? depthMult : 1))
        const scaledDef = Math.round(boss.stats.defense * (run.depth > 0 ? depthMult : 1))
        return {
          instanceId: e.instanceId, enemyId: e.enemy.id,
          currentHP: ptResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP,
          maxHP: e.maxHP, alive: e.alive,
          attack: isBossEntity ? scaledAtk : Math.round(e.enemy.stats.attack * depthMult),
          defense: isBossEntity ? scaledDef : Math.round(e.enemy.stats.defense * depthMult),
          name: e.enemy.name, enemyTypes: e.enemy.enemy_type as EnemyType[],
          aiState: ptResult.updatedAiStates[e.instanceId] ?? e.aiState,
        }
      })

    const etResult = await enemyTurnAction({
      currentPlayerHP: ptResult.newPlayerHP,
      currentPlayerStamina: ptResult.newPlayerStamina,
      currentPlayerMana: ptResult.newPlayerMana,
      enemies: enemyStatesAfter,
      isBlocking: action === 'block',
      consecutiveBlocks: action === 'block' ? consecutiveBlocks : 0,
      stunnedEnemyIds: ptResult.newStunnedEnemyIds ?? [],
      statusEffects: ptResult.newStatusEffects,
      bossId: boss.id, bossEnemyInstanceId: bossEnemyState?.instanceId, turn,
      phaseTriggeredThisTurn: false,
    })

    if (!etResult.success) { addLog(etResult.error ?? 'Error'); setCombatPhase('idle'); setIsProcessing(false); return }

    // Animación: jugador recibe daño
    const totalDmgToPlayer = Object.values(etResult.damageByEnemy).reduce((s, d) => s + d, 0)
    if (totalDmgToPlayer > 0) {
      triggerPlayerAnim('hit', 500)
      spawnFloat(-1, totalDmgToPlayer, false, true)
    }

    // Pausa para que se vea la animación del golpe
    await new Promise(r => setTimeout(r, 450))

    // Turno enemigo — flushSync para render síncrono separado del turno del jugador
    emitAiDebugLogs(etResult.aiDebugLogs ?? [])
    flushSync(() => {
      addLog('─────────────────')
      etResult.log.forEach(m => addLog(m))
    })
    setPlayerHP(etResult.newPlayerHP)
    setConsecutiveBlocks(etResult.newConsecutiveBlocks)
    setStunnedEnemyIds(etResult.newStunnedEnemyIds)
    if (isTraining) { setPlayerStamina(derived.max_stamina); setPlayerMana(derived.max_mana) }

    // Aplicar HPs y aiStates del turno enemigo
    applyEnemyUpdates(etResult.updatedEnemyHPs, etResult.updatedAiStates, [], enemiesAfterPlayer, [])

    // ── FASE 3: fin de turno — efectos de estado ──────────────────────────
    await new Promise(r => setTimeout(r, 300))
    setCombatPhase('effects')

    const isBossEff = (e: EnemyCombatState) => e.instanceId === bossEnemyState?.instanceId
    const scaledAtkEff = Math.round(boss.stats.attack  * (run.depth > 0 ? depthMult : 1))
    const scaledDefEff = Math.round(boss.stats.defense * (run.depth > 0 ? depthMult : 1))
    const enemiesForEffects: EnemyTurnState[] = enemiesAfterPlayer
      .filter(e => e.alive && (etResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP) > 0)
      .map(e => ({
        instanceId: e.instanceId,
        enemyId: e.enemy.id,
        currentHP: etResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP,
        maxHP: e.maxHP,
        alive: e.alive,
        attack:  isBossEff(e) ? scaledAtkEff : Math.round(e.enemy.stats.attack  * depthMult),
        defense: isBossEff(e) ? scaledDefEff : Math.round(e.enemy.stats.defense * depthMult),
        name: e.enemy.name,
        enemyTypes: e.enemy.enemy_type as EnemyType[],
        aiState: e.aiState,
      }))

    const efResult = await endTurnAction({
      statusEffects: etResult.newStatusEffects,
      enemies: enemiesForEffects,
      currentPlayerHP: etResult.newPlayerHP,
      bossId: boss.id,
      bossEnemyInstanceId: bossEnemyState?.instanceId,
    })

    if (efResult.log.length > 0) {
      flushSync(() => {
        addLog('─────────────────')
        efResult.log.forEach(m => addLog(m))
      })
    }

    // Shake por daño de efectos
    for (const e of enemiesForEffects) {
      const prevHP = e.currentHP
      const newHP  = efResult.updatedEnemyHPs[e.instanceId] ?? prevHP
      if (newHP < prevHP && !efResult.defeatedByEffects.includes(e.instanceId)) {
        triggerEnemyAnim(e.instanceId, 'hit', 300)
      }
    }

    setPlayerHP(efResult.newPlayerHP)
    setStatusEffects(efResult.newStatusEffects)

    // Aplicar fase si se activó durante fin de turno
    const efAiStates: Record<number, EnemyAiState> = {}
    if (efResult.phaseResult.phaseTriggered && efResult.phaseResult.updatedAiState && bossEnemyState) {
      efAiStates[bossEnemyState.instanceId] = efResult.phaseResult.updatedAiState
    }

    applyEnemyUpdates(efResult.updatedEnemyHPs, efAiStates, efResult.phaseResult.summonEnemyIds, enemiesAfterPlayer, efResult.defeatedByEffects)

    for (const id of efResult.defeatedByEffects) {
      const idToKill = id
      triggerEnemyAnim(idToKill, 'dead')
      setTimeout(() => {
        setCurrentEnemies(prev =>
          prev.map(e => e.instanceId === idToKill ? { ...e, alive: false } : e)
        )
      }, 750)
    }

    nextTurn()
    setCombatPhase('idle')

    const allDefeated = enemiesAfterPlayer.every(e =>
      (efResult.updatedEnemyHPs[e.instanceId] ?? etResult.updatedEnemyHPs[e.instanceId] ?? e.currentHP) <= 0
    )
    resolveOutcome(allDefeated, etResult.playerDefeated || efResult.playerDefeated, efResult.newPlayerHP, ptResult)
  }

  // ─── Items — ver hooks/useItemHandlers.ts ─────────────────────────────────

  const {
    showItems, setShowItems,
    consumables, loadingItems,
    handleOpenItems, handleUseItem,
    showRestConsumables, setShowRestConsumables,
    restConsumables, loadingRestItems, usingRestItem,
    handleOpenRestConsumables, handleUseRestItem,
  } = items

  async function handleReturnToHub() {
    await clearRunAction(playerHP); onBack ? onBack() : router.replace('/hub')
  }

  async function handleExitDungeon() {
    setIsSaving(true)
    await saveRunAction({ outcome: 'extracted', exp: run.accumulatedLoot.exp, gold: run.accumulatedLoot.gold, items: run.accumulatedLoot.items, currentHP: playerHP, proficiencyUpdates })
    await clearRunAction(playerHP); onBack ? onBack() : router.replace('/hub')
  }

  // ─── Pantallas ────────────────────────────────────────────────────────────

  if (run.phase === 'between_rooms') {
    if (!hpReady) return null
    return (
      <BetweenRoomsScreen
        player={player} dungeon={dungeon} boss={boss} enemies={enemies}
        playerHP={playerHP} playerStamina={playerStamina} playerMana={playerMana}
        run={run} derived={{ ...derived, max_hp: displayMaxHP }} itemInfoMap={itemInfoMap}
        lastLoot={lastLoot} isSaving={isSaving}
        setPlayerHP={setPlayerHP} setPlayerStamina={setPlayerStamina} setPlayerMana={setPlayerMana}
        setPhase={setPhase} setCurrentEnemy={setCurrentEnemy}
        initCombat={initCombat} setStunnedEnemyIds={setStunnedEnemyIds} setBossInstanceId={setBossInstanceId}
        addLoot={addLoot} advanceRoom={advanceRoom} setCurrentEvent={setCurrentEvent}
        applyPoisonEffect={applyPoisonEffect}
        setFightingEvent={setFightingEvent} setEventPendingGold={setEventPendingGold}
        addProficiency={addProficiency}
        activeEventBoss={activeEventBoss} setActiveEventBoss={setActiveEventBoss}
        nextInstanceId={nextInstanceId} buildEnemyCombatStates={buildEnemyCombatStates} aiConfigs={aiConfigs}
        onOpenRestConsumables={handleOpenRestConsumables}
        onUseRestItem={handleUseRestItem}
        onExitDungeon={handleExitDungeon}
        showRestConsumables={showRestConsumables} setShowRestConsumables={setShowRestConsumables}
        restConsumables={restConsumables} loadingRestItems={loadingRestItems} usingRestItem={usingRestItem}
      />
    )
  }

  if (run.phase === 'results') {
    return (
      <ResultsScreen
        player={player} dungeon={dungeon} boss={boss} run={run}
        bossDrops={bossDrops} isSaving={isSaving}
        onContinue={() => { increaseDepth(); setBossDefeated(true) }}
        onReturnToHub={handleReturnToHub}
      />
    )
  }

  if (run.phase === 'boss' && run.currentEnemies.length === 0) return null
  if (!hpReady) return null

  // ─── Pantalla de combate ──────────────────────────────────────────────────
  return (
    <>
      {/* Keyframes de animación — inyectados una sola vez */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px) rotate(-1deg); }
          40% { transform: translateX(6px) rotate(1deg); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes shakeHard {
          0%, 100% { transform: translateX(0) scale(1); }
          15% { transform: translateX(-10px) scale(1.05) rotate(-2deg); }
          30% { transform: translateX(10px) scale(1.05) rotate(2deg); }
          45% { transform: translateX(-7px) scale(1.02); }
          60% { transform: translateX(7px) scale(1.02); }
          75% { transform: translateX(-4px); }
          90% { transform: translateX(4px); }
        }
        @keyframes floatUp {
          0%   { transform: translateX(-50%) translateY(0);   opacity: 1; }
          70%  { transform: translateX(-50%) translateY(-28px); opacity: 1; }
          100% { transform: translateX(-50%) translateY(-44px); opacity: 0; }
        }
        @keyframes fadeInUp {
          0%   { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-shake      { animation: shake 0.4s ease-in-out; }
        .animate-shake-hard { animation: shakeHard 0.6s ease-in-out; }
        .animate-fade-in    { animation: fadeInUp 0.35s ease-out forwards; }
        @keyframes fadeIn   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp  { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <CombatScreen
        player={player} dungeon={dungeon} boss={boss}
        playerHP={playerHP} playerStamina={playerStamina} playerMana={playerMana}
        turn={turn} log={log} status={status} run={run} derived={{ ...derived, max_hp: displayMaxHP }}
        isProcessing={isProcessing} isSaving={isSaving}
        isBossRoom={isBossRoom} isTraining={isTraining}
        safeTargetIndex={safeTargetIndex} aliveEnemies={aliveEnemies}
        targetEnemy={targetEnemy}
        consecutiveBlocks={consecutiveBlocks}
        availableSkills={availableSkills}
        showSkills={showSkills} showItems={showItems}
        consumables={consumables} loadingItems={loadingItems}
        enemyAnimStates={enemyAnimStates}
        playerAnimState={playerAnimState}
        floatingDamages={floatingDamages}
        combatPhase={combatPhase}
        onAction={handleAction}
        onSetTargetIndex={setTargetIndex}
        onSetShowSkills={setShowSkills}
        onSetShowItems={setShowItems}
        onOpenItems={handleOpenItems}
        onUseItem={handleUseItem}
        onExitDungeon={handleExitDungeon}
        onReturnToHub={handleReturnToHub}
      />

      {/* Modal de victoria */}
      {process.env.NODE_ENV === 'development' && <AiDebugPanel entries={aiDebugAccRef.current} tick={aiDebugTick} />}

      {victoryModal && (
        <VictoryModal
          type={victoryModal.type}
          exp={victoryModal.exp}
          gold={victoryModal.gold}
          items={victoryModal.items}
          depth={run.depth}
          isSaving={isSaving}
          onContinue={victoryModal.type === 'boss' ? handleBossModalContinue : handleRoomModalContinue}
          onReturnToHub={victoryModal.type === 'boss' ? handleBossModalExit : undefined}
        />
      )}
    </>
  )
}