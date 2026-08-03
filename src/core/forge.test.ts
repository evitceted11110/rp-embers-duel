import { describe, expect, it } from 'vitest'
import { DEFAULT_FORGE, applyForgeCard, forgeChoices } from './forge.js'

describe('三槽鍛造', () => {
  it('每輪固定提供左鍵、Q、E 各一張合法卡', () => {
    expect(forgeChoices(DEFAULT_FORGE).map((card) => card.slot)).toEqual(['attack', 'q', 'e'])
  })
  it('替換只改自己的槽，擴充不會重複裝入', () => {
    const spun = applyForgeCard(DEFAULT_FORGE, 'spinning-ember')
    expect(spun.attack.core).toBe('spinning-ember')
    expect(spun.q).toEqual(DEFAULT_FORGE.q)
    const extended = applyForgeCard(spun, 'double-reversal')
    expect(applyForgeCard(extended, 'double-reversal')).toEqual(extended)
  })
})
