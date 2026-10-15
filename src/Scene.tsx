import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { Sky } from 'three/addons/objects/Sky.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { motion, type MotionValue } from 'motion/react'
import * as THREE from 'three'
import { blurredMosaicStoneMaterial, disposeStone, groundedCourseY, groundWithOpening, roundStoneBlock, stoneMaterial } from './sceneMaterials'
import { DESERT, duneGeometry, nearSandGeometry } from './desertTerrain'
import { sandMaterial } from './sandMaterial'
import { SandSimulation } from './sandSimulation'
import { OPENING_CAMERA, OPENING_LIGHT, SHOOTING_STARS, openingSequence } from './openingSequence'
import { mosaicTransitionAt, sceneCamera, spatialPartitionAt, WINDOW_SCENES } from './sceneTimeline'

type SceneProps = { journey: MotionValue<number>; approach: MotionValue<number>; aperture: MotionValue<string>; sceneOpacity: MotionValue<number>; stage: number; pulse: number; onSandTouch: () => void }

function WellBloom({ journey }: Pick<SceneProps, 'journey'>) {
  const { gl, scene, camera, size } = useThree()
  const composer = useRef<EffectComposer | null>(null)
  const mosaicPass = useRef<ShaderPass | null>(null)
  useEffect(() => {
    const effects = new EffectComposer(gl)
    const render = new RenderPass(scene, camera)
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.85, 0.75)
    const mosaic = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        pixelSize: { value: 1 },
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float pixelSize;
        varying vec2 vUv;
        void main() {
          vec2 grid = resolution / max(pixelSize, 1.0);
          vec2 sampledUv = (floor(vUv * grid) + 0.5) / grid;
          gl_FragColor = texture2D(tDiffuse, sampledUv);
        }`,
    })
    const output = new OutputPass()
    effects.addPass(render)
    effects.addPass(bloom)
    effects.addPass(mosaic)
    effects.addPass(output)
    effects.setPixelRatio(Math.min(gl.getPixelRatio(), 1.25))
    composer.current = effects
    mosaicPass.current = mosaic
    return () => { composer.current = null; mosaicPass.current = null; render.dispose(); bloom.dispose(); mosaic.dispose(); output.dispose(); effects.dispose() }
  }, [gl, scene, camera])
  useEffect(() => {
    composer.current?.setSize(size.width, size.height)
    mosaicPass.current?.uniforms.resolution.value.set(size.width * Math.min(gl.getPixelRatio(), 1.25), size.height * Math.min(gl.getPixelRatio(), 1.25))
  }, [size.width, size.height, gl])
  useFrame((_, delta) => {
    if (mosaicPass.current) {
      const transition = mosaicTransitionAt(journey.get())
      mosaicPass.current.enabled = transition.pixelSize > 1.5
      mosaicPass.current.uniforms.pixelSize.value = Math.max(1, Math.round(transition.pixelSize))
    }
    if (composer.current) composer.current.render(Math.min(delta, 0.05))
    else gl.render(scene, camera)
  }, 1)
  return null
}

function Stars({ approach, journey }: Pick<SceneProps, 'approach' | 'journey'>) {
  const material = useRef<THREE.PointsMaterial>(null)
  const stars = useMemo(() => {
    const count = 8200
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    let seed = 7283
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let index = 0; index < count; index++) {
      const angle = random() * Math.PI * 2
      const elevation = 0.03 + random() * 0.97
      const radius = Math.sqrt(1 - elevation * elevation) * 230
      positions[index * 3] = Math.cos(angle) * radius
      positions[index * 3 + 1] = elevation * 230
      positions[index * 3 + 2] = Math.sin(angle) * radius
      const brightness = 0.38 + random() ** 3 * 0.62
      colors[index * 3] = brightness
      colors[index * 3 + 1] = brightness * (0.9 + random() * 0.1)
      colors[index * 3 + 2] = brightness * (0.9 + random() * 0.1)
    }
    return { positions, colors }
  }, [])
  useFrame(() => {
    const light = openingSequence(approach.get()).daylight
    if (material.current) {
      const openingStars = (1 - THREE.MathUtils.smoothstep(light, 0.1, OPENING_LIGHT.arrival)) * (1 - THREE.MathUtils.smoothstep(journey.get(), 1.9, 2.35))
      const closingStars = THREE.MathUtils.smoothstep(journey.get(), 4.08, 4.38)
      material.current.opacity = 0.7 * Math.max(openingStars, closingStars)
    }
  })
  return <points frustumCulled={false}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[stars.positions, 3]} />
      <bufferAttribute attach="attributes-color" args={[stars.colors, 3]} />
    </bufferGeometry>
    <pointsMaterial ref={material} color="#eee9f4" vertexColors size={1.6} sizeAttenuation={false} transparent opacity={0.8} depthWrite={false} fog={false} />
  </points>
}

function ShootingStars({ approach }: Pick<SceneProps, 'approach'>) {
  const trailSegments = 6
  const heads = useRef<THREE.InstancedMesh>(null)
  const streaks = useRef<THREE.InstancedMesh>(null)
  const paths = useMemo(() => SHOOTING_STARS.map((star) => ({
    ...star,
    origin: new THREE.Vector3(...star.from),
    mouth: new THREE.Vector3(star.to[0] * 0.55, 0.24, star.to[2] * 0.55),
    destination: new THREE.Vector3(...star.to),
  })), [])
  const current = useMemo(() => new THREE.Vector3(), [])
  const trailing = useMemo(() => new THREE.Vector3(), [])
  const segmentEnd = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const headTransform = useMemo(() => new THREE.Object3D(), [])
  const streakTransform = useMemo(() => new THREE.Object3D(), [])
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const positionAt = (star: (typeof paths)[number], travel: number, target: THREE.Vector3) => {
    if (travel < 0.58) {
      const approach = travel / 0.58
      const remaining = 1 - approach
      const curve = 2 * remaining * approach
      target.x = remaining * remaining * star.origin.x + curve * (star.mouth.x + star.sideBend * 0.4) + approach * approach * star.mouth.x
      target.z = remaining * remaining * star.origin.z + curve * (star.mouth.z + star.depthBend * 0.4) + approach * approach * star.mouth.z
      const arc = 4 * approach * (1 - approach)
      target.y = THREE.MathUtils.lerp(star.origin.y, star.mouth.y, approach) + arc * star.bend
    } else {
      target.lerpVectors(star.mouth, star.destination, (travel - 0.58) / 0.42)
    }
  }
  useEffect(() => {
    heads.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    streaks.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    paths.forEach((star, index) => {
      const tint = new THREE.Color(star.palette < 0.18 ? '#dce4ff' : star.palette < 0.42 ? '#e9d9ff' : '#ffe0b5').multiplyScalar(star.brightness)
      heads.current?.setColorAt(index, tint)
      for (let segment = 0; segment < trailSegments; segment++) {
        streaks.current?.setColorAt(index * trailSegments + segment, tint.clone().multiplyScalar(1 - segment / trailSegments * 0.5))
      }
    })
    if (heads.current?.instanceColor) heads.current.instanceColor.needsUpdate = true
    if (streaks.current?.instanceColor) streaks.current.instanceColor.needsUpdate = true
  }, [paths])
  useFrame(() => {
    if (!heads.current || !streaks.current) return
    const progress = approach.get()
    heads.current.visible = progress < 0.72
    streaks.current.visible = progress >= 0.12 && progress < 0.69
    if (!heads.current.visible && !streaks.current.visible) return
    for (let index = 0; index < paths.length; index++) {
      const star = paths[index]
      const phase = THREE.MathUtils.clamp((progress - star.start) / (star.impact - star.start), 0, 1)
      const travel = phase ** star.exponent
      positionAt(star, travel, current)
      headTransform.position.copy(current)
      const landed = THREE.MathUtils.smoothstep(progress, star.impact, star.impact + 0.025)
      headTransform.scale.setScalar(progress < star.start ? star.size * 0.28 : star.size * (1 - landed))
      headTransform.updateMatrix()
      heads.current.setMatrixAt(index, headTransform.matrix)

      for (let segment = 0; segment < trailSegments; segment++) {
        streakTransform.scale.setScalar(0)
        if (progress >= star.start && progress < star.impact) {
          const endPhase = Math.max(0, phase - star.tail * segment / trailSegments)
          const startPhase = Math.max(0, phase - star.tail * (segment + 1) / trailSegments)
          positionAt(star, endPhase ** star.exponent, segmentEnd)
          positionAt(star, startPhase ** star.exponent, trailing)
          direction.subVectors(segmentEnd, trailing)
          const length = direction.length()
          if (length > 0.001) {
            streakTransform.position.copy(segmentEnd).add(trailing).multiplyScalar(0.5)
            streakTransform.quaternion.setFromUnitVectors(yAxis, direction.normalize())
            const width = star.size * (1 - segment / trailSegments * 0.75)
            streakTransform.scale.set(width, length, width)
          }
        }
        streakTransform.updateMatrix()
        streaks.current.setMatrixAt(index * trailSegments + segment, streakTransform.matrix)
      }
    }
    heads.current.instanceMatrix.needsUpdate = true
    streaks.current.instanceMatrix.needsUpdate = true
  })
  return <group>
    <instancedMesh ref={streaks} args={[undefined, undefined, paths.length * trailSegments]} frustumCulled={false}>
      <cylinderGeometry args={[0.05, 0.05, 1, 5]} />
      <meshBasicMaterial color={new THREE.Color('#fff1d6').multiplyScalar(1.7)} transparent opacity={0.78}
        blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={heads} args={[undefined, undefined, paths.length]} frustumCulled={false}>
      <sphereGeometry args={[0.085, 8, 6]} />
      <meshBasicMaterial color={new THREE.Color('#ffffff').multiplyScalar(2.2)} transparent opacity={0.9}
        blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false} />
    </instancedMesh>
  </group>
}

function Lighting({ approach, journey }: Pick<SceneProps, 'approach' | 'journey'>) {
  const { gl, scene } = useThree()
  const hemisphere = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const nightFog = useMemo(() => new THREE.Color('#171529'), [])
  const dayFog = useMemo(() => new THREE.Color('#c5ad8d'), [])
  const sky = useMemo(() => {
    const object = new Sky()
    object.scale.setScalar(450)
    object.material.uniforms.turbidity.value = 2
    object.material.uniforms.rayleigh.value = 1
    object.material.uniforms.mieCoefficient.value = 0.002
    object.material.uniforms.mieDirectionalG.value = 0.8
    object.material.uniforms.sunPosition.value.set(-3, 7, 4).normalize()
    object.material.uniforms.uDaylight = { value: 0 }
    object.material.fragmentShader = 'uniform float uDaylight;\n' + object.material.fragmentShader.replace('#include <tonemapping_fragment>', `
      float horizon = pow(1.0 - abs(direction.y), 4.0);
      vec3 night = mix(vec3(0.008, 0.011, 0.033), vec3(0.047, 0.026, 0.070), horizon);
      gl_FragColor.rgb = mix(night, gl_FragColor.rgb, uDaylight);
      #include <tonemapping_fragment>`)
    return object
  }, [])
  useEffect(() => {
    const previousFog = scene.fog
    const fog = new THREE.FogExp2(nightFog, 0.006)
    scene.fog = fog
    return () => { scene.fog = previousFog }
  }, [scene, nightFog])
  useEffect(() => {
    const environmentScene = new THREE.Scene()
    environmentScene.add(sky.clone())
    const generator = new THREE.PMREMGenerator(gl)
    sky.material.uniforms.uDaylight.value = 1
    const environment = generator.fromScene(environmentScene, 0.04)
    sky.material.uniforms.uDaylight.value = 0
    const previous = scene.environment
    scene.environment = environment.texture
    scene.environmentIntensity = 0.38
    return () => {
      scene.environment = previous
      environment.dispose()
      generator.dispose()
    }
  }, [gl, scene, sky])
  useFrame(() => {
    const openingLight = openingSequence(approach.get()).daylight
    const daylight = THREE.MathUtils.lerp(openingLight, 1, THREE.MathUtils.smoothstep(journey.get(), 1.9, 2.85))
    const light = THREE.MathUtils.lerp(daylight, 0.16, THREE.MathUtils.smoothstep(journey.get(), 3.84, 4.34))
    sky.material.uniforms.uDaylight.value = THREE.MathUtils.clamp((light - OPENING_LIGHT.night) / (1 - OPENING_LIGHT.night), 0, 1)
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(nightFog).lerp(dayFog, THREE.MathUtils.smoothstep(light, 0.35, 1))
      scene.fog.density = THREE.MathUtils.lerp(0.006, 0.001, light)
    }
    scene.environmentIntensity = 0.38 * light
    if (hemisphere.current) hemisphere.current.intensity = 0.7 * light
    if (sun.current) sun.current.intensity = 2.6 * light
    if (fill.current) fill.current.intensity = 0.25 * light
  })
  return <>
    <primitive object={sky} />
    <Stars approach={approach} journey={journey} />
    <hemisphereLight ref={hemisphere} args={['#dae3e5', '#b79864', 0]} />
    <directionalLight ref={sun} position={[-3, 7, 4]} color="#fff0da" intensity={0} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-7} shadow-camera-right={7}
      shadow-camera-top={7} shadow-camera-bottom={-7} shadow-camera-far={22}
      shadow-bias={-0.0002} shadow-normalBias={0.018} />
    <directionalLight ref={fill} position={[4, 3, -4]} color="#d9e6ed" intensity={0} />
  </>
}

