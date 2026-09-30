import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Float, Text } from '@react-three/drei'
import { Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useReducedMotion, type MotionValue } from 'motion/react'
import * as THREE from 'three'
import { story } from './story'

type SceneProps = { progress: MotionValue<number>; active: boolean }

const palette = ['#b83b27', '#c4a68b', '#e7e0d3', '#a8aaa1']

function ThreadLine({ progress, reduced }: { progress: MotionValue<number>; reduced: boolean }) {
  const line = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.6, -1.1, -0.5), new THREE.Vector3(-2.8, 0.4, 0),
    new THREE.Vector3(-1.1, -0.6, 0.3), new THREE.Vector3(0.4, 0.75, 0),
    new THREE.Vector3(2.2, -0.35, 0.25), new THREE.Vector3(4.4, 0.95, -0.1),
  ]), 120, 0.012, 5, false), [])

  useFrame(() => {
    if (!line.current) return
    if (reduced) return
    const p = progress.get()
    line.current.rotation.z = Math.sin(p * Math.PI * 2) * 0.08
    const material = line.current.material as THREE.MeshStandardMaterial
    material.color.set(p > 0.43 && p < 0.66 ? '#df7b61' : '#b83b27')
  })

  return <mesh ref={line} geometry={geometry} position={[0, 0, -0.4]}><meshStandardMaterial color="#b83b27" roughness={0.42} /></mesh>
}

function StoryTiles({ progress, active }: SceneProps) {
  const bodies = useRef<(RapierRigidBody | null)[]>([])
  const activeBody = useRef<number | null>(null)
  const activePointerId = useRef<number | null>(null)
  const dragPoint = useRef(new THREE.Vector3())
  const [dragging, setDragging] = useState<number | null>(null)
  const { camera, gl } = useThree()
  const word = story[1].word

  useEffect(() => {
    const release = () => {
      if (activeBody.current !== null) {
        const body = bodies.current[activeBody.current]
        body?.setBodyType(0, true)
        body?.wakeUp()
        if (activePointerId.current !== null && gl.domElement.hasPointerCapture(activePointerId.current)) {
          gl.domElement.releasePointerCapture(activePointerId.current)
        }
        activePointerId.current = null
        setDragging(null)
        activeBody.current = null
      }
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [])

  useEffect(() => {
    const pushWords = () => {
      if (!active) return
      bodies.current.forEach((body, index) => {
        body?.applyImpulse({ x: (index - 2.5) * 0.035, y: 0.22 + (index % 2) * 0.08, z: 0 }, true)
      })
    }
    window.addEventListener('thread:push', pushWords)
    return () => window.removeEventListener('thread:push', pushWords)
  }, [active])

  useFrame(() => {
    const p = progress.get()
    if (activeBody.current !== null) {
      const body = bodies.current[activeBody.current]
      if (body) body.setNextKinematicTranslation(dragPoint.current)
    }
    bodies.current.forEach((body, i) => {
      if (!body || activeBody.current === i) return
      const shouldDrop = active && p > 0.19 && p < 0.42
      const current = body.translation()
      if (shouldDrop && current.y > -0.48) body.setLinvel({ x: (i - 1) * 0.12, y: -0.8 - i * 0.14, z: 0 }, true)
      if (!shouldDrop && Math.abs(current.y + (i - 1) * 0.52) > 0.65) {
        body.setTranslation({ x: (i - 1) * 0.95, y: (i - 1) * 0.52, z: 0.15 }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
    })
  })

  const onDown = (index: number) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (!active) return
    const body = bodies.current[index]
    if (!body) return
    body.setBodyType( kinematicType, true)
    activeBody.current = index
    activePointerId.current = event.pointerId
    gl.domElement.setPointerCapture(event.pointerId)
    dragPoint.current.copy(body.translation())
    dragPoint.current.z = 0.15
    setDragging(index)
    gl.domElement.style.cursor = 'grabbing'
    updateDrag(event)
    const push = new THREE.Vector3()
    camera.getWorldDirection(push)
  }

  const updateDrag = (event: ThreeEvent<PointerEvent>) => {
    if (activeBody.current === null) return
    const point = event.point.clone()
    point.z = 0.15
    dragPoint.current.lerp(point, 0.55)
  }

  return <group>
    {word.split('').map((letter, i) => <RigidBody
      key={`${letter}-${i}`}
      ref={(body) => { bodies.current[i] = body }}
      type="dynamic"
      colliders="cuboid"
      position={[(i - (word.length - 1) / 2) * 0.62, (i % 2) * 0.06, 0.15]}
      gravityScale={active && progress.get() > 0.19 && progress.get() < 0.42 ? 1 : 0}
      linearDamping={2.1}
      angularDamping={4}
      restitution={0.28}
      friction={0.72}
    >
      <group onPointerDown={onDown(i)} onPointerMove={updateDrag}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.56, 0.58, 0.22]} />
          <meshStandardMaterial color={palette[i % palette.length]} roughness={0.35} metalness={0.04} />
        </mesh>
        <Text position={[0, 0, 0.119]} fontSize={0.27} color="#f3f0e8" anchorX="center" anchorY="middle" fontWeight={700}>{letter}</Text>
      </group>
    </RigidBody>)}
    <mesh position={[0, -1.3, 0]} receiveShadow>
      <boxGeometry args={[8, 0.12, 1.4]} />
      <meshStandardMaterial color="#d8d1c4" roughness={0.8} />
    </mesh>
    <Text position={[0, -2.08, 0.1]} fontSize={0.11} color="#6e6a62" anchorX="center" anchorY="middle">{dragging === null ? 'DRAG A LETTER · LET IT GO' : 'LET IT GO'}</Text>
  </group>
}

const kinematicType = 2

function CameraRig({ progress, reduced }: { progress: MotionValue<number>; reduced: boolean }) {
  const { camera, scene } = useThree()
  useFrame(({ pointer }) => {
    const p = progress.get()
    const tone = !reduced && p > 0.43 && p < 0.66 ? '#171918' : '#f3f0e8'
    if (scene.background instanceof THREE.Color) scene.background.set(tone)
    if (scene.fog instanceof THREE.Fog) scene.fog.color.set(tone)
    const targetX = (reduced ? 0 : Math.sin(p * Math.PI * 2) * 0.36) + (reduced ? 0 : pointer.x * 0.12)
    const targetY = (!reduced && p > 0.43 && p < 0.66 ? 0.14 : 0) + (reduced ? 0 : pointer.y * 0.08)
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 2, 1 / 60)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 2, 1 / 60)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, !reduced && p > 0.43 && p < 0.66 ? 8.8 : 8.2, 1.2, 1 / 60)
    camera.lookAt(0, 0, 0)
  })
  return null
}

