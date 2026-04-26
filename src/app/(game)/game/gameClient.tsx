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

// ─── Estilos compartidos del auth ────────────────────────────────────────────

const A = {
  border:      '#4a3000',
  borderGold:  '#c8860a',
  borderRed:   '#7f1d1d',
  bg:          'rgba(10,5,2,0.97)',
  bgInput:     'rgba(0,0,0,0.60)',
  bgBtn:       'rgba(100,65,0,0.85)',
  bgErr:       'rgba(120,0,0,0.30)',
  gold:        '#ffd700',
  goldDim:     '#7a5a30',
  shadow:      '4px 4px 0 #000',
  shadowSm:    '2px 2px 0 #000',
}

function AuthInput({ type, placeholder, value, onChange, onKeyDown }: {
  type: string; placeholder: string; value: string
  onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      autoComplete="off"
      className="w-full px-3 py-2.5 text-sm text-yellow-200 outline-none"
      style={{ ...MONO, background: A.bgInput, border: `2px solid ${A.border}`, boxShadow: `inset ${A.shadowSm}` }}
    />
  )
}

function AuthError({ msg }: { msg: string }) {
  return (
    <p className="text-xs px-3 py-2" style={{ ...MONO, color: '#f87171', background: A.bgErr, border: `2px solid ${A.borderRed}`, boxShadow: A.shadowSm }}>
      ⚠️ {msg}
    </p>
  )
}

