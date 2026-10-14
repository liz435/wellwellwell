import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { Sky } from 'three/addons/objects/Sky.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { motion, type MotionValue } from 'motion/react'
import * as THREE from 'three'
import { disposeStone, groundedCourseY, groundWithOpening, roundStoneBlock, stoneMaterial } from './sceneMaterials'
import { DESERT, duneGeometry } from './desertTerrain'
import { OPENING_CAMERA, OPENING_LIGHT, openingSequence } from './openingSequence'
import { sceneCamera } from './sceneTimeline'

type SceneProps = { journey: MotionValue<number>; approach: MotionValue<number>; aperture: MotionValue<string>; stage: number; pulse: number }

function WellBloom() {
  const { gl, scene, camera, size } = useThree()
  const composer = useRef<EffectComposer | null>(null)
  useEffect(() => {
    const effects = new EffectComposer(gl)
    const render = new RenderPass(scene, camera)
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.85, 0.75)
    const output = new OutputPass()
    effects.addPass(render)
    effects.addPass(bloom)
    effects.addPass(output)
    effects.setPixelRatio(Math.min(gl.getPixelRatio(), 1.25))
    composer.current = effects
    return () => { composer.current = null; render.dispose(); bloom.dispose(); output.dispose(); effects.dispose() }
  }, [gl, scene, camera])
  useEffect(() => { composer.current?.setSize(size.width, size.height) }, [size.width, size.height])
  useFrame((_, delta) => {
    if (composer.current) composer.current.render(Math.min(delta, 0.05))
    else gl.render(scene, camera)
  }, 1)
  return null
}

function Stars({ approach, journey }: Pick<SceneProps, 'approach' | 'journey'>) {
  const material = useRef<THREE.PointsMaterial>(null)
  const positions = useMemo(() => {
    const data = new Float32Array(1400 * 3)
    let seed = 7283
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let index = 0; index < 1400; index++) {
      const angle = random() * Math.PI * 2
      const elevation = 0.03 + random() * 0.97
      const radius = Math.sqrt(1 - elevation * elevation) * 230
      data[index * 3] = Math.cos(angle) * radius
      data[index * 3 + 1] = elevation * 230
      data[index * 3 + 2] = Math.sin(angle) * radius
    }
    return data
  }, [])
  useFrame(() => {
    const light = openingSequence(approach.get()).daylight
    if (material.current) material.current.opacity = 0.7 * (1 - THREE.MathUtils.smoothstep(light, 0.1, OPENING_LIGHT.arrival)) * (1 - THREE.MathUtils.smoothstep(journey.get(), 0.85, 1.3))
  })
  return <points frustumCulled={false}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial ref={material} color="#d7d0ea" size={1.7} sizeAttenuation={false} transparent opacity={0.7} depthWrite={false} fog={false} />
  </points>
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
    const light = THREE.MathUtils.lerp(openingLight, 1, THREE.MathUtils.smoothstep(journey.get(), 1, 1.8))
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
    if (group.current) group.current.visible = journey.get() > 1.25
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

