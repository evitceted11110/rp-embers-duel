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

type ClassEventMap = {
  effects: Record<string, string>
  resonances: Record<string, string>
  rejection_reasons: Record<string, string>
}

const classEventMap = audioEventsJson.class_event_map as ClassEventMap

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
  return `mark-selected-${markId}`
}

/**
 * 職業事件只由 content 的封閉表定義；漏卡與未知共鳴應在測試／開發時立即拋出，
 * 不能靜默退回通用技能聲而讓 build 的因果消失。
 */
function classCue(kind: keyof Pick<ClassEventMap, 'effects' | 'resonances'>, classId: string, identity: string): string {
  const cueId = classEventMap[kind][`${classId}/${identity}`]
  if (cueId === undefined) throw new Error(`content/audio-events.json 缺少職業 ${kind} 音訊：${classId}/${identity}`)
  return cueId
}

function resonanceRejectedCue(reason: string): string {
  const cueId = classEventMap.rejection_reasons[reason]
  if (cueId === undefined) throw new Error(`content/audio-events.json 缺少共鳴拒絕音訊：${reason}`)
  return cueId
}

function eventCue(event: GameEvent, state: GameState): string {
  switch (event.type) {
    case 'comboHit':
      if (event.hitIndex === 3 && state.selectedMarks.includes('cracking-flame-combo')) return 'mark-action-cracking-flame'
      if (event.hitIndex === 1 && state.selectedMarks.includes('pursuit-strike')) return 'mark-action-pursuit'
      if (event.hitIndex === 1 && state.selectedMarks.includes('bulwark-chain')) return 'mark-action-bulwark'
      return `combo-hit-${event.hitIndex}`
    case 'comboWhiff':
      return 'combo-whiff'
    case 'dodgeStart':
      if (event.precision && state.selectedMarks.includes('phantom-reset')) return 'mark-action-phantom-reset'
      return event.precision ? 'dodge-precision' : 'dodge'
    case 'coreArmed':
      return 'core-armed'
    case 'coreDetonated':
      return 'core-detonated'
    case 'afterimageSpawned':
      return 'afterimage-spawned'
    case 'qCast':
      if (state.selectedMarks.includes('mirror-plating')) return 'mark-action-mirror'
      if (state.selectedMarks.includes('shadow-harvest')) return 'mark-action-shadow-harvest'
      if (state.selectedMarks.includes('ember-core')) return 'mark-action-core-place'
      return 'skill-q'
    case 'eCast':
      if (state.selectedMarks.includes('ember-sacrifice')) return 'mark-action-sacrifice'
      if (state.selectedMarks.includes('precision-afterimage')) return 'mark-action-afterimage'
      if (state.selectedMarks.includes('charged-retaliation')) return state.selectedMarks.includes('aftershock-shield') ? 'mark-action-aftershock' : 'mark-action-retaliation'
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
    case 'classCardSelected':
    case 'resonanceAvailable':
      return 'draft-offered'
    case 'resonanceResolved':
      return classCue('resonances', event.classId, event.resonance)
    case 'classEffectResolved':
      return classCue('effects', event.classId, event.cardId)
    case 'resonanceRejected':
      return resonanceRejectedCue(event.reason)
    case 'victory':
      return 'victory'
    case 'defeat':
      return 'defeat'
    case 'bossPhaseChanged':
      return `boss-phase-${event.phase}`
    case 'bossSummoned':
      return 'boss-summon-resolve'
    case 'waveTelegraphed':
      return 'wave-telegraph'
    case 'waveSpawned':
      return 'wave-spawn'
    case 'bossCleared':
      return 'encounter-cleared'
  }
}

function enemyCueId(enemy: GameState['enemies'][number], stage: 'telegraph' | 'attack'): string {
  if (enemy.kind === 'ashen-warlord') return `boss-${enemy.bossAttack ?? 'smash'}-${stage}`
  if (enemy.kind === 'bulwark-sentinel') return `enemy-${stage}-bulwark`
  if (enemy.kind === 'shade-skirmisher') return `enemy-${stage}-shade`
  return `enemy-${stage}-ember`
}

function enemyTransitionCues(previous: GameState, next: GameState): AudioCue[] {
  const previousById = new Map(previous.enemies.map((enemy) => [enemy.id, enemy]))
  const cues: AudioCue[] = []
  for (const enemy of next.enemies) {
    const before = previousById.get(enemy.id)
    if (before === undefined) continue
    if (before.attackState !== 'telegraph' && enemy.attackState === 'telegraph') {
      cues.push(cue(enemyCueId(enemy, 'telegraph')))
    } else if (before.attackState === 'telegraph' && enemy.attackState === 'cooldown') {
      cues.push(cue(enemyCueId(before, 'attack')))
    }
  }
  return cues
}

function musicLayers(state: GameState): MusicLayers {
  if (state.phase === 'victory' || state.phase === 'defeat') return { base: 0, combat: 0, threat: 0 }
  if (state.phase === 'draft') return { base: 0.22, combat: 0, threat: 0 }
  const threatCount = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.attackState === 'telegraph').length
  const combat = state.phase === 'boss' ? 0.9 : state.encounterIndex >= 4 ? 0.8 : state.encounterIndex >= 2 ? 0.68 : state.phase === 'encounter2' ? 0.58 : 0.48
  const boss = state.enemies.find((enemy) => enemy.kind === 'ashen-warlord')
  const bossPressure = boss?.bossPhase === 3 ? 0.34 : boss?.bossPhase === 2 ? 0.18 : 0
  const lowHealthPressure = state.player.hp <= 66 ? 0.18 : 0
  return { base: 0.35, combat, threat: Math.min(0.85, threatCount * 0.28 + lowHealthPressure + bossPressure) }
}

export function deriveAudioFrame(previous: GameState, next: GameState): AudioFrame {
  return {
    cues: [...enemyTransitionCues(previous, next), ...next.events.map((event) => cue(eventCue(event, next)))],
    music: musicLayers(next),
  }
}
