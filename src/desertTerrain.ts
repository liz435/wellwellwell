import * as THREE from 'three'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'

export const DESERT = {
  size: 150,
  segments: 192,
  seed: 23.71,
  baseHeight: -1.34,
  amplitude: 5.2,
  frequency: 0.038,
  octaves: 5,
  persistence: 0.48,
  lacunarity: 2.03,
  windAngle: Math.PI / 5,
  clearingRadius: 3,
  clearingFalloff: 13,
} as const

const perlin = new ImprovedNoise()

/** A fixed slice through a 3D gradient-noise field, composed at multiple scales. */
function fbm3(x: number, y: number, z: number): number {
  let value = 0, amplitude = 1, weight = 0
  for (let octave = 0; octave < DESERT.octaves; octave++) {
    value += perlin.noise(x, y, z) * amplitude
    weight += amplitude
    amplitude *= DESERT.persistence
    x *= DESERT.lacunarity
    y *= DESERT.lacunarity
    z *= DESERT.lacunarity
  }
  return value / weight
}

export function desertHeight(x: number, z: number): number {
  const cosine = Math.cos(DESERT.windAngle), sine = Math.sin(DESERT.windAngle)
  const along = x * cosine + z * sine
  const across = -x * sine + z * cosine
  // Two additional 3D samples bend the dune ridges so they do not form a grid.
  const warpX = perlin.noise(along * 0.022, across * 0.022, DESERT.seed + 51) * 7
  const warpZ = perlin.noise(along * 0.022, across * 0.022, DESERT.seed + 97) * 7
  const u = (along + warpX) * DESERT.frequency * 0.7
  const v = (across + warpZ) * DESERT.frequency * 1.35
  const broad = fbm3(u, v, DESERT.seed)
  const ridge = 1 - Math.abs(perlin.noise(u * 1.4, v * 1.4, DESERT.seed + 11))
  const shoulder = perlin.noise(u * 0.5, v * 0.5, DESERT.seed + 31)
  const height = Math.max(0.08, 0.35 + broad * 0.85 + ridge ** 3 * 0.22 + shoulder * 0.15)
  const wellClearing = THREE.MathUtils.smoothstep(Math.hypot(x, z), DESERT.clearingRadius, DESERT.clearingFalloff)
  // Keep the straight camera approach above the sand; distant dunes remain on both sides.
  const approach = THREE.MathUtils.smoothstep(z, -4, 8) * (1 - THREE.MathUtils.smoothstep(z, 38, 55))
  const corridor = THREE.MathUtils.smoothstep(Math.abs(x), 13, 27)
  const clearing = Math.min(wellClearing, 1 - approach * (1 - corridor))
  return DESERT.baseHeight + height * DESERT.amplitude * clearing
}

export function duneGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(DESERT.size, DESERT.size, DESERT.segments, DESERT.segments)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), z = positions.getZ(index)
    positions.setY(index, desertHeight(x, z))
    // World-space UV density matches the flat sand around the well.
    uv.setXY(index, x, -z)
  }
  const indices = geometry.index!
  const triangles: number[] = []
  for (let index = 0; index < indices.count; index += 3) {
    const a = indices.getX(index), b = indices.getX(index + 1), c = indices.getX(index + 2)
    // Leave the shaft clear. The finer ground mesh joins this opening to the rim.
    if ([a, b, c].every((id) => Math.hypot(positions.getX(id), positions.getZ(id)) > 2.2)) triangles.push(a, b, c)
  }
  geometry.setIndex(triangles)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
