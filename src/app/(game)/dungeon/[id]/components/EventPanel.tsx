'use client'

import { useState, useEffect } from 'react'
import { RoomEvent, Enemy, Dungeon, Boss, EnemyCombatState, PlayerPoisonState } from '@/types/game'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EventEffect {
  healHP?: number
  damage?: number
  gold?: number
  goldCost?: number        // gold que se descuenta del jugador (mercader)
  itemBought?: number      // item_id comprado al mercader
  poison?: PlayerPoisonState
  startCombat?: boolean
  combatEnemies?: EnemyCombatState[]
  isBoss?: boolean
  mimicGold?: number       // gold que hubiera dado el cofre (loot extra del mimico)
}

// ─── Constantes del mercader ──────────────────────────────────────────────────

const MERCHANT_ITEMS = [
  { itemId: 1,  name: 'Poción de Vida Menor', baseValue: 25,  totalStock: 5, chance: 1.00, description: 'Restaura HP en combate' },
  { itemId: 11, name: 'Pergamino del Chamán',  baseValue: 150, totalStock: 1, chance: 0.05, description: 'Habilidad especial del Chamán' },
]

interface MerchantItem {
  itemId: number
  name: string
  price: number
  description: string
  stock: number
}

// ─── Probabilidad de mimico ───────────────────────────────────────────────────

const MIMIC_CHANCE = 0.15
// ID del Mímico en la DB — ajustar al que devuelva el INSERT
const MIMIC_ENEMY_ID = 6

// ─── Props ────────────────────────────────────────────────────────────────────

interface EventPanelProps {
  event: RoomEvent
  playerHP: number
  maxHP: number
  playerGold: number
  enemies: Enemy[]
  dungeon: Dungeon
  depthMult: number
  granGoblinBoss: Boss | null
  onSetGranGoblinBoss: (boss: Boss | null) => void
  onResolve: (effect: EventEffect) => void
  isSheet?: boolean
}

const EVENT_INFO: Record<string, { icon: string; title: string; color: string }> = {
  treasure:      { icon: '📦', title: 'Cofre del Tesoro',    color: 'border-yellow-700 bg-yellow-950/40' },
  ambush:        { icon: '⚔️', title: 'Emboscada',           color: 'border-red-700 bg-red-950/40'       },
  merchant:      { icon: '🧙', title: 'Mercader Errante',    color: 'border-blue-700 bg-blue-950/40'     },
  healing_altar: { icon: '✨', title: 'Altar de Curación',   color: 'border-green-700 bg-green-950/40'   },
  poison_trap:   { icon: '☠️', title: 'Trampa Venenosa',     color: 'border-purple-700 bg-purple-950/40' },
  cracked_wall:  { icon: '🧱', title: 'Muro Agrietado',      color: 'border-gray-600 bg-gray-800/60'     },
}

