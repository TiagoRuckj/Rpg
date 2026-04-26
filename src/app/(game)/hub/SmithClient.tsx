'use client'
import BgImage from './BgImage'

import { useState } from 'react'
import { Player, InventoryEntry, calcUpgradeBonus, calcUpgradeGoldCost, UPGRADE_REQUIREMENTS } from '@/types/game'
import { smithUpgradeAction, smithEngraftAction } from '@/actions/smithAction'
import { PASSIVE_LABELS } from '@/lib/game/passiveLabels'
import { useToast, ToastContainer } from './Toast'
import ItemIcon from './ItemIcon'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

const C = {
  border:       '#3a1a00',
  borderFire:   '#c2410c',
  borderHover:  '#ea580c',
  borderViolet: '#6d28d9',
  bg:           'rgba(8,3,0,0.92)',
  bgHeader:     'rgba(10,4,0,0.96)',
  bgCard:       'rgba(20,8,0,0.85)',
  bgCardActive: 'rgba(60,20,0,0.85)',
  bgCardViolet: 'rgba(40,10,60,0.85)',
  text:         '#c87040',
  textDim:      '#6a3010',
  fire:         '#f97316',
  gold:         '#fbbf24',
  violet:       '#a78bfa',
  shadow:       '4px 4px 0 #000',
  shadowSm:     '2px 2px 0 #000',
}

const STAR_COLORS: Record<number, string> = {
  1: '#9ca3af', 2: '#60a5fa', 3: '#a78bfa', 4: '#fb923c', 5: '#fbbf24',
}

function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, ${color}, transparent)` }} />
      <span style={{ ...MONO, fontSize: '10px', color, letterSpacing: '0.10em' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, ${color}, transparent)` }} />
    </div>
  )
}

type SmithTab = 'upgrade' | 'engraft'

interface Props {
  player: Player
  inventory: InventoryEntry[]
  onBack: () => void
  onPlayerUpdate: (player: Player) => void
  onInventoryUpdate: (inventory: InventoryEntry[]) => void
}

function crystalCompatible(crystalType: string, itemType: string): boolean {
  if (crystalType === 'weapon') return itemType === 'weapon'
  if (crystalType === 'armor') return itemType === 'armor'
  if (crystalType === 'accessory') return itemType === 'ring' || itemType === 'necklace'
  return false
}

