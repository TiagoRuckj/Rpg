'use client'

import { useState, useEffect } from 'react'
import {
  Player, Dungeon, Boss, Enemy, EnemyCombatState, EnemyAiConfig,
  RunState, depthMultiplier, rollEnemyCount,
  rollRoomEvent,
} from '@/types/game'
import { EventPanel, EventSheet, EventEffect } from './EventPanel'
import { PlayerHUD } from './PlayerHUD'
import { buyMerchantItemAction, flushRunGoldAction } from '@/actions/merchantActions'

interface BetweenRoomsScreenProps {
  player: Player
  dungeon: Dungeon
  boss: Boss
  enemies: Enemy[]
  // Store state
  playerHP: number
  playerStamina: number
  playerMana: number
  run: RunState
  derived: { max_hp: number; max_stamina: number; max_mana: number }
  itemInfoMap: Map<number, { name: string; sprite: string }>
  lastLoot: { exp: number; gold: number; itemId: number | null; itemName: string | null } | null
  isSaving: boolean
  // Store actions
  setPlayerHP: (hp: number) => void
  setPlayerStamina: (s: number) => void
  setPlayerMana: (m: number) => void
  setPhase: (phase: RunState['phase']) => void
  setCurrentEnemy: (enemy: Enemy | null) => void
  initCombat: (hp: number, stamina: number, mana: number, enemies: EnemyCombatState[]) => void
  setStunnedEnemyIds: (ids: number[]) => void
  setBossInstanceId: (instanceId: number | null) => void
  
  addLoot: (loot: { gold?: number }) => void
  advanceRoom: () => void
  setCurrentEvent: (event: any) => void
  applyPoisonEffect: (damagePerTurn?: number, turnsLeft?: number) => void
  setFightingEvent: (v: boolean) => void
  setEventPendingGold: (gold: number) => void
  addProficiency: (updates: any) => void
  activeEventBoss: Boss | null
  setActiveEventBoss: (boss: Boss | null) => void
  nextInstanceId: () => number
  buildEnemyCombatStates: (pool: Enemy[], count: number, depthMult: number, spawnTable?: any, room?: number, aiConfigs?: EnemyAiConfig[]) => EnemyCombatState[]
  aiConfigs: EnemyAiConfig[]
  // Callbacks
  onOpenRestConsumables: () => void
  onUseRestItem: (entryId: number) => void
  onExitDungeon: () => void
  // Rest consumables state
  showRestConsumables: boolean
  setShowRestConsumables: (v: boolean) => void
  restConsumables: any[]
  loadingRestItems: boolean
  usingRestItem: boolean
}

