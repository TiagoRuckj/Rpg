'use client'
import BgImage from './BgImage'

import { useState } from 'react'
import { Player, Item, InventoryEntry } from '@/types/game'
import { buyCartAction, sellCartAction } from '@/actions/shopActions'
import { useToast, ToastContainer } from './Toast'
import ItemIcon from './ItemIcon'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

// Paleta acorde a la armería — marrón oscuro, dorado ámbar, rojo vino
const C = {
  border:      '#3a2008',
  borderGold:  '#92400e',
  borderHover: '#c8600a',
  borderRed:   '#7f1d1d',
  borderGreen: '#14532d',
  bg:          'rgba(8,4,2,0.92)',
  bgHeader:    'rgba(10,5,2,0.96)',
  bgCard:      'rgba(15,7,3,0.85)',
  bgActive:    'rgba(60,25,5,0.85)',
  text:        '#c8906a',
  textDim:     '#7a4820',
  gold:        '#fbbf24',
  goldDim:     '#78530a',
  shadow:      '4px 4px 0 #000',
  shadowSm:    '2px 2px 0 #000',
}

const NON_STACKABLE = new Set(['weapon', 'armor', 'ring', 'necklace'])

interface Props {
  player: Player
  shopItems: Item[]
  inventory: InventoryEntry[]
  onBack: () => void
  onPlayerUpdate: (player: Player, inventory: InventoryEntry[]) => void
}

type Tab = 'buy' | 'sell'

