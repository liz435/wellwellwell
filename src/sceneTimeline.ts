import * as THREE from 'three'

/** Scene coordinates: 0 opening, 1 seeing, 2 ritual, 3 others, 4 closing. */
export const SCENE_ANCHORS = ['opening', 'seeing', 'ritual', 'others', 'always'] as const

/** Chapter 02 uses the well-mouth camera; these beats begin with chapter 03. */
export const SCENE_BEATS = [
  { name: 'MAKE ROOM FOR ANOTHER', at: 3.06, position: [0, 3.3, 7.4], target: [0, -0.2, 0] },
  { name: 'RETURN TO THE WELL', at: 3.55, position: [0, 2.6, 8.8], target: [0, 0.1, 0] },
  { name: 'LEAVE THE WELL IN VIEW', at: 4.5, position: [0, 2.8, 13], target: [0, 0, 0] },
] as const

/** Named boundaries for the fixed 1:1 window and its mosaic dissolve before 03. */
export const WINDOW_SCENES = {
  openingShrink: { name: 'OPENING INTO FRAME', start: 0.82, end: 1.08 },
  seeing: { name: '01 / GLOWING WELL', start: 1.08, end: 1.9 },
  lookIntoWell: { name: '02 / LOOK INTO THE WELL', start: 1.9, end: 2.35 },
  ritual: { name: '02 / RITUAL WINDOW', start: 2.35, end: 2.66 },
  mosaicDissolve: { name: 'MOSAIC DISSOLVE', start: 2.66, end: 2.88 },
  pause: { name: 'EMPTY SPACE', start: 2.88, end: 3.06 },
  mosaicReform: { name: '03 / MOSAIC REFORM', start: 3.06, end: 3.26 },
  othersTransition: { name: '03 / OTHERS TRANSITION', start: 3.26, end: 3.42 },
  others: { name: '03 / OTHERS WINDOW', start: 3.42, end: 3.82 },
  closingTransition: { name: 'CLOSING TRANSITION', start: 3.82, end: 4.12 },
  closingApproach: { name: 'APPROACH THE WELL', start: 4.66, end: 4.83 },
  closingTilt: { name: 'LOOK INTO THE WELL', start: 4.83, end: 4.94 },
  wellDive: { name: 'ENTER THE WELL', start: 4.94, end: 5.13 },
  ballPool: { name: 'THE BALLS IN THE WELL', start: 5.13, end: 5.3 },
} as const

/** Pixel blocks grow, become finer, then dissolve into the page color. */
export const MOSAIC_TIMING = { start: 2.45, coarsest: 2.61, finest: 2.76, paperEnd: 2.88 } as const

/** The entry samples the exit backwards, keeping both directions symmetrical. */
export function mosaicTransitionAt(progress: number) {
  if (progress >= WINDOW_SCENES.mosaicReform.end) return { pixelSize: 1, paperMix: 0 }
  const reversed = progress >= WINDOW_SCENES.mosaicReform.start && progress < WINDOW_SCENES.mosaicReform.end
  const exitProgress = reversed
    ? MOSAIC_TIMING.paperEnd - (progress - WINDOW_SCENES.mosaicReform.start) / (WINDOW_SCENES.mosaicReform.end - WINDOW_SCENES.mosaicReform.start) * (MOSAIC_TIMING.paperEnd - MOSAIC_TIMING.start)
    : progress
  const grow = smooth((exitProgress - MOSAIC_TIMING.start) / (MOSAIC_TIMING.coarsest - MOSAIC_TIMING.start))
  const refine = smooth((exitProgress - MOSAIC_TIMING.coarsest) / (MOSAIC_TIMING.finest - MOSAIC_TIMING.coarsest))
  const dissolve = smooth((exitProgress - MOSAIC_TIMING.finest) / (MOSAIC_TIMING.paperEnd - MOSAIC_TIMING.finest))
  const pixelSize = THREE.MathUtils.lerp(1, THREE.MathUtils.lerp(31, 5, refine), grow) * (1 - dissolve) + dissolve
  return { pixelSize, paperMix: dissolve }
}

const smooth = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

type WindowFrame = { left: number; top: number; width: number; height: number; radius: number; opacity: number }

