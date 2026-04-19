'use client'

import { useState } from 'react'
import { Player, PrimaryStats, InventoryEntry, deriveStats, deriveStatsWithGear, deriveStatsWithGearAndClasses, calcClassBonuses, calcPlayerLevel, GameClass, EquippedGear, EMPTY_GEAR, statUpgradeCost, critChance } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ShopClient from './ShopClient'
import InventoryClient from './InventoryClient'
import ClassesClient from './ClassesClient'

type ClassData = {
  id: string
  name: string
  description: string
  bonuses: {
    attack?: number
    defense?: number
    crit_bonus?: number
    damage_vs?: { type: string; bonus: number }
  }
  unlock_condition: string
}

interface Props {
  player: Player
  inventory: InventoryEntry[]
  shopItems: import('@/types/game').Item[]
  unlockedClasses: ClassData[]
  healingMessage?: string | null
}

type View = 'hub' | 'stats' | 'shop' | 'inventory' | 'classes' | 'blacksmith'

function getEquippedGear(inventory: InventoryEntry[]): EquippedGear {
  const gear = { ...EMPTY_GEAR }
  const equipped = inventory.filter(e => e.equipped && e.item)
  for (const e of equipped) {
    const item = e.item!
    switch (item.type) {
      case 'weapon':   gear.weapon = item; break
      case 'necklace': gear.necklace = item; break
      case 'ring':
        if (!gear.ring1) gear.ring1 = item
        else gear.ring2 = item
        break
      case 'armor': {
        const slot = item.stats?.slot
        if (slot && slot in gear) (gear as any)[slot] = item
        break
      }
    }
  }
  return gear
}

