import { useEffect } from 'react'
import { gsap } from 'gsap'
import { Observer } from 'gsap/Observer'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SCENE_ANCHORS, WINDOW_SCENES } from './sceneTimeline'
import { OPENING_SCENES } from './openingSequence'
import { useWellStore } from './useWellStore'

gsap.registerPlugin(Observer, ScrollToPlugin, ScrollTrigger)

const OPENING_STOPS = Object.values(OPENING_SCENES).map(({ start }) => start)
// Settle just inside each scene so floating-point rounding cannot show the previous label.
const sceneStopProgress = (index: number) => index === 0 ? 0 : OPENING_STOPS[index] + 0.008
const WHEEL_QUIET_MS = 450
const SCENE_HOLD_MS = 280
const TRANSITION_RANGES = [
  WINDOW_SCENES.lookIntoWell,
  { start: WINDOW_SCENES.mosaicDissolve.start, end: WINDOW_SCENES.mosaicReform.end },
  WINDOW_SCENES.closingTransition,
  { start: WINDOW_SCENES.closingApproach.start, end: WINDOW_SCENES.wellDive.end },
]

/** Wheel gestures advance the opening one scene; transitional passages settle at their endpoints. */
export function useGuidedScroll(reading: boolean) {
  useEffect(() => {
    if (reading) return

    const opening = document.getElementById('opening')
    if (!opening) return
    const openingEnd = () => Math.max(0, opening.getBoundingClientRect().top + window.scrollY + opening.offsetHeight - window.innerHeight)
    const sectionAnchors = () => SCENE_ANCHORS.map((id, index) => {
      const section = document.getElementById(id)
      const top = section ? section.getBoundingClientRect().top + window.scrollY : 0
      return index === 0 ? 0 : top - window.innerHeight * 0.28
    })
    const scrollAt = (progress: number) => {
      const anchors = sectionAnchors()
      if (progress < 4) {
        const index = Math.floor(progress)
        return gsap.utils.interpolate(anchors[index], anchors[index + 1], progress - index)
      }
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      return gsap.utils.interpolate(anchors[4], maxScroll, Math.min((progress - 4) / 1.3, 1))
    }

    let tween: gsap.core.Tween | null = null
    const finalSceneIndex = OPENING_STOPS.length
    const exitIndex = finalSceneIndex + 1
    const stopY = (index: number) => index === exitIndex
      ? scrollAt(WINDOW_SCENES.openingShrink.end) + window.innerHeight * 0.08
      : index === finalSceneIndex
        ? scrollAt(WINDOW_SCENES.openingShrink.end)
        : sceneStopProgress(index) * openingEnd()
    let targetIndex = 0
    let guidedTween = false
    let currentDirection = 0
    let inputReady = true
    let lastWheelAt = 0
    let holdUntil = 0
    let rearmTimer: number | undefined
    let exitComplete = false

    const scheduleRearm = () => {
      window.clearTimeout(rearmTimer)
      const now = performance.now()
      rearmTimer = window.setTimeout(() => {
        const current = performance.now()
        if (!guidedTween && current - lastWheelAt >= WHEEL_QUIET_MS && current >= holdUntil) inputReady = true
        else scheduleRearm()
      }, Math.max(80, WHEEL_QUIET_MS - (now - lastWheelAt), holdUntil - now))
    }

    const advance = (direction: number) => {
      if (guidedTween && tween?.isActive()) {
        if (direction === currentDirection) return
        tween.kill()
        targetIndex = gsap.utils.clamp(0, exitIndex, targetIndex + direction)
      } else {
        const nearest = Array.from({ length: exitIndex + 1 }, (_, index) => index).reduce((best, index) =>
          Math.abs(stopY(index) - window.scrollY) < Math.abs(stopY(best) - window.scrollY) ? index : best, 0)
        targetIndex = gsap.utils.clamp(0, exitIndex, nearest + direction)
      }
      if (targetIndex <= finalSceneIndex) exitComplete = false
      guidedTween = true
      currentDirection = direction
      tween = gsap.to(window, {
        scrollTo: { y: stopY(targetIndex), autoKill: true },
        duration: targetIndex === exitIndex ? 0.78 : 0.7,
        ease: 'power2.inOut',
        overwrite: true,
        onComplete: () => {
          guidedTween = false
          holdUntil = performance.now() + SCENE_HOLD_MS
          scheduleRearm()
          if (targetIndex === exitIndex) {
            exitComplete = true
            observer?.disable()
          }
        },
        onInterrupt: () => { guidedTween = false; holdUntil = performance.now() + SCENE_HOLD_MS; scheduleRearm() },
      })
    }

    const requestAdvance = (direction: number) => {
      lastWheelAt = performance.now()
      if (!useWellStore.getState().cinematicComplete) return
      if (!inputReady) {
        if (guidedTween && direction !== currentDirection) advance(direction)
        scheduleRearm()
        return
      }
      inputReady = false
      advance(direction)
      scheduleRearm()
    }

    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const observer = coarsePointer ? null : Observer.create({
      type: 'wheel',
      preventDefault: true,
      tolerance: 12,
      onDown: () => requestAdvance(1),
      onUp: () => requestAdvance(-1),
      onStop: scheduleRearm,
    })
    const updateObserver = () => {
      if (!observer) return
      if (guidedTween && targetIndex === exitIndex) return
      if (window.scrollY < stopY(finalSceneIndex) - 2) exitComplete = false
      if (!exitComplete && window.scrollY <= stopY(finalSceneIndex) + 2) observer.enable()
      else observer.disable()
    }
    updateObserver()
    window.addEventListener('scroll', updateObserver, { passive: true })
    window.addEventListener('resize', updateObserver)

    const followAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null
      if (!link || link.classList.contains('skip-link')) return
      const destination = document.getElementById(link.hash.slice(1))
      if (!destination) return
      event.preventDefault()
      tween?.kill()
      guidedTween = false
      window.history.pushState(null, '', link.hash)
      tween = gsap.to(window, {
        scrollTo: { y: destination, offsetY: destination.id === 'opening' ? 0 : window.innerWidth < 760 ? 86 : 110, autoKill: true },
        duration: 0.8,
        ease: 'power2.inOut',
        overwrite: true,
      })
    }
    document.addEventListener('click', followAnchor)

    const triggers = TRANSITION_RANGES.map(({ start, end }) => ScrollTrigger.create({
      start: () => scrollAt(start),
      end: () => scrollAt(end),
      snap: { snapTo: [0, 1], delay: 0.08, duration: { min: 0.3, max: 0.8 }, ease: 'power2.inOut', inertia: false },
    }))
    if (coarsePointer) {
      triggers.push(ScrollTrigger.create({
        start: 0,
        end: () => openingEnd(),
        snap: { snapTo: [...OPENING_STOPS.map((_, index) => sceneStopProgress(index)), 1], delay: 0.1, duration: { min: 0.35, max: 0.8 }, ease: 'power2.inOut', inertia: false },
      }))
    }
    void document.fonts.ready.then(() => ScrollTrigger.refresh())

    return () => {
      tween?.kill()
      window.clearTimeout(rearmTimer)
      observer?.kill()
      triggers.forEach((trigger) => trigger.kill())
      window.removeEventListener('scroll', updateObserver)
      window.removeEventListener('resize', updateObserver)
      document.removeEventListener('click', followAnchor)
    }
  }, [reading])
}