export default function ShopClient({ player, shopItems, inventory: initialInventory, onBack, onPlayerUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('buy')
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [inventory, setInventory] = useState(initialInventory)
  const [loading, setLoading] = useState(false)
  const { toasts, addToast } = useToast()
  const [buyCart, setBuyCart] = useState<Record<number, number>>({})
  const [sellCart, setSellCart] = useState<Record<number, number>>({})

  // ── Compra ──────────────────────────────────────────────────────────────────
  function addToBuyCart(item: Item) { setBuyCart(prev => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 })) }
  function removeFromBuyCart(itemId: number) {
    setBuyCart(prev => { const n = { ...prev }; if ((n[itemId] ?? 0) <= 1) delete n[itemId]; else n[itemId]--; return n })
  }
  const buyTotal = shopItems.reduce((s, i) => s + i.value * (buyCart[i.id] ?? 0), 0)
  const buyCount = Object.values(buyCart).reduce((a, b) => a + b, 0)
  const canAffordCart = currentPlayer.gold >= buyTotal

  async function handleConfirmBuy() {
    if (buyCount === 0 || !canAffordCart) return
    setLoading(true)
    const result = await buyCartAction(buyCart)
    if (!result.success) { addToast(result.error ?? 'Error al comprar', 'error'); setLoading(false); return }
    const updatedPlayer = { ...currentPlayer, gold: currentPlayer.gold - result.goldSpent }
    const updatedInventory = (result.freshInventory ?? []).map((e: any) => ({ ...e, item: e.items }))
    setCurrentPlayer(updatedPlayer); setInventory(updatedInventory); onPlayerUpdate(updatedPlayer, updatedInventory)
    setBuyCart({}); addToast(`✅ Compra confirmada — ${result.goldSpent} 💰 gastados`, 'success')
    setLoading(false)
  }

  // ── Venta ───────────────────────────────────────────────────────────────────
  const sellableItems = inventory.filter(e => e.item && !e.equipped && !e.locked)
  const lockedItems = inventory.filter(e => e.item && !e.equipped && e.locked)
  function addToSellCart(entry: InventoryEntry) {
    if (!entry.item || entry.equipped) return
    setSellCart(prev => { const c = prev[entry.id] ?? 0; if (c >= entry.quantity) return prev; return { ...prev, [entry.id]: c + 1 } })
  }
  function removeFromSellCart(entryId: number) {
    setSellCart(prev => { const n = { ...prev }; if ((n[entryId] ?? 0) <= 1) delete n[entryId]; else n[entryId]--; return n })
  }
  const sellTotal = sellableItems.reduce((s, e) => s + Math.floor((e.item?.value ?? 0) * 0.5) * (sellCart[e.id] ?? 0), 0)
  const sellCount = Object.values(sellCart).reduce((a, b) => a + b, 0)

  async function handleConfirmSell() {
    if (sellCount === 0) return
    setLoading(true)
    const result = await sellCartAction(sellCart)
    if (!result.success) { addToast(result.error ?? 'Error al vender', 'error'); setLoading(false); return }
    const updatedPlayer = { ...currentPlayer, gold: currentPlayer.gold + result.goldGained }
    let updatedInventory = [...inventory]
    for (const [idStr, qty] of Object.entries(sellCart)) {
      const id = Number(idStr); const entry = updatedInventory.find(e => e.id === id); if (!entry) continue
      const stackable = !NON_STACKABLE.has(entry.item?.type ?? '')
      if (!stackable || entry.quantity <= qty) updatedInventory = updatedInventory.filter(e => e.id !== id)
      else updatedInventory = updatedInventory.map(e => e.id === id ? { ...e, quantity: e.quantity - qty } : e)
    }
    setCurrentPlayer(updatedPlayer); setInventory(updatedInventory); onPlayerUpdate(updatedPlayer, updatedInventory)
    setSellCart({}); addToast(`✅ Venta confirmada — +${result.goldGained} 💰`, 'success')
    setLoading(false)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white">
      <BgImage src="/sprites/backgrounds/store_background.png" />
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b-4 shrink-0"
        style={{ background: C.bgHeader, borderColor: C.border, boxShadow: '0 4px 0 #000', position: 'relative', zIndex: 1 }}>
        <button onClick={onBack}
          className="font-bold text-sm transition-all"
          style={{ ...MONO, border: `3px solid ${C.border}`, background: 'rgba(30,12,4,0.80)', color: C.text, padding: '4px 14px', boxShadow: C.shadowSm, textShadow: '1px 1px 0 #000' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.gold }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}>
          ◀ Volver
        </button>
        <h1 className="font-bold text-lg uppercase tracking-widest" style={{ ...MONO, color: C.gold, textShadow: '2px 2px 0 #000' }}>
          ⚔️ Armería
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Oro</span>
          <span style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: C.gold, textShadow: '2px 2px 0 #000', padding: '2px 12px', border: `3px solid ${C.borderGold}`, background: 'rgba(40,20,0,0.70)', boxShadow: C.shadowSm }}>
            💰 {currentPlayer.gold}
          </span>
        </div>
      </div>

      {/* Layout principal */}
      <div className="flex flex-1 overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Col izquierda: carrito / resumen ── */}
        <div className="w-64 shrink-0 flex flex-col border-r-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(8,4,2,0.92)', borderColor: C.border, boxShadow: '4px 0 0 #000' }}>

          {/* Tabs Comprar / Vender */}
          <div className="flex border-b-4" style={{ borderColor: C.border }}>
            {([{ id: 'buy', label: '🛒 Comprar' }, { id: 'sell', label: '💸 Vender' }] as const).map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); t.id === 'buy' ? setSellCart({}) : setBuyCart({}) }}
                className="flex-1 py-3 text-sm font-bold transition"
                style={{
                  ...MONO,
                  background: tab === t.id ? 'rgba(60,25,5,0.85)' : 'rgba(10,5,2,0.70)',
                  color: tab === t.id ? C.gold : C.textDim,
                  borderBottom: tab === t.id ? `3px solid ${C.borderGold}` : 'none',
                  textShadow: tab === t.id ? '1px 1px 0 #000' : 'none',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Resumen carrito */}
          <div className="flex-1 flex flex-col p-4 gap-3">
            <p style={{ ...MONO, fontSize: '10px', color: C.gold, letterSpacing: '0.10em', textShadow: '1px 1px 0 #000', padding: '2px 8px', background: 'rgba(0,0,0,0.60)', border: `2px solid ${C.border}`, display: 'inline-block' }}>
              {tab === 'buy' ? 'CARRITO DE COMPRA' : 'CARRITO DE VENTA'}
            </p>

            {tab === 'buy' && buyCount === 0 && (
              <p style={{ ...MONO, fontSize: '12px', color: C.text, textAlign: 'center', padding: '12px 8px', background: 'rgba(0,0,0,0.50)', border: `2px solid ${C.border}`, textShadow: '1px 1px 0 #000' }}>
                Click en un item para agregar al carrito
              </p>
            )}
            {tab === 'sell' && sellCount === 0 && (
              <p style={{ ...MONO, fontSize: '12px', color: C.text, textAlign: 'center', padding: '12px 8px', background: 'rgba(0,0,0,0.50)', border: `2px solid ${C.border}`, textShadow: '1px 1px 0 #000' }}>
                Click en un item para vender
              </p>
            )}

            {/* Items en carrito de compra */}
            {tab === 'buy' && buyCount > 0 && (
              <div className="flex flex-col gap-2">
                {shopItems.filter(i => (buyCart[i.id] ?? 0) > 0).map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5"
                    style={{ background: 'rgba(0,0,0,0.45)', border: `2px solid ${C.border}`, boxShadow: C.shadowSm }}>
                    <span style={{ ...MONO, fontSize: '12px', color: C.text, flex: 1 }}>{item.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => removeFromBuyCart(item.id)} style={{ ...MONO, color: C.textDim, fontSize: '14px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = C.textDim}>−</button>
                      <span style={{ ...MONO, fontSize: '12px', color: C.gold, minWidth: '16px', textAlign: 'center' }}>{buyCart[item.id]}</span>
                      <button onClick={() => addToBuyCart(item)} style={{ ...MONO, color: C.textDim, fontSize: '14px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#4ade80'}
                        onMouseLeave={e => e.currentTarget.style.color = C.textDim}>+</button>
                    </div>
                    <span style={{ ...MONO, fontSize: '11px', color: C.gold }}>{item.value * buyCart[item.id]} 💰</span>
                  </div>
                ))}
              </div>
            )}

            {/* Items en carrito de venta */}
            {tab === 'sell' && sellCount > 0 && (
              <div className="flex flex-col gap-2">
                {sellableItems.filter(e => (sellCart[e.id] ?? 0) > 0).map(entry => {
                  const price = Math.floor((entry.item?.value ?? 0) * 0.5)
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-2 px-2 py-1.5"
                      style={{ background: 'rgba(0,0,0,0.45)', border: `2px solid ${C.border}`, boxShadow: C.shadowSm }}>
                      <span style={{ ...MONO, fontSize: '12px', color: C.text, flex: 1 }}>{entry.item?.name}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => removeFromSellCart(entry.id)} style={{ ...MONO, color: C.textDim, fontSize: '14px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = C.textDim}>−</button>
                        <span style={{ ...MONO, fontSize: '12px', color: C.gold, minWidth: '16px', textAlign: 'center' }}>{sellCart[entry.id]}</span>
                      </div>
                      <span style={{ ...MONO, fontSize: '11px', color: '#4ade80' }}>+{price * sellCart[entry.id]} 💰</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer carrito */}
          <div className="p-4 border-t-4 flex flex-col gap-2" style={{ borderColor: C.border, background: 'rgba(5,2,0,0.95)' }}>
            {tab === 'buy' && (
              <>
                <div className="flex justify-between items-center">
                  <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Total</span>
                  <span style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: canAffordCart ? C.gold : '#f87171', textShadow: '1px 1px 0 #000' }}>
                    {buyTotal} 💰
                  </span>
                </div>
                {!canAffordCart && buyTotal > 0 && (
                  <p style={{ ...MONO, fontSize: '11px', color: '#f87171', textAlign: 'center' }}>Oro insuficiente</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setBuyCart({})} disabled={buyCount === 0}
                    style={{ ...MONO, flex: 1, padding: '6px', fontSize: '12px', border: `3px solid ${C.border}`, background: 'rgba(20,10,5,0.80)', color: C.textDim, boxShadow: C.shadowSm, cursor: buyCount === 0 ? 'not-allowed' : 'pointer', opacity: buyCount === 0 ? 0.5 : 1 }}>
                    Limpiar
                  </button>
                  <button onClick={handleConfirmBuy} disabled={buyCount === 0 || !canAffordCart || loading}
                    style={{ ...MONO, flex: 2, padding: '6px', fontSize: '12px', fontWeight: 'bold', border: `4px solid ${C.borderGold}`, background: 'rgba(80,40,0,0.85)', color: C.gold, boxShadow: C.shadow, textShadow: '1px 1px 0 #000', cursor: buyCount === 0 || !canAffordCart || loading ? 'not-allowed' : 'pointer', opacity: buyCount === 0 || !canAffordCart ? 0.5 : 1 }}>
                    {loading ? '...' : '▶ Confirmar'}
                  </button>
                </div>
              </>
            )}
            {tab === 'sell' && (
              <>
                <div className="flex justify-between items-center">
                  <span style={{ ...MONO, fontSize: '12px', color: C.textDim }}>Recibirás</span>
                  <span style={{ ...MONO, fontSize: '16px', fontWeight: 'bold', color: '#4ade80', textShadow: '1px 1px 0 #000' }}>
                    +{sellTotal} 💰
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSellCart({})} disabled={sellCount === 0}
                    style={{ ...MONO, flex: 1, padding: '6px', fontSize: '12px', border: `3px solid ${C.border}`, background: 'rgba(20,10,5,0.80)', color: C.textDim, boxShadow: C.shadowSm, cursor: sellCount === 0 ? 'not-allowed' : 'pointer', opacity: sellCount === 0 ? 0.5 : 1 }}>
                    Limpiar
                  </button>
                  <button onClick={handleConfirmSell} disabled={sellCount === 0 || loading}
                    style={{ ...MONO, flex: 2, padding: '6px', fontSize: '12px', fontWeight: 'bold', border: `4px solid ${C.borderGreen}`, background: 'rgba(10,50,10,0.85)', color: '#4ade80', boxShadow: C.shadow, textShadow: '1px 1px 0 #000', cursor: sellCount === 0 || loading ? 'not-allowed' : 'pointer', opacity: sellCount === 0 ? 0.5 : 1 }}>
                    {loading ? '...' : '▶ Vender'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Col derecha: items ── */}
        <div className="flex-1 overflow-y-auto p-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          style={{ background: 'rgba(5,2,0,0.65)' }}>

          {tab === 'buy' && (
            <>
              <p style={{ ...MONO, fontSize: '11px', color: C.gold, marginBottom: '16px', letterSpacing: '0.08em', padding: '4px 10px', background: 'rgba(0,0,0,0.60)', border: `2px solid ${C.border}`, display: 'inline-block', boxShadow: C.shadowSm, textShadow: '1px 1px 0 #000' }}>
                🖱️ CLICK para agregar · CLICK DERECHO para quitar
              </p>
              <div className="flex flex-wrap gap-4">
                {shopItems.map(item => {
                  const inCart = buyCart[item.id] ?? 0
                  const canAfford = currentPlayer.gold >= item.value
                  return (
                    <div key={item.id} className="relative flex flex-col items-center gap-1.5">
                      {inCart > 0 && (
                        <div style={{ position: 'absolute', top: -6, right: -6, zIndex: 10, background: C.gold, color: '#000', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 #000' }}>
                          {inCart}
                        </div>
                      )}
                      <div onContextMenu={e => { e.preventDefault(); removeFromBuyCart(item.id) }}>
              <ItemIcon item={item} size="xl" actionLabel={`${item.value} 💰`} actionDisabled={!canAfford} onClick={() => canAfford && addToBuyCart(item)} />
                      </div>
                      <p style={{ ...MONO, fontSize: '10px', color: canAfford ? C.text : C.textDim, textAlign: 'center', maxWidth: '140px', lineHeight: '1.2' }}>
                        {item.name.split(' ').slice(0, 2).join(' ')}
                      </p>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {tab === 'sell' && (
            sellableItems.length === 0 && lockedItems.length === 0
              ? <p style={{ ...MONO, color: C.textDim, textAlign: 'center', padding: '48px 0', fontSize: '13px' }}>No tenés items para vender</p>
              : (
                <>
                  <p style={{ ...MONO, fontSize: '11px', color: C.gold, marginBottom: '16px', letterSpacing: '0.08em', padding: '4px 10px', background: 'rgba(0,0,0,0.60)', border: `2px solid ${C.border}`, display: 'inline-block', boxShadow: C.shadowSm, textShadow: '1px 1px 0 #000' }}>
                    🖱️ CLICK para agregar · CLICK DERECHO para quitar · Items equipados/bloqueados excluidos
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {sellableItems.map(entry => {
                      if (!entry.item) return null
                      const inCart = sellCart[entry.id] ?? 0
                      const sellPrice = Math.floor(entry.item.value * 0.5)
                      return (
                        <div key={entry.id} className="relative flex flex-col items-center gap-1.5">
                          {inCart > 0 && (
                            <div style={{ position: 'absolute', top: -6, right: -6, zIndex: 10, background: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 #000' }}>
                              {inCart}
                            </div>
                          )}
                          <div onContextMenu={e => { e.preventDefault(); removeFromSellCart(entry.id) }}>
                            <ItemIcon item={entry.item} quantity={inCart > 0 ? entry.quantity - inCart : entry.quantity} upgradeLevel={entry.upgrade_level ?? 0} skillSlots={entry.skill_slots ?? 0} instancePassives={entry.instance_passives ?? []} size="xl" actionLabel={`${sellPrice} 💰`} actionDisabled={inCart >= entry.quantity} onClick={() => addToSellCart(entry)} />
                          </div>
                          <p style={{ ...MONO, fontSize: '10px', color: C.text, textAlign: 'center', maxWidth: '140px', lineHeight: '1.2' }}>
                            {entry.item.name.split(' ').slice(0, 2).join(' ')}
                          </p>
                        </div>
                      )
                    })}
                    {/* Items bloqueados — visibles pero apagados */}
                    {lockedItems.map(entry => {
                      if (!entry.item) return null
                      return (
                        <div key={entry.id} className="relative flex flex-col items-center gap-1.5" style={{ cursor: 'not-allowed' }} title="Item bloqueado — desbloquealo en el inventario para venderlo">
                          <div style={{ position: 'absolute', top: -2, right: -2, zIndex: 10, fontSize: '14px' }}>🔒</div>
                          {/* Wrapper con overlay oscuro encima del item */}
                          <div style={{ position: 'relative' }}>
                            <ItemIcon item={entry.item} quantity={entry.quantity} upgradeLevel={entry.upgrade_level ?? 0} skillSlots={entry.skill_slots ?? 0} instancePassives={entry.instance_passives ?? []} size="xl" />
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
                          </div>
                          <p style={{ ...MONO, fontSize: '10px', color: C.textDim, textAlign: 'center', maxWidth: '140px', lineHeight: '1.2' }}>
                            {entry.item.name.split(' ').slice(0, 2).join(' ')}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
          )}
        </div>
      </div>
    </div>
  )
}