'use client'

// ─── VictoryModal ─────────────────────────────────────────────────────────────
// Modal centrado que aparece al completar una sala o derrotar al boss.
// Muestra el loot ganado con sprites y botones de acción.

interface LootItem {
  itemId: number
  itemName: string
  sprite?: string
}

interface VictoryModalProps {
  // 'room' = sala normal  |  'boss' = boss derrotado
  type: 'room' | 'boss'
  // Loot de la sala/boss
  exp: number
  gold: number
  items: LootItem[]
  // Profundidad actual (para mostrar "Continuar — Prof. X")
  depth?: number
  // Callbacks
  onContinue: () => void
  // Solo para boss
  onReturnToHub?: () => void
  isSaving?: boolean
}

export function VictoryModal({
  type, exp, gold, items,
  depth = 0,
  onContinue, onReturnToHub, isSaving,
}: VictoryModalProps) {
  const isBoss = type === 'boss'

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        style={{ animation: 'fadeIn 0.25s ease-out' }}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className={`
          w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden
          ${isBoss
            ? 'bg-gray-900 border-yellow-600'
            : 'bg-gray-900 border-green-700'
          }
        `}>

          {/* Header */}
          <div className={`
            px-6 py-5 flex flex-col items-center gap-1
            ${isBoss ? 'bg-yellow-950/60' : 'bg-green-950/60'}
          `}>
            <span className="text-3xl">{isBoss ? '👑' : '✅'}</span>
            <h2 className={`text-xl font-black ${isBoss ? 'text-yellow-400' : 'text-green-400'}`}>
              {isBoss ? '¡Jefe eliminado!' : '¡Sala completada!'}
            </h2>
          </div>

          {/* Loot */}
          <div className="px-6 py-4 flex flex-col gap-4">

            {/* EXP y Gold */}
            <div className="flex justify-center gap-6">
              {exp > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl">✨</span>
                  <span className="text-purple-300 font-bold text-sm">+{exp} EXP</span>
                </div>
              )}
              {gold > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl">💰</span>
                  <span className="text-yellow-300 font-bold text-sm">+{gold} gold</span>
                </div>
              )}
            </div>

            {/* Items */}
            {items.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-gray-400 text-xs text-center">Items obtenidos</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {items.map((item, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-1 bg-gray-800 rounded-xl px-3 py-2 border border-gray-700"
                    >
                      {item.sprite ? (
                        <img
                          src={`/sprites/items/${item.sprite}`}
                          alt={item.itemName}
                          className="w-10 h-10 object-contain"
                          style={{ imageRendering: 'pixelated' }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <span className="text-2xl">🎁</span>
                      )}
                      <span className="text-green-300 text-xs font-bold text-center max-w-[80px] leading-tight">
                        {item.itemName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {exp === 0 && gold === 0 && items.length === 0 && (
              <p className="text-gray-500 text-sm text-center">Sin recompensas</p>
            )}
          </div>

          {/* Botones */}
          <div className="px-6 pb-6 flex flex-col gap-2">
            {isBoss ? (
              <>
                <button
                  onClick={onContinue}
                  className="w-full bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white font-bold py-3 rounded-xl transition text-sm"
                >
                  ⚔️ Continuar — Profundidad {depth + 1}
                </button>
                <button
                  onClick={onReturnToHub}
                  disabled={isSaving}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition text-sm"
                >
                  {isSaving ? '💾 Guardando...' : '🏠 Salir al Hub'}
                </button>
              </>
            ) : (
              <button
                onClick={onContinue}
                className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold py-4 rounded-xl transition text-base"
              >
                Continuar →
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  )
}