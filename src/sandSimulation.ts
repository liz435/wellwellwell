import * as THREE from 'three'

export type SandTool = 'dig' | 'push' | 'smooth'
export type SandBrush = { enabled: boolean; tool: SandTool; radius: number }
export const SAND_LIMITS = { inner: 1.16, outer: 8.9, depth: 0.32, pile: 0.4, backingHole: 9.25 } as const
const FIXED_STEP = 1 / 60
const REPOSE = Math.tan(32 * Math.PI / 180)
const CELL = 0.6

/** Conservative surface transport. Volumes use projected triangle area, including on polar meshes. */
export class SandSimulation {
  private geometry: THREE.BufferGeometry
  private position: THREE.BufferAttribute
  private base: Float64Array
  private height: Float64Array
  private area: Float64Array
  private movable: Uint8Array
  private disturbance: THREE.BufferAttribute
  private neighbors: number[][]
  private faces: number[][]
  private buckets = new Map<string, number[]>()
  private active = new Set<number>()
  private dirty = new Set<number>()
  private accumulator = 0

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry
    this.position = geometry.getAttribute('position') as THREE.BufferAttribute
    this.position.setUsage(THREE.DynamicDrawUsage)
    ;(geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage)
    const count = this.position.count
    this.base = new Float64Array(count)
    this.height = new Float64Array(count)
    this.area = new Float64Array(count)
    this.movable = new Uint8Array(count)
    this.neighbors = Array.from({ length: count }, () => [])
    this.faces = Array.from({ length: count }, () => [])
    this.disturbance = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('sandDisturbance', this.disturbance)
    const indices = geometry.getIndex()
    if (!indices) throw new Error('SandSimulation requires an indexed surface')
    for (let face = 0; face < indices.count; face += 3) {
      const ids = [indices.getX(face), indices.getX(face + 1), indices.getX(face + 2)]
      const [a, b, c] = ids
      const area = Math.abs((this.position.getX(b) - this.position.getX(a)) * (this.position.getZ(c) - this.position.getZ(a))
        - (this.position.getZ(b) - this.position.getZ(a)) * (this.position.getX(c) - this.position.getX(a))) / 6
      for (const id of ids) {
        this.area[id] += area
        this.faces[id].push(face)
        for (const other of ids) if (other !== id && !this.neighbors[id].includes(other)) this.neighbors[id].push(other)
      }
    }
    for (let id = 0; id < count; id++) {
      const x = this.position.getX(id), z = this.position.getZ(id)
      this.base[id] = this.height[id] = this.position.getY(id)
      const radius = Math.hypot(x, z)
      this.movable[id] = Number(radius >= SAND_LIMITS.inner && radius <= SAND_LIMITS.outer && this.area[id] > 0)
      const key = this.key(x, z)
      const bucket = this.buckets.get(key) ?? []
      bucket.push(id)
      this.buckets.set(key, bucket)
    }
    // Cache conservative bounds once, even if callers computed bounds before construction.
    geometry.computeBoundingBox()
    geometry.boundingBox!.min.y -= SAND_LIMITS.depth + 1e-6
    geometry.boundingBox!.max.y += SAND_LIMITS.pile + 1e-6
    geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new THREE.Sphere())
  }

  private key(x: number, z: number) { return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}` }

  private around(x: number, z: number, radius: number) {
    const result: number[] = []
    for (let bx = Math.floor((x - radius) / CELL); bx <= Math.floor((x + radius) / CELL); bx++) {
      for (let bz = Math.floor((z - radius) / CELL); bz <= Math.floor((z + radius) / CELL); bz++) {
        for (const id of this.buckets.get(`${bx},${bz}`) ?? []) {
          if (this.movable[id] && Math.hypot(this.position.getX(id) - x, this.position.getZ(id) - z) < radius) result.push(id)
        }
      }
    }
    return result
  }

  private change(id: number, height: number) {
    if (Math.abs(height - this.height[id]) < 1e-12) return
    const change = Math.abs(height - this.height[id])
    this.height[id] = height
    this.disturbance.setX(id, Math.min(1, this.disturbance.getX(id) + change * 12))
    this.dirty.add(id)
    this.active.add(id)
  }

  /** Strength is depth per stamp; stroke sampling supplies distance-normalized stamps. */
  brush(x: number, z: number, radius: number, strength: number, tool: SandTool = 'dig', dx = 0, dz = 0) {
    if (![x, z, radius, strength, dx, dz].every(Number.isFinite) || radius <= 0 || strength <= 0) return false
    if (Math.hypot(x, z) < 1.35 || Math.hypot(x, z) > 8.35) return false
    const ids = this.around(x, z, radius)
    if (tool === 'smooth') {
      const inside = new Set(ids)
      let changed = false
      for (const a of ids) for (const b of this.neighbors[a]) {
        if (b <= a || !inside.has(b)) continue
        const falloff = 1 - Math.max(Math.hypot(this.position.getX(a) - x, this.position.getZ(a) - z), Math.hypot(this.position.getX(b) - x, this.position.getZ(b) - z)) / radius
        changed = this.exchange(a, b, 0, Math.min(strength * 8, 0.45) * falloff) || changed
      }
      return changed
    }
    const direction = Math.hypot(dx, dz)
    const donors: { id: number; volume: number }[] = []
    const receivers: { id: number; weight: number; capacity: number; volume: number }[] = []
    let removed = 0
    for (const id of ids) {
      const px = this.position.getX(id) - x, pz = this.position.getZ(id) - z
      const r = Math.hypot(px, pz) / radius
      if (r < 0.55) {
        const depth = strength * (1 - (r / 0.55) ** 2) ** 2
        const volume = Math.max(0, Math.min(depth, this.height[id] - this.base[id] + SAND_LIMITS.depth)) * this.area[id]
        donors.push({ id, volume })
        removed += volume
      } else {
        const forward = direction > 0 ? (px * dx + pz * dz) / (Math.max(Math.hypot(px, pz), 1e-6) * direction) : 0
        const bias = direction > 0 ? (tool === 'push' ? Math.max(0, forward) ** 2 : 0.25 + Math.max(0, forward) ** 2) : 1
        const weight = Math.sin((r - 0.55) / 0.45 * Math.PI) ** 2 * bias * this.area[id]
        const capacity = Math.max(0, this.base[id] + SAND_LIMITS.pile - this.height[id]) * this.area[id]
        if (weight > 1e-12 && capacity > 1e-12) receivers.push({ id, weight, capacity, volume: 0 })
      }
    }
    if (removed < 1e-12 || !receivers.length) return false
    let remaining = Math.min(removed, receivers.reduce((sum, entry) => sum + entry.capacity, 0))
    const deposited = remaining
    // Water filling: saturated cells drop out; every removed unit has a destination.
    let available = receivers.slice()
    while (remaining > 1e-12 && available.length) {
      const totalWeight = available.reduce((sum, entry) => sum + entry.weight, 0)
      const budget = remaining
      for (const entry of available) {
        const amount = Math.min(entry.capacity - entry.volume, budget * entry.weight / totalWeight)
        entry.volume += amount
        remaining -= amount
      }
      available = available.filter((entry) => entry.capacity - entry.volume > 1e-12)
    }
    const actual = deposited - remaining
    if (actual < 1e-12) return false
    for (const { id, volume } of donors) this.change(id, this.height[id] - volume * actual / removed / this.area[id])
    for (const { id, volume } of receivers) this.change(id, this.height[id] + volume / this.area[id])
    return true
  }

  /** Exchange volume, not equal heights. Base relief contributes to gravity. */
  private exchange(a: number, b: number, slope: number, rate: number) {
    if (!this.movable[a] || !this.movable[b]) return false
    const difference = this.height[a] - this.height[b]
    const separation = Math.hypot(this.position.getX(a) - this.position.getX(b), this.position.getZ(a) - this.position.getZ(b))
    const excess = Math.abs(difference) - separation * slope
    if (excess <= 0.00005) return false
    const high = difference > 0 ? a : b, low = difference > 0 ? b : a
    const volume = Math.min(excess * rate / (1 / this.area[high] + 1 / this.area[low]),
      Math.max(0, this.height[high] - this.base[high] + SAND_LIMITS.depth) * this.area[high],
      Math.max(0, this.base[low] + SAND_LIMITS.pile - this.height[low]) * this.area[low])
    if (volume < 1e-12) return false
    this.change(high, this.height[high] - volume / this.area[high])
    this.change(low, this.height[low] + volume / this.area[low])
    return true
  }

  step(delta: number) {
    if (!Number.isFinite(delta) || delta < 0) return
    this.accumulator += Math.min(delta, 0.1)
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP
      const work = [...this.active].sort((a, b) => a - b)
      const visited = new Set<number>()
      this.active.clear()
      for (const a of work) {
        for (const b of this.neighbors[a]) {
          if (visited.has(b)) continue
          this.exchange(a, b, REPOSE, 0.22)
        }
        visited.add(a)
      }
    }
    if (this.dirty.size) this.updateGeometry()
  }

  private updateGeometry() {
    const normalIds = new Set(this.dirty)
    for (const id of this.dirty) {
      this.position.setY(id, this.height[id])
      this.position.addUpdateRange(id * 3 + 1, 1)
      for (const neighbor of this.neighbors[id]) normalIds.add(neighbor)
    }
    const indices = this.geometry.getIndex()!
    const normals = this.geometry.getAttribute('normal') as THREE.BufferAttribute
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), sum = new THREE.Vector3()
    for (const id of normalIds) {
      sum.set(0, 0, 0)
      for (const face of this.faces[id]) {
        a.fromBufferAttribute(this.position, indices.getX(face))
        b.fromBufferAttribute(this.position, indices.getX(face + 1))
        c.fromBufferAttribute(this.position, indices.getX(face + 2))
        sum.add(c.sub(b).cross(a.sub(b)))
      }
      sum.normalize()
      normals.setXYZ(id, sum.x, sum.y, sum.z)
      normals.addUpdateRange(id * 3, 3)
    }
    this.position.needsUpdate = normals.needsUpdate = this.disturbance.needsUpdate = true
    this.dirty.clear()
  }
}
