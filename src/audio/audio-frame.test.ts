import { describe, expect, it } from 'vitest'
import type { GameState } from '../core/index.js'
import { materializeOpeningWave } from '../core/test-utils.js'
import { deriveAudioFrame } from './audio-frame.js'

function state(overrides: Partial<GameState> = {}): GameState {
  return { ...materializeOpeningWave('audio-frame-test'), events: [], ...overrides }
}

describe('deriveAudioFrame', () => {
  it('敵人進入預兆當 tick 立即產生依種類可辨識的 cue', () => {
    const previous = state()
    const ember = previous.enemies[0]!
    const shade = { ...ember, id: 'shade-0', kind: 'shade-skirmisher' as const }
    const next = state({
      tick: 1,
      enemies: [
        { ...ember, attackState: 'telegraph', timerTicks: 50 },
        { ...shade, attackState: 'telegraph', timerTicks: 35 },
      ],
    })
    const cues = deriveAudioFrame(state({ enemies: [ember, shade] }), next).cues

    expect(cues.map((cue) => cue.id)).toEqual(['enemy-telegraph-ember', 'enemy-telegraph-shade'])
    expect(cues[0]!.waveform).not.toBe(cues[1]!.waveform)
    expect(cues[0]!.rhythmMs).not.toEqual(cues[1]!.rhythmMs)
  })

  it('攻擊、精準閃避、技能、選印記與勝敗映射成不同 cue', () => {
    const previous = state()
    const next = state({
      tick: 1,
      events: [
        { type: 'comboHit', hitIndex: 3, damage: 16, targetId: 'enemy' },
        { type: 'dodgeStart', precision: true, bent: false },
        { type: 'qCast' },
        { type: 'markSelected', markId: 'ember-core' },
        { type: 'victory' },
      ],
    })

    expect(deriveAudioFrame(previous, next).cues.map((cue) => cue.id)).toEqual([
      'combo-hit-3',
      'dodge-precision',
      'skill-q',
      'mark-selected-ember-core',
      'victory',
    ])
  })

  it('真實 comboHit 事件把輕擊與重擊映射成可辨識的不同音高、時長與節奏', () => {
    const previous = state()
    const light = deriveAudioFrame(previous, state({ events: [{ type: 'comboHit', hitIndex: 1, damage: 8, targetId: 'enemy' }] })).cues[0]!
    const heavy = deriveAudioFrame(previous, state({ events: [{ type: 'comboHit', hitIndex: 3, damage: 16, targetId: 'enemy' }] })).cues[0]!
    expect(light.id).toBe('combo-hit-1')
    expect(heavy.id).toBe('combo-hit-3')
    expect(heavy.durationMs).toBeGreaterThan(light.durationMs * 2)
    expect(heavy.rhythmMs.length).toBeGreaterThan(light.rhythmMs.length)
    expect(heavy.endFrequencyHz).not.toBe(light.endFrequencyHz)
    expect(heavy.gain).toBeLessThanOrEqual(0.3)
  })

  it('十二枚印記選取 cue 全部存在且彼此使用不同 id', () => {
    const marks = [
      'ember-core', 'cracking-flame-combo', 'twin-core-resonance', 'ember-sacrifice',
      'precision-afterimage', 'pursuit-strike', 'phantom-reset', 'shadow-harvest',
      'charged-retaliation', 'aftershock-shield', 'mirror-plating', 'bulwark-chain',
    ] as const
    const previous = state()
    const ids = marks.map((markId) => deriveAudioFrame(previous, state({ events: [{ type: 'markSelected', markId }] })).cues[0]!.id)
    expect(new Set(ids).size).toBe(12)
  })

  it('甲衛與 Boss 三攻勢的預兆音訊不共用焰奴或影刺客 cue', () => {
    const base = state()
    const source = base.enemies[0]!
    const enemies = [
      { ...source, id: 'bulwark', kind: 'bulwark-sentinel' as const, bossAttack: null },
      { ...source, id: 'smash', kind: 'ashen-warlord' as const, bossAttack: 'smash' as const },
      { ...source, id: 'charge', kind: 'ashen-warlord' as const, bossAttack: 'charge' as const },
      { ...source, id: 'summon', kind: 'ashen-warlord' as const, bossAttack: 'summon' as const },
    ]
    const next = enemies.map((enemy) => ({ ...enemy, attackState: 'telegraph' as const }))
    expect(deriveAudioFrame(state({ enemies }), state({ enemies: next })).cues.map((cue) => cue.id)).toEqual([
      'enemy-telegraph-bulwark', 'boss-smash-telegraph', 'boss-charge-telegraph', 'boss-summon-telegraph',
    ])
  })

  it('遭遇二與預兆同時提高戰鬥及威脅音樂層，draft 則退到底層', () => {
    const previous = state()
    const threateningEnemy = { ...previous.enemies[0]!, attackState: 'telegraph' as const }
    const combat = deriveAudioFrame(previous, state({ phase: 'encounter2', enemies: [threateningEnemy] })).music
    const draft = deriveAudioFrame(previous, state({ phase: 'draft' })).music

    expect(combat.combat).toBeGreaterThan(0.5)
    expect(combat.threat).toBeGreaterThan(0)
    expect(draft.combat).toBe(0)
    expect(draft.base).toBeGreaterThan(0)
  })
})
