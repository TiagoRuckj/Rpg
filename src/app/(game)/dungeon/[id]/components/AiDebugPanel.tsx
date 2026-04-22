'use client'

import { useState, useEffect, useRef } from 'react'

export interface AiDebugEntry {
  tier: string
  enemyName: string
  data: Record<string, unknown>
}

interface AiDebugPanelProps {
  entries: AiDebugEntry[]
  tick: number
}

const TIER_COLORS: Record<string, string> = {
  dumb:    'border-l-amber-500  bg-amber-950/40',
  medium:  'border-l-blue-500   bg-blue-950/40',
  smart:   'border-l-purple-500 bg-purple-950/40',
  boss:    'border-l-red-500    bg-red-950/40',
  default: 'border-l-gray-500   bg-gray-900/40',
}

const TIER_BADGE: Record<string, string> = {
  dumb:    'bg-amber-800  text-amber-200',
  medium:  'bg-blue-800   text-blue-200',
  smart:   'bg-purple-800 text-purple-200',
  boss:    'bg-red-800    text-red-200',
  default: 'bg-gray-700   text-gray-300',
}

const ACTION_TYPE_COLOR: Record<string, string> = {
  attack:      'text-red-400',
  recuperacion:'text-green-400',
  extra:       'text-purple-400',
  buff:        'text-yellow-400',
  debuff:      'text-orange-400',
}

function HPBar({ pct }: { pct: number }) {
  const color = pct > 0.5 ? 'bg-green-500' : pct > 0.25 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1 w-full">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <span className="text-gray-400 text-[10px] w-7 text-right">{Math.round(pct * 100)}%</span>
    </div>
  )
}

function EnergyPips({ current, max }: { current: number; max: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-sm ${i < current ? 'bg-blue-400' : 'bg-gray-700'}`}
        />
      ))}
      <span className="text-gray-500 text-[10px] ml-1">{current}/{max}</span>
    </div>
  )
}

function DebugEntry({ entry }: { entry: AiDebugEntry }) {
  const d = entry.data
  const tier = entry.tier
  const borderColor = TIER_COLORS[tier] ?? TIER_COLORS.default
  const badgeColor  = TIER_BADGE[tier]  ?? TIER_BADGE.default

  // Parsear energía: preferir campo maxEnergy directo, fallback al string "X → Y/Z"
  const energyStr = String(d.energy ?? '')
  const energyMatch = energyStr.match(/(\d+)\s*(?:→\s*(\d+))?\s*(?:\/\s*(\d+))?/)
  const energyPrev    = energyMatch && energyMatch[2] ? Number(energyMatch[1]) : null
  const energyCurrent = energyMatch ? Number(energyMatch[2] ?? energyMatch[1]) : null
  const energyMax     = d.maxEnergy != null ? Number(d.maxEnergy)
                        : energyMatch && energyMatch[3] ? Number(energyMatch[3]) : null

  const selfHpPct   = d.selfHP   ? parseFloat(String(d.selfHP))   / 100 : null
  const playerHpPct = d.playerHP ? parseFloat(String(d.playerHP)) / 100 : null

  const actionType   = String(d.type   ?? '')
  const actionName   = String(d.chosen ?? '')
  const reason       = String(d.reason ?? '')
  const actionColor  = ACTION_TYPE_COLOR[actionType] ?? 'text-gray-300'

  return (
    <div className={`border-l-2 rounded-r px-2.5 py-2 text-xs font-mono ${borderColor}`}>

      {/* Header: badge + nombre */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badgeColor}`}>
          {tier}
        </span>
        <span className="text-white font-semibold truncate">{entry.enemyName}</span>
      </div>

      {/* Energía */}
      {energyCurrent !== null && energyMax !== null && (
        <div className="mb-1.5">
          <div className="text-gray-500 text-[10px] mb-0.5">
            Energía {energyPrev !== null ? `${energyPrev} → ${energyCurrent}` : energyCurrent} / {energyMax}
          </div>
          <EnergyPips current={energyCurrent} max={energyMax} />
        </div>
      )}

      {/* HP bars — solo si están presentes */}
      {(selfHpPct !== null || playerHpPct !== null) && (
        <div className="flex flex-col gap-1 mb-1.5">
          {selfHpPct !== null && (
            <div>
              <span className="text-gray-500 text-[10px]">HP propio </span>
              <HPBar pct={selfHpPct} />
            </div>
          )}
          {playerHpPct !== null && (
            <div>
              <span className="text-gray-500 text-[10px]">HP jugador </span>
              <HPBar pct={playerHpPct} />
            </div>
          )}
        </div>
      )}

      {/* Decisión */}
      {reason && (
        <div className="text-yellow-300 text-[10px] mb-1">
          ↳ {reason}
        </div>
      )}

      {/* Acción elegida */}
      {actionName && (
        <div className={`font-bold ${actionColor}`}>
          {actionName}
          {actionType && <span className="text-gray-500 font-normal ml-1">[{actionType}]</span>}
        </div>
      )}
    </div>
  )
}

export default function AiDebugPanel({ entries, tick }: AiDebugPanelProps) {
  const [visible, setVisible] = useState(true)
  const [pinned, setPinned] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinned && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [tick, pinned])

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex flex-col ${visible ? 'w-72' : 'w-auto'}`}>
      <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-t-lg px-3 py-2">
        <span className="text-xs font-mono text-gray-400 flex-1">AI debug</span>
        {visible && (
          <button
            onClick={() => setPinned(p => !p)}
            className={`text-xs px-2 py-0.5 rounded ${pinned ? 'bg-blue-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            &#9208;
          </button>
        )}
        <button
          onClick={() => setVisible(v => !v)}
          className="text-xs text-gray-500 hover:text-white px-1"
        >
          {visible ? '▼' : '▲'}
        </button>
      </div>

      {visible && (
        <div
          ref={listRef}
          className="bg-gray-950 border-x border-b border-gray-700 rounded-b-lg overflow-y-auto flex flex-col gap-1.5 p-2"
          style={{ maxHeight: '65vh' }}
        >
          {entries.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-4 font-mono">
              esperando logs de IA...
            </p>
          )}
          {entries.map((entry, idx) => (
            <DebugEntry key={idx} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}