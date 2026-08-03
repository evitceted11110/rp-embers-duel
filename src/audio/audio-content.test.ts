import { describe, expect, it } from 'vitest'
import audioEvents from '../../content/audio-events.json'

describe('audio-events 內容契約', () => {
  it('cue id 唯一、首拍立即且峰值保守', () => {
    const ids = audioEvents.cues.map((cue) => cue.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(audioEvents.cues.every((cue) => cue.rhythm_ms[0] === 0)).toBe(true)
    expect(audioEvents.cues.every((cue) => cue.gain <= 0.3)).toBe(true)
  })

  it('反應 cue 延遲目標低於 50ms，匯流排定義完整', () => {
    expect(audioEvents.latency_target_ms).toBeLessThan(50)
    expect(audioEvents.buses).toEqual(['music', 'effects', 'ui'])
  })

  it('危險、操作、獎勵與終局 cue 齊全', () => {
    const ids = new Set(audioEvents.cues.map((cue) => cue.id))
    for (const id of [
      'enemy-telegraph-ember',
      'enemy-telegraph-shade',
      'enemy-attack-ember',
      'enemy-attack-shade',
      'enemy-telegraph-bulwark',
      'boss-smash-telegraph',
      'boss-charge-telegraph',
      'boss-summon-telegraph',
      'boss-phase-2',
      'boss-phase-3',
      'combo-hit-1',
      'dodge',
      'skill-q',
      'skill-e',
      'draft-offered',
      'victory',
      'defeat',
    ]) {
      expect(ids.has(id), `缺少 ${id}`).toBe(true)
    }
  })

  it('十二枚印記都有獨立選取 cue', () => {
    const ids = new Set(audioEvents.cues.map((cue) => cue.id))
    for (const mark of [
      'ember-core', 'cracking-flame-combo', 'twin-core-resonance', 'ember-sacrifice',
      'precision-afterimage', 'pursuit-strike', 'phantom-reset', 'shadow-harvest',
      'charged-retaliation', 'aftershock-shield', 'mirror-plating', 'bulwark-chain',
    ]) expect(ids.has(`mark-selected-${mark}`), `缺少 ${mark} 選取 cue`).toBe(true)
  })
})
