'use client'

import { useState } from 'react'
import { Player, Item, InventoryEntry, EquippedGear, ArmorSlot, deriveStatsWithGear, EMPTY_GEAR } from '@/types/game'
import { equipItemAction } from '@/actions/shopActions'
import { useConsumableAction } from '@/actions/consumableAction'
import ItemIcon from './ItemIcon'
import { useToast, ToastContainer } from './Toast'

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
  const { toasts, addToast } = useToast()

  const gear = buildEquippedGear(inventory)
  const derived = deriveStatsWithGear(player.primary_stats, gear)



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
    <div className="h-screen bg-gray-950 flex justify-center overflow-hidden">
      <div className="w-full h-screen bg-gray-950 text-white max-w-5xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-gray-800">
          <button onClick={onBack} className="text-gray-400 hover:text-white transition">← Volver</button>
          <h1 className="text-xl font-bold text-yellow-500">🎒 Inventario</h1>
        </div>

        <ToastContainer toasts={toasts} />

        {/* Layout principal: 1 col equipado + 3 cols inventario */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Columna izquierda: equipado ── */}
          <div className="w-1/4 border-r border-gray-800 p-4 flex flex-col gap-3 overflow-y-auto">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Equipado</h2>

            {/* Stats derivados */}
            <div className="bg-gray-800 rounded-lg p-3 text-xs flex flex-col gap-1.5 mb-2">
              <div className="flex justify-between"><span className="text-gray-400">⚔️ Ataque</span><span className="text-white font-bold">{derived.attack}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">🛡️ Defensa</span><span className="text-white font-bold">{derived.defense}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">❤️ HP máx</span><span className="text-white font-bold">{derived.max_hp}</span></div>
            </div>

            {/* Slots */}
            {(Object.keys(SLOT_LABELS) as (keyof typeof SLOT_LABELS)[]).map(slotKey => {
              const item = (gear as any)[slotKey] as Item | null
              return (
                <div key={slotKey} className="flex items-center gap-2">
                  {/* Cuadrado del slot */}
                  {item ? (
                    <ItemIcon item={item} size="sm" equipped />
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    tab === t
                      ? 'bg-yellow-500 text-black'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
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

                  return (
                    <ItemIcon
                      key={entry.id}
                      item={item}
                      quantity={entry.quantity}
                      equipped={entry.equipped}
                      size="lg"
                      actionLabel={
                        isLoading ? '...' :
                        entry.equipped ? 'Desequipar' : 'Equipar'
                      }
                      actionDisabled={isLoading}
                      onClick={() => handleEquip(entry)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}