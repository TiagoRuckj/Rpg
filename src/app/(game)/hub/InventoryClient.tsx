'use client'
import BgImage from './BgImage'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Player, Item, InventoryEntry, EquippedGear, ArmorSlot, deriveStatsWithGear, EMPTY_GEAR } from '@/types/game'
import { equipItemAction, toggleLockAction } from '@/actions/shopActions'
import { useConsumableAction } from '@/actions/consumableAction'
import ItemIcon from './ItemIcon'
import { useToast, ToastContainer } from './Toast'
import { PASSIVE_LABELS, WEAPON_PASSIVES } from '@/lib/game/passiveLabels'
import { calcUpgradeBonus } from '@/types/game'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

// Paleta acorde al fondo medieval cálido
const C = {
  border:      '#5a1a1a',
  borderGold:  '#8B4500',
  borderHover: '#c8600a',
  gold:        '#e8a040',
  goldBright:  '#ffd700',
  bg:          'rgba(12,4,4,0.88)',
  bgHeader:    'rgba(15,4,4,0.94)',
  bgCard:      'rgba(20,8,4,0.82)',
  bgCardHover: 'rgba(40,12,4,0.88)',
  bgSlot:      'rgba(0,0,0,0.50)',
  text:        '#c8906a',
  textDim:     '#6a3020',
  shadow:      '4px 4px 0 #000',
  shadowSm:    '2px 2px 0 #000',
}

const RARITY_COLOR: Record<string, string> = {
  common: '#888', rare: '#4488ff', epic: '#aa44ff', legendary: '#ffcc00',
}
const RARITY_TEXT: Record<string, string> = {
  common: '#888', rare: '#60a5fa', epic: '#c084fc', legendary: '#ffd700',
}

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
  weapon: '⚔️ Arma', helmet: '🪖 Casco', chest: '🧥 Pecho',
  gloves: '🧤 Guantes', pants: '👖 Pantalón', boots: '👢 Botas',
  ring1: '💍 Anillo 1', ring2: '💍 Anillo 2', necklace: '📿 Colgante',
}

