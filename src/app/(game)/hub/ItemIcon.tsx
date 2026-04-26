'use client'

import React, { useState, useRef } from 'react'
import { Item, calcUpgradeBonus } from '@/types/game'
import { PASSIVE_LABELS, WEAPON_PASSIVES } from '@/lib/game/passiveLabels'

const MONO: React.CSSProperties = { fontFamily: 'monospace' }

const RARITY_BORDER: Record<string, string> = {
  common:    '#6b7280', // gris
  rare:      '#3b82f6', // azul
  epic:      '#a855f7', // violeta
  legendary: '#f59e0b', // dorado
}
const RARITY_COLOR: Record<string, string> = {
  common:    '#9ca3af',
  rare:      '#60a5fa',
  epic:      '#c084fc',
  legendary: '#fbbf24',
}
const RARITY_LABEL: Record<string, string> = {
  common: 'Común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario',
}

const SIZE_PX: Record<string, number> = { sm: 48, md: 64, lg: 80, xl: 112 }

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
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export default function ItemIcon({
  item, quantity, equipped, upgradeLevel = 0, skillSlots = 0, instancePassives = [],
  onClick, actionLabel, actionDisabled, size = 'md'
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const px = SIZE_PX[size]

  function handleMouseEnter() {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const W = 220, H = 340
    const top = rect.top - H - 8 > 0 ? rect.top - H - 8 : rect.bottom + 8
    let left = rect.left + rect.width / 2 - W / 2
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8))
    setTooltipStyle({ position: 'fixed', top, left, width: W, zIndex: 9999 })
    setShowTooltip(true)
  }

  const rarityColor = RARITY_COLOR[item.rarity] ?? '#999'
  const rarityBorder = RARITY_BORDER[item.rarity] ?? '#555'
  const spriteSrc = item.sprite ? `/sprites/items/${item.sprite}` : '/sprites/items/placeholder.png'

  const base = item.stats?.attack ?? 0
  const bonus = calcUpgradeBonus(base, upgradeLevel)
  const passiveIds = item.stats?.passives ?? WEAPON_PASSIVES[item.stats?.weapon_type ?? 'none'] ?? []

  return (
    <div className="relative" ref={ref}>
      {/* ── Ícono principal ── */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={onClick}
        style={{
          width: px, height: px,
          border: `3px solid ${equipped ? '#16a34a' : rarityBorder}`,
          background: 'rgba(0,0,0,0.75)',
          boxShadow: equipped
            ? '3px 3px 0 #000, inset 0 0 8px rgba(22,163,74,0.20)'
            : `3px 3px 0 #000`,
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: onClick ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      >
        <img
          src={spriteSrc}
          alt={item.name}
          style={{ width: px - 10, height: px - 10, objectFit: 'contain', imageRendering: 'pixelated' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />

        {/* Cantidad */}
        {quantity !== undefined && quantity > 1 && (
          <span style={{
            position: 'absolute', bottom: 2, right: 3,
            ...MONO, fontSize: '10px', fontWeight: 'bold',
            color: '#ffd700', textShadow: '1px 1px 0 #000',
          }}>
            {quantity}
          </span>
        )}

        {/* Mejora */}
        {upgradeLevel > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 3,
            ...MONO, fontSize: '9px', fontWeight: 'bold',
            color: '#fb923c', textShadow: '1px 1px 0 #000',
          }}>
            +{upgradeLevel}
          </span>
        )}

        {/* Ranuras */}
        {skillSlots > 0 && (
          <span style={{
            position: 'absolute', bottom: 2, left: 3,
            ...MONO, fontSize: '9px',
            color: '#c084fc', textShadow: '1px 1px 0 #000',
          }}>
            {'◆'.repeat(instancePassives.length)}{'◇'.repeat(skillSlots - instancePassives.length)}
          </span>
        )}
      </div>

      {/* ── Tooltip pixel art ── */}
      {showTooltip && (
        <div style={{
          ...tooltipStyle,
          background: 'rgba(8,3,3,0.98)',
          border: `3px solid ${rarityBorder}`,
          boxShadow: `4px 4px 0 #000, 0 0 12px ${rarityColor}44`,
          padding: '0',
          pointerEvents: 'none',
        }}>
          {/* Header */}
          <div style={{
            padding: '8px 12px',
            borderBottom: `2px solid ${rarityBorder}`,
            background: 'rgba(0,0,0,0.40)',
          }}>
            <p style={{ ...MONO, fontSize: '13px', fontWeight: 'bold', color: rarityColor, textShadow: '1px 1px 0 #000' }}>
              {item.name}
              {upgradeLevel > 0 && <span style={{ color: '#fb923c', marginLeft: '6px' }}>+{upgradeLevel}</span>}
            </p>
            <p style={{ ...MONO, fontSize: '10px', color: '#6a4a30', marginTop: '2px' }}>
              {RARITY_LABEL[item.rarity] ?? item.rarity}
              {item.stats?.slot && ` · ${item.stats.slot}`}
            </p>
            {item.description && (
              <p style={{ ...MONO, fontSize: '11px', color: '#9a7a60', marginTop: '6px', lineHeight: '1.4', fontStyle: 'italic' }}>
                {item.description}
              </p>
            )}
          </div>

          {/* Stats */}
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {base > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...MONO, fontSize: '11px', color: '#a07858' }}>⚔️ Ataque</span>
                <span style={{ ...MONO, fontSize: '11px', color: '#fb923c', fontWeight: 'bold' }}>
                  {base + bonus}{bonus > 0 && <span style={{ color: '#f97316', marginLeft: '4px' }}>(+{bonus})</span>}
                </span>
              </div>
            )}
            {item.stats?.defense && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...MONO, fontSize: '11px', color: '#a07858' }}>🛡️ Defensa</span>
                <span style={{ ...MONO, fontSize: '11px', color: '#60a5fa', fontWeight: 'bold' }}>+{item.stats.defense}</span>
              </div>
            )}
            {item.stats?.hp_bonus && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...MONO, fontSize: '11px', color: '#a07858' }}>❤️ HP</span>
                <span style={{ ...MONO, fontSize: '11px', color: '#f87171', fontWeight: 'bold' }}>+{item.stats.hp_bonus}</span>
              </div>
            )}
            {item.stats?.crit_chance && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...MONO, fontSize: '11px', color: '#a07858' }}>🍀 Crítico</span>
                <span style={{ ...MONO, fontSize: '11px', color: '#4ade80', fontWeight: 'bold' }}>+{(item.stats.crit_chance * 100).toFixed(0)}%</span>
              </div>
            )}
            {(item.effect as any)?.heal_hp && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...MONO, fontSize: '11px', color: '#a07858' }}>💊 Cura</span>
                <span style={{ ...MONO, fontSize: '11px', color: '#4ade80', fontWeight: 'bold' }}>{(item.effect as any).heal_hp} HP</span>
              </div>
            )}
            {upgradeLevel > 0 && (
              <p style={{ ...MONO, fontSize: '10px', color: '#fb923c', marginTop: '2px' }}>
                {'★'.repeat(upgradeLevel)}{'☆'.repeat(5 - upgradeLevel)}
              </p>
            )}
            {item.value > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #2a1800', paddingTop: '4px', marginTop: '2px' }}>
                <span style={{ ...MONO, fontSize: '11px', color: '#a07858' }}>💰 Valor</span>
                <span style={{ ...MONO, fontSize: '11px', color: '#fbbf24', fontWeight: 'bold' }}>{item.value}</span>
              </div>
            )}
          </div>

          {/* Pasivas */}
          {passiveIds.length > 0 && (
            <div style={{ padding: '6px 12px 8px', borderTop: '2px solid #2a1800' }}>
              <p style={{ ...MONO, fontSize: '10px', color: '#7a4a20', marginBottom: '4px', letterSpacing: '0.08em' }}>PASIVAS</p>
              {passiveIds.map(id => {
                const label = PASSIVE_LABELS[id]
                return label ? (
                  <div key={id} style={{ marginBottom: '4px' }}>
                    <p style={{ ...MONO, fontSize: '11px', color: '#c084fc', fontWeight: 'bold' }}>✦ {label.name}</p>
                    <p style={{ ...MONO, fontSize: '10px', color: '#9a7a60', lineHeight: '1.3' }}>{label.description}</p>
                  </div>
                ) : null
              })}
            </div>
          )}

          {/* Ranuras */}
          {skillSlots > 0 && (
            <div style={{ padding: '6px 12px 8px', borderTop: '2px solid #2a1800' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <p style={{ ...MONO, fontSize: '10px', color: '#7a4a20', letterSpacing: '0.08em' }}>RANURAS</p>
                <span style={{ ...MONO, fontSize: '11px', color: '#c084fc' }}>
                  {'◆'.repeat(instancePassives.length)}{'◇'.repeat(skillSlots - instancePassives.length)}
                  <span style={{ color: '#6a4a30', marginLeft: '4px' }}>({instancePassives.length}/{skillSlots})</span>
                </span>
              </div>
              {instancePassives.map(id => {
                const label = PASSIVE_LABELS[id]
                return label ? (
                  <div key={id} style={{ marginBottom: '4px' }}>
                    <p style={{ ...MONO, fontSize: '11px', color: '#c084fc', fontWeight: 'bold' }}>✦ {label.name}</p>
                    <p style={{ ...MONO, fontSize: '10px', color: '#9a7a60', lineHeight: '1.3' }}>{label.description}</p>
                  </div>
                ) : null
              })}
            </div>
          )}

          {/* Acción */}
          {actionLabel && (
            <div style={{ padding: '8px 12px', borderTop: '2px solid #2a1800' }}>
              <button
                onClick={(e) => { e.stopPropagation(); onClick?.() }}
                disabled={actionDisabled}
                style={{
                  ...MONO, width: '100%', padding: '6px', fontSize: '12px', fontWeight: 'bold',
                  border: '3px solid', pointerEvents: 'auto',
                  borderColor: actionDisabled ? '#2a1800' : '#c8860a',
                  background: actionDisabled ? 'rgba(20,5,5,0.5)' : 'rgba(80,35,0,0.85)',
                  color: actionDisabled ? '#555' : '#ffd700',
                  boxShadow: actionDisabled ? 'none' : '3px 3px 0 #000',
                  textShadow: '1px 1px 0 #000',
                  cursor: actionDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                {actionLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}