'use client'

import { useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  text: string
  type: ToastType
}

let toastCounter = 0

const STYLE: Record<ToastType, { border: string; bg: string; color: string; shadow: string }> = {
  success: {
    border: '#15803d',
    bg: 'rgba(5,40,10,0.95)',
    color: '#4ade80',
    shadow: '4px 4px 0 #000, 0 0 8px #15803d66',
  },
  error: {
    border: '#b91c1c',
    bg: 'rgba(40,5,5,0.95)',
    color: '#f87171',
    shadow: '4px 4px 0 #000, 0 0 8px #b91c1c66',
  },
  info: {
    border: '#4a3000',
    bg: 'rgba(20,10,2,0.95)',
    color: '#c8860a',
    shadow: '4px 4px 0 #000',
  },
}

export function useToast() {
  // Un solo toast por tipo — reemplaza el anterior del mismo tipo
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((text: string, type: ToastType = 'success', duration = 2500) => {
    const id = ++toastCounter
    // Reemplazar cualquier toast existente del mismo tipo
    setToasts(prev => [...prev.filter(t => t.type !== type), { id, text, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  return { toasts, addToast }
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: '64px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {toasts.map(toast => {
        const s = STYLE[toast.type]
        return (
          <div
            key={toast.id}
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 'bold',
              padding: '8px 20px',
              background: s.bg,
              border: `3px solid ${s.border}`,
              color: s.color,
              boxShadow: s.shadow,
              textShadow: '1px 1px 0 #000',
              whiteSpace: 'nowrap',
              animation: 'toastIn 0.15s ease forwards',
            }}
          >
            {toast.text}
          </div>
        )
      })}
    </div>
  )
}