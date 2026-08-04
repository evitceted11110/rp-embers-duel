import { describe, expect, it } from 'vitest'
import { CLASS_CARDS } from '../core/class-expansion.js'
import { RESONANCE_VISUAL_CUES, classVisualCues } from './class-visual-contract.js'

describe('雙職業全卡 renderer fixture', () => {
  const cues = classVisualCues()

  it('24 張已選卡都有非文字、位於戰場中央的唯一 visual cue', () => {
    expect(cues).toHaveLength(24)
    expect(cues.map((cue) => cue.cardId).sort()).toEqual(CLASS_CARDS.map((card) => card.id).sort())
    expect(cues.every((cue) => cue.object.length > 0 && cue.layer !== undefined && cue.palette !== undefined)).toBe(true)
    expect(cues.every((cue) => cue.dangerCue !== null)).toBe(true)
  })

  it('每職三槽均有路徑、目標與衝擊層，且全套保留地面物件，混戰不會退化成只有同色線條', () => {
    for (const classId of ['forgeguard', 'shadowline-hunter'] as const) {
      const classCues = cues.filter((cue) => cue.classId === classId)
      expect(classCues).toHaveLength(12)
      expect([...new Set(classCues.map((cue) => cue.layer))]).toEqual(expect.arrayContaining(['path', 'target', 'impact']))
      expect(new Set(classCues.map((cue) => cue.palette)).size).toBeGreaterThanOrEqual(3)
    }
    expect(cues.some((cue) => cue.layer === 'ground')).toBe(true)
  })

  it('全 24 張卡都以精確 card-ID 成功事件供 renderer／HUD／audio／replay 消費，不從通用 Q／命中或世界物件反推', () => {
    const eventCards = cues.filter((cue) => cue.successSignal === 'class-effect-event').map((cue) => cue.cardId).sort()
    const stateCards = cues.filter((cue) => cue.successSignal === 'world-state').map((cue) => cue.cardId).sort()
    expect(eventCards).toHaveLength(24)
    expect(stateCards).toHaveLength(0)
    expect([...eventCards, ...stateCards].sort()).toEqual(CLASS_CARDS.map((card) => card.id).sort())
  })

  it('八條共鳴都以留下物、按鍵作用、中央結果與幾何拒絕構成完整可讀鏈', () => {
    expect(RESONANCE_VISUAL_CUES).toHaveLength(8)
    expect(RESONANCE_VISUAL_CUES.filter((cue) => cue.classId === 'forgeguard')).toHaveLength(4)
    expect(RESONANCE_VISUAL_CUES.filter((cue) => cue.classId === 'shadowline-hunter')).toHaveLength(4)
    expect(RESONANCE_VISUAL_CUES.every((cue) => cue.prerequisiteObject.length > 0 && cue.actionObject.length > 0 && cue.resultObject.length > 0 && cue.rejectedByGeometry)).toBe(true)
  })
})
