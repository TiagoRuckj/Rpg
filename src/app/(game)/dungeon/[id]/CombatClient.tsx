'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Player, Dungeon, Boss, Enemy, CombatAction, PlayerSkill,
  EnemyType, EnemyCombatState, deriveStats, depthMultiplier, rollEnemyCount,
  rollRoomEvent,
} from '@/types/game'
import { useCombatStore } from '@/stores/combatStore'
import { takeTurnAction, EnemyTurnState, ItemUsed } from '@/actions/combatActions'
import { registerKillAction } from '@/actions/classActions'
import { saveRunAction } from '@/actions/saveRunAction'
import { clearRunAction } from '@/actions/activeRunAction'
import { getConsumablesAction, useItemAction } from '@/actions/itemAction'
import { BASE_SKILLS, LOCKED_SKILLS } from '@/lib/game/skills'
import { resolveEnemyLoot, resolveBossLoot } from '@/lib/game/loot'
import { BetweenRoomsScreen } from './components/BetweenRoomsScreen'
import { ResultsScreen } from './components/ResultsScreen'

interface Props {
  player: Player
  dungeon: Dungeon
  boss: Boss
  enemies: Enemy[]
}

// ─── Helpers de spawn ────────────────────────────────────────────────────────

let instanceCounter = 0
export function nextInstanceId() { return ++instanceCounter }

function pickRandomEnemy(pool: Enemy[]): Enemy {
  return pool[Math.floor(Math.random() * pool.length)]
}

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
  const keys = Object.keys(spawnTable).map(Number).sort((a, b) => a - b)
  const key = keys.filter(k => k <= room).pop()
  return key !== undefined ? spawnTable[String(key)] : undefined
}

