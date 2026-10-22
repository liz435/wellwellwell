import type { SandTool } from './sandSimulation'
import { SandSimulation } from './sandSimulation'

/** Carry unused path length across pointer events so event frequency cannot deepen strokes. */
export class SandStroke {
  private simulation: SandSimulation
  private previous: { x: number; z: number } | null = null
  private remainder = 0
  constructor(simulation: SandSimulation) { this.simulation = simulation }
  end() { this.previous = null; this.remainder = 0 }
  begin(x: number, z: number, radius: number, pressure: number, tool: SandTool) {
    this.previous = { x, z }
    this.remainder = 0
    return this.simulation.brush(x, z, radius, 0.055 * pressure, tool)
  }
  move(x: number, z: number, radius: number, pressure: number, tool: SandTool) {
    if (!this.previous) { this.previous = { x, z }; return false }
    const dx = x - this.previous.x, dz = z - this.previous.z
    const distance = Math.hypot(dx, dz)
    if (distance < 1e-8) return false
    const spacing = radius * 0.18
    let changed = false
    for (let offset = spacing - this.remainder; offset <= distance; offset += spacing) {
      changed = this.simulation.brush(this.previous.x + dx * offset / distance, this.previous.z + dz * offset / distance,
        radius, spacing * 0.22 * pressure, tool, dx, dz) || changed
    }
    this.remainder = (this.remainder + distance) % spacing
    this.previous = { x, z }
    return changed
  }
}
