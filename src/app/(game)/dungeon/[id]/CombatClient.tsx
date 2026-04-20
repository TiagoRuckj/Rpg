'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Player, Dungeon, Boss, Enemy, CombatAction, PlayerSkill,
  EnemyType, EnemyCombatState, deriveStats, depthMultiplier, rollEnemyCount,
  RoomEvent, rollRoomEvent,
} from '@/types/game'
import { useCombatStore } from '@/stores/combatStore'
import { takeTurnAction, EnemyTurnState, ItemUsed } from '@/actions/combatActions'
import { registerKillAction } from '@/actions/classActions'
import { saveRunAction } from '@/actions/saveRunAction'
import { clearRunAction } from '@/actions/activeRunAction'
import { getConsumablesAction, useItemAction } from '@/actions/itemAction'
import { BASE_SKILLS, LOCKED_SKILLS } from '@/lib/game/skills'

interface Props {
  player: Player
  dungeon: Dungeon
  boss: Boss
  enemies: Enemy[]
}

let instanceCounter = 0
function nextInstanceId() { return ++instanceCounter }

function pickRandomEnemy(pool: Enemy[]): Enemy {
  return pool[Math.floor(Math.random() * pool.length)]
}

// Selección ponderada: weights es un array de { id, weight } donde weight es 0-100
// Si no se pasan weights, elige uniformemente del pool
function pickWeightedEnemy(pool: Enemy[], weights?: { id: number; weight: number }[]): Enemy {
  if (!weights || weights.length === 0) return pickRandomEnemy(pool)
  const total = weights.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const w of weights) {
    r -= w.weight
    if (r <= 0) {
      const found = pool.find(e => e.id === w.id)
      if (found) return found
    }
  }
  return pickRandomEnemy(pool)
}

function getSpawnWeights(
  spawnTable: Record<string, { id: number; weight: number }[]> | undefined,
  room: number
): { id: number; weight: number }[] | undefined {
  if (!spawnTable) return undefined
  // Busca la sala exacta, si no existe usa la sala más alta disponible <= room
  const keys = Object.keys(spawnTable).map(Number).sort((a, b) => a - b)
  const key = keys.filter(k => k <= room).pop()
  return key !== undefined ? spawnTable[String(key)] : undefined
}

function buildEnemyCombatStates(
  pool: Enemy[],
  count: number,
  depthMult: number,
  spawnTable?: Record<string, { id: number; weight: number }[]>,
  room?: number,
): EnemyCombatState[] {
  const weights = spawnTable && room ? getSpawnWeights(spawnTable, room) : undefined
  return Array.from({ length: count }, () => {
    const enemy = pickWeightedEnemy(pool, weights)
    const maxHP = Math.round(enemy.stats.hp * depthMult)
    return {
      instanceId: nextInstanceId(),
      enemy,
      currentHP: maxHP,
      maxHP,
      alive: true,
    }
  })
}

function resolveEnemyLoot(enemy: Enemy, mult: number = 1): { exp: number; gold: number; itemId: number | null; itemName: string | null } {
  if (!enemy.loot_table || enemy.loot_table.length === 0) return { exp: 0, gold: 0, itemId: null, itemName: null }

  // Usar la primera entrada para exp y gold
  const primary = enemy.loot_table[0]
  const gold = primary.gold_min + Math.floor(Math.random() * (primary.gold_max - primary.gold_min + 1))
  const exp = primary.exp

  // Tirar drop para cada entrada del loot_table
  let itemId: number | null = null
  let itemName: string | null = null
  for (const entry of enemy.loot_table) {
    if (entry.item_id === null) continue
    const adjustedChance = Math.min(0.95, entry.item_chance * mult)
    if (Math.random() < adjustedChance) {
      itemId = entry.item_id
      itemName = (entry as any).item_name ?? null
      break  // solo dropea un item por enemigo
    }
  }

  return { exp, gold, itemId, itemName }
}

