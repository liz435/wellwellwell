/** Edit the height and scene boundaries here to retime the opening. */
export const OPENING_SCROLL_HEIGHT = '420svh'

export const OPENING_SCENES = {
  stars: { id: 'stars', name: '01 / STARFIELD', start: 0, end: 0.16 },
  tilt: { id: 'tilt', name: '02 / DESERT REVEAL', start: 0.16, end: 0.39 },
  glowOne: { id: 'glow-one', name: '03 / FIRST GLOW', start: 0.39, end: 0.54 },
  glowTwo: { id: 'glow-two', name: '04 / SECOND GLOW', start: 0.54, end: 0.69 },
  glowThree: { id: 'glow-three', name: '05 / THIRD GLOW', start: 0.69, end: 0.84 },
  arrival: { id: 'arrival', name: '06 / AT THE WELL', start: 0.84, end: 1 },
} as const

/** Seconds on the prepared scene's clock, independent of scroll and loading time. */
export const OPENING_TIMING = { skyHold: 1.4, tiltDuration: 4, releaseDuration: 1.2 } as const

/** The opening launches immediately; later waves are triggered by scroll. */
export const METEOR_WAVE_TRIGGERS = [0, 0.39, 0.54] as const

export const SHOOTING_STARS = (() => {
  let seed = 91273
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  return METEOR_WAVE_TRIGGERS.flatMap((_, wave) => Array.from({ length: 16 }, (_, index) => {
    return {
      wave,
      delay: wave === 0 ? Math.floor(index / 4) * 1.25 + (index === 0 ? 0 : random() * 0.55) : random() * 1.15,
      duration: wave === 0 ? 1.1 + random() * 1.05 : 0.65 + random() * 0.8,
      // Mix interior launches into the four edges without adding more particles.
      interior: (index + wave) % 3 === 1,
      interiorX: (random() - 0.5) * 1.4,
      interiorHeight: 0.2 + random() * 0.6,
      edge: (index + wave) % 4,
      edgePosition: (Math.floor(index / 4) + random()) / 4,
      spawnDepth: 24 + random() * 20,
      to: [(random() - 0.5) * 0.56, -1.25 - random() * 0.55, (random() - 0.5) * 0.56] as const,
      size: index === 15 ? 1.8 : 0.45 + random() * 1.35,
      tail: 0.07 + random() * 0.14,
      bend: 0.15 + random() * 2.2,
      sideBend: (random() - 0.5) * 7,
      depthBend: (random() - 0.5) * 4,
      exponent: 1.05 + random() * 0.6,
      brightness: 0.48 + random() * 0.85,
      palette: random(),
    }
  }))
})()

export const OPENING_CAMERA = {
  startZ: 24,
  endZ: 7.8,
  height: 1.7,
  skyPitch: 0.62,
  wellPitch: -Math.atan2(2, 7.8),
  dollyStart: 0.27,
  dollyEnd: 0.9,
} as const

export const OPENING_LIGHT = {
  night: 0.08,
  arrival: 0.53,
  dawnStart: 0.81,
} as const

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

export function openingSceneAt(progress: number) {
  const scenes = Object.values(OPENING_SCENES)
  for (let index = scenes.length - 1; index >= 0; index--) {
    if (progress >= scenes[index].start) return scenes[index]
  }
  return scenes[0]
}

/** The well stays planted; only the camera, ambient light, and stone glow change. */
export function openingSequence(progress: number) {
  const tilt = OPENING_SCENES.tilt
  return {
    cameraX: 0,
    cameraY: OPENING_CAMERA.height,
    cameraZ: OPENING_CAMERA.startZ + (OPENING_CAMERA.endZ - OPENING_CAMERA.startZ) * smooth((progress - OPENING_CAMERA.dollyStart) / (OPENING_CAMERA.dollyEnd - OPENING_CAMERA.dollyStart)),
    cameraPitch: OPENING_CAMERA.skyPitch + (-0.09 - OPENING_CAMERA.skyPitch) * smooth((progress - tilt.start) / (tilt.end - tilt.start))
      + (OPENING_CAMERA.wellPitch + 0.09) * smooth((progress - OPENING_SCENES.glowThree.start) / (OPENING_SCENES.arrival.start - OPENING_SCENES.glowThree.start)),
    daylight: OPENING_LIGHT.night + (OPENING_LIGHT.arrival - OPENING_LIGHT.night) * smooth((progress - OPENING_LIGHT.dawnStart) / (1 - OPENING_LIGHT.dawnStart)),
  }
}
