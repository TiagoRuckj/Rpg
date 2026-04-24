import { create } from 'zustand'
import { Player, InventoryEntry, Item, Dungeon, Enemy, Boss, EnemyAiConfig } from '@/types/game'

// Datos de cada "pantalla" — se populan desde el Server Component
export type GameView =
  | 'hub'
  | 'dungeon_board'
  | 'combat'

export interface CombatData {
  dungeon: Dungeon
  boss: Boss
  enemies: Enemy[]
  aiConfigs: EnemyAiConfig[]
  eventBosses: Boss[]
}

export interface DungeonBoardData {
  dungeons: Dungeon[]
  enemiesByDungeon: Record<number, Enemy[]>
  bossByDungeon: Record<number, Boss>
}

interface GameNavState {
  view: GameView
  player: Player | null
  inventory: InventoryEntry[]
  shopItems: Item[]
  unlockedClasses: any[]
  dungeonBoardData: DungeonBoardData | null
  combatData: CombatData | null

  // Acciones de navegación
  goToHub: () => void
  goToDungeonBoard: (data: DungeonBoardData) => void
  goToCombat: (data: CombatData) => void
  updatePlayer: (player: Player) => void
  updateInventory: (inventory: InventoryEntry[]) => void
}

export const useGameNav = create<GameNavState>((set) => ({
  view: 'hub',
  player: null,
  inventory: [],
  shopItems: [],
  unlockedClasses: [],
  dungeonBoardData: null,
  combatData: null,

  goToHub: () => set({ view: 'hub', combatData: null }),
  goToDungeonBoard: (data) => set({ view: 'dungeon_board', dungeonBoardData: data }),
  goToCombat: (data) => set({ view: 'combat', combatData: data }),
  updatePlayer: (player) => set({ player }),
  updateInventory: (inventory) => set({ inventory }),
}))