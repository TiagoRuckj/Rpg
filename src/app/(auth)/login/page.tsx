'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit() {
    setLoading(true)
    setError('')

    if (isRegister) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) return setError(error.message)
      router.push('/hub')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return setError(error.message)
      router.push('/hub')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">⚔️ RPG Game</h1>
        <p className="text-gray-400 text-center mb-6">
          {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
        </p>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-yellow-500"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Cargando...' : isRegister ? 'Registrarse' : 'Entrar'}
          </button>

          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-gray-400 hover:text-white text-sm transition"
          >
            {isRegister ? '¿Ya tenés cuenta? Iniciá sesión' : '¿No tenés cuenta? Registrate'}
          </button>
        </div>
      </div>
    </div>
  )
}