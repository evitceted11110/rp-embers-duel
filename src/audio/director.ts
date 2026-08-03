import type { GameState } from '../core/index.js'
import { deriveAudioFrame, type AudioBus, type AudioCue, type MusicLayers } from './audio-frame.js'

export type AudioBackend = {
  resume(): Promise<void>
  play(cue: AudioCue): void
  setMusicLayers(layers: MusicLayers): void
  setBusVolume(bus: AudioBus, volume: number): void
  setMuted(muted: boolean): void
  setTimeScale(timeScale: number): void
  dispose(): void
}

export type AudioDirector = {
  unlock(): Promise<void>
  handleState(previous: GameState, next: GameState): void
  setBusVolume(bus: AudioBus, volume: number): void
  setMuted(muted: boolean): void
  setTimeScale(timeScale: number): void
  dispose(): void
}

export function createAudioDirector(createBackend: () => AudioBackend): AudioDirector {
  let backend: AudioBackend | null = null
  let latestMusic: MusicLayers = { base: 0, combat: 0, threat: 0 }
  let muted = false
  let timeScale = 1
  const volumes: Record<AudioBus, number> = { music: 0.35, effects: 0.7, ui: 0.55 }

  return {
    async unlock(): Promise<void> {
      if (backend === null) {
        backend = createBackend()
        for (const bus of ['music', 'effects', 'ui'] as const) backend.setBusVolume(bus, volumes[bus])
        backend.setMuted(muted)
        backend.setTimeScale(timeScale)
      }
      await backend.resume()
      backend.setMusicLayers(latestMusic)
    },
    handleState(previous: GameState, next: GameState): void {
      const frame = deriveAudioFrame(previous, next)
      latestMusic = frame.music
      if (backend === null) return
      backend.setMusicLayers(frame.music)
      for (const cue of frame.cues) backend.play(cue)
    },
    setBusVolume(bus: AudioBus, volume: number): void {
      const clamped = Math.min(1, Math.max(0, volume))
      volumes[bus] = clamped
      backend?.setBusVolume(bus, clamped)
    },
    setMuted(nextMuted: boolean): void {
      muted = nextMuted
      backend?.setMuted(muted)
    },
    setTimeScale(nextTimeScale: number): void {
      timeScale = Math.min(1, Math.max(0.25, nextTimeScale))
      backend?.setTimeScale(timeScale)
    },
    dispose(): void {
      backend?.dispose()
      backend = null
    },
  }
}