function Water({ pulse, journey }: { pulse: number; journey: MotionValue<number> }) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshPhysicalMaterial>(null)
  const ripple = useRef(0)
  useEffect(() => { if (pulse > 0) ripple.current = 1 }, [pulse])
  useFrame((_, delta) => {
    ripple.current = Math.max(0, ripple.current - delta * 0.27)
    if (material.current) material.current.roughness = 0.09 + ripple.current * 0.12
    if (group.current) group.current.visible = journey.get() > 0.88
  })
  return <group ref={group} visible={false}>
    <mesh position={[0, -2.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.75, 64]} />
      <meshStandardMaterial color="#071b17" roughness={0.9} />
    </mesh>
    <mesh position={[0, -2.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.75, 64]} />
      <meshPhysicalMaterial ref={material} color="#345b50" roughness={0.1} metalness={0.25}
        transmission={0.35} thickness={0.18} ior={1.333} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={1.8} />
    </mesh>
  </group>
}

function GlyphProjection({ journey }: Pick<SceneProps, 'journey'>) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#c7a786', transparent: true, opacity: 0, depthWrite: false }), [])
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, rawDelta) => {
    const progress = journey.get()
    const target = 0.34 * THREE.MathUtils.smoothstep(progress, 1.08, 1.36) * (1 - THREE.MathUtils.smoothstep(progress, 1.7, 1.98))
    material.opacity = THREE.MathUtils.damp(material.opacity, target, 4, Math.min(rawDelta, 0.05))
  })
  const y = DESERT.baseHeight + 0.025
  return <group>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * 1.45, y, 0]} material={material}><boxGeometry args={[0.035, 0.008, 3.55]} /></mesh>
      <mesh position={[0, y, side * 1.45]} material={material}><boxGeometry args={[3.55, 0.008, 0.035]} /></mesh>
    </group>)}
  </group>
}

