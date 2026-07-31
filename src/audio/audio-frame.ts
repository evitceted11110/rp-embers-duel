import audioEventsJson from '../../content/audio-events.json'
import type { GameEvent, GameState, MarkId } from '../core/index.js'

export type AudioBus = 'music' | 'effects' | 'ui'
export type CueWaveform = OscillatorType

export type AudioCue = {
  readonly id: string
  readonly bus: 'effects' | 'ui'
  readonly waveform: CueWaveform
  readonly frequencyHz: number
  readonly endFrequencyHz: number
  readonly durationMs: number
  readonly rhythmMs: readonly number[]
  readonly gain: number
}

export type MusicLayers = {
  readonly base: number
  readonly combat: number
  readonly threat: number
}

export type AudioFrame = {
  readonly cues: readonly AudioCue[]
  readonly music: MusicLayers
}

type RawCue = {
  id: string
  bus: 'effects' | 'ui'
  waveform: CueWaveform
  frequency_hz: number
  end_frequency_hz: number
  duration_ms: number
  rhythm_ms: number[]
  gain: number
}

const cueMap = new Map(
  (audioEventsJson.cues as RawCue[]).map((cue) => [
    cue.id,
    {
      id: cue.id,
      bus: cue.bus,
      waveform: cue.waveform,
      frequencyHz: cue.frequency_hz,
      endFrequencyHz: cue.end_frequency_hz,
      durationMs: cue.duration_ms,
      rhythmMs: cue.rhythm_ms,
      gain: cue.gain,
    } satisfies AudioCue,
  ]),
)

function cue(id: string): AudioCue {
  const definition = cueMap.get(id)
  if (definition === undefined) throw new Error(`content/audio-events.json 缺少 cue：${id}`)
  return definition
}

function markCue(markId: MarkId): string {
  if (markId === 'ember-core') return 'mark-selected-ember'
  if (markId === 'precision-afterimage') return 'mark-selected-shadow'
  return 'mark-selected-guard'
}

function eventCue(event: GameEvent): string {
  switch (event.type) {
    case 'comboHit':
      return `combo-hit-${event.hitIndex}`
    case 'comboWhiff':
      return 'combo-whiff'
    case 'dodgeStart':
      return event.precision ? 'dodge-precision' : 'dodge'
    case 'coreArmed':
      return 'core-armed'
    case 'coreDetonated':
      return 'core-detonated'
    case 'afterimageSpawned':
      return 'afterimage-spawned'
    case 'qCast':
      return 'skill-q'
    case 'eCast':
      return 'skill-e'
    case 'eFailed':
      return 'skill-failed'
    case 'playerHit':
      return 'player-hit'
    case 'playerBlocked':
      return 'player-blocked'
    case 'enemyDefeated':
      return 'enemy-defeated'
    case 'encounterCleared':
      return 'encounter-cleared'
    case 'draftOffered':
      return 'draft-offered'
    case 'markSelected':
      return markCue(event.markId)
    case 'victory':
      return 'victory'
    case 'defeat':
      return 'defeat'
  }
}

function enemyTransitionCues(previous: GameState, next: GameState): AudioCue[] {
  const previousById = new Map(previous.enemies.map((enemy) => [enemy.id, enemy]))
  const cues: AudioCue[] = []
  for (const enemy of next.enemies) {
    const before = previousById.get(enemy.id)
    if (before === undefined) continue
    if (before.attackState !== 'telegraph' && enemy.attackState === 'telegraph') {
      cues.push(cue(enemy.kind === 'ember-thrall' ? 'enemy-telegraph-ember' : 'enemy-telegraph-shade'))
    } else if (before.attackState === 'telegraph' && enemy.attackState === 'cooldown') {
      cues.push(cue(enemy.kind === 'ember-thrall' ? 'enemy-attack-ember' : 'enemy-attack-shade'))
    }
  }
  return cues
}

function musicLayers(state: GameState): MusicLayers {
  if (state.phase === 'victory' || state.phase === 'defeat') return { base: 0, combat: 0, threat: 0 }
  if (state.phase === 'draft') return { base: 0.22, combat: 0, threat: 0 }
  const threatCount = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.attackState === 'telegraph').length
  const combat = state.phase === 'encounter2' ? 0.72 : 0.48
  const lowHealthPressure = state.player.hp <= 66 ? 0.18 : 0
  return { base: 0.35, combat, threat: Math.min(0.85, threatCount * 0.28 + lowHealthPressure) }
}

export function deriveAudioFrame(previous: GameState, next: GameState): AudioFrame {
  return {
    cues: [...enemyTransitionCues(previous, next), ...next.events.map((event) => cue(eventCue(event)))],
    music: musicLayers(next),
  }
}
