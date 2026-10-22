import { useRef, useState, type CSSProperties } from 'react'
import { useWellStore } from './useWellStore'

const columns = 24
const rows = 14
const tiles = Array.from({ length: columns * rows }, (_, index) => {
  const x = index % columns
  const y = Math.floor(index / columns)
  const noise = (x * 71 + y * 97 + x * y * 29) % 101
  const hue = noise < 12 ? '#b7a48e' : noise < 30 ? '#69717b' : noise < 58 ? '#333c49' : '#151a23'
  return { color: hue, delay: -((index * 37) % 21) / 10, fillDelay: ((index * 23) % 79) / 100, revealDelay: ((index * 17) % 13) / 100 }
})

export function LoadingScreen() {
  const revealing = useWellStore((state) => state.loaderRevealing)
  const [filled, setFilled] = useState(false)
  const filledTiles = useRef(new Set<number>())

  return <div className={'loading-screen' + (revealing && filled ? ' is-revealing' : '')}
    role="status" aria-label="Preparing the scene" aria-live="polite"
    onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && event.animationName === 'loading-clear') {
        useWellStore.getState().dismissLoader()
      }
    }}>
    <div className="loading-mosaic" aria-hidden="true">
      {tiles.map((tile, index) => <i key={index} className="loading-tile" onAnimationEnd={(event) => {
        if (event.animationName !== 'loading-tile-fill') return
        filledTiles.current.add(index)
        if (filledTiles.current.size === tiles.length) setFilled(true)
      }} style={{
        backgroundColor: tile.color,
        '--flicker-delay': `${tile.delay}s`,
        '--fill-delay': `${tile.fillDelay}s`,
        '--reveal-delay': `${tile.revealDelay}s`,
      } as CSSProperties} />)}
    </div>
  </div>
}
