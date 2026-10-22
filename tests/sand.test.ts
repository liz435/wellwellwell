import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { nearSandGeometry } from '../src/desertTerrain'
import { SandSimulation, SAND_LIMITS } from '../src/sandSimulation'
import { SandStroke } from '../src/sandStroke'

function heights(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')
  return Array.from({ length: position.count }, (_, id) => position.getY(id))
}

// Integrate each triangle directly, independently of the simulation's cell areas.
function volume(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position'), index = geometry.getIndex()!
  let result = 0
  for (let face = 0; face < index.count; face += 3) {
    const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2)
    const area = Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2
    result += area * (p.getY(a) + p.getY(b) + p.getY(c)) / 3
  }
  return result
}

function flatPatch(slope = 0) {
  const geometry = new THREE.PlaneGeometry(2, 2, 32, 32)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(3, 0, 0)
  const p = geometry.getAttribute('position')
  for (let id = 0; id < p.count; id++) p.setY(id, slope * (p.getX(id) - 3))
  geometry.computeVertexNormals()
  return geometry
}

function close(actual: number, expected: number, tolerance = 3e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected} by ${actual - expected}`)
}

test('dig, push, smooth and settling conserve volume on the actual unequal-area annular mesh', () => {
  const geometry = nearSandGeometry(), initial = volume(geometry), base = heights(geometry)
  const sim = new SandSimulation(geometry)
  for (const tool of ['dig', 'push', 'smooth'] as const) {
    for (let i = 0; i < 60; i++) {
      const angle = i * 0.43, radius = [1.35, 3, 8.35][i % 3]
      sim.brush(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.95, 0.16, tool, Math.cos(angle), Math.sin(angle))
      sim.step(1 / 60)
    }
    close(volume(geometry), initial)
  }
  // Repeated pressure reaches depth/pile limits and exercises clipped redistribution.
  for (let i = 0; i < 150; i++) sim.brush(1.35, 0, 1, 0.3, 'push', -1, 0)
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  close(volume(geometry), initial)
  const p = geometry.getAttribute('position')
  for (let id = 0; id < p.count; id++) {
    const change = p.getY(id) - base[id]
    assert.ok(change >= -SAND_LIMITS.depth - 1e-6 && change <= SAND_LIMITS.pile + 1e-6)
    const radius = Math.hypot(p.getX(id), p.getZ(id))
    if (radius < SAND_LIMITS.inner || radius > SAND_LIMITS.outer) assert.equal(change, 0)
  }
})

test('gravity reacts to base terrain slope beyond the brush footprint', () => {
  const geometry = flatPatch(0.9), base = heights(geometry), initial = volume(geometry)
  const sim = new SandSimulation(geometry)
  sim.brush(3, 0, 0.4, 0.01)
  for (let i = 0; i < 240; i++) sim.step(1 / 60)
  const p = geometry.getAttribute('position')
  assert.ok(base.some((height, id) => Math.hypot(p.getX(id) - 3, p.getZ(id)) > 0.5 && Math.abs(p.getY(id) - height) > 0.001))
  close(volume(geometry), initial)
})

test('fixed stepping produces identical settled geometry at 30, 60 and 120 fps', () => {
  const results = [30, 60, 120].map((fps) => {
    const geometry = flatPatch(), sim = new SandSimulation(geometry)
    for (let i = 0; i < 8; i++) sim.brush(3, 0, 0.65, 0.1, 'push', 1, 0)
    for (let i = 0; i < fps * 2; i++) sim.step(1 / fps)
    return heights(geometry)
  })
  assert.deepEqual(results[0], results[1])
  assert.deepEqual(results[1], results[2])
})

test('stroke geometry is independent of pointer event count', () => {
  const results = [1, 20, 100].map((events) => {
    const geometry = flatPatch(), sim = new SandSimulation(geometry), stroke = new SandStroke(sim)
    stroke.begin(2.5, 0, 0.5, 1, 'dig')
    for (let i = 1; i <= events; i++) stroke.move(2.5 + i / events, 0, 0.5, 1, 'dig')
    sim.step(0)
    return heights(geometry)
  })
  for (let id = 0; id < results[0].length; id++) {
    close(results[0][id], results[1][id], 1e-7)
    close(results[0][id], results[2][id], 1e-7)
  }
})

test('push deposits ahead of travel, smoothing reduces relief, and disturbance persists', () => {
  const geometry = flatPatch(), sim = new SandSimulation(geometry)
  sim.brush(3, 0, 0.7, 0.12, 'push', 1, 0)
  sim.step(0)
  const p = geometry.getAttribute('position')
  let ahead = 0, behind = 0
  for (let id = 0; id < p.count; id++) {
    if (p.getX(id) > 3) ahead += Math.max(0, p.getY(id))
    else behind += Math.max(0, p.getY(id))
  }
  assert.ok(ahead > 0 && behind === 0)
  const before = heights(geometry), initial = volume(geometry)
  for (let i = 0; i < 80; i++) sim.brush(3, 0, 1, 0.1, 'smooth')
  sim.step(0)
  const after = heights(geometry)
  assert.ok(Math.max(...after) - Math.min(...after) < Math.max(...before) - Math.min(...before))
  close(volume(geometry), initial)
  const disturbance = Array.from(geometry.getAttribute('sandDisturbance').array)
  for (let i = 0; i < 240; i++) sim.step(1 / 60)
  assert.ok(disturbance.some((value) => value > 0))
  for (let id = 0; id < disturbance.length; id++) assert.ok(geometry.getAttribute('sandDisturbance').getX(id) >= disturbance[id])
})

test('local normals match a full recomputation and bounds contain maximum digging and piles', () => {
  const geometry = nearSandGeometry()
  geometry.computeBoundingBox() // Callers may already have cached bounds.
  const sim = new SandSimulation(geometry)
  for (let i = 0; i < 8; i++) sim.brush(3, 1, 0.7, 0.1, 'push', 1, 0)
  sim.step(1 / 60)
  const expected = geometry.clone()
  expected.computeVertexNormals()
  const normal = geometry.getAttribute('normal'), reference = expected.getAttribute('normal'), p = geometry.getAttribute('position')
  for (let id = 0; id < p.count; id++) {
    close(normal.getX(id), reference.getX(id), 1e-6)
    close(normal.getY(id), reference.getY(id), 1e-6)
    close(normal.getZ(id), reference.getZ(id), 1e-6)
    assert.ok(geometry.boundingBox!.containsPoint(new THREE.Vector3().fromBufferAttribute(p, id)))
    assert.ok(geometry.boundingSphere!.containsPoint(new THREE.Vector3().fromBufferAttribute(p, id)))
  }
})

test('idle sand stays unchanged and invalid brush input cannot corrupt geometry', () => {
  const geometry = flatPatch(), before = heights(geometry), sim = new SandSimulation(geometry)
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  assert.equal(sim.brush(0, 0, 0.6, 1), false)
  assert.equal(sim.brush(3, 0, 0.6, NaN), false)
  assert.equal(sim.brush(3, 0, 0, 1), false)
  sim.step(NaN)
  sim.step(0)
  assert.deepEqual(heights(geometry), before)
})