export default function CombatClient({ player, dungeon, boss, enemies }: Props) {
  const router = useRouter()
  const logRef = useRef<HTMLDivElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [granGoblinBoss, setGranGoblinBoss] = useState<import('@/types/game').Boss | null>(null)
  const [fightingEvent, setFightingEvent] = useState(false)
  const [consumables, setConsumables] = useState<any[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [lastLoot, setLastLoot] = useState<{ exp: number; gold: number; itemId: number | null; itemName: string | null } | null>(null)
  const [bossDrops, setBossDrops] = useState<{ name: string; sprite: string }[]>([])
  const [showRestItems, setShowRestItems] = useState(false)
  const [showRestConsumables, setShowRestConsumables] = useState(false)
  const [restConsumables, setRestConsumables] = useState<any[]>([])
  const [loadingRestItems, setLoadingRestItems] = useState(false)
  const [usingRestItem, setUsingRestItem] = useState(false)

  const {
    playerHP, playerStamina, playerMana,
    turn, log, status,
    run,
    initCombat, setPlayerHP, setEnemyHP,
    setPlayerStamina, setPlayerMana, addLog, nextTurn, setStatus,
    initRun, setPhase, setCurrentEnemy, addLoot, advanceRoom,
    setBossDefeated, increaseDepth,
    setCurrentEvent,
    consecutiveBlocks, setConsecutiveBlocks,
    stunnedEnemyIds, setStunnedEnemyIds,
    burnStates, setBurnStates,
    setTargetIndex,
  } = useCombatStore()

  const derived = deriveStats(player.primary_stats)
  const unlockedSkills = player.unlocked_skills ?? []
  const equippedSkillIds = player.equipped_skills ?? []
  // En combate solo aparecen las skills equipadas (y desbloqueadas)
  const availableSkills = BASE_SKILLS.filter(
    s => equippedSkillIds.includes(s.id) && (!LOCKED_SKILLS.has(s.id) || unlockedSkills.includes(s.id))
  )

  const depthMult = depthMultiplier(run.depth)
  // Training room: boss con attack 0 y sin loot
  const isTraining = boss.stats.attack === 0 && boss.loot_table.length === 0

  useEffect(() => {
    initRun(dungeon.rooms)
    setPlayerHP(derived.max_hp)
    setPlayerStamina(derived.max_stamina)
    setPlayerMana(derived.max_mana)
  }, [])



  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // Auto-iniciar combate para dungeons con rooms=0 (ej: training room)
  useEffect(() => {
    if (run.phase !== 'boss' || run.currentEnemies.length > 0 || status !== 'idle') return
    const scaledMaxHP = Math.round(boss.stats.hp * (run.depth > 0 ? depthMult : 1))
    const bossState: EnemyCombatState = {
      instanceId: nextInstanceId(),
      enemy: {
        id: boss.id,
        dungeon_id: boss.dungeon_id,
        name: boss.name,
        stats: { ...boss.stats, hp: scaledMaxHP },
        loot_table: [],
        enemy_type: boss.enemy_type,
      },
      currentHP: scaledMaxHP,
      maxHP: scaledMaxHP,
      alive: true,
    }
    setStunnedEnemyIds([])
    setBurnStates([])
    initCombat(playerHP, playerStamina, playerMana, [bossState])
  }, [run.phase, run.currentEnemies.length, status])

  const isBossRoom = run.bossDefeated === false && run.currentRoom >= run.totalRooms
  const playerHPPct = Math.max(0, Math.round((playerHP / derived.max_hp) * 100))

  // Enemigos activos (solo vivos)
  const aliveEnemies = run.currentEnemies.filter(e => e.alive)

  // Enemigo seleccionado — fallback al primero vivo si el actual cayó
  const safeTargetIndex = (() => {
    const t = run.currentEnemies[run.targetIndex]
    if (t && t.alive) return run.targetIndex
    const firstAlive = run.currentEnemies.findIndex(e => e.alive)
    return firstAlive >= 0 ? firstAlive : 0
  })()

  const targetEnemy = run.currentEnemies[safeTargetIndex]

  // Para la sala del boss usamos el enemy HP del boss (un solo enemigo)
  const bossEnemyState = isBossRoom ? run.currentEnemies[0] : null

  async function handleAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    if (status !== 'active' || isProcessing) return
    setIsProcessing(true)
    setShowSkills(false)

    if (isBossRoom) {
      await handleBossAction(action, skill, itemUsed)
    } else {
      await handleRoomAction(action, skill, itemUsed)
    }

    setIsProcessing(false)
  }

  // ── Sala normal: múltiples enemigos ────────────────────────────────────────
  async function handleRoomAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    const enemyTurnStates: EnemyTurnState[] = run.currentEnemies.map(e => ({
      instanceId: e.instanceId,
      currentHP: e.currentHP,
      maxHP: e.maxHP,
      alive: e.alive,
      attack: Math.round(e.enemy.stats.attack * depthMult),
      defense: Math.round(e.enemy.stats.defense * depthMult),
      name: e.enemy.name,
      enemyTypes: e.enemy.enemy_type as EnemyType[],
    }))

    const result = await takeTurnAction({
      action,
      skillUsed: skill,
      itemUsed,
      currentPlayerHP: playerHP,
      currentPlayerStamina: playerStamina,
      currentPlayerMana: playerMana,
      enemies: enemyTurnStates,
      targetIndex: safeTargetIndex,
      isBlocking: action === 'block',
      consecutiveBlocks: action === 'block' ? consecutiveBlocks : 0,
      stunnedEnemyIds,
      burnStates,
    })

    if (!result.success) {
      addLog(result.error ?? 'Error desconocido')
      return
    }

    result.log.forEach((entry: string) => addLog(entry))
    setPlayerHP(result.newPlayerHP)
    setPlayerStamina(result.newPlayerStamina)
    setPlayerMana(result.newPlayerMana)
    setConsecutiveBlocks(result.newConsecutiveBlocks)
    setStunnedEnemyIds(result.newStunnedEnemyIds)
    setBurnStates(result.newBurnStates)
    nextTurn()

    // Aplicar HPs actualizados a cada enemigo
    for (const [instanceIdStr, newHP] of Object.entries(result.updatedEnemyHPs)) {
      setEnemyHP(Number(instanceIdStr), newHP)
    }

    // Loot de enemigos caídos este turno
    for (const instanceId of result.defeatedEnemyInstanceIds) {
      const fallen = run.currentEnemies.find(e => e.instanceId === instanceId)
      if (!fallen) continue
      const loot = resolveEnemyLoot(fallen.enemy, depthMult)
      addLoot({ exp: loot.exp, gold: loot.gold, items: loot.itemId ? [loot.itemId] : [] })
      setLastLoot(loot)
      registerKillAction({
        enemyTypes: fallen.enemy.enemy_type as EnemyType[],
        hasWeaponEquipped: true,
        isBossKill: false,
        dungeonId: dungeon.id,
      })
    }

    // Auto-seleccionar siguiente objetivo vivo si el actual cayó
    if (result.defeatedEnemyInstanceIds.includes(targetEnemy?.instanceId ?? -1)) {
      const nextAlive = run.currentEnemies.findIndex(
        (e, i) => i !== safeTargetIndex && e.alive && !result.defeatedEnemyInstanceIds.includes(e.instanceId)
      )
      if (nextAlive >= 0) setTargetIndex(nextAlive)
    }

    if (result.allEnemiesDefeated) {
      setStatus('victory')
      setTimeout(() => {
        if (fightingEvent) {
          // Combate de evento terminado — volver a between_rooms sin avanzar sala
          setFightingEvent(false)
          setStatus('idle')
          setPhase('between_rooms')
        } else {
          advanceRoom()
          // Sortear evento para la sala intermedia (no en profundidades post-boss)
          if (!run.bossDefeated) {
            const event = rollRoomEvent()
            setCurrentEvent(event)
          }
          setStatus('idle')
          setPhase('between_rooms')
        }
      }, 1200)
    } else if (result.playerDefeated) {
      setStatus('defeat')
      saveRunAction({
        outcome: 'defeat',
        exp: run.accumulatedLoot.exp,
        gold: 0,
        items: [],
        currentHP: 1,
      })
    }
  }

  // ── Boss: único enemigo (usa mismo sistema pero con 1 enemigo) ─────────────
  async function handleBossAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    if (!bossEnemyState) return

    const scaledBossAttack = Math.round(boss.stats.attack * (run.depth > 0 ? depthMult : 1))
    const scaledBossDefense = Math.round(boss.stats.defense * (run.depth > 0 ? depthMult : 1))

    const enemyTurnStates: EnemyTurnState[] = [{
      instanceId: bossEnemyState.instanceId,
      currentHP: bossEnemyState.currentHP,
      maxHP: bossEnemyState.maxHP,
      alive: bossEnemyState.alive,
      attack: scaledBossAttack,
      defense: scaledBossDefense,
      name: boss.name,
      enemyTypes: boss.enemy_type as EnemyType[],
    }]

    const result = await takeTurnAction({
      action,
      skillUsed: skill,
      itemUsed,
      currentPlayerHP: playerHP,
      currentPlayerStamina: playerStamina,
      currentPlayerMana: playerMana,
      enemies: enemyTurnStates,
      targetIndex: 0,
      isBlocking: action === 'block',
      consecutiveBlocks: action === 'block' ? consecutiveBlocks : 0,
      stunnedEnemyIds: [],
      burnStates,
    })

    if (!result.success) {
      addLog(result.error ?? 'Error desconocido')
      return
    }

    result.log.forEach((entry: string) => addLog(entry))
    setPlayerHP(result.newPlayerHP)
    setPlayerStamina(result.newPlayerStamina)
    setPlayerMana(result.newPlayerMana)
    setConsecutiveBlocks(result.newConsecutiveBlocks)
    setBurnStates(result.newBurnStates)
    if (isTraining) {
      setPlayerStamina(derived.max_stamina)
      setPlayerMana(derived.max_mana)
    }
    nextTurn()

    setEnemyHP(bossEnemyState.instanceId, result.updatedEnemyHPs[bossEnemyState.instanceId] ?? bossEnemyState.currentHP)

    if (result.allEnemiesDefeated) {
      // Boss de evento (muro agrietado) — loot asegurado, volver a between_rooms
      if (fightingEvent && granGoblinBoss) {
        const bossLootTable = granGoblinBoss.loot_table ?? []
        const bossItems: number[] = []
        for (const entry of bossLootTable) {
          if (entry.item_id && Math.random() < entry.chance) bossItems.push(entry.item_id)
        }
        addLoot({ items: bossItems })
        addLog('🏆 ¡Derrotaste al Gran Goblin! Item asegurado obtenido.')
        setFightingEvent(false)
        setGranGoblinBoss(null)
        setStatus('victory')
        setTimeout(() => {
          setStatus('idle')
          setPhase('between_rooms')
        }, 1200)
        return
      }

      if (isTraining) {
        // Training room: solo resetear el dummy, mantener recursos del jugador
        addLog('💪 ¡El dummy fue destruido! Respawneando...')
        setTimeout(() => {
          const scaledMaxHP = Math.round(boss.stats.hp * (run.depth > 0 ? depthMult : 1))
          const newDummyState: EnemyCombatState = {
            instanceId: nextInstanceId(),
            enemy: {
              id: boss.id,
              dungeon_id: boss.dungeon_id,
              name: boss.name,
              stats: { ...boss.stats, hp: scaledMaxHP },
              loot_table: [],
              enemy_type: boss.enemy_type,
            },
            currentHP: scaledMaxHP,
            maxHP: scaledMaxHP,
            alive: true,
          }
          // Resetear solo el enemigo, sin tocar HP/stamina/mana del jugador
          setEnemyHP(newDummyState.instanceId, scaledMaxHP)
          setConsecutiveBlocks(0)
          setStunnedEnemyIds([])
          setBurnStates([])
          // Reemplazar enemies en el store directamente
          initCombat(playerHP, playerStamina, playerMana, [newDummyState])
          // Restaurar recursos actuales (initCombat los pisa con initialCombatState)
          setPlayerHP(result.newPlayerHP)
          setPlayerStamina(result.newPlayerStamina)
          setPlayerMana(result.newPlayerMana)
        }, 1000)
        return
      }

      const bossLootTable = boss.loot_table ?? []
      const bossItems: number[] = []
      for (const entry of bossLootTable) {
        if (entry.item_id && Math.random() < entry.chance) bossItems.push(entry.item_id)
      }
      const bossExp = 100
      const bossGold = 50

      // Calcular totales finales antes de mutar el store
      const totalExp   = run.accumulatedLoot.exp  + bossExp
      const totalGold  = run.accumulatedLoot.gold + bossGold
      const totalItems = [...run.accumulatedLoot.items, ...bossItems]

      // Items dropeados por el boss — nombre y sprite para mostrar en resultados
      const droppedItems = bossItems.map(itemId => {
        const entry = boss.loot_table.find(e => e.item_id === itemId)
        return {
          name:   (entry as any)?.item_name ?? `Item #${itemId}`,
          sprite: (entry as any)?.item_sprite ?? '',
        }
      })
      setBossDrops(droppedItems)

      addLoot({ exp: bossExp, gold: bossGold, items: bossItems })
      setBossDefeated(true)
      setStatus('victory')
      setPhase('results')

      registerKillAction({
        enemyTypes: boss.enemy_type ?? [],
        hasWeaponEquipped: true,
        isBossKill: true,
        dungeonId: dungeon.id,
      })

      saveRunAction({
        outcome: 'victory',
        exp: totalExp,
        gold: totalGold,
        items: totalItems,
        currentHP: result.newPlayerHP,
      })
    } else if (result.playerDefeated) {
      setStatus('defeat')
      saveRunAction({
        outcome: 'defeat',
        exp: run.accumulatedLoot.exp,
        gold: 0,
        items: [],
        currentHP: 1,
      })
    }
  }

  async function handleOpenItems() {
    setLoadingItems(true)
    const { items } = await getConsumablesAction()
    setConsumables(items)
    setLoadingItems(false)
    setShowItems(true)
  }

  async function handleUseItem(entryId: number) {
    const entry = consumables.find(e => e.id === entryId)
    if (!entry) return

    const itemUsed: ItemUsed = {
      entryId,
      name: entry.item.name,
      effect: entry.item.effect ?? {},
    }

    // Actualizar lista local optimistamente antes de esperar al servidor
    setConsumables(prev =>
      prev.map(e => e.id === entryId ? { ...e, quantity: e.quantity - 1 } : e)
          .filter(e => e.quantity > 0)
    )
    setShowItems(false)

    // Usa el turno: el efecto se aplica y el enemigo contraataca en el servidor
    await handleAction('item', undefined, itemUsed)
  }

  // Construir mapa itemId → nombre desde los loot tables enriquecidos
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

  async function handleOpenRestConsumables() {
    setLoadingRestItems(true)
    const { items } = await getConsumablesAction()
    setRestConsumables(items)
    setLoadingRestItems(false)
    setShowRestConsumables(true)
    setShowRestItems(false)
  }

  async function handleUseRestItem(entryId: number) {
    setUsingRestItem(true)
    const result = await useItemAction(entryId)
    if (!result.success) { setUsingRestItem(false); return }
    if (result.healHP > 0)      setPlayerHP(Math.min(playerHP + result.healHP, derived.max_hp))
    if (result.healStamina > 0) setPlayerStamina(Math.min(playerStamina + result.healStamina, derived.max_stamina))
    if (result.healMana > 0)    setPlayerMana(Math.min(playerMana + result.healMana, derived.max_mana))
    setRestConsumables(prev =>
      prev.map(e => e.id === entryId ? { ...e, quantity: e.quantity - 1 } : e)
          .filter(e => e.quantity > 0)
    )
    setUsingRestItem(false)
  }

  async function handleReturnToHub() {
    await clearRunAction(playerHP)
    router.replace('/hub')
  }

  async function handleExitDungeon() {
    setIsSaving(true)
    await saveRunAction({
      outcome: 'extracted',
      exp: run.accumulatedLoot.exp,
      gold: run.accumulatedLoot.gold,
      items: run.accumulatedLoot.items,
      currentHP: playerHP,
    })
    await clearRunAction(playerHP)
    router.replace('/hub')
  }

  // ─── PANTALLA ENTRE SALAS ───────────────────────────────────────────────────
  if (run.phase === 'between_rooms') {
    const isBeforeBoss = run.currentRoom >= run.totalRooms

    return (
      <div className="min-h-screen flex justify-center" style={{
        backgroundImage: `url(/sprites/backgrounds/${dungeon.background || 'Goblin_cave_bg.jpg'})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        <div className="w-full min-h-screen text-white p-4 flex flex-col gap-4 max-w-2xl" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>

          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-yellow-500">{dungeon.name}</h1>
            <div className="text-right">
              {run.bossDefeated
                ? <p className="text-purple-400 text-xs font-bold">⚔️ Profundidad {run.depth} — {depthMult.toFixed(2)}x</p>
                : <span className="text-sm text-gray-400">
                    {isBeforeBoss ? '⚠️ Sala del Boss' : `Sala ${run.currentRoom + 1} de ${run.totalRooms}`}
                  </span>
              }
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-3">
            <p className="text-sm text-gray-400">Progreso</p>
            {/* Salas */}
            <div className="flex items-center gap-2">
              {Array.from({ length: run.totalRooms }).map((_, i) => (
                <div key={i} className={`flex-1 h-3 rounded-full transition-all ${
                  i < run.currentRoom ? 'bg-green-500' :
                  i === run.currentRoom ? 'bg-yellow-500 animate-pulse' : 'bg-gray-600'
                }`} />
              ))}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 ${
                isBeforeBoss ? 'border-red-400 bg-red-900 animate-pulse' : 'border-gray-600 bg-gray-700 text-gray-500'
              }`}>💀</div>
            </div>
            {/* Barra de profundidad — visible siempre post-boss, tope 20 */}
            {run.bossDefeated && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-purple-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, (run.depth / 20) * 100)}%` }}
                  />
                </div>
                <span className="text-purple-400 text-xs font-bold whitespace-nowrap">
                  {run.depth}/20
                </span>
              </div>
            )}
          </div>

          {/* Stats jugador */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <span className="font-bold text-green-400">🧙 {player.name}</span>
              <span className="text-sm text-gray-400">{playerHP}/{derived.max_hp} HP</span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-3 mb-2">
              <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${playerHPPct}%` }} />
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-yellow-400">⚡ {playerStamina}/{derived.max_stamina}</span>
              <span className="text-blue-400">🔮 {playerMana}/{derived.max_mana}</span>
            </div>
          </div>

          {/* Loot acumulado */}
          {(run.accumulatedLoot.exp > 0 || run.accumulatedLoot.gold > 0) && (
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">Loot acumulado</p>
              <div className="flex gap-4 text-sm">
                <span className="text-purple-400">✨ {run.accumulatedLoot.exp} EXP</span>
                <span className="text-yellow-400">💰 {run.accumulatedLoot.gold} gold</span>
                {run.accumulatedLoot.items.length > 0 && (
                  <span className="text-green-400">🎁 {run.accumulatedLoot.items.length} item(s)</span>
                )}
              </div>
            </div>
          )}

          {/* Último drop */}
          {lastLoot && (
            <div className="bg-green-950 border border-green-700 rounded-lg p-4">
              <p className="text-sm text-green-400 font-bold mb-2">⚔️ Último drop</p>
              <div className="flex gap-4 text-sm">
                <span className="text-purple-400">✨ +{lastLoot.exp} EXP</span>
                <span className="text-yellow-400">💰 +{lastLoot.gold} gold</span>
                {lastLoot.itemId ? <span className="text-green-400">🎁 {lastLoot.itemName ?? 'Item'}</span> : <span className="text-gray-500">Sin item</span>}
              </div>
            </div>
          )}

          {/* ── Evento aleatorio ────────────────────────────────────────────────── */}
          {run.currentEvent && !run.currentEvent.resolved && (
            <EventPanel
              event={run.currentEvent}
              playerHP={playerHP}
              maxHP={derived.max_hp}
              playerGold={0}  // en run no hay gold disponible para mercader aún
              enemies={enemies}
              dungeon={dungeon}
              depthMult={depthMult}
              granGoblinBoss={granGoblinBoss}
              onSetGranGoblinBoss={setGranGoblinBoss}
              onResolve={(effect) => {
                setCurrentEvent({ ...run.currentEvent!, resolved: true })
                if (effect.healHP) setPlayerHP(Math.min(playerHP + effect.healHP, derived.max_hp))
                if (effect.damage) setPlayerHP(Math.max(1, playerHP - effect.damage))
                if (effect.startCombat && effect.combatEnemies) {
                  // Emboscada o muro agrietado — iniciar combate
                  setFightingEvent(true)
                  setCurrentEvent({ ...run.currentEvent!, resolved: true })
                  initCombat(playerHP, playerStamina, playerMana, effect.combatEnemies)
                  setPhase(effect.isBoss ? 'boss' : 'in_combat')
                }
              }}
            />
          )}

          <div className="flex flex-col gap-3 mt-auto">
            {/* Acciones de descanso */}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRestItems(v => !v); setShowRestConsumables(false) }}
                disabled={run.accumulatedLoot.items.length === 0}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition text-sm"
              >
                🎒 Items ({run.accumulatedLoot.items.length})
              </button>
              <button
                onClick={() => { handleOpenRestConsumables(); setShowRestItems(false) }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
              >
                🧪 Consumibles
              </button>
            </div>
            <button
              disabled={!!(run.currentEvent && !run.currentEvent.resolved)}
              onClick={() => {
                if (isBeforeBoss && !run.bossDefeated) {
                  // Boss: 1 solo enemigo escalado
                  const scaledMaxHP = Math.round(boss.stats.hp * (run.depth > 0 ? depthMult : 1))
                  const bossState: EnemyCombatState = {
                    instanceId: nextInstanceId(),
                    enemy: {
                      id: boss.id,
                      dungeon_id: boss.dungeon_id,
                      name: boss.name,
                      stats: { ...boss.stats, hp: scaledMaxHP },
                      loot_table: [],
                      enemy_type: boss.enemy_type,
                    },
                    currentHP: scaledMaxHP,
                    maxHP: scaledMaxHP,
                    alive: true,
                  }
                  setStunnedEnemyIds([])
                  setBurnStates([])
                  initCombat(playerHP, playerStamina, playerMana, [bossState])
                  setPhase('boss')
                } else {
                  // Sala normal: tirar cantidad de enemigos
                  const count = rollEnemyCount(run.currentRoom + 1, dungeon.rank, run.depth)
                  const roomEnemies = buildEnemyCombatStates(enemies, count, depthMult, dungeon.spawn_table, run.currentRoom + 1)
                  // Guardar referencia al primer enemigo para loot/tipo (compatibilidad)
                  setCurrentEnemy(roomEnemies[0].enemy)
                  setStunnedEnemyIds([])
                  setBurnStates([])
                  initCombat(playerHP, playerStamina, playerMana, roomEnemies)
                  setPhase('in_combat')
                }
              }}
              className={`w-full font-bold py-4 rounded-lg transition text-lg ${
                isBeforeBoss && !run.bossDefeated
                  ? 'bg-red-700 hover:bg-red-600 text-white'
                  : run.depth > 0
                  ? 'bg-orange-600 hover:bg-orange-500 text-white'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-black'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isBeforeBoss && !run.bossDefeated
                ? '💀 Enfrentar al Boss'
                : run.depth > 0
                ? '⚔️ Entrar a la sala'
                : '⚔️ Entrar a la sala'}
            </button>

            <button
              onClick={handleExitDungeon}
              disabled={isSaving}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-bold py-3 rounded-lg transition"
            >
              {isSaving ? '💾 Guardando...' : `🚪 Salir${run.accumulatedLoot.gold > 0 ? ` (conservás ${run.accumulatedLoot.gold} gold)` : ''}`}
            </button>
          </div>

        </div>

        {/* Drawer: ver items conseguidos */}
        {showRestItems && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRestItems(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl p-5 max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-green-400 text-lg">🎒 Items conseguidos</h3>
                <button onClick={() => setShowRestItems(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              {run.accumulatedLoot.items.length === 0
                ? <p className="text-gray-500 text-sm text-center py-4">Sin items todavía</p>
                : <div className="flex flex-col gap-2 overflow-y-auto">
                    {run.accumulatedLoot.items.map((itemId, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                      {(() => {
                          const info = itemInfoMap.get(itemId)
                          return info?.sprite
                            ? <img src={`/sprites/items/${info.sprite}`} alt={info?.name} className="w-8 h-8 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            : <span className="text-green-400 text-lg shrink-0">🎁</span>
                        })()}
                        <span className="text-white text-sm font-medium">{itemInfoMap.get(itemId)?.name ?? `Item #${itemId}`}</span>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>
        )}

        {/* Drawer: usar consumibles */}
        {showRestConsumables && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRestConsumables(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl p-5 max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-blue-400 text-lg">🧪 Usar consumible</h3>
                <button onClick={() => setShowRestConsumables(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              {loadingRestItems && <p className="text-gray-400 text-sm text-center py-4">Cargando...</p>}
              {!loadingRestItems && restConsumables.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">No tenés consumibles</p>
              )}
              {!loadingRestItems && (
                <div className="flex flex-col gap-2 overflow-y-auto">
                  {restConsumables.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => handleUseRestItem(entry.id)}
                      disabled={usingRestItem}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg p-4 transition"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white">{entry.item.name}</span>
                          <div className="flex gap-3 text-xs mt-1">
                            {entry.item.effect?.heal_hp      > 0 && <span className="text-red-400">❤️ +{entry.item.effect.heal_hp} HP</span>}
                            {entry.item.effect?.heal_stamina > 0 && <span className="text-yellow-400">⚡ +{entry.item.effect.heal_stamina}</span>}
                            {entry.item.effect?.heal_mana    > 0 && <span className="text-blue-400">🔮 +{entry.item.effect.heal_mana}</span>}
                          </div>
                        </div>
                        <span className="text-gray-400 text-sm ml-4">x{entry.quantity}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    )
  }

  // ─── PANTALLA DE RESULTADOS ─────────────────────────────────────────────────
  if (run.phase === 'results') {
    return (
      <div className="min-h-screen flex justify-center" style={{
        backgroundImage: `url(/sprites/backgrounds/${dungeon.background || 'Goblin_cave_bg.jpg'})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        <div className="w-full min-h-screen text-white p-4 flex flex-col gap-4 max-w-2xl" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>

          <div className="text-center py-4">
            <h1 className="text-3xl font-bold text-yellow-500 mb-1">🏆 ¡Victoria!</h1>
            <p className="text-gray-400">{dungeon.name} completada</p>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 flex flex-col gap-0">
            <h2 className="font-bold text-white text-lg mb-4">Recompensas</h2>
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-400">EXP obtenida</span>
              <span className="text-purple-400 font-bold text-lg">+{run.accumulatedLoot.exp} EXP</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-700">
              <span className="text-gray-400">Gold obtenido</span>
              <span className="text-yellow-400 font-bold text-lg">+{run.accumulatedLoot.gold} 💰</span>
            </div>
            {bossDrops.length > 0 && (
              <div className="flex flex-col py-3 border-b border-gray-700 gap-3">
                <span className="text-gray-400">Items obtenidos</span>
                <div className="flex flex-wrap gap-3">
                  {bossDrops.map((drop, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2">
                      {drop.sprite ? (
                        <img
                          src={`/sprites/items/${drop.sprite}`}
                          alt={drop.name}
                          className="w-8 h-8 object-contain"
                          style={{ imageRendering: 'pixelated' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span className="text-lg">🎁</span>
                      )}
                      <span className="text-green-400 font-bold text-sm">{drop.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-400">Boss derrotado</span>
              <span className="text-red-400 font-bold">💀 {boss.name}</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">Las recompensas ya fueron guardadas en tu cuenta</p>

          <div className="flex flex-col gap-3 mt-auto">
            <button
              onClick={() => { increaseDepth(); setBossDefeated(true) }}
              className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-4 rounded-lg text-lg transition"
            >
              ⚔️ Continuar — Profundidad {run.depth + 1}
            </button>
            <button
              onClick={handleReturnToHub}
              disabled={isSaving}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold py-3 rounded-lg transition"
            >
              {isSaving ? '💾 Guardando...' : 'Volver al Hub'}
            </button>
          </div>

        </div>
      </div>
    )
  }

  // Mientras el useEffect inicializa el combate, no renderizar nada
  if (run.phase === 'boss' && run.currentEnemies.length === 0) return null

  // ─── PANTALLA DE COMBATE ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex" style={{
      backgroundImage: `url(/sprites/backgrounds/${dungeon.background || 'Goblin_cave_bg.jpg'})`,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>

      {/* Zona izquierda — sprites enemigos */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col gap-3 items-center">
          {run.currentEnemies.map((e, idx) => {
            if (!e.alive) return null
            const isTarget = idx === safeTargetIndex
            const hpPct = Math.max(0, Math.round((e.currentHP / e.maxHP) * 100))
            return (
              <button
                key={e.instanceId}
                onClick={() => !isProcessing && status === 'active' && setTargetIndex(idx)}
                disabled={isProcessing || status !== 'active'}
                className={`bg-black/40 rounded-xl p-3 flex flex-col items-center gap-1 transition w-36
                  ${isTarget ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent' : 'hover:bg-black/60'}
                  ${!isProcessing && status === 'active' ? 'cursor-pointer' : 'cursor-default'}
                `}
              >
                {isBossRoom && (
                  <span className="text-xs bg-red-800 text-red-300 px-2 py-0.5 rounded font-bold">BOSS</span>
                )}
                <img
                  src="/sprites/enemies/SlimeBase_512x512.png"
                  alt={e.enemy.name}
                  className={`w-24 h-24 object-contain transition-opacity ${isTarget ? 'opacity-100' : 'opacity-60'}`}
                  style={{ imageRendering: 'pixelated' }}
                />
                <span className={`text-xs font-bold text-center ${isBossRoom ? 'text-red-400' : 'text-red-300'}`}>
                  {e.enemy.name}
                  {isTarget && ' 🎯'}
                  {burnStates.some(b => b.instanceId === e.instanceId) && ' 🔥'}
                </span>
                {/* Mini HP bar por enemigo */}
                <div className="w-full bg-gray-600 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${isBossRoom ? 'bg-red-600' : 'bg-red-400'}`}
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{e.currentHP}/{e.maxHP}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Zona central — UI con overlay */}
      <div className="w-full max-w-xl min-h-screen text-white p-4 flex flex-col gap-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>

        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-yellow-500">{dungeon.name}</h1>
          <span className="text-gray-400 text-sm">
            {isBossRoom
              ? '💀 Boss'
              : run.bossDefeated
              ? `⚔️ Prof. ${run.depth}`
              : `Sala ${Math.min(run.currentRoom + 1, run.totalRooms)}/${run.totalRooms}`
            } · Turno {turn}
          </span>
        </div>

        {/* Enemy HP — detalle del objetivo actual */}
        {targetEnemy && targetEnemy.alive && (
          <div className={`rounded-lg p-4 ${isBossRoom ? 'bg-red-950 border border-red-800' : 'bg-gray-800/80'}`}>
            <div className="flex justify-between mb-1">
              <span className={`font-bold ${isBossRoom ? 'text-red-300' : 'text-red-400'}`}>
                🎯 {targetEnemy.enemy.name}
                {isBossRoom && <span className="ml-2 text-xs bg-red-800 text-red-300 px-2 py-0.5 rounded">BOSS</span>}
              </span>
              <span className="text-sm text-gray-400">{targetEnemy.currentHP}/{targetEnemy.maxHP} HP</span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${isBossRoom ? 'bg-red-600' : 'bg-red-500'}`}
                style={{ width: `${Math.max(0, Math.round((targetEnemy.currentHP / targetEnemy.maxHP) * 100))}%` }}
              />
            </div>
            {aliveEnemies.length > 1 && (
              <p className="text-xs text-gray-500 mt-1">
                {aliveEnemies.length} enemigos vivos — tocá uno para cambiar objetivo
              </p>
            )}
          </div>
        )}

        {/* Log */}
        <div ref={logRef} className="bg-gray-800 rounded-lg p-4 h-48 overflow-y-auto flex flex-col gap-1">
          {log.map((entry: string, i: number) => (
            <p key={i} className={`text-sm ${entry.includes('CRÍTICO') || entry.includes('OVERCRIT') ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
              {entry}
            </p>
          ))}
          {isProcessing && <p className="text-sm text-yellow-500 animate-pulse">Resolviendo turno...</p>}
        </div>

        {/* Player */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex justify-between mb-2">
            <span className="font-bold text-green-400">🧙 {player.name}</span>
            <span className="text-sm text-gray-400">{playerHP}/{derived.max_hp} HP</span>
          </div>
          <div className="w-full bg-gray-600 rounded-full h-3 mb-2">
            <div className="bg-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${playerHPPct}%` }} />
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-yellow-400">⚡ {playerStamina}/{derived.max_stamina}</span>
            <span className="text-blue-400">🔮 {playerMana}/{derived.max_mana}</span>
          </div>
        </div>

        {/* Skills */}
        {showSkills && status === 'active' && (
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-purple-400">✨ Habilidades</h3>
              <button onClick={() => setShowSkills(false)} className="text-gray-400 hover:text-white text-sm">✕ Cerrar</button>
            </div>
            {availableSkills.map((skill) => {
              const canUse = playerStamina >= skill.stamina_cost && playerMana >= skill.mana_cost
              return (
                <button
                  key={skill.id}
                  onClick={() => handleAction('skill', skill)}
                  disabled={!canUse || isProcessing}
                  className="text-left bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg p-3 transition"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-white">{skill.name}</span>
                    <div className="flex gap-2 text-xs">
                      {skill.stamina_cost > 0 && <span className="text-yellow-400">⚡{skill.stamina_cost}</span>}
                      {skill.mana_cost > 0 && <span className="text-blue-400">🔮{skill.mana_cost}</span>}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">{skill.description}</p>
                  <p className="text-purple-400 text-xs mt-1">Daño: x{skill.damage_multiplier} • {skill.type}</p>
                </button>
              )
            })}
          </div>
        )}

        {/* Items */}
        {showItems && status === 'active' && (
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-green-400">🎒 Consumibles</h3>
              <button onClick={() => setShowItems(false)} className="text-gray-400 hover:text-white text-sm">✕ Cerrar</button>
            </div>
            {loadingItems && <p className="text-gray-400 text-sm text-center py-2">Cargando...</p>}
            {!loadingItems && consumables.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-2">No tenés consumibles</p>
            )}
            {!loadingItems && consumables.map((entry) => (
              <button
                key={entry.id}
                onClick={() => handleUseItem(entry.id)}
                disabled={isProcessing}
                className="text-left bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg p-3 transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-white">{entry.item.name}</span>
                    <div className="flex gap-3 text-xs mt-1">
                      {entry.item.effect?.heal_hp      > 0 && <span className="text-red-400">❤️ +{entry.item.effect.heal_hp} HP</span>}
                      {entry.item.effect?.heal_stamina > 0 && <span className="text-yellow-400">⚡ +{entry.item.effect.heal_stamina}</span>}
                      {entry.item.effect?.heal_mana    > 0 && <span className="text-blue-400">🔮 +{entry.item.effect.heal_mana}</span>}
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">x{entry.quantity}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Botón salir — training room */}
        {isTraining && status === 'active' && (
          <button
            onClick={handleExitDungeon}
            disabled={isSaving}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-bold py-2 rounded-lg transition text-sm"
          >
            {isSaving ? 'Saliendo...' : '🚪 Salir del entrenamiento'}
          </button>
        )}

        {/* Botones de acción */}
        {status === 'active' && !showSkills && !showItems && (
          <div className="grid grid-cols-2 gap-3">
            <ActionButton label="⚔️ Atacar" onClick={() => handleAction('attack')} disabled={isProcessing} color="bg-red-600 hover:bg-red-500" />
            <ActionButton label="✨ Habilidades" onClick={() => setShowSkills(true)} disabled={isProcessing} color="bg-purple-600 hover:bg-purple-500" />
            <ActionButton
              label={`🛡️ Bloquear (${Math.round(Math.max(10, 95 - consecutiveBlocks * 15))}%)`}
              onClick={() => handleAction('block')}
              disabled={isProcessing}
              color="bg-blue-600 hover:bg-blue-500"
            />
            <ActionButton label="🎒 Item" onClick={handleOpenItems} disabled={isProcessing} color="bg-green-700 hover:bg-green-600" />
          </div>
        )}

        {/* Victoria sala normal */}
        {status === 'victory' && !isBossRoom && (
          <div className="bg-green-900 rounded-lg p-4 text-center">
            <p className="text-green-400 font-bold animate-pulse">✅ Sala despejada — avanzando...</p>
          </div>
        )}

        {/* Derrota */}
        {status === 'defeat' && (
          <div className="bg-red-900 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">💀 Derrota</h2>
            <p className="mb-4 text-gray-400">Perdiste el loot de esta run</p>
            <button onClick={handleReturnToHub} className="bg-red-500 text-white font-bold px-6 py-2 rounded-lg">
              Volver al Hub
            </button>
          </div>
        )}

      </div>

      {/* Zona derecha — sprite jugador */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-black/40 rounded-xl p-4 flex flex-col items-center gap-2">
          <img
            src="/sprites/enemies/SlimeBase_512x512.png"
            alt={player.name}
            className="w-32 h-32 object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
          <span className="text-green-400 text-xs font-bold text-center">{player.name}</span>
        </div>
      </div>

    </div>
  )
}

// ─── EventPanel ──────────────────────────────────────────────────────────────

interface EventEffect {
  healHP?: number
  damage?: number
  startCombat?: boolean
  combatEnemies?: EnemyCombatState[]
  isBoss?: boolean
}

interface EventPanelProps {
  event: import('@/types/game').RoomEvent
  playerHP: number
  maxHP: number
  playerGold: number
  enemies: import('@/types/game').Enemy[]
  dungeon: import('@/types/game').Dungeon
  depthMult: number
  granGoblinBoss: import('@/types/game').Boss | null
  onSetGranGoblinBoss: (boss: import('@/types/game').Boss | null) => void
  onResolve: (effect: EventEffect) => void
}

const EVENT_INFO: Record<string, { icon: string; title: string; color: string }> = {
  treasure:      { icon: '📦', title: 'Cofre del Tesoro',    color: 'border-yellow-700 bg-yellow-950/40' },
  ambush:        { icon: '⚔️', title: 'Emboscada',           color: 'border-red-700 bg-red-950/40'       },
  merchant:      { icon: '🧙', title: 'Mercader Errante',    color: 'border-blue-700 bg-blue-950/40'     },
  healing_altar: { icon: '✨', title: 'Altar de Curación',   color: 'border-green-700 bg-green-950/40'   },
  poison_trap:   { icon: '☠️', title: 'Trampa Venenosa',     color: 'border-purple-700 bg-purple-950/40' },
  cracked_wall:  { icon: '🧱', title: 'Muro Agrietado',      color: 'border-gray-600 bg-gray-800/60'     },
}

function EventPanel({ event, playerHP, maxHP, enemies, dungeon, depthMult, granGoblinBoss, onSetGranGoblinBoss, onResolve }: EventPanelProps) {
  const info = EVENT_INFO[event.type]
  const [loading, setLoading] = useState(false)
  const [fetchedBoss, setFetchedBoss] = useState(false)

  // Calcular efecto según tipo
  const healAmount = Math.round(maxHP * 0.3)  // altar cura 30% del HP máx
  const poisonDmg  = Math.round(maxHP * 0.15) // trampa hace 15% del HP máx

  // Cargar boss del muro agrietado desde la DB si no está cargado
  async function loadGranGoblin() {
    if (granGoblinBoss || fetchedBoss) return
    setFetchedBoss(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase
      .from('bosses')
      .select('*')
      .eq('name', 'Gran Goblin')
      .single()
    if (data) onSetGranGoblinBoss(data as import('@/types/game').Boss)
  }

  if (event.type === 'cracked_wall' && !fetchedBoss) {
    loadGranGoblin()
  }

  function handleAmbush() {
    const count = Math.random() < 0.4 ? 2 : 1
    const pool = enemies.filter(e => e.stats.attack > 0)
    const combatEnemies: EnemyCombatState[] = Array.from({ length: count }, (_, i) => {
      const enemy = pool[Math.floor(Math.random() * pool.length)]
      const maxHP = Math.round(enemy.stats.hp * depthMult * 1.2)  // 20% más fuerte
      return { instanceId: Date.now() + i, enemy, currentHP: maxHP, maxHP, alive: true }
    })
    onResolve({ startCombat: true, combatEnemies, isBoss: false })
  }

  function handleCrackedWall() {
    if (!granGoblinBoss) return
    const maxHP = granGoblinBoss.stats.hp
    const combatEnemies: EnemyCombatState[] = [{
      instanceId: Date.now(),
      enemy: {
        id: granGoblinBoss.id,
        dungeon_id: granGoblinBoss.dungeon_id,
        name: granGoblinBoss.name,
        stats: { hp: maxHP, attack: granGoblinBoss.stats.attack, defense: granGoblinBoss.stats.defense },
        loot_table: [],
        enemy_type: granGoblinBoss.enemy_type,
      },
      currentHP: maxHP,
      maxHP,
      alive: true,
    }]
    onResolve({ startCombat: true, combatEnemies, isBoss: true })
  }

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${info.color}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{info.icon}</span>
        <h3 className="font-bold text-white">{info.title}</h3>
      </div>

      {event.type === 'treasure' && (
        <>
          <p className="text-gray-300 text-sm">Encontrás un cofre abandonado. Contiene algo de gold.</p>
          <button
            onClick={() => {
              const gold = 20 + Math.floor(Math.random() * 40)
              onResolve({})  // el gold se maneja via addLoot en el padre — simplificado
            }}
            className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            🔓 Abrir cofre
          </button>
        </>
      )}

      {event.type === 'ambush' && (
        <>
          <p className="text-gray-300 text-sm">¡Un grupo de goblins te tiende una emboscada! No podés evitar el combate.</p>
          <button
            onClick={handleAmbush}
            className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            ⚔️ Combatir
          </button>
        </>
      )}

      {event.type === 'healing_altar' && (
        <>
          <p className="text-gray-300 text-sm">Un altar antiguo emite un suave resplandor. Podés absorber su energía.</p>
          <p className="text-green-400 text-sm font-bold">❤️ +{Math.min(healAmount, maxHP - playerHP)} HP</p>
          <button
            onClick={() => onResolve({ healHP: healAmount })}
            disabled={playerHP >= maxHP}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            {playerHP >= maxHP ? 'HP al máximo' : '✨ Absorber energía'}
          </button>
        </>
      )}

      {event.type === 'poison_trap' && (
        <>
          <p className="text-gray-300 text-sm">Pisás una trampa oculta. El veneno te quema las venas.</p>
          <p className="text-purple-400 text-sm font-bold">☠️ -{poisonDmg} HP</p>
          <button
            onClick={() => onResolve({ damage: poisonDmg })}
            className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            😬 Continuar
          </button>
        </>
      )}

      {event.type === 'merchant' && (
        <>
          <p className="text-gray-300 text-sm">Un mercader misterioso aparece entre las sombras. No tenés gold del run disponible.</p>
          <button
            onClick={() => onResolve({})}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            🚶 Ignorar
          </button>
        </>
      )}

      {event.type === 'cracked_wall' && (
        <>
          <p className="text-gray-300 text-sm">Ves una grieta en la pared que lleva a una cámara oculta. Se escuchan ruidos al otro lado...</p>
          <p className="text-orange-400 text-xs">⚠️ Peligro desconocido — recompensa asegurada si sobrevivís</p>
          <div className="flex gap-2">
            <button
              onClick={handleCrackedWall}
              disabled={!granGoblinBoss}
              className="flex-1 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              {granGoblinBoss ? '🧱 Atravesar' : 'Cargando...'}
            </button>
            <button
              onClick={() => onResolve({})}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              🚶 Ignorar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ActionButton({ label, onClick, disabled, color, subtitle }: {
  label: string
  onClick: () => void
  disabled: boolean
  color: string
  subtitle?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${color} text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center`}
    >
      <span>{label}</span>
      {subtitle && <span className="text-xs opacity-70 mt-1">{subtitle}</span>}
    </button>
  )
}