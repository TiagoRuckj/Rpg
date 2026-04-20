'use client'

import { useRef } from 'react'
import { Player, Dungeon, Boss, Enemy, CombatAction, PlayerSkill, EnemyCombatState, RunState, PlayerPoisonState } from '@/types/game'
import { ItemUsed } from '@/actions/combatActions'
import { PlayerHUD } from './PlayerHUD'

interface CombatScreenProps {
  player: Player
  dungeon: Dungeon
  boss: Boss
  // Store state
  playerHP: number
  playerStamina: number
  playerMana: number
  turn: number
  log: string[]
  status: 'idle' | 'active' | 'victory' | 'defeat'
  run: RunState
  derived: { max_hp: number; max_stamina: number; max_mana: number }
  isProcessing: boolean
  isSaving: boolean
  isBossRoom: boolean
  isTraining: boolean
  safeTargetIndex: number
  aliveEnemies: EnemyCombatState[]
  targetEnemy: EnemyCombatState | undefined
  consecutiveBlocks: number
  burnStates: { instanceId: number; turnsLeft: number }[]
  availableSkills: import('@/types/game').PlayerSkill[]
  showSkills: boolean
  showItems: boolean
  consumables: any[]
  loadingItems: boolean
  // Callbacks
  onAction: (action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) => void
  onSetTargetIndex: (idx: number) => void
  onSetShowSkills: (v: boolean) => void
  onOpenItems: () => void
  onUseItem: (entryId: number) => void
  onExitDungeon: () => void
  onReturnToHub: () => void
}

export function CombatScreen({
  player, dungeon,
  playerHP, playerStamina, playerMana,
  turn, log, status, run, derived,
  isProcessing, isSaving, isBossRoom, isTraining,
  safeTargetIndex, aliveEnemies, targetEnemy,
  consecutiveBlocks, burnStates,
  availableSkills, showSkills, showItems, consumables, loadingItems,
  onAction, onSetTargetIndex, onSetShowSkills, onOpenItems, onUseItem,
  onExitDungeon, onReturnToHub,
}: CombatScreenProps) {
  const logRef = useRef<HTMLDivElement>(null)

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
                onClick={() => !isProcessing && status === 'active' && onSetTargetIndex(idx)}
                disabled={isProcessing || status !== 'active'}
                className={`bg-black/40 rounded-xl p-3 flex flex-col items-center gap-1 transition w-36
                  ${isTarget ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent' : 'hover:bg-black/60'}
                  ${!isProcessing && status === 'active' ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {isBossRoom && <span className="text-xs bg-red-800 text-red-300 px-2 py-0.5 rounded font-bold">BOSS</span>}
                <img
                  src="/sprites/enemies/SlimeBase_512x512.png"
                  alt={e.enemy.name}
                  className={`w-24 h-24 object-contain transition-opacity ${isTarget ? 'opacity-100' : 'opacity-60'}`}
                  style={{ imageRendering: 'pixelated' }}
                />
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

      {/* Zona central */}
      <div className="w-full max-w-xl min-h-screen text-white p-4 flex flex-col gap-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>

        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-yellow-500">{dungeon.name}</h1>
          <span className="text-gray-400 text-sm">
            {isBossRoom ? '💀 Boss' : run.bossDefeated ? `⚔️ Prof. ${run.depth}` : `Sala ${Math.min(run.currentRoom + 1, run.totalRooms)}/${run.totalRooms}`} · Turno {turn}
          </span>
        </div>

        {/* HP objetivo */}
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
              <p className="text-xs text-gray-500 mt-1">{aliveEnemies.length} enemigos vivos — tocá uno para cambiar objetivo</p>
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

        {/* HUD jugador */}
        <PlayerHUD
          name={player.name}
          playerHP={playerHP}
          playerStamina={playerStamina}
          playerMana={playerMana}
          maxHP={derived.max_hp}
          maxStamina={derived.max_stamina}
          maxMana={derived.max_mana}
          poisonState={run.poisonState}
        />

        {/* Skills */}
        {showSkills && status === 'active' && (
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-purple-400">✨ Habilidades</h3>
              <button onClick={() => onSetShowSkills(false)} className="text-gray-400 hover:text-white text-sm">✕ Cerrar</button>
            </div>
            {availableSkills.map((skill) => {
              const canUse = playerStamina >= skill.stamina_cost && playerMana >= skill.mana_cost
              return (
                <button
                  key={skill.id}
                  onClick={() => onAction('skill', skill)}
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

        {/* Items en combate */}
        {showItems && status === 'active' && (
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-green-400">🎒 Consumibles</h3>
              <button onClick={() => onAction('attack')} className="text-gray-400 hover:text-white text-sm">✕ Cerrar</button>
            </div>
            {loadingItems && <p className="text-gray-400 text-sm text-center py-2">Cargando...</p>}
            {!loadingItems && consumables.length === 0 && <p className="text-gray-500 text-sm text-center py-2">No tenés consumibles</p>}
            {!loadingItems && consumables.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onUseItem(entry.id)}
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

        {/* Salir (training) */}
        {isTraining && status === 'active' && (
          <button
            onClick={onExitDungeon}
            disabled={isSaving}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-bold py-2 rounded-lg transition text-sm"
          >
            {isSaving ? 'Saliendo...' : '🚪 Salir del entrenamiento'}
          </button>
        )}

        {/* Botones de acción */}
        {status === 'active' && !showSkills && !showItems && (
          <div className="grid grid-cols-2 gap-3">
            <ActionButton label="⚔️ Atacar"     onClick={() => onAction('attack')}   disabled={isProcessing} color="bg-red-600 hover:bg-red-500" />
            <ActionButton label="✨ Habilidades" onClick={() => onSetShowSkills(true)} disabled={isProcessing} color="bg-purple-600 hover:bg-purple-500" />
            <ActionButton
              label={`🛡️ Bloquear (${Math.round(Math.max(10, 95 - consecutiveBlocks * 15))}%)`}
              onClick={() => onAction('block')}
              disabled={isProcessing}
              color="bg-blue-600 hover:bg-blue-500"
            />
            <ActionButton label="🎒 Item" onClick={onOpenItems} disabled={isProcessing} color="bg-green-700 hover:bg-green-600" />
          </div>
        )}

        {/* Victoria sala */}
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
            <button onClick={onReturnToHub} className="bg-red-500 text-white font-bold px-6 py-2 rounded-lg">
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

function ActionButton({ label, onClick, disabled, color, subtitle }: {
  label: string; onClick: () => void; disabled: boolean; color: string; subtitle?: string
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