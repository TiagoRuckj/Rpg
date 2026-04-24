'use client'

export default function BgImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        objectFit: 'cover',
        objectPosition: 'center',
        imageRendering: 'pixelated',
        zIndex: -1,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    />
  )
}