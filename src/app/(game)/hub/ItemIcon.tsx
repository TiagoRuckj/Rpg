'use client'

import React, { useState, useRef } from 'react'
import { Item, calcUpgradeBonus } from '@/types/game'
import { PASSIVE_LABELS, WEAPON_PASSIVES } from '@/lib/game/passiveLabels'

interface Props {
  item: Item
  quantity?: number
  equipped?: boolean
  upgradeLevel?: number
  skillSlots?: number
  instancePassives?: string[]
  onClick?: () => void
  actionLabel?: string
  actionDisabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const rarityBorder: Record<string, string> = {
  common:    'border-gray-500',
  rare:      'border-blue-500',
  epic:      'border-purple-500',
  legendary: 'border-yellow-500',
}

const rarityGlow: Record<string, string> = {
  common:    '',
  rare:      'shadow-blue-500/30',
  epic:      'shadow-purple-500/30',
  legendary: 'shadow-yellow-500/30',
}

const rarityText: Record<string, string> = {
  common: 'text-gray-300', rare: 'text-blue-400',
  epic: 'text-purple-400', legendary: 'text-yellow-400',
}

const rarityLabels: Record<string, string> = {
  common: 'Común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario',
}

const sizeClasses = {
  sm: 'w-12 h-12',
  md: 'w-16 h-16',
  lg: 'w-20 h-20',
}

export default function ItemIcon({
  item, quantity, equipped, upgradeLevel = 0, skillSlots = 0, instancePassives = [],
  onClick, actionLabel, actionDisabled, size = 'md'
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseEnter() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const tooltipW = 208
      const tooltipH = 300
      const vw = window.innerWidth
      const above = rect.top - tooltipH - 8
      const top = above > 0 ? above : rect.bottom + 8
      let left = rect.left + rect.width / 2 - tooltipW / 2
      if (left < 8) left = 8
      if (left + tooltipW > vw - 8) left = vw - tooltipW - 8
      setTooltipStyle({ position: 'fixed', top, left, width: tooltipW, zIndex: 9999 })
    }
    setShowTooltip(true)
  }

  const spriteSrc = item.sprite
    ? `/sprites/items/${item.sprite}`
    : '/sprites/items/placeholder.png'

  return (
    <div className="relative" ref={ref}>
      {/* Icono */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={onClick}
        className={`
          relative ${sizeClasses[size]} border-2 rounded-lg bg-gray-800 
          ${rarityBorder[item.rarity]} ${rarityGlow[item.rarity]}
          ${equipped ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-900' : ''}
          ${onClick ? 'cursor-pointer hover:brightness-125 transition' : ''}
          flex items-center justify-center overflow-hidden
          ${item.rarity !== 'common' ? 'shadow-lg' : ''}
        `}
      >
        <img
          src={spriteSrc}
          alt={item.name}
          className="w-full h-full object-contain p-1"
          style={{ imageRendering: 'pixelated' }}
          onError={(e) => {
            // fallback si no existe el sprite
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />

        {/* Cantidad */}
        {quantity !== undefined && quantity > 1 && (
          <span className="absolute bottom-0.5 right-1 text-xs font-bold text-white drop-shadow">
            {quantity}
          </span>
        )}

        {/* Indicador equipado */}
        {equipped && (
          <span className="absolute top-0.5 left-0.5 text-xs">✓</span>
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          style={tooltipStyle}
          className={`bg-gray-900 border ${rarityBorder[item.rarity]} rounded-lg p-3 shadow-xl pointer-events-none`}
        >
          {/* Nombre y rareza */}
          <div className="mb-1">
            <p className={`font-bold text-sm ${rarityText[item.rarity]}`}>
              {item.name}
              {upgradeLevel > 0 && <span className="text-orange-400 ml-1">+{upgradeLevel}</span>}
            </p>
            <p className="text-xs text-gray-500">{rarityLabels[item.rarity]}</p>
          </div>

          {/* Slot para armaduras */}
          {item.stats?.slot && (
            <p className="text-xs text-gray-400 capitalize mb-1">Slot: {item.stats.slot}</p>
          )}

          {/* Stats */}
          <div className="flex flex-col gap-0.5 text-xs border-t border-gray-700 pt-2 mt-1">
            {item.stats?.attack && (() => {
              const base = item.stats.attack
              const bonus = calcUpgradeBonus(base, upgradeLevel)
              return (
                <span className="text-orange-300">
                  ⚔️ {base + bonus} ataque
                  {bonus > 0 && <span className="text-orange-400 ml-1">(+{bonus} mejora)</span>}
                </span>
              )
            })()}
            {item.stats?.defense    && <span className="text-blue-300">🛡️ +{item.stats.defense} defensa</span>}
            {item.stats?.hp_bonus   && <span className="text-red-300">❤️ +{item.stats.hp_bonus} HP</span>}
            {item.stats?.crit_chance && <span className="text-yellow-300">🍀 +{(item.stats.crit_chance * 100).toFixed(0)}% crítico</span>}
            {item.effect?.heal_hp   && <span className="text-green-300">💊 Restaura {item.effect.heal_hp} HP</span>}
            {upgradeLevel > 0 && (
              <span className="text-orange-400">{'★'.repeat(upgradeLevel)}{'☆'.repeat(5 - upgradeLevel)}</span>
            )}
          </div>

          {/* Pasivas — solo armas */}
          {item.type === 'weapon' && (() => {
            const passiveIds = item.stats?.passives ?? WEAPON_PASSIVES[item.stats?.weapon_type ?? 'none'] ?? []
            if (passiveIds.length === 0) return null
            return (
              <div className="flex flex-col gap-1 text-xs border-t border-gray-700 pt-2 mt-1">
                {passiveIds.map(id => {
                  const label = PASSIVE_LABELS[id]
                  if (!label) return null
                  return (
                    <div key={id}>
                      <span className="text-violet-300 font-semibold">✦ {label.name}</span>
                      <p className="text-gray-400 leading-tight">{label.description}</p>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Ranuras de habilidad — solo items de equipo con ranuras */}
          {skillSlots > 0 && (
            <div className="flex flex-col gap-1 text-xs border-t border-gray-700 pt-2 mt-1">
              <div className="flex items-center gap-1">
                <span className="text-gray-400">Ranuras:</span>
                <span className="text-violet-400 font-bold">
                  {'◆'.repeat(instancePassives.length)}{'◇'.repeat(skillSlots - instancePassives.length)}
                </span>
                <span className="text-gray-500">({instancePassives.length}/{skillSlots})</span>
              </div>
              {instancePassives.map(id => {
                const label = PASSIVE_LABELS[id]
                if (!label) return null
                return (
                  <div key={id}>
                    <span className="text-violet-300 font-semibold">✦ {label.name}</span>
                    <p className="text-gray-400 leading-tight">{label.description}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Precio si aplica */}
          {item.value > 0 && (
            <p className="text-xs text-yellow-400 mt-2 border-t border-gray-700 pt-1">
              💰 {item.value} gold
            </p>
          )}

          {/* Acción */}
          {actionLabel && (
            <button
              onClick={(e) => { e.stopPropagation(); onClick?.() }}
              disabled={actionDisabled}
              className={`w-full mt-2 py-1 rounded text-xs font-bold transition pointer-events-auto ${
                actionDisabled
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-black'
              }`}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}