/** Static windows are square in screen pixels on both desktop and mobile. */
export function spatialPartitionAt(progress: number, viewportWidth: number, viewportHeight: number) {
  const compact = viewportWidth <= 760
  const side = Math.min(viewportWidth * (compact ? 0.86 : 0.38), viewportHeight * (compact ? 0.43 : 0.66))
  const centerX = compact ? 0.5 : 0.76
  const centerY = compact ? 0.31 : 0.52
  const frame = (x: number, y: number, scale = 1, round = 0, opacity = 1): WindowFrame => {
    const size = side * scale
    return { left: x - size / 2, top: y - size / 2, width: size, height: size, radius: size * round, opacity }
  }
  const blend = (from: WindowFrame, to: WindowFrame, t: number): WindowFrame => {
    const amount = smooth(t)
    return {
      left: THREE.MathUtils.lerp(from.left, to.left, amount),
      top: THREE.MathUtils.lerp(from.top, to.top, amount),
      width: THREE.MathUtils.lerp(from.width, to.width, amount),
      height: THREE.MathUtils.lerp(from.height, to.height, amount),
      radius: THREE.MathUtils.lerp(from.radius, to.radius, amount),
      opacity: THREE.MathUtils.lerp(from.opacity, to.opacity, amount),
    }
  }
  const full: WindowFrame = { left: 0, top: 0, width: viewportWidth, height: viewportHeight, radius: 0, opacity: 0 }
  const seeing = frame(viewportWidth * centerX, viewportHeight * centerY, 1, 0.5)
  const others = frame(viewportWidth * (compact ? 0.5 : 0.74), viewportHeight * (compact ? 0.31 : 0.56), 0.96)
  const { openingShrink, pause, mosaicReform, othersTransition, closingTransition } = WINDOW_SCENES
  const phase = (start: number, end: number) => (progress - start) / (end - start)
  let current: WindowFrame
  if (progress < openingShrink.start) current = full
  else if (progress < openingShrink.end) current = blend(full, seeing, phase(openingShrink.start, openingShrink.end))
  else if (progress < othersTransition.start) current = seeing
  else if (progress < othersTransition.end) current = blend(seeing, others, phase(othersTransition.start, othersTransition.end))
  else if (progress < closingTransition.start) current = others
  else if (progress < closingTransition.end) current = blend(others, full, phase(closingTransition.start, closingTransition.end))
  else current = full

  const right = viewportWidth - current.left - current.width
  const bottom = viewportHeight - current.top - current.height
  const pauseFade = progress < pause.start || progress >= pause.end ? 0
    : smooth((progress - pause.start) / 0.08)
  return {
    ...current,
    clipPath: `inset(${current.top}px ${right}px ${bottom}px ${current.left}px round ${current.radius}px)`,
    opacity: current.opacity * (1 - pauseFade),
    sceneOpacity: progress >= pause.start && progress < pause.end ? 0 : 1,
    paperMix: progress >= pause.start && progress < mosaicReform.start ? 1 : mosaicTransitionAt(progress).paperMix,
  }
}

export function sceneAtScroll(scrollY: number, viewportHeight: number, documentHeight: number, sectionTops: number[]) {
  const anchors = sectionTops.map((top, index) => index === 0 ? 0 : top - viewportHeight * 0.28)
  for (let index = 0; index < anchors.length - 1; index++) {
    if (scrollY < anchors[index + 1]) {
      return index + THREE.MathUtils.clamp((scrollY - anchors[index]) / Math.max(1, anchors[index + 1] - anchors[index]), 0, 1)
    }
  }
  const last = anchors[anchors.length - 1]
  return 4 + 1.3 * THREE.MathUtils.clamp((scrollY - last) / Math.max(1, documentHeight - viewportHeight - last), 0, 1)
}

export function sceneCamera(progress: number) {
  if (progress <= SCENE_BEATS[0].at) return SCENE_BEATS[0]
  for (let index = 0; index < SCENE_BEATS.length - 1; index++) {
    const from = SCENE_BEATS[index]
    const to = SCENE_BEATS[index + 1]
    if (progress <= to.at) {
      const t = smooth((progress - from.at) / (to.at - from.at))
      return {
        name: to.name,
        position: from.position.map((value, axis) => THREE.MathUtils.lerp(value, to.position[axis], t)) as [number, number, number],
        target: from.target.map((value, axis) => THREE.MathUtils.lerp(value, to.target[axis], t)) as [number, number, number],
      }
    }
  }
  return SCENE_BEATS[SCENE_BEATS.length - 1]
}
