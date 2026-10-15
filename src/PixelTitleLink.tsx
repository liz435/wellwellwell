import { useEffect, useRef } from 'react'

type PixelTitleLinkProps = {
  href: string
  meaning: string
  detail: string
}

/** Draw the actual title glyphs at low resolution, then enlarge without smoothing. */
export function PixelTitleLink({ href, meaning, detail }: PixelTitleLinkProps) {
  const wordRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const word = wordRef.current
    const canvas = canvasRef.current
    if (!word || !canvas) return
    const draw = () => {
      const bounds = word.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const style = getComputedStyle(word)
      const scale = 2
      const source = document.createElement('canvas')
      source.width = Math.ceil(bounds.width * scale)
      source.height = Math.ceil(bounds.height * scale)
      const sourceContext = source.getContext('2d')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!sourceContext || !context) return
      sourceContext.scale(scale, scale)
      sourceContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      sourceContext.textBaseline = 'middle'
      sourceContext.fillStyle = style.color
      const spacing = Number.parseFloat(style.letterSpacing) || 0
      const letters = Array.from('Well')
      const widths = letters.map((letter) => sourceContext.measureText(letter).width)
      const drawnWidth = widths.reduce((total, width) => total + width, 0) + spacing * (letters.length - 1)
      sourceContext.scale(Math.min(1, (bounds.width - 2) / drawnWidth), 1)
      let x = 0
      for (const [index, letter] of letters.entries()) {
        sourceContext.fillText(letter, x, bounds.height * 0.55)
        x += widths[index] + spacing
      }

      canvas.width = Math.max(1, Math.ceil(bounds.width / 8))
      canvas.height = Math.max(1, Math.ceil(bounds.height / 8))
      context.imageSmoothingEnabled = true
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = pixels.data[index] > 55 ? 255 : 0
      context.putImageData(pixels, 0, 0)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(word)
    void document.fonts.ready.then(draw)
    draw()
    return () => observer.disconnect()
  }, [])

  const drawCurrentColor = () => {
    const word = wordRef.current
    const canvas = canvasRef.current
    if (!word || !canvas) return
    // The observer redraws after a size change. A hover may also follow a theme change.
    const context = canvas.getContext('2d')
    if (!context) return
    const color = getComputedStyle(word).color
    const pixel = document.createElement('canvas')
    pixel.width = canvas.width
    pixel.height = canvas.height
    const pixelContext = pixel.getContext('2d')
    if (!pixelContext) return
    pixelContext.drawImage(canvas, 0, 0)
    pixelContext.globalCompositeOperation = 'source-in'
    pixelContext.fillStyle = color
    pixelContext.fillRect(0, 0, pixel.width, pixel.height)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(pixel, 0, 0)
  }

  return <a href={href} aria-label={`Well — ${meaning}, ${detail}`} onPointerEnter={drawCurrentColor} onFocus={drawCurrentColor}>
    <span className="title-word" ref={wordRef}>
      <span className="title-text">Well</span>
      <canvas ref={canvasRef} className="title-mosaic" aria-hidden="true" />
      <span className="title-meaning" aria-hidden="true"><strong>{meaning}</strong><small>{detail}</small></span>
    </span>
  </a>
}