export function buildEnemyCombatStates(
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
    return { instanceId: nextInstanceId(), enemy, currentHP: maxHP, maxHP, alive: true }
  })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CombatClient({ player, dungeon, boss, enemies }: Props) {
  const router = useRouter()
  const logRef = useRef<HTMLDivElement>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [granGoblinBoss, setGranGoblinBoss] = useState<Boss | null>(null)
  const [fightingEvent, setFightingEvent] = useState(false)
  const [consumables, setConsumables] = useState<any[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [lastLoot, setLastLoot] = useState<{ exp: number; gold: number; itemId: number | null; itemName: string | null } | null>(null)
  const [bossDrops, setBossDrops] = useState<{ name: string; sprite: string }[]>([])
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
    setPoisonState,
  } = useCombatStore()

  const derived = deriveStats(player.primary_stats)
  const availableSkills = BASE_SKILLS.filter(s =>
    (player.equipped_skills ?? []).includes(s.id) &&
    (!LOCKED_SKILLS.has(s.id) || (player.unlocked_skills ?? []).includes(s.id))
  )

  const depthMult = depthMultiplier(run.depth)
  const isTraining = boss.stats.attack === 0 && boss.loot_table.length === 0

  useEffect(() => {
    initRun(dungeon.rooms)
    setPlayerHP(player.current_hp ?? derived.max_hp)
    setPlayerStamina(derived.max_stamina)
    setPlayerMana(derived.max_mana)
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  useEffect(() => {
    if (run.phase !== 'boss' || run.currentEnemies.length > 0 || status !== 'idle') return
    const scaledMaxHP = Math.round(boss.stats.hp * (run.depth > 0 ? depthMult : 1))
    const bossState: EnemyCombatState = {
      instanceId: nextInstanceId(),
      enemy: { id: boss.id, dungeon_id: boss.dungeon_id, name: boss.name, stats: { ...boss.stats, hp: scaledMaxHP }, loot_table: [], enemy_type: boss.enemy_type },
      currentHP: scaledMaxHP, maxHP: scaledMaxHP, alive: true,
    }
    setStunnedEnemyIds([])
    setBurnStates([])
    initCombat(playerHP, playerStamina, playerMana, [bossState])
  }, [run.phase, run.currentEnemies.length, status])

  const isBossRoom = run.bossDefeated === false && run.currentRoom >= run.totalRooms && !fightingEvent
  const playerHPPct = Math.max(0, Math.round((playerHP / derived.max_hp) * 100))
  const aliveEnemies = run.currentEnemies.filter(e => e.alive)

  const safeTargetIndex = (() => {
    const t = run.currentEnemies[run.targetIndex]
    if (t && t.alive) return run.targetIndex
    const firstAlive = run.currentEnemies.findIndex(e => e.alive)
    return firstAlive >= 0 ? firstAlive : 0
  })()

  const targetEnemy = run.currentEnemies[safeTargetIndex]
  const bossEnemyState = isBossRoom ? run.currentEnemies[0] : null

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

  // ─── Combate ──────────────────────────────────────────────────────────────

  async function handleAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    if (status !== 'active' || isProcessing) return
    setIsProcessing(true)
    setShowSkills(false)
    if (isBossRoom) await handleBossAction(action, skill, itemUsed)
    else await handleRoomAction(action, skill, itemUsed)
    setIsProcessing(false)
  }

  async function handleRoomAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    const enemyTurnStates: EnemyTurnState[] = run.currentEnemies.map(e => ({
      instanceId: e.instanceId, currentHP: e.currentHP, maxHP: e.maxHP, alive: e.alive,
      attack: Math.round(e.enemy.stats.attack * depthMult),
      defense: Math.round(e.enemy.stats.defense * depthMult),
      name: e.enemy.name, enemyTypes: e.enemy.enemy_type as EnemyType[],
    }))

    const result = await takeTurnAction({
      action, skillUsed: skill, itemUsed,
      currentPlayerHP: playerHP, currentPlayerStamina: playerStamina, currentPlayerMana: playerMana,
      enemies: enemyTurnStates, targetIndex: safeTargetIndex,
      isBlocking: action === 'block',
      consecutiveBlocks: action === 'block' ? consecutiveBlocks : 0,
      stunnedEnemyIds, burnStates, poisonState: run.poisonState,
    })

    if (!result.success) { addLog(result.error ?? 'Error desconocido'); return }

    result.log.forEach((e: string) => addLog(e))
    setPlayerHP(result.newPlayerHP)
    setPlayerStamina(result.newPlayerStamina)
    setPlayerMana(result.newPlayerMana)
    setConsecutiveBlocks(result.newConsecutiveBlocks)
    setStunnedEnemyIds(result.newStunnedEnemyIds)
    setBurnStates(result.newBurnStates)
    setPoisonState(result.newPoisonState)
    nextTurn()

    for (const [idStr, newHP] of Object.entries(result.updatedEnemyHPs)) {
      setEnemyHP(Number(idStr), newHP)
    }

    for (const instanceId of result.defeatedEnemyInstanceIds) {
      const fallen = run.currentEnemies.find(e => e.instanceId === instanceId)
      if (!fallen) continue
      const loot = resolveEnemyLoot(fallen.enemy, depthMult)
      addLoot({ exp: loot.exp, gold: loot.gold, items: loot.itemId ? [loot.itemId] : [] })
      setLastLoot({ exp: loot.exp, gold: loot.gold, itemId: loot.itemId, itemName: loot.itemName })
      registerKillAction({ enemyTypes: fallen.enemy.enemy_type as EnemyType[], hasWeaponEquipped: true, isBossKill: false, dungeonId: dungeon.id })
    }

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
          setFightingEvent(false)
          setCurrentEvent(null)
          setStatus('idle')
          setPhase('between_rooms')
        } else {
          advanceRoom()
          if (!run.bossDefeated) setCurrentEvent(rollRoomEvent())
          setStatus('idle'); setPhase('between_rooms')
        }
      }, 1200)
    } else if (result.playerDefeated) {
      setStatus('defeat')
      saveRunAction({ outcome: 'defeat', exp: run.accumulatedLoot.exp, gold: 0, items: [], currentHP: 1 })
    }
  }

  async function handleBossAction(action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) {
    if (!bossEnemyState) return
    const scaledAtk  = Math.round(boss.stats.attack  * (run.depth > 0 ? depthMult : 1))
    const scaledDef  = Math.round(boss.stats.defense * (run.depth > 0 ? depthMult : 1))

    const result = await takeTurnAction({
      action, skillUsed: skill, itemUsed,
      currentPlayerHP: playerHP, currentPlayerStamina: playerStamina, currentPlayerMana: playerMana,
      enemies: [{ instanceId: bossEnemyState.instanceId, currentHP: bossEnemyState.currentHP, maxHP: bossEnemyState.maxHP, alive: bossEnemyState.alive, attack: scaledAtk, defense: scaledDef, name: boss.name, enemyTypes: boss.enemy_type as EnemyType[] }],
      targetIndex: 0, isBlocking: action === 'block',
      consecutiveBlocks: action === 'block' ? consecutiveBlocks : 0,
      stunnedEnemyIds: [], burnStates, poisonState: run.poisonState,
    })

    if (!result.success) { addLog(result.error ?? 'Error desconocido'); return }

    result.log.forEach((e: string) => addLog(e))
    setPlayerHP(result.newPlayerHP)
    setPlayerStamina(result.newPlayerStamina)
    setPlayerMana(result.newPlayerMana)
    setConsecutiveBlocks(result.newConsecutiveBlocks)
    setBurnStates(result.newBurnStates)
    setPoisonState(result.newPoisonState)
    if (isTraining) { setPlayerStamina(derived.max_stamina); setPlayerMana(derived.max_mana) }
    nextTurn()
    setEnemyHP(bossEnemyState.instanceId, result.updatedEnemyHPs[bossEnemyState.instanceId] ?? bossEnemyState.currentHP)

    if (result.allEnemiesDefeated) {
      if (fightingEvent && granGoblinBoss) {
        addLoot({ items: resolveBossLoot(granGoblinBoss, 0, 0).items })
        addLog('🏆 ¡Derrotaste al Gran Goblin! Item asegurado obtenido.')
        setFightingEvent(false); setGranGoblinBoss(null); setCurrentEvent(null); setStatus('victory')
        setTimeout(() => { setStatus('idle'); setPhase('between_rooms') }, 1200)
        return
      }
      if (isTraining) {
        addLog('💪 ¡El dummy fue destruido! Respawneando...')
        setTimeout(() => {
          const scaledMaxHP = Math.round(boss.stats.hp * (run.depth > 0 ? depthMult : 1))
          const newDummy: EnemyCombatState = {
            instanceId: nextInstanceId(),
            enemy: { id: boss.id, dungeon_id: boss.dungeon_id, name: boss.name, stats: { ...boss.stats, hp: scaledMaxHP }, loot_table: [], enemy_type: boss.enemy_type },
            currentHP: scaledMaxHP, maxHP: scaledMaxHP, alive: true,
          }
          setConsecutiveBlocks(0); setStunnedEnemyIds([]); setBurnStates([])
          initCombat(playerHP, playerStamina, playerMana, [newDummy])
          setPlayerHP(result.newPlayerHP); setPlayerStamina(result.newPlayerStamina); setPlayerMana(result.newPlayerMana)
        }, 1000)
        return
      }
      const bossLoot = resolveBossLoot(boss)
      const totalExp  = run.accumulatedLoot.exp  + bossLoot.exp
      const totalGold = run.accumulatedLoot.gold + bossLoot.gold
      const totalItems = [...run.accumulatedLoot.items, ...bossLoot.items]
      setBossDrops(bossLoot.itemDetails)
      addLoot({ exp: bossLoot.exp, gold: bossLoot.gold, items: bossLoot.items })
      setBossDefeated(true); setStatus('victory'); setPhase('results')
      registerKillAction({ enemyTypes: boss.enemy_type ?? [], hasWeaponEquipped: true, isBossKill: true, dungeonId: dungeon.id })
      saveRunAction({ outcome: 'victory', exp: totalExp, gold: totalGold, items: totalItems, currentHP: result.newPlayerHP })
    } else if (result.playerDefeated) {
      setStatus('defeat')
      saveRunAction({ outcome: 'defeat', exp: run.accumulatedLoot.exp, gold: 0, items: [], currentHP: 1 })
    }
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  async function handleOpenItems() {
    setLoadingItems(true)
    const { items } = await getConsumablesAction()
    setConsumables(items); setLoadingItems(false); setShowItems(true)
  }

  async function handleUseItem(entryId: number) {
    const entry = consumables.find(e => e.id === entryId)
    if (!entry) return
    setConsumables(prev => prev.map(e => e.id === entryId ? { ...e, quantity: e.quantity - 1 } : e).filter(e => e.quantity > 0))
    setShowItems(false)
    await handleAction('item', undefined, { entryId, name: entry.item.name, effect: entry.item.effect ?? {} })
  }

  async function handleOpenRestConsumables() {
    setLoadingRestItems(true)
    const { items } = await getConsumablesAction()
    setRestConsumables(items); setLoadingRestItems(false); setShowRestConsumables(true)
  }

  async function handleUseRestItem(entryId: number) {
    setUsingRestItem(true)
    const result = await useItemAction(entryId)
    if (!result.success) { setUsingRestItem(false); return }
    if (result.healHP > 0)      setPlayerHP(Math.min(playerHP + result.healHP, derived.max_hp))
    if (result.healStamina > 0) setPlayerStamina(Math.min(playerStamina + result.healStamina, derived.max_stamina))
    if (result.healMana > 0)    setPlayerMana(Math.min(playerMana + result.healMana, derived.max_mana))
    setRestConsumables(prev => prev.map(e => e.id === entryId ? { ...e, quantity: e.quantity - 1 } : e).filter(e => e.quantity > 0))
    setUsingRestItem(false)
  }

  async function handleReturnToHub() {
    await clearRunAction(playerHP); router.replace('/hub')
  }

  async function handleExitDungeon() {
    setIsSaving(true)
    await saveRunAction({ outcome: 'extracted', exp: run.accumulatedLoot.exp, gold: run.accumulatedLoot.gold, items: run.accumulatedLoot.items, currentHP: playerHP })
    await clearRunAction(playerHP); router.replace('/hub')
  }

  // ─── Pantallas ────────────────────────────────────────────────────────────

  if (run.phase === 'between_rooms') {
    return (
      <BetweenRoomsScreen
        player={player} dungeon={dungeon} boss={boss} enemies={enemies}
        playerHP={playerHP} playerStamina={playerStamina} playerMana={playerMana}
        run={run} derived={derived} itemInfoMap={itemInfoMap}
        lastLoot={lastLoot} isSaving={isSaving}
        setPlayerHP={setPlayerHP} setPlayerStamina={setPlayerStamina} setPlayerMana={setPlayerMana}
        setPhase={setPhase} setCurrentEnemy={setCurrentEnemy}
        initCombat={initCombat} setStunnedEnemyIds={setStunnedEnemyIds} setBurnStates={setBurnStates}
        addLoot={addLoot} advanceRoom={advanceRoom} setCurrentEvent={setCurrentEvent} setPoisonState={setPoisonState}
        setFightingEvent={setFightingEvent} granGoblinBoss={granGoblinBoss} setGranGoblinBoss={setGranGoblinBoss}
        nextInstanceId={nextInstanceId} buildEnemyCombatStates={buildEnemyCombatStates}
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

  // ─── Pantalla de combate ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex" style={{
      backgroundImage: `url(/sprites/backgrounds/${dungeon.background || 'Goblin_cave_bg.jpg'})`,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col gap-3 items-center">
          {run.currentEnemies.map((e, idx) => {
            if (!e.alive) return null
            const isTarget = idx === safeTargetIndex
            const hpPct = Math.max(0, Math.round((e.currentHP / e.maxHP) * 100))
            return (
              <button key={e.instanceId} onClick={() => !isProcessing && status === 'active' && setTargetIndex(idx)} disabled={isProcessing || status !== 'active'}
                className={`bg-black/40 rounded-xl p-3 flex flex-col items-center gap-1 transition w-36 ${isTarget ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent' : 'hover:bg-black/60'} ${!isProcessing && status === 'active' ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {isBossRoom && <span className="text-xs bg-red-800 text-red-300 px-2 py-0.5 rounded font-bold">BOSS</span>}
                <img src="/sprites/enemies/SlimeBase_512x512.png" alt={e.enemy.name} className={`w-24 h-24 object-contain transition-opacity ${isTarget ? 'opacity-100' : 'opacity-60'}`} style={{ imageRendering: 'pixelated' }} />
                <span className={`text-xs font-bold text-center ${isBossRoom ? 'text-red-400' : 'text-red-300'}`}>
                  {e.enemy.name}{isTarget && ' 🎯'}{burnStates.some(b => b.instanceId === e.instanceId) && ' 🔥'}
                </span>
                <div className="w-full bg-gray-600 rounded-full h-1.5 mt-1">
                  <div className={`h-1.5 rounded-full transition-all ${isBossRoom ? 'bg-red-600' : 'bg-red-400'}`} style={{ width: `${hpPct}%` }} />
                </div>
                <span className="text-xs text-gray-400">{e.currentHP}/{e.maxHP}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="w-full max-w-xl min-h-screen text-white p-4 flex flex-col gap-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-yellow-500">{dungeon.name}</h1>
          <span className="text-gray-400 text-sm">
            {isBossRoom ? '💀 Boss' : run.bossDefeated ? `⚔️ Prof. ${run.depth}` : `Sala ${Math.min(run.currentRoom + 1, run.totalRooms)}/${run.totalRooms}`} · Turno {turn}
          </span>
        </div>

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
              <div className={`h-3 rounded-full transition-all duration-500 ${isBossRoom ? 'bg-red-600' : 'bg-red-500'}`} style={{ width: `${Math.max(0, Math.round((targetEnemy.currentHP / targetEnemy.maxHP) * 100))}%` }} />
            </div>
            {aliveEnemies.length > 1 && <p className="text-xs text-gray-500 mt-1">{aliveEnemies.length} enemigos vivos — tocá uno para cambiar objetivo</p>}
          </div>
        )}

        <div ref={logRef} className="bg-gray-800 rounded-lg p-4 h-48 overflow-y-auto flex flex-col gap-1">
          {log.map((entry: string, i: number) => (
            <p key={i} className={`text-sm ${entry.includes('CRÍTICO') || entry.includes('OVERCRIT') ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>{entry}</p>
          ))}
          {isProcessing && <p className="text-sm text-yellow-500 animate-pulse">Resolviendo turno...</p>}
        </div>

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
            {run.poisonState && run.poisonState.turnsLeft > 0 && (
              <span className="text-purple-400">☠️ Veneno ({run.poisonState.turnsLeft}t)</span>
            )}
          </div>
        </div>

        {showSkills && status === 'active' && (
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-purple-400">✨ Habilidades</h3>
              <button onClick={() => setShowSkills(false)} className="text-gray-400 hover:text-white text-sm">✕ Cerrar</button>
            </div>
            {availableSkills.map((skill) => {
              const canUse = playerStamina >= skill.stamina_cost && playerMana >= skill.mana_cost
              return (
                <button key={skill.id} onClick={() => handleAction('skill', skill)} disabled={!canUse || isProcessing} className="text-left bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg p-3 transition">
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

        {showItems && status === 'active' && (
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-green-400">🎒 Consumibles</h3>
              <button onClick={() => setShowItems(false)} className="text-gray-400 hover:text-white text-sm">✕ Cerrar</button>
            </div>
            {loadingItems && <p className="text-gray-400 text-sm text-center py-2">Cargando...</p>}
            {!loadingItems && consumables.length === 0 && <p className="text-gray-500 text-sm text-center py-2">No tenés consumibles</p>}
            {!loadingItems && consumables.map((entry) => (
              <button key={entry.id} onClick={() => handleUseItem(entry.id)} disabled={isProcessing} className="text-left bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg p-3 transition">
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

        {isTraining && status === 'active' && (
          <button onClick={handleExitDungeon} disabled={isSaving} className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-bold py-2 rounded-lg transition text-sm">
            {isSaving ? 'Saliendo...' : '🚪 Salir del entrenamiento'}
          </button>
        )}

        {status === 'active' && !showSkills && !showItems && (
          <div className="grid grid-cols-2 gap-3">
            <ActionButton label="⚔️ Atacar"     onClick={() => handleAction('attack')} disabled={isProcessing} color="bg-red-600 hover:bg-red-500" />
            <ActionButton label="✨ Habilidades" onClick={() => setShowSkills(true)}    disabled={isProcessing} color="bg-purple-600 hover:bg-purple-500" />
            <ActionButton label={`🛡️ Bloquear (${Math.round(Math.max(10, 95 - consecutiveBlocks * 15))}%)`} onClick={() => handleAction('block')} disabled={isProcessing} color="bg-blue-600 hover:bg-blue-500" />
            <ActionButton label="🎒 Item"        onClick={handleOpenItems}              disabled={isProcessing} color="bg-green-700 hover:bg-green-600" />
          </div>
        )}

        {status === 'victory' && !isBossRoom && (
          <div className="bg-green-900 rounded-lg p-4 text-center">
            <p className="text-green-400 font-bold animate-pulse">✅ Sala despejada — avanzando...</p>
          </div>
        )}

        {status === 'defeat' && (
          <div className="bg-red-900 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">💀 Derrota</h2>
            <p className="mb-4 text-gray-400">Perdiste el loot de esta run</p>
            <button onClick={handleReturnToHub} className="bg-red-500 text-white font-bold px-6 py-2 rounded-lg">Volver al Hub</button>
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-black/40 rounded-xl p-4 flex flex-col items-center gap-2">
          <img src="/sprites/enemies/SlimeBase_512x512.png" alt={player.name} className="w-32 h-32 object-contain" style={{ imageRendering: 'pixelated' }} />
          <span className="text-green-400 text-xs font-bold text-center">{player.name}</span>
        </div>
      </div>
    </div>
  )
}

function ActionButton({ label, onClick, disabled, color, subtitle }: {
  label: string; onClick: () => void; disabled: boolean; color: string; subtitle?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={`${color} text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center`}>
      <span>{label}</span>
      {subtitle && <span className="text-xs opacity-70 mt-1">{subtitle}</span>}
    </button>
  )
}