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
})
