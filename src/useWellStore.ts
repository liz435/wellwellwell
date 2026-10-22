import { create } from 'zustand'
import { openingSceneAt } from './openingSequence'
import type { SandBrush, SandTool } from './sandSimulation'

type WellState = {
  active: string
  cinematicComplete: boolean
  introStarted: boolean
  sceneReady: boolean
  loaderRevealing: boolean
  loaderDismissed: boolean
  openingDark: boolean
  closingDark: boolean
  openingScene: ReturnType<typeof openingSceneAt>
  reading: boolean
  sandBrush: SandBrush
  pulse: number
  waiting: boolean
  called: boolean
  heard: boolean
  muted: boolean
  soundUnavailable: boolean
  setActive: (id: string) => void
  finishCinematic: () => void
  startIntro: () => void
  setSceneReady: (ready: boolean) => void
  dismissLoader: () => void
  setOpeningProgress: (progress: number) => void
  setClosingProgress: (progress: number) => void
  setReading: (reading: boolean) => void
  toggleReading: () => void
  toggleSandBrush: () => void
  setSandTool: (tool: SandTool) => void
  setSandRadius: (radius: number) => void
  beginEcho: () => void
  endEcho: () => void
  callOther: () => void
  hearOther: () => void
  resetEncounter: () => void
  setMuted: (muted: boolean) => void
  setSoundUnavailable: (unavailable: boolean) => void
}

const skipOpening = typeof window !== 'undefined' && (
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || (window.location.hash !== '' && window.location.hash !== '#opening')
)

export const useWellStore = create<WellState>((set) => ({
  active: 'opening',
  cinematicComplete: skipOpening,
  introStarted: false,
  sceneReady: false,
  loaderRevealing: skipOpening,
  loaderDismissed: skipOpening,
  openingDark: true,
  closingDark: false,
  openingScene: openingSceneAt(0),
  reading: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  sandBrush: { enabled: false, tool: 'dig', radius: 0.65 },
  pulse: 0,
  waiting: false,
  called: false,
  heard: false,
  muted: false,
  soundUnavailable: false,
  setActive: (id) => set((state) => state.active === id ? state : { active: id }),
  finishCinematic: () => set((state) => state.cinematicComplete && state.loaderDismissed ? state : { cinematicComplete: true, loaderDismissed: true }),
  startIntro: () => set((state) => state.sceneReady && state.loaderDismissed && !state.introStarted ? { introStarted: true } : state),
  setSceneReady: (ready) => set((state) => state.sceneReady === ready ? state : { sceneReady: ready, loaderRevealing: ready || state.loaderRevealing }),
  dismissLoader: () => set((state) => state.loaderDismissed ? state : { loaderDismissed: true }),
  setOpeningProgress: (progress) => set((state) => {
    const scene = openingSceneAt(progress)
    const dark = true // The full opening now stays in moonlight.
    if (state.openingScene.id === scene.id && state.openingDark === dark) return state
    return { openingScene: scene, openingDark: dark }
  }),
  setClosingProgress: (progress) => set((state) => {
    const dark = progress >= 4.08
    return state.closingDark === dark ? state : { closingDark: dark }
  }),
  setReading: (reading) => set({ reading, ...(reading ? { cinematicComplete: true, loaderDismissed: true } : {}) }),
  toggleReading: () => set((state) => ({ reading: !state.reading, cinematicComplete: true, loaderDismissed: true })),
  toggleSandBrush: () => set((state) => ({ sandBrush: { ...state.sandBrush, enabled: !state.sandBrush.enabled } })),
  setSandTool: (tool) => set((state) => ({ sandBrush: { ...state.sandBrush, tool } })),
  setSandRadius: (radius) => set((state) => ({ sandBrush: { ...state.sandBrush, radius } })),
  beginEcho: () => set((state) => ({ pulse: state.pulse + 1, waiting: true })),
  endEcho: () => set({ waiting: false }),
  callOther: () => set({ called: true, heard: false }),
  hearOther: () => set((state) => state.called ? { heard: true } : state),
  resetEncounter: () => set({ called: false, heard: false }),
  setMuted: (muted) => set({ muted }),
  setSoundUnavailable: (unavailable) => set({ soundUnavailable: unavailable }),
}))

export const selectStage = (state: WellState) => state.active === 'opening' ? -1
  : state.active === 'ritual' ? 1
    : state.active === 'others' || state.active === 'always' ? 2 : 0
