'use client'

import { useRef, useEffect, useState } from 'react'
import { Player, Dungeon, Boss, Enemy, CombatAction, PlayerSkill, EnemyCombatState, RunState } from '@/types/game'
import { ItemUsed } from '@/actions/combatActions'
import { PlayerHUD } from './PlayerHUD'

// ─── Tipos de animación ───────────────────────────────────────────────────────

export type EnemyAnimState = 'idle' | 'hit' | 'crit' | 'dead'
export type PlayerAnimState = 'idle' | 'hit' | 'attack' | 'block'

interface CombatScreenProps {
  player: Player
  dungeon: Dungeon
  boss: Boss
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
  availableSkills: PlayerSkill[]
  showSkills: boolean
  showItems: boolean
  consumables: any[]
  loadingItems: boolean
  // Animaciones
  enemyAnimStates: Record<number, EnemyAnimState>
  playerAnimState: PlayerAnimState
  floatingDamages: Array<{ id: number; instanceId: number; value: number; isCrit: boolean; isPlayer: boolean }>
  combatPhase: 'idle' | 'player_acting' | 'enemy_acting' | 'phase_transition'
  // Callbacks
  onAction: (action: CombatAction, skill?: PlayerSkill, itemUsed?: ItemUsed) => void
  onSetTargetIndex: (idx: number) => void
  onSetShowSkills: (v: boolean) => void
  onOpenItems: () => void
  onUseItem: (entryId: number) => void
  onExitDungeon: () => void
  onReturnToHub: () => void
}

// ─── Daño flotante ────────────────────────────────────────────────────────────

function FloatingDamage({ value, isCrit, isPlayer }: { value: number; isCrit: boolean; isPlayer: boolean }) {
  return (
    <div
      className={`
        absolute left-1/2 -translate-x-1/2 pointer-events-none z-20
        font-black text-stroke animate-float-up
        ${isCrit
          ? 'text-yellow-300 text-2xl drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]'
          : isPlayer
            ? 'text-red-400 text-xl'
            : 'text-orange-400 text-xl'
        }
      `}
      style={{
        animation: 'floatUp 0.9s ease-out forwards',
        top: '-10px',
        textShadow: '0 2px 4px rgba(0,0,0,0.8)',
      }}
    >
      {isCrit && '⚡'}-{value}
    </div>
  )
}

// ─── Sprite enemigo con animación ─────────────────────────────────────────────

function EnemySprite({
  enemy, isTarget, isBossRoom, isBoss, hpPct, animState, floatingDmgs, onSelect, disabled,
}: {
  enemy: EnemyCombatState
  isTarget: boolean
  isBossRoom: boolean
  isBoss: boolean
  hpPct: number
  animState: EnemyAnimState
  floatingDmgs: Array<{ id: number; value: number; isCrit: boolean }>
  onSelect: () => void
  disabled: boolean
}) {
  const shakeClass = animState === 'hit' ? 'animate-shake' : ''
  const critClass  = animState === 'crit' ? 'animate-shake-hard' : ''
  const deadClass  = animState === 'dead'
    ? 'opacity-0 translate-y-8 scale-75 transition-all duration-700 pointer-events-none'
    : 'transition-all duration-300'
  const flashClass = (animState === 'hit' || animState === 'crit') ? 'brightness-150' : ''

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`
        bg-black/40 rounded-xl p-3 flex flex-col items-center gap-1 transition w-36 relative
        ${isTarget ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent' : 'hover:bg-black/60'}
        ${!disabled ? 'cursor-pointer' : 'cursor-default'}
        ${deadClass}
      `}
    >
      {isBoss && (
        <span className="text-xs bg-red-800 text-red-300 px-2 py-0.5 rounded font-bold">BOSS</span>
      )}

      {/* Daños flotantes */}
      <div className="relative w-full">
        {floatingDmgs.map(fd => (
          <FloatingDamage key={fd.id} value={fd.value} isCrit={fd.isCrit} isPlayer={false} />
        ))}
      </div>

      <div className={`relative ${shakeClass} ${critClass}`}>
        {/* Flash de daño */}
        {(animState === 'hit' || animState === 'crit') && (
          <div
            className="absolute inset-0 rounded-lg z-10 pointer-events-none"
            style={{
              background: animState === 'crit'
                ? 'radial-gradient(circle, rgba(250,204,21,0.4) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(239,68,68,0.35) 0%, transparent 70%)',
            }}
          />
        )}
        <img
          src="/sprites/enemies/SlimeBase_512x512.png"
          alt={enemy.enemy.name}
          className={`w-24 h-24 object-contain transition-all duration-150 ${isTarget ? 'opacity-100' : 'opacity-60'} ${flashClass}`}
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      <span className={`text-xs font-bold text-center ${isBoss ? 'text-red-400' : 'text-red-300'}`}>
        {enemy.enemy.name}{isTarget && ' 🎯'}
      </span>
      <div className="w-full bg-gray-600 rounded-full h-1.5 mt-1">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${isBoss ? 'bg-red-600' : 'bg-red-400'}`}
          style={{ width: `${hpPct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400">{enemy.currentHP}/{enemy.maxHP}</span>
    </button>
  )
}

