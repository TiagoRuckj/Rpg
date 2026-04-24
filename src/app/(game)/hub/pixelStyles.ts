// ─── Constantes de estilo pixel art compartidas ───────────────────────────────

export const MONO: React.CSSProperties = { fontFamily: 'monospace' }

export const pixelCard: React.CSSProperties = {
  background: 'rgba(20,15,5,0.78)',
  border: '4px solid #4a3000',
  boxShadow: '4px 4px 0 #000, inset 0 0 0 1px rgba(255,180,0,0.08)',
  padding: '14px 16px',
}

export const pixelCardHover: Partial<CSSStyleDeclaration> = {
  background: 'rgba(80,50,5,0.90)',
  borderColor: '#c8860a',
  boxShadow: '4px 4px 0 #000, inset 0 0 12px rgba(255,180,0,0.25), 0 0 8px rgba(255,160,0,0.3)',
}

export const pixelCardBase: Partial<CSSStyleDeclaration> = {
  background: 'rgba(20,15,5,0.78)',
  borderColor: '#4a3000',
  boxShadow: '4px 4px 0 #000, inset 0 0 0 1px rgba(255,180,0,0.08)',
}

export const pixelDungeonBtn: React.CSSProperties = {
  background: 'rgba(120,80,0,0.75)',
  border: '4px solid #8B6914',
  boxShadow: '4px 4px 0 #000, inset 0 0 0 2px rgba(255,200,0,0.15)',
  padding: '16px 20px',
}

export const pixelDungeonBtnHover: Partial<CSSStyleDeclaration> = {
  background: 'rgba(180,120,0,0.85)',
  borderColor: '#f0b030',
  boxShadow: '4px 4px 0 #000, inset 0 0 16px rgba(255,200,0,0.30), 0 0 12px rgba(255,180,0,0.4)',
}

export const pixelDungeonBtnBase: Partial<CSSStyleDeclaration> = {
  background: 'rgba(120,80,0,0.75)',
  borderColor: '#8B6914',
  boxShadow: '4px 4px 0 #000, inset 0 0 0 2px rgba(255,200,0,0.15)',
}