'use client'

import { useState } from 'react'
import { InventoryEntry, Item } from '@/types/game'
import { getConsumablesAction, useItemAction } from '@/actions/itemAction'
import { CombatAction } from '@/types/game'
import { PlayerSkill } from '@/types/game'
import { ItemUsed } from '@/actions/combatActions'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ConsumableEntry = InventoryEntry & { item: Item }

interface UseItemHandlersParams {
  playerHP: number
  playerStamina: number
  playerMana: number
  maxHP: number
  maxStamina: number
  maxMana: number
  setPlayerHP: (hp: number) => void
  setPlayerStamina: (s: number) => void
  setPlayerMana: (m: number) => void
  handleAction: (action: CombatAction, skill?: PlayerSkill, item?: ItemUsed) => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useItemHandlers({
  playerHP, playerStamina, playerMana,
  maxHP, maxStamina, maxMana,
  setPlayerHP, setPlayerStamina, setPlayerMana,
  handleAction,
}: UseItemHandlersParams) {

  // Estado de items en combate
  const [showItems, setShowItems] = useState(false)
  const [consumables, setConsumables] = useState<ConsumableEntry[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  // Estado de items en descanso (entre salas)
  const [showRestConsumables, setShowRestConsumables] = useState(false)
  const [restConsumables, setRestConsumables] = useState<ConsumableEntry[]>([])
  const [loadingRestItems, setLoadingRestItems] = useState(false)
  const [usingRestItem, setUsingRestItem] = useState(false)

  // ─── En combate ─────────────────────────────────────────────────────────────

  async function handleOpenItems() {
    setLoadingItems(true)
    const { items } = await getConsumablesAction()
    setConsumables(items)
    setLoadingItems(false)
    setShowItems(true)
  }

  async function handleUseItem(entryId: number) {
    const entry = consumables.find(e => e.id === entryId)
    if (!entry) return
    setConsumables(prev =>
      prev.map(e => e.id === entryId ? { ...e, quantity: e.quantity - 1 } : e)
         .filter(e => e.quantity > 0)
    )
    setShowItems(false)
    await handleAction('item', undefined, {
      entryId,
      name: entry.item.name,
      effect: entry.item.effect ?? {},
    })
  }

  // ─── Entre salas ────────────────────────────────────────────────────────────

  async function handleOpenRestConsumables() {
    setLoadingRestItems(true)
    const { items } = await getConsumablesAction()
    setRestConsumables(items)
    setLoadingRestItems(false)
    setShowRestConsumables(true)
  }

  async function handleUseRestItem(entryId: number) {
    setUsingRestItem(true)
    const result = await useItemAction(entryId)
    if (!result.success) { setUsingRestItem(false); return }
    if (result.healHP > 0)      setPlayerHP(Math.min(playerHP + result.healHP, maxHP))
    if (result.healStamina > 0) setPlayerStamina(Math.min(playerStamina + result.healStamina, maxStamina))
    if (result.healMana > 0)    setPlayerMana(Math.min(playerMana + result.healMana, maxMana))
    setRestConsumables(prev =>
      prev.map(e => e.id === entryId ? { ...e, quantity: e.quantity - 1 } : e)
         .filter(e => e.quantity > 0)
    )
    setUsingRestItem(false)
  }

  return {
    // Combate
    showItems, setShowItems,
    consumables, loadingItems,
    handleOpenItems, handleUseItem,
    // Descanso
    showRestConsumables, setShowRestConsumables,
    restConsumables, loadingRestItems, usingRestItem,
    handleOpenRestConsumables, handleUseRestItem,
  }
}