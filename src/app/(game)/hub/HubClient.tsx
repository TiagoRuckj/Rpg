'use client'

import { useState, useRef } from 'react'
import { Player, InventoryEntry, deriveStatsWithGearAndClasses, calcClassBonuses, calcPlayerLevel, GameClass, EquippedGear, EMPTY_GEAR, critChance } from '@/types/game'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { healAction } from '@/actions/healAction'
import { calcHealCost } from '@/lib/game/combat'
import ShopClient from './ShopClient'
import InventoryClient from './InventoryClient'
import ClassesClient from './ClassesClient'
import StatsClient from './StatsClient'
import SkillsClient from './SkillsClient'
import { useToast, ToastContainer } from './Toast'

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
}

type View = 'hub' | 'stats' | 'shop' | 'inventory' | 'classes' | 'blacksmith' | 'skills'

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

export default function HubClient({ player, inventory: initialInventory, shopItems, unlockedClasses }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [view, setView] = useState<View>('hub')
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [inventory, setInventory] = useState(initialInventory)
  const [equippedSkills, setEquippedSkills] = useState<string[]>(player.equipped_skills ?? [])
  const { toasts, addToast } = useToast()

  const [healLoading, setHealLoading] = useState(false)

  async function handleHeal() {
    setHealLoading(true)
    const result = await healAction(derived.max_hp)
    if (result.success) {
      setCurrentPlayer(p => ({ ...p, current_hp: result.newHP!, gold: result.newGold! }))
      addToast(result.cost === 0 ? '❤️ Curado gratis!' : `❤️ Curado por ${result.cost} 💰`)
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
          // Si el max HP bajó por desequipar gear, capear el HP actual
          const updatedGear = getEquippedGear(updatedInventory)
          const equippedClassData = unlockedClasses.filter(c =>
            (currentPlayer.equipped_classes ?? []).includes(c.id)
          ) as GameClass[]
          const updatedClassBonuses = calcClassBonuses(currentPlayer.equipped_classes ?? [], equippedClassData)
          const newMaxHP = deriveStatsWithGearAndClasses(currentPlayer.primary_stats, updatedGear, updatedClassBonuses).max_hp
          const currentHPNow = (currentPlayer as any).current_hp ?? newMaxHP
          if (currentHPNow > newMaxHP) {
            const supabase = createClient()
            supabase.from('players').update({ current_hp: newMaxHP }).eq('id', currentPlayer.id)
            setCurrentPlayer(p => ({ ...p, current_hp: newMaxHP }))
          }
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
      <StatsClient
        player={currentPlayer}
        onBack={() => setView('hub')}
        onPlayerUpdate={(updated) => setCurrentPlayer(updated)}
      />
    )
  }

  if (view === 'blacksmith') {
    return (
      <div className="min-h-screen bg-gray-950 flex justify-center">
        <div className="w-full min-h-screen bg-gray-950 text-white p-4 max-w-2xl flex flex-col gap-4">
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

  if (view === 'skills') {
    return (
      <SkillsClient
        player={currentPlayer}
        onBack={() => setView('hub')}
        onPlayerUpdate={(updated) => {
          setCurrentPlayer(updated)
          setEquippedSkills(updated.equipped_skills ?? [])
        }}
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
  const healCost = calcHealCost(missingHP)
  const canHeal = missingHP > 0 && (healCost === 0 || currentPlayer.gold >= healCost)
  const crit = critChance(currentPlayer.primary_stats.suerte) + (classBonuses.crit_bonus ?? 0)
  const critPct = Math.min(crit, 1)
  const magicDmg = currentPlayer.primary_stats.inteligencia * 2

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-yellow-500 tracking-wide">⚔️ Ciudad Central</h1>
        <div className="flex items-center gap-4">
          <span className="text-yellow-400 font-bold">💰 {currentPlayer.gold}</span>
          <span className="text-purple-400 text-sm">✨ {currentPlayer.experience} EXP</span>
          <button onClick={handleLogout} className="text-gray-500 hover:text-white text-sm transition">Salir</button>
        </div>
      </div>





      <div className="flex flex-1 gap-0 overflow-hidden">

        {/* ── Columna izquierda: player card ── */}
        <div className="w-72 shrink-0 border-r border-gray-800 p-5 flex flex-col gap-5 overflow-y-auto">

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
                  src="/sprites/npc/altar.gif"
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
              { label: '⚔️ ATK',  value: String(derived.attack) },
              { label: '🛡️ DEF',  value: String(derived.defense) },
              { label: '🍀 CRIT', value: critPct >= 1 ? '100%' : `${(critPct * 100).toFixed(1)}%` },
              { label: '🔮 MAG',  value: String(magicDmg) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg px-3 py-2 flex justify-between">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-bold">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Columna derecha: menú ── */}
        <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">

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

          {/* Grid 3 columnas — fila 2 */}
          <div className="grid grid-cols-3 gap-3">
            <HubMenuCard icon="✨" title="Habilidades" sub={`${equippedSkills.length} equipadas`} onClick={() => setView('skills')} />
            <HubMenuCard icon="🏪" title="Tienda" sub={`${currentPlayer.gold} gold disponible`} onClick={() => setView('shop')} />
            <HubMenuCard icon="🔨" title="Herrero" sub="Mejorá tu equipo" onClick={() => setView('blacksmith')} />
          </div>

        </div>
      </div>
      <ToastContainer toasts={toasts} />

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