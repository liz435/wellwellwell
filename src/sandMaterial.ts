import * as THREE from 'three'
import { DESERT } from './desertTerrain'
import { stoneMaterial } from './sceneMaterials'

/** Grain and wind ripples follow the surface; disturbed sand retains its material history. */
export function sandMaterial(brush?: THREE.Vector4): THREE.MeshStandardMaterial {
  const material = stoneMaterial('#b9ad94', 0.5, 0.006, true)
  material.roughness = 0.91
  material.customProgramCacheKey = () => `granular-sand-v4-${Boolean(brush)}`
  material.onBeforeCompile = (shader) => {
    if (brush) shader.uniforms.sandBrush = { value: brush }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec2 vSandPosition;
        varying float vSandDisturbance;
        ${brush ? 'attribute float sandDisturbance;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSandPosition = vec2(uv.x, -uv.y);
        vSandDisturbance = ${brush ? 'sandDisturbance' : '0.0'};`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vSandPosition;
        varying float vSandDisturbance;
        ${brush ? 'uniform vec4 sandBrush;' : ''}
        float sandHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sandNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(sandHash(cell), sandHash(cell + vec2(1.0, 0.0)), f.x),
            mix(sandHash(cell + vec2(0.0, 1.0)), sandHash(cell + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float sandVariation = sandNoise(vSandPosition * 0.23);
        float disturbed = clamp(vSandDisturbance, 0.0, 1.0);
        diffuseColor.rgb *= (0.97 + 0.06 * sandVariation) * (1.0 - disturbed * 0.035);
        ${brush ? `float brushDistance = abs(length(vSandPosition - sandBrush.xy) - sandBrush.z);
        float brushWidth = max(fwidth(brushDistance) * 1.5, 0.009);
        float brushOutline = (1.0 - smoothstep(brushWidth, brushWidth * 2.0, brushDistance)) * sandBrush.w;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.54, 0.31), brushOutline * 0.45);` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(0.91 + (sandVariation - 0.5) * 0.06 - disturbed * 0.045, 0.84, 0.96);`)
      .replace('#include <normal_fragment_maps>', `
        // Mipmapped grain handles the finest scale. Filter procedural ripples at distance.
        vec2 wind = vec2(${Math.cos(DESERT.windAngle).toFixed(8)}, ${Math.sin(DESERT.windAngle).toFixed(8)});
        float ripplePhase = dot(vSandPosition, wind) * 38.0 + sandNoise(vSandPosition * 1.6) * 3.5;
        float rippleFilter = 1.0 - smoothstep(0.4, 2.2, fwidth(ripplePhase));
        float rippleHeight = sin(ripplePhase) * 0.0035 * rippleFilter * (1.0 - disturbed * 0.9);
        vec2 reliefGradient = dHdxy_fwd() * (1.0 - disturbed * 0.3) + vec2(dFdx(rippleHeight), dFdy(rippleHeight));
        normal = perturbNormalArb(-vViewPosition, normal, reliefGradient, faceDirection);`)
  }
  return material
}
