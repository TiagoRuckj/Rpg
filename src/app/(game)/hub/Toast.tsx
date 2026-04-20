'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  text: string
  type: ToastType
}

let toastCounter = 0

// Hook para usar en cualquier componente
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((text: string, type: ToastType = 'success', duration = 2500) => {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  return { toasts, addToast }
}

// Componente que renderiza los toasts — poner una sola vez en el layout raíz de cada pantalla
export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-5 py-3 rounded-xl text-sm font-bold shadow-xl animate-fade-in pointer-events-none
            ${toast.type === 'success' ? 'bg-green-800 text-green-200 border border-green-600' : ''}
            ${toast.type === 'error'   ? 'bg-red-900   text-red-200   border border-red-700'   : ''}
            ${toast.type === 'info'    ? 'bg-gray-800  text-gray-200  border border-gray-600'   : ''}
          `}
          style={{ animation: 'fadeInDown 0.2s ease' }}
        >
          {toast.text}
        </div>
      ))}
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}