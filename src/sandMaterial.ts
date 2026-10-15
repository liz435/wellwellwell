import * as THREE from 'three'
import { stoneMaterial } from './sceneMaterials'

/** PBR sand with quiet grain and up to four short-lived marks from clicks. */
export function sandMaterial(touches: THREE.Vector3[]): THREE.MeshStandardMaterial {
  const material = stoneMaterial('#c8ae7f', 0.5, 0.009, true)
  material.roughness = 0.9
  material.customProgramCacheKey = () => 'granular-sand-touch-v3'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sandTouches = { value: touches }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandWorldPosition;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSandWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;')

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSandWorldPosition;
        uniform vec3 sandTouches[4];
        float sandHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sandNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(sandHash(cell), sandHash(cell + vec2(1.0, 0.0)), f.x),
            mix(sandHash(cell + vec2(0.0, 1.0)), sandHash(cell + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float sandVariation = sandNoise(vSandWorldPosition.xz * 0.18);
        diffuseColor.rgb *= 0.975 + 0.05 * sandVariation;
        float touchShade = 0.0;
        for (int i = 0; i < 4; i++) {
          float age = sandTouches[i].z;
          if (age >= 0.0 && age < 1.0) {
            float distanceFromTouch = length(vSandWorldPosition.xz - sandTouches[i].xy);
            float center = exp(-distanceFromTouch * distanceFromTouch * 28.0) * exp(-age * 5.0);
            float waveDistance = (distanceFromTouch - age * 1.7) / (0.09 + age * 0.12);
            float ring = exp(-waveDistance * waveDistance) * (1.0 - age);
            touchShade += center * 0.13 + ring * 0.11;
          }
        }
        diffuseColor.rgb *= 1.0 - min(touchShade, 0.22);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (sandVariation - 0.5) * 0.04, 0.84, 0.95);`)
  }
  return material
}