export default function SmithClient({ player, inventory, onBack, onPlayerUpdate, onInventoryUpdate }: Props) {
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [currentInventory, setCurrentInventory] = useState(inventory)
  const [selectedEntry, setSelectedEntry] = useState<InventoryEntry | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [engrafting, setEngrafting] = useState(false)
  const [selectedCrystalId, setSelectedCrystalId] = useState<number | null>(null)
  const [tab, setTab] = useState<SmithTab>('upgrade')
  const { toasts, addToast } = useToast()

  const upgradeableItems = currentInventory.filter(e => e.item?.type === 'weapon')
  const engraftableItems = currentInventory.filter(e => ['weapon','armor','ring','necklace'].includes(e.item?.type ?? ''))
  const availableCrystals = currentInventory.filter(e =>
    e.item?.type === 'material' && ((e.item?.stats) as any)?.preset_passive && e.quantity > 0
  )
  const compatibleCrystals = selectedEntry
    ? availableCrystals.filter(c => {
        const crystalType = ((c.item?.stats) as any)?.crystal_type ?? ''
        const passiveId = ((c.item?.stats) as any)?.preset_passive ?? ''
        return crystalCompatible(crystalType, selectedEntry.item?.type ?? '') &&
          !(selectedEntry.instance_passives ?? []).includes(passiveId)
      })
    : []

  function getMat(itemId: number) {
    const e = currentInventory.find(e => e.item_id === itemId)
    return { name: e?.item?.name ?? `#${itemId}`, qty: e?.quantity ?? 0 }
  }

  async function handleUpgrade() {
    if (!selectedEntry) return
    setUpgrading(true)
    const result = await smithUpgradeAction({ inventoryEntryId: selectedEntry.id })
    if (!result.success) { addToast(result.error ?? 'Error al mejorar', 'error'); setUpgrading(false); return }
    const updatedInventory = currentInventory.map(e => e.id === selectedEntry.id ? { ...e, upgrade_level: result.newUpgradeLevel! } : e)
    setCurrentInventory(updatedInventory); onInventoryUpdate(updatedInventory)
    const updatedPlayer = { ...currentPlayer, gold: currentPlayer.gold - (result.goldCost ?? goldCost) }
    setCurrentPlayer(updatedPlayer); onPlayerUpdate(updatedPlayer)
    const updatedEntry = updatedInventory.find(e => e.id === selectedEntry.id)
    if (updatedEntry) setSelectedEntry(updatedEntry)
    addToast(`✅ ${selectedEntry.item?.name} mejorado a +${result.newUpgradeLevel}!`, 'success')
    setUpgrading(false)
  }

  async function handleEngraft() {
    if (!selectedEntry || selectedCrystalId === null) return
    setEngrafting(true)
    const result = await smithEngraftAction({ inventoryEntryId: selectedEntry.id, crystalInventoryId: selectedCrystalId })
    if (!result.success) { addToast(result.error ?? 'Error al engastar', 'error'); setEngrafting(false); return }
    const updatedInventory = currentInventory
      .map(e => e.id === selectedEntry.id ? { ...e, instance_passives: result.newInstancePassives! } : e)
      .filter(e => !(e.id === selectedCrystalId && e.quantity <= 1))
      .map(e => e.id === selectedCrystalId ? { ...e, quantity: e.quantity - 1 } : e)
    setCurrentInventory(updatedInventory); onInventoryUpdate(updatedInventory)
    const updatedEntry = updatedInventory.find(e => e.id === selectedEntry.id)
    if (updatedEntry) setSelectedEntry(updatedEntry)
    setSelectedCrystalId(null)
    addToast('✅ ¡Pasiva engastada!', 'success')
    setEngrafting(false)
  }

  const nextLevel = (selectedEntry?.upgrade_level ?? 0) + 1
  const requirements = selectedEntry ? UPGRADE_REQUIREMENTS[nextLevel] : null
  const goldCost = selectedEntry ? calcUpgradeGoldCost(selectedEntry.item?.value ?? 0, nextLevel) : 0
  const canUpgrade = !!requirements && nextLevel <= 5
  const hasGold = currentPlayer.gold >= goldCost
  const hasMaterials = requirements?.materials.every(mat => mat.itemId === 0 || getMat(mat.itemId).qty >= mat.quantity) ?? false
  const slotsFilled = selectedEntry?.instance_passives?.length ?? 0
  const slotsTotal = selectedEntry?.skill_slots ?? 0
  const hasSlots = slotsFilled < slotsTotal

  const listItems = tab === 'upgrade' ? upgradeableItems : engraftableItems
  const activeColor = tab === 'upgrade' ? C.borderFire : C.borderViolet

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white">
      <BgImage src="/sprites/backgrounds/smithy_background.png" />
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-4 shrink-0"
        style={{ background: C.bgHeader, borderColor: C.border, boxShadow: '0 4px 0 #000', position: 'relative', zIndex: 1 }}>
        <button onClick={onBack} className="font-bold text-sm transition-all"
          style={{ ...MONO, border: `3px solid ${C.border}`, background: 'rgba(30,10,0,0.80)', color: C.text, padding: '4px 14px', boxShadow: C.shadowSm, textShadow: '1px 1px 0 #000' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.fire }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}>
          ◀ Volver
        </button>
        <h1 className="font-bold text-lg uppercase tracking-widest" style={{ ...MONO, color: C.fire, textShadow: '2px 2px 0 #000' }}>🔨 Herrero</h1>
        <div className="ml-auto">
          <span style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: C.gold, textShadow: '2px 2px 0 #000', padding: '2px 12px', border: `3px solid ${C.border}`, background: 'rgba(40,20,0,0.70)', boxShadow: C.shadowSm }}>
            💰 {currentPlayer.gold}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b-4" style={{ borderColor: C.border, background: 'rgba(5,2,0,0.92)', position: 'relative', zIndex: 1 }}>
        {([{ id: 'upgrade', label: '⬆️ Mejorar' }, { id: 'engraft', label: '✨ Engastar' }] as const).map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedEntry(null); setSelectedCrystalId(null) }}
            className="flex-1 py-2.5 text-sm font-bold transition"
            style={{ ...MONO, background: tab === t.id ? 'rgba(60,20,0,0.80)' : 'transparent', color: tab === t.id ? C.fire : C.textDim, borderBottom: tab === t.id ? `3px solid ${C.borderFire}` : '3px solid transparent', textShadow: tab === t.id ? '1px 1px 0 #000' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>

        {/* Left col — item grid */}
        <div className="w-96 shrink-0 flex flex-col border-r-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(8,3,0,0.90)', borderColor: C.border, boxShadow: '4px 0 0 #000' }}>
          <div className="p-2">
            <p style={{ ...MONO, fontSize: '10px', color: C.textDim, letterSpacing: '0.10em', marginBottom: '8px', paddingLeft: '4px' }}>
              {tab === 'upgrade' ? 'ARMAS' : 'ITEMS'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {listItems.map(entry => {
                const isSelected = selectedEntry?.id === entry.id
                return (
                  <button key={entry.id}
                    onClick={() => { setSelectedEntry(entry); setSelectedCrystalId(null) }}
                    style={{ border: 'none', background: 'transparent', outline: isSelected ? `3px solid ${activeColor}` : 'none', outlineOffset: '2px', boxShadow: isSelected ? `0 0 8px ${activeColor}44` : 'none', padding: '4px', transition: 'outline-color 0.12s', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', WebkitTapHighlightColor: 'transparent' }}
                    className="focus:outline-none active:outline-none">
                    <ItemIcon item={entry.item!} upgradeLevel={entry.upgrade_level ?? 0} size="lg" equipped={entry.equipped} skillSlots={entry.skill_slots ?? 0} instancePassives={entry.instance_passives ?? []} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right col — action panel */}
        <div className="flex-1 overflow-y-auto p-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(5,2,0,0.70)' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {!selectedEntry ? (
              <div className="flex items-center justify-center" style={{ height: '200px' }}>
                <p style={{ ...MONO, color: C.textDim, fontSize: '13px' }}>
                  {tab === 'upgrade' ? 'Seleccioná un arma para mejorar' : 'Seleccioná un item para engastar'}
                </p>
              </div>
            ) : tab === 'upgrade' ? (
              <>
                <SectionDivider label="ARMA SELECCIONADA" color={C.borderFire} />

                <div className="flex gap-4 items-start p-4" style={{ background: C.bgCard, border: `3px solid ${C.border}`, boxShadow: C.shadow }}>
                  <ItemIcon item={selectedEntry.item!} upgradeLevel={selectedEntry.upgrade_level ?? 0} size="xl" equipped={selectedEntry.equipped} />
                  <div className="flex-1 flex flex-col gap-2">
                    <p style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: '#fff', textShadow: '1px 1px 0 #000' }}>
                      {selectedEntry.item?.name}
                      {(selectedEntry.upgrade_level ?? 0) > 0 && <span style={{ color: STAR_COLORS[selectedEntry.upgrade_level ?? 0], marginLeft: '8px' }}>+{selectedEntry.upgrade_level}</span>}
                    </p>
                    {(() => {
                      const base = selectedEntry.item?.stats?.attack ?? 0
                      const level = selectedEntry.upgrade_level ?? 0
                      const bonus = calcUpgradeBonus(base, level)
                      return (
                        <div className="flex gap-4 flex-wrap">
                          <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Base: <span style={{ color: C.text, fontWeight: 'bold' }}>{base}</span></span>
                          {level > 0 && <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Bonus: <span style={{ color: STAR_COLORS[level], fontWeight: 'bold' }}>+{bonus}</span></span>}
                          {level > 0 && <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Total: <span style={{ color: C.fire, fontWeight: 'bold' }}>{base + bonus}</span></span>}
                          {level > 0 && <span style={{ fontSize: '14px', color: STAR_COLORS[level] }}>{'★'.repeat(level)}{'☆'.repeat(5 - level)}</span>}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {nextLevel <= 5 ? (
                  <>
                    <SectionDivider label={`MEJORA A +${nextLevel}`} color={C.borderFire} />

                    <div className="p-4" style={{ background: C.bgCard, border: `3px solid ${C.border}`, boxShadow: C.shadowSm }}>
                      {(() => {
                        const base = selectedEntry.item?.stats?.attack ?? 0
                        const nextBonus = calcUpgradeBonus(base, nextLevel)
                        return (
                          <div className="flex gap-6 flex-wrap">
                            <span style={{ ...MONO, fontSize: '13px', color: C.textDim }}>Nuevo bonus: <span style={{ color: STAR_COLORS[nextLevel], fontWeight: 'bold' }}>+{nextBonus}</span></span>
                            <span style={{ ...MONO, fontSize: '13px', color: C.textDim }}>Ataque: <span style={{ color: C.fire, fontWeight: 'bold' }}>{base + nextBonus}</span></span>
                            <span style={{ fontSize: '13px', color: STAR_COLORS[nextLevel] }}>{'★'.repeat(nextLevel)}{'☆'.repeat(5 - nextLevel)}</span>
                          </div>
                        )
                      })()}
                    </div>

                    <div className="p-4 flex flex-col gap-2" style={{ background: C.bgCard, border: `3px solid ${C.border}`, boxShadow: C.shadowSm }}>
                      <p style={{ ...MONO, fontSize: '11px', color: C.textDim, letterSpacing: '0.08em' }}>MATERIALES REQUERIDOS</p>
                      <div className="flex justify-between" style={MONO}>
                        <span style={{ fontSize: '13px', color: hasGold ? C.text : '#f87171' }}>💰 Oro</span>
                        <span style={{ fontSize: '13px', color: hasGold ? C.gold : '#f87171', fontWeight: 'bold' }}>{currentPlayer.gold} / {goldCost}</span>
                      </div>
                      {requirements?.materials.filter(m => m.itemId !== 0).map((mat, i) => {
                        const { name, qty } = getMat(mat.itemId)
                        const enough = qty >= mat.quantity
                        return (
                          <div key={i} className="flex justify-between" style={MONO}>
                            <span style={{ fontSize: '13px', color: enough ? C.text : '#f87171' }}>{name}</span>
                            <span style={{ fontSize: '13px', color: enough ? C.gold : '#f87171', fontWeight: 'bold' }}>{qty} / {mat.quantity}</span>
                          </div>
                        )
                      })}
                    </div>

                    <button onClick={handleUpgrade} disabled={upgrading || !hasGold || !hasMaterials}
                      style={{ ...MONO, width: '100%', padding: '14px', fontSize: '15px', fontWeight: 'bold', border: '4px solid', borderColor: upgrading || !hasGold || !hasMaterials ? C.border : C.borderFire, background: upgrading || !hasGold || !hasMaterials ? 'rgba(20,8,0,0.50)' : 'rgba(120,40,0,0.90)', color: upgrading || !hasGold || !hasMaterials ? C.textDim : C.gold, boxShadow: upgrading || !hasGold || !hasMaterials ? 'none' : `${C.shadow}, 0 0 16px rgba(234,88,12,0.30)`, textShadow: '1px 1px 0 #000', cursor: upgrading || !hasGold || !hasMaterials ? 'not-allowed' : 'pointer' }}>
                      {upgrading ? '🔨 Mejorando...' : `🔨 Mejorar a +${nextLevel}`}
                    </button>
                  </>
                ) : (
                  <div className="p-4 text-center" style={{ background: C.bgCard, border: `3px solid ${C.borderFire}`, boxShadow: C.shadow }}>
                    <p style={{ ...MONO, fontSize: '15px', color: C.gold, textShadow: '1px 1px 0 #000' }}>⭐ Nivel máximo alcanzado</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <SectionDivider label="ITEM SELECCIONADO" color={C.borderViolet} />

                <div className="flex gap-4 items-start p-4" style={{ background: C.bgCard, border: `3px solid ${C.border}`, boxShadow: C.shadow }}>
                  <ItemIcon item={selectedEntry.item!} upgradeLevel={selectedEntry.upgrade_level ?? 0} skillSlots={slotsTotal} instancePassives={selectedEntry.instance_passives ?? []} size="xl" />
                  <div className="flex-1 flex flex-col gap-2">
                    <p style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: '#fff', textShadow: '1px 1px 0 #000' }}>{selectedEntry.item?.name}</p>
                    <p style={{ ...MONO, fontSize: '13px', color: slotsTotal === 0 ? C.textDim : C.violet }}>
                      Ranuras: {slotsFilled}/{slotsTotal} {'◆'.repeat(slotsFilled)}{'◇'.repeat(slotsTotal - slotsFilled)}
                    </p>
                    {(selectedEntry.instance_passives ?? []).map(id => {
                      const label = PASSIVE_LABELS[id]
                      return label ? <p key={id} style={{ ...MONO, fontSize: '12px', color: C.violet }}>✦ {label.name}</p> : null
                    })}
                  </div>
                </div>

                {slotsTotal === 0 ? (
                  <div className="p-4 text-center" style={{ background: C.bgCard, border: `2px solid ${C.border}` }}>
                    <p style={{ ...MONO, fontSize: '13px', color: C.textDim }}>Este item no tiene ranuras de habilidad</p>
                  </div>
                ) : !hasSlots ? (
                  <div className="p-4 text-center" style={{ background: C.bgCard, border: `2px solid ${C.border}` }}>
                    <p style={{ ...MONO, fontSize: '13px', color: C.textDim }}>Todas las ranuras están ocupadas</p>
                  </div>
                ) : (
                  <>
                    <SectionDivider label="CRISTALES COMPATIBLES" color={C.borderViolet} />

                    {compatibleCrystals.length === 0 ? (
                      <p style={{ ...MONO, fontSize: '13px', color: C.textDim, textAlign: 'center', padding: '16px 0' }}>No tenés cristales compatibles</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {compatibleCrystals.map(crystal => {
                          const passiveId = ((crystal.item?.stats) as any)?.preset_passive ?? ''
                          const label = PASSIVE_LABELS[passiveId]
                          const isSel = selectedCrystalId === crystal.id
                          return (
                            <button key={crystal.id} onClick={() => setSelectedCrystalId(isSel ? null : crystal.id)}
                              className="p-4 text-left transition-all"
                              style={{ border: `3px solid ${isSel ? C.borderViolet : C.border}`, background: isSel ? C.bgCardViolet : C.bgCard, boxShadow: isSel ? `${C.shadowSm}, 0 0 8px rgba(109,40,217,0.30)` : 'none', transition: 'border-color 0.12s' }}>
                              <div className="flex justify-between items-start mb-1">
                                <p style={{ ...MONO, fontSize: '14px', fontWeight: 'bold', color: '#fff', textShadow: '1px 1px 0 #000' }}>{crystal.item?.name}</p>
                                <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>×{crystal.quantity}</span>
                              </div>
                              {label && (
                                <>
                                  <p style={{ ...MONO, fontSize: '13px', color: C.violet, fontWeight: 'bold' }}>✦ {label.name}</p>
                                  <p style={{ ...MONO, fontSize: '12px', color: C.textDim, marginTop: '2px' }}>{label.description}</p>
                                </>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {selectedCrystalId !== null && (
                      <button onClick={handleEngraft} disabled={engrafting}
                        style={{ ...MONO, width: '100%', padding: '14px', fontSize: '15px', fontWeight: 'bold', border: `4px solid ${C.borderViolet}`, background: 'rgba(60,10,100,0.90)', color: C.violet, boxShadow: `${C.shadow}, 0 0 16px rgba(109,40,217,0.30)`, textShadow: '1px 1px 0 #000', cursor: engrafting ? 'not-allowed' : 'pointer', opacity: engrafting ? 0.5 : 1 }}>
                        {engrafting ? '✨ Engastando...' : '✨ Engastar cristal'}
                      </button>
                    )}
                  </>
                )}
              </>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}