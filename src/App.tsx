import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import { story } from './story'
import { useWellSound } from './useWellSound'
import { OPENING_SCROLL_HEIGHT, openingSceneAt } from './openingSequence'
import { SCENE_ANCHORS, sceneAtScroll, spatialPartitionAt } from './sceneTimeline'

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
  useMotionValueEvent(approach, 'change', (value) => {
    setOpeningDark(value < 0.9)
    const scene = openingSceneAt(value)
    setOpeningScene((current) => current.id === scene.id ? current : scene)
  })
  const sound = useWellSound()
  const stage = active === 'opening' ? -1 : active === 'ritual' ? 1 : active === 'others' || active === 'always' ? 2 : 0

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('section[id]')
    const updateActive = () => {
      const focus = window.innerHeight * 0.28
      const tops = SCENE_ANCHORS.map((id) => {
        const section = document.getElementById(id)
        return section ? section.getBoundingClientRect().top + window.scrollY : 0
      })
      const progress = sceneAtScroll(window.scrollY, window.innerHeight, document.documentElement.scrollHeight, tops)
      journey.set(progress)
      const partition = spatialPartitionAt(progress, window.innerWidth, window.innerHeight)
      aperture.set(partition.clipPath)
      frameTop.set(partition.top)
      frameLeft.set(partition.left)
      frameWidth.set(partition.width)
      frameHeight.set(partition.height)
      frameRound.set(partition.radius)
      frameOpacity.set(partition.opacity)
      for (const section of sections) {
        const bounds = section.getBoundingClientRect()
        if (bounds.top <= focus && bounds.bottom > focus) {
          setActive((current) => current === section.id ? current : section.id)
          break
        }
      }
    }
    updateActive()
    window.addEventListener('scroll', updateActive, { passive: true })
    window.addEventListener('resize', updateActive)
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReading(preference.matches)
    preference.addEventListener('change', change)
    return () => { window.removeEventListener('scroll', updateActive); window.removeEventListener('resize', updateActive); preference.removeEventListener('change', change); window.clearTimeout(timer.current) }
  }, [journey, aperture, frameTop, frameLeft, frameWidth, frameHeight, frameRound, frameOpacity])

  const echo = () => {
    setPulse((value) => value + 1)
    setWaiting(true)
    void sound.play()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setWaiting(false), 2600)
  }

  return <main className={[reading ? 'reading-mode' : '', openingDark && active === 'opening' && !reading ? 'dark-opening' : ''].join(' ')}>
    {reading ? <StillWell /> : <SceneBoundary><Suspense fallback={<StillWell />}>
      <StoryScene journey={journey} approach={approach} stage={stage} pulse={pulse} aperture={aperture} />
    </Suspense></SceneBoundary>}
    {!reading && <motion.div className="spatial-frame" style={{ top: frameTop, left: frameLeft, width: frameWidth, height: frameHeight, borderRadius: frameRound, opacity: frameOpacity }} aria-hidden="true" />}
    <header className="site-header">
      <a className="wordmark" href="#opening" aria-label="wellwellwell — return to opening"><span aria-hidden="true">井</span></a>
      <nav aria-label="Essay chapters" className="flex items-center gap-4 md:gap-7">
        {story.map((chapter) => <a key={chapter.id} href={'#' + chapter.id} aria-current={active === chapter.id ? 'location' : undefined}><span>{chapter.number}</span><span className="nav-label">{chapter.label}</span></a>)}
      </nav>
      <span className="header-note">A WELL.<br />THREE ENCOUNTERS.</span>
    </header>
    <motion.div className="reading-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
    <section ref={openingRef} className="opening" id="opening" aria-labelledby="opening-title" data-scene-name={openingScene.id} style={reading ? undefined : { height: OPENING_SCROLL_HEIGHT }}>
      <div className="opening-frame">
      <motion.p className="opening-sky-cue" style={reading ? undefined : { opacity: skyCueOpacity }}>Look up at the stars, then approach the well <span aria-hidden="true">↓</span></motion.p>
      <motion.div style={reading ? undefined : { opacity: openingWordsOpacity }}>
      <div className="eyebrow">关于一口井，以及井边的人 / A SPATIAL ESSAY</div>
      <h1 id="opening-title">{story.map((chapter) => <a key={chapter.id} href={'#' + chapter.id}>{chapter.reaction}<span>{chapter.label}</span></a>)}</h1>
      <p className="opening-caption">一口像素化的井。<br />三次停顿。一次重新靠近。</p>
      <a href="#seeing" className="begin-link">Follow the words to the well <span aria-hidden="true">↓</span></a>
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
      <span className="eyebrow">WELL, WELL, WELL.</span>
      <p className="closing-intro">从看见一个物体，到听见一次回响，再到注意另一个人。<br />也许井所留下的，是一个让关系发生的位置。</p>
      <p className="closing-distance">Whether you’re standing at the well itself,<br />or reading these words from somewhere far away.</p>
      <h2 id="closing-title">We love you.<br /><em>And we’ll, always.</em></h2>
      <p className="closing-footnote">在井边，也在远方。</p>
      <a className="begin-link" href="#opening">Approach once more <span aria-hidden="true">↑</span></a>
    </section>
    <footer><span className="footer-mark" aria-label="wellwellwell">井</span><span>SEE · LISTEN · MEET</span><a href="#opening">BACK TO THE WELL ↑</a></footer>
    <aside className="reading-controls" aria-label="Reading and sound settings">
      <button onClick={sound.toggleMuted} aria-pressed={sound.muted}>{sound.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
      <button onClick={() => setReading((value) => !value)} aria-pressed={reading}>{reading ? 'ENABLE 3D' : 'TEXT ONLY'}</button>
    </aside>
  </main>
}