function PixelWell({ journey, approach, pulse, onSandTouch }: Pick<SceneProps, 'journey' | 'approach' | 'pulse' | 'onSandTouch'>) {
  const { camera, gl, size } = useThree()
  const blocks = useRef<THREE.InstancedMesh>(null)
  const groundMesh = useRef<THREE.Mesh>(null)
  const duneMesh = useRef<THREE.Mesh>(null)
  const nearSandMesh = useRef<THREE.Mesh>(null)
  const softenedGlow = useRef(0)
  const touches = useMemo(() => Array.from({ length: 4 }, () => new THREE.Vector3(0, 0, -1)), [])
  const nextTouch = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const materials = useMemo(() => {
    const lining = stoneMaterial('#5b4b43', 1.5, 0.01)
    lining.side = THREE.BackSide
    lining.emissive.set('#e3aaa0')
    lining.emissiveIntensity = 0
    return {
      stone: blurredMosaicStoneMaterial(),
      ground: sandMaterial(touches),
      lining,
    }
  }, [touches])
  const geometry = useMemo(roundStoneBlock, [])
  const groundGeometry = useMemo(() => new THREE.ShapeGeometry(groundWithOpening(80, 0.75)), [])
  const dunes = useMemo(duneGeometry, [])
  const nearSand = useMemo(nearSandGeometry, [])
  const sandSimulation = useMemo(() => new SandSimulation(nearSand), [nearSand])
  const positions = useMemo(() => {
    const points: [number, number, number][] = []
    for (let layer = 0; layer < 4; layer++) for (let block = 0; block < 24; block++) points.push([(block + (layer % 2) * 0.5) * Math.PI * 2 / 24, layer, 0])
    return points
  }, [])
  useEffect(() => {
    positions.forEach(([angle, course], index) => {
      const variation = 0.79 + ((index * 17) % 23) / 100
      blocks.current?.setColorAt(index, new THREE.Color(variation, variation * 0.98, variation * 0.94).multiplyScalar(course === 0 ? 0.84 : 1))
      dummy.position.set(Math.sin(angle) * 0.91, groundedCourseY(DESERT.baseHeight - 0.015, geometry.boundingBox!.min.y, course), Math.cos(angle) * 0.91)
      const coping = course === 3 ? 1.065 : 1
      dummy.scale.set(coping, 1, coping)
      dummy.rotation.set(0, angle, 0)
      dummy.updateMatrix()
      blocks.current?.setMatrixAt(index, dummy.matrix)
    })
    if (blocks.current?.instanceColor) blocks.current.instanceColor.needsUpdate = true
    if (blocks.current) blocks.current.instanceMatrix.needsUpdate = true
    return () => {
      Object.values(materials).forEach(disposeStone)
      geometry.dispose()
      groundGeometry.dispose()
      dunes.dispose()
      nearSand.dispose()
    }
  }, [positions, materials, geometry, groundGeometry, dunes, nearSand, dummy])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let activePointer: number | null = null
    let lastPoint: THREE.Vector3 | null = null
    let lastMove = 0
    const sandPoint = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('a, button, input, textarea, .essay-column, .opening h1, .opening-caption, .eyebrow, .opening-sky-cue, .drawing-note, .site-header, footer')) return null
      const partition = spatialPartitionAt(journey.get(), size.width, size.height)
      if (partition.sceneOpacity < 0.5 || event.clientX < partition.left || event.clientX > partition.left + partition.width || event.clientY < partition.top || event.clientY > partition.top + partition.height) return null
      const corner = partition.radius
      if (corner > 0) {
        const nearestX = THREE.MathUtils.clamp(event.clientX, partition.left + corner, partition.left + partition.width - corner)
        const nearestY = THREE.MathUtils.clamp(event.clientY, partition.top + corner, partition.top + partition.height - corner)
        if (Math.hypot(event.clientX - nearestX, event.clientY - nearestY) > corner) return null
      }
      const bounds = gl.domElement.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const targets = [blocks.current, nearSandMesh.current].filter((mesh): mesh is THREE.Mesh | THREE.InstancedMesh => mesh !== null)
      const hit = raycaster.intersectObjects(targets, false)[0]
      if (!hit || hit.object !== nearSandMesh.current) return null
      const local = nearSandMesh.current.worldToLocal(hit.point.clone())
      if (Math.hypot(local.x, local.z) < 1.35 || Math.hypot(local.x, local.z) > 8.35) return null
      return { world: hit.point, local }
    }
    const beginDig = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || event.button !== 0 || activePointer !== null) return
      const point = sandPoint(event)
      if (!point || !sandSimulation.dig(point.local.x, point.local.z, 0.085)) return
      activePointer = event.pointerId
      lastPoint = point.local
      touches[nextTouch.current].set(point.world.x, point.world.z, 0)
      nextTouch.current = (nextTouch.current + 1) % touches.length
      onSandTouch()
      if (event.pointerType === 'touch' && event.cancelable) event.preventDefault()
    }
    const moveDig = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && event.pointerId !== activePointer) return
      if (event.timeStamp - lastMove < 24) return
      lastMove = event.timeStamp
      const point = sandPoint(event)
      if (!point) { lastPoint = null; return }
      if (!lastPoint) {
        sandSimulation.dig(point.local.x, point.local.z, 0.025)
        lastPoint = point.local
        touches[nextTouch.current].set(point.world.x, point.world.z, 0)
        nextTouch.current = (nextTouch.current + 1) % touches.length
        onSandTouch()
        return
      }
      const distance = point.local.distanceTo(lastPoint)
      if (distance < 0.08) return
      const steps = Math.min(12, Math.ceil(distance / 0.24))
      for (let step = 1; step <= steps; step++) {
        const t = step / steps
        sandSimulation.dig(THREE.MathUtils.lerp(lastPoint.x, point.local.x, t), THREE.MathUtils.lerp(lastPoint.z, point.local.z, t), 0.025)
      }
      lastPoint = point.local
      if (event.pointerType === 'touch' && event.cancelable) event.preventDefault()
    }
    const endDig = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return
      activePointer = null
      lastPoint = null
    }
    const resetTrail = () => { lastPoint = null }
    const leaveWindow = (event: PointerEvent) => { if (!event.relatedTarget) resetTrail() }
    window.addEventListener('pointerdown', beginDig, { passive: false })
    window.addEventListener('pointermove', moveDig, { passive: false })
    window.addEventListener('pointerup', endDig)
    window.addEventListener('pointercancel', endDig)
    window.addEventListener('pointerout', leaveWindow)
    window.addEventListener('blur', resetTrail)
    window.addEventListener('scroll', resetTrail, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', beginDig)
      window.removeEventListener('pointermove', moveDig)
      window.removeEventListener('pointerup', endDig)
      window.removeEventListener('pointercancel', endDig)
      window.removeEventListener('pointerout', leaveWindow)
      window.removeEventListener('blur', resetTrail)
      window.removeEventListener('scroll', resetTrail)
    }
  }, [camera, gl, journey, onSandTouch, sandSimulation, size.width, size.height, touches])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    sandSimulation.step(delta)
    for (const touch of touches) if (touch.z >= 0) touch.z = touch.z + delta / 1.6 >= 1 ? -1 : touch.z + delta / 1.6
    const opening = openingSequence(approach.get())
    const chapterOneGlow = 0.78 * THREE.MathUtils.smoothstep(journey.get(), 0.88, 1.06)
      * (1 - THREE.MathUtils.smoothstep(journey.get(), WINDOW_SCENES.lookIntoWell.start, WINDOW_SCENES.lookIntoWell.end))
    const closingGlow = 0.45 * THREE.MathUtils.smoothstep(journey.get(), 4.16, 4.42)
      * (1 - 0.86 * THREE.MathUtils.smoothstep(journey.get(), WINDOW_SCENES.closingApproach.start, WINDOW_SCENES.closingTilt.end))
    const targetGlow = Math.max(opening.glow, chapterOneGlow, closingGlow)
    softenedGlow.current = THREE.MathUtils.damp(softenedGlow.current, targetGlow, targetGlow > softenedGlow.current ? 5 : 2.8, delta)
    if (softenedGlow.current < 0.0001) softenedGlow.current = 0
    const glow = softenedGlow.current
    materials.lining.emissiveIntensity = glow * 3.5
  })

  return <group>
    <instancedMesh ref={blocks} args={[geometry, materials.stone, positions.length]} castShadow receiveShadow frustumCulled={false} />
    <GlyphProjection journey={journey} />
    <group>
    <mesh ref={groundMesh} geometry={groundGeometry} material={materials.ground} position={[0, DESERT.baseHeight - 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
    <mesh ref={duneMesh} geometry={dunes} material={materials.ground} receiveShadow />
    <mesh ref={nearSandMesh} geometry={nearSand} material={materials.ground} castShadow receiveShadow />
    </group>
    <group>
      <mesh position={[0, -1.13, 0]} material={materials.lining} receiveShadow><cylinderGeometry args={[0.744, 0.744, 1.85, 64, 1, true]} /></mesh>
      <Water pulse={pulse} journey={journey} />
    </group>
  </group>
}

function EchoRings() {
  const group = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, 0.05)
    group.current?.children.forEach((child, index) => {
      const age = elapsed.current - index * 0.28
      child.visible = age >= 0 && age < 2.6
      child.scale.setScalar(0.35 + Math.max(age, 0) * 0.5)
      child.position.y = -0.7 + Math.max(age, 0) * 0.18
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
      material.opacity = Math.max(0, 0.4 - Math.max(age, 0) * 0.16)
    })
  })
  return <group ref={group}>{[0, 1, 2].map((index) => <mesh key={index} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.68, 0.686, 64]} /><meshBasicMaterial color="#d5c6a2" transparent side={THREE.DoubleSide} depthWrite={false} /></mesh>)}</group>
}

