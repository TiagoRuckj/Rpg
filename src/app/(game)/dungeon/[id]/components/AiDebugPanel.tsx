'use client'

import { useState, useEffect, useRef } from 'react'

export interface AiDebugEntry {
  tier: string
  enemyName: string
  data: Record<string, unknown>
}

interface AiDebugPanelProps {
  entries: AiDebugEntry[]  // ref.current — array acumulado
  tick: number             // se incrementa por cada batch nuevo, triggerea re-render
}

const TIER_COLORS: Record<string, string> = {
  dumb:    'border-l-amber-500  bg-amber-950/40',
  medium:  'border-l-blue-500   bg-blue-950/40',
  smart:   'border-l-purple-500 bg-purple-950/40',
  boss:    'border-l-red-500    bg-red-950/40',
  legacy:  'border-l-gray-500   bg-gray-900/40',
}

const TIER_BADGE: Record<string, string> = {
  dumb:    'bg-amber-800  text-amber-200',
  medium:  'bg-blue-800   text-blue-200',
  smart:   'bg-purple-800 text-purple-200',
  boss:    'bg-red-800    text-red-200',
  legacy:  'bg-gray-700   text-gray-300',
}

const FIELD_COLORS: Record<string, string> = {
  reason:   'text-yellow-300',
  chosen:   'text-green-300',
  energy:   'text-blue-300',
  cost:     'text-orange-300',
  selfHP:   'text-red-300',
  playerHP: 'text-cyan-300',
}

const PRIORITY_KEYS = ['reason', 'chosen', 'type', 'energy', 'cost', 'selfHP', 'playerHP']

export default function AiDebugPanel({ entries, tick }: AiDebugPanelProps) {
  const [visible, setVisible] = useState(true)
  const [pinned, setPinned] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al último log cuando llega un batch nuevo
  useEffect(() => {
    if (!pinned && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [tick, pinned])

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex flex-col ${visible ? 'w-80' : 'w-auto'}`}>
      <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-t-lg px-3 py-2">
        <span className="text-xs font-mono text-gray-400 flex-1">AI debug</span>
        {visible && (
          <>
            <button
              onClick={() => setPinned(p => !p)}
              className={`text-xs px-2 py-0.5 rounded ${pinned ? 'bg-blue-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              &#9208;
            </button>
          </>
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
          className="bg-gray-950 border-x border-b border-gray-700 rounded-b-lg overflow-y-auto flex flex-col gap-1 p-2"
          style={{ maxHeight: '60vh' }}
        >
          {entries.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-4 font-mono">
              esperando logs de IA...
            </p>
          )}

          {entries.map((entry, idx) => {
            const keys = [
              ...PRIORITY_KEYS.filter(k => k in entry.data),
              ...Object.keys(entry.data).filter(k => !PRIORITY_KEYS.includes(k)),
            ]
            return (
              <div
                key={idx}
                className={`border-l-2 rounded-r px-2 py-1.5 text-xs font-mono ${TIER_COLORS[entry.tier] ?? 'border-l-gray-500 bg-gray-900/40'}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${TIER_BADGE[entry.tier] ?? 'bg-gray-700 text-gray-300'}`}>
                    {entry.tier}
                  </span>
                  <span className="text-white font-bold truncate">{entry.enemyName}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {keys.map(key => {
                    const val = entry.data[key]
                    const display = Array.isArray(val)
                      ? (val as unknown[]).join(' · ')
                      : String(val)
                    return (
                      <div key={key} className="flex gap-1 leading-snug">
                        <span className="text-gray-500 shrink-0">{key}</span>
                        <span className={`break-all ${FIELD_COLORS[key] ?? 'text-gray-300'}`}>
                          {display}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}