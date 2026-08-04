import { describe, expect, it } from 'vitest'
import audioEvents from '../../content/audio-events.json'
import { CLASS_CARDS } from '../core/class-expansion.js'
import { RESONANCE_VISUAL_CUES } from '../render/class-visual-contract.js'

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

  it('24 張職業卡與 8 條共鳴在 JSON 有封閉且可解析的成功映射', () => {
    const ids = new Set(audioEvents.cues.map((cue) => cue.id))
    const effectMap = audioEvents.class_event_map.effects
    const resonanceMap = audioEvents.class_event_map.resonances
    expect(Object.keys(effectMap)).toHaveLength(24)
    expect(Object.keys(resonanceMap)).toHaveLength(8)
    for (const card of CLASS_CARDS) {
      const id = effectMap[`${card.classId}/${card.id}`]
      expect(id, `缺少 ${card.classId}/${card.id} 成功音訊`).toBeTypeOf('string')
      expect(ids.has(id!), `不存在 ${id}`).toBe(true)
    }
    for (const resonance of RESONANCE_VISUAL_CUES) {
      const id = resonanceMap[`${resonance.classId}/${resonance.resonance}`]
      expect(id, `缺少 ${resonance.resonance} 共鳴音訊`).toBeTypeOf('string')
      expect(ids.has(id!), `不存在 ${id}`).toBe(true)
    }
  })

  it('逐卡成功 cue 在同職業內至少以兩種聲音特徵彼此區分', () => {
    const byId = new Map(audioEvents.cues.map((cue) => [cue.id, cue]))
    for (const classId of ['forgeguard', 'shadowline-hunter'] as const) {
      const cues = CLASS_CARDS.filter((card) => card.classId === classId).map((card) => byId.get(audioEvents.class_event_map.effects[`${card.classId}/${card.id}`])!)
      for (let left = 0; left < cues.length; left += 1) for (let right = left + 1; right < cues.length; right += 1) {
        const a = cues[left]!
        const b = cues[right]!
        const differences = [a.waveform !== b.waveform, a.frequency_hz !== b.frequency_hz, a.end_frequency_hz !== b.end_frequency_hz, a.duration_ms !== b.duration_ms, a.rhythm_ms.join(',') !== b.rhythm_ms.join(',')].filter(Boolean).length
        expect(differences, `${a.id} 與 ${b.id} 不可只靠音高或音量區分`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('所有共鳴拒絕原因映射到三種可辨識的失敗語彙', () => {
    const ids = new Set(audioEvents.cues.map((cue) => cue.id))
    const rejectionMap = audioEvents.class_event_map.rejection_reasons
    expect(Object.keys(rejectionMap)).toHaveLength(19)
    const familyIds = new Set(Object.values(rejectionMap))
    expect(familyIds).toEqual(new Set(['resonance-rejected-prerequisite', 'resonance-rejected-geometry', 'resonance-rejected-timing']))
    for (const id of familyIds) expect(ids.has(id), `不存在 ${id}`).toBe(true)
  })
})
