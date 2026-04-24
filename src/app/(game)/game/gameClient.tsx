'use client'
import BgImage from '../hub/BgImage'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Player, InventoryEntry, Item } from '@/types/game'
import { CombatData, DungeonBoardData } from '@/stores/gameNavStore'
import HubClient from '../hub/HubClient'
import DungeonBoard from '../dungeon/DungeonBoard'
import CombatClient from '../dungeon/[id]/CombatClient'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

type GameView = 'hub' | 'dungeon_board' | 'combat'

interface Props {
  player: Player | null
  inventory: InventoryEntry[]
  shopItems: Item[]
  unlockedClasses: any[]
  activeDungeonId: number | null
}

// ─── Overlay de fade reutilizable ─────────────────────────────────────────────

function FadeOverlay({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 9999,
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.6s ease',
      pointerEvents: 'none'
    }} />
  )
}

// ─── Pantalla de auth ─────────────────────────────────────────────────────────

function AuthScreen() {
  const supabase = createClient()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [blackout, setBlackout] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) { setError(error.message); setLoading(false); return }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setError(error.message); setLoading(false); return }
      }
      // Fade a negro, luego recargar
      setBlackout(true)
      setTimeout(() => window.location.reload(), 600)
    } catch {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div
      className="h-screen flex items-center justify-center"
      
     style={{}}>
      <BgImage src="/sprites/backgrounds/hub_background.png" />
      <FadeOverlay visible={blackout} />

      <div
        className="w-full max-w-sm flex flex-col"
        style={{
          border: '4px solid #4a3000',
          boxShadow: '4px 4px 0 #000, inset 0 0 0 1px rgba(255,180,0,0.08)',
          background: 'rgba(10,5,2,0.95)'
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b-4 border-yellow-900 text-center"
          style={{ background: 'rgba(20,10,5,0.95)', boxShadow: '0 4px 0 #000' }}
        >
          <p className="text-3xl mb-1">⚔️</p>
          <h1
            className="text-yellow-400 font-bold uppercase tracking-widest text-base"
            style={{ ...MONO, textShadow: '2px 2px 0 #000' }}
          >
            RPG Dungeon
          </h1>
          <p className="text-yellow-800 text-xs mt-1" style={MONO}>
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </p>
        </div>

        {/* Formulario */}
        <div className="flex flex-col gap-3 p-6">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKey}
            className="w-full px-3 py-2 text-sm text-yellow-200 outline-none"
            style={{
              ...MONO,
              background: 'rgba(0,0,0,0.6)',
              border: '2px solid #4a3000',
              boxShadow: 'inset 2px 2px 0 #000'
            }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKey}
            className="w-full px-3 py-2 text-sm text-yellow-200 outline-none"
            style={{
              ...MONO,
              background: 'rgba(0,0,0,0.6)',
              border: '2px solid #4a3000',
              boxShadow: 'inset 2px 2px 0 #000'
            }}
          />

          {error && (
            <p className="text-xs px-3 py-2" style={{
              ...MONO, color: '#f87171',
              background: 'rgba(120,0,0,0.30)',
              border: '2px solid #7f1d1d',
              boxShadow: '2px 2px 0 #000'
            }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="w-full py-2.5 font-bold text-sm transition mt-1"
            style={{
              ...MONO,
              border: '4px solid #c8860a',
              background: loading ? 'rgba(20,10,5,0.5)' : 'rgba(100,65,0,0.85)',
              color: loading ? '#555' : '#ffd700',
              boxShadow: loading ? 'none' : '4px 4px 0 #000',
              textShadow: '1px 1px 0 #000',
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              opacity: !email || !password ? 0.5 : 1
            }}
          >
            {loading ? '...' : mode === 'login' ? '▶ Entrar' : '▶ Registrarse'}
          </button>

          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            className="text-xs transition mt-1 text-center"
            style={{ ...MONO, color: '#7a5a30' }}
          >
            {mode === 'login'
              ? '¿No tenés cuenta? → Registrate'
              : '¿Ya tenés cuenta? → Iniciá sesión'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── GameClient principal ─────────────────────────────────────────────────────

export default function GameClient({ player, inventory, shopItems, unlockedClasses, activeDungeonId }: Props) {
  const [view, setView] = useState<GameView>('hub')
  const [dungeonBoardData, setDungeonBoardData] = useState<DungeonBoardData | null>(null)
  const [combatData, setCombatData] = useState<CombatData | null>(null)
  const [loadingBoard, setLoadingBoard] = useState(false)
  const [loadingCombat, setLoadingCombat] = useState(!!activeDungeonId)
  const [combatInitiated, setCombatInitiated] = useState(false)
  const [fadeIn, setFadeIn] = useState(!!player)
  const [dungeonBoardKey, setDungeonBoardKey] = useState(0)
  const [boardClosing, setBoardClosing] = useState(false)

  // Disparar fade-in una sola vez al montar
  if (fadeIn) {
    setTimeout(() => setFadeIn(false), 50)
  }

  // Cargar combat data del active_run una sola vez
  if (activeDungeonId && !combatInitiated) {
    setCombatInitiated(true)
    fetch(`/api/dungeon/${activeDungeonId}/combat-data`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCombatData({
            ...data,
            eventBosses: data.eventBosses ?? [],
            aiConfigs: data.aiConfigs ?? [],
            enemies: data.enemies ?? [],
          })
          setView('combat')
        }
        setLoadingCombat(false)
      })
      .catch(() => setLoadingCombat(false))
  }

  const goToDungeonBoard = useCallback(async () => {
    if (dungeonBoardData) { setView('dungeon_board'); setDungeonBoardKey(k => k + 1); return }
    setLoadingBoard(true)
    try {
      const res = await fetch('/api/dungeon/board-data')
      if (res.ok) {
        const data = await res.json()
        setDungeonBoardData(data)
        setView('dungeon_board')
        setDungeonBoardKey(k => k + 1)
      }
    } finally {
      setLoadingBoard(false)
    }
  }, [dungeonBoardData])

  const goToCombat = useCallback((data: CombatData) => {
    setCombatData({
      ...data,
      eventBosses: data.eventBosses ?? [],
      aiConfigs: data.aiConfigs ?? [],
      enemies: data.enemies ?? [],
    })
    setView('combat')
  }, [])

  const goToHub = useCallback(() => setView('hub'), [])

  if (!player) return <AuthScreen />

  if (loadingCombat) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#0a0502' }}>
        <p className="text-yellow-600 text-sm" style={MONO}>Cargando partida...</p>
      </div>
    )
  }

  if (view === 'combat' && combatData) {
    return (
      <>
        <FadeOverlay visible={fadeIn} />
        <CombatClient
          player={player}
          dungeon={combatData.dungeon}
          boss={combatData.boss}
          enemies={combatData.enemies}
          aiConfigs={combatData.aiConfigs}
          eventBosses={combatData.eventBosses}
          onBack={goToHub}
          onBackToDungeonBoard={dungeonBoardData ? () => setView('dungeon_board') : goToDungeonBoard}
        />
      </>
    )
  }

  return (
    <>
      <FadeOverlay visible={fadeIn} />
      <style>{`
        @keyframes boardSlideDown {
          0%   { transform: translateY(-100%); animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          48%  { transform: translateY(0%);    animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          65%  { transform: translateY(-6%);   animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          79%  { transform: translateY(0%);    animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          89%  { transform: translateY(-2%);   animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          100% { transform: translateY(0%); }
        }
        @keyframes boardSlideUp {
          from { transform: translateY(0%); }
          to   { transform: translateY(-100%); }
        }
      `}</style>

      {/* Hub — siempre en el DOM */}
      <HubClient
        player={player}
        inventory={inventory}
        shopItems={shopItems}
        unlockedClasses={unlockedClasses}
        onGoToDungeon={loadingBoard ? undefined : goToDungeonBoard}
      />

      {/* DungeonBoard — encima del hub cuando está activo */}
      {view === 'dungeon_board' && dungeonBoardData && (
        <div
          key={dungeonBoardKey}
          style={{
            position: 'fixed', inset: 0,
            animationName: boardClosing ? 'boardSlideUp' : 'boardSlideDown',
            animationDuration: boardClosing ? '280ms' : '650ms',
            animationTimingFunction: boardClosing ? 'cubic-bezier(0.4, 0, 1, 1)' : 'linear',
            animationFillMode: 'forwards',
            borderBottom: '4px solid #4a3000',
            boxShadow: '0 4px 0 #000',
            zIndex: 50,
          }}
          onAnimationEnd={() => { if (boardClosing) { setBoardClosing(false); goToHub() } }}
        >
          <DungeonBoard
            dungeons={dungeonBoardData.dungeons}
            enemiesByDungeon={dungeonBoardData.enemiesByDungeon}
            bossByDungeon={dungeonBoardData.bossByDungeon}
            onBack={() => setBoardClosing(true)}
            onEnterDungeon={goToCombat}
          />
        </div>
      )}
    </>
  )
}