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
  const playSand = useCallback(async () => {
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
      const duration = 0.18
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate)
      const samples = buffer.getChannelData(0)
      for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length)
      const source = audio.createBufferSource()
      const filter = audio.createBiquadFilter()
      const envelope = audio.createGain()
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 850
      const start = audio.currentTime
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(0.34, start + 0.012)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      source.connect(filter)
      filter.connect(envelope)
      envelope.connect(master.current)
      source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect() }
      source.start(start)
      source.stop(start + duration)
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
  return { play, playSand, muted, toggleMuted, unavailable }
}
