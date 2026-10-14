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

const soft = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (t * (t * 6 - 15) + 10)
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
  let glow = 0
  for (const scene of [OPENING_SCENES.glowOne, OPENING_SCENES.glowTwo, OPENING_SCENES.glowThree]) {
    const phase = (progress - scene.start) / (scene.end - scene.start)
    if (phase > 0 && phase < 1) {
      glow = soft(phase / 0.38) * (1 - soft((phase - 0.48) / 0.52))
    }
  }
  const tilt = OPENING_SCENES.tilt
  return {
    cameraX: 0,
    cameraY: OPENING_CAMERA.height,
    cameraZ: OPENING_CAMERA.startZ + (OPENING_CAMERA.endZ - OPENING_CAMERA.startZ) * smooth((progress - OPENING_CAMERA.dollyStart) / (OPENING_CAMERA.dollyEnd - OPENING_CAMERA.dollyStart)),
    cameraPitch: OPENING_CAMERA.skyPitch + (OPENING_CAMERA.wellPitch - OPENING_CAMERA.skyPitch) * smooth((progress - tilt.start) / (tilt.end - tilt.start)),
    glow,
    daylight: OPENING_LIGHT.night + (OPENING_LIGHT.arrival - OPENING_LIGHT.night) * smooth((progress - OPENING_LIGHT.dawnStart) / (1 - OPENING_LIGHT.dawnStart)),
  }
}