function AuthBtn({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full py-3 font-bold text-sm transition mt-1"
      style={{
        ...MONO,
        border: `4px solid ${A.borderGold}`,
        background: loading || disabled ? 'rgba(20,10,5,0.5)' : A.bgBtn,
        color: loading || disabled ? '#555' : A.gold,
        boxShadow: loading || disabled ? 'none' : A.shadow,
        textShadow: '1px 1px 0 #000',
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? '...' : label}
    </button>
  )
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginForm({ onSwitch, onSuccess }: { onSwitch: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    onSuccess()
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin() }

  return (
    <div className="flex flex-col gap-3 p-6">
      <AuthInput type="email" placeholder="Email" value={email} onChange={setEmail} onKeyDown={onKey} />
      <AuthInput type="password" placeholder="Contraseña" value={password} onChange={setPassword} onKeyDown={onKey} />
      {error && <AuthError msg={error} />}
      <AuthBtn label="▶ Iniciar sesión" loading={loading} disabled={!email || !password} onClick={handleLogin} />
    </div>
  )
}

// ─── Register ─────────────────────────────────────────────────────────────────

function RegisterForm({ onSwitch, onSuccess }: { onSwitch: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    if (!username.trim()) { setError('Elegí un nombre de aventurero.'); return }
    if (username.trim().length < 3) { setError('El nombre debe tener al menos 3 caracteres.'); return }
    if (!email || !password) { setError('Completá todos los campos.'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username: username.trim() } }
    })
    if (error) { setError(error.message); setLoading(false); return }
    onSuccess()
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleRegister() }

  return (
    <div className="flex flex-col gap-3 p-6">
      <div>
        <label style={{ ...MONO, fontSize: '11px', color: A.goldDim, display: 'block', marginBottom: '4px' }}>
          Nombre de aventurero
        </label>
        <AuthInput type="text" placeholder="Ej: Kael, Mira, Thorin..." value={username} onChange={setUsername} onKeyDown={onKey} />
      </div>
      <div>
        <label style={{ ...MONO, fontSize: '11px', color: A.goldDim, display: 'block', marginBottom: '4px' }}>
          Email
        </label>
        <AuthInput type="email" placeholder="tu@email.com" value={email} onChange={setEmail} onKeyDown={onKey} />
      </div>
      <div>
        <label style={{ ...MONO, fontSize: '11px', color: A.goldDim, display: 'block', marginBottom: '4px' }}>
          Contraseña
        </label>
        <AuthInput type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={setPassword} onKeyDown={onKey} />
      </div>
      <div>
        <label style={{ ...MONO, fontSize: '11px', color: A.goldDim, display: 'block', marginBottom: '4px' }}>
          Confirmar contraseña
        </label>
        <AuthInput type="password" placeholder="Repetí la contraseña" value={confirm} onChange={setConfirm} onKeyDown={onKey} />
      </div>
      {error && <AuthError msg={error} />}
      <AuthBtn label="▶ Crear cuenta" loading={loading} disabled={!username || !email || !password || !confirm} onClick={handleRegister} />
      <button onClick={onSwitch} className="text-xs text-center mt-1 transition" style={{ ...MONO, color: A.goldDim }}>
        ¿Ya tenés cuenta? → Iniciá sesión
      </button>
    </div>
  )
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

function AuthScreen() {
  const [showRegister, setShowRegister] = useState(false)
  const [blackout, setBlackout] = useState(false)

  function handleSuccess() {
    setBlackout(true)
    setTimeout(() => window.location.reload(), 600)
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-6" style={{ paddingBottom: '8vh' }}>
      <BgImage src="/sprites/backgrounds/login_background.png" />
      <FadeOverlay visible={blackout} />

      <style>{`
        @keyframes logoDown {
          0%   { transform: translateY(-40px); opacity: 0; }
          100% { transform: translateY(0px);   opacity: 1; }
        }
        @keyframes panelUp {
          0%   { transform: translateY(40px); opacity: 0; }
          100% { transform: translateY(0px);  opacity: 1; }
        }
        @keyframes modalIn {
          0%   { opacity: 0; scale: 0.96; }
          100% { opacity: 1; scale: 1; }
        }
      `}</style>

      {/* Logo */}
      <img
        src="/sprites/backgrounds/title.png"
        alt="RPG Dungeon"
        style={{
          imageRendering: 'pixelated',
          maxWidth: '1020px',
          width: '90%',
          filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.9))',
          animation: 'logoDown 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        }}
      />

      {/* Panel login */}
      <div style={{
        width: '100%', maxWidth: '420px',
        border: `4px solid ${A.border}`,
        boxShadow: `${A.shadow}, inset 0 0 0 1px rgba(255,180,0,0.06)`,
        background: A.bg,
        animation: 'panelUp 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      }}>
        {/* Header login */}
        <div className="flex items-center justify-between px-5 py-3 border-b-4" style={{ borderColor: A.border, background: 'rgba(20,10,2,0.95)' }}>
          <span style={{ ...MONO, color: A.gold, fontWeight: 'bold', fontSize: '14px', textShadow: '1px 1px 0 #000' }}>🗝️ Iniciar sesión</span>
          <button
            onClick={() => setShowRegister(true)}
            className="text-xs font-bold transition px-3 py-1.5"
            style={{ ...MONO, border: `2px solid ${A.border}`, background: 'rgba(40,20,0,0.7)', color: A.goldDim }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = A.borderGold; e.currentTarget.style.color = A.gold }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = A.border; e.currentTarget.style.color = A.goldDim }}
          >
            📜 Registrarse →
          </button>
        </div>
        <LoginForm onSwitch={() => setShowRegister(true)} onSuccess={handleSuccess} />
      </div>

      {/* Modal de registro — flotante con overlay */}
      {showRegister && (
        <>
          {/* Overlay oscuro */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setShowRegister(false)}
          />
          {/* Modal */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%', zIndex: 50,
            translate: '-50% -50%',
            width: '90%', maxWidth: '440px',
            border: `4px solid ${A.borderGold}`,
            outline: `2px solid rgba(200,134,10,0.25)`,
            outlineOffset: '4px',
            boxShadow: `${A.shadow}, 0 0 32px rgba(200,134,10,0.20), 0 0 80px rgba(0,0,0,0.60)`,
            background: A.bg,
            animation: 'modalIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}>
            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-3 border-b-4" style={{ borderColor: A.borderGold, background: 'rgba(20,10,2,0.95)' }}>
              <span style={{ ...MONO, color: A.gold, fontWeight: 'bold', fontSize: '14px', textShadow: '1px 1px 0 #000' }}>📜 Crear cuenta</span>
              <button
                onClick={() => setShowRegister(false)}
                style={{ ...MONO, color: A.goldDim, fontSize: '20px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = A.gold}
                onMouseLeave={e => e.currentTarget.style.color = A.goldDim}
              >✕</button>
            </div>
            <RegisterForm onSwitch={() => setShowRegister(false)} onSuccess={handleSuccess} />
          </div>
        </>
      )}
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