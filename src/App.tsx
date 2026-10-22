import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import { story } from './story'
import { useWellSound } from './useWellSound'
import { OPENING_SCROLL_HEIGHT } from './openingSequence'
import { SCENE_ANCHORS, sceneAtScroll, spatialPartitionAt } from './sceneTimeline'
import { PixelTitleWord } from './PixelTitleWord'
import { useGuidedScroll } from './useGuidedScroll'
import type { SandTool } from './sandSimulation'
import { useWellStore } from './useWellStore'
import { LoadingScreen } from './LoadingScreen'

const StoryScene = lazy(() => import('./Scene').then((module) => ({ default: module.StoryScene })))
const TITLE_GLOW_SCENES = ['tilt', 'glow-one', 'glow-two'] as const
function StillWell() { return <div className="still-well" aria-hidden="true"><span>井</span></div> }
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { useWellStore.getState().finishCinematic() }
  render() { return this.state.failed ? <StillWell /> : this.props.children }
}

export default function App() {
  const active = useWellStore((state) => state.active)
  const cinematic = useWellStore((state) => !state.cinematicComplete && !state.reading)
  const introStarted = useWellStore((state) => state.introStarted)
  const sceneReady = useWellStore((state) => state.sceneReady)
  const loaderDismissed = useWellStore((state) => state.loaderDismissed)
  const openingDark = useWellStore((state) => state.openingDark)
  const closingDark = useWellStore((state) => state.closingDark)
  const openingScene = useWellStore((state) => state.openingScene)
  const reading = useWellStore((state) => state.reading)
  const sandBrush = useWellStore((state) => state.sandBrush)
  const waiting = useWellStore((state) => state.waiting)
  const called = useWellStore((state) => state.called)
  const heard = useWellStore((state) => state.heard)
  useGuidedScroll(reading)
  const timer = useRef<number | undefined>(undefined)
  const introGlyph = useRef<HTMLCanvasElement>(null)
  const openingRef = useRef<HTMLElement>(null)
  const journey = useMotionValue(0)
  const aperture = useMotionValue('inset(0px)')
  const sceneOpacity = useMotionValue(1)
  const paperWashOpacity = useMotionValue(0)
  const frameTop = useMotionValue(0)
  const frameLeft = useMotionValue(0)
  const frameWidth = useMotionValue(0)
  const frameHeight = useMotionValue(0)
  const frameRound = useMotionValue(0)
  const frameOpacity = useMotionValue(0)
  const { scrollYProgress } = useScroll()
  const { scrollYProgress: approach } = useScroll({ target: openingRef, offset: ['start start', 'end end'] })
  const skyCueOpacity = useTransform(approach, [0, 0.16, 0.39], [1, 1, 0])
  const sandCueOpacity = useTransform(approach, [0.65, 0.88], [0, 1])
  const closingIntroOpacity = useTransform(journey, [4.13, 4.2, 4.28, 4.34], [0, 1, 1, 0])
  const closingDistanceOpacity = useTransform(journey, [4.29, 4.35, 4.41, 4.46], [0, 1, 1, 0])
  const closingFinalOpacity = useTransform(journey, [4.42, 4.49, 4.57, 4.64], [0, 1, 1, 0])
  const closingFinalPointerEvents = useTransform(journey, (value) => value >= 4.42 && value < 4.64 ? 'auto' : 'none')
  const ballCueOpacity = useTransform(journey, [5.06, 5.17], [0, 1])
  useMotionValueEvent(approach, 'change', (value) => {
    useWellStore.getState().setOpeningProgress(value)
  })
  useMotionValueEvent(journey, 'change', (value) => useWellStore.getState().setClosingProgress(value))
  const sound = useWellSound()

  useLayoutEffect(() => { document.getElementById('root')?.style.removeProperty('background') }, [])

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('section[id]')
    let bounds: { id: string; top: number; bottom: number }[] = []
    let tops: number[] = []
    let pageHeight = 0
    let frame = 0
    const updateActive = () => {
      frame = 0
      const focus = window.scrollY + window.innerHeight * 0.28
      const progress = sceneAtScroll(window.scrollY, window.innerHeight, pageHeight, tops)
      journey.set(progress)
      const partition = spatialPartitionAt(progress, window.innerWidth, window.innerHeight)
      aperture.set(partition.clipPath)
      sceneOpacity.set(partition.sceneOpacity)
      paperWashOpacity.set(partition.paperMix)
      frameTop.set(partition.top)
      frameLeft.set(partition.left)
      frameWidth.set(partition.width)
      frameHeight.set(partition.height)
      frameRound.set(partition.radius)
      frameOpacity.set(partition.opacity)
      for (const section of bounds) {
        if (section.top <= focus && section.bottom > focus) {
          useWellStore.getState().setActive(section.id)
          break
        }
      }
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(updateActive) }
    const measure = () => {
      bounds = Array.from(sections, (section) => {
        const rect = section.getBoundingClientRect()
        return { id: section.id, top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY }
      })
      tops = SCENE_ANCHORS.map((id) => bounds.find((section) => section.id === id)?.top ?? 0)
      pageHeight = document.documentElement.scrollHeight
      schedule()
    }
    measure()
    const observer = new ResizeObserver(measure)
    sections.forEach((section) => observer.observe(section))
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', measure)
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => useWellStore.getState().setReading(preference.matches)
    preference.addEventListener('change', change)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', measure); preference.removeEventListener('change', change) }
  }, [journey, aperture, sceneOpacity, paperWashOpacity, frameTop, frameLeft, frameWidth, frameHeight, frameRound, frameOpacity])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useLayoutEffect(() => {
    const canvas = introGlyph.current
    if (!canvas) return
    const context = canvas?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    const rim = ['#5f5d59', '#aa9b82', '#d8c4a3', '#eee1c5']
    const center = ['#141923', '#292d35', '#4a4c50', '#817b70']
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const radius = Math.hypot(x - 3.5, y - 3.5)
        if (radius > 3.8) continue
        const noise = (x * 37 + y * 53 + x * y * 19) % 23
        const colors = radius > 2.35 ? rim : center
        context.fillStyle = colors[(noise + x + y) % colors.length]
        context.fillRect(x * 3, y * 3, 3, 3)
      }
    }
  }, [cinematic, loaderDismissed])

  useEffect(() => {
    if (!cinematic) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.scrollTo(0, 0)
    const skip = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useWellStore.getState().finishCinematic()
    }
    window.addEventListener('keydown', skip)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', skip)
    }
  }, [cinematic])

  const echo = () => {
    useWellStore.getState().beginEcho()
    void sound.play()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => useWellStore.getState().endEcho(), 2600)
  }

  return <main className={[reading ? 'reading-mode' : '', cinematic ? 'cinematic-opening' : '', sandBrush.enabled && !reading ? 'sand-editing' : '', openingDark && active === 'opening' && !reading ? 'dark-opening' : '', closingDark && !reading ? 'dark-closing' : ''].join(' ')}>
    <a className="skip-link" href="#seeing" onClick={() => useWellStore.getState().finishCinematic()}>Skip to the essay</a>
    {reading ? <StillWell /> : <SceneBoundary><Suspense fallback={<StillWell />}>
      <StoryScene journey={journey} approach={approach} aperture={aperture} sceneOpacity={sceneOpacity} onSandTouch={sound.playSand} />
    </Suspense></SceneBoundary>}
    {cinematic && <button className={'intro-start' + (!loaderDismissed ? ' is-preloading' : '') + (introStarted ? ' is-started' : '')}
      type="button" disabled={!sceneReady || !loaderDismissed || introStarted} onClick={() => useWellStore.getState().startIntro()}
      aria-label={sceneReady ? 'Start the opening film' : 'Preparing the opening scene'}>
      <span className="intro-start-ring" aria-hidden="true" />
      <span className="intro-start-glyph" aria-hidden="true">井</span>
      <canvas ref={introGlyph} className="intro-start-pixels" width="24" height="24" aria-hidden="true" />
    </button>}
    {!reading && <div className="sand-tools" role="group" aria-label="Sand tools" inert={cinematic}>
      <button type="button" aria-pressed={sandBrush.enabled} onClick={() => useWellStore.getState().toggleSandBrush()}>
        {sandBrush.enabled ? 'Done shaping' : 'Shape sand'}
      </button>
      {sandBrush.enabled && <>
        <div className="sand-tool-options" role="group" aria-label="Brush action">
          {(['dig', 'push', 'smooth'] as SandTool[]).map((tool) => <button key={tool} type="button" aria-pressed={sandBrush.tool === tool}
            onClick={() => useWellStore.getState().setSandTool(tool)}>{tool}</button>)}
        </div>
        <label>Brush size <input type="range" min="0.4" max="1" step="0.05" value={sandBrush.radius}
          onChange={(event) => useWellStore.getState().setSandRadius(Number(event.target.value))} /></label>
        <span>Press and drag near the well. Choose Done to scroll on touchscreens.</span>
      </>}
    </div>}
    {!reading && <motion.div className="scene-paper-wash" style={{ clipPath: aperture, opacity: paperWashOpacity }} aria-hidden="true" />}
    {!reading && <motion.div className="spatial-frame" style={{ top: frameTop, left: frameLeft, width: frameWidth, height: frameHeight, borderRadius: frameRound, opacity: frameOpacity }} aria-hidden="true" />}
    <header className="site-header" inert={cinematic}>
      <a className="wordmark" href="#opening" aria-label="wellwellwell — return to opening"><span aria-hidden="true">井</span></a>
      <nav aria-label="Essay chapters" className="flex items-center gap-4 md:gap-7">
        {story.map((chapter) => <a key={chapter.id} href={'#' + chapter.id} aria-label={`${chapter.number} ${chapter.label}`} aria-current={active === chapter.id ? 'location' : undefined}><span>{chapter.number}</span><span className="nav-label">{chapter.label}</span></a>)}
      </nav>
      <span className="header-note">A WELL.<br />THREE ENCOUNTERS.</span>
    </header>
    <motion.div className="reading-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
    <section ref={openingRef} className="opening" id="opening" aria-labelledby="opening-title" data-scene-name={openingScene.id} style={reading ? undefined : { height: OPENING_SCROLL_HEIGHT }}>
      <div className="opening-frame" inert={cinematic}>
      <motion.p className="opening-sky-cue" style={reading ? undefined : { opacity: skyCueOpacity }}>Look up at the stars, then approach the well <span aria-hidden="true">↓</span></motion.p>
      <motion.div><div className="eyebrow">关于一口井，以及井边的人 / A SPATIAL ESSAY</div></motion.div>
      <h1 id="opening-title">{story.map((chapter, index) => <PixelTitleWord key={chapter.id}
        meaning={['看', '身体与声音', '他者'][index]} detail={['意象与像素', '发声与倾听', '相遇与回应'][index]}
        automatic={!reading && openingScene.id === TITLE_GLOW_SCENES[index]}
        exited={!reading && openingScene.id === 'arrival'} />)}</h1>
      <motion.div>
      <p className="opening-caption">一口像素化的井。<br />三次停顿。一次重新靠近。</p>
      <a href="#seeing" className="begin-link">Follow the words to the well <span aria-hidden="true">↓</span></a>
      {!reading && <motion.p className="sand-cue" style={{ opacity: sandCueOpacity }}>Choose Shape sand, then press and drag near the well.</motion.p>}
      </motion.div>
      <span className="drawing-note">{openingScene.name}</span>
      </div>
    </section>
    {story.map((chapter, index) => <section id={chapter.id} className="essay-section" key={chapter.id} aria-labelledby={chapter.id + '-title'}>
      <div className="essay-column">
        <div className="chapter-meta"><span>{chapter.number} / {chapter.label}</span><span>{chapter.reaction}</span></div>
        <motion.div initial={reading ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: reading ? 0 : 0.55 }}>
          <h2 id={chapter.id + '-title'}>{chapter.title}</h2>
          <p className="path-caption">{chapter.subtitle}</p>
          {chapter.paragraphs.map((paragraph) => <p className="essay-paragraph" key={paragraph}>{paragraph}</p>)}
          {index === 0 && <div className="glyph-study" aria-label="Visual connection between the Chinese character for well and a pixel grid"><span>井</span><span aria-hidden="true">↔</span><div className="pixel-grid" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div><span className="glyph-caption">一个字，一种观看。</span></div>}
          {index === 1 && <div className="ritual-panel">
            <div className={'echo-mark ' + (waiting && !reading ? 'is-sounding' : '')} aria-hidden="true"><i /><i /><i /></div>
            <button className="text-button" onClick={echo} disabled={waiting}>{waiting ? 'Take a moment to listen.' : 'Make a sound at the well'} <span aria-hidden="true">↘</span></button>
            <p role="status">{sound.unavailable ? 'Sound is unavailable, but you can still see the echo.' : waiting ? 'Sound · Wait · Echo' : 'Click to play a synthesized echo, or watch with sound off.'}</p>
            <p className="process-note">A proposal for a sound ritual / This synthesized sound is not a recording of the physical work.</p>
          </div>}
          {index === 2 && <div className="encounter-panel">
            <p className="path-caption">Invite someone beside you to respond.</p>
            <div className="flex flex-wrap gap-3">
              <button className="encounter-button" aria-pressed={called} onClick={() => useWellStore.getState().callOther()}>I’m here.</button>
              <button className="encounter-button" disabled={!called || heard} aria-pressed={heard} onClick={() => useWellStore.getState().hearOther()}>I hear you.</button>
            </div>
            <p role="status">{heard ? 'One voice, one response. Put down the screen and keep talking if you like.' : called ? 'Invite someone beside you to answer.' : 'A two-person exercise on one device. You can also try it alone.'}</p>
            {called && <button className="reset-button" onClick={() => useWellStore.getState().resetEncounter()}>Start the conversation again ↺</button>}
          </div>}
          <blockquote>{chapter.question}</blockquote>
        </motion.div>
      </div>
      <div className="scene-caption" aria-hidden="true">{index === 0 ? '01 / FORM BECOMES A QUESTION' : index === 1 ? '02 / A BODY MAKES A RITUAL' : '03 / SOMEONE ON THE OTHER SIDE'}</div>
    </section>)}
    <section className="closing" id="always" aria-labelledby="closing-title">
      <div className="closing-frame">
        <h2 id="closing-title" className="closing-heading">在井边，也在远方。</h2>
        <div className="closing-subtitles">
          <motion.p className="closing-subtitle" style={reading ? undefined : { opacity: closingIntroOpacity }}>从看见一个物体，到听见一次回响，再到注意另一个人。<br />也许井所留下的，是一个让关系发生的位置。</motion.p>
          <motion.p className="closing-subtitle" style={reading ? undefined : { opacity: closingDistanceOpacity }}>Whether you’re standing at the well itself,<br />or reading these words from somewhere far away.</motion.p>
          <motion.div className="closing-subtitle closing-final" style={reading ? undefined : { opacity: closingFinalOpacity, pointerEvents: closingFinalPointerEvents }}>
            <p>We love you.<br /><em>And we’ll, always.</em></p>
            <span>在井边，也在远方。</span>
            <a className="begin-link" href="#opening">Approach once more <span aria-hidden="true">↑</span></a>
          </motion.div>
        </div>
        <motion.p className="ball-cue" style={reading ? undefined : { opacity: ballCueOpacity }}>Click a ball to lift it. Move across it to draw.<small>Click outside the ball or press Esc to return it.</small></motion.p>
        <span className="closing-scene-note" aria-hidden="true">AT THE WELL / ALWAYS</span>
      </div>
    </section>
    <aside className="reading-controls" aria-label="Reading and sound settings" inert={cinematic}>
      <button onClick={sound.toggleMuted} aria-pressed={sound.muted}>{sound.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
      <button onClick={() => useWellStore.getState().toggleReading()} aria-pressed={reading}>{reading ? 'ENABLE 3D' : 'TEXT ONLY'}</button>
    </aside>
    {!reading && !loaderDismissed && <LoadingScreen />}
  </main>
}