function Sculpture({ progress, reduced }: { progress: MotionValue<number>; reduced: boolean }) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!group.current) return
    if (reduced) return
    const p = progress.get()
    group.current.rotation.y += delta * 0.12
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, Math.sin(p * Math.PI * 2) * 0.16, 2, delta)
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, p > 0.43 && p < 0.66 ? 0.1 : -0.06, 2, delta)
    group.current.scale.setScalar(p < 0.16 ? 0.76 : p > 0.78 ? 0.83 : 1)
  })
  return <group ref={group} position={[2.15, 0.05, -0.5]}>
    <Float speed={reduced ? 0 : 0.8} rotationIntensity={reduced ? 0 : 0.12} floatIntensity={reduced ? 0 : 0.18}>
      <mesh castShadow>
        <torusKnotGeometry args={[0.8, 0.17, 120, 16, 2, 3]} />
        <meshStandardMaterial color="#b83b27" roughness={0.38} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0, 0.42]}>
        <icosahedronGeometry args={[0.3, 1]} />
        <meshStandardMaterial color="#e2d9ca" roughness={0.3} metalness={0.1} />
      </mesh>
    </Float>
  </group>
}

function SceneContent({ progress, active, reduced }: SceneProps & { reduced: boolean }) {
  return <>
    <color attach="background" args={['#f3f0e8']} />
    <fog attach="fog" args={['#f3f0e8', 10, 22]} />
    <ambientLight intensity={0.72} />
    <directionalLight position={[-4, 5, 7]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
    <pointLight position={[3, -1, 4]} color="#edb6a5" intensity={1.4} />
    <CameraRig progress={progress} reduced={reduced} />
    <ThreadLine progress={progress} reduced={reduced} />
    <Sculpture progress={progress} reduced={reduced} />
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={!active}>
      <StoryTiles progress={progress} active={active} />
    </Physics>
    <ContactShadows position={[0, -1.22, 0]} opacity={0.2} scale={8} blur={2.5} far={4} />
  </>
}

export function StoryScene({ progress, active }: SceneProps) {
  const prefersReducedMotion = useReducedMotion()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const probe = document.createElement('canvas')
    const context = probe.getContext('webgl2') ?? probe.getContext('webgl')
    if (!context) setFailed(true)
    else context.getExtension('WEBGL_lose_context')?.loseContext()
  }, [])
  if (failed) return <div className="scene-fallback" aria-hidden="true"><div className="fallback-orbit" /></div>
  return <div className="scene-canvas" aria-hidden="true">
    <Canvas
      dpr={[1, 1.5]}
      shadows
      camera={{ position: [0, 0, 8.2], fov: 34 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); setFailed(true) }) }}
      onPointerOver={() => {}}
    >
      <Suspense fallback={null}><SceneContent progress={progress} active={active} reduced={Boolean(prefersReducedMotion)} /></Suspense>
    </Canvas>
  </div>
}