function WellBallPool({ journey }: Pick<SceneProps, 'journey'>) {
  const { camera, gl } = useThree()
  const mesh = useRef<THREE.InstancedMesh>(null)
  const heldBall = useRef<THREE.Mesh>(null)
  const violetLight = useRef<THREE.PointLight>(null)
  const blueLight = useRef<THREE.PointLight>(null)
  const selected = useRef(-1)
  const returning = useRef(false)
  const pendingSelection = useRef(-1)
  const lift = useRef(0)
  const lastInkPoint = useRef<THREE.Vector3 | null>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const liftedPosition = useMemo(() => new THREE.Vector3(0, -0.76, 0.1), [])
  const inkPoint = useMemo(() => new THREE.Vector3(), [])
  const inkTrail = useMemo(() => Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 0, -1)), [])
  const drawnMaterial = useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.2, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.1,
      iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400],
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDrawTrail = { value: inkTrail }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBallLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBallLocal = normalize(position);')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBallLocal;\nuniform vec4 uDrawTrail[32];')
        .replace('#include <opaque_fragment>', `
          float inkCore = 0.0;
          float inkHalo = 0.0;
          vec3 surfacePoint = normalize(vBallLocal);
          for (int i = 0; i < 31; i++) {
            vec4 a = uDrawTrail[i];
            vec4 b = uDrawTrail[i + 1];
            if (a.w < 0.0 || b.w < 0.0 || a.w >= 1.0 || b.w >= 1.0) continue;
            vec3 segment = b.xyz - a.xyz;
            if (dot(segment, segment) > 0.12) continue;
            float along = clamp(dot(surfacePoint - a.xyz, segment) / max(dot(segment, segment), 0.00001), 0.0, 1.0);
            float distanceToInk = distance(surfacePoint, normalize(a.xyz + segment * along));
            float life = 1.0 - (a.w + b.w) * 0.5;
            inkCore = max(inkCore, (1.0 - smoothstep(0.012, 0.035, distanceToInk)) * life);
            inkHalo = max(inkHalo, (1.0 - smoothstep(0.035, 0.11, distanceToInk)) * life);
          }
          outgoingLight = mix(outgoingLight, vec3(0.035, 0.025, 0.085), inkCore * 0.9);
          outgoingLight += vec3(0.34, 0.25, 0.72) * inkHalo * 0.65;
          #include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => 'well-ball-draw-v1'
    return material
  }, [inkTrail])
  useEffect(() => () => drawnMaterial.dispose(), [drawnMaterial])
  const balls = useMemo(() => {
    const positions: THREE.Vector3[] = []
    const colors: THREE.Color[] = []
    let seed = 48291
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let layer = 0; layer < 7; layer++) {
      for (let row = -3; row <= 3; row++) for (let column = -3; column <= 3; column++) {
        const x = column * 0.19 + (row % 2) * 0.095 + (random() - 0.5) * 0.035
        const z = row * 0.17 + (layer % 2) * 0.08 + (random() - 0.5) * 0.035
        if (Math.hypot(x, z) > 0.61) continue
        positions.push(new THREE.Vector3(x, -1.94 + layer * 0.185 + (random() - 0.5) * 0.025, z))
        colors.push(new THREE.Color().setHSL(0.53 + random() * 0.34, 0.58 + random() * 0.22, 0.58 + random() * 0.12))
      }
    }
    return { positions, colors }
  }, [])
  useEffect(() => {
    const pool = mesh.current
    if (!pool) return
    pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    balls.colors.forEach((color, index) => {
      pool.setColorAt(index, color)
      dummy.position.copy(balls.positions[index])
      dummy.scale.setScalar(0.102)
      dummy.updateMatrix()
      pool.setMatrixAt(index, dummy.matrix)
    })
    pool.instanceMatrix.needsUpdate = true
    if (pool.instanceColor) pool.instanceColor.needsUpdate = true
  }, [balls, dummy])
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pointAt = (event: PointerEvent) => {
      const bounds = gl.domElement.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
    }
    const pushInk = (x: number, y: number, z: number, age: number) => {
      for (let index = 0; index < inkTrail.length - 1; index++) inkTrail[index].copy(inkTrail[index + 1])
      inkTrail[inkTrail.length - 1].set(x, y, z, age)
    }
    const drawAt = (event: PointerEvent) => {
      if (!heldBall.current?.visible) return false
      pointAt(event)
      const hit = raycaster.intersectObject(heldBall.current, false)[0]
      if (!hit) return false
      heldBall.current.worldToLocal(inkPoint.copy(hit.point)).normalize()
      if (lastInkPoint.current && lastInkPoint.current.distanceTo(inkPoint) < 0.012) return true
      if (!lastInkPoint.current) pushInk(0, 0, 0, -1)
      pushInk(inkPoint.x, inkPoint.y, inkPoint.z, 0)
      if (!lastInkPoint.current) lastInkPoint.current = new THREE.Vector3()
      lastInkPoint.current.copy(inkPoint)
      return true
    }
    const pick = (event: PointerEvent) => {
      if (event.button !== 0 || journey.get() < WINDOW_SCENES.ballPool.start || !mesh.current) return
      if (event.target instanceof Element && event.target.closest('a, button, input, textarea, .site-header, .reading-controls, footer')) return
      pointAt(event)
      if (selected.current >= 0 && heldBall.current?.visible && raycaster.intersectObject(heldBall.current, false).length > 0) {
        drawAt(event)
        return
      }
      const hit = raycaster.intersectObject(mesh.current, false)[0]
      if (hit?.instanceId === undefined) {
        returning.current = true
        pendingSelection.current = -1
        return
      }
      if (selected.current >= 0) {
        returning.current = true
        pendingSelection.current = hit.instanceId
        return
      }
      selected.current = hit.instanceId
      returning.current = false
      lift.current = 0
      lastInkPoint.current = null
      inkTrail.forEach((point) => point.w = -1)
    }
    const move = (event: PointerEvent) => {
      if (selected.current < 0 || returning.current || journey.get() < WINDOW_SCENES.ballPool.start) return
      if (event.target instanceof Element && event.target.closest('a, button, input, textarea, .site-header, .reading-controls, footer')) return
      if (!drawAt(event)) lastInkPoint.current = null
    }
    window.addEventListener('pointerdown', pick)
    window.addEventListener('pointermove', move)
    const release = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        returning.current = true
        pendingSelection.current = -1
      }
    }
    window.addEventListener('keydown', release)
    return () => {
      window.removeEventListener('pointerdown', pick)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('keydown', release)
    }
  }, [camera, gl, journey, inkPoint, inkTrail])
  useFrame((state, delta) => {
    const pool = mesh.current
    if (!pool) return
    const reveal = THREE.MathUtils.smoothstep(journey.get(), WINDOW_SCENES.closingApproach.start, WINDOW_SCENES.closingTilt.end)
    pool.visible = journey.get() >= WINDOW_SCENES.closingApproach.start
    if (violetLight.current) violetLight.current.intensity = 2.5 * reveal
    if (blueLight.current) blueLight.current.intensity = 1.6 * reveal
    if (!pool.visible) {
      if (heldBall.current) heldBall.current.visible = false
      return
    }
    for (const point of inkTrail) if (point.w >= 0 && point.w < 1) point.w = Math.min(1, point.w + Math.min(delta, 0.05) / 4.5)
    lift.current = THREE.MathUtils.damp(lift.current, selected.current < 0 || returning.current ? 0 : 1, returning.current ? 5 : 3.8, Math.min(delta, 0.05))
    if (returning.current && lift.current < 0.008) {
      selected.current = pendingSelection.current
      pendingSelection.current = -1
      returning.current = false
      lift.current = 0
      lastInkPoint.current = null
      inkTrail.forEach((point) => point.w = -1)
    }
    for (let index = 0; index < balls.positions.length; index++) {
      dummy.position.copy(balls.positions[index])
      dummy.position.y += Math.sin(state.clock.elapsedTime * 0.65 + index * 0.41) * 0.005
      if (selected.current >= 0 && selected.current !== index) {
        const distance = balls.positions[index].distanceTo(balls.positions[selected.current])
        dummy.position.y -= Math.exp(-distance * distance / 0.08) * Math.sin(lift.current * Math.PI) * 0.025
      }
      const isPicked = selected.current === index
      if (isPicked && heldBall.current) {
        heldBall.current.visible = true
        heldBall.current.position.copy(dummy.position).lerp(liftedPosition, lift.current)
        heldBall.current.position.y += Math.sin(lift.current * Math.PI) * 0.075
        const radius = 0.102 * (1 + lift.current * 1.25)
        const stretch = Math.sin(lift.current * Math.PI) * 0.045
        heldBall.current.scale.set(radius * (1 - stretch * 0.5), radius * (1 + stretch), radius * (1 - stretch * 0.5))
        drawnMaterial.color.copy(balls.colors[index])
      }
      dummy.scale.setScalar(isPicked ? 0.0001 : 0.102)
      dummy.updateMatrix()
      pool.setMatrixAt(index, dummy.matrix)
    }
    if (selected.current < 0 && heldBall.current) heldBall.current.visible = false
    pool.instanceMatrix.needsUpdate = true
  })
  return <group>
    <pointLight ref={violetLight} position={[0, -0.75, 0.2]} color="#e9d7ff" intensity={0} distance={3.6} decay={2} />
    <pointLight ref={blueLight} position={[-0.45, -1.5, -0.25]} color="#a3c9e6" intensity={0} distance={2.8} decay={2} />
    <instancedMesh ref={mesh} args={[undefined, undefined, balls.positions.length]} frustumCulled={false} castShadow visible={false}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshPhysicalMaterial color="#ffffff" roughness={0.2} metalness={0.08} clearcoat={1} clearcoatRoughness={0.1}
        iridescence={1} iridescenceIOR={1.3} iridescenceThicknessRange={[100, 400]} />
    </instancedMesh>
    <mesh ref={heldBall} material={drawnMaterial} visible={false} castShadow>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  </group>
}

function World({ stage, journey, approach, pulse, visible, onSandTouch }: SceneProps & { visible: boolean }) {
  const { camera, size } = useThree()
  const root = useRef<THREE.Group>(null)
  const previousPosition = useMemo(() => new THREE.Vector3(), [])
  const previousRotation = useMemo(() => new THREE.Quaternion(), [])
  const targetRotation = useMemo(() => new THREE.Quaternion(), [])
  const cameraReady = useRef(false)
  useEffect(() => { cameraReady.current = false }, [size.width, size.height])
  useFrame((_, delta) => {
    previousPosition.copy(camera.position)
    previousRotation.copy(camera.quaternion)
    const progress = journey.get()
    if (progress < WINDOW_SCENES.openingShrink.start) {
      const shot = openingSequence(approach.get())
      // The camera dollies on a straight Z path while its pitch reveals the stars, then the well.
      camera.position.set(shot.cameraX, shot.cameraY, shot.cameraZ)
      camera.rotation.set(shot.cameraPitch, 0, 0)
    } else {
      const wellOffset = size.width < 760 ? 0 : 2.05
      const partition = spatialPartitionAt(progress, size.width, size.height)
      const apertureCenter = (partition.left + partition.width / 2) / size.width
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 37
      const fieldWidthAt = (distance: number) => 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * size.width / size.height
      const frontY = OPENING_CAMERA.height
      const frontZ = OPENING_CAMERA.endZ
      const frontTargetY = -0.3
      const frontX = wellOffset - (apertureCenter - 0.5) * fieldWidthAt(Math.hypot(frontY - frontTargetY, frontZ))
      if (progress < WINDOW_SCENES.lookIntoWell.start) {
        // Chapter 01 keeps the luminous well in a frontal view.
        const arrival = openingSequence(approach.get())
        const t = THREE.MathUtils.smoothstep(progress, WINDOW_SCENES.openingShrink.start, WINDOW_SCENES.openingShrink.end)
        camera.position.set(THREE.MathUtils.lerp(arrival.cameraX, frontX, t), THREE.MathUtils.lerp(arrival.cameraY, frontY, t), THREE.MathUtils.lerp(arrival.cameraZ, frontZ, t))
        camera.lookAt(THREE.MathUtils.lerp(0, frontX, t), frontTargetY, 0)
      } else if (progress < WINDOW_SCENES.mosaicReform.start) {
        // Chapter 02 bends toward the well mouth for the sound ritual.
        const mouthY = 4.3 - 0.4 * THREE.MathUtils.smoothstep(progress, 2.15, 2.6)
        const mouthTargetY = -0.85
        const mouthZ = 0.25
        const mouthX = wellOffset - (apertureCenter - 0.5) * fieldWidthAt(mouthY - mouthTargetY)
        const t = THREE.MathUtils.smoothstep(progress, WINDOW_SCENES.lookIntoWell.start, WINDOW_SCENES.lookIntoWell.end)
        camera.position.set(THREE.MathUtils.lerp(frontX, mouthX, t), THREE.MathUtils.lerp(frontY, mouthY, t), THREE.MathUtils.lerp(frontZ, mouthZ, t))
        camera.lookAt(THREE.MathUtils.lerp(frontX, mouthX, t), THREE.MathUtils.lerp(frontTargetY, mouthTargetY, t), 0)
      } else if (progress >= WINDOW_SCENES.closingApproach.start) {
        const from = sceneCamera(WINDOW_SCENES.closingApproach.start)
        const approach = THREE.MathUtils.smoothstep(progress, WINDOW_SCENES.closingApproach.start, WINDOW_SCENES.closingApproach.end)
        const tilt = THREE.MathUtils.smoothstep(progress, WINDOW_SCENES.closingTilt.start, WINDOW_SCENES.closingTilt.end)
        const dive = THREE.MathUtils.smoothstep(progress, WINDOW_SCENES.wellDive.start, WINDOW_SCENES.wellDive.end)
        let y = THREE.MathUtils.lerp(from.position[1], 2.4, approach)
        let z = THREE.MathUtils.lerp(from.position[2], 1.8, approach)
        let targetY = THREE.MathUtils.lerp(from.target[1], -0.25, approach)
        y = THREE.MathUtils.lerp(y, 1.9, tilt)
        z = THREE.MathUtils.lerp(z, 0.1, tilt)
        targetY = THREE.MathUtils.lerp(targetY, -1.4, tilt)
        y = THREE.MathUtils.lerp(y, -0.42, dive)
        z = THREE.MathUtils.lerp(z, 0.04, dive)
        targetY = THREE.MathUtils.lerp(targetY, -2.1, dive)
        camera.position.set(wellOffset, y, z)
        camera.lookAt(wellOffset, targetY, 0)
      } else {
        const shot = sceneCamera(progress)
        const distance = Math.hypot(shot.position[1] - shot.target[1], shot.position[2] - shot.target[2])
        const shotX = wellOffset - (apertureCenter - 0.5) * fieldWidthAt(distance)
        camera.position.set(shotX + shot.position[0], shot.position[1], shot.position[2])
        camera.lookAt(shotX + shot.target[0], shot.target[1], shot.target[2])
      }
    }
    if (cameraReady.current) {
      const response = 1 - Math.exp(-12 * Math.min(delta, 0.05))
      camera.position.lerpVectors(previousPosition, camera.position, response)
      // slerpQuaternions copies its first argument into `this`, so the target
      // must not alias camera.quaternion or the desired rotation is lost.
      targetRotation.copy(camera.quaternion)
      camera.quaternion.slerpQuaternions(previousRotation, targetRotation, response)
    }
    cameraReady.current = true
    if (root.current) {
      root.current.position.x = size.width < 760 ? 0 : 2.05
      root.current.scale.setScalar(size.width < 760 ? 1.1 : 1.35)
    }
  })
  return <>
    <Lighting approach={approach} journey={journey} />
    <WellBloom journey={journey} />
    <group ref={root}>
      <ShootingStars approach={approach} />
      <PixelWell journey={journey} approach={approach} pulse={pulse} onSandTouch={onSandTouch} />
      <WellBallPool journey={journey} />
      {stage === 1 && pulse > 0 && <EchoRings key={'echo-' + pulse} />}
      <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]} paused={!visible || stage !== 1}>
        <RigidBody type="fixed" colliders={false}><CuboidCollider args={[0.69, 0.06, 0.69]} position={[0, -2.08, 0]} /></RigidBody>
        {stage === 1 && pulse > 0 && <RigidBody key={pulse} position={[0, 0.6, 0]} colliders="ball" restitution={0.08} linearDamping={0.3}>
          <mesh castShadow scale={[0.055, 0.045, 0.055]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#776b5b" roughness={0.95} /></mesh>
        </RigidBody>}
      </Physics>
    </group>
  </>
}

export function StoryScene(props: SceneProps) {
  const [visible, setVisible] = useState(!document.hidden)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const sync = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  if (failed) return <div className="still-well" aria-hidden="true"><span>井</span></div>
  return <motion.div className="scene-canvas" style={{ clipPath: props.aperture, opacity: props.sceneOpacity }} aria-hidden="true">
    <Canvas fallback={<div className="still-well"><span>井</span></div>}
      frameloop={visible ? 'always' : 'never'} dpr={[1, 1.5]} shadows
      camera={{ position: [0, OPENING_CAMERA.height, OPENING_CAMERA.startZ], rotation: [OPENING_CAMERA.skyPitch, 0, 0], fov: 37 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88 }}
      onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); setFailed(true) }, { once: true }) }}
    ><World {...props} visible={visible} /></Canvas>
  </motion.div>
}
