import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { motion, useScroll, useSpring, useTransform } from 'motion/react'
import { story } from './story'

const StoryScene = lazy(() => import('./Scene').then((module) => ({ default: module.StoryScene })))

function Chapter({ item, index, readingMode }: { item: (typeof story)[number]; index: number; readingMode: boolean }) {
  const sectionRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] })
  const opacity = useTransform(scrollYProgress, [0.12, 0.3, 0.72, 0.9], [0.25, 1, 1, 0.2])
  const y = useTransform(scrollYProgress, [0.12, 0.3, 0.72, 0.9], [28, 0, 0, -18])
  const dark = index === 2
  return <section ref={sectionRef} id={item.id} className={`chapter chapter-${item.id} ${dark ? 'chapter-dark' : ''}`} aria-labelledby={`${item.id}-title`}>
    <div className={`chapter-sticky chapter-layout-${index + 1}`}>
      <div className="chapter-copy">
        <div className="chapter-kicker"><span>{item.number}</span><span className="kicker-line" /><span>{item.label}</span></div>
        <motion.div className="chapter-words" style={readingMode ? undefined : { opacity, y }}>
          <h2 id={`${item.id}-title`}>{item.title}</h2>
          <p>{item.body}</p>
          {index === 1 && <button className="inline-action focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b83b27]" type="button" onClick={() => window.dispatchEvent(new Event('thread:push'))}>
            <span className="action-dot" />Push a word · or drag a letter
          </button>}
          {index === 4 && <button className="restart-button" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Start again <span aria-hidden="true">↗</span>
          </button>}
        </motion.div>
      </div>
      <div className="chapter-side" aria-hidden="true"><span>{item.word}</span><span className="side-index">THREAD / 0{index + 1}</span></div>
    </div>
  </section>
}

function ReadingMode({ onChange, enabled }: { onChange: () => void; enabled: boolean }) {
  return <aside className="reading-panel" aria-label="Reading options">
    <button type="button" onClick={onChange} aria-pressed={enabled} className="reading-toggle">
      <span className="toggle-icon" aria-hidden="true">{enabled ? 'Aa' : '◉'}</span>
      <span>{enabled ? 'Motion on' : 'Read the story'}</span>
    </button>
    <a href="#begin" className="top-link" aria-label="Back to beginning">↑</a>
  </aside>
}

export default function App() {
  const pageRef = useRef<HTMLElement>(null)
  const [activeId, setActiveId] = useState<string>(story[0].id)
  const [readingMode, setReadingMode] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const { scrollYProgress } = useScroll({ target: pageRef, offset: ['start start', 'end end'] })
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 80, damping: 24, mass: 0.35 })
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setReadingMode(preference.matches)
    preference.addEventListener('change', syncPreference)
    return () => preference.removeEventListener('change', syncPreference)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (current) setActiveId(current.target.id)
    }, { threshold: [0.15, 0.35, 0.55, 0.75] })
    story.forEach(({ id }) => {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    })
    return () => observer.disconnect()
  }, [])

  return <main ref={pageRef} className={`site-shell ${readingMode ? 'reading-mode' : ''}`}>
    <Suspense fallback={<div className="scene-fallback" aria-hidden="true"><div className="fallback-orbit" /></div>}>
      <StoryScene progress={smoothProgress} active={activeId === 'weight' && !readingMode} />
    </Suspense>
    <div className="site-grain" aria-hidden="true" />
    <header className="site-header">
      <a className="wordmark" href="#begin" aria-label="Thread home">THREAD<span>®</span></a>
      <nav className="chapter-nav" aria-label="Story chapters">
        {story.map((item) => <a key={item.id} href={`#${item.id}`} className={activeId === item.id ? 'is-active' : ''} aria-current={activeId === item.id ? 'location' : undefined}>
          <span>{item.number}</span><span className="nav-label">{item.label}</span>
        </a>)}
      </nav>
      <div className="edition-label">AN INTERACTIVE STORY<br />ISSUE Nº 01 — 2026</div>
    </header>

    <div className="progress-rail" aria-hidden="true"><motion.span style={{ width: progressWidth }} /></div>

    <section className="intro" aria-labelledby="intro-title">
      <div className="intro-meta"><span>AN EXPERIMENT IN WORDS</span><span>SCROLL TO FOLLOW THE THREAD <b>↓</b></span></div>
      <h1 id="intro-title">Words have<br /><em>weight.</em></h1>
      <p className="intro-description">A story about what we say,<br />what it sets in motion, and what brings us back.</p>
      <a className="intro-scroll" href="#begin"><span className="scroll-line" />BEGIN READING</a>
    </section>

    <div className="story-content">
      {story.map((item, index) => <Chapter key={item.id} item={item} index={index} readingMode={readingMode} />)}
    </div>

    <footer className="site-footer"><span>THREAD® — 2026</span><span>MADE OF WORDS, HELD BY A THREAD</span><a href="#begin">BACK TO THE BEGINNING ↑</a></footer>
    <ReadingMode enabled={readingMode} onChange={() => setReadingMode((value) => !value)} />
    <div className="mobile-hint" aria-hidden="true">SCROLL TO MOVE <span>↓</span></div>
  </main>
}
