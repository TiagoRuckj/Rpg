'use client'

import { useState } from 'react'
import { Player, InventoryEntry, calcUpgradeBonus, calcUpgradeGoldCost, UPGRADE_REQUIREMENTS } from '@/types/game'
import { smithUpgradeAction, smithEngraftAction } from '@/actions/smithAction'
import { PASSIVE_LABELS } from '@/lib/game/passiveLabels'
import { useToast, ToastContainer } from './Toast'
import ItemIcon from './ItemIcon'

interface Props {
  player: Player
  inventory: InventoryEntry[]
  onBack: () => void
  onPlayerUpdate: (player: Player) => void
  onInventoryUpdate: (inventory: InventoryEntry[]) => void
}

const STAR_COLORS: Record<number, string> = {
  1: 'text-gray-400',
  2: 'text-blue-400',
  3: 'text-purple-400',
  4: 'text-orange-400',
  5: 'text-yellow-400',
}

// Tipos de item que se pueden engastar
const ENGRAFTABLE_TYPES = new Set(['weapon', 'armor', 'ring', 'necklace'])

// Determina si un cristal es compatible con un item
function crystalCompatible(crystalType: string, itemType: string): boolean {
  if (crystalType === 'weapon') return itemType === 'weapon'
  if (crystalType === 'armor') return itemType === 'armor'
  if (crystalType === 'accessory') return itemType === 'ring' || itemType === 'necklace'
  return false
}

type SmithTab = 'upgrade' | 'engraft'

