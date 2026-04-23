import { create } from 'zustand'
import { CombatState, EnemyCombatState, RunState, AccumulatedLoot, Enemy, RoomEvent } from '@/types/game'
import { StatusEffect, applyBurn, applyPoison, getPlayerPoisonInfo } from '@/lib/game/statusEffects'

interface CombatStore extends CombatState {
  // Run state
  run: RunState
  consecutiveBlocks: number
  stunnedEnemyIds: number[]

  // Combat actions
  initCombat: (
    playerHP: number,
    playerStamina: number,
    playerMana: number,
    enemies: EnemyCombatState[]
  ) => void
  setPlayerHP: (hp: number) => void
  setEnemyHP: (instanceId: number, hp: number) => void
  setPlayerStamina: (stamina: number) => void
  setPlayerMana: (mana: number) => void
  setIsBlocking: (blocking: boolean) => void
  addLog: (message: string) => void
  nextTurn: () => void
  setStatus: (status: CombatState['status']) => void
  reset: () => void
  setConsecutiveBlocks: (n: number) => void
  setStunnedEnemyIds: (ids: number[]) => void
  setCurrentEvent: (event: RoomEvent | null) => void
  setTargetIndex: (index: number) => void
  setStatusEffects: (effects: StatusEffect[]) => void
  applyBurnEffect: (instanceId: number) => void
  applyPoisonEffect: (damagePerTurn?: number, turnsLeft?: number) => void
  setCurrentEnemies: (enemies: EnemyCombatState[] | ((prev: EnemyCombatState[]) => EnemyCombatState[])) => void

  // Sistema de turnos separados
  combatPhase: 'idle' | 'player_acting' | 'enemy_acting' | 'effects' | 'phase_transition'
  lastPlayerDamage: number
  lastEnemyDamages: Record<number, number>
  setCombatPhase: (phase: CombatStore['combatPhase']) => void
  setLastPlayerDamage: (dmg: number) => void
  setLastEnemyDamages: (dmgs: Record<number, number>) => void
  clearCombatAnimations: () => void

  // Run actions
  initRun: (totalRooms: number) => void
  setPhase: (phase: RunState['phase']) => void
  setCurrentEnemy: (enemy: Enemy | null) => void
  addLoot: (loot: Partial<AccumulatedLoot>) => void
  advanceRoom: () => void
  setBossDefeated: (val: boolean) => void
  setBossInstanceId: (instanceId: number | null) => void
  increaseDepth: () => void
}

const initialCombatState: CombatState = {
  playerHP: 100,
  playerStamina: 50,
  playerMana: 50,
  turn: 1,
  isPlayerTurn: true,
  isBlocking: false,
  log: [],
  status: 'idle',
}

const initialRunState: RunState = {
  currentRoom: 0,
  totalRooms: 0,
  phase: 'between_rooms',
  currentEnemy: null,
  currentEnemies: [],
  targetIndex: 0,
  accumulatedLoot: { exp: 0, gold: 0, items: [] },
  bossDefeated: false,
  depth: 0,
  currentEvent: null,
  statusEffects: [],
  bossInstanceId: null,
}

