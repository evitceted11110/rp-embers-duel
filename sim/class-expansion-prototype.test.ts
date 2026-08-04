import { describe, expect, it } from 'vitest'
import { createRng } from '@rogue-paradise/rng'
import { classCards, runClassExpansion, runClassExpansionPrototype, targetInvestments, validateClassExpansion } from './class-expansion-prototype.js'

describe('雙職業擴充 Gate 2 結構原型', () => {
  it('驗證雙職業各十二張、每槽四張具名非數值卡', () => {
    expect(validateClassExpansion()).toEqual([])
    for (const classId of ['forgeguard', 'shadowline-hunter'] as const) {
      expect(classCards.filter((card) => card.classId === classId)).toHaveLength(12)
      for (const slot of ['primary', 'q', 'e'] as const) expect(classCards.filter((card) => card.classId === classId && card.slot === slot)).toHaveLength(4)
    }
  })

  it('每種合法投資分配都能在六次 Draft 內完成，且不重複或跨職業', () => {
    for (const classId of ['forgeguard', 'shadowline-hunter'] as const) for (const target of targetInvestments) {
      const run = runClassExpansion(createRng(`target-${classId}-${JSON.stringify(target)}`), classId, target)
      expect(run.slotInvestments).toEqual(target)
      expect(new Set(run.selected).size).toBe(6)
      expect(run.selected.every((id) => classCards.find((card) => card.id === id)?.classId === classId)).toBe(true)
      expect(run.offers).toHaveLength(6)
      run.offers.forEach((row) => expect(row.map((offer) => offer.slot)).toEqual(['primary', 'q', 'e']))
    }
  })

  it('同 seed、同目標與同政策完全決定性重播', () => {
    const target = { primary: 3, q: 2, e: 1 }
    expect(runClassExpansion(createRng('class-determinism'), 'forgeguard', target)).toEqual(runClassExpansion(createRng('class-determinism'), 'forgeguard', target))
    expect(runClassExpansionPrototype(1_000, 'class-summary-determinism')).toEqual(runClassExpansionPrototype(1_000, 'class-summary-determinism'))
  })

  it('十萬次結構掃描中所有卡都有供給與選取機會，所有投資目標均 100% 完工', () => {
    const summary = runClassExpansionPrototype(10_000, 'class-reachability')
    expect(Object.values(summary.offerRate).every((value) => value > 0)).toBe(true)
    expect(Object.values(summary.selectionRate).every((value) => value > 0)).toBe(true)
    expect(Object.values(summary.targetCompletionRate).every((value) => value === 1)).toBe(true)
    expect(summary.selectionHealth.status).toBe('structurally-healthy')
    expect(Object.values(summary.resonanceReachRate).some((value) => value > 0)).toBe(true)
  })

  it('未核准戰鬥參數前，不把結構量測誤報為勝率或難度結論', () => {
    const summary = runClassExpansionPrototype(100, 'pending-parameters')
    expect(summary.relativeWinRate).toBeNull()
    expect(summary.difficultyCurve).toBeNull()
    expect(summary.pendingBalanceParameters.length).toBeGreaterThan(0)
  })
})
