import * as THREE from 'three'

/** Scene coordinates: 0 opening, 1 seeing, 2 ritual, 3 others, 4 closing. */
export const SCENE_ANCHORS = ['opening', 'seeing', 'ritual', 'others', 'always'] as const

/** Edit these named beats to change the camera composition within each chapter. */
export const SCENE_BEATS = [
  { name: 'AT THE WELL', at: 1, position: [0, 1.7, 7.8], target: [0, -0.3, 0] },
  { name: 'SEE THE FORM', at: 1.35, position: [0, 2.6, 6.8], target: [0, -0.25, 0] },
  { name: 'SEE THE GRID', at: 1.75, position: [0, 4.2, 5.8], target: [0, -0.35, 0] },
  { name: 'BEND TOWARD THE WELL', at: 2, position: [0, 4.8, 5.5], target: [0, -0.8, 0] },
  { name: 'LISTEN INTO THE WELL', at: 2.5, position: [0, 5.8, 4.6], target: [0, -1.1, 0] },
  { name: 'MAKE ROOM FOR ANOTHER', at: 3, position: [0, 3.3, 7.4], target: [0, -0.2, 0] },
  { name: 'TWO PEOPLE AT THE WELL', at: 3.55, position: [0, 2.6, 8.8], target: [0, 0.1, 0] },
  { name: 'LEAVE THE WELL IN VIEW', at: 4.5, position: [0, 2.8, 13], target: [0, 0, 0] },
] as const

/** Named boundaries for the 1:1 window and its wraparound transition before 02. */
export const WINDOW_SCENES = {
  openingShrink: { name: 'OPENING INTO FRAME', start: 0.82, end: 1.08 },
  seeing: { name: '01 / SEEING WINDOW', start: 1.08, end: 1.76 },
  exitRight: { name: 'EXIT RIGHT', start: 1.76, end: 1.9 },
  pause: { name: 'EMPTY SPACE', start: 1.9, end: 2.04 },
  enterLeft: { name: 'ENTER FROM LEFT', start: 2.04, end: 2.22 },
  ritual: { name: '02 / RITUAL WINDOW', start: 2.22, end: 2.8 },
  othersTransition: { name: '03 / OTHERS TRANSITION', start: 2.8, end: 3.12 },
  others: { name: '03 / OTHERS WINDOW', start: 3.12, end: 3.82 },
  closingTransition: { name: 'CLOSING TRANSITION', start: 3.82, end: 4.12 },
} as const

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
  const seeing = frame(viewportWidth * centerX, viewportHeight * centerY)
  const rightExit = frame(viewportWidth + side, viewportHeight * centerY, 0.72)
  const leftEntry = frame(-side, viewportHeight * centerY, 0.72)
  const ritual = frame(viewportWidth * (compact ? 0.5 : 0.69), viewportHeight * centerY, 1, 0.5)
  const others = frame(viewportWidth * (compact ? 0.5 : 0.74), viewportHeight * (compact ? 0.31 : 0.56), 0.96)
  const closing = frame(viewportWidth * 0.5, viewportHeight * 0.5, 1.08)
  const { openingShrink, exitRight, pause, enterLeft, othersTransition, closingTransition } = WINDOW_SCENES
  const phase = (start: number, end: number) => (progress - start) / (end - start)
  let current: WindowFrame
  if (progress < openingShrink.start) current = full
  else if (progress < openingShrink.end) current = blend(full, seeing, phase(openingShrink.start, openingShrink.end))
  else if (progress < exitRight.start) current = seeing
  else if (progress < exitRight.end) current = blend(seeing, rightExit, phase(exitRight.start, exitRight.end))
  else if (progress < pause.end) current = rightExit
  else if (progress < enterLeft.end) current = blend(leftEntry, ritual, phase(enterLeft.start, enterLeft.end))
  else if (progress < othersTransition.start) current = ritual
  else if (progress < othersTransition.end) current = blend(ritual, others, phase(othersTransition.start, othersTransition.end))
  else if (progress < closingTransition.start) current = others
  else if (progress < closingTransition.end) current = blend(others, closing, phase(closingTransition.start, closingTransition.end))
  else current = closing

  const right = viewportWidth - current.left - current.width
  const bottom = viewportHeight - current.top - current.height
  return {
    ...current,
    clipPath: `inset(${current.top}px ${right}px ${bottom}px ${current.left}px round ${current.radius}px)`,
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
  return 4 + 0.5 * THREE.MathUtils.clamp((scrollY - last) / Math.max(1, documentHeight - viewportHeight - last), 0, 1)
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
