'use client'

import { useState } from 'react'
import { Player, Item, InventoryEntry } from '@/types/game'
import { buyCartAction, sellCartAction } from '@/actions/shopActions'
import { useToast, ToastContainer } from './Toast'
import ItemIcon from './ItemIcon'

interface Props {
  player: Player
  shopItems: Item[]
  inventory: InventoryEntry[]
  onBack: () => void
  onPlayerUpdate: (player: Player, inventory: InventoryEntry[]) => void
}

type Tab = 'buy' | 'sell'

const NON_STACKABLE = new Set(['weapon', 'armor', 'ring', 'necklace'])

export default function ShopClient({ player, shopItems, inventory: initialInventory, onBack, onPlayerUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('buy')
  const [currentPlayer, setCurrentPlayer] = useState(player)
  const [inventory, setInventory] = useState(initialInventory)
  const [loading, setLoading] = useState(false)
  const { toasts, addToast } = useToast()

  const [buyCart, setBuyCart] = useState<Record<number, number>>({})
  const [sellCart, setSellCart] = useState<Record<number, number>>({})



  // ── Carrito de compra ───────────────────────────────────────────────────────
  function addToBuyCart(item: Item) {
    setBuyCart(prev => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }))
  }

  function removeFromBuyCart(itemId: number) {
    setBuyCart(prev => {
      const next = { ...prev }
      if ((next[itemId] ?? 0) <= 1) delete next[itemId]
      else next[itemId]--
      return next
    })
  }

  const buyTotal = shopItems.reduce((sum, item) => sum + item.value * (buyCart[item.id] ?? 0), 0)
  const buyCount = Object.values(buyCart).reduce((a, b) => a + b, 0)
  const canAffordCart = currentPlayer.gold >= buyTotal

  async function handleConfirmBuy() {
    if (buyCount === 0 || !canAffordCart) return
    setLoading(true)
    const result = await buyCartAction(buyCart)
    if (!result.success) {
      addToast(result.error ?? 'Error al comprar', 'error')
      setLoading(false)
      return
    }

    const updatedPlayer = { ...currentPlayer, gold: currentPlayer.gold - result.goldSpent }

    // Usar inventario real de la DB para evitar IDs temporales
    const updatedInventory = (result.freshInventory ?? []).map((e: any) => ({
      ...e, item: e.items,
    }))

    setCurrentPlayer(updatedPlayer)
    setInventory(updatedInventory)
    onPlayerUpdate(updatedPlayer, updatedInventory)
    setBuyCart({})
    addToast(`✅ Compra confirmada — ${result.goldSpent} 💰 gastados`, 'success')
    setLoading(false)
  }

  // ── Carrito de venta ────────────────────────────────────────────────────────
  const sellableItems = inventory.filter(e => e.item && !e.equipped && !e.locked)

  function addToSellCart(entry: InventoryEntry) {
    if (!entry.item || entry.equipped) return
    setSellCart(prev => {
      const current = prev[entry.id] ?? 0
      if (current >= entry.quantity) return prev
      return { ...prev, [entry.id]: current + 1 }
    })
  }

  function removeFromSellCart(entryId: number) {
    setSellCart(prev => {
      const next = { ...prev }
      if ((next[entryId] ?? 0) <= 1) delete next[entryId]
      else next[entryId]--
      return next
    })
  }

  const sellTotal = sellableItems.reduce((sum, entry) => {
    const qty = sellCart[entry.id] ?? 0
    return sum + Math.floor((entry.item?.value ?? 0) * 0.5) * qty
  }, 0)
  const sellCount = Object.values(sellCart).reduce((a, b) => a + b, 0)

  async function handleConfirmSell() {
    if (sellCount === 0) return
    setLoading(true)
    const result = await sellCartAction(sellCart)
    if (!result.success) {
      addToast(result.error ?? 'Error al vender', 'error')
      setLoading(false)
      return
    }

    const updatedPlayer = { ...currentPlayer, gold: currentPlayer.gold + result.goldGained }
    let updatedInventory = [...inventory]
    for (const [entryIdStr, qty] of Object.entries(sellCart)) {
      const entryId = Number(entryIdStr)
      const entry = updatedInventory.find(e => e.id === entryId)
      if (!entry) continue
      const isStackable = !NON_STACKABLE.has(entry.item?.type ?? '')
      if (!isStackable || entry.quantity <= qty) {
        updatedInventory = updatedInventory.filter(e => e.id !== entryId)
      } else {
        updatedInventory = updatedInventory.map(e =>
          e.id === entryId ? { ...e, quantity: e.quantity - qty } : e
        )
      }
    }

    setCurrentPlayer(updatedPlayer)
    setInventory(updatedInventory)
    onPlayerUpdate(updatedPlayer, updatedInventory)
    setSellCart({})
    addToast(`✅ Venta confirmada — +${result.goldGained} 💰`, 'success')
    setLoading(false)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden text-white" style={{ backgroundImage: 'url(/sprites/backgrounds/hub_background.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="w-full h-screen flex flex-col max-w-2xl mx-auto overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 border-b-4 border-yellow-900 shrink-0" style={{ background: 'rgba(20,10,5,0.88)', boxShadow: '0 4px 0 #000' }}>
          <button onClick={onBack} className="text-yellow-700 hover:text-yellow-400 transition text-sm" style={{ fontFamily: 'monospace' }}>◀ Volver</button>
          <h1 className="text-lg font-bold text-yellow-400 uppercase tracking-widest" style={{ fontFamily: 'monospace', textShadow: '2px 2px 0 #000' }}>🏪 Tienda</h1>
          <span className="ml-auto text-yellow-400 font-bold" style={{ fontFamily: 'monospace' }}>💰 {currentPlayer.gold}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-4 pt-4 pb-0 shrink-0" style={{ background: 'rgba(10,5,2,0.75)' }}>
          <button
            onClick={() => { setTab('buy'); setSellCart({}) }}
            className="flex-1 py-2 font-bold text-sm transition"
            style={{
              fontFamily: 'monospace',
              border: '4px solid',
              borderColor: tab === 'buy' ? '#c8860a' : '#4a3000',
              background: tab === 'buy' ? 'rgba(120,80,0,0.85)' : 'rgba(20,10,5,0.70)',
              color: tab === 'buy' ? '#ffd700' : '#7a5a30',
              boxShadow: tab === 'buy' ? '4px 4px 0 #000' : 'none',
              textShadow: tab === 'buy' ? '1px 1px 0 #000' : 'none',
            }}
          >
            🛒 Comprar
          </button>
          <button
            onClick={() => { setTab('sell'); setBuyCart({}) }}
            className="flex-1 py-2 font-bold text-sm transition"
            style={{
              fontFamily: 'monospace',
              border: '4px solid',
              borderColor: tab === 'sell' ? '#c8860a' : '#4a3000',
              background: tab === 'sell' ? 'rgba(120,80,0,0.85)' : 'rgba(20,10,5,0.70)',
              color: tab === 'sell' ? '#ffd700' : '#7a5a30',
              boxShadow: tab === 'sell' ? '4px 4px 0 #000' : 'none',
              textShadow: tab === 'sell' ? '1px 1px 0 #000' : 'none',
            }}
          >
            💸 Vender
          </button>
        </div>

        <ToastContainer toasts={toasts} />

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 pb-36" style={{ background: 'rgba(10,5,2,0.75)' }}>

          {tab === 'buy' && (
            <div className="grid grid-cols-5 gap-3">
              {shopItems.map(item => {
                const inCart = buyCart[item.id] ?? 0
                const canAfford = currentPlayer.gold >= item.value
                return (
                  <div key={item.id} className="relative flex flex-col items-center gap-1 w-20">
                    {inCart > 0 && (
                      <div className="absolute -top-1 -right-1 z-10 bg-yellow-500 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {inCart}
                      </div>
                    )}
                    <div onContextMenu={(e) => { e.preventDefault(); removeFromBuyCart(item.id) }} className="w-full">
                      <ItemIcon
                        item={item}
                        size="lg"
                        actionLabel={`${item.value} 💰`}
                        actionDisabled={!canAfford}
                        onClick={() => canAfford && addToBuyCart(item)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'sell' && (
            sellableItems.length === 0
              ? <p className="text-gray-500 text-center py-12">No tenés items para vender</p>
              : (
                <div className="grid grid-cols-5 gap-3">
                  {sellableItems.map(entry => {
                    if (!entry.item) return null
                    const inCart = sellCart[entry.id] ?? 0
                    const sellPrice = Math.floor(entry.item.value * 0.5)
                    return (
                      <div key={entry.id} className="relative flex flex-col items-center gap-1 w-20">
                        {inCart > 0 && (
                          <div className="absolute -top-1 -right-1 z-10 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {inCart}
                          </div>
                        )}
                        <div onContextMenu={(e) => { e.preventDefault(); removeFromSellCart(entry.id) }} className="w-full">
                          <ItemIcon
                            item={entry.item}
                            quantity={inCart > 0 ? entry.quantity - inCart : entry.quantity}
                            upgradeLevel={entry.upgrade_level ?? 0}
                            skillSlots={entry.skill_slots ?? 0}
                            instancePassives={entry.instance_passives ?? []}
                            size="lg"
                            actionLabel={`${sellPrice} 💰`}
                            actionDisabled={inCart >= entry.quantity}
                            onClick={() => addToSellCart(entry)}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
          )}
        </div>

        {/* Panel fijo inferior */}
        <div className="fixed bottom-0 left-0 right-0 flex justify-center pointer-events-none">
          <div className="w-full max-w-2xl border-t-4 border-yellow-900 p-4 pointer-events-auto" style={{ background: 'rgba(20,10,5,0.97)', boxShadow: '0 -4px 0 #000' }}>
            {tab === 'buy' && (
              buyCount === 0
                ? <p className="text-center text-gray-500 text-sm">Tocá un item para agregarlo al carrito</p>
                : (
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-gray-400">{buyCount} item{buyCount > 1 ? 's' : ''} en el carrito</p>
                      <p className={`font-bold text-lg ${canAffordCart ? 'text-yellow-400' : 'text-red-400'}`}>
                        Total: {buyTotal} 💰
                        {!canAffordCart && <span className="text-xs font-normal ml-2">(gold insuficiente)</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => setBuyCart({})}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold px-4 py-2 rounded-lg transition text-sm"
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={handleConfirmBuy}
                      disabled={!canAffordCart || loading}
                      className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-2 rounded-lg transition"
                    >
                      {loading ? 'Comprando...' : 'Confirmar'}
                    </button>
                  </div>
                )
            )}

            {tab === 'sell' && (
              sellCount === 0
                ? <p className="text-center text-gray-500 text-sm">Tocá un item para venderlo</p>
                : (
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-gray-400">{sellCount} item{sellCount > 1 ? 's' : ''} para vender</p>
                      <p className="font-bold text-lg text-green-400">Recibirás: +{sellTotal} 💰</p>
                    </div>
                    <button
                      onClick={() => setSellCart({})}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold px-4 py-2 rounded-lg transition text-sm"
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={handleConfirmSell}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-2 rounded-lg transition"
                    >
                      {loading ? 'Vendiendo...' : 'Confirmar'}
                    </button>
                  </div>
                )
            )}
          </div>
        </div>

      </div>
    </div>
  )
}