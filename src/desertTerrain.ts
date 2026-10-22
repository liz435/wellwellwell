import * as THREE from 'three'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'

export const DESERT = {
  size: 150,
  segments: 256,
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

/** Dense sand around the well; the outer edge overlaps the coarse dune mesh. */
export const NEAR_SAND = { innerRadius: 0.77, outerRadius: 13, duneCutRadius: 12, rings: 128, sides: 256 } as const

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
  // Long sculpted crests: a broad windward face and a steeper slip face.
  // Noise bends the ridge line rather than breaking the slopes into small hills.
  let dunes = 0
  for (let band = 0; band < 4; band++) {
    const center = -17 - band * 20
    const bend = Math.sin(x * 0.047 + band * 1.7) * 7
      + perlin.noise(x * 0.028, band * 2.1, DESERT.seed) * 4
    const distance = z - center - bend - x * (band % 2 === 0 ? 0.16 : -0.12)
    const width = distance < 0 ? 15 : 5.2
    const profile = Math.exp(-Math.pow(Math.abs(distance) / width, 1.22))
    const crestHeight = (5.6 + band * 0.8) * (0.7 + 0.3 * Math.cos(x * 0.035 + band))
    dunes += profile * crestHeight
  }
  const height = Math.max(0.03, dunes + broad * 0.65)
  const wellClearing = THREE.MathUtils.smoothstep(Math.hypot(x, z), DESERT.clearingRadius, DESERT.clearingFalloff)
  // Keep the straight camera approach above the sand; distant dunes remain on both sides.
  const approach = THREE.MathUtils.smoothstep(z, -4, 8) * (1 - THREE.MathUtils.smoothstep(z, 38, 55))
  const corridor = THREE.MathUtils.smoothstep(Math.abs(x), 13, 27)
  const clearing = Math.min(wellClearing, 1 - approach * (1 - corridor))
  return DESERT.baseHeight + height * clearing
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
    if ([a, b, c].every((id) => Math.hypot(positions.getX(id), positions.getZ(id)) > NEAR_SAND.duneCutRadius)) triangles.push(a, b, c)
  }
  geometry.setIndex(triangles)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** Match PlaneGeometry's two-triangle interpolation at the dense patch boundary. */
function coarseDuneHeight(x: number, z: number) {
  const step = DESERT.size / DESERT.segments
  const gx = (x + DESERT.size / 2) / step, gz = (z + DESERT.size / 2) / step
  const ix = Math.floor(gx), iz = Math.floor(gz)
  const fx = gx - ix, fz = gz - iz
  const x0 = ix * step - DESERT.size / 2, z0 = iz * step - DESERT.size / 2
  const h00 = desertHeight(x0, z0), h01 = desertHeight(x0, z0 + step)
  const h10 = desertHeight(x0 + step, z0), h11 = desertHeight(x0 + step, z0 + step)
  return fx + fz <= 1
    ? (1 - fx - fz) * h00 + fz * h01 + fx * h10
    : (1 - fx) * h01 + (fx + fz - 1) * h11 + (1 - fz) * h10
}

/** Irregular small-scale relief and sheltered deposits near the well. */
export function nearSandGeometry(): THREE.BufferGeometry {
  const { innerRadius, outerRadius, rings, sides } = NEAR_SAND
  const vertexCount = (rings + 1) * sides
  const positions = new Float32Array(vertexCount * 3)
  const uv = new Float32Array(vertexCount * 2)
  const indices: number[] = []
  const windX = Math.cos(DESERT.windAngle), windZ = Math.sin(DESERT.windAngle)

  for (let ring = 0; ring <= rings; ring++) {
    const radius = THREE.MathUtils.lerp(innerRadius, outerRadius, ring / rings)
    const detail = 1 - THREE.MathUtils.smoothstep(radius, 9, 12.5)
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius
      const along = x * windX + z * windZ
      const across = -x * windZ + z * windX
      const grainRelief = (perlin.noise(x * 2.8, z * 2.8, DESERT.seed + 203) + 1) * 0.002
      const rimDeposit = Math.exp(-(((radius - 1.12) / 0.5) ** 2)) * 0.032
      const leeDeposit = THREE.MathUtils.smoothstep(along, 0.2, 1) * Math.exp(-((across / 1.4) ** 2)) * Math.exp(-Math.max(along, 0) / 4.5) * 0.038
      const index = ring * sides + side
      positions[index * 3] = x
      const coarseBlend = THREE.MathUtils.smoothstep(radius, 10.5, 12.5)
      const macro = desertHeight(x, z)
      const base = coarseBlend > 0 ? THREE.MathUtils.lerp(macro, coarseDuneHeight(x, z), coarseBlend) : macro
      positions[index * 3 + 1] = base + 0.004 + detail * (grainRelief + rimDeposit + leeDeposit)
      positions[index * 3 + 2] = z
      uv[index * 2] = x
      uv[index * 2 + 1] = -z
      if (ring < rings) {
        const nextSide = (side + 1) % sides
        const a = index, b = (ring + 1) * sides + side
        const c = ring * sides + nextSide, d = (ring + 1) * sides + nextSide
        indices.push(a, c, b, c, d, b)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** A low-cost distant silhouette behind the sand ridges. */
export function mountainGeometry(): THREE.BufferGeometry {
  const count = 192
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i <= count; i++) {
    const angle = i / count * Math.PI * 2
    const x = Math.cos(angle) * 103, z = Math.sin(angle) * 103
    const height = 6 + Math.abs(perlin.noise(x * 0.035, z * 0.035, 81)) * 15
      + Math.abs(perlin.noise(x * 0.13, z * 0.13, 93)) * 4
    positions.push(x, -9, z, x, height, z)
    if (i < count) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
