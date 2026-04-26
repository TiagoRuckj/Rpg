'use client'
import BgImage from './BgImage'

import { useState, useRef, useEffect } from 'react'
import { Player, InventoryEntry, deriveStatsWithGearAndClasses, calcClassBonuses, calcPlayerLevel, GameClass, EquippedGear, EMPTY_GEAR, calcUpgradeBonus } from '@/types/game'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { healAction } from '@/actions/healAction'
import { calcHealCost } from '@/lib/game/combat'
import ShopClient from './ShopClient'
import InventoryClient from './InventoryClient'
import ClassesClient from './ClassesClient'
import StatsClient from './StatsClient'
import SkillsClient from './SkillsClient'
import SmithClient from './SmithClient'
import AchievementsClient from './AchievementsClient'
import { useToast, ToastContainer } from './Toast'
import { MONO, pixelCard, pixelCardBase, pixelCardHover, pixelDungeonBtn, pixelDungeonBtnBase, pixelDungeonBtnHover } from './pixelStyles'


// ─── Animación de entrada/salida para sub-vistas ──────────────────────────────

function SubView({ children, closing, onClosed }: {
  children: React.ReactNode
  closing: boolean
  onClosed: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100, overflow: 'hidden',
        borderBottom: '4px solid #4a3000',
        boxShadow: '0 4px 0 #000',
        animation: closing
          ? 'subViewUp 0.28s cubic-bezier(0.4, 0, 1, 1) forwards'
          : 'subViewDown 650ms cubic-bezier(0.215, 0.61, 0.355, 1) forwards',
      }}
      onAnimationEnd={() => { if (closing) onClosed() }}
    >
      <style>{`
        @keyframes subViewDown {
          0%        { transform: translateY(-100%); animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          48%       { transform: translateY(0%);    animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          65%       { transform: translateY(-6%);   animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          79%       { transform: translateY(0%);    animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
          89%       { transform: translateY(-2%);   animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }
          100%      { transform: translateY(0%); }
        }
        @keyframes subViewUp {
          from { transform: translateY(0%); }
          to   { transform: translateY(-100%); }
        }
      `}</style>
      {children}
    </div>
  )
}

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
  onGoToDungeon?: () => void
}

type View = 'hub' | 'stats' | 'shop' | 'inventory' | 'classes' | 'blacksmith' | 'skills' | 'achievements'

function getEquippedGear(inventory: InventoryEntry[]): EquippedGear {
  const gear = { ...EMPTY_GEAR }
  const equipped = inventory.filter(e => e.equipped && e.item)
  for (const e of equipped) {
    const item = e.item!
    const equippedItem = { item, upgradeLevel: e.upgrade_level ?? 0, instancePassives: e.instance_passives ?? [] }
    switch (item.type) {
      case 'weapon':   gear.weapon = equippedItem; break
      case 'necklace': gear.necklace = equippedItem; break
      case 'ring':
        if (!gear.ring1) gear.ring1 = equippedItem
        else gear.ring2 = equippedItem
        break
      case 'armor': {
        const slot = item.stats?.slot
        if (slot && slot in gear) (gear as any)[slot] = equippedItem
        break
      }
    }
  }
  return gear
}

