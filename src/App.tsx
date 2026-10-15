import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import { story } from './story'
import { useWellSound } from './useWellSound'
import { OPENING_SCROLL_HEIGHT, openingSceneAt } from './openingSequence'
import { SCENE_ANCHORS, sceneAtScroll, spatialPartitionAt } from './sceneTimeline'
import { PixelTitleLink } from './PixelTitleLink'

const StoryScene = lazy(() => import('./Scene').then((module) => ({ default: module.StoryScene })))
function StillWell() { return <div className="still-well" aria-hidden="true"><span>井</span></div> }
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <StillWell /> : this.props.children }
}

export default function App() {
  const [active, setActive] = useState('opening')
  const [openingDark, setOpeningDark] = useState(true)
  const [closingDark, setClosingDark] = useState(false)
  const [openingScene, setOpeningScene] = useState(() => openingSceneAt(0))
  const [reading, setReading] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [pulse, setPulse] = useState(0)
  const [heard, setHeard] = useState(false)
  const [called, setCalled] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const timer = useRef<number | undefined>(undefined)
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
  const openingWordsOpacity = useTransform(approach, [0, 0.26, 0.42], [0, 0, 1])
  const skyCueOpacity = useTransform(approach, [0, 0.16, 0.39], [1, 1, 0])
  const sandCueOpacity = useTransform(approach, [0.65, 0.88], [0, 1])
  const closingIntroOpacity = useTransform(journey, [4.13, 4.2, 4.28, 4.34], [0, 1, 1, 0])
  const closingDistanceOpacity = useTransform(journey, [4.29, 4.35, 4.41, 4.46], [0, 1, 1, 0])
  const closingFinalOpacity = useTransform(journey, [4.42, 4.49, 4.57, 4.64], [0, 1, 1, 0])
  const closingFinalPointerEvents = useTransform(journey, (value) => value >= 4.42 && value < 4.64 ? 'auto' : 'none')
  const ballCueOpacity = useTransform(journey, [5.06, 5.17], [0, 1])
  useMotionValueEvent(approach, 'change', (value) => {
    setOpeningDark(value < 0.9)
    const scene = openingSceneAt(value)
    setOpeningScene((current) => current.id === scene.id ? current : scene)
  })
  useMotionValueEvent(journey, 'change', (value) => setClosingDark(value >= 4.08))
  const sound = useWellSound()
  const stage = active === 'opening' ? -1 : active === 'ritual' ? 1 : active === 'others' || active === 'always' ? 2 : 0

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
          setActive((current) => current === section.id ? current : section.id)
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
    const change = () => setReading(preference.matches)
    preference.addEventListener('change', change)
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', measure); preference.removeEventListener('change', change) }
  }, [reading, journey, aperture, sceneOpacity, paperWashOpacity, frameTop, frameLeft, frameWidth, frameHeight, frameRound, frameOpacity])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const echo = () => {
    setPulse((value) => value + 1)
    setWaiting(true)
    void sound.play()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setWaiting(false), 2600)
  }

  return <main className={[reading ? 'reading-mode' : '', openingDark && active === 'opening' && !reading ? 'dark-opening' : '', closingDark && !reading ? 'dark-closing' : ''].join(' ')}>
    <a className="skip-link" href="#seeing">Skip to the essay</a>
    {reading ? <StillWell /> : <SceneBoundary><Suspense fallback={<StillWell />}>
      <StoryScene journey={journey} approach={approach} stage={stage} pulse={pulse} aperture={aperture} sceneOpacity={sceneOpacity} onSandTouch={sound.playSand} />
    </Suspense></SceneBoundary>}
    {!reading && <motion.div className="scene-paper-wash" style={{ clipPath: aperture, opacity: paperWashOpacity }} aria-hidden="true" />}
    {!reading && <motion.div className="spatial-frame" style={{ top: frameTop, left: frameLeft, width: frameWidth, height: frameHeight, borderRadius: frameRound, opacity: frameOpacity }} aria-hidden="true" />}
    <header className="site-header">
      <a className="wordmark" href="#opening" aria-label="wellwellwell — return to opening"><span aria-hidden="true">井</span></a>
      <nav aria-label="Essay chapters" className="flex items-center gap-4 md:gap-7">
        {story.map((chapter) => <a key={chapter.id} href={'#' + chapter.id} aria-label={`${chapter.number} ${chapter.label}`} aria-current={active === chapter.id ? 'location' : undefined}><span>{chapter.number}</span><span className="nav-label">{chapter.label}</span></a>)}
      </nav>
      <span className="header-note">A WELL.<br />THREE ENCOUNTERS.</span>
    </header>
    <motion.div className="reading-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
    <section ref={openingRef} className="opening" id="opening" aria-labelledby="opening-title" data-scene-name={openingScene.id} style={reading ? undefined : { height: OPENING_SCROLL_HEIGHT }}>
      <div className="opening-frame">
      <motion.p className="opening-sky-cue" style={reading ? undefined : { opacity: skyCueOpacity }}>Look up at the stars, then approach the well <span aria-hidden="true">↓</span></motion.p>
      <motion.div style={reading ? undefined : { opacity: openingWordsOpacity }}><div className="eyebrow">关于一口井，以及井边的人 / A SPATIAL ESSAY</div></motion.div>
      <h1 id="opening-title">{story.map((chapter, index) => <PixelTitleLink key={chapter.id} href={'#' + chapter.id}
        meaning={['看', '身体与声音', '他者'][index]} detail={['意象与像素', '发声与倾听', '相遇与回应'][index]} />)}</h1>
      <motion.div style={reading ? undefined : { opacity: openingWordsOpacity }}>
      <p className="opening-caption">一口像素化的井。<br />三次停顿。一次重新靠近。</p>
      <a href="#seeing" className="begin-link">Follow the words to the well <span aria-hidden="true">↓</span></a>
      {!reading && <motion.p className="sand-cue" style={{ opacity: sandCueOpacity }}>Move over the sand to dig. On touchscreens, press and drag.</motion.p>}
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
              <button className="encounter-button" aria-pressed={called} onClick={() => { setCalled(true); setHeard(false) }}>I’m here.</button>
              <button className="encounter-button" disabled={!called || heard} aria-pressed={heard} onClick={() => setHeard(true)}>I hear you.</button>
            </div>
            <p role="status">{heard ? 'One voice, one response. Put down the screen and keep talking if you like.' : called ? 'Invite someone beside you to answer.' : 'A two-person exercise on one device. You can also try it alone.'}</p>
            {called && <button className="reset-button" onClick={() => { setCalled(false); setHeard(false) }}>Start the conversation again ↺</button>}
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
    <aside className="reading-controls" aria-label="Reading and sound settings">
      <button onClick={sound.toggleMuted} aria-pressed={sound.muted}>{sound.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
      <button onClick={() => setReading((value) => !value)} aria-pressed={reading}>{reading ? 'ENABLE 3D' : 'TEXT ONLY'}</button>
    </aside>
  </main>
}