export function BetweenRoomsScreen({
  player, dungeon, boss, enemies,
  playerHP, playerStamina, playerMana,
  run, derived, itemInfoMap, lastLoot, isSaving,
  setPlayerHP, setPhase, setCurrentEnemy,
  initCombat, setStunnedEnemyIds, setBossInstanceId,
  addLoot, advanceRoom, setCurrentEvent, applyPoisonEffect,
  setFightingEvent, setEventPendingGold, activeEventBoss, setActiveEventBoss,
  addProficiency,
  nextInstanceId, buildEnemyCombatStates, aiConfigs,
  onOpenRestConsumables, onUseRestItem, onExitDungeon,
  showRestConsumables, setShowRestConsumables,
  restConsumables, loadingRestItems, usingRestItem,
}: BetweenRoomsScreenProps) {
  const [showRestItems, setShowRestItems] = useState(false)

  const depthMult = depthMultiplier(run.depth)
  const isBeforeBoss = run.currentRoom >= run.totalRooms

  function handleEnterRoom() {
    if (isBeforeBoss && !run.bossDefeated) {
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
          max_energy: boss.max_energy,
        },
        currentHP: scaledMaxHP,
        maxHP: scaledMaxHP,
        alive: true,
        aiState: (() => {
          const bossAiConfig = aiConfigs.find(c => c.entity_type === 'boss' && c.entity_id === boss.id)
          return { tier: bossAiConfig?.ai_tier ?? 'smart', energy: 0, maxEnergy: boss.max_energy, activePhaseOrder: 0, triggeredPhases: [], nextActionId: null }
        })(),
        statMults: null,
      }
      setStunnedEnemyIds([])
      setBossInstanceId(bossState.instanceId)
      initCombat(playerHP, playerStamina, playerMana, [bossState])
      setPhase('boss')
    } else {
      const count = rollEnemyCount(run.currentRoom + 1, dungeon.rank, run.depth)
      const roomEnemies = buildEnemyCombatStates(enemies, count, depthMult, dungeon.spawn_table, run.currentRoom + 1, aiConfigs)
      setCurrentEnemy(roomEnemies[0].enemy)
      setStunnedEnemyIds([])
      
      initCombat(playerHP, playerStamina, playerMana, roomEnemies)
      setPhase('in_combat')
    }
  }

  const [lastEventMsg, setLastEventMsg] = useState<string | null>(null)
  const [merchantGoldFlushed, setMerchantGoldFlushed] = useState(false)

  // Flush del gold del run una sola vez al abrir el mercader
  useEffect(() => {
    if (run.currentEvent?.type !== 'merchant' || merchantGoldFlushed) return
    const runGold = run.accumulatedLoot.gold
    if (runGold <= 0) { setMerchantGoldFlushed(true); return }
    flushRunGoldAction(runGold).then(result => {
      if (result.success) {
        addLoot({ gold: -runGold })
        setMerchantGoldFlushed(true)
      }
    })
  }, [run.currentEvent?.type])

  async function handleEventResolve(effect: EventEffect) {
    // Solo marcar como resuelto si no es una compra al mercader (el mercader se puede usar varias veces)
    const isMerchantPurchase = effect.goldCost !== undefined && !effect.startCombat
    if (!isMerchantPurchase) {
      setCurrentEvent({ ...run.currentEvent!, resolved: true })
    }

    if (effect.healHP) {
      const actual = Math.min(effect.healHP, derived.max_hp - playerHP)
      setPlayerHP(Math.min(playerHP + effect.healHP, derived.max_hp))
      if (actual > 0) setLastEventMsg(`✨ Absorbiste la energía del altar. +${actual} HP recuperado.`)
    }
    if (effect.gold) {
      addLoot({ gold: effect.gold })
      setLastEventMsg(`💰 Encontraste ${effect.gold} gold en el cofre!`)
      addProficiency({ chests_opened: 1 })
    }
    if (effect.goldCost && effect.itemBought) {
      addLoot({ gold: -effect.goldCost })
      buyMerchantItemAction(effect.itemBought, effect.goldCost).then(result => {
        if (!result.success) {
          addLoot({ gold: effect.goldCost! }) // revertir si falla
          setLastEventMsg(`❌ Error al comprar: ${result.error}`)
        }
      })
    }
    if (effect.poison) applyPoisonEffect(effect.poison.damagePerTurn, effect.poison.turnsLeft)
    if (effect.chestTrapGold) {
      // Guardar el gold para agregarlo cuando el mimico muera
      setEventPendingGold(effect.chestTrapGold)
    }
    if (effect.startCombat && effect.combatEnemies) {
      setFightingEvent(true)
      setCurrentEvent({ ...run.currentEvent!, resolved: true })
      initCombat(playerHP, playerStamina, playerMana, effect.combatEnemies)
      setPhase(effect.isBoss ? 'boss' : 'in_combat')
    }
  }

  const hasUnresolvedEvent = !!(run.currentEvent && !run.currentEvent.resolved)

  return (
    <div className="min-h-screen flex justify-center" style={{
      backgroundImage: `url(/sprites/backgrounds/${dungeon.background || 'Goblin_cave_bg.jpg'})`,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      <div className="w-full min-h-screen text-white p-4 flex flex-col gap-4 max-w-2xl" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>

        {/* Header */}
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
          {run.bossDefeated && (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-purple-600 transition-all duration-500"
                  style={{ width: `${Math.min(100, (run.depth / 20) * 100)}%` }}
                />
              </div>
              <span className="text-purple-400 text-xs font-bold whitespace-nowrap">{run.depth}/20</span>
            </div>
          )}
        </div>

        {/* Stats jugador */}
        <PlayerHUD
          name={player.name}
          playerHP={playerHP}
          playerStamina={playerStamina}
          playerMana={playerMana}
          maxHP={derived.max_hp}
          maxStamina={derived.max_stamina}
          maxMana={derived.max_mana}
          statusEffects={run.statusEffects}
        />

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
              {lastLoot.itemId
                ? <span className="text-green-400">🎁 {lastLoot.itemName ?? 'Item'}</span>
                : <span className="text-gray-500">Sin item</span>
              }
            </div>
          </div>
        )}

        {/* Resultado del último evento */}
        {lastEventMsg && (
          <div className="bg-yellow-950 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-300 font-bold text-sm">{lastEventMsg}</p>
          </div>
        )}

        {/* Evento aleatorio — sheet desde abajo */}
        {run.currentEvent && (
          <EventSheet
            visible={!run.currentEvent.resolved}
            event={run.currentEvent}
            playerHP={playerHP}
            maxHP={derived.max_hp}
            playerGold={player.gold + run.accumulatedLoot.gold}
            enemies={enemies}
            dungeon={dungeon}
            depthMult={depthMult}
            activeEventBoss={activeEventBoss}
            onSetGranGoblinBoss={setActiveEventBoss}
            onResolve={handleEventResolve}
            aiConfigs={aiConfigs}
          />
        )}

        {/* Acciones */}
        <div className="flex flex-col gap-3 mt-auto">
          <div className="flex gap-2">
            <button
              onClick={() => { setShowRestItems(v => !v); setShowRestConsumables(false) }}
              disabled={run.accumulatedLoot.items.length === 0}
              className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition text-sm"
            >
              🎒 Items ({run.accumulatedLoot.items.length})
            </button>
            <button
              onClick={() => { onOpenRestConsumables(); setShowRestItems(false) }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              🧪 Consumibles
            </button>
          </div>

          <button
            onClick={handleEnterRoom}
            disabled={hasUnresolvedEvent}
            className={`w-full font-bold py-4 rounded-lg transition text-lg ${
              isBeforeBoss && !run.bossDefeated
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : run.depth > 0
                ? 'bg-orange-600 hover:bg-orange-500 text-white'
                : 'bg-yellow-500 hover:bg-yellow-400 text-black'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isBeforeBoss && !run.bossDefeated ? '💀 Enfrentar al Boss' : '⚔️ Entrar a la sala'}
          </button>

          <button
            onClick={onExitDungeon}
            disabled={isSaving}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-bold py-3 rounded-lg transition"
          >
            {isSaving ? '💾 Guardando...' : `🚪 Salir${run.accumulatedLoot.gold > 0 ? ` (conservás ${run.accumulatedLoot.gold} gold)` : ''}`}
          </button>
        </div>
      </div>

      {/* Drawer: items conseguidos */}
      {showRestItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRestItems(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl p-5 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-green-400 text-lg">🎒 Items conseguidos</h3>
              <button onClick={() => setShowRestItems(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            {run.accumulatedLoot.items.length === 0
              ? <p className="text-gray-500 text-sm text-center py-4">Sin items todavía</p>
              : <div className="flex flex-col gap-2 overflow-y-auto">
                  {run.accumulatedLoot.items.map((itemId, i) => {
                    const info = itemInfoMap.get(itemId)
                    return (
                      <div key={i} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                        {info?.sprite
                          ? <img src={`/sprites/items/${info.sprite}`} alt={info.name} className="w-8 h-8 object-contain shrink-0" style={{ imageRendering: 'pixelated' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <span className="text-green-400 text-lg shrink-0">🎁</span>
                        }
                        <span className="text-white text-sm font-medium">{info?.name ?? `Item #${itemId}`}</span>
                      </div>
                    )
                  })}
                </div>
            }
          </div>
        </div>
      )}

      {/* Drawer: consumibles */}
      {showRestConsumables && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRestConsumables(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl p-5 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-blue-400 text-lg">🧪 Usar consumible</h3>
              <button onClick={() => setShowRestConsumables(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            {loadingRestItems && <p className="text-gray-400 text-sm text-center py-4">Cargando...</p>}
            {!loadingRestItems && restConsumables.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No tenés consumibles</p>}
            {!loadingRestItems && (
              <div className="flex flex-col gap-2 overflow-y-auto">
                {restConsumables.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => onUseRestItem(entry.id)}
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