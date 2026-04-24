'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Player, Item, InventoryEntry, EquippedGear, ArmorSlot, deriveStatsWithGear, EMPTY_GEAR } from '@/types/game'
import { equipItemAction, toggleLockAction } from '@/actions/shopActions'
import { useConsumableAction } from '@/actions/consumableAction'
import ItemIcon from './ItemIcon'
import { useToast, ToastContainer } from './Toast'
import { PASSIVE_LABELS, WEAPON_PASSIVES } from '@/lib/game/passiveLabels'
import { calcUpgradeBonus } from '@/types/game'

interface Props {
  player: Player
  inventory: InventoryEntry[]
  onBack: () => void
  onInventoryUpdate: (inventory: InventoryEntry[]) => void
}

type Tab = 'weapons' | 'armors' | 'accessories' | 'consumables' | 'misc'

const TAB_LABELS: Record<Tab, string> = {
  weapons:     '⚔️ Armas',
  armors:      '🛡️ Armaduras',
  accessories: '💍 Accesorios',
  consumables: '🧪 Consumibles',
  misc:        '📦 Extras',
}

const SLOT_LABELS: Record<string, string> = {
  weapon:   '⚔️ Arma',
  helmet:   '🪖 Casco',
  chest:    '🧥 Pecho',
  gloves:   '🧤 Guantes',
  pants:    '👖 Pantalón',
  boots:    '👢 Botas',
  ring1:    '💍 Anillo 1',
  ring2:    '💍 Anillo 2',
  necklace: '📿 Colgante',
}

const rarityColors: Record<string, string> = {
  common:    'border-gray-600',
  rare:      'border-blue-500',
  epic:      'border-purple-500',
  legendary: 'border-yellow-500',
}

const rarityText: Record<string, string> = {
  common: 'text-gray-400', rare: 'text-blue-400',
  epic: 'text-purple-400', legendary: 'text-yellow-400',
}

