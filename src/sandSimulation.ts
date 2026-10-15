import * as THREE from 'three'
import { NEAR_SAND } from './desertTerrain'

/** A small, volume-preserving heightfield for the sand immediately around the well. */
export class SandSimulation {
  private position: THREE.BufferAttribute
  private base: Float32Array
  private displacement: Float32Array
  private transfer: Float32Array
  private settling = 0
  private dirty = false

  constructor(private geometry: THREE.BufferGeometry) {
    this.position = geometry.getAttribute('position') as THREE.BufferAttribute
    this.position.setUsage(THREE.DynamicDrawUsage)
    const count = this.position.count
    this.base = new Float32Array(count)
    this.displacement = new Float32Array(count)
    this.transfer = new Float32Array(count)
    for (let index = 0; index < count; index++) this.base[index] = this.position.getY(index)
  }

  /** Scoop the center and place approximately the same volume on its edge. */
  dig(x: number, z: number, strength = 0.075) {
    const radius = Math.hypot(x, z)
    if (radius < 1.35 || radius > 8.35) return false
    let changed = false
    for (let index = 0; index < this.position.count; index++) {
      const px = this.position.getX(index), pz = this.position.getZ(index)
      if (Math.abs(px - x) > 0.95 || Math.abs(pz - z) > 0.95) continue
      const vertexRadius = Math.hypot(px, pz)
      if (vertexRadius < 1.16 || vertexRadius > 8.9) continue
      const distance = Math.hypot(px - x, pz - z)
      if (distance > 0.95) continue
      const center = Math.exp(-0.5 * (distance / 0.26) ** 2)
      const edge = Math.exp(-0.5 * ((distance - 0.59) / 0.17) ** 2)
      const delta = strength * (-center + edge * 0.22)
      const next = THREE.MathUtils.clamp(this.displacement[index] + delta, -0.32, 0.2)
      if (Math.abs(next - this.displacement[index]) < 0.00001) continue
      this.displacement[index] = next
      changed = true
    }
    if (changed) {
      this.settling = 2.6
      this.dirty = true
    }
    return changed
  }

  /** Transfer sand down slopes above its angle of repose, then stop when quiet. */
  step(delta: number) {
    if (this.settling <= 0) {
      if (this.dirty) this.updateGeometry()
      return
    }
    this.settling -= delta
    this.transfer.fill(0)
    const { sides, rings } = NEAR_SAND
    const rate = Math.min(delta * 3.5, 0.12)
    let movement = 0
    for (let ring = 0; ring <= rings; ring++) for (let side = 0; side < sides; side++) {
      const index = ring * sides + side
      const x = this.position.getX(index), z = this.position.getZ(index)
      const radius = Math.hypot(x, z)
      if (radius < 1.16 || radius > 8.9) continue
      const neighbors = [ring * sides + (side + 1) % sides]
      if (ring < rings) neighbors.push(index + sides)
      for (const neighbor of neighbors) {
        const nx = this.position.getX(neighbor), nz = this.position.getZ(neighbor)
        if (Math.hypot(nx, nz) < 1.16 || Math.hypot(nx, nz) > 8.9) continue
        const separation = Math.hypot(nx - x, nz - z)
        const heightDifference = this.displacement[index] - this.displacement[neighbor]
        const excess = Math.abs(heightDifference) - separation * 0.47
        if (excess <= 0) continue
        const amount = Math.sign(heightDifference) * excess * rate * 0.5
        this.transfer[index] -= amount
        this.transfer[neighbor] += amount
        movement += Math.abs(amount)
      }
    }
    if (movement < 0.00001) this.settling = 0
    else {
      for (let index = 0; index < this.displacement.length; index++) this.displacement[index] += this.transfer[index]
      this.dirty = true
    }
    if (this.dirty) this.updateGeometry()
  }

  private updateGeometry() {
    for (let index = 0; index < this.position.count; index++) this.position.setY(index, this.base[index] + this.displacement[index])
    this.position.needsUpdate = true
    this.geometry.computeVertexNormals()
    this.dirty = false
  }
}