function Visitor({ side, journey }: { side: number; journey: MotionValue<number> }) {
  const ref = useRef<THREE.Group>(null)
  const cloth = side === 1 ? '#434e47' : '#a4947c'
  useFrame((_, delta) => {
    if (!ref.current) return
    const progress = journey.get()
    const presence = THREE.MathUtils.smoothstep(progress, 2.8, 3.25) * (1 - THREE.MathUtils.smoothstep(progress, 3.9, 4.45))
    ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, Math.max(0.001, presence), 3, Math.min(delta, 0.05)))
  })
  return <group ref={ref} scale={0.001} position={[side * 1.55, DESERT.baseHeight - 0.025, 0]} rotation={[0, side === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}>
    <group rotation={[0.15, 0, 0]} position={[0, 0.85, 0]}>
      <mesh position={[0, 0.69, 0.035]} scale={[0.87, 1.13, 0.9]} castShadow><sphereGeometry args={[0.12, 24, 16]} /><meshStandardMaterial color="#bfa58b" roughness={0.92} /></mesh>
      <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.045, 0.055, 0.14, 12]} /><meshStandardMaterial color="#bfa58b" roughness={0.9} /></mesh>
      <mesh position={[0, 0.25, 0]} scale={[1, 1, 0.63]} castShadow><capsuleGeometry args={[0.17, 0.26, 8, 20]} /><meshStandardMaterial color={cloth} roughness={1} /></mesh>
      {[-1, 1].map((arm) => <group key={arm} position={[arm * 0.19, 0.38, 0]} rotation={[0.7, 0, arm * 0.12]}>
        <mesh position={[0, -0.15, 0]} castShadow><capsuleGeometry args={[0.052, 0.22, 6, 12]} /><meshStandardMaterial color={cloth} roughness={1} /></mesh>
        <group position={[0, -0.3, 0]} rotation={[-1.15, 0, 0]}>
          <mesh position={[0, -0.12, 0]} castShadow><capsuleGeometry args={[0.04, 0.19, 6, 12]} /><meshStandardMaterial color={cloth} roughness={1} /></mesh>
          <mesh position={[0, -0.27, 0]} scale={[0.8, 1.2, 0.5]} castShadow><sphereGeometry args={[0.05, 12, 8]} /><meshStandardMaterial color="#bfa58b" roughness={1} /></mesh>
        </group>
      </group>)}
    </group>
    {[-1, 1].map((leg) => <group key={leg} position={[leg * 0.1, 0, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow><capsuleGeometry args={[0.07, 0.68, 8, 14]} /><meshStandardMaterial color="#373b36" roughness={1} /></mesh>
      <mesh position={[0, 0.065, 0.06]} castShadow><boxGeometry args={[0.14, 0.1, 0.26]} /><meshStandardMaterial color="#34342f" roughness={0.86} /></mesh>
    </group>)}
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

function PixelWell({ journey, approach, pulse }: Pick<SceneProps, 'journey' | 'approach' | 'pulse'>) {
  const blocks = useRef<THREE.InstancedMesh>(null)
  const glowLight = useRef<THREE.PointLight>(null)
  const softenedGlow = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const materials = useMemo(() => {
    const stone = stoneMaterial('#ab9774')
    // Preserve mineral variation while luminous, instead of washing it out to white.
    stone.emissiveMap = stone.map
    stone.emissive.set('#c99ca7')
    return {
      stone,
      ground: stoneMaterial('#c8ae7f', 0.5, 0.032, true),
      lining: stoneMaterial('#6e6148', 2, 0.032),
    }
  }, [])
  const geometry = useMemo(roundStoneBlock, [])
  const groundGeometry = useMemo(() => new THREE.ShapeGeometry(groundWithOpening(80, 0.75)), [])
  const dunes = useMemo(duneGeometry, [])
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
    }
  }, [positions, materials, geometry, groundGeometry, dunes, dummy])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const opening = openingSequence(approach.get())
    const targetGlow = opening.glow * (1 - THREE.MathUtils.smoothstep(journey.get(), 0.9, 1.05))
    softenedGlow.current = THREE.MathUtils.damp(softenedGlow.current, targetGlow, targetGlow > softenedGlow.current ? 5 : 2.8, delta)
    if (softenedGlow.current < 0.0001) softenedGlow.current = 0
    const glow = softenedGlow.current
    materials.stone.emissiveIntensity = glow * 2.6
    if (glowLight.current) {
      glowLight.current.intensity = glow * 1.5
    }
  })

  return <group>
    <pointLight ref={glowLight} position={[0, -0.3, 0]} color="#db9aa7" intensity={0} distance={5} decay={2} />
    <instancedMesh ref={blocks} args={[geometry, materials.stone, positions.length]} castShadow receiveShadow frustumCulled={false} />
    <GlyphProjection journey={journey} />
    <group>
    <mesh geometry={groundGeometry} material={materials.ground} position={[0, DESERT.baseHeight - 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
    <mesh geometry={dunes} material={materials.ground} receiveShadow />
    </group>
    <group>
      <mesh position={[0, -1.68, 0]} receiveShadow><cylinderGeometry args={[0.755, 0.755, 1.1, 64, 1, true]} /><meshStandardMaterial {...{ map: materials.lining.map, bumpMap: materials.lining.bumpMap }} color="#6e6148" roughness={0.94} side={THREE.BackSide} /></mesh>
      <Water pulse={pulse} journey={journey} />
    </group>
    {[-1, 1].map((side) => <Visitor key={side} side={side} journey={journey} />)}
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

function World({ stage, journey, approach, pulse, visible }: SceneProps & { visible: boolean }) {
  const { camera, size } = useThree()
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    if (journey.get() < 1) {
      const shot = openingSequence(approach.get())
      // The camera dollies on a straight Z path while its pitch reveals the stars, then the well.
      camera.position.set(shot.cameraX, shot.cameraY, shot.cameraZ)
      camera.rotation.set(shot.cameraPitch, 0, 0)
    } else {
      const shot = sceneCamera(journey.get())
      const wellOffset = size.width < 760 ? 0 : 2.05
      const focus = THREE.MathUtils.smoothstep(journey.get(), 1, 2) * (1 - 0.35 * THREE.MathUtils.smoothstep(journey.get(), 2.9, 4))
      camera.position.set(shot.position[0] + wellOffset * focus, shot.position[1], shot.position[2])
      camera.lookAt(shot.target[0] + wellOffset * focus, shot.target[1], shot.target[2])
    }
    if (root.current) {
      root.current.position.x = size.width < 760 ? 0 : 2.05
      root.current.scale.setScalar(size.width < 760 ? 1.1 : 1.35)
    }
  })
  return <>
    <Lighting approach={approach} journey={journey} />
    <WellBloom />
    <group ref={root}>
      <PixelWell journey={journey} approach={approach} pulse={pulse} />
      {stage === 1 && pulse > 0 && <EchoRings key={'echo-' + pulse} />}
      <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]} paused={!visible || stage !== 1}>
        <RigidBody type="fixed" colliders={false}><CuboidCollider args={[0.69, 0.06, 0.69]} position={[0, -2.08, 0]} /></RigidBody>
        {stage === 1 && pulse > 0 && <RigidBody key={pulse} position={[0, 1.3, 0]} colliders="cuboid" restitution={0.08} linearDamping={0.3}>
          <mesh castShadow><boxGeometry args={[0.1, 0.1, 0.1]} /><meshStandardMaterial color="#c6bfa8" roughness={0.9} /></mesh>
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
  return <motion.div className="scene-canvas" style={{ clipPath: props.aperture }} aria-hidden="true">
    <Canvas fallback={<div className="still-well"><span>井</span></div>}
      frameloop={visible ? 'always' : 'never'} dpr={[1, 1.5]} shadows
      camera={{ position: [0, OPENING_CAMERA.height, OPENING_CAMERA.startZ], rotation: [OPENING_CAMERA.skyPitch, 0, 0], fov: 37 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88 }}
      onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); setFailed(true) }, { once: true }) }}
    ><World {...props} visible={visible} /></Canvas>
  </motion.div>
}
