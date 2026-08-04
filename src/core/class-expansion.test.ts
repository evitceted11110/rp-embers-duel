import { describe, expect, it } from 'vitest'
import { CLASS_CARDS, classCard, createRun, neutralInput, tick } from './index.js'

describe('雙職業 runtime vertical slice', () => {
  it.each(['forgeguard', 'shadowline-hunter'] as const)('%s 固定 seed 先進 Draft 1，且三欄只供應本職業未取得卡', (classId) => {
    const first = createRun('class-runtime-seed', classId)
    const second = createRun('class-runtime-seed', classId)
    expect(first).toEqual(second)
    expect(first.forgeOptions).toHaveLength(3)
    expect(first.forgeOptions.map((id) => classCard(id)?.classId)).toEqual([classId, classId, classId])
    expect(first.forgeOptions.map((id) => classCard(id)?.slot)).toEqual(['primary', 'q', 'e'])
    const next = tick(first, { ...neutralInput(), forgeChoice: first.forgeOptions[0]! })
    expect(next.encounterIndex).toBe(0)
    expect(next.selectedClassCards).toHaveLength(1)
    expect(next.classId).toBe(classId)
  })

  it('每職十二張、每槽四張，且重開保留職業但清空構築', () => {
    for (const classId of ['forgeguard', 'shadowline-hunter'] as const) {
      expect(CLASS_CARDS.filter((card) => card.classId === classId)).toHaveLength(12)
      for (const slot of ['primary', 'q', 'e']) expect(CLASS_CARDS.filter((card) => card.classId === classId && card.slot === slot)).toHaveLength(4)
    }
    const state = createRun('restart-class', 'forgeguard')
    const picked = tick(state, { ...neutralInput(), forgeChoice: state.forgeOptions[0]! })
    const restarted = tick(picked, { ...neutralInput(), restart: true })
    expect(restarted.classId).toBe('forgeguard')
    expect(restarted.selectedClassCards).toEqual([])
  })
})
