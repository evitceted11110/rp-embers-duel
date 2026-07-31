import type { AudioBackend } from './director.js'
import type { AudioBus, AudioCue, MusicLayers } from './audio-frame.js'

type MusicVoice = {
  readonly oscillator: OscillatorNode
  readonly pulseOscillator: OscillatorNode
  readonly gain: GainNode
}

function createMusicVoice(
  context: AudioContext,
  destination: AudioNode,
  frequencyHz: number,
  waveform: OscillatorType,
  pulseHz: number,
): MusicVoice {
  const oscillator = context.createOscillator()
  const pulseOscillator = context.createOscillator()
  const pulseDepth = context.createGain()
  const pulseGain = context.createGain()
  const gain = context.createGain()
  oscillator.type = waveform
  oscillator.frequency.value = frequencyHz
  pulseOscillator.type = 'sine'
  pulseOscillator.frequency.value = pulseHz
  pulseDepth.gain.value = 0.35
  pulseGain.gain.value = 0.65
  gain.gain.value = 0
  pulseOscillator.connect(pulseDepth)
  pulseDepth.connect(pulseGain.gain)
  oscillator.connect(pulseGain)
  pulseGain.connect(gain)
  gain.connect(destination)
  oscillator.start()
  pulseOscillator.start()
  return { oscillator, pulseOscillator, gain }
}

export function createWebAudioBackend(): AudioBackend {
  const context = new AudioContext({ latencyHint: 'interactive' })
  const master = context.createGain()
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -12
  limiter.knee.value = 8
  limiter.ratio.value = 10
  limiter.attack.value = 0.003
  limiter.release.value = 0.18
  master.gain.value = 0.8
  master.connect(limiter)
  limiter.connect(context.destination)

  const buses: Record<AudioBus, GainNode> = {
    music: context.createGain(),
    effects: context.createGain(),
    ui: context.createGain(),
  }
  for (const bus of Object.values(buses)) bus.connect(master)

  // 三個持續聲部共用音樂匯流排，以 gain 淡入淡出；不重播整首、不硬切。
  const musicVoices = {
    base: createMusicVoice(context, buses.music, 55, 'triangle', 2),
    combat: createMusicVoice(context, buses.music, 110, 'sawtooth', 4),
    threat: createMusicVoice(context, buses.music, 220, 'square', 8),
  }

  function ramp(parameter: AudioParam, value: number, seconds = 0.08): void {
    const now = context.currentTime
    parameter.cancelScheduledValues(now)
    parameter.setValueAtTime(parameter.value, now)
    parameter.linearRampToValueAtTime(value, now + seconds)
  }

  return {
    async resume(): Promise<void> {
      if (context.state !== 'running') await context.resume()
    },
    play(cue: AudioCue): void {
      for (const offsetMs of cue.rhythmMs) {
        const start = context.currentTime + offsetMs / 1000
        const end = start + cue.durationMs / 1000
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = cue.waveform
        oscillator.frequency.setValueAtTime(cue.frequencyHz, start)
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, cue.endFrequencyHz), end)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(cue.gain, start + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, end)
        oscillator.connect(gain)
        gain.connect(buses[cue.bus])
        oscillator.start(start)
        oscillator.stop(end + 0.01)
      }
    },
    setMusicLayers(layers: MusicLayers): void {
      ramp(musicVoices.base.gain.gain, layers.base * 0.08, 0.18)
      ramp(musicVoices.combat.gain.gain, layers.combat * 0.045, 0.12)
      ramp(musicVoices.threat.gain.gain, layers.threat * 0.025, 0.06)
    },
    setBusVolume(bus: AudioBus, volume: number): void {
      ramp(buses[bus].gain, volume)
    },
    setMuted(muted: boolean): void {
      ramp(master.gain, muted ? 0 : 0.8, 0.04)
    },
    dispose(): void {
      for (const voice of Object.values(musicVoices)) {
        voice.oscillator.stop()
        voice.pulseOscillator.stop()
      }
      void context.close()
    },
  }
}