export const useCombatStore = create<CombatStore>((set) => ({
  ...initialCombatState,
  run: initialRunState,
  consecutiveBlocks: 0,
  stunnedEnemyIds: [],
  combatPhase: 'idle' as const,
  lastPlayerDamage: 0,
  lastEnemyDamages: {},

  // --- Combat ---
  initCombat: (playerHP, playerStamina, playerMana, enemies) => set((state) => ({
    ...initialCombatState,
    playerHP,
    playerStamina,
    playerMana,
    status: 'active',
    log: ['⚔️ ¡Comenzó el combate!'],
    consecutiveBlocks: 0,
    stunnedEnemyIds: [],
    run: {
      ...state.run,
      currentEnemies: enemies,
      targetIndex: 0,
    },
  })),

  setPlayerHP: (hp) => set({ playerHP: Math.max(0, hp) }),

  setEnemyHP: (instanceId, hp) => set((state) => ({
    run: {
      ...state.run,
      currentEnemies: state.run.currentEnemies.map(e =>
        e.instanceId === instanceId
          ? { ...e, currentHP: Math.max(0, hp), alive: hp > 0 }
          : e
      ),
    },
  })),

  setPlayerStamina: (stamina) => set({ playerStamina: Math.max(0, stamina) }),
  setPlayerMana: (mana) => set({ playerMana: Math.max(0, mana) }),
  setIsBlocking: (blocking) => set({ isBlocking: blocking }),
  addLog: (message) => set((state) => ({ log: [...state.log, message] })),
  nextTurn: () => set((state) => ({ turn: state.turn + 1, isPlayerTurn: !state.isPlayerTurn })),
  setStatus: (status) => set({ status }),
  setConsecutiveBlocks: (n) => set({ consecutiveBlocks: n }),
  setStunnedEnemyIds: (ids) => set({ stunnedEnemyIds: ids }),
  setCurrentEvent: (event) => set((state) => ({ run: { ...state.run, currentEvent: event } })),

  setStatusEffects: (effects) => set((state) => ({
    run: { ...state.run, statusEffects: effects },
  })),

  applyBurnEffect: (instanceId) => set((state) => ({
    run: {
      ...state.run,
      statusEffects: applyBurn(instanceId, state.run.statusEffects),
    },
  })),

  applyPoisonEffect: (damagePerTurn = 10, turnsLeft = 5) => set((state) => ({
    run: {
      ...state.run,
      statusEffects: applyPoison(state.run.statusEffects, damagePerTurn, turnsLeft),
    },
  })),

  setCurrentEnemies: (enemies) => set((state) => ({
    run: {
      ...state.run,
      currentEnemies: typeof enemies === 'function'
        ? enemies(state.run.currentEnemies)
        : enemies,
    },
  })),

  setCombatPhase: (phase) => set({ combatPhase: phase }),
  setLastPlayerDamage: (dmg) => set({ lastPlayerDamage: dmg }),
  setLastEnemyDamages: (dmgs) => set({ lastEnemyDamages: dmgs }),
  clearCombatAnimations: () => set({ lastPlayerDamage: 0, lastEnemyDamages: {} }),

  reset: () => set({
    ...initialCombatState,
    run: initialRunState,
    consecutiveBlocks: 0,
    stunnedEnemyIds: [],
    combatPhase: 'idle',
    lastPlayerDamage: 0,
    lastEnemyDamages: {},
  }),

  setTargetIndex: (index) => set((state) => ({
    run: { ...state.run, targetIndex: index },
  })),

  // --- Run ---
  initRun: (totalRooms) => set({
    ...initialCombatState,
    run: {
      ...initialRunState,
      totalRooms,
      phase: totalRooms > 0 ? 'between_rooms' : 'boss',
    },
  }),

  setPhase: (phase) => set((state) => ({
    run: { ...state.run, phase },
  })),

  setCurrentEnemy: (enemy) => set((state) => ({
    run: { ...state.run, currentEnemy: enemy },
  })),

  addLoot: (loot) => set((state) => ({
    run: {
      ...state.run,
      accumulatedLoot: {
        exp: state.run.accumulatedLoot.exp + (loot.exp ?? 0),
        gold: state.run.accumulatedLoot.gold + (loot.gold ?? 0),
        items: [...state.run.accumulatedLoot.items, ...(loot.items ?? [])],
      },
    },
  })),

  advanceRoom: () => set((state) => {
    const nextRoom = state.run.currentRoom + 1
    const newDepth = state.run.bossDefeated ? state.run.depth + 1 : state.run.depth
    return {
      run: {
        ...state.run,
        currentRoom: nextRoom,
        depth: newDepth,
        phase: 'between_rooms',
        currentEnemy: null,
        currentEnemies: [],
        targetIndex: 0,
        currentEvent: null,
      },
    }
  }),

  setBossDefeated: (val) => set((state) => ({
    run: { ...state.run, bossDefeated: val },
  })),

  setBossInstanceId: (instanceId) => set((state) => ({
    run: { ...state.run, bossInstanceId: instanceId },
  })),

  increaseDepth: () => set((state) => ({
    run: {
      ...state.run,
      depth: state.run.depth + 1,
      currentEnemy: null,
      currentEnemies: [],
      targetIndex: 0,
      phase: 'between_rooms',
      currentEvent: null,
    },
  })),
}))