function buildEquippedGear(inventory: InventoryEntry[]): EquippedGear {
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

function filterByTab(inventory: InventoryEntry[], tab: Tab): InventoryEntry[] {
  return inventory.filter(e => {
    if (!e.item) return false
    switch (tab) {
      case 'weapons':     return e.item.type === 'weapon'
      case 'armors':      return e.item.type === 'armor'
      case 'accessories': return e.item.type === 'ring' || e.item.type === 'necklace'
      case 'consumables': return e.item.type === 'consumable'
      case 'misc':        return !['weapon','armor','ring','necklace','consumable'].includes(e.item.type)
      default:            return false
    }
  })
}

export default function InventoryClient({ player, inventory: initialInventory, onBack, onInventoryUpdate }: Props) {
  const [inventory, setInventory] = useState(initialInventory)
  const [tab, setTab] = useState<Tab>('weapons')
  const [loading, setLoading] = useState<number | null>(null)
  const [usingConsumable, setUsingConsumable] = useState<number | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<InventoryEntry | null>(null)
  const [lockingId, setLockingId] = useState<number | null>(null)
  const { toasts, addToast } = useToast()
  const router = useRouter()

  const gear = buildEquippedGear(inventory)
  const derived = deriveStatsWithGear(player.primary_stats, gear)

  async function handleToggleLock(entry: InventoryEntry) {
    setLockingId(entry.id)
    const newLocked = !entry.locked
    const result = await toggleLockAction(entry.id, newLocked)
    if (!result.success) {
      addToast(result.error ?? 'Error al bloquear', 'error')
      setLockingId(null)
      return
    }
    const updated = inventory.map(e => e.id === entry.id ? { ...e, locked: newLocked } : e)
    setInventory(updated)
    onInventoryUpdate(updated)
    if (selectedEntry?.id === entry.id) setSelectedEntry({ ...entry, locked: newLocked })
    setLockingId(null)
  }



  async function handleUseConsumable(entry: InventoryEntry) {
    if (!entry.item || entry.item.type !== 'consumable') return
    setUsingConsumable(entry.id)

    const result = await useConsumableAction(entry.id)

    if (!result.success) {
      addToast(result.error ?? 'Error al usar el item', 'error')
      setUsingConsumable(null)
      return
    }

    // Actualizar inventario local
    const updatedInventory = inventory
      .map(e => e.id === entry.id ? { ...e, quantity: e.quantity - 1 } : e)
      .filter(e => e.quantity > 0)

    setInventory(updatedInventory)
    onInventoryUpdate(updatedInventory)
    addToast(result.message ?? '✅ Item usado', 'success')
    if (result.unlockedSkill) router.refresh()
    setUsingConsumable(null)
  }

  async function handleEquip(entry: InventoryEntry) {
    if (!entry.item || entry.item.type === 'consumable') return
    setLoading(entry.id)

    const result = await equipItemAction(
      entry.id,
      entry.item.type,
      entry.item.stats?.slot
    )

    if (!result.success) {
      addToast(result.error ?? 'Error al equipar', 'error')
      setLoading(null)
      return
    }

    const isEquipping = !entry.equipped
    const updatedInventory = inventory.map(e => {
      if (e.id === entry.id) return { ...e, equipped: isEquipping }
      if (!isEquipping) return e

      // Desequipar items del mismo slot
      if (!e.item || !e.equipped) return e
      const sameType = e.item.type === entry.item!.type

      if (entry.item!.type === 'ring') return e // rings no se desequipan automáticamente
      if (entry.item!.type === 'armor') {
        if (sameType && e.item.stats?.slot === entry.item!.stats?.slot)
          return { ...e, equipped: false }
        return e
      }
      if (sameType) return { ...e, equipped: false }
      return e
    })

    setInventory(updatedInventory)
    onInventoryUpdate(updatedInventory)
    addToast(isEquipping ? `✅ ${entry.item.name} equipado` : `${entry.item.name} desequipado`, 'success')
    setLoading(null)
  }

  const tabItems = filterByTab(inventory, tab)

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white" style={{ background: 'rgba(20,10,5,0.97)', backgroundImage: 'url(/sprites/backgrounds/hub_background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="w-full h-screen flex flex-col overflow-hidden max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 border-b-4 border-yellow-900 shrink-0" style={{ background: 'rgba(20,10,5,0.88)', boxShadow: '0 4px 0 #000' }}>
          <button onClick={onBack} className="text-yellow-700 hover:text-yellow-400 transition text-sm" style={{ fontFamily: 'monospace' }}>◀ Volver</button>
          <h1 className="text-lg font-bold text-yellow-400 uppercase tracking-widest" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>🎒 Inventario</h1>
        </div>

        <ToastContainer toasts={toasts} />

        {/* Layout principal: 1 col equipado + 3 cols inventario */}
        <div className="flex flex-1 overflow-hidden" style={{ background: 'rgba(10,5,2,0.75)' }}>

          {/* ── Columna izquierda: equipado ── */}
          <div className="w-1/4 p-4 flex flex-col gap-3 overflow-y-auto border-r-4 border-yellow-900" style={{ background: 'rgba(20,10,5,0.80)', boxShadow: '4px 0 0 #000' }}>
            <h2 className="text-xs font-bold text-yellow-700 uppercase tracking-wider mb-1" style={{ fontFamily: 'monospace' }}>Equipado</h2>

            {/* Stats derivados */}
            <div className="p-3 text-xs flex flex-col gap-1.5 mb-2" style={{ background: 'rgba(0,0,0,0.5)', border: '2px solid #000', boxShadow: '2px 2px 0 #000', fontFamily: 'monospace' }}>
              <div className="flex justify-between"><span className="text-gray-400">⚔️ Ataque</span><span className="text-orange-300 font-bold">{derived.attack}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">🛡️ Defensa</span><span className="text-blue-300 font-bold">{derived.defense}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">❤️ HP máx</span><span className="text-red-300 font-bold">{derived.max_hp}</span></div>
            </div>

            {/* Slots */}
            {(Object.keys(SLOT_LABELS) as (keyof typeof SLOT_LABELS)[]).map(slotKey => {
              const equippedItem = (gear as any)[slotKey] as import('@/types/game').EquippedItem | null
              const item = equippedItem?.item ?? null
              return (
                <div key={slotKey} className="flex items-center gap-2">
                  {/* Cuadrado del slot */}
                  {item ? (
                    <ItemIcon item={item} upgradeLevel={equippedItem?.upgradeLevel ?? 0} size="sm" equipped />
                  ) : (
                    <div className="w-12 h-12 border-2 border-dashed border-gray-700 rounded-lg bg-gray-800/30 flex items-center justify-center text-gray-700 text-lg shrink-0">
                      +
                    </div>
                  )}
                  {/* Label del slot */}
                  <div>
                    <div className="text-gray-500 text-xs">{SLOT_LABELS[slotKey]}</div>
                    {item && (
                      <div className="text-gray-300 text-xs font-bold leading-tight">
                        {item.name}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── 3 columnas derecha: inventario ── */}
          <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">

            {/* Tabs */}
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-3 py-1.5 text-xs font-bold transition"
                  style={{
                    fontFamily: 'monospace',
                    border: '2px solid',
                    borderColor: tab === t ? '#c8860a' : '#4a3000',
                    background: tab === t ? 'rgba(120,80,0,0.85)' : 'rgba(20,10,5,0.70)',
                    color: tab === t ? '#ffd700' : '#7a5a30',
                    boxShadow: tab === t ? '2px 2px 0 #000' : 'none',
                    textShadow: tab === t ? '1px 1px 0 #000' : 'none',
                  }}
                >
                  {TAB_LABELS[t]}
                  <span className="ml-1 opacity-60">
                    ({filterByTab(inventory, t).length})
                  </span>
                </button>
              ))}
            </div>

            {/* Items */}
            {tabItems.length === 0 ? (
              <div className="text-gray-600 text-sm text-center py-12">
                No tenés items en esta categoría
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {tabItems.map(entry => {
                  if (!entry.item) return null
                  const item = entry.item
                  const isConsumable = item.type === 'consumable'
                  const isLoading = loading === entry.id
                  const isUsing = usingConsumable === entry.id

                  if (isConsumable) {
                    return (
                      <div key={entry.id} className="bg-gray-800 rounded-lg p-4 flex flex-col gap-3 w-48">
                        <div className="flex items-center gap-3">
                          <ItemIcon item={item} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${rarityText[item.rarity] ?? 'text-white'}`}>{item.name}</p>
                            <p className="text-gray-500 text-xs">x{entry.quantity}</p>
                          </div>
                        </div>
                        {item.effect && (
                          <div className="text-xs text-gray-400 flex flex-col gap-0.5">
                            {(item.effect as any).heal_hp      > 0 && <span>❤️ +{(item.effect as any).heal_hp} HP</span>}
                            {(item.effect as any).heal_stamina > 0 && <span>⚡ +{(item.effect as any).heal_stamina} Stamina</span>}
                            {(item.effect as any).heal_mana    > 0 && <span>🔮 +{(item.effect as any).heal_mana} Mana</span>}
                            {(item.effect as any).unlock_skill && <span className="text-purple-400">✨ Desbloquea habilidad</span>}
                          </div>
                        )}
                        <button
                          onClick={() => handleUseConsumable(entry)}
                          disabled={isUsing}
                          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-1.5 rounded-lg transition"
                        >
                          {isUsing ? 'Usando...' : 'Usar'}
                        </button>
                      </div>
                    )
                  }

                  if (item.type === 'material') {
                    return (
                      <div key={entry.id} className="relative">
                        <ItemIcon
                          item={item}
                          quantity={entry.quantity}
                          size="lg"
                        />
                      </div>
                    )
                  }

                  return (
                    <div
                      key={entry.id}
                      onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                      className={`relative cursor-pointer rounded-xl border-2 transition ${
                        selectedEntry?.id === entry.id
                          ? 'border-yellow-400'
                          : entry.locked
                            ? 'border-orange-700'
                            : 'border-transparent'
                      }`}
                    >
                      <ItemIcon
                        item={item}
                        quantity={entry.quantity}
                        equipped={entry.equipped}
                        upgradeLevel={entry.upgrade_level ?? 0}
                        skillSlots={entry.skill_slots ?? 0}
                        instancePassives={entry.instance_passives ?? []}
                        size="lg"
                      />
                      {entry.locked && (
                        <div className="absolute top-1 left-1 text-orange-400 text-xs">🔒</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer lateral derecho */}
        {selectedEntry && selectedEntry.item && (() => {
          const entry = selectedEntry
          const item = entry.item!
          const base = item.stats?.attack ?? 0
          const bonus = calcUpgradeBonus(base, entry.upgrade_level ?? 0)
          const passiveIds = item.stats?.passives ?? WEAPON_PASSIVES[item.stats?.weapon_type ?? 'none'] ?? []
          const rarityBorder: Record<string, string> = {
            common: '#555', rare: '#4488ff',
            epic: '#aa44ff', legendary: '#ffcc00',
          }
          return (
            <>
              {/* Overlay */}
              <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={() => setSelectedEntry(null)}
              />
              {/* Panel */}
              <div className="fixed right-0 top-0 h-full w-72 z-50 flex flex-col overflow-y-auto border-l-4 border-yellow-900" style={{ background: 'rgba(15,8,3,0.97)', boxShadow: '-4px 0 0 #000' }}>

                {/* Header con X */}
                <div className="flex items-center justify-between px-4 py-3 border-b-4 border-yellow-900" style={{ background: 'rgba(20,10,5,0.95)' }}>
                  <p className={`font-bold text-base ${rarityText[item.rarity] ?? 'text-white'}`} style={{ fontFamily: 'monospace', textShadow: '1px 1px 0 #000' }}>
                    {item.name}
                    {(entry.upgrade_level ?? 0) > 0 && (
                      <span className="text-orange-400 ml-1">+{entry.upgrade_level}</span>
                    )}
                  </p>
                  <button onClick={() => setSelectedEntry(null)} className="text-yellow-700 hover:text-yellow-400 text-xl leading-none transition" style={{ fontFamily: 'monospace' }}>✕</button>
                </div>

                {/* Imagen grande */}
                <div className="mx-4 mt-4 flex items-center justify-center p-6">
                  <img
                    src={`/sprites/items/${item.sprite}`}
                    alt={item.name}
                    className="w-24 h-24 object-contain"
                    style={{ imageRendering: 'pixelated', border: `3px solid ${rarityBorder[item.rarity] ?? '#555'}`, boxShadow: '3px 3px 0 #000' }}
                    onError={(e) => { (e.target as HTMLImageElement).src = '/sprites/items/weapon_placeholder.png' }}
                  />
                </div>

                {/* Badges */}
                <div className="flex gap-2 px-4 mt-3 flex-wrap">
                  {entry.equipped && <span className="text-xs text-green-400 bg-green-900/40 px-2 py-0.5 rounded">✓ Equipado</span>}
                  {entry.locked && <span className="text-xs text-orange-400 bg-orange-900/40 px-2 py-0.5 rounded">🔒 Bloqueado</span>}
                  <span className={`text-xs px-2 py-0.5 rounded ${rarityText[item.rarity]} bg-gray-800`}>{item.rarity}</span>
                </div>

                {/* Stats */}
                <div className="px-4 mt-4 flex flex-col gap-2">
                  {base > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">⚔️ Ataque</span>
                      <span className="text-orange-300 font-bold">
                        {base + bonus}
                        {bonus > 0 && <span className="text-orange-400 text-xs ml-1">(+{bonus})</span>}
                      </span>
                    </div>
                  )}
                  {item.stats?.defense && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">🛡️ Defensa</span>
                      <span className="text-blue-300 font-bold">{item.stats.defense}</span>
                    </div>
                  )}
                  {item.stats?.hp_bonus && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">❤️ HP bonus</span>
                      <span className="text-red-300 font-bold">+{item.stats.hp_bonus}</span>
                    </div>
                  )}
                  {item.stats?.crit_chance && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">🍀 Crítico</span>
                      <span className="text-yellow-300 font-bold">+{(item.stats.crit_chance * 100).toFixed(0)}%</span>
                    </div>
                  )}
                  {(entry.upgrade_level ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Mejora</span>
                      <span className="text-orange-400">{'★'.repeat(entry.upgrade_level ?? 0)}{'☆'.repeat(5 - (entry.upgrade_level ?? 0))}</span>
                    </div>
                  )}
                </div>

                {/* Pasivas base */}
                {passiveIds.length > 0 && (
                  <div className="px-4 mt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pasivas</p>
                    <div className="flex flex-col gap-2">
                      {passiveIds.map(id => {
                        const label = PASSIVE_LABELS[id]
                        return label ? (
                          <div key={id} className="bg-gray-800 rounded-lg p-2">
                            <p className="text-xs font-semibold text-violet-300">✦ {label.name}</p>
                            <p className="text-xs text-gray-400">{label.description}</p>
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                )}

                {/* Ranuras */}
                {(entry.skill_slots ?? 0) > 0 && (
                  <div className="px-4 mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ranuras</p>
                      <span className="text-violet-400 text-sm">
                        {'◆'.repeat(entry.instance_passives?.length ?? 0)}
                        {'◇'.repeat((entry.skill_slots ?? 0) - (entry.instance_passives?.length ?? 0))}
                        <span className="text-gray-500 text-xs ml-1">({entry.instance_passives?.length ?? 0}/{entry.skill_slots})</span>
                      </span>
                    </div>
                    {(entry.instance_passives ?? []).length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {(entry.instance_passives ?? []).map(id => {
                          const label = PASSIVE_LABELS[id]
                          return label ? (
                            <div key={id} className="bg-violet-900/20 border border-violet-700/30 rounded-lg p-2">
                              <p className="text-xs font-semibold text-violet-300">✦ {label.name}</p>
                              <p className="text-xs text-gray-400">{label.description}</p>
                            </div>
                          ) : null
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">Sin pasivas engastadas</p>
                    )}
                  </div>
                )}

                {/* Botones */}
                <div className="mt-auto p-4 flex flex-col gap-2 border-t-4 border-yellow-900">
                  <button
                    onClick={() => handleEquip(entry)}
                    disabled={loading === entry.id}
                    className="w-full py-2.5 font-bold text-sm transition"
                    style={{
                      fontFamily: 'monospace',
                      border: '4px solid',
                      borderColor: loading === entry.id ? '#4a3000' : entry.equipped ? '#555' : '#c8860a',
                      background: loading === entry.id ? 'rgba(20,10,5,0.5)' : entry.equipped ? 'rgba(60,60,60,0.6)' : 'rgba(100,65,0,0.85)',
                      color: loading === entry.id ? '#555' : '#ffd700',
                      boxShadow: loading === entry.id ? 'none' : '4px 4px 0 #000',
                      textShadow: '1px 1px 0 #000',
                      cursor: loading === entry.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading === entry.id ? '...' : entry.equipped ? 'Desequipar' : 'Equipar'}
                  </button>
                  <button
                    onClick={() => handleToggleLock(entry)}
                    disabled={lockingId === entry.id}
                    className="w-full py-2.5 font-bold text-sm transition"
                    style={{
                      fontFamily: 'monospace',
                      border: '4px solid',
                      borderColor: lockingId === entry.id ? '#4a3000' : entry.locked ? '#8B4500' : '#4a3000',
                      background: lockingId === entry.id ? 'rgba(20,10,5,0.5)' : entry.locked ? 'rgba(80,30,5,0.70)' : 'rgba(20,10,5,0.60)',
                      color: lockingId === entry.id ? '#555' : entry.locked ? '#ffaa44' : '#7a5a30',
                      boxShadow: lockingId === entry.id ? 'none' : '4px 4px 0 #000',
                      textShadow: '1px 1px 0 #000',
                      cursor: lockingId === entry.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {lockingId === entry.id ? '...' : entry.locked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                  </button>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}