function buildEquippedGear(inventory: InventoryEntry[]): EquippedGear {
  const gear = { ...EMPTY_GEAR }
  for (const e of inventory.filter(e => e.equipped && e.item)) {
    const item = e.item!
    const equippedItem = { item, upgradeLevel: e.upgrade_level ?? 0, instancePassives: e.instance_passives ?? [] }
    switch (item.type) {
      case 'weapon':   gear.weapon = equippedItem; break
      case 'necklace': gear.necklace = equippedItem; break
      case 'ring':
        if (!gear.ring1) gear.ring1 = equippedItem; else gear.ring2 = equippedItem; break
      case 'armor': {
        const slot = item.stats?.slot
        if (slot && slot in gear) (gear as any)[slot] = equippedItem; break
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

function EquipSlot({ slotKey, gear, large, onClick }: { slotKey: string; gear: EquippedGear; large?: boolean; onClick?: () => void }) {
  const equippedItem = (gear as any)[slotKey] as import('@/types/game').EquippedItem | null
  const item = equippedItem?.item ?? null
  const size = large ? 68 : 56
  const label = SLOT_LABELS[slotKey] ?? slotKey

  return (
    <div className="flex flex-col items-center gap-1"
      style={{ cursor: item && onClick ? 'pointer' : 'default' }}
      onClick={() => item && onClick && onClick()}
    >
      <div style={{
        width: size, height: size, position: 'relative', flexShrink: 0,
        border: `3px solid ${item ? C.borderGold : C.border}`,
        background: item ? 'rgba(40,15,5,0.70)' : 'rgba(0,0,0,0.30)',
        boxShadow: item ? `${C.shadowSm}, inset 0 0 8px rgba(200,96,10,0.15)` : C.shadowSm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
        onMouseEnter={e => { if (item && onClick) { (e.currentTarget as HTMLDivElement).style.borderColor = C.borderHover; (e.currentTarget as HTMLDivElement).style.boxShadow = `${C.shadowSm}, 0 0 10px ${C.borderHover}66` } }}
        onMouseLeave={e => { if (item && onClick) { (e.currentTarget as HTMLDivElement).style.borderColor = C.borderGold; (e.currentTarget as HTMLDivElement).style.boxShadow = `${C.shadowSm}, inset 0 0 8px rgba(200,96,10,0.15)` } }}
      >
        {item ? (
          <>
            <img
              src={`/sprites/items/${item.sprite}`}
              alt={item.name}
              style={{ width: size - 8, height: size - 8, objectFit: 'contain', imageRendering: 'pixelated' }}
              onError={(e) => { (e.target as HTMLImageElement).src = '/sprites/items/weapon_placeholder.png' }}
            />
            {(equippedItem?.upgradeLevel ?? 0) > 0 && (
              <span style={{ position: 'absolute', top: 2, right: 2, fontFamily: 'monospace', fontSize: '9px', color: '#fb923c', textShadow: '1px 1px 0 #000', fontWeight: 'bold' }}>
                +{equippedItem!.upgradeLevel}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: C.textDim, fontSize: large ? '24px' : '18px', fontFamily: 'monospace' }}>+</span>
        )}
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: '9px', color: item ? C.text : C.textDim, textAlign: 'center', lineHeight: '1.1', maxWidth: size + 'px' }}>
        {item ? item.name.split(' ').slice(0, 2).join(' ') : label.split(' ').slice(1).join(' ')}
      </span>
    </div>
  )
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
    if (!result.success) { addToast(result.error ?? 'Error al bloquear', 'error'); setLockingId(null); return }
    const updated = inventory.map(e => e.id === entry.id ? { ...e, locked: newLocked } : e)
    setInventory(updated); onInventoryUpdate(updated)
    if (selectedEntry?.id === entry.id) setSelectedEntry({ ...entry, locked: newLocked })
    setLockingId(null)
  }

  async function handleUseConsumable(entry: InventoryEntry) {
    if (!entry.item || entry.item.type !== 'consumable') return
    setUsingConsumable(entry.id)
    const result = await useConsumableAction(entry.id)
    if (!result.success) { addToast(result.error ?? 'Error al usar el item', 'error'); setUsingConsumable(null); return }
    const updatedInventory = inventory.map(e => e.id === entry.id ? { ...e, quantity: e.quantity - 1 } : e).filter(e => e.quantity > 0)
    setInventory(updatedInventory); onInventoryUpdate(updatedInventory)
    addToast(result.message ?? '✅ Item usado', 'success')
    if (result.unlockedSkill) router.refresh()
    setUsingConsumable(null)
  }

  async function handleEquip(entry: InventoryEntry) {
    if (!entry.item || entry.item.type === 'consumable') return
    setLoading(entry.id)
    const result = await equipItemAction(entry.id, entry.item.type, entry.item.stats?.slot)
    if (!result.success) { addToast(result.error ?? 'Error al equipar', 'error'); setLoading(null); return }
    const isEquipping = !entry.equipped
    const updatedInventory = inventory.map(e => {
      if (e.id === entry.id) return { ...e, equipped: isEquipping }
      if (!isEquipping || !e.item || !e.equipped) return e
      if (entry.item!.type === 'ring') return e
      if (entry.item!.type === 'armor') {
        if (e.item.type === 'armor' && e.item.stats?.slot === entry.item!.stats?.slot) return { ...e, equipped: false }
        return e
      }
      if (e.item.type === entry.item!.type) return { ...e, equipped: false }
      return e
    })
    setInventory(updatedInventory); onInventoryUpdate(updatedInventory)
    // Sincronizar selectedEntry con el nuevo estado
    const updatedEntry = updatedInventory.find(e => e.id === entry.id)
    if (updatedEntry) setSelectedEntry(updatedEntry)
    addToast(isEquipping ? `✅ ${entry.item.name} equipado` : `${entry.item.name} desequipado`, 'success')
    setLoading(null)
  }

  const tabItems = filterByTab(inventory, tab)

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white">
      <BgImage src="/sprites/backgrounds/inventory_background.png" />

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-4 shrink-0"
        style={{ background: C.bgHeader, borderColor: C.border, boxShadow: '0 4px 0 #000', position: 'relative', zIndex: 1 }}>
        <button
          onClick={onBack}
          className="font-bold text-sm transition-all"
          style={{ ...MONO, border: `3px solid ${C.border}`, background: 'rgba(40,10,10,0.80)', color: C.text, padding: '4px 14px', boxShadow: C.shadow, textShadow: '1px 1px 0 #000' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.gold }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}
        >◀ Volver</button>
        <h1 className="text-lg font-bold uppercase tracking-widest"
          style={{ ...MONO, color: C.gold, textShadow: '2px 2px 0 #000' }}>🎒 Inventario</h1>
      </div>

      <ToastContainer toasts={toasts} />

      {/* Layout 3 columnas fijas */}
      <div className="flex flex-1 overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Col 1: slots equipados ── */}
        <div className="w-72 shrink-0 flex flex-col p-3 border-r-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(10,3,3,0.88)', borderColor: C.border, boxShadow: '4px 0 0 #000' }}>

          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ ...MONO, color: C.textDim }}>Equipado</p>

          {/* Paper doll — centrado verticalmente */}
          <div className="flex-1 flex flex-col justify-center gap-2">

            {/* Cabeza */}
            <div className="flex justify-center">
              <EquipSlot slotKey="helmet" gear={gear}
                onClick={() => { const e = inventory.find(e => e.equipped && e.item?.type === 'armor' && e.item?.stats?.slot === 'helmet'); if (e) setSelectedEntry(e) }} />
            </div>

            {/* Torso: arma + pecho */}
            <div className="flex items-center justify-center gap-3">
              <EquipSlot slotKey="weapon" gear={gear}
                onClick={() => { const e = inventory.find(e => e.equipped && e.item?.type === 'weapon'); if (e) setSelectedEntry(e) }} />
              <EquipSlot slotKey="chest" gear={gear} large
                onClick={() => { const e = inventory.find(e => e.equipped && e.item?.type === 'armor' && e.item?.stats?.slot === 'chest'); if (e) setSelectedEntry(e) }} />
              <EquipSlot slotKey="gloves" gear={gear}
                onClick={() => { const e = inventory.find(e => e.equipped && e.item?.type === 'armor' && e.item?.stats?.slot === 'gloves'); if (e) setSelectedEntry(e) }} />
            </div>

            {/* Pantalón */}
            <div className="flex justify-center">
              <EquipSlot slotKey="pants" gear={gear}
                onClick={() => { const e = inventory.find(e => e.equipped && e.item?.type === 'armor' && e.item?.stats?.slot === 'pants'); if (e) setSelectedEntry(e) }} />
            </div>

            {/* Botas */}
            <div className="flex justify-center">
              <EquipSlot slotKey="boots" gear={gear}
                onClick={() => { const e = inventory.find(e => e.equipped && e.item?.type === 'armor' && e.item?.stats?.slot === 'boots'); if (e) setSelectedEntry(e) }} />
            </div>

            {/* Separador */}
            <div style={{ height: '2px', background: `linear-gradient(to right, transparent, ${C.border}, transparent)`, margin: '2px 0' }} />

            {/* Accesorios */}
            <div className="flex justify-center gap-3">
              <EquipSlot slotKey="ring1" gear={gear}
                onClick={() => { const rings = inventory.filter(e => e.equipped && e.item?.type === 'ring'); if (rings[0]) setSelectedEntry(rings[0]) }} />
              <EquipSlot slotKey="necklace" gear={gear}
                onClick={() => { const e = inventory.find(e => e.equipped && e.item?.type === 'necklace'); if (e) setSelectedEntry(e) }} />
              <EquipSlot slotKey="ring2" gear={gear}
                onClick={() => { const rings = inventory.filter(e => e.equipped && e.item?.type === 'ring'); if (rings[1]) setSelectedEntry(rings[1]) }} />
            </div>
          </div>
        </div>

        {/* ── Col 2: inventario ── */}
        <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(8,2,2,0.70)' }}>

          {/* Tabs */}
          <div className="flex gap-1 flex-wrap shrink-0">
            {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1.5 text-xs font-bold transition"
                style={{
                  ...MONO,
                  border: '2px solid',
                  borderColor: tab === t ? C.borderHover : C.border,
                  background: tab === t ? 'rgba(100,25,5,0.85)' : 'rgba(20,5,5,0.70)',
                  color: tab === t ? C.goldBright : C.textDim,
                  boxShadow: tab === t ? C.shadowSm : 'none',
                  textShadow: tab === t ? '1px 1px 0 #000' : 'none',
                }}>
                {TAB_LABELS[t]} <span style={{ opacity: 0.6 }}>({filterByTab(inventory, t).length})</span>
              </button>
            ))}
          </div>

          {/* Items */}
          {tabItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <span style={{ ...MONO, color: C.textDim, fontSize: '13px' }}>No tenés items en esta categoría</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 content-start">
              {tabItems.map(entry => {
                if (!entry.item) return null
                const item = entry.item
                const isConsumable = item.type === 'consumable'
                const isUsing = usingConsumable === entry.id

                if (isConsumable) {
                  return (
                    <div key={entry.id} className="flex flex-col gap-2 p-3"
                      style={{ ...MONO, background: C.bgCard, border: `3px solid ${C.border}`, boxShadow: C.shadow, width: '180px' }}>
                      <div className="flex items-center gap-2">
                        <ItemIcon item={item} size="sm" />
                        <div>
                          <p className="text-sm font-bold" style={{ color: RARITY_TEXT[item.rarity] ?? C.text }}>{item.name}</p>
                          <p style={{ fontSize: '11px', color: C.textDim }}>x{entry.quantity}</p>
                        </div>
                      </div>
                      {item.effect && (
                        <div style={{ fontSize: '11px', color: C.text, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {(item.effect as any).heal_hp > 0 && <span>❤️ +{(item.effect as any).heal_hp} HP</span>}
                          {(item.effect as any).heal_stamina > 0 && <span>⚡ +{(item.effect as any).heal_stamina} STA</span>}
                          {(item.effect as any).heal_mana > 0 && <span>🔮 +{(item.effect as any).heal_mana} MANA</span>}
                          {(item.effect as any).unlock_skill && <span style={{ color: '#c084fc' }}>✨ Desbloquea skill</span>}
                        </div>
                      )}
                      <button
                        onClick={() => handleUseConsumable(entry)}
                        disabled={isUsing}
                        style={{ ...MONO, border: `3px solid #155a15`, background: 'rgba(10,50,10,0.85)', color: '#4ade80', boxShadow: C.shadowSm, fontSize: '12px', fontWeight: 'bold', padding: '4px', cursor: isUsing ? 'not-allowed' : 'pointer', opacity: isUsing ? 0.5 : 1 }}>
                        {isUsing ? '...' : 'Usar'}
                      </button>
                    </div>
                  )
                }

                if (item.type === 'material') {
                  return (
                    <div key={entry.id} className="relative">
                      <ItemIcon item={item} quantity={entry.quantity} size="lg" />
                    </div>
                  )
                }

                const isSelected = selectedEntry?.id === entry.id
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(isSelected ? null : entry)}
                    className="relative cursor-pointer transition-all"
                    style={{
                      border: `3px solid ${isSelected ? C.borderHover : entry.locked ? '#8B3500' : C.border}`,
                      outline: isSelected ? `1px solid ${C.borderHover}` : 'none',
                      outlineOffset: '2px',
                      boxShadow: isSelected ? `${C.shadow}, 0 0 10px ${C.borderHover}66` : C.shadowSm,
                      transition: 'border-color 0.12s, box-shadow 0.12s',
                    }}
                  >
                    <ItemIcon
                      item={item} quantity={entry.quantity} equipped={entry.equipped}
                      upgradeLevel={entry.upgrade_level ?? 0}
                      skillSlots={entry.skill_slots ?? 0}
                      instancePassives={entry.instance_passives ?? []}
                      size="lg"
                    />
                    {entry.locked && (
                      <div className="absolute top-1 left-1" style={{ fontSize: '12px' }}>🔒</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* ── Col 3: detalle del item ── */}
        <div className="w-72 shrink-0 flex flex-col border-l-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(10,3,3,0.88)', borderColor: C.border, boxShadow: '-4px 0 0 #000' }}>

          {!selectedEntry || !selectedEntry.item ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <span style={{ fontSize: '32px', opacity: 0.3 }}>🗡️</span>
              <p style={{ ...MONO, fontSize: '12px', color: C.textDim, textAlign: 'center' }}>Seleccioná un item para ver sus detalles</p>
            </div>
          ) : (() => {
            const entry = selectedEntry
            const item = entry.item!
            const base = item.stats?.attack ?? 0
            const bonus = calcUpgradeBonus(base, entry.upgrade_level ?? 0)
            const passiveIds = item.stats?.passives ?? WEAPON_PASSIVES[item.stats?.weapon_type ?? 'none'] ?? []
            return (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b-4" style={{ background: C.bgHeader, borderColor: C.border }}>
                  <p className="font-bold text-sm" style={{ ...MONO, color: RARITY_TEXT[item.rarity] ?? C.text, textShadow: '1px 1px 0 #000' }}>
                    {item.name}{(entry.upgrade_level ?? 0) > 0 && <span style={{ color: '#fb923c', marginLeft: '4px' }}>+{entry.upgrade_level}</span>}
                  </p>
                  <button onClick={() => setSelectedEntry(null)} style={{ ...MONO, color: C.textDim, fontSize: '18px', lineHeight: 1 }}
                    onMouseEnter={e => e.currentTarget.style.color = C.gold}
                    onMouseLeave={e => e.currentTarget.style.color = C.textDim}>✕</button>
                </div>
                <div className="flex items-center justify-center p-6">
                  <img src={`/sprites/items/${item.sprite}`} alt={item.name} className="w-24 h-24 object-contain"
                    style={{ imageRendering: 'pixelated', border: `3px solid ${RARITY_COLOR[item.rarity] ?? '#555'}`, boxShadow: C.shadow }}
                    onError={(e) => { (e.target as HTMLImageElement).src = '/sprites/items/weapon_placeholder.png' }} />
                </div>
                <div className="flex gap-2 px-4 flex-wrap">
                  {entry.equipped && <span style={{ ...MONO, fontSize: '11px', padding: '2px 8px', border: '2px solid #155a15', background: 'rgba(10,50,10,0.6)', color: '#4ade80' }}>✓ Equipado</span>}
                  {entry.locked && <span style={{ ...MONO, fontSize: '11px', padding: '2px 8px', border: '2px solid #8B3500', background: 'rgba(80,30,0,0.6)', color: '#fb923c' }}>🔒 Bloqueado</span>}
                  <span style={{ ...MONO, fontSize: '11px', padding: '2px 8px', border: `2px solid ${RARITY_COLOR[item.rarity] ?? '#555'}`, background: 'rgba(0,0,0,0.4)', color: RARITY_TEXT[item.rarity] ?? C.text }}>{item.rarity}</span>
                </div>
                <div className="px-4 mt-4 flex flex-col gap-2">
                  {base > 0 && <div className="flex justify-between text-sm" style={MONO}><span style={{ color: C.textDim }}>⚔️ Ataque</span><span style={{ color: '#fb923c', fontWeight: 'bold' }}>{base + bonus}{bonus > 0 && <span style={{ color: '#f97316', fontSize: '11px', marginLeft: '4px' }}>(+{bonus})</span>}</span></div>}
                  {item.stats?.defense && <div className="flex justify-between text-sm" style={MONO}><span style={{ color: C.textDim }}>🛡️ Defensa</span><span style={{ color: '#60a5fa', fontWeight: 'bold' }}>{item.stats.defense}</span></div>}
                  {item.stats?.hp_bonus && <div className="flex justify-between text-sm" style={MONO}><span style={{ color: C.textDim }}>❤️ HP bonus</span><span style={{ color: '#f87171', fontWeight: 'bold' }}>+{item.stats.hp_bonus}</span></div>}
                  {item.stats?.crit_chance && <div className="flex justify-between text-sm" style={MONO}><span style={{ color: C.textDim }}>🍀 Crítico</span><span style={{ color: '#4ade80', fontWeight: 'bold' }}>+{(item.stats.crit_chance * 100).toFixed(0)}%</span></div>}
                  {(entry.upgrade_level ?? 0) > 0 && <div className="flex justify-between text-sm" style={MONO}><span style={{ color: C.textDim }}>Mejora</span><span style={{ color: '#fb923c' }}>{'★'.repeat(entry.upgrade_level ?? 0)}{'☆'.repeat(5 - (entry.upgrade_level ?? 0))}</span></div>}
                </div>
                {passiveIds.length > 0 && (
                  <div className="px-4 mt-4">
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ ...MONO, color: C.textDim }}>Pasivas</p>
                    <div className="flex flex-col gap-2">
                      {passiveIds.map(id => { const label = PASSIVE_LABELS[id]; return label ? <div key={id} className="p-2" style={{ background: 'rgba(80,20,80,0.20)', border: '2px solid #4a1060', boxShadow: C.shadowSm }}><p style={{ ...MONO, fontSize: '12px', fontWeight: 'bold', color: '#c084fc' }}>✦ {label.name}</p><p style={{ ...MONO, fontSize: '11px', color: C.textDim }}>{label.description}</p></div> : null })}
                    </div>
                  </div>
                )}
                {(entry.skill_slots ?? 0) > 0 && (
                  <div className="px-4 mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ ...MONO, color: C.textDim }}>Ranuras</p>
                      <span style={{ color: '#c084fc', fontSize: '13px' }}>{'◆'.repeat(entry.instance_passives?.length ?? 0)}{'◇'.repeat((entry.skill_slots ?? 0) - (entry.instance_passives?.length ?? 0))}<span style={{ color: C.textDim, fontSize: '11px', marginLeft: '4px' }}>({entry.instance_passives?.length ?? 0}/{entry.skill_slots})</span></span>
                    </div>
                    {(entry.instance_passives ?? []).length > 0
                      ? <div className="flex flex-col gap-2">{(entry.instance_passives ?? []).map(id => { const label = PASSIVE_LABELS[id]; return label ? <div key={id} className="p-2" style={{ background: 'rgba(80,20,80,0.20)', border: '2px solid #4a1060', boxShadow: C.shadowSm }}><p style={{ ...MONO, fontSize: '12px', fontWeight: 'bold', color: '#c084fc' }}>✦ {label.name}</p><p style={{ ...MONO, fontSize: '11px', color: C.textDim }}>{label.description}</p></div> : null })}</div>
                      : <p style={{ ...MONO, fontSize: '11px', color: C.textDim }}>Sin pasivas engastadas</p>}
                  </div>
                )}
                <div className="mt-auto p-4 flex flex-col gap-2 border-t-4" style={{ borderColor: C.border }}>
                  <button onClick={() => handleEquip(entry)} disabled={loading === entry.id}
                    style={{ ...MONO, width: '100%', padding: '10px', fontWeight: 'bold', fontSize: '13px', border: '4px solid', borderColor: loading === entry.id ? C.border : entry.equipped ? '#444' : C.borderHover, background: loading === entry.id ? 'rgba(20,5,5,0.5)' : entry.equipped ? 'rgba(40,40,40,0.6)' : 'rgba(80,25,5,0.85)', color: loading === entry.id ? C.textDim : C.goldBright, boxShadow: loading === entry.id ? 'none' : C.shadow, textShadow: '1px 1px 0 #000', cursor: loading === entry.id ? 'not-allowed' : 'pointer' }}>
                    {loading === entry.id ? '...' : entry.equipped ? 'Desequipar' : 'Equipar'}
                  </button>
                  <button onClick={() => handleToggleLock(entry)} disabled={lockingId === entry.id}
                    style={{ ...MONO, width: '100%', padding: '10px', fontWeight: 'bold', fontSize: '13px', border: '4px solid', borderColor: lockingId === entry.id ? C.border : entry.locked ? '#8B3500' : C.border, background: lockingId === entry.id ? 'rgba(20,5,5,0.5)' : entry.locked ? 'rgba(60,20,5,0.70)' : 'rgba(20,5,5,0.60)', color: lockingId === entry.id ? C.textDim : entry.locked ? '#ffa040' : C.textDim, boxShadow: lockingId === entry.id ? 'none' : C.shadow, textShadow: '1px 1px 0 #000', cursor: lockingId === entry.id ? 'not-allowed' : 'pointer' }}>
                    {lockingId === entry.id ? '...' : entry.locked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                  </button>
                </div>
              </>
            )
          })()}
        </div>

      </div>
    </div>
  )
}