export default function HubClient({ player, inventory: initialInventory, shopItems, unlockedClasses, healingMessage }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [view, setView] = useState<View>('hub')
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [inventory, setInventory] = useState(initialInventory)

  const [healLoading, setHealLoading] = useState(false)
  const [healMsg, setHealMsg] = useState<string | null>(null)

  async function handleHeal() {
    const missingHP = derived.max_hp - (currentPlayer as any).current_hp
    if (missingHP <= 0) return
    const cost = missingHP <= 100 ? 0 : Math.ceil((missingHP - 100) * 2)
    if (cost > 0 && currentPlayer.gold < cost) return
    setHealLoading(true)
    const { error } = await supabase
      .from('players')
      .update({
        current_hp: derived.max_hp,
        gold: currentPlayer.gold - cost,
      })
      .eq('id', currentPlayer.id)
    if (!error) {
      setCurrentPlayer(p => ({ ...p, current_hp: derived.max_hp, gold: p.gold - cost }))
      setHealMsg(cost === 0 ? '❤️ Curado gratis!' : `❤️ Curado por ${cost} 💰`)
      setTimeout(() => setHealMsg(null), 3000)
    }
    setHealLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (view === 'inventory') {
    return (
      <InventoryClient
        player={currentPlayer}
        inventory={inventory}
        onBack={() => setView('hub')}
        onInventoryUpdate={(updatedInventory) => {
          setInventory(updatedInventory)
        }}
      />
    )
  }

  if (view === 'shop') {
    return (
      <ShopClient
        player={currentPlayer}
        shopItems={shopItems}
        inventory={inventory}
        onBack={() => setView('hub')}
        onPlayerUpdate={(updatedPlayer, updatedInventory) => {
          setCurrentPlayer(updatedPlayer)
          setInventory(updatedInventory)
        }}
      />
    )
  }

  if (view === 'stats') {
    return (
      <StatsView
        player={currentPlayer}
        onBack={() => setView('hub')}
        onPlayerUpdate={(updated) => setCurrentPlayer(updated)}
      />
    )
  }

  if (view === 'blacksmith') {
    return (
      <div className="min-h-screen bg-black flex justify-center">
        <div className="w-full min-h-screen bg-gray-900 text-white p-4 max-w-2xl flex flex-col gap-4">
          <div className="flex items-center gap-4 border-b border-gray-800 pb-4">
            <button onClick={() => setView('hub')} className="text-gray-400 hover:text-white transition">← Volver</button>
            <h1 className="text-xl font-bold text-orange-400">🔨 Herrero</h1>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500">Próximamente...</p>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'classes') {
    return (
      <ClassesClient
        unlockedClasses={unlockedClasses}
        equippedClasses={currentPlayer.equipped_classes ?? []}
        playerId={currentPlayer.id}
        onBack={() => setView('hub')}
      />
    )
  }

  const gear = getEquippedGear(inventory)
  const equippedClassData = unlockedClasses.filter(c =>
    (currentPlayer.equipped_classes ?? []).includes(c.id)
  ) as GameClass[]
  const classBonuses = calcClassBonuses(currentPlayer.equipped_classes ?? [], equippedClassData)
  const derived = deriveStatsWithGearAndClasses(currentPlayer.primary_stats, gear, classBonuses)
  const currentHP = (currentPlayer as any).current_hp ?? derived.max_hp
  const missingHP = derived.max_hp - currentHP
  const healCost = missingHP <= 100 ? 0 : Math.ceil((missingHP - 100) * 2)
  const canHeal = missingHP > 0 && (healCost === 0 || currentPlayer.gold >= healCost)

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-yellow-500 tracking-wide">⚔️ Ciudad Central</h1>
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 font-bold">💰 {currentPlayer.gold}</span>
          <span className="text-purple-400 text-sm">✨ {currentPlayer.experience} EXP</span>
          <button onClick={handleLogout} className="text-gray-500 hover:text-white text-sm transition">Salir</button>
        </div>
      </div>

      {/* Mensaje de curación al volver del dungeon */}
      {healingMessage && (
        <div className="mx-6 mt-4 bg-green-900/50 border border-green-700 rounded-lg px-4 py-2 text-green-400 text-sm font-bold">
          {healingMessage}
        </div>
      )}

      {/* Feedback curación manual */}
      {healMsg && (
        <div className="mx-6 mt-4 bg-green-900/50 border border-green-700 rounded-lg px-4 py-2 text-green-400 text-sm font-bold">
          {healMsg}
        </div>
      )}

      <div className="flex flex-1 gap-0">

        {/* ── Columna izquierda: player card ── */}
        <div className="w-72 shrink-0 border-r border-gray-800 p-5 flex flex-col gap-5">

          {/* Identidad */}
          <div>
            <h2 className="text-lg font-bold text-white">{currentPlayer.name}</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Nv. {calcPlayerLevel(currentPlayer.primary_stats)}
              {currentPlayer.equipped_class && currentPlayer.equipped_class !== 'none' && (
                <span className="text-yellow-500 capitalize ml-2">· {currentPlayer.equipped_class}</span>
              )}
            </p>
          </div>

          {/* Stats vitales + altar */}
          <div className="flex flex-col gap-3">
            {/* HP */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-red-400 font-bold">HP</span>
                <span className="text-gray-400">{currentHP} / {derived.max_hp}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${Math.round((currentHP / derived.max_hp) * 100)}%` }} />
              </div>
            </div>

            {/* Altar de curación — siempre visible */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleHeal}
                disabled={!canHeal || healLoading}
                title={missingHP <= 0 ? 'HP al máximo' : healCost === 0 ? 'Curar gratis' : `Curar por ${healCost} 💰`}
                className={`transition rounded-lg ${
                  missingHP <= 0
                    ? 'opacity-40 cursor-default'
                    : canHeal
                    ? 'hover:scale-105 cursor-pointer drop-shadow-lg'
                    : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <img
                  src="/sprites/npc/altar.png"
                  alt="Altar"
                  className="w-20 h-20 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </button>
              <p className="text-xs text-gray-500">
                {healLoading
                  ? 'Curando...'
                  : missingHP <= 0
                  ? 'HP al máximo'
                  : healCost === 0
                  ? '✨ Curar gratis'
                  : `Curar · ${healCost} 💰`}
              </p>
            </div>

            {/* Stamina */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-yellow-400 font-bold">Stamina</span>
                <span className="text-gray-400">{derived.max_stamina}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>

            {/* Mana */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-blue-400 font-bold">Mana</span>
                <span className="text-gray-400">{derived.max_mana}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          {/* Stats secundarios */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: '⚔️ ATK', value: derived.attack },
              { label: '🛡️ DEF', value: derived.defense },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg px-3 py-2 flex justify-between">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-bold">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Columna derecha: menú ── */}
        <div className="flex-1 p-6 flex flex-col gap-4">

          {/* Dungeons — destacado */}
          <button
            onClick={() => router.replace('/dungeon')}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl p-5 text-left transition group"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">🗺️ Tablero de Dungeons</h3>
                <p className="text-black/60 text-sm mt-1">Seleccioná una dungeon y comenzá tu aventura</p>
              </div>
              <span className="text-3xl opacity-50 group-hover:opacity-100 transition">→</span>
            </div>
          </button>

          {/* Grid 3 columnas — fila 1 */}
          <div className="grid grid-cols-3 gap-3">
            <HubMenuCard icon="📊" title="Stats" sub={`${currentPlayer.experience} EXP disponible`} onClick={() => setView('stats')} />
            <HubMenuCard icon="⚔️" title="Clases" sub={`${unlockedClasses.length} desbloqueada${unlockedClasses.length !== 1 ? 's' : ''}`} onClick={() => setView('classes')} />
            <HubMenuCard icon="🎒" title="Inventario" sub="Equipo y objetos" onClick={() => setView('inventory')} />
          </div>

          {/* Grid 2 columnas — fila 2 */}
          <div className="grid grid-cols-2 gap-3">
            <HubMenuCard icon="🏪" title="Tienda" sub={`${currentPlayer.gold} gold disponible`} onClick={() => setView('shop')} />
            <HubMenuCard icon="🔨" title="Herrero" sub="Mejorá tu equipo" onClick={() => setView('blacksmith')} />
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── PANTALLA DE STATS ────────────────────────────────────────────────────────

const STAT_LABELS: Record<keyof PrimaryStats, { label: string; icon: string; description: string }> = {
  fortaleza:    { label: 'Fortaleza',    icon: '⚔️',  description: '+2 ataque por punto' },
  resistencia:  { label: 'Resistencia',  icon: '🛡️',  description: '+1 defensa, +5 stamina por punto' },
  vigor:        { label: 'Vigor',        icon: '❤️',  description: '+10 HP por punto' },
  inteligencia: { label: 'Inteligencia', icon: '🔮',  description: '+5 mana, +2 daño mágico por punto' },
  suerte:       { label: 'Suerte',       icon: '🍀',  description: '+0.5% crítico por punto' },
}

interface StatsViewProps {
  player: Player
  onBack: () => void
  onPlayerUpdate: (player: Player) => void
}

function StatsView({ player, onBack, onPlayerUpdate }: StatsViewProps) {
  const supabase = createClient()
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [upgrading, setUpgrading] = useState<keyof PrimaryStats | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const primary = currentPlayer.primary_stats
  const derived = deriveStats(primary)
  const crit = critChance(primary.suerte)
  const critDisplay = (crit * 100).toFixed(1)
  const overcritDisplay = crit > 1 ? ((crit - 1) * 100).toFixed(1) : null

  async function handleUpgrade(stat: keyof PrimaryStats) {
    const currentValue = primary[stat]
    if (currentValue >= 99) return

    const cost = statUpgradeCost(currentValue)
    if (currentPlayer.experience < cost) {
      setMessage({ text: `Necesitás ${cost} EXP para subir ${STAT_LABELS[stat].label}`, type: 'error' })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    setUpgrading(stat)

    const newPrimaryStats = { ...primary, [stat]: currentValue + 1 }
    const newExp = currentPlayer.experience - cost

    const { error } = await supabase
      .from('players')
      .update({
        primary_stats: newPrimaryStats,
        experience: newExp,
      })
      .eq('id', currentPlayer.id)

    if (error) {
      setMessage({ text: 'Error al guardar. Intentá de nuevo.', type: 'error' })
      setUpgrading(null)
      return
    }

    const updatedPlayer = {
      ...currentPlayer,
      primary_stats: newPrimaryStats,
      experience: newExp,
    }

    setCurrentPlayer(updatedPlayer)
    onPlayerUpdate(updatedPlayer)
    setMessage({ text: `✅ ${STAT_LABELS[stat].label} subió a ${currentValue + 1}!`, type: 'success' })
    setTimeout(() => setMessage(null), 2500)
    setUpgrading(null)
  }

  return (
    <div className="min-h-screen bg-black flex justify-center">
      <div className="w-full min-h-screen bg-gray-900 text-white max-w-5xl">

        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-gray-800">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition">← Volver</button>
          <h1 className="text-xl font-bold text-yellow-500">📊 Estadísticas</h1>
          <span className="ml-auto text-purple-400 font-bold">✨ {currentPlayer.experience} EXP</span>
        </div>

        {/* Mensaje feedback */}
        {message && (
          <div className={`mx-4 mt-3 rounded-lg p-3 text-center text-sm font-bold ${
            message.type === 'success' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Layout: 1 col stats derivados + 3 cols stats primarios */}
        <div className="flex h-full">

          {/* ── Columna izquierda: stats derivados ── */}
          <div className="w-1/4 min-h-screen border-r border-gray-800 p-4 flex flex-col gap-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Stats derivados</h2>

            {[
              { label: '❤️ HP máx',      value: derived.max_hp },
              { label: '⚡ Stamina máx', value: derived.max_stamina },
              { label: '🔮 Mana máx',    value: derived.max_mana },
              { label: '⚔️ Ataque',      value: derived.attack },
              { label: '🛡️ Defensa',     value: derived.defense },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3 flex justify-between items-center text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-bold">{value}</span>
              </div>
            ))}

            {/* Crítico */}
            <div className="bg-gray-800 rounded-lg p-3 flex justify-between items-center text-sm">
              <span className="text-gray-400">🍀 Crítico</span>
              <span className={`font-bold ${crit > 1 ? 'text-orange-400' : 'text-white'}`}>
                {crit >= 1 ? '100%' : `${critDisplay}%`}
                {overcritDisplay && (
                  <span className="text-orange-400 text-xs ml-1">(+{overcritDisplay}% OC)</span>
                )}
              </span>
            </div>
          </div>

          {/* ── 3 columnas derecha: stats primarios ── */}
          <div className="flex-1 p-4 flex flex-col gap-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Stats primarios</h2>

            <div className="grid grid-cols-1 gap-3">
              {(Object.keys(STAT_LABELS) as (keyof PrimaryStats)[]).map((stat) => {
                const currentValue = primary[stat]
                const cost = statUpgradeCost(currentValue)
                const canAfford = currentPlayer.experience >= cost
                const isMaxed = currentValue >= 99
                const isUpgrading = upgrading === stat

                return (
                  <div key={stat} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-bold text-white">
                          {STAT_LABELS[stat].icon} {STAT_LABELS[stat].label}
                        </span>
                        <p className="text-gray-500 text-xs mt-0.5">{STAT_LABELS[stat].description}</p>
                      </div>
                      <span className="text-2xl font-bold text-yellow-400">{currentValue}</span>
                    </div>

                    <div className="w-full bg-gray-700 rounded-full h-1.5 mb-3">
                      <div
                        className="bg-yellow-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(currentValue / 99) * 100}%` }}
                      />
                    </div>

                    <button
                      onClick={() => handleUpgrade(stat)}
                      disabled={!canAfford || isMaxed || upgrading !== null}
                      className={`w-full py-2 rounded-lg text-sm font-bold transition ${
                        isMaxed
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : canAfford
                          ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isMaxed
                        ? 'Máximo'
                        : isUpgrading
                        ? 'Subiendo...'
                        : canAfford
                        ? `Subir por ${cost} EXP`
                        : `Necesitás ${cost} EXP`}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function StatBar({ label, current, max, color }: {
  label: string; current: number; max: number; color: string
}) {
  const pct = Math.round((current / max) * 100)
  return (
    <div className="bg-gray-700 rounded p-3">
      <div className="flex justify-between mb-1">
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-white text-sm">{current}</p>
      </div>
      <div className="w-full bg-gray-600 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function HubMenuCard({ icon, title, sub, onClick }: {
  icon: string; title: string; sub: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-500 rounded-xl p-4 transition group w-full"
    >
      <span className="text-2xl">{icon}</span>
      <h3 className="font-bold text-white mt-2">{title}</h3>
      <p className="text-gray-500 text-xs mt-0.5 group-hover:text-gray-400 transition">{sub}</p>
    </button>
  )
}