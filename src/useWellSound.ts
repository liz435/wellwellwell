import { useCallback, useEffect, useRef, useState } from 'react'

/** Synthesized web interpretation, not an installation recording. */
export function useWellSound() {
  const context = useRef<AudioContext | null>(null)
  const master = useRef<GainNode | null>(null)
  const mutedRef = useRef(false)
  const [muted, setMuted] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const play = useCallback(async () => {
    if (mutedRef.current) return
    try {
      context.current ??= new AudioContext()
      const audio = context.current
      await audio.resume()
      if (audio.state !== 'running' || mutedRef.current) return
      if (!master.current) {
        master.current = audio.createGain()
        master.current.gain.value = 0.16
        master.current.connect(audio.destination)
      }
      const output = master.current
      ;[0, 0.38, 0.82, 1.35].forEach((delay, index) => {
        const oscillator = audio.createOscillator()
        const envelope = audio.createGain()
        const start = audio.currentTime + delay
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(392 - index * 24, start)
        oscillator.frequency.exponentialRampToValueAtTime(130, start + 0.8)
        envelope.gain.setValueAtTime(0.0001, start)
        envelope.gain.exponentialRampToValueAtTime(0.6 / (index + 1), start + 0.02)
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + 1.1)
        oscillator.connect(envelope)
        envelope.connect(output)
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
        oscillator.start(start)
        oscillator.stop(start + 1.15)
      })
      setUnavailable(false)
    } catch { setUnavailable(true) }
  }, [])
  const toggleMuted = () => {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
    if (master.current && context.current) master.current.gain.setTargetAtTime(mutedRef.current ? 0 : 0.16, context.current.currentTime, 0.02)
  }
  useEffect(() => {
    const pause = () => { if (document.hidden) void context.current?.suspend() }
    document.addEventListener('visibilitychange', pause)
    return () => {
      document.removeEventListener('visibilitychange', pause)
      void context.current?.close()
      context.current = null
      master.current = null
    }
  }, [])
  return { play, muted, toggleMuted, unavailable }
}