export default function HubClient({ player, inventory: initialInventory, shopItems, unlockedClasses, onGoToDungeon }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [view, setView] = useState<View>('hub')
  const [closing, setClosing] = useState(false)

  function goBack() { setClosing(true) }
  function handleClosed() { setClosing(false); setView('hub') }
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [inventory, setInventory] = useState(initialInventory)
  const [equippedSkills, setEquippedSkills] = useState<string[]>(player.equipped_skills ?? [])
  const [equippedClassIds, setEquippedClassIds] = useState<string[]>(player.equipped_classes ?? [])
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

  const gear = getEquippedGear(inventory)
  const equippedClassData = unlockedClasses.filter(c => equippedClassIds.includes(c.id)) as GameClass[]
  const classBonuses = calcClassBonuses(equippedClassIds, equippedClassData)
  const derived = deriveStatsWithGearAndClasses(currentPlayer.primary_stats, gear, classBonuses)
  const currentHP = Math.min((currentPlayer as any).current_hp ?? derived.max_hp, derived.max_hp)
  const missingHP = derived.max_hp - currentHP
  const healCost = calcHealCost(missingHP)
  const canHeal = missingHP > 0 && (healCost === 0 || currentPlayer.gold >= healCost)
  const crit = derived.crit_chance + (classBonuses.crit_bonus ?? 0)
  const overcritPct = crit > 1.0 ? crit - 1.0 : 0
  const critDisplay = crit >= 1.0
    ? overcritPct > 0
      ? `100% / ⚡${(overcritPct * 100).toFixed(1)}% OC`
      : '100%'
    : `${(crit * 100).toFixed(1)}%`

  const achievementBonus = currentPlayer.achievement_bonus
  // Daño crítico base: 75% + bonuses de logros + clases + arco
  const bowCritDmgBonus = gear.weapon?.item.stats?.weapon_type === 'bow' ? 0.25 : 0
  const baseCritDmg = 0.75 + (achievementBonus?.crit_mult ?? 0) + (classBonuses.crit_mult_bonus ?? 0) + bowCritDmgBonus
  const critDmgDisplay = `+${Math.round(baseCritDmg * 100)}%`

  // Daño mágico: inteligencia × 2 + staff bonus si hay bastón equipado
  const staffAttack = gear.weapon?.item.stats?.weapon_type === 'staff'
    ? (gear.weapon.item.stats?.attack ?? 0) + calcUpgradeBonus(gear.weapon.item.stats?.attack ?? 0, gear.weapon.upgradeLevel)
    : 0
  const magicDmg = currentPlayer.primary_stats.inteligencia * 2 + staffAttack * 2


  return (
    <div className="h-screen text-white flex flex-col overflow-hidden" style={{ backgroundImage: 'url(/sprites/backgrounds/hub_background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-3 border-b-4 border-yellow-900" style={{ background: 'rgba(20,10,5,0.82)', boxShadow: '0 4px 0 #000' }}>
        <h1 className="text-lg font-bold text-yellow-400 tracking-widest uppercase" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>⚔️ Ciudad Central</h1>
        <div className="flex items-center gap-6">
          <span className="text-yellow-400 font-bold" style={{ fontFamily: 'monospace', textShadow: '1px 1px 0 #000' }}>💰 {currentPlayer.gold}</span>
          <span className="text-purple-300 text-sm" style={{ fontFamily: 'monospace', textShadow: '1px 1px 0 #000' }}>✨ {currentPlayer.experience} EXP</span>
          <button onClick={handleLogout} className="text-gray-300 hover:text-white text-sm transition" style={{ fontFamily: 'monospace' }}>[ Salir ]</button>
        </div>
      </div>

      <div className="flex flex-1 gap-0 overflow-hidden">

        {/* Columna izquierda */}
        <div className="w-72 shrink-0 p-4 flex flex-col gap-4 border-r-4 border-yellow-900" style={{ background: 'rgba(20,10,5,0.80)', boxShadow: '4px 0 0 #000' }}>

          {/* Identidad */}
          <div className="border-b-2 border-yellow-900 pb-3">
            <h2 className="font-bold text-yellow-300 uppercase tracking-wider" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>{currentPlayer.name}</h2>
            <p className="text-yellow-700 text-xs mt-0.5" style={{ fontFamily: 'monospace' }}>
              Nv. {calcPlayerLevel(currentPlayer.primary_stats)}
              {currentPlayer.equipped_class && currentPlayer.equipped_class !== 'none' && (
                <span className="text-yellow-500 capitalize ml-2">· {currentPlayer.equipped_class}</span>
              )}
            </p>
          </div>

          {/* HP */}
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'monospace' }}>
              <span className="text-red-400 font-bold">HP</span>
              <span className="text-red-300">{currentHP} / {derived.max_hp}</span>
            </div>
            <div className="w-full h-3 border-2 border-black" style={{ background: '#300' }}>
              <div className="h-full transition-all" style={{ width: `${Math.round((currentHP / derived.max_hp) * 100)}%`, background: '#e33', boxShadow: '0 0 0 1px #f66 inset' }} />
            </div>
          </div>

          {/* Stamina */}
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'monospace' }}>
              <span className="text-yellow-400 font-bold">Stamina</span>
              <span className="text-yellow-300">{derived.max_stamina}</span>
            </div>
            <div className="w-full h-3 border-2 border-black" style={{ background: '#220' }}>
              <div className="h-full" style={{ width: '100%', background: '#cc0', boxShadow: '0 0 0 1px #ff0 inset' }} />
            </div>
          </div>

          {/* Mana */}
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'monospace' }}>
              <span className="text-blue-400 font-bold">Mana</span>
              <span className="text-blue-300">{derived.max_mana}</span>
            </div>
            <div className="w-full h-3 border-2 border-black" style={{ background: '#003' }}>
              <div className="h-full" style={{ width: '100%', background: '#33f', boxShadow: '0 0 0 1px #66f inset' }} />
            </div>
          </div>

          {/* Stats secundarios */}
          <div className="flex flex-col gap-1 text-xs" style={{ fontFamily: 'monospace' }}>
            {[
              { label: '⚔ ATK', value: String(derived.attack), color: 'text-orange-300' },
              { label: '🛡 DEF', value: String(derived.defense), color: 'text-blue-300' },
              { label: '🍀 CRIT', value: `${(crit * 100).toFixed(1)}%`, color: crit > 1.0 ? 'text-yellow-400' : 'text-white' },
              { label: '⚡ CRIT DMG', value: critDmgDisplay, color: 'text-yellow-300' },
              { label: '🔮 MAG', value: String(magicDmg), color: 'text-purple-300' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center px-2 py-1 border-2 border-black" style={{ background: 'rgba(0,0,0,0.5)', boxShadow: '2px 2px 0 #000' }}>
                <span className="text-gray-400">{label}</span>
                <span className={`font-bold ${color}`} style={{ textShadow: '1px 1px 0 #000' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Altar — centrado, grande, con borde pixel art */}
          <div className="flex-1 flex flex-col items-center justify-center gap-2 border-t-2 border-yellow-900 pt-3">
            <button
              onClick={handleHeal}
              disabled={!canHeal || healLoading}
              title={missingHP <= 0 ? 'HP al máximo' : healCost === 0 ? 'Curar gratis' : `Curar por ${healCost} 💰`}
              className={`transition-transform ${missingHP <= 0 ? 'opacity-40 cursor-default' : canHeal ? 'hover:scale-110 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
              style={{
                border: '4px solid #4a3000',
                boxShadow: '4px 4px 0 #000, inset 0 0 0 1px rgba(255,180,0,0.08)',
                padding: '8px',
                background: 'rgba(20,10,5,0.6)',
              }}
            >
              <img src="/sprites/npc/altar.gif" alt="Altar" className="w-48 h-48 object-contain" style={{ imageRendering: 'pixelated' }} />
            </button>
            <p className="text-xs text-yellow-700 text-center" style={{ fontFamily: 'monospace' }}>
              {healLoading ? 'Curando...' : missingHP <= 0 ? 'HP al máximo' : healCost === 0 ? '✨ Curar gratis' : `Curar · ${healCost} 💰`}
            </p>
          </div>
        </div>

        {/* Columna derecha */}
        <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">

          {/* Dungeons */}
          <button
            onClick={() => onGoToDungeon ? onGoToDungeon() : router.replace('/dungeon')}
            className="w-full text-left transition-all duration-150 group"
            style={{
              background: 'rgba(120,80,0,0.75)',
              border: '4px solid #8B6914',
              boxShadow: '4px 4px 0 #000, inset 0 0 0 2px rgba(255,200,0,0.15)',
              padding: '16px 20px',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget
              el.style.background = 'rgba(180,120,0,0.85)'
              el.style.borderColor = '#f0b030'
              el.style.boxShadow = '4px 4px 0 #000, inset 0 0 16px rgba(255,200,0,0.30), 0 0 12px rgba(255,180,0,0.4)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget
              el.style.background = 'rgba(120,80,0,0.75)'
              el.style.borderColor = '#8B6914'
              el.style.boxShadow = '4px 4px 0 #000, inset 0 0 0 2px rgba(255,200,0,0.15)'
            }}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-yellow-300 uppercase tracking-widest" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>🗺 Tablero de Dungeons</h3>
                <p className="text-yellow-700 text-xs mt-1" style={{ fontFamily: 'monospace' }}>Seleccioná una dungeon y comenzá tu aventura</p>
              </div>
              <span className="text-yellow-400 text-2xl group-hover:translate-x-1 transition" style={{ textShadow: '2px 2px 0 #000' }}>▶</span>
            </div>
          </button>

          {/* Grid botones */}
          <div className="grid grid-cols-3 gap-3">
            <HubMenuCard icon="📊" title="Stats" sub={`${currentPlayer.experience} EXP disponible`} onClick={() => setView('stats')} />
            <HubMenuCard icon="🏅" title="Títulos" sub={`${unlockedClasses.length} desbloqueado${unlockedClasses.length !== 1 ? 's' : ''}`} onClick={() => setView('classes')} />
            <HubMenuCard icon="🎒" title="Inventario" sub="Equipo y objetos" onClick={() => setView('inventory')} />
            <HubMenuCard icon="✨" title="Habilidades" sub={`${equippedSkills.length} equipadas`} onClick={() => setView('skills')} />
            <HubMenuCard icon="🏪" title="Tienda" sub={`${currentPlayer.gold} gold disponible`} onClick={() => setView('shop')} />
            <HubMenuCard icon="🔨" title="Herrero" sub="Mejorá tu equipo" onClick={() => setView('blacksmith')} />
            <HubMenuCard icon="🏆" title="Logros" sub="Estadísticas y recompensas" onClick={() => setView('achievements')} />
          </div>

        </div>
      </div>
      <ToastContainer toasts={toasts} />
      {/* Sub-vistas — encima del hub sin desmontarlo */}
      {view !== 'hub' && (
        <SubView closing={closing} onClosed={handleClosed}>
          {view === 'inventory' && (
            <InventoryClient
              player={currentPlayer}
              inventory={inventory}
              onBack={goBack}
              onInventoryUpdate={(updatedInventory) => {
                setInventory(updatedInventory)
                const updatedGear = getEquippedGear(updatedInventory)
                const equippedClassData = unlockedClasses.filter(c => equippedClassIds.includes(c.id)) as GameClass[]
                const updatedClassBonuses = calcClassBonuses(equippedClassIds, equippedClassData)
                const newMaxHP = deriveStatsWithGearAndClasses(currentPlayer.primary_stats, updatedGear, updatedClassBonuses).max_hp
                const currentHPNow = (currentPlayer as any).current_hp ?? newMaxHP
                if (currentHPNow > newMaxHP) {
                  const supabase = createClient()
                  supabase.from('players').update({ current_hp: newMaxHP }).eq('id', currentPlayer.id)
                  setCurrentPlayer((p: any) => ({ ...p, current_hp: newMaxHP }))
                }
              }}
            />
          )}
          {view === 'shop' && (
            <ShopClient
              player={currentPlayer}
              shopItems={shopItems}
              inventory={inventory}
              onBack={goBack}
              onPlayerUpdate={(updatedPlayer, updatedInventory) => {
                setCurrentPlayer(updatedPlayer)
                setInventory(updatedInventory)
              }}
            />
          )}
          {view === 'stats' && (
            <StatsClient
              player={currentPlayer}
              onBack={goBack}
              onPlayerUpdate={(updated) => setCurrentPlayer(updated)}
            />
          )}
          {view === 'blacksmith' && (
            <SmithClient
              player={currentPlayer}
              inventory={inventory}
              onBack={goBack}
              onPlayerUpdate={(p) => setCurrentPlayer(p)}
              onInventoryUpdate={(inv) => setInventory(inv)}
            />
          )}
          {view === 'achievements' && (
            <AchievementsClient
              player={currentPlayer}
              onBack={goBack}
            />
          )}
          {view === 'classes' && (
            <ClassesClient
              unlockedClasses={unlockedClasses}
              equippedClasses={equippedClassIds}
              playerId={currentPlayer.id}
              onBack={goBack}
              onEquippedClassesChange={setEquippedClassIds}
            />
          )}
          {view === 'skills' && (
            <SkillsClient
              key={currentPlayer.equipped_skills?.join(',') ?? ''}
              player={currentPlayer}
              onBack={goBack}
              onPlayerUpdate={(updated) => {
                setCurrentPlayer(updated)
                setEquippedSkills(updated.equipped_skills ?? [])
              }}
            />
          )}
        </SubView>
      )}
    </div>
  )
}

function HubMenuCard({ icon, title, sub, onClick }: {
  icon: string; title: string; sub: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left transition-all duration-150 group w-full"
      style={{
        background: 'rgba(20,15,5,0.78)',
        border: '4px solid #4a3000',
        boxShadow: '4px 4px 0 #000, inset 0 0 0 1px rgba(255,180,0,0.08)',
        padding: '14px 16px',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.background = 'rgba(80,50,5,0.90)'
        el.style.borderColor = '#c8860a'
        el.style.boxShadow = '4px 4px 0 #000, inset 0 0 12px rgba(255,180,0,0.25), 0 0 8px rgba(255,160,0,0.3)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background = 'rgba(20,15,5,0.78)'
        el.style.borderColor = '#4a3000'
        el.style.boxShadow = '4px 4px 0 #000, inset 0 0 0 1px rgba(255,180,0,0.08)'
      }}
    >
      <span className="text-2xl">{icon}</span>
      <h3 className="font-bold text-yellow-200 mt-2 uppercase tracking-wide text-sm" style={{ fontFamily: 'monospace', textShadow: '1px 1px 0 #000' }}>{title}</h3>
      <p className="text-amber-400/80 text-xs mt-0.5 group-hover:text-amber-300 transition-colors" style={{ fontFamily: 'monospace' }}>{sub}</p>
    </button>
  )
}