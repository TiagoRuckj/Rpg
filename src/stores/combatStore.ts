import { create } from 'zustand'
import { CombatState, EnemyCombatState, RunState, AccumulatedLoot, Enemy, BurnState, RoomEvent, PlayerPoisonState } from '@/types/game'
import { StatusEffect, applyBurn, applyPoison, toBurnStates, toPlayerPoisonState } from '@/lib/game/statusEffects'

interface CombatStore extends CombatState {
  // Run state
  run: RunState
  consecutiveBlocks: number
  stunnedEnemyIds: number[]   // instanceIds stunneados por martillo este turno
  burnStates: BurnState[]     // enemigos quemados con turnos restantes

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
  setBurnStates: (states: BurnState[]) => void
  setCurrentEvent: (event: RoomEvent | null) => void
  setTargetIndex: (index: number) => void
  setPoisonState: (state: PlayerPoisonState | null) => void
  // Nuevo sistema unificado
  setStatusEffects: (effects: StatusEffect[]) => void
  applyBurnEffect: (instanceId: number) => void
  applyPoisonEffect: (damagePerTurn?: number, turnsLeft?: number) => void

  // Run actions
  initRun: (totalRooms: number) => void
  setPhase: (phase: RunState['phase']) => void
  setCurrentEnemy: (enemy: Enemy | null) => void
  addLoot: (loot: Partial<AccumulatedLoot>) => void
  advanceRoom: () => void
  setBossDefeated: (val: boolean) => void
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
  poisonState: null,
  statusEffects: [],
}

export const useCombatStore = create<CombatStore>((set) => ({
  ...initialCombatState,
  run: initialRunState,
  consecutiveBlocks: 0,
  stunnedEnemyIds: [],
  burnStates: [],

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
    burnStates: [],
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
  setBurnStates: (states) => set({ burnStates: states }),
  setCurrentEvent: (event) => set((state) => ({ run: { ...state.run, currentEvent: event } })),
  setPoisonState: (poisonState) => set((state) => ({ run: { ...state.run, poisonState } })),

  // Nuevo sistema unificado de status effects
  setStatusEffects: (effects) => set((state) => ({
    run: {
      ...state.run,
      statusEffects: effects,
      // Mantener campos legacy sincronizados durante la migración
      poisonState: toPlayerPoisonState(effects),
    },
  })),
  applyBurnEffect: (instanceId) => set((state) => {
    const updated = applyBurn(instanceId, state.run.statusEffects)
    return {
      run: {
        ...state.run,
        statusEffects: updated,
        burnStates: toBurnStates(updated),
      },
    }
  }),
  applyPoisonEffect: (damagePerTurn = 10, turnsLeft = 5) => set((state) => {
    const updated = applyPoison(state.run.statusEffects, damagePerTurn, turnsLeft)
    return {
      run: {
        ...state.run,
        statusEffects: updated,
        poisonState: toPlayerPoisonState(updated),
      },
    }
  }),
  reset: () => set({ ...initialCombatState, run: initialRunState, consecutiveBlocks: 0, stunnedEnemyIds: [], burnStates: [] }),

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
    // Post-boss: cada sala completada sube la profundidad
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