export function EventPanel({
  event, playerHP, maxHP, playerGold, enemies, dungeon, depthMult,
  granGoblinBoss, onSetGranGoblinBoss, onResolve, isSheet,
}: EventPanelProps) {
  const info = EVENT_INFO[event.type]
  const [fetchedBoss, setFetchedBoss] = useState(false)

  // Mercader
  const [merchantStock, setMerchantStock] = useState<MerchantItem[]>([])
  const [localGold, setLocalGold] = useState(playerGold)
  const [lastPurchase, setLastPurchase] = useState<string | null>(null)

  // Cofre
  const [isMimic] = useState(() => Math.random() < MIMIC_CHANCE)
  const [chestGold] = useState(() => 20 + Math.floor(Math.random() * 41))
  const [chestOpened, setChestOpened] = useState(false)

  const healAmount = Math.round(maxHP * 0.3)

  const wrapperClass = isSheet
    ? `p-4 flex flex-col gap-3 ${info.color}`
    : `rounded-xl border p-4 flex flex-col gap-3 ${info.color}`

  // Inicializar stock del mercader
  useEffect(() => {
    if (event.type !== 'merchant') return
    const stock: MerchantItem[] = MERCHANT_ITEMS
      .filter(item => Math.random() < item.chance)
      .map(item => ({
        itemId: item.itemId,
        name: item.name,
        price: item.baseValue * 2,
        description: item.description,
        stock: item.totalStock,
      }))
    setMerchantStock(stock)
  }, [event.type])

  async function loadGranGoblin() {
    if (granGoblinBoss || fetchedBoss) return
    setFetchedBoss(true)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.from('bosses').select('*').eq('name', 'Gran Goblin').single()
    if (data) onSetGranGoblinBoss(data as Boss)
  }

  if (event.type === 'cracked_wall' && !fetchedBoss) loadGranGoblin()

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function handleAmbush() {
    const count = Math.random() < 0.4 ? 2 : 1
    const pool = enemies.filter(e => e.stats.attack > 0)
    const combatEnemies: EnemyCombatState[] = Array.from({ length: count }, (_, i) => {
      const enemy = pool[Math.floor(Math.random() * pool.length)]
      const scaledHP = Math.round(enemy.stats.hp * depthMult)
      return { instanceId: Date.now() + i, enemy, currentHP: scaledHP, maxHP: scaledHP, alive: true, aiState: null, statMults: null }
    })
    onResolve({ startCombat: true, combatEnemies, isBoss: false })
  }

  function handleOpenChest() {
    setChestOpened(true)
    if (isMimic) {
      const mimicTemplate = enemies.find(e => e.id === MIMIC_ENEMY_ID) ?? {
        id: MIMIC_ENEMY_ID,
        dungeon_id: dungeon.id,
        name: 'Mímico',
        stats: { hp: 70, attack: 18, defense: 7 },
        loot_table: [{ exp: 40, item_id: null, gold_max: 0, gold_min: 0, item_chance: 0 }],
        enemy_type: ['mimic'] as any,
      }
      const scaledHP = Math.round(mimicTemplate.stats.hp * depthMult)
      const combatEnemies: EnemyCombatState[] = [{
        instanceId: Date.now(),
        enemy: mimicTemplate,
        currentHP: scaledHP,
        maxHP: scaledHP,
        alive: true,
        aiState: null,
        statMults: null,
      }]
      onResolve({ startCombat: true, combatEnemies, isBoss: false, mimicGold: chestGold })
    } else {
      onResolve({ gold: chestGold })
    }
  }

  function handleCrackedWall() {
    if (!granGoblinBoss) return
    const hp = granGoblinBoss.stats.hp
    const combatEnemies: EnemyCombatState[] = [{
      instanceId: Date.now(),
      enemy: {
        id: granGoblinBoss.id,
        dungeon_id: granGoblinBoss.dungeon_id,
        name: granGoblinBoss.name,
        stats: { hp, attack: granGoblinBoss.stats.attack, defense: granGoblinBoss.stats.defense },
        loot_table: [],
        enemy_type: granGoblinBoss.enemy_type,
      },
      currentHP: hp,
      maxHP: hp,
      alive: true,
      aiState: null,
      statMults: null,
    }]
    onResolve({ startCombat: true, combatEnemies, isBoss: true })
  }

  function handleBuyItem(item: MerchantItem) {
    if (localGold < item.price || item.stock <= 0) return
    setLocalGold(prev => prev - item.price)
    setMerchantStock(prev => prev.map(i => i.itemId === item.itemId ? { ...i, stock: i.stock - 1 } : i))
    setLastPurchase(`✅ Compraste ${item.name} por ${item.price} gold`)
    onResolve({ goldCost: item.price, itemBought: item.itemId })
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{info.icon}</span>
        <h3 className="font-bold text-white">{info.title}</h3>
      </div>

      {/* ── Cofre ── */}
      {event.type === 'treasure' && !chestOpened && (
        <>
          <p className="text-gray-300 text-sm">Encontrás un cofre abandonado. Parece contener algo valioso... o quizás no.</p>
          <div className="flex gap-2">
            <button
              onClick={handleOpenChest}
              className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              🔓 Abrir cofre
            </button>
            <button
              onClick={() => onResolve({})}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              🚶 Ignorar
            </button>
          </div>
        </>
      )}
      {event.type === 'treasure' && chestOpened && isMimic && (
        <p className="text-red-400 font-bold text-sm animate-pulse">💀 ¡Era un Mímico! ¡Preparate para combatir!</p>
      )}
      {event.type === 'treasure' && chestOpened && !isMimic && (
        <p className="text-yellow-300 font-bold text-sm">💰 Encontraste {chestGold} gold!</p>
      )}

      {/* ── Emboscada ── */}
      {event.type === 'ambush' && (
        <>
          <p className="text-gray-300 text-sm">¡Un grupo de goblins te tiende una emboscada! No podés evitar el combate.</p>
          <button onClick={handleAmbush} className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg transition text-sm">
            ⚔️ Combatir
          </button>
        </>
      )}

      {/* ── Altar de curación ── */}
      {event.type === 'healing_altar' && (
        <>
          <p className="text-gray-300 text-sm">Un altar antiguo emite un suave resplandor. Podés absorber su energía.</p>
          {playerHP < maxHP
            ? <p className="text-green-400 text-sm font-bold">❤️ +{Math.min(healAmount, maxHP - playerHP)} HP</p>
            : <p className="text-gray-400 text-sm">Tu HP ya está al máximo.</p>
          }
          <div className="flex gap-2">
            {playerHP < maxHP ? (
              <>
                <button
                  onClick={() => onResolve({ healHP: healAmount })}
                  className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-2 rounded-lg transition text-sm"
                >
                  ✨ Absorber energía
                </button>
                <button
                  onClick={() => onResolve({})}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
                >
                  🚶 Ignorar
                </button>
              </>
            ) : (
              <button
                onClick={() => onResolve({})}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
              >
                🚶 Continuar
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Trampa de veneno ── */}
      {event.type === 'poison_trap' && (
        <>
          <p className="text-gray-300 text-sm">Pisás una trampa oculta. El veneno te quemará las venas durante los próximos 5 turnos de combate.</p>
          <p className="text-purple-400 text-sm font-bold">☠️ -10 HP por turno durante 5 turnos</p>
          <button
            onClick={() => onResolve({ poison: { turnsLeft: 5, damagePerTurn: 10 } })}
            className="bg-purple-800 hover:bg-purple-700 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            😬 Continuar
          </button>
        </>
      )}

      {/* ── Mercader ── */}
      {event.type === 'merchant' && (
        <>
          <p className="text-gray-300 text-sm">Un mercader misterioso aparece entre las sombras con su mercancía.</p>
          <div className="flex items-center justify-between">
            <span className="text-yellow-400 text-sm font-bold">💰 Tu gold: {localGold}</span>
            {lastPurchase && <span className="text-green-400 text-xs">{lastPurchase}</span>}
          </div>

          {merchantStock.length === 0 ? (
            <p className="text-gray-500 text-sm italic">No tiene nada para vender hoy.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {merchantStock.map(item => (
                <div key={item.itemId} className="bg-black/30 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{item.name}</p>
                    <p className="text-gray-400 text-xs">{item.description}</p>
                    <p className="text-gray-500 text-xs">{item.stock} disponible{item.stock !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-yellow-400 text-sm font-bold">💰 {item.price}</span>
                    <button
                      onClick={() => handleBuyItem(item)}
                      disabled={localGold < item.price || item.stock <= 0}
                      className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-1 rounded-lg transition"
                    >
                      {item.stock <= 0 ? 'Agotado' : localGold < item.price ? 'Sin gold' : 'Comprar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => onResolve({})}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
          >
            🚶 Cerrar tienda
          </button>
        </>
      )}

      {/* ── Muro agrietado ── */}
      {event.type === 'cracked_wall' && (
        <>
          <p className="text-gray-300 text-sm">Ves una grieta en la pared que lleva a una cámara oculta. Se escuchan ruidos al otro lado...</p>
          <p className="text-orange-400 text-xs">⚠️ Peligro desconocido — recompensa asegurada si sobrevivís</p>
          <div className="flex gap-2">
            <button
              onClick={handleCrackedWall}
              disabled={!granGoblinBoss}
              className="flex-1 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              {granGoblinBoss ? '🧱 Atravesar' : 'Cargando...'}
            </button>
            <button
              onClick={() => onResolve({})}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              🚶 Ignorar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── EventSheet ───────────────────────────────────────────────────────────────

interface EventSheetProps extends EventPanelProps {
  visible: boolean
}

export function EventSheet({ visible, ...panelProps }: EventSheetProps) {
  const info = EVENT_INFO[panelProps.event.type]
  const bgColor = info.color.split(' ').find(c => c.startsWith('bg-')) ?? 'bg-gray-900'

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`} />
      <div className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16 pointer-events-none'
      }`}>
        <div className={`w-full max-w-lg rounded-2xl shadow-2xl border ${info.color.split(' ').find(c => c.startsWith('border-')) ?? 'border-gray-600'} overflow-hidden`}>
          <div className={`flex justify-center pt-3 pb-2 ${bgColor}`}>
            <div className="w-10 h-1 rounded-full bg-white/30" />
          </div>
          <EventPanel {...panelProps} isSheet />
        </div>
      </div>
    </>
  )
}