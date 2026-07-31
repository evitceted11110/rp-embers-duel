import { describe, expect, it } from 'vitest'
import type { GameState } from '../core/index.js'
import { createRun } from '../core/index.js'
import { deriveAudioFrame } from './audio-frame.js'

function state(overrides: Partial<GameState> = {}): GameState {
  return { ...createRun('audio-frame-test'), ...overrides }
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
      'mark-selected-ember',
      'victory',
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