export default function SmithClient({ player, inventory, onBack, onPlayerUpdate, onInventoryUpdate }: Props) {
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [currentInventory, setCurrentInventory] = useState(inventory)
  const [selectedEntry, setSelectedEntry] = useState<InventoryEntry | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [engrafting, setEngrafting] = useState(false)
  const [selectedCrystalId, setSelectedCrystalId] = useState<number | null>(null)
  const [tab, setTab] = useState<SmithTab>('upgrade')
  const { toasts, addToast } = useToast()

  const weapons = currentInventory.filter(e => e.item?.type === 'weapon')

  function getMaterialName(itemId: number): string {
    const entry = currentInventory.find(e => e.item_id === itemId)
    return entry?.item?.name ?? `Item #${itemId}`
  }

  function getMaterialQuantity(itemId: number): number {
    const entry = currentInventory.find(e => e.item_id === itemId)
    return entry?.quantity ?? 0
  }

  // Cristales disponibles en el inventario
  const availableCrystals = currentInventory.filter(e =>
    e.item?.type === 'material' && e.item?.stats?.preset_passive && e.quantity > 0
  )

  // Cristales compatibles con el item seleccionado
  const compatibleCrystals = selectedEntry
    ? availableCrystals.filter(c => {
        const crystalType = c.item?.stats?.crystal_type ?? ''
        const passiveId = c.item?.stats?.preset_passive ?? ''
        const alreadyEngrafted = (selectedEntry.instance_passives ?? []).includes(passiveId)
        return crystalCompatible(crystalType, selectedEntry.item?.type ?? '') && !alreadyEngrafted
      })
    : []

  async function handleUpgrade() {
    if (!selectedEntry) return
    setUpgrading(true)

    const result = await smithUpgradeAction({ inventoryEntryId: selectedEntry.id })

    if (!result.success) {
      addToast(result.error ?? 'Error al mejorar', 'error')
      setUpgrading(false)
      return
    }

    // Actualizar inventario localmente
    const updatedInventory = currentInventory.map(e =>
      e.id === selectedEntry.id
        ? { ...e, upgrade_level: result.newUpgradeLevel! }
        : e
    )
    setCurrentInventory(updatedInventory)
    onInventoryUpdate(updatedInventory)

    // Actualizar gold del jugador
    const updatedPlayer = { ...currentPlayer, gold: currentPlayer.gold - (result.goldCost ?? goldCost) }
    setCurrentPlayer(updatedPlayer)
    onPlayerUpdate(updatedPlayer)

    // Actualizar selección
    const updatedEntry = updatedInventory.find(e => e.id === selectedEntry.id)
    if (updatedEntry) setSelectedEntry(updatedEntry)

    addToast(`✅ ¡${selectedEntry.item?.name} mejorado a +${result.newUpgradeLevel}!`, 'success')
    setUpgrading(false)
  }

  async function handleEngraft() {
    if (!selectedEntry || selectedCrystalId === null) return
    setEngrafting(true)
    const result = await smithEngraftAction({
      inventoryEntryId: selectedEntry.id,
      crystalInventoryId: selectedCrystalId,
    })
    if (!result.success) {
      addToast(result.error ?? 'Error al engastar', 'error')
      setEngrafting(false)
      return
    }
    const updatedInventory = currentInventory
      .map(e => e.id === selectedEntry.id ? { ...e, instance_passives: result.newInstancePassives! } : e)
      .filter(e => !(e.id === selectedCrystalId && e.quantity <= 1))
      .map(e => e.id === selectedCrystalId ? { ...e, quantity: e.quantity - 1 } : e)
    setCurrentInventory(updatedInventory)
    onInventoryUpdate(updatedInventory)
    const updatedEntry = updatedInventory.find(e => e.id === selectedEntry.id)
    if (updatedEntry) setSelectedEntry(updatedEntry)
    setSelectedCrystalId(null)
    addToast(`✅ ¡Pasiva engastada!`, 'success')
    setEngrafting(false)
  }

  const nextLevel = (selectedEntry?.upgrade_level ?? 0) + 1
  const requirements = selectedEntry ? UPGRADE_REQUIREMENTS[nextLevel] : null
  const goldCost = selectedEntry ? calcUpgradeGoldCost(selectedEntry.item?.value ?? 0, nextLevel) : 0
  const canUpgrade = requirements && nextLevel <= 5
  const hasGold = currentPlayer.gold >= goldCost
  const hasMaterials = requirements?.materials.every(mat =>
    mat.itemId === 0 || getMaterialQuantity(mat.itemId) >= mat.quantity
  ) ?? false

  // Datos para engaste
  const slotsFilled = selectedEntry?.instance_passives?.length ?? 0
  const slotsTotal = selectedEntry?.skill_slots ?? 0
  const hasSlots = slotsFilled < slotsTotal

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white" style={{ backgroundImage: 'url(/sprites/backgrounds/hub_background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="w-full h-screen flex flex-col max-w-2xl mx-auto overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 border-b-4 border-yellow-900 shrink-0" style={{ background: 'rgba(20,10,5,0.88)', boxShadow: '0 4px 0 #000' }}>
          <button onClick={onBack} className="text-yellow-700 hover:text-yellow-400 transition text-sm" style={{ fontFamily: 'monospace' }}>◀ Volver</button>
          <h1 className="text-lg font-bold text-orange-400 uppercase tracking-widest" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>🔨 Herrero</h1>
          <span className="ml-auto text-yellow-400 font-bold" style={{ fontFamily: 'monospace' }}>💰 {currentPlayer.gold}</span>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{ background: 'rgba(10,5,2,0.80)', borderBottom: '4px solid #4a3000' }}>
          {(['upgrade', 'engraft'] as SmithTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-sm font-bold transition"
              style={{
                fontFamily: 'monospace',
                color: tab === t ? '#f97316' : '#7a5a30',
                borderBottom: tab === t ? '4px solid #f97316' : '4px solid transparent',
                background: tab === t ? 'rgba(80,30,5,0.60)' : 'transparent',
                textShadow: tab === t ? '1px 1px 0 #000' : 'none',
              }}
            >
              {t === 'upgrade' ? '⬆️ Mejorar' : '✨ Engastar'}
            </button>
          ))}
        </div>

        <ToastContainer toasts={toasts} />

        {tab === 'upgrade' ? (
        <div className="flex flex-1 overflow-hidden" style={{ background: 'rgba(10,5,2,0.75)' }}>

          {/* Lista de armas */}
          <div className="w-1/2 border-r-4 border-yellow-900 p-4 overflow-y-auto">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Tus armas</h2>
            {weapons.length === 0 ? (
              <p className="text-gray-500 text-sm">No tenés armas en el inventario.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {weapons.map(entry => {
                  const item = entry.item!
                  const level = entry.upgrade_level ?? 0
                  const isSelected = selectedEntry?.id === entry.id
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition text-left ${
                        isSelected
                          ? 'border-orange-500 bg-orange-950/30'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <ItemIcon item={item} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">
                          ⚔️ {item.stats?.attack ?? 0} ataque
                          {level > 0 && (
                            <span className={`ml-2 font-bold ${STAR_COLORS[level]}`}>
                              {'★'.repeat(level)}{'☆'.repeat(5 - level)}
                            </span>
                          )}
                        </p>
                      </div>
                      {level > 0 && (
                        <span className={`text-sm font-bold ${STAR_COLORS[level]}`}>+{level}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Panel de mejora */}
          <div className="w-1/2 p-4 flex flex-col gap-4">
            {!selectedEntry ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-sm">Seleccioná un arma para mejorar</p>
              </div>
            ) : (
              <>
                {/* Info del arma */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="font-bold text-white">{selectedEntry.item?.name}</p>
                  {(() => {
                    const base = selectedEntry.item?.stats?.attack ?? 0
                    const level = selectedEntry.upgrade_level ?? 0
                    const bonus = calcUpgradeBonus(base, level)
                    const nextBonus = calcUpgradeBonus(base, nextLevel)
                    return (
                      <div className="mt-2 text-sm flex flex-col gap-1">
                        <p className="text-gray-400">
                          Ataque base: <span className="text-white font-bold">{base}</span>
                        </p>
                        {level > 0 && (
                          <p className="text-gray-400">
                            Bonus actual (+{level}): <span className={`font-bold ${STAR_COLORS[level]}`}>+{bonus}</span>
                          </p>
                        )}
                        {level > 0 && (
                          <p className="text-gray-400">
                            Ataque total: <span className="text-orange-400 font-bold">{base + bonus}</span>
                          </p>
                        )}
                      </div>
                    )
                  })()}
                  {(selectedEntry.upgrade_level ?? 0) > 0 && (
                    <div className={`mt-2 text-sm font-bold ${STAR_COLORS[selectedEntry.upgrade_level ?? 0]}`}>
                      {'★'.repeat(selectedEntry.upgrade_level ?? 0)}{'☆'.repeat(5 - (selectedEntry.upgrade_level ?? 0))}
                    </div>
                  )}
                </div>

                {/* Preview de la mejora */}
                {nextLevel <= 5 && (() => {
                  const base = selectedEntry.item?.stats?.attack ?? 0
                  const nextBonus = calcUpgradeBonus(base, nextLevel)
                  return (
                    <div className="bg-gray-800 rounded-lg p-4">
                      <p className="text-sm font-bold text-orange-400 mb-2">Mejora a +{nextLevel}</p>
                      <p className="text-sm text-gray-400">
                        Bonus: <span className={`font-bold ${STAR_COLORS[nextLevel]}`}>+{nextBonus}</span>
                        <span className="text-gray-500 ml-1">({nextLevel * 5}% — mín. {nextLevel * 3})</span>
                      </p>
                      <p className="text-sm text-gray-400">
                        Ataque resultante: <span className="text-white font-bold">{base + nextBonus}</span>
                      </p>
                    </div>
                  )
                })()}

                {/* Materiales requeridos */}
                {canUpgrade && requirements ? (
                  <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-2">
                    <p className="text-sm font-bold text-gray-400 mb-1">Materiales requeridos</p>
                    <div className={`flex justify-between text-sm ${hasGold ? 'text-gray-300' : 'text-red-400'}`}>
                      <span>💰 Gold</span>
                      <span>{currentPlayer.gold} / {goldCost}</span>
                    </div>
                    {requirements.materials.filter(m => m.itemId !== 0).map((mat, i) => {
                      const have = getMaterialQuantity(mat.itemId)
                      const enough = have >= mat.quantity
                      return (
                        <div key={i} className={`flex justify-between text-sm ${enough ? 'text-gray-300' : 'text-red-400'}`}>
                          <span>{getMaterialName(mat.itemId)}</span>
                          <span>{have} / {mat.quantity}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : nextLevel > 5 ? (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-sm text-yellow-400 font-bold text-center">⭐ Arma al nivel máximo</p>
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-sm text-gray-500 text-center">Mejora +{nextLevel} no disponible aún</p>
                  </div>
                )}

                {/* Botón */}
                {canUpgrade && (
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading || !hasGold || !hasMaterials}
                    className={`w-full py-3 rounded-lg font-bold transition ${
                      upgrading || !hasGold || !hasMaterials
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-orange-500 hover:bg-orange-400 text-black'
                    }`}
                  >
                    {upgrading ? 'Mejorando...' : `🔨 Mejorar a +${nextLevel} (${goldCost} gold)`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        ) : (
        /* ── Tab Engastar ── */
        <div className="flex flex-1 overflow-hidden" style={{ background: 'rgba(10,5,2,0.75)' }}>

          {/* Lista de items equipables */}
          <div className="w-1/2 border-r-4 border-yellow-900 p-4 overflow-y-auto">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Tus items</h2>
            {weapons.length === 0 ? (
              <p className="text-gray-500 text-sm">No tenés items en el inventario.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {currentInventory.filter(e => ['weapon','armor','ring','necklace'].includes(e.item?.type ?? '')).map(entry => {
                  const item = entry.item!
                  const slots = entry.skill_slots ?? 0
                  const filled = entry.instance_passives?.length ?? 0
                  const isSelected = selectedEntry?.id === entry.id
                  return (
                    <button
                      key={entry.id}
                      onClick={() => { setSelectedEntry(entry); setSelectedCrystalId(null) }}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition text-left ${
                        isSelected ? 'border-violet-500 bg-violet-950/30' : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <ItemIcon item={item} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">
                          {slots === 0 ? 'Sin ranuras' : `${filled}/${slots} ranuras`}
                        </p>
                      </div>
                      {slots > 0 && (
                        <span className={`text-xs font-bold ${filled < slots ? 'text-violet-400' : 'text-gray-500'}`}>
                          {'◆'.repeat(filled)}{'◇'.repeat(slots - filled)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Panel de engaste */}
          <div className="w-1/2 p-4 flex flex-col gap-4 overflow-y-auto">
            {!selectedEntry ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-sm">Seleccioná un item para engastar</p>
              </div>
            ) : (
              <>
                {/* Info ranuras */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="font-bold text-white">{selectedEntry.item?.name}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Ranuras: <span className="text-violet-400 font-bold">{slotsFilled}/{slotsTotal}</span>
                  </p>
                  {slotsTotal === 0 && (
                    <p className="text-xs text-gray-500 mt-1">Este item no tiene ranuras de habilidad</p>
                  )}
                  {(selectedEntry.instance_passives ?? []).length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {(selectedEntry.instance_passives ?? []).map(id => {
                        const label = PASSIVE_LABELS[id]
                        return label ? (
                          <div key={id} className="text-xs">
                            <span className="text-violet-300 font-semibold">✦ {label.name}</span>
                          </div>
                        ) : null
                      })}
                    </div>
                  )}
                </div>

                {hasSlots ? (
                  <>
                    {/* Cristales compatibles disponibles */}
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Cristales disponibles ({compatibleCrystals.length})
                      </p>
                      {compatibleCrystals.length === 0 ? (
                        <p className="text-gray-500 text-sm">No tenés cristales compatibles</p>
                      ) : compatibleCrystals.map(crystal => {
                        const passiveId = crystal.item?.stats?.preset_passive ?? ''
                        const label = PASSIVE_LABELS[passiveId]
                        const isSelected = selectedCrystalId === crystal.id
                        return (
                          <button
                            key={crystal.id}
                            onClick={() => setSelectedCrystalId(isSelected ? null : crystal.id)}
                            className={`p-3 rounded-lg border text-left transition ${
                              isSelected
                                ? 'border-violet-500 bg-violet-950/30'
                                : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-bold text-white">{crystal.item?.name}</p>
                              <span className="text-xs text-gray-500">×{crystal.quantity}</span>
                            </div>
                            {label && (
                              <>
                                <p className="text-xs font-semibold text-violet-300 mt-1">✦ {label.name}</p>
                                <p className="text-xs text-gray-400">{label.description}</p>
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {selectedCrystalId !== null && (
                      <button
                        onClick={handleEngraft}
                        disabled={engrafting}
                        className={`w-full py-3 rounded-lg font-bold transition ${
                          engrafting
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-violet-600 hover:bg-violet-500 text-white'
                        }`}
                      >
                        {engrafting ? 'Engastando...' : '✨ Engastar cristal'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-sm text-gray-500 text-center">
                      {slotsTotal === 0
                        ? 'Este item no tiene ranuras de habilidad'
                        : 'Todas las ranuras están ocupadas'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}