// ─── Sprite jugador con animación ─────────────────────────────────────────────

function PlayerSprite({ name, animState, floatingDmgs }: {
  name: string
  animState: PlayerAnimState
  floatingDmgs: Array<{ id: number; value: number; isCrit: boolean }>
}) {
  const shakeClass = animState === 'hit' ? 'animate-shake' : ''

  return (
    <div className="bg-black/40 rounded-xl p-4 flex flex-col items-center gap-2 relative">
      {/* Daños flotantes */}
      <div className="relative w-full">
        {floatingDmgs.map(fd => (
          <FloatingDamage key={fd.id} value={fd.value} isCrit={fd.isCrit} isPlayer />
        ))}
      </div>

      {animState === 'hit' && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none z-10"
          style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%)' }}
        />
      )}

      <div className={`relative ${shakeClass}`}>
        <img
          src="/sprites/enemies/SlimeBase_512x512.png"
          alt={name}
          className="w-32 h-32 object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <span className="text-green-400 text-xs font-bold text-center">{name}</span>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CombatScreen({
  player, dungeon,
  playerHP, playerStamina, playerMana,
  turn, log, status, run, derived,
  isProcessing, isSaving, isBossRoom, isTraining,
  safeTargetIndex, aliveEnemies, targetEnemy,
  consecutiveBlocks, burnStates,
  availableSkills, showSkills, showItems, consumables, loadingItems,
  enemyAnimStates, playerAnimState, floatingDamages, combatPhase,
  onAction, onSetTargetIndex, onSetShowSkills, onOpenItems, onUseItem,
  onExitDungeon, onReturnToHub,
}: CombatScreenProps) {
  const logRef = useRef<HTMLDivElement>(null)
  // IDs de enemigos que ya terminaron su animación de muerte — se pueden ocultar
  const [finishedDying, setFinishedDying] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // Cuando un enemigo entra en animState 'dead', esperar que termine la animación CSS
  // (750ms) y recién entonces marcarlo como terminado para ocultarlo del DOM
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const [idStr, state] of Object.entries(enemyAnimStates)) {
      const id = Number(idStr)
      if (state === 'dead' && !finishedDying.has(id)) {
        const t = setTimeout(() => {
          setFinishedDying(prev => new Set(prev).add(id))
        }, 750)
        timers.push(t)
      }
    }
    // Resetear cuando se limpia el combate (nuevo combate o victoria)
    if (Object.keys(enemyAnimStates).length === 0 && finishedDying.size > 0) {
      setFinishedDying(new Set())
    }
    return () => timers.forEach(clearTimeout)
  }, [enemyAnimStates])

  const phaseLabel = combatPhase === 'player_acting'
    ? '⚔️ Tu turno...'
    : combatPhase === 'enemy_acting'
      ? '👹 Turno enemigo...'
      : combatPhase === 'phase_transition'
        ? '⚠️ Nueva fase...'
        : null

  return (
    <div className="min-h-screen flex" style={{
      backgroundImage: `url(/sprites/backgrounds/${dungeon.background || 'Goblin_cave_bg.jpg'})`,
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>

      {/* Zona izquierda — sprites enemigos */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col gap-3 items-center">
          {run.currentEnemies.map((e, idx) => {
            const animState = enemyAnimStates[e.instanceId] ?? 'idle'
            // Ocultar solo cuando: muerto Y animación dead ya terminó (o nunca hubo animación)
            if (!e.alive && !finishedDying.has(e.instanceId) && animState !== 'dead') return null
            if (!e.alive && finishedDying.has(e.instanceId)) return null
            const isDead = !e.alive
            const isTarget = idx === safeTargetIndex && !isDead
            const hpPct = Math.max(0, Math.round((e.currentHP / e.maxHP) * 100))
            const myFloats = floatingDamages
              .filter(f => f.instanceId === e.instanceId && !f.isPlayer)
              .map(f => ({ id: f.id, value: f.value, isCrit: f.isCrit }))

            return (
              <EnemySprite
                key={e.instanceId}
                enemy={e}
                isTarget={isTarget}
                isBossRoom={isBossRoom}
                isBoss={isBossRoom && idx === 0}
                hpPct={hpPct}
                animState={animState}
                floatingDmgs={myFloats}
                onSelect={() => !isProcessing && status === 'active' && !isDead && onSetTargetIndex(idx)}
                disabled={isProcessing || status !== 'active' || isDead}
              />
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
          {log.map((entry, i) => (
            <p key={i} className={`text-sm ${
              entry.includes('CRÍTICO') || entry.includes('OVERCRIT') ? 'text-yellow-400 font-bold' :
              entry.includes('👹') || entry.includes('💥') ? 'text-red-300' :
              entry.includes('⚔️') || entry.includes('✨') ? 'text-white' :
              entry.includes('🛡️') ? 'text-blue-300' :
              entry.includes('⚠️') || entry.includes('🔔') ? 'text-orange-400 font-bold' :
              'text-gray-300'
            }`}>{entry}</p>
          ))}
          {/* Indicador de fase activa */}
          {phaseLabel && (
            <p className="text-sm text-yellow-400 animate-pulse font-bold">{phaseLabel}</p>
          )}
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
          isBeingHit={playerAnimState === 'hit'}
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

        {/* Items */}
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

        {isTraining && status === 'active' && (
          <button onClick={onExitDungeon} disabled={isSaving}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 font-bold py-2 rounded-lg transition text-sm">
            {isSaving ? 'Saliendo...' : '🚪 Salir del entrenamiento'}
          </button>
        )}

        {/* Botones de acción — deshabilitados durante animaciones */}
        {status === 'active' && !showSkills && !showItems && (
          <div className="grid grid-cols-2 gap-3">
            <ActionButton label="⚔️ Atacar"     onClick={() => onAction('attack')}    disabled={isProcessing || combatPhase !== 'idle'} color="bg-red-600 hover:bg-red-500" />
            <ActionButton label="✨ Habilidades" onClick={() => onSetShowSkills(true)}  disabled={isProcessing || combatPhase !== 'idle'} color="bg-purple-600 hover:bg-purple-500" />
            <ActionButton
              label={`🛡️ Bloquear (${Math.round(Math.max(10, 95 - consecutiveBlocks * 15))}%)`}
              onClick={() => onAction('block')}
              disabled={isProcessing || combatPhase !== 'idle'}
              color="bg-blue-600 hover:bg-blue-500"
            />
            <ActionButton label="🎒 Item" onClick={onOpenItems} disabled={isProcessing || combatPhase !== 'idle'} color="bg-green-700 hover:bg-green-600" />
          </div>
        )}



        {status === 'defeat' && (
          <div className="bg-red-900 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">💀 Derrota</h2>
            <p className="mb-4 text-gray-400">Perdiste el loot de esta run</p>
            <button onClick={onReturnToHub} className="bg-red-500 text-white font-bold px-6 py-2 rounded-lg">Volver al Hub</button>
          </div>
        )}
      </div>

      {/* Zona derecha — sprite jugador */}
      <div className="flex-1 flex items-center justify-center p-4">
        <PlayerSprite
          name={player.name}
          animState={playerAnimState}
          floatingDmgs={floatingDamages
            .filter(f => f.isPlayer)
            .map(f => ({ id: f.id, value: f.value, isCrit: false }))}
        />
      </div>
    </div>
  )
}

function ActionButton({ label, onClick, disabled, color, subtitle }: {
  label: string; onClick: () => void; disabled: boolean; color: string; subtitle?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${color} text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center`}>
      <span>{label}</span>
      {subtitle && <span className="text-xs opacity-70 mt-1">{subtitle}</span>}
    </button>
  )
}