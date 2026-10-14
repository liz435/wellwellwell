import * as THREE from 'three'

/** Seamless, deterministic mineral detail; no remote textures or model downloads. */
export function stoneMaterial(base: string, repeat = 1, bump = 0.022, sand = false) {
  const size = 256
  const color = new THREE.Color(base)
  const albedo = new Uint8Array(size * size * 4)
  const relief = new Uint8Array(size * size * 4)
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const noise = (u: number, v: number, cells: number) => {
    const x = u * cells, y = v * cells
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix % cells, iy % cells), hash((ix + 1) % cells, iy % cells), sx),
      THREE.MathUtils.lerp(hash(ix % cells, (iy + 1) % cells), hash((ix + 1) % cells, (iy + 1) % cells), sx), sy,
    )
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    const grain = hash(x, y)
    const cloud = noise(u, v, 4) * 0.5 + noise(u, v, 16) * 0.3 + noise(u, v, 64) * 0.2
    const pore = !sand && grain < 0.022 ? 0.38 : 1
    const ridge = sand ? (Math.sin(u * Math.PI * 32 + Math.sin(v * Math.PI * 4) * 0.6) + 1) * 0.5 : 0
    const shade = (0.73 + cloud * 0.45 + grain * 0.09 + ridge * 0.08) * pore
    const index = (y * size + x) * 4
    // Values supplied as linear color data to preserve PBR energy.
    albedo[index] = Math.min(255, color.r * shade * 255)
    albedo[index + 1] = Math.min(255, color.g * shade * 255)
    albedo[index + 2] = Math.min(255, color.b * shade * 255)
    albedo[index + 3] = 255
    const height = Math.round((sand ? ridge * 0.5 + cloud * 0.25 + grain * 0.25 : cloud * 0.7 + grain * 0.3) * pore * 255)
    relief[index] = relief[index + 1] = relief[index + 2] = height
    relief[index + 3] = 255
  }
  const map = new THREE.DataTexture(albedo, size, size, THREE.RGBAFormat)
  const bumpMap = new THREE.DataTexture(relief, size, size, THREE.RGBAFormat)
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat, repeat)
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    texture.needsUpdate = true
  }
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: bump, roughness: 0.87, metalness: 0 })
}

export function disposeStone(material: THREE.MeshStandardMaterial) {
  material.map?.dispose()
  material.bumpMap?.dispose()
  material.dispose()
}

export function groundWithOpening(outer: number, hole: number) {
  const shape = new THREE.Shape()
  shape.moveTo(-outer, -outer)
  shape.lineTo(outer, -outer)
  shape.lineTo(outer, outer)
  shape.lineTo(-outer, outer)
  shape.closePath()
  const opening = new THREE.Path()
  opening.absarc(0, 0, hole, 0, Math.PI * 2, true)
  shape.holes.push(opening)
  return shape
}

export function roundStoneBlock() {
  const shape = new THREE.Shape()
  const half = Math.PI / 24 - 0.009
  const start = Math.PI / 2 - half, end = Math.PI / 2 + half
  shape.absarc(0, 0, 1.065, start, end, false)
  shape.lineTo(Math.cos(end) * 0.755, Math.sin(end) * 0.755)
  shape.absarc(0, 0, 0.755, end, start, true)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.265, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008,
    bevelSegments: 2, curveSegments: 12, steps: 1,
  })
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, 0.1325, -0.91)
  geometry.computeBoundingBox()
  return geometry
}

/** Anchor the actual mesh bottom below the surface, independent of bevel size. */
export function groundedCourseY(groundY: number, blockBottom: number, course: number) {
  return groundY - blockBottom - 0.05 + course * 